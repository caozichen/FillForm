import { STORAGE_KEYS } from './types.js';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function toSnakeCase(input = '') {
  return String(input || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeContextPath(path = '') {
  return String(path || '').replace(/\[(\d+)\]/g, '.$1');
}

function getContextValue(context = {}, keyPath = '') {
  if (!keyPath) return undefined;
  if (Object.prototype.hasOwnProperty.call(context, keyPath)) return context[keyPath];
  const keys = normalizeContextPath(keyPath).split('.').filter(Boolean);
  let current = context;
  for (const key of keys) {
    if (current == null) return undefined;
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      current = current[key];
      continue;
    }
    return undefined;
  }
  return current;
}

function setDeepValue(target, path = [], value) {
  if (!target || typeof target !== 'object') return;
  if (!Array.isArray(path) || !path.length) return;
  let cursor = target;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (cursor == null || typeof cursor !== 'object') return;
    cursor = cursor[key];
  }
  if (cursor == null || typeof cursor !== 'object') return;
  cursor[path[path.length - 1]] = value;
}

function inferVariableKind(key = '', value = '') {
  const hint = `${key} ${typeof value === 'string' ? value : ''}`.toLowerCase();
  if (/phone|mobile|tel|电话|手機|手机/.test(hint)) return 'phone';
  if (/email|mail|郵箱|邮箱|電郵/.test(hint)) return 'email';
  if (/name|姓名|称呼|联系人|first_name|last_name/.test(hint)) return 'fullName';
  if (/company|corp|organization|organisation|机构|機構|企业|企業/.test(hint)) return 'companyName';
  if (/idcard|identity|证件|身份證|身份证/.test(hint)) return 'idcard';
  if (/verify|otp|captcha|验证码|驗證碼|code/.test(hint)) return 'verification';
  if (/date|time|日期|时间/.test(hint)) return 'date';
  if (/count|num|amount|total|预算|金額|金额|数量|人數|人数/.test(hint)) return 'number';
  return 'text';
}

function extractInlinePlaceholderName(value = '') {
  const match = String(value || '').match(/^\{\{\s*([a-zA-Z0-9_.\-[\]]+)\s*\}\}$/);
  return match ? String(match[1] || '').trim() : '';
}

function collectObjectVariableCandidates(input, options = {}) {
  const result = [];
  const walk = (value, path = []) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, index]));
      return;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, item]) => walk(item, [...path, key]));
      return;
    }
    if (value == null || value === '') return;
    const tail = String(path[path.length - 1] || options.prefix || 'field');
    const placeholderName = extractInlinePlaceholderName(value);
    result.push({
      location: options.location || 'body',
      path,
      rawKey: placeholderName || tail,
      sample: placeholderName ? '' : value,
      kind: inferVariableKind(placeholderName || tail, value),
      sourceHint: placeholderName ? 'context' : 'mock'
    });
  };
  walk(input, []);
  return result;
}

