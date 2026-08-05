/**
 * LLM 适配器 — 兼容 OpenAI Chat Completions 规范（DeepSeek 完全兼容）
 *
 * 策略：
 * 1. 将所有字段批量打包为一个 prompt，单次 API 请求返回完整 JSON {fieldId: value}
 * 2. 超时 15 秒或 API 报错时抛出 Error，由调用方（background.js）捕获并降级到 heuristic
 * 3. 返回 JSON 缺失的字段由调用方用 heuristic 补全
 */

const LLM_TIMEOUT_MS = 15000;
const OPENAI_REASONING_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const ZHIPU_THINKING_TYPE_VALUES = ['disabled', 'enabled'];
const ZHIPU_REASONING_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function resolveChatCompletionsUrl(baseUrl = '', provider = '') {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) return '';
  if (/\/v1\/chat\/completions$/i.test(normalized) || /\/chat\/completions$/i.test(normalized)) {
    return normalized;
  }
  if (provider === 'zhipu') {
    if (/\/api\/paas\/v4$/i.test(normalized)) {
      return `${normalized}/chat/completions`;
    }
    if (/^https?:\/\/open\.bigmodel\.cn$/i.test(normalized)) {
      return `${normalized}/api/paas/v4/chat/completions`;
    }
    return `${normalized}/chat/completions`;
  }
  if (/\/v1$/i.test(normalized)) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function normalizeReasoningEffort(value = 'xhigh') {
  const normalized = String(value || '').trim().toLowerCase();
  return OPENAI_REASONING_EFFORT_VALUES.includes(normalized) ? normalized : 'xhigh';
}

function applyReasoningEffort(requestBody, reasoningEffort) {
  requestBody.reasoning_effort = normalizeReasoningEffort(reasoningEffort);
}

function normalizeZhipuThinkingType(value = 'disabled') {
  const normalized = String(value || '').trim().toLowerCase();
  return ZHIPU_THINKING_TYPE_VALUES.includes(normalized) ? normalized : 'disabled';
}

function normalizeZhipuReasoningEffort(value = 'none') {
  const normalized = String(value || '').trim().toLowerCase();
  return ZHIPU_REASONING_EFFORT_VALUES.includes(normalized) ? normalized : 'none';
}

function normalizeMaxTokens(value = 1024) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1024;
  return Math.max(64, Math.min(8192, Math.round(numeric)));
}

function hasProviderConnectionConfig(config = {}) {
  return !!String(config?.baseUrl || '').trim() && !!String(config?.apiKey || '').trim();
}

function resolveConnectionTestProvider(settings = {}) {
  const provider = settings.provider || 'heuristic';
  if (provider === 'openai' || provider === 'deepseek' || provider === 'zhipu') return provider;
  if (hasProviderConnectionConfig(settings.openai)) return 'openai';
  if (hasProviderConnectionConfig(settings.deepseek)) return 'deepseek';
  if (hasProviderConnectionConfig(settings.zhipu)) return 'zhipu';
  return 'openai';
}

function getProviderConfig(settings = {}, provider = '') {
  if (provider === 'openai') return settings.openai || {};
  if (provider === 'zhipu') return settings.zhipu || {};
  return settings.deepseek || {};
}

function getDefaultModel(provider = '') {
  if (provider === 'openai') return 'gpt-5.5';
  if (provider === 'zhipu') return 'glm-5.2';
  return 'deepseek-chat';
}
const LLM_BATCH_SIZE = 30; // 每批最多字段数，避免超过 Token 限制

/**
 * 构建发送给 LLM 的系统 prompt
 */
function buildSystemPrompt() {
  return `你是一个专业的表单测试数据生成器。
你会收到一个 JSON 数组，每个元素描述一个表单字段（id、kind、label、placeholder、context）。
请根据字段的语义，为每个字段生成一个合理的中文测试数据值。
必须只返回一个合法的 JSON 对象，格式为 { "fieldId": "生成的值", ... }，不要包含任何其他文字。

字段类型说明：
- text：普通文本
- fullName：中文全名（姓+名，如"王晓明"）
- firstName：名字（单字，如"晓明"）
- lastName：姓氏（单字，如"王"）
- companyName：企业名称（如"灵犀科技有限公司"）
- companyId：统一社会信用代码/营业执照/商业登记号
- bankCard：中国境内或香港银行卡号
- email：邮箱地址（如"test@example.com"）
- phone：手机号（11位，以1开头）
- tel：固定电话（如"021-12345678"）
- idcard：身份证号（18位）
- number：数字
- date：日期（格式 YYYY-MM-DD）
- jobTitle：职位（如"产品经理"）
- select：下拉选择（从 options 中选一个 label）
- radioGroup：单选（返回 true 表示选第一项）
- checkboxGroup：多选（返回 [0] 表示选第一项）
- addressDetail：详细地址文本
- addressComponent：地址组件（JSON 对象，含 province/city/district/detail）
- verification：验证码（6位数字）
- file：文件（返回空字符串，由填充引擎跳过）`;
}

/**
 * 构建字段描述列表，只发必要字段减少 Token 消耗
 */
function buildFieldDescriptions(fields = []) {
  return fields.map((field) => ({
    id: field.id,
    kind: field.kind || 'text',
    label: field.label || '',
    placeholder: field.placeholder || '',
    context: (field.context || '').slice(0, 60),
    options: Array.isArray(field.options)
      ? field.options.slice(0, 6).map((opt) => opt.label || opt.value || '').filter(Boolean)
      : []
  }));
}

/**
 * 单批次调用 LLM API
 * @private
 */