function buildVariableDefinitions({ url = '', headers = {}, body = '' } = {}) {
  const candidates = [];
  const urlTemplateObj = (() => {
    try {
      return new URL(String(url || ''));
    } catch {
      return null;
    }
  })();
  const bodyTemplate = deepClone(body);
  const headersTemplate = deepClone(headers || {});
  const nameCounter = new Map();

  if (urlTemplateObj) {
    for (const [key, value] of urlTemplateObj.searchParams.entries()) {
      if (!key || value == null || value === '') continue;
      const placeholderName = extractInlinePlaceholderName(value);
      candidates.push({
        location: 'query',
        path: [key],
        rawKey: placeholderName || key,
        sample: placeholderName ? '' : value,
        kind: inferVariableKind(placeholderName || key, value),
        sourceHint: placeholderName ? 'context' : 'mock'
      });
    }
  }

  Object.entries(headers || {}).forEach(([key, value]) => {
    if (value == null || value === '') return;
    const lower = String(key || '').toLowerCase();
    if (['content-type', 'accept'].includes(lower)) return;
    const placeholderName = extractInlinePlaceholderName(value);
    candidates.push({
      location: 'header',
      path: [key],
      rawKey: placeholderName || key,
      sample: placeholderName ? '' : value,
      kind: inferVariableKind(placeholderName || key, value),
      sourceHint: placeholderName ? 'context' : 'mock'
    });
  });

  const bodyCandidates = collectObjectVariableCandidates(body, { location: 'body', prefix: 'body' });
  candidates.push(...bodyCandidates);

  const variables = candidates.map((item, index) => {
    const explicitName = item.sourceHint === 'context' ? String(item.rawKey || '').trim() : '';
    const base = explicitName || toSnakeCase(item.rawKey || `var_${index + 1}`) || `var_${index + 1}`;
    const nextCount = Number(nameCounter.get(base) || 0) + 1;
    nameCounter.set(base, nextCount);
    const name = explicitName
      ? base
      : (nextCount > 1 ? `${base}_${nextCount}` : base);
    return {
      name,
      source: item.sourceHint === 'context' ? 'context' : 'mock',
      kind: item.kind || 'text',
      location: item.location,
      path: item.path,
      sample: item.sample
    };
  });

  const uniqueVariables = [];
  const seenVariableNames = new Set();
  for (const variable of variables) {
    if (!variable?.name || seenVariableNames.has(variable.name)) continue;
    seenVariableNames.add(variable.name);
    uniqueVariables.push(variable);
  }

  for (const variable of uniqueVariables) {
    const placeholder = `{{${variable.name}}}`;
    if (variable.location === 'query' && urlTemplateObj) {
      urlTemplateObj.searchParams.set(variable.path[0], placeholder);
      continue;
    }
    if (variable.location === 'header') {
      headersTemplate[variable.path[0]] = placeholder;
      continue;
    }
    if (variable.location === 'body') {
      setDeepValue(bodyTemplate, variable.path, placeholder);
    }
  }

  return {
    variables: uniqueVariables,
    urlTemplate: urlTemplateObj
      ? urlTemplateObj
        .toString()
        .replace(/%7B%7B/gi, '{{')
        .replace(/%7D%7D/gi, '}}')
      : String(url || ''),
    headersTemplate,
    bodyTemplate
  };
}

function pickEmail(settings = {}, runIndex = 0) {
  const enabled = settings.emailPoolEnabled !== false;
  const pool = enabled ? (settings.emailPoolList || []) : [];
  if (!pool.length) return '';
  return pool[runIndex % pool.length] || pool[0] || '';
}

function createVariableContext(settings = {}, params = {}, runIndex = 0) {
  const now = new Date();
  const patch = params.bodyPatch && typeof params.bodyPatch === 'object' ? params.bodyPatch : {};
  const runtimeVariables = params.variables && typeof params.variables === 'object' ? params.variables : {};
  const extraContext = params.extraContext && typeof params.extraContext === 'object' ? params.extraContext : {};
  return {
    email: params.email || patch.email || pickEmail(settings, runIndex),
    runIndex: runIndex + 1,
    timestamp: String(now.getTime()),
    date: now.toISOString().slice(0, 10),
    nowIso: now.toISOString(),
    ...extraContext,
    ...runtimeVariables
  };
}

function interpolateString(value, context) {
  return String(value).replace(/\{\{\s*([a-zA-Z0-9_.\-[\]]+)\s*\}\}/g, (_, key) => {
    const resolved = getContextValue(context, key);
    if (resolved !== undefined) {
      return resolved == null ? '' : String(resolved);
    }
    return '';
  });
}

function interpolateValue(value, context) {
  if (typeof value === 'string') return interpolateString(value, context);
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, context));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, current]) => [key, interpolateValue(current, context)])
    );
  }
  return value;
}

function mergeBody(baseBody, bodyPatch) {
  if (!bodyPatch || (typeof bodyPatch === 'object' && !Object.keys(bodyPatch).length)) return baseBody;
  if (Array.isArray(baseBody) || Array.isArray(bodyPatch)) return deepClone(bodyPatch);
  if (baseBody && typeof baseBody === 'object' && bodyPatch && typeof bodyPatch === 'object') {
    return {
      ...deepClone(baseBody),
      ...deepClone(bodyPatch)
    };
  }
  return deepClone(bodyPatch);
}

function sanitizeHeaders(headers = {}) {
  const blocked = new Set([
    'accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'cookie2',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'referer',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'via',
    'user-agent'
  ]);
  const sanitized = {};
  for (const [rawKey, rawValue] of Object.entries(headers || {})) {
    const key = String(rawKey || '').trim();
    const lower = key.toLowerCase();
    if (!key || blocked.has(lower) || lower.startsWith('sec-')) continue;
    sanitized[key] = rawValue;
  }
  return sanitized;
}

function serializeBody(body, headers) {
  if (body == null || body === '') return { body: undefined, headers };
  if (typeof body === 'string') return { body, headers };
  const nextHeaders = { ...headers };
  const hasJsonHeader = Object.keys(nextHeaders).some((key) => key.toLowerCase() === 'content-type');
  if (!hasJsonHeader) nextHeaders['Content-Type'] = 'application/json';
  return {
    body: JSON.stringify(body),
    headers: nextHeaders
  };
}

function getTemplateLabel(template = {}) {
  return template.name || template.endpoint || template.id || '(未命名模板)';
}

function normalizeMethod(method, body) {
  const resolved = String(method || '').trim().toUpperCase();
  if (resolved) return resolved;
  return body == null || body === '' ? 'GET' : 'POST';
}

function delay(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      cleanup();
      reject(new Error('执行已停止'));
    }
    function cleanup() {
      signal?.removeEventListener('abort', onAbort);
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function getTemplateStore() {
  const res = await chrome.storage.local.get(STORAGE_KEYS.TEMPLATES);
  return deepClone(res[STORAGE_KEYS.TEMPLATES] || { ui: [], api: [] });
}

export async function saveTemplate(kind, template) {
  const store = await getTemplateStore();
  const list = Array.isArray(store[kind]) ? store[kind] : [];
  const id = template.id || `tpl_${Date.now()}`;
  const next = { ...template, id, updatedAt: Date.now() };
  const idx = list.findIndex((x) => x.id === id);
  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  store[kind] = list;
  await chrome.storage.local.set({ [STORAGE_KEYS.TEMPLATES]: store });
  return next;
}

export async function removeTemplate(kind, id) {
  const store = await getTemplateStore();
  const list = Array.isArray(store[kind]) ? store[kind] : [];
  store[kind] = list.filter((x) => x.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.TEMPLATES]: store });
}