async function callLLMOnce(fieldBatch, { provider, baseUrl, apiKey, model, temperature, reasoningEffort, thinkingType, maxTokens }) {
  const fieldDescriptions = buildFieldDescriptions(fieldBatch);
  const userPrompt = `请为以下表单字段生成测试数据：\n${JSON.stringify(fieldDescriptions, null, 2)}`;

  const requestBody = {
    model,
    temperature,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userPrompt }
    ],
    response_format: { type: 'json_object' }
  };
  if (provider === 'openai' && reasoningEffort) {
    applyReasoningEffort(requestBody, reasoningEffort);
  }
  if (provider === 'zhipu') {
    requestBody.stream = false;
    requestBody.max_tokens = normalizeMaxTokens(maxTokens);
    requestBody.thinking = { type: normalizeZhipuThinkingType(thinkingType) };
    const zhipuReasoningEffort = normalizeZhipuReasoningEffort(reasoningEffort);
    if (zhipuReasoningEffort !== 'none') {
      requestBody.reasoning_effort = zhipuReasoningEffort;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(resolveChatCompletionsUrl(baseUrl, provider), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (fetchErr.name === 'AbortError') {
      throw new Error(`LLM 请求超时（${LLM_TIMEOUT_MS}ms）`);
    }
    throw new Error(`LLM 网络错误：${fetchErr.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`LLM API 返回错误 ${response.status}：${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';

  let parsed;
  try {
    parsed = typeof content === 'object' ? content : JSON.parse(content);
  } catch {
    throw new Error(`LLM 返回非法 JSON：${content.slice(0, 200)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('LLM 返回格式不符合预期');
  }

  return parsed;
}

/**
 * 调用 LLM API，字段数 >LLM_BATCH_SIZE 时自动分批，合并结果。
 * @param {Array} fields - 字段列表
 * @param {Object} settings - 包含 provider / deepseek / openai / temperature
 * @returns {Object} {fieldId: value, ...}
 * @throws {Error} 超时或 API 报错时抛出
 */
export async function generateValuesWithLLM(fields = [], settings = {}) {
  if (!fields.length) return {};

  const provider = settings.provider || 'heuristic';
  const providerConfig = getProviderConfig(settings, provider);
  const baseUrl = String(providerConfig?.baseUrl || '').replace(/\/$/, '');
  const apiKey = String(providerConfig?.apiKey || '');
  const model = String(providerConfig?.model || getDefaultModel(provider));
  const temperature = Number(settings.temperature ?? 0.2);
  const reasoningEffort = provider === 'openai'
    ? normalizeReasoningEffort(providerConfig?.reasoningEffort)
    : provider === 'zhipu'
      ? normalizeZhipuReasoningEffort(providerConfig?.reasoningEffort)
      : '';
  const thinkingType = provider === 'zhipu' ? normalizeZhipuThinkingType(providerConfig?.thinkingType) : '';
  const maxTokens = provider === 'zhipu' ? normalizeMaxTokens(providerConfig?.maxTokens) : 0;

  if (!baseUrl || !apiKey) {
    throw new Error(`LLM 配置缺失：provider=${provider}，请在设置页配置 API Key 和 Base URL`);
  }

  const callArgs = { provider, baseUrl, apiKey, model, temperature, reasoningEffort, thinkingType, maxTokens };

  // 字段数在 batch 限制内直接单次调用
  if (fields.length <= LLM_BATCH_SIZE) {
    return callLLMOnce(fields, callArgs);
  }

  // 超出限制时分批串行调用，合并结果（串行避免同时触发限流）
  const merged = {};
  for (let i = 0; i < fields.length; i += LLM_BATCH_SIZE) {
    const batch = fields.slice(i, i + LLM_BATCH_SIZE);
    const batchResult = await callLLMOnce(batch, callArgs);
    Object.assign(merged, batchResult);
  }
  return merged;
}

/**
 * 测试 LLM 连接是否正常
 * @returns {{ ok: boolean, model: string, latencyMs: number, error?: string }}
 */
export async function testLLMConnection(settings = {}) {
  const startedAt = Date.now();
  try {
    const provider = resolveConnectionTestProvider(settings);
    const providerConfig = getProviderConfig(settings, provider);
    const baseUrl = String(providerConfig?.baseUrl || '').replace(/\/$/, '');
    const apiKey = String(providerConfig?.apiKey || '');
    const model = String(providerConfig?.model || getDefaultModel(provider));
    const reasoningEffort = provider === 'openai'
      ? normalizeReasoningEffort(providerConfig?.reasoningEffort)
      : provider === 'zhipu'
        ? normalizeZhipuReasoningEffort(providerConfig?.reasoningEffort)
        : '';

    if (!baseUrl || !apiKey) {
      return { ok: false, model, latencyMs: 0, error: '未配置 API Key 或 Base URL' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const requestBody = {
      model,
      messages: [{ role: 'user', content: '返回 {"ok":true}' }],
      temperature: 0
    };
    if (provider === 'openai') {
      requestBody.max_completion_tokens = 16;
      applyReasoningEffort(requestBody, reasoningEffort);
    } else if (provider === 'zhipu') {
      requestBody.stream = false;
      requestBody.max_tokens = 16;
      requestBody.thinking = { type: normalizeZhipuThinkingType(providerConfig?.thinkingType) };
      if (reasoningEffort !== 'none') {
        requestBody.reasoning_effort = reasoningEffort;
      }
    } else {
      requestBody.max_tokens = 16;
    }

    const response = await fetch(resolveChatCompletionsUrl(baseUrl, provider), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      return { ok: false, model, latencyMs: Date.now() - startedAt, error: `HTTP ${response.status}` };
    }
    return { ok: true, model, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      model: '',
      latencyMs: Date.now() - startedAt,
      error: err.name === 'AbortError' ? '连接超时' : err.message
    };
  }
}