export function parseCurlCommand(curlText) {
  const normalized = String(curlText || '').trim();
  if (!normalized) throw new Error('请输入 curl 文本');

  const urlMatch = normalized.match(/curl\s+'([^']+)'|curl\s+"([^"]+)"/i);
  const url = (urlMatch && (urlMatch[1] || urlMatch[2])) || '';
  const methodMatch = normalized.match(/-X\s+(GET|POST|PUT|DELETE|PATCH)/i);
  const method = (methodMatch ? methodMatch[1] : '').toUpperCase() || (/-d|--data|--data-raw/i.test(normalized) ? 'POST' : 'GET');

  const headers = {};
  const headerRe = /-H\s+'([^:']+)\s*:\s*([^']*)'|-H\s+"([^:\"]+)\s*:\s*([^\"]*)"/gi;
  let m;
  while ((m = headerRe.exec(normalized))) {
    const k = (m[1] || m[3] || '').trim();
    const v = (m[2] || m[4] || '').trim();
    if (k) headers[k] = v;
  }

  const bodyMatch = normalized.match(/--data-raw\s+'([\s\S]*?)'|--data\s+'([\s\S]*?)'|--data-raw\s+"([\s\S]*?)"|--data\s+"([\s\S]*?)"/i);
  const bodyRaw = (bodyMatch && (bodyMatch[1] || bodyMatch[2] || bodyMatch[3] || bodyMatch[4])) || '';

  let body = bodyRaw;
  try {
    body = bodyRaw ? JSON.parse(bodyRaw) : '';
  } catch {
    body = bodyRaw;
  }

  const variablePack = buildVariableDefinitions({
    url,
    headers,
    body
  });

  return {
    url,
    method,
    headers,
    body,
    variables: variablePack.variables,
    urlTemplate: variablePack.urlTemplate,
    headersTemplate: variablePack.headersTemplate,
    bodyTemplate: variablePack.bodyTemplate
  };
}

export function buildApiExecutionRequest(template, options = {}) {
  if (!template || !template.url && !template.endpoint) {
    throw new Error('模板缺少可执行的接口地址');
  }
  const params = options.params || {};
  const runIndex = Number.isFinite(options.runIndex) ? Number(options.runIndex) : 0;
  const context = createVariableContext(options.settings || {}, params, runIndex);
  const baseBody = template.body == null ? '' : deepClone(template.body);
  const mergedBody = mergeBody(baseBody, params.bodyPatch);
  const interpolatedHeaders = interpolateValue(template.headers || {}, context);
  const interpolatedBody = interpolateValue(mergedBody, context);
  const method = normalizeMethod(template.method, interpolatedBody);
  const sanitizedHeaders = sanitizeHeaders(interpolatedHeaders);
  const url = interpolateString(template.url || template.endpoint || '', context);
  const request = serializeBody(interpolatedBody, sanitizedHeaders);

  return {
    url,
    method,
    headers: request.headers,
    body: request.body,
    rawBody: interpolatedBody,
    context,
    templateLabel: getTemplateLabel(template)
  };
}

export function templateToCurl(template) {
  if (!template) return '';
  const request = buildApiExecutionRequest(template, { settings: {}, params: {}, runIndex: 0 });
  const segments = [`curl '${request.url}'`];
  if (request.method && request.method !== 'GET') {
    segments.push(`-X ${request.method}`);
  }
  for (const [key, value] of Object.entries(request.headers || {})) {
    segments.push(`-H '${key}: ${String(value)}'`);
  }
  if (request.body !== undefined) {
    segments.push(`--data-raw '${typeof request.rawBody === 'string' ? request.rawBody : JSON.stringify(request.rawBody)}'`);
  }
  return segments.join(' \\\n  ');
}

export async function executeApiTemplate(template, options = {}) {
  const params = {
    loopCount: Math.max(1, Number(options.params?.loopCount || 1)),
    intervalMs: Math.max(0, Number(options.params?.intervalMs || 0)),
    retryCount: Math.max(0, Number(options.params?.retryCount || 0)),
    bodyPatch: options.params?.bodyPatch && typeof options.params.bodyPatch === 'object' ? options.params.bodyPatch : null
  };
  const onLog = typeof options.onLog === 'function' ? options.onLog : () => {};
  const signal = options.signal;
  const settings = options.settings || {};
  const summary = {
    templateId: template?.id || '',
    templateName: getTemplateLabel(template),
    successCount: 0,
    failureCount: 0,
    runs: []
  };

  onLog(`开始执行模板：${summary.templateName}`);
  onLog(`循环=${params.loopCount}，间隔=${params.intervalMs}ms，重试=${params.retryCount}`);

  for (let index = 0; index < params.loopCount; index += 1) {
    if (signal?.aborted) throw new Error('执行已停止');
    const request = buildApiExecutionRequest(template, { settings, params, runIndex: index });
    const runId = `${Date.now()}_${index + 1}`;
    const runRecord = {
      runId,
      index: index + 1,
      ok: false,
      attempts: [],
      request
    };

    onLog(`[第 ${index + 1}/${params.loopCount} 轮] run_id=${runId}`);

    let lastError = null;
    for (let attempt = 0; attempt <= params.retryCount; attempt += 1) {
      if (signal?.aborted) throw new Error('执行已停止');
      const attemptNo = attempt + 1;
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal
        });
        const responseText = await response.text();
        const parsed = safeJsonParse(responseText, responseText);
        const attemptRecord = {
          attempt: attemptNo,
          status: response.status,
          ok: response.ok,
          response: parsed
        };
        runRecord.attempts.push(attemptRecord);
        onLog(`  - 第${attemptNo}次请求 ${response.ok ? '成功' : '失败'} [${response.status}]`);
        onLog(`    请求体: ${typeof request.rawBody === 'string' ? request.rawBody : JSON.stringify(request.rawBody)}`);
        onLog(`    响应体: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
        if (response.ok) {
          runRecord.ok = true;
          runRecord.response = parsed;
          summary.successCount += 1;
          break;
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        const message = error?.message || String(error);
        runRecord.attempts.push({
          attempt: attemptNo,
          status: 0,
          ok: false,
          error: message
        });
        onLog(`  - 第${attemptNo}次请求失败：${message}`);
        lastError = error;
      }
    }

    if (!runRecord.ok) {
      runRecord.error = lastError?.message || '执行失败';
      summary.failureCount += 1;
      onLog(`  - 本轮失败：${runRecord.error}`);
    }

    summary.runs.push(runRecord);
    if (index < params.loopCount - 1 && params.intervalMs > 0) {
      await delay(params.intervalMs, signal);
    }
  }

  onLog(`执行完成：成功=${summary.successCount}，失败=${summary.failureCount}`);
  return summary;
}
