import {
  DEFAULT_SETTINGS,
  FIELD_MAPPING_MESSAGES,
  FIELD_MAPPING_SCHEMA_VERSION,
  STORAGE_KEYS,
  migrateDefaultEmailPool,
  migrateTestDataLibraryDefaults
} from './core/types.js';
import { detectEngineNormalize, prepareFieldsForFill } from './core/detectEngine.js';
import { generateValues } from '../public/core/dataEngine.js';
import {
  executeApiTemplate,
  getTemplateStore,
  parseCurlCommand,
  removeTemplate,
  saveTemplate
} from './core/templateEngine.js';
import { generateValuesWithLLM, testLLMConnection } from './core/llmAdapter.js';
import { transformHashids } from './core/hashidsEngine.js';
import jsQR from 'jsqr';
import { decodeBarcodeInOffscreen } from './barcodeOffscreenClient.js';

function log(...args) {
  console.log('[FillForm]', ...args);
}

function normText(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONTENT_RUNTIME_FILES = ['content/scan.js', 'content/fill.js'];
const CONTENT_RUNTIME_BUILD = '2026-08-25-time-select-01';
const contentRuntimeCache = new Map();
const fillCancelState = new Map();
const PENDING_MOCK_RULE_SEED_KEY = 'formPilotV2PendingMockRuleSeed';
const HASHIDS_TRANSFORM_MESSAGE = 'formpilotv2:hashids-transform';
const MANUAL_FIELD_LIBRARY_MESSAGES = {
  LIST: 'formpilotv2:list-manual-fields',
  LIST_SELF: 'formpilotv2:list-manual-fields-self',
  SAVE_SELF: 'formpilotv2:save-manual-field-self',
  REMOVE: 'formpilotv2:remove-manual-field'
};

function getFillRunId(input = {}) {
  if (typeof input === 'string') return normText(input);
  return normText(input?.runId || input?.fillRunId || input?.__fillRunId || '');
}

function getEnabledHashidsProject(settings = {}, projectId = '') {
  const config = settings?.decryptConfig || {};
  const id = normText(projectId);
  const enabledIds = new Set(
    (Array.isArray(config.selectedProjectIds) ? config.selectedProjectIds : [])
      .map((item) => normText(item))
      .filter(Boolean)
  );
  if (!id || !enabledIds.has(id)) {
    throw new Error('请选择已启用的加解密项目');
  }

  const project = (Array.isArray(config.projects) ? config.projects : [])
    .find((item) => normText(item?.id) === id);
  if (!project) throw new Error('找不到所选加解密项目');

  return {
    id,
    name: normText(project.name) || '未命名项目',
    salt: String(project.salt ?? '').trim(),
    minLength: project.minLength
  };
}

function getFillCancelKey(tabId, runId = '') {
  return `${Number(tabId) || 0}:${getFillRunId(runId)}`;
}

function markFillCancelled(tabId, runId = '') {
  const normalizedRunId = getFillRunId(runId);
  if (!tabId || !normalizedRunId) return false;
  fillCancelState.set(getFillCancelKey(tabId, normalizedRunId), true);
  return true;
}

function isFillCancelled(tabId, runId = '') {
  const normalizedRunId = getFillRunId(runId);
  if (!tabId || !normalizedRunId) return false;
  return fillCancelState.get(getFillCancelKey(tabId, normalizedRunId)) === true;
}

function createFillCancelledError(tabId, runId = '') {
  const error = new Error('本次填充已停止');
  error.cancelled = true;
  error.tabId = Number(tabId) || 0;
  error.runId = getFillRunId(runId);
  return error;
}

function assertFillNotCancelled(tabId, runId = '') {
  if (isFillCancelled(tabId, runId)) {
    throw createFillCancelledError(tabId, runId);
  }
}

function buildFillCancelledResponse(runId = '', extra = {}) {
  return {
    ok: false,
    cancelled: true,
    runId: getFillRunId(runId),
    error: '本次填充已停止',
    ...extra
  };
}

async function notifyTabFillCancelled(tabId, runId = '') {
  const normalizedRunId = getFillRunId(runId);
  if (!tabId || !normalizedRunId) return;
  await sendMessageToTab(tabId, {
    type: 'formpilotv2:cancel-fill',
    runId: normalizedRunId
  }).catch(() => null);
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function classifyApiTemplate(template = {}) {
  const stepCount = Array.isArray(template?.steps) ? template.steps.length : 0;
  if (String(template?.templateCategory || template?.kind || '').toLowerCase() === 'flow') return 'flow';
  if (stepCount > 0) return 'flow';
  return 'interface';
}

function normalizeApiProject(value = '') {
  const normalized = normText(value);
  if (!normalized || normalized === '__all__') return '默认项目';
  return normalized;
}

function normalizeApiEnvironment(value = '') {
  const normalized = normText(value || '').toLowerCase();
  if (!normalized || normalized === '__all__') return 'test';
  if (['dev', 'test', 'staging', 'prod'].includes(normalized)) return normalized;
  return 'test';
}

function summarizeApiTemplate(template = {}) {
  const stepCount = Array.isArray(template?.steps) ? template.steps.length : 0;
  const body = template?.body;
  const bodyFieldCount =
    body && typeof body === 'object' && !Array.isArray(body)
      ? Object.keys(body).length
      : body
        ? 1
        : 0;
  return {
    id: template.id || template.name || '',
    name: template.name || template.endpoint || template.url || '未命名',
    method: template.method || 'GET',
    endpoint: template.endpoint || template.url || '',
    project: normalizeApiProject(template.project),
    environment: normalizeApiEnvironment(template.environment),
    updatedAt: Number(template.updatedAt || 0) || 0,
    stepCount,
    bodyFieldCount,
    kind: classifyApiTemplate(template),
    templateCategory: template.templateCategory || classifyApiTemplate(template)
  };
}

function hydrateApiTemplate(template = {}) {
  const summary = summarizeApiTemplate(template);
  return {
    ...cloneValue(template),
    ...summary
  };
}

function sleep(ms = 0) {
  const timeout = Math.max(0, Number(ms || 0));
  if (!timeout) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

function inferFieldKindFromVariable(variable = {}) {
  const kind = normText(variable.kind || '');
  if (kind) return kind;
  const name = String(variable.name || '').toLowerCase();
  if (/phone|mobile|tel/.test(name)) return 'phone';
  if (/email|mail/.test(name)) return 'email';
  if (/name/.test(name)) return 'fullName';
  if (/company/.test(name)) return 'companyName';
  if (/idcard|identity/.test(name)) return 'idcard';
  if (/verify|otp|captcha|code/.test(name)) return 'verification';
  if (/date|time/.test(name)) return 'date';
  if (/count|num|amount|total/.test(name)) return 'number';
  return 'text';
}

function normalizeVariableSource(value = '', fallback = 'mock') {
  const normalized = normText(value || '').toLowerCase();
  if (normalized === 'context') return 'context';
  if (normalized === 'llm') return 'llm';
  if (normalized === 'mock') return 'mock';
  if (fallback === 'context') return 'context';
  return fallback === 'llm' ? 'llm' : 'mock';
}

function buildTemplateVariableFields(template = {}) {
  const rawVariables = Array.isArray(template.variables) ? template.variables : [];
  return rawVariables
    .map((variable, index) => {
      const name = normText(variable.name || `var_${index + 1}`);
      if (!name) return null;
      return {
        id: name,
        kind: inferFieldKindFromVariable(variable),
        label: name,
        placeholder: String(variable.sample || ''),
        context: `${template.name || ''} ${variable.location || ''} ${(variable.path || []).join('.')}`,
        selector: (variable.path || []).join('.'),
        source: normalizeVariableSource(variable.source || template.variableSource || 'mock')
      };
    })
    .filter(Boolean);
}

function mergeResponseContext(container = {}, payload = {}) {
  if (!payload || typeof payload !== 'object') return container;
  const assignPrimitive = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 2) return;
    for (const [key, value] of Object.entries(obj)) {
      if (value == null) continue;
      if (typeof value === 'object') {
        assignPrimitive(value, depth + 1);
        continue;
      }
      const normalizedKey = normText(key);
      if (!normalizedKey) continue;
      if (!Object.prototype.hasOwnProperty.call(container, normalizedKey)) {
        container[normalizedKey] = value;
      }
    }
  };
  assignPrimitive(payload);
  return container;
}

function normalizeStepId(value = '', fallback = '') {
  const normalized = normText(value);
  if (normalized) return normalized.replace(/[^\w-]+/g, '_').slice(0, 64);
  const fallbackText = normText(fallback);
  if (!fallbackText) return '';
  return fallbackText.replace(/[^\w-]+/g, '_').slice(0, 64);
}

function collectTemplatePlaceholders(value, result = new Set()) {
  if (value == null) return result;
  if (typeof value === 'string') {
    const regex = /\{\{\s*([a-zA-Z0-9_.\-[\]]+)\s*\}\}/g;
    let match;
    while ((match = regex.exec(value))) {
      const key = normText(match[1]);
      if (key) result.add(key);
    }
    return result;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTemplatePlaceholders(item, result);
    return result;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectTemplatePlaceholders(item, result);
  }
  return result;
}

function normalizePathSegments(path = '') {
  return String(path || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((item) => normText(item))
    .filter(Boolean);
}

function getValueByPath(target, path = '') {
  const segments = normalizePathSegments(path);
  if (!segments.length) return undefined;
  let cursor = target;
  for (const segment of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

function extractStepContextValues(step = {}, response = {}, stepIndex = 0, onLog = () => {}) {
  const extracted = {};
  const extractors = Array.isArray(step.extractors) ? step.extractors : [];
  for (const extractor of extractors) {
    const name = normText(extractor?.name || extractor?.key || '');
    const path = normText(extractor?.path || extractor?.jsonPath || '');
    if (!name || !path) continue;
    const value = getValueByPath(response, path);
    if (value == null || value === '') {
      onLog(`    - 变量提取未命中：${name} <= ${path}`);
      continue;
    }
    extracted[name] = value;
    onLog(`    - 已提取变量：${name} <= ${path}`);
  }
  if (!Object.keys(extracted).length) return extracted;
  extracted[`step${stepIndex + 1}Extracted`] = true;
  return extracted;
}

function resolveStepDependencies(step = {}, stepIds = [], stepIndex = 0) {
  const allStepIds = new Set(stepIds.filter(Boolean));
  const currentStepId = normalizeStepId(step.stepId || step.id || '', `step_${stepIndex + 1}`);
  const explicitDeps = Array.isArray(step.dependsOn)
    ? step.dependsOn
      .map((item) => normalizeStepId(item))
      .filter((item) => item && item !== currentStepId && allStepIds.has(item))
    : [];
  if (explicitDeps.length) return Array.from(new Set(explicitDeps));
  if (stepIndex > 0 && stepIds[stepIndex - 1]) return [stepIds[stepIndex - 1]];
  return [];
}

function resolveStepRuntimeTemplate(rawStep = {}, interfaceMap = {}) {
  const endpoint = normText(rawStep.endpoint || rawStep.url || '');
  if (endpoint) return { ...rawStep, endpoint, method: rawStep.method || 'GET' };
  const endpointId = normText(rawStep.endpointId || rawStep.sourceTemplateId || '');
  if (!endpointId) return { ...rawStep, endpoint: '', method: rawStep.method || 'GET' };
  const base = interfaceMap?.[endpointId];
  if (!base) return { ...rawStep, endpoint: '', method: rawStep.method || 'GET' };
  return {
    ...cloneValue(base),
    ...rawStep,
    endpoint: normText(rawStep.endpoint || rawStep.url || base.endpoint || base.url || ''),
    method: rawStep.method || base.method || 'GET'
  };
}

async function resolveTemplateVariables(template = {}, settings = {}, runIndex = 0, responseContext = {}, onLog = () => {}) {
  const fields = buildTemplateVariableFields(template);
  if (!fields.length) return {};
  const mockFields = fields.filter((field) => field.source === 'mock');
  const llmFields = fields.filter((field) => field.source === 'llm');
  const contextFields = fields.filter((field) => field.source === 'context');
  const resolved = {};

  if (mockFields.length) {
    const mockValues = generateValues(mockFields, settings);
    for (const field of mockFields) {
      resolved[field.id] = mockValues[field.id];
    }
  }

  if (llmFields.length) {
    try {
      const llmSettings = {
        ...settings,
        provider: settings.provider && settings.provider !== 'heuristic' ? settings.provider : 'deepseek'
      };
      const llmValues = await generateValuesWithLLM(llmFields, llmSettings);
      for (const field of llmFields) {
        if (llmValues[field.id] != null && String(llmValues[field.id]).trim() !== '') {
          resolved[field.id] = llmValues[field.id];
        }
      }
    } catch (error) {
      onLog(`变量 LLM 生成失败，已回退 Mock：${error?.message || error}`);
      const fallbackValues = generateValues(llmFields, settings);
      for (const field of llmFields) {
        resolved[field.id] = fallbackValues[field.id];
      }
    }
  }

  const merged = { ...resolved };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(responseContext, field.id)) {
      merged[field.id] = responseContext[field.id];
      continue;
    }
    if (field.source === 'context') {
      const deepValue = getValueByPath(responseContext, field.id);
      if (deepValue != null && deepValue !== '') {
        merged[field.id] = deepValue;
      }
      continue;
    }
    if (merged[field.id] != null && String(merged[field.id]) !== '') continue;
    if (field.placeholder) merged[field.id] = field.placeholder;
  }

  onLog(`  - 变量解析完成：${Object.keys(merged).length} 个（第 ${runIndex + 1} 轮，context=${contextFields.length}）`);
  return merged;
}

async function executeApiFlowTemplate(template = {}, options = {}) {
  const settings = options.settings || {};
  const onLog = typeof options.onLog === 'function' ? options.onLog : () => {};
  const interfaceMap = options.interfaceMap && typeof options.interfaceMap === 'object'
    ? options.interfaceMap
    : {};
  const params = {
    loopCount: Math.max(1, Number(options.params?.loopCount || template.loopCount || 1)),
    intervalMs: Math.max(0, Number(options.params?.intervalMs || template.intervalMs || 0)),
    retryCount: Math.max(0, Number(options.params?.retryCount || template.retryCount || 0)),
    bodyPatch: options.params?.bodyPatch || null
  };
  const steps = Array.isArray(template.steps) ? template.steps : [];
  if (!steps.length) {
    throw new Error('流程模板没有可执行步骤');
  }

  const summary = {
    templateId: template.id || template.name || '',
    templateName: template.name || template.id || '流程模板',
    successCount: 0,
    failureCount: 0,
    runs: []
  };

  onLog(`开始执行流程模板：${summary.templateName}`);
  onLog(`循环=${params.loopCount}，步骤=${steps.length}，步级重试=${params.retryCount}，循环间隔=${params.intervalMs}ms`);

  const normalizedStepIds = steps.map((step, index) => normalizeStepId(step?.stepId || step?.id || '', `step_${index + 1}`));

  for (let runIndex = 0; runIndex < params.loopCount; runIndex += 1) {
    onLog(`[第 ${runIndex + 1}/${params.loopCount} 轮]`);
    const runRecord = {
      index: runIndex + 1,
      ok: true,
      steps: [],
      contextKeys: []
    };
    const responseContext = {};
    const stepStatus = new Map();
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
      const rawStep = steps[stepIndex] || {};
      const stepTemplate = resolveStepRuntimeTemplate(rawStep, interfaceMap);
      const stepName = stepTemplate.name || rawStep.name || rawStep.endpoint || rawStep.url || `步骤 ${stepIndex + 1}`;
      const stepId = normalizedStepIds[stepIndex];
      const endpoint = normText(stepTemplate.endpoint || stepTemplate.url || '');
      const dependsOn = resolveStepDependencies(stepTemplate, normalizedStepIds, stepIndex);
      const failedDependencies = dependsOn.filter((depId) => stepStatus.get(depId) === false);
      if (failedDependencies.length) {
        runRecord.ok = false;
        summary.failureCount += 1;
        const errorText = `步骤依赖失败：${stepName} <- ${failedDependencies.join(', ')}`;
        stepStatus.set(stepId, false);
        runRecord.steps.push({
          index: stepIndex + 1,
          stepId,
          name: stepName,
          ok: false,
          error: errorText,
          dependsOn
        });
        onLog(`  - ${errorText}`);
        continue;
      }
      if (!endpoint) {
        runRecord.ok = false;
        summary.failureCount += 1;
        const errorText = `步骤缺少可执行地址：${stepName}`;
        stepStatus.set(stepId, false);
        runRecord.steps.push({
          index: stepIndex + 1,
          stepId,
          name: stepName,
          ok: false,
          error: errorText,
          dependsOn
        });
        onLog(`  - ${errorText}`);
        continue;
      }
      onLog(`  - 执行步骤 ${stepIndex + 1}/${steps.length}：${stepName}${dependsOn.length ? `（依赖 ${dependsOn.join(', ')}）` : ''}`);

      const requiredVariables = Array.from(
        collectTemplatePlaceholders(stepTemplate.endpoint || '')
      );
      collectTemplatePlaceholders(stepTemplate.headers || {}, new Set(requiredVariables))
        .forEach((name) => requiredVariables.push(name));
      collectTemplatePlaceholders(stepTemplate.body || {}, new Set(requiredVariables))
        .forEach((name) => requiredVariables.push(name));
      const uniqRequired = Array.from(new Set(requiredVariables.filter(Boolean)));

      const runtimeVariables = await resolveTemplateVariables(stepTemplate, settings, runIndex, responseContext, onLog);
      const missingVariables = uniqRequired.filter((name) => {
        const value = Object.prototype.hasOwnProperty.call(runtimeVariables, name)
          ? runtimeVariables[name]
          : getValueByPath(responseContext, name);
        return value == null || value === '';
      });
      if (missingVariables.length) {
        runRecord.ok = false;
        summary.failureCount += 1;
        const errorText = `变量缺失：${stepName} -> ${missingVariables.join(', ')}`;
        stepStatus.set(stepId, false);
        runRecord.steps.push({
          index: stepIndex + 1,
          stepId,
          name: stepName,
          ok: false,
          error: errorText,
          dependsOn,
          requiredVariables: uniqRequired
        });
        onLog(`  - ${errorText}`);
        continue;
      }

      const stepSummary = await executeApiTemplate(stepTemplate, {
        settings,
        params: {
          loopCount: 1,
          intervalMs: 0,
          retryCount: params.retryCount,
          bodyPatch: params.bodyPatch,
          variables: runtimeVariables,
          extraContext: responseContext
        },
        onLog: (line) => onLog(`    ${line}`)
      });
      const stepOk = Number(stepSummary.failureCount || 0) === 0;
      if (stepOk) summary.successCount += 1;
      else {
        summary.failureCount += 1;
        runRecord.ok = false;
      }
      stepStatus.set(stepId, stepOk);
      runRecord.steps.push({
        index: stepIndex + 1,
        stepId,
        name: stepName,
        ok: stepOk,
        dependsOn,
        requiredVariables: uniqRequired,
        summary: stepSummary
      });
      const firstRun = Array.isArray(stepSummary.runs) ? stepSummary.runs[0] : null;
      if (stepOk && firstRun?.response && typeof firstRun.response === 'object') {
        responseContext.last = firstRun.response;
        responseContext[`step${stepIndex + 1}`] = firstRun.response;
        responseContext[stepId] = firstRun.response;
        const nameKey = normalizeStepId(stepName);
        if (nameKey) responseContext[nameKey] = firstRun.response;
        mergeResponseContext(responseContext, firstRun.response);
        const extracted = extractStepContextValues(stepTemplate, firstRun.response, stepIndex, onLog);
        Object.assign(responseContext, extracted);
      }
    }
    runRecord.contextKeys = Object.keys(responseContext).slice(0, 80);
    summary.runs.push(runRecord);
    if (runIndex < params.loopCount - 1 && params.intervalMs > 0) {
      await sleep(params.intervalMs);
    }
  }
  onLog(`流程执行完成：成功步骤=${summary.successCount}，失败步骤=${summary.failureCount}`);
  return summary;
}

async function rememberLastWebTab(tabId, urlHint = '') {
  try {
    let url = String(urlHint || '');
    if (!url && tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        url = tab?.url || '';
      } catch {
        url = '';
      }
    }
    if (!/^https?:/i.test(url)) return;
    await chrome.storage.local.set({ formPilotV2LastWebTabId: tabId });
  } catch {
    // ignore
  }
}

async function getInjectableTab(tabId) {
  if (!tabId) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!/^https?:/i.test(String(tab?.url || ''))) return null;
    return tab || null;
  } catch {
    return null;
  }
}

async function resolveWebTab(preferredTabId = 0) {
  const preferred = await getInjectableTab(preferredTabId);
  if (preferred) return preferred;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (/^https?:/i.test(String(activeTab?.url || ''))) {
      return activeTab || null;
    }
  } catch {
    // ignore
  }

  try {
    const { formPilotV2LastWebTabId = null } = await chrome.storage.local.get({ formPilotV2LastWebTabId: null });
    const remembered = await getInjectableTab(formPilotV2LastWebTabId);
    if (remembered) return remembered;
  } catch {
    // ignore
  }

  try {
    const wins = await chrome.windows.getAll({ populate: true });
    const normalWins = (wins || []).filter((item) => item.type === 'normal');
    const ordered = [
      ...normalWins.filter((item) => item.focused),
      ...normalWins.filter((item) => !item.focused)
    ];
    for (const win of ordered) {
      const tabs = Array.isArray(win.tabs) ? win.tabs : [];
      const candidates = tabs.filter((item) => /^https?:/i.test(String(item?.url || '')));
      candidates.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
      if (candidates[0]) return candidates[0];
    }
  } catch {
    // ignore
  }

  return null;
}

function clearRuntimeCacheForTab(tabId) {
  if (!tabId) return;
  contentRuntimeCache.delete(tabId);
}

function buildPathKey(rawUrl = '') {
  try {
    const url = new URL(String(rawUrl || ''));
    if (!/^https?:/.test(url.protocol)) return '';
    return `${url.host}${url.pathname}`;
  } catch {
    return '';
  }
}

function parsePathKey(pathKey = '') {
  const normalized = normText(pathKey);
  if (!normalized) return { pathKey: '', host: '', pathname: '/' };
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      return {
        pathKey: `${url.host}${url.pathname}`,
        host: url.host || '',
        pathname: url.pathname || '/'
      };
    } catch {
      return { pathKey: '', host: '', pathname: '/' };
    }
  }

  const slashIndex = normalized.indexOf('/');
  if (slashIndex < 0) {
    return { pathKey: normalized, host: normalized, pathname: '/' };
  }

  return {
    pathKey: normalized,
    host: normalized.slice(0, slashIndex),
    pathname: normalized.slice(slashIndex) || '/'
  };
}

function createBucketMeta(pathKey = '', now = Date.now()) {
  const { host, pathname } = parsePathKey(pathKey);
  return {
    schemaVersion: FIELD_MAPPING_SCHEMA_VERSION,
    pathKey,
    host,
    pathname,
    createdAt: now,
    updatedAt: now,
    totalHits: 0,
    fieldCount: 0,
    templateCount: 0
  };
}

function normalizeFieldEntry(entry = {}, now = Date.now()) {
  if (!entry || typeof entry !== 'object') {
    return {
      kind: 'text',
      hits: 0,
      createdAt: now,
      updatedAt: now
    };
  }
  const createdAt = Number(entry.createdAt || entry.updatedAt || now) || now;
  const updatedAt = Number(entry.updatedAt || entry.createdAt || now) || now;
  return {
    ...entry,
    kind: normText(entry.kind || 'text'),
    hits: Number(entry.hits || 0),
    createdAt,
    updatedAt
  };
}

function normalizeFieldMap(rawFields = {}, now = Date.now()) {
  const fields = {};
  for (const [fingerprint, entry] of Object.entries(rawFields || {})) {
    fields[fingerprint] = normalizeFieldEntry(entry, now);
  }
  return fields;
}

function normalizeTemplateRecord(template = {}, templateName = '', now = Date.now()) {
  const fieldsSource =
    Array.isArray(template.fields)
      ? template.fields
      : template.fields && typeof template.fields === 'object'
      ? template.fields
      : template.mapping && typeof template.mapping === 'object'
        ? template.mapping
      : template.entries && typeof template.entries === 'object'
          ? template.entries
          : {};
  const fields = Array.isArray(fieldsSource)
    ? normalizeMappingInput(fieldsSource)
    : normalizeFieldMap(fieldsSource, now);
  const createdAt = Number(template.createdAt || template.updatedAt || now) || now;
  const updatedAt = Number(template.updatedAt || template.createdAt || now) || now;
  return {
    name: normText(template.name || templateName),
    version: Number(template.version || 1) || 1,
    createdAt,
    updatedAt,
    totalHits: Number(template.totalHits || 0),
    fields
  };
}

function normalizeBucket(rawBucket = {}, pathKey = '') {
  const now = Date.now();
  if (!rawBucket || typeof rawBucket !== 'object') {
    return {
      meta: createBucketMeta(pathKey, now),
      fields: {},
      templates: {}
    };
  }

  const looksLegacy =
    !Object.prototype.hasOwnProperty.call(rawBucket, 'meta') &&
    !Object.prototype.hasOwnProperty.call(rawBucket, 'fields') &&
    !Object.prototype.hasOwnProperty.call(rawBucket, 'templates') &&
    !Object.prototype.hasOwnProperty.call(rawBucket, 'schemaVersion');

  if (looksLegacy) {
    return {
      meta: createBucketMeta(pathKey, now),
      fields: normalizeFieldMap(rawBucket, now),
      templates: {}
    };
  }

  const fields = normalizeFieldMap(rawBucket.fields || {}, now);
  const templates = {};
  for (const [templateName, template] of Object.entries(rawBucket.templates || {})) {
    const nextName = normText(templateName || template?.name || '');
    if (!nextName) continue;
    templates[nextName] = normalizeTemplateRecord(template, nextName, now);
  }

  const meta = {
    ...createBucketMeta(pathKey, now),
    ...(rawBucket.meta || {})
  };
  meta.schemaVersion = FIELD_MAPPING_SCHEMA_VERSION;
  meta.pathKey = pathKey || meta.pathKey || '';
  if (!meta.host || !meta.pathname) {
    const parsed = parsePathKey(meta.pathKey);
    meta.host = meta.host || parsed.host;
    meta.pathname = meta.pathname || parsed.pathname;
  }
  meta.createdAt = Number(meta.createdAt || now) || now;
  meta.updatedAt = Number(meta.updatedAt || meta.createdAt || now) || now;
  meta.fieldCount = Object.keys(fields).length;
  meta.templateCount = Object.keys(templates).length;
  meta.totalHits = Object.values(fields).reduce((sum, entry) => sum + Number(entry?.hits || 0), 0);

  return { meta, fields, templates };
}

function summarizeBucket(bucket = {}, pathKey = '') {
  const meta = {
    ...createBucketMeta(pathKey, bucket?.meta?.updatedAt || Date.now()),
    ...(bucket.meta || {})
  };
  const fields = bucket.fields || {};
  const templates = bucket.templates || {};
  const fieldCount = Object.keys(fields).length;
  const templateCount = Object.keys(templates).length;
  const totalHits = Object.values(fields).reduce((sum, entry) => sum + Number(entry?.hits || 0), 0);
  meta.schemaVersion = FIELD_MAPPING_SCHEMA_VERSION;
  meta.pathKey = pathKey || meta.pathKey || '';
  meta.fieldCount = fieldCount;
  meta.templateCount = templateCount;
  meta.totalHits = totalHits;
  return meta;
}

function bucketNeedsMigration(rawBucket = {}) {
  if (!rawBucket || typeof rawBucket !== 'object') return false;
  const hasCoreShape =
    Object.prototype.hasOwnProperty.call(rawBucket, 'meta') &&
    Object.prototype.hasOwnProperty.call(rawBucket, 'fields') &&
    Object.prototype.hasOwnProperty.call(rawBucket, 'templates') &&
    Number(rawBucket?.meta?.schemaVersion || 0) === FIELD_MAPPING_SCHEMA_VERSION;

  if (!hasCoreShape) return true;

  const fieldEntries = rawBucket.fields || {};
  for (const entry of Object.values(fieldEntries)) {
    if (!entry || typeof entry !== 'object') return true;
    if (typeof entry.kind !== 'string') return true;
    if (!Object.prototype.hasOwnProperty.call(entry, 'hits')) return true;
    if (!Object.prototype.hasOwnProperty.call(entry, 'createdAt')) return true;
    if (!Object.prototype.hasOwnProperty.call(entry, 'updatedAt')) return true;
  }

  const templateEntries = rawBucket.templates || {};
  for (const template of Object.values(templateEntries)) {
    if (!template || typeof template !== 'object') return true;
    if (typeof template.name !== 'string') return true;
    if (!Object.prototype.hasOwnProperty.call(template, 'version')) return true;
    if (!Object.prototype.hasOwnProperty.call(template, 'createdAt')) return true;
    if (!Object.prototype.hasOwnProperty.call(template, 'updatedAt')) return true;
    if (!template.fields || typeof template.fields !== 'object') return true;
  }

  return false;
}

function normalizeMappingStore(rawStore = {}) {
  const nextStore = {};
  let changed = false;
  for (const [pathKey, bucket] of Object.entries(rawStore || {})) {
    const normalized = normalizeBucket(bucket, pathKey);
    nextStore[pathKey] = normalized;
    if (bucketNeedsMigration(bucket)) {
      changed = true;
    }
  }
  return { store: nextStore, changed };
}

function getBucketFields(bucket = {}) {
  return bucket?.fields || {};
}

function mergeBucketMapping(bucket = {}, nextFields = {}) {
  const fields = {};
  for (const [fingerprint, entry] of Object.entries(nextFields || {})) {
    fields[fingerprint] = normalizeFieldEntry(entry);
  }
  bucket.fields = fields;
  bucket.meta = summarizeBucket(bucket, bucket?.meta?.pathKey || '');
  bucket.meta.updatedAt = Date.now();
  return bucket;
}

function createFieldEntryFromField(field = {}, now = Date.now()) {
  return {
    kind: normText(field.kind || 'text'),
    hits: Number(field.hits || 0),
    createdAt: Number(field.createdAt || field.updatedAt || now) || now,
    updatedAt: Number(field.updatedAt || field.createdAt || now) || now
  };
}

function normalizePathKeyInput(input = '') {
  const text = normText(input);
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) {
    return buildPathKey(text);
  }
  return parsePathKey(text).pathKey || text;
}

function createManualLibraryMeta(pathKey = '', now = Date.now()) {
  const { host, pathname } = parsePathKey(pathKey);
  return {
    pathKey,
    host,
    pathname,
    createdAt: now,
    updatedAt: now,
    entryCount: 0
  };
}

function hashText(input = '') {
  const text = String(input || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeSelectorCandidates(list = []) {
  const result = [];
  const seen = new Set();
  for (const item of list || []) {
    const selector = normText(item);
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);
    result.push(selector);
  }
  return result;
}

function sanitizeManualFieldForStorage(field = {}, entryKey = '') {
  const raw = cloneValue(field || {});
  const locatorCandidates = normalizeSelectorCandidates([
    ...(Array.isArray(raw?.meta?.locatorCandidates) ? raw.meta.locatorCandidates : []),
    raw?.meta?.stableSelector,
    raw?.selector
  ]);
  const containerCandidates = normalizeSelectorCandidates([
    ...(Array.isArray(raw?.meta?.containerLocatorCandidates) ? raw.meta.containerLocatorCandidates : []),
    raw?.meta?.stableContainerSelector,
    raw?.containerSelector
  ]);
  const selector = locatorCandidates[0] || '';
  const containerSelector = containerCandidates[0] || '';
  const fingerprint = normText(raw.fingerprint || raw?.meta?.fieldFingerprint || buildManualFieldEntryKey(raw) || entryKey);
  const stableIdSeed = entryKey || selector || `${raw.kind || 'text'}|${raw.label || raw.placeholder || ''}`;
  const stableId = `manual_lib_${hashText(stableIdSeed).toString(36)}`;

  return {
    ...raw,
    id: stableId,
    domId: '',
    selector,
    containerSelector,
    fingerprint,
    source: 'manual-library',
    meta: {
      ...(raw.meta || {}),
      runtimeDomId: normText(raw.domId || raw?.meta?.runtimeDomId || ''),
      fieldFingerprint: fingerprint,
      locatorCandidates,
      containerLocatorCandidates: containerCandidates,
      stableSelector: selector,
      stableContainerSelector: containerSelector,
      storedFromManualPick: true
    }
  };
}

function buildManualFieldEntryKey(field = {}) {
  const fingerprint = fingerprintField(field);
  if (fingerprint && fingerprint.replace(/\|/g, '')) return fingerprint;
  return [
    normText(field.selector || '').toLowerCase(),
    normText(field.label || field.placeholder || '').toLowerCase(),
    normText(field.kind || '').toLowerCase()
  ].join('|');
}

function normalizeManualFieldEntry(entry = {}, pathKey = '', now = Date.now()) {
  const field = cloneValue(entry.field || entry);
  const key = normText(entry.key || entry.id || buildManualFieldEntryKey(field));
  const title = normText(entry.title || field.label || field.placeholder || field.selector || field.id || '手动字段');
  const matchText = normText(entry.matchText || title);
  return {
    key,
    id: key,
    pathKey,
    host: parsePathKey(pathKey).host,
    pathname: parsePathKey(pathKey).pathname,
    title,
    matchText,
    kind: normText(entry.kind || field.kind || 'text') || 'text',
    selector: normText(entry.selector || field.selector || ''),
    fingerprint: normText(entry.fingerprint || field.fingerprint || field?.meta?.fieldFingerprint || key),
    createdAt: Number(entry.createdAt || now) || now,
    updatedAt: Number(entry.updatedAt || entry.createdAt || now) || now,
    field
  };
}

function normalizeManualLibraryBucket(rawBucket = {}, pathKey = '') {
  const now = Date.now();
  const meta = {
    ...createManualLibraryMeta(pathKey, now),
    ...(rawBucket?.meta || {})
  };
  const entries = {};
  for (const [key, entry] of Object.entries(rawBucket?.entries || {})) {
    const nextEntry = normalizeManualFieldEntry({ ...entry, key }, pathKey, now);
    if (!nextEntry.key) continue;
    entries[nextEntry.key] = nextEntry;
  }
  meta.updatedAt = Number(meta.updatedAt || now) || now;
  meta.createdAt = Number(meta.createdAt || meta.updatedAt || now) || now;
  meta.entryCount = Object.keys(entries).length;
  return { meta, entries };
}

function normalizeManualFieldLibraryStore(rawStore = {}) {
  const nextStore = {};
  for (const [pathKey, bucket] of Object.entries(rawStore || {})) {
    nextStore[pathKey] = normalizeManualLibraryBucket(bucket, pathKey);
  }
  return nextStore;
}

async function getManualFieldLibraryStore() {
  const res = await chrome.storage.local.get(STORAGE_KEYS.MANUAL_FIELD_LIBRARY);
  const raw = res?.[STORAGE_KEYS.MANUAL_FIELD_LIBRARY];
  if (!raw || typeof raw !== 'object') return {};
  const store = normalizeManualFieldLibraryStore(raw);
  await chrome.storage.local.set({ [STORAGE_KEYS.MANUAL_FIELD_LIBRARY]: store });
  return store;
}

async function saveManualFieldLibraryStore(store = {}) {
  await chrome.storage.local.set({ [STORAGE_KEYS.MANUAL_FIELD_LIBRARY]: store });
}

function getManualFieldSummaries(bucket = {}) {
  return Object.values(bucket?.entries || {})
    .map((entry) => ({
      id: entry.id,
      key: entry.key,
      pathKey: entry.pathKey,
      title: entry.title,
      matchText: entry.matchText,
      kind: entry.kind,
      selector: entry.selector,
      fingerprint: normText(entry?.field?.fingerprint || entry?.field?.meta?.fieldFingerprint || ''),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      field: cloneValue(entry.field || {})
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
}

async function saveManualFieldToLibrary(pathKey, field = {}) {
  if (!pathKey || !field || typeof field !== 'object') {
    return { ok: false, error: '缺少路径或字段' };
  }
  const key = buildManualFieldEntryKey(field);
  if (!key) return { ok: false, error: '手动字段指纹为空' };
  const sanitizedField = sanitizeManualFieldForStorage(field, key);
  const store = await getManualFieldLibraryStore();
  const bucket = normalizeManualLibraryBucket(store[pathKey], pathKey);
  const prev = bucket.entries[key] || {};
  const now = Date.now();
  bucket.entries[key] = normalizeManualFieldEntry({
    ...prev,
    key,
    title: sanitizedField.label || sanitizedField.placeholder || sanitizedField.selector || sanitizedField.id || '手动字段',
    matchText: sanitizedField.label || sanitizedField.placeholder || sanitizedField.selector || '',
    kind: sanitizedField.kind || prev.kind || 'text',
    selector: sanitizedField.selector || prev.selector || '',
    createdAt: prev.createdAt || now,
    updatedAt: now,
    field: {
      ...cloneValue(prev.field || {}),
      ...cloneValue(sanitizedField),
      source: 'manual-library'
    }
  }, pathKey, now);
  bucket.meta = {
    ...bucket.meta,
    updatedAt: now,
    entryCount: Object.keys(bucket.entries).length
  };
  store[pathKey] = bucket;
  await saveManualFieldLibraryStore(store);
  return {
    ok: true,
    pathKey,
    entry: cloneValue(bucket.entries[key]),
    entries: getManualFieldSummaries(bucket)
  };
}

async function removeManualFieldFromLibrary(pathKey, entryId = '') {
  if (!pathKey || !entryId) return { ok: false, error: '缺少路径或字段标识' };
  const store = await getManualFieldLibraryStore();
  const bucket = normalizeManualLibraryBucket(store[pathKey], pathKey);
  if (!bucket.entries?.[entryId]) {
    return { ok: true, pathKey, entries: getManualFieldSummaries(bucket) };
  }
  delete bucket.entries[entryId];
  bucket.meta = {
    ...bucket.meta,
    updatedAt: Date.now(),
    entryCount: Object.keys(bucket.entries).length
  };
  if (bucket.meta.entryCount > 0) {
    store[pathKey] = bucket;
  } else {
    delete store[pathKey];
  }
  await saveManualFieldLibraryStore(store);
  return { ok: true, pathKey, entries: getManualFieldSummaries(bucket) };
}

async function resolvePathKeyFromMessage(msg = {}, sender = {}) {
  if (msg?.pathKey) {
    return normalizePathKeyInput(msg.pathKey);
  }

  const tabId = Number(msg?.tabId || 0) || sender?.tab?.id || (await getActiveTab())?.id;
  if (!tabId) return '';
  return getTabPathKey(tabId);
}

function normalizeMappingInput(rawMapping = {}, fallbackBucket = {}) {
  const now = Date.now();
  if (Array.isArray(rawMapping)) {
    const nextFields = {};
    for (const field of rawMapping) {
      const fp = fingerprintField(field);
      if (!fp) continue;
      nextFields[fp] = createFieldEntryFromField(field, now);
    }
    return nextFields;
  }

  if (rawMapping && typeof rawMapping === 'object') {
    const source = Array.isArray(rawMapping.fields)
      ? rawMapping.fields
      : rawMapping.fields && typeof rawMapping.fields === 'object'
        ? rawMapping.fields
        : rawMapping;
    if (Array.isArray(source)) {
      return normalizeMappingInput(source, fallbackBucket);
    }
    const nextFields = {};
    for (const [fp, entry] of Object.entries(source || {})) {
      if (!fp) continue;
      if (typeof entry === 'string') {
        nextFields[fp] = createFieldEntryFromField({ kind: entry }, now);
        continue;
      }
      if (entry && typeof entry === 'object') {
        nextFields[fp] = normalizeFieldEntry(entry, now);
        continue;
      }
      nextFields[fp] = createFieldEntryFromField({}, now);
    }
    return nextFields;
  }

  return cloneValue(fallbackBucket?.fields || {});
}

function getTemplateSummaries(bucket = {}) {
  return Object.values(bucket.templates || {})
    .map((template) => ({
      name: template.name,
      version: Number(template.version || 1) || 1,
      createdAt: Number(template.createdAt || 0),
      updatedAt: Number(template.updatedAt || 0),
      totalHits: Number(template.totalHits || 0),
      fieldCount: Object.keys(template.fields || {}).length
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
}

function upsertTemplateInBucket(bucket = {}, templateName = '', rawMapping = {}, mode = 'save') {
  const now = Date.now();
  const nextName = normText(templateName);
  if (!nextName) return { ok: false, error: '模板名不能为空' };

  const fields = normalizeMappingInput(rawMapping, bucket);
  if (!Object.keys(fields).length) {
    return { ok: false, error: '模板内容不能为空' };
  }
  const prev = bucket.templates?.[nextName] || {};
  bucket.templates = bucket.templates || {};
  bucket.templates[nextName] = {
    name: nextName,
    version: Number(prev.version || 0) + 1,
    createdAt: Number(prev.createdAt || now) || now,
    updatedAt: now,
    totalHits: Object.values(fields).reduce((sum, entry) => sum + Number(entry?.hits || 0), 0),
    fields
  };

  bucket.meta = summarizeBucket(bucket, bucket?.meta?.pathKey || '');
  bucket.meta.updatedAt = now;
  return {
    ok: true,
    mode,
    template: cloneValue(bucket.templates[nextName]),
    bucket
  };
}

function applyTemplateToBucket(bucket = {}, templateName = '', options = {}) {
  const now = Date.now();
  const nextName = normText(templateName);
  if (!nextName) return { ok: false, error: '模板名不能为空' };
  const template = bucket.templates?.[nextName];
  if (!template) return { ok: false, error: '模板不存在' };

  const templateFields = cloneValue(template.fields || {});
  if (options.merge) {
    bucket.fields = {
      ...(bucket.fields || {}),
      ...templateFields
    };
  } else {
    bucket.fields = templateFields;
  }

  bucket.meta = summarizeBucket(bucket, bucket?.meta?.pathKey || '');
  bucket.meta.updatedAt = now;
  return {
    ok: true,
    template: cloneValue(template),
    bucket
  };
}

function fingerprintField(field = {}) {
  const direct = normText(field.fingerprint || field?.meta?.fieldFingerprint || '');
  if (direct) return direct.toLowerCase();
  return [
    normText(field.selector || '').toLowerCase(),
    normText(field.containerSelector || '').toLowerCase(),
    normText(field.label || '').toLowerCase(),
    normText(field.placeholder || '').toLowerCase()
  ].join('|');
}

async function getMappingStore() {
  const res = await chrome.storage.local.get(STORAGE_KEYS.FIELD_MAPPINGS);
  const raw = res[STORAGE_KEYS.FIELD_MAPPINGS];
  if (!raw || typeof raw !== 'object') return {};
  const { store, changed } = normalizeMappingStore(raw);
  if (changed) {
    await saveMappingStore(store);
  }
  return store;
}

async function saveMappingStore(store) {
  await chrome.storage.local.set({ [STORAGE_KEYS.FIELD_MAPPINGS]: store || {} });
}

async function getTabPathKey(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return buildPathKey(tab?.url || '');
  } catch {
    return '';
  }
}

function applyMappingsToFields(fields = [], mappingBucket = {}) {
  const mappingDict = mappingBucket?.fields || mappingBucket || {};
  return fields.map((field) => {
    const fp = fingerprintField(field);
    const mapped = mappingDict?.[fp];
    if (!mapped?.kind || mapped.kind === field.kind) {
      return field;
    }
    return {
      ...field,
      kind: mapped.kind,
      confidence: Math.max(Number(field.confidence || 0.5), 0.72),
      score: Math.max(Number(field.score || 0.5), 0.72),
      source: field.source || 'scan:basic',
      reasons: Array.from(new Set([...(field.reasons || []), `应用路径模板映射: ${mapped.kind}`])),
      meta: {
        ...(field.meta || {}),
        mappedByTemplate: true
      }
    };
  });
}

function shouldSkipChoiceFieldBySettings(field = {}, settings = {}) {
  if (settings?.fillRadioCheckbox !== false) return false;
  const kind = normText(field?.kind);
  return kind === 'radioGroup' || kind === 'checkboxGroup';
}

function isRequiredFieldByMetadata(field = {}) {
  if (field?.constraints?.required === true) return true;
  if (field?.required === true) return true;
  const hint = normText(`${field?.label || ''} ${field?.placeholder || ''} ${field?.context || ''}`);
  return /必填|必須|必须|required|aria-required/.test(hint);
}

function shouldSkipOptionalFieldBySettings(field = {}, settings = {}) {
  if (settings?.fillOptionalFields !== false) return false;
  return !isRequiredFieldByMetadata(field);
}

function applyFieldFilterBySettings(fields = [], settings = {}, options = {}) {
  const skipOptionalFields = options?.skipOptionalFields !== false;
  const filtered = [];
  let skippedChoiceCount = 0;
  let skippedOptionalCount = 0;
  for (const field of fields || []) {
    if (shouldSkipChoiceFieldBySettings(field, settings)) {
      skippedChoiceCount += 1;
      continue;
    }
    if (skipOptionalFields && shouldSkipOptionalFieldBySettings(field, settings)) {
      skippedOptionalCount += 1;
      continue;
    }
    filtered.push(field);
  }
  return { fields: filtered, skippedChoiceCount, skippedOptionalCount };
}

async function saveMappingsFromFill(pathKey, fields = [], fillDetail = []) {
  if (!pathKey) return;
  const detailOk = Array.isArray(fillDetail) ? fillDetail.filter((item) => item && item.ok) : [];
  if (!detailOk.length) return;

  const fieldMap = new Map((fields || []).map((field) => [field.id, field]));
  const store = await getMappingStore();
  const bucket = normalizeBucket(store[pathKey], pathKey);
  const now = Date.now();

  for (const row of detailOk) {
    const field = fieldMap.get(row.id);
    if (!field) continue;
    const fp = fingerprintField(field);
    if (!fp) continue;
    const prev = bucket.fields[fp] || {};
    bucket.fields[fp] = {
      ...createFieldEntryFromField(field, now),
      kind: normText(field.kind || prev.kind || 'text'),
      hits: Number(prev.hits || 0) + 1,
      createdAt: Number(prev.createdAt || now) || now,
      updatedAt: now
    };
  }

  bucket.meta = summarizeBucket(bucket, pathKey);
  bucket.meta.updatedAt = now;
  store[pathKey] = bucket;
  await saveMappingStore(store);
}

async function upsertMapping(pathKey, field = {}, kind = '') {
  if (!pathKey || !field) return { ok: false, error: '缺少路径或字段' };
  const fp = fingerprintField(field);
  if (!fp) return { ok: false, error: '字段指纹为空' };
  const nextKind = normText(kind || field.kind || '');
  if (!nextKind) return { ok: false, error: 'kind 为空' };

  const store = await getMappingStore();
  const bucket = normalizeBucket(store[pathKey], pathKey);
  const prev = bucket.fields[fp] || {};
  const now = Date.now();
  bucket.fields[fp] = {
    ...normalizeFieldEntry(prev, now),
    kind: nextKind,
    hits: Number(prev.hits || 0),
    createdAt: Number(prev.createdAt || now) || now,
    updatedAt: now
  };
  bucket.meta = summarizeBucket(bucket, pathKey);
  bucket.meta.updatedAt = now;
  store[pathKey] = bucket;
  await saveMappingStore(store);
  return { ok: true, pathKey, fingerprint: fp, kind: nextKind, mapping: bucket.fields, bucket };
}

const PANEL_TAB_VALUES = ['ui', 'qr', 'api'];
const DEFAULT_VISIBLE_PANEL_TABS = ['ui', 'qr'];
const OPENAI_REASONING_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const OPENAI_LEGACY_DEFAULT_MODEL = 'gpt-4.1-mini';
const ZHIPU_THINKING_TYPE_VALUES = ['disabled', 'enabled'];
const ZHIPU_REASONING_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function normalizeVisiblePanelTabs(raw = DEFAULT_VISIBLE_PANEL_TABS) {
  const source = Array.isArray(raw) ? raw : DEFAULT_VISIBLE_PANEL_TABS;
  const picked = [];
  for (const value of source) {
    if (PANEL_TAB_VALUES.includes(value) && !picked.includes(value)) {
      picked.push(value);
    }
  }
  return picked.length ? picked : DEFAULT_VISIBLE_PANEL_TABS.slice();
}

function normalizeOpenAIReasoningEffort(value = DEFAULT_SETTINGS.openai.reasoningEffort) {
  const normalized = String(value || '').trim().toLowerCase();
  return OPENAI_REASONING_EFFORT_VALUES.includes(normalized)
    ? normalized
    : DEFAULT_SETTINGS.openai.reasoningEffort;
}

function normalizeOpenAISettings(raw = {}) {
  const next = { ...DEFAULT_SETTINGS.openai, ...(raw || {}) };
  const hasReasoningEffort = Object.prototype.hasOwnProperty.call(raw || {}, 'reasoningEffort');
  const model = String(next.model || '').trim();
  next.model = !model || (!hasReasoningEffort && model === OPENAI_LEGACY_DEFAULT_MODEL)
    ? DEFAULT_SETTINGS.openai.model
    : model;
  next.reasoningEffort = normalizeOpenAIReasoningEffort(next.reasoningEffort);
  return next;
}

function normalizeZhipuThinkingType(value = DEFAULT_SETTINGS.zhipu.thinkingType) {
  const normalized = String(value || '').trim().toLowerCase();
  return ZHIPU_THINKING_TYPE_VALUES.includes(normalized)
    ? normalized
    : DEFAULT_SETTINGS.zhipu.thinkingType;
}

function normalizeZhipuReasoningEffort(value = DEFAULT_SETTINGS.zhipu.reasoningEffort) {
  const normalized = String(value || '').trim().toLowerCase();
  return ZHIPU_REASONING_EFFORT_VALUES.includes(normalized)
    ? normalized
    : DEFAULT_SETTINGS.zhipu.reasoningEffort;
}

function normalizeZhipuMaxTokens(value = DEFAULT_SETTINGS.zhipu.maxTokens) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SETTINGS.zhipu.maxTokens;
  return Math.max(64, Math.min(8192, Math.round(numeric)));
}

function normalizeZhipuSettings(raw = {}) {
  const next = { ...DEFAULT_SETTINGS.zhipu, ...(raw || {}) };
  next.baseUrl = String(next.baseUrl || DEFAULT_SETTINGS.zhipu.baseUrl).trim();
  next.model = String(next.model || DEFAULT_SETTINGS.zhipu.model).trim();
  next.apiKey = String(next.apiKey || '').trim();
  next.thinkingType = normalizeZhipuThinkingType(next.thinkingType);
  next.reasoningEffort = normalizeZhipuReasoningEffort(next.reasoningEffort);
  next.maxTokens = normalizeZhipuMaxTokens(next.maxTokens);
  return next;
}

function mergeSettings(raw = {}) {
  const testDataLibrary = migrateTestDataLibraryDefaults(raw.testDataLibrary || {});
  const emailPoolList = Array.isArray(raw.emailPoolList)
    ? migrateDefaultEmailPool(raw.emailPoolList)
    : DEFAULT_SETTINGS.emailPoolList;
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    emailPoolList,
    testDataLibrary,
    visiblePanelTabs: normalizeVisiblePanelTabs(raw.visiblePanelTabs),
    mockRuleCenter: {
      ...(DEFAULT_SETTINGS.mockRuleCenter || {}),
      ...(raw.mockRuleCenter || {})
    },
    deepseek: {
      ...DEFAULT_SETTINGS.deepseek,
      ...(raw.deepseek || {})
    },
    zhipu: normalizeZhipuSettings(raw.zhipu || {}),
    openai: normalizeOpenAISettings(raw.openai || {})
  };
}

async function getSettings() {
  const res = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return mergeSettings(res[STORAGE_KEYS.SETTINGS] || {});
}

async function getActiveTab(preferredTabId = 0) {
  return resolveWebTab(preferredTabId);
}

async function sendMessageToTab(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (error) {
    if (/Receiving end does not exist|Could not establish connection/i.test(String(error?.message || ''))) {
      clearRuntimeCacheForTab(tabId);
    }
    return {
      ok: false,
      error: error?.message || '无法连接内容脚本，请刷新页面后重试'
    };
  }
}

async function ensureRuntimeModules(tabId) {
  const cachedBuild = contentRuntimeCache.get(tabId);
  if (cachedBuild === CONTENT_RUNTIME_BUILD) {
    return { ok: true, cached: true };
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: CONTENT_RUNTIME_FILES
    });
    contentRuntimeCache.set(tabId, CONTENT_RUNTIME_BUILD);
    return { ok: true };
  } catch (error) {
    clearRuntimeCacheForTab(tabId);
    log('运行时模块注入失败，继续尝试使用现有内容脚本', {
      tabId,
      error: error?.message || String(error)
    });
    return {
      ok: false,
      error: error?.message || String(error)
    };
  }
}

async function scanInTab(tabId, scopeSelector = '') {
  await ensureRuntimeModules(tabId);
  const result = await sendMessageToTab(tabId, {
    type: 'formpilotv2:scan',
    scopeSelector
  });

  if (!result?.ok) return result;

  const pathKey = await getTabPathKey(tabId);
  const store = pathKey ? await getMappingStore() : {};
  const mappedRaw = applyMappingsToFields(result.fields || [], store[pathKey] || {});
  const fields = detectEngineNormalize(mappedRaw);
  return {
    ok: true,
    pathKey,
    fields,
    summary: {
      ...(result.summary || {}),
      total: fields.length,
      rawTotal: Number(result?.summary?.total || 0) || fields.length
    }
  };
}

const QR_MAX_RESULTS = 8;
const BARCODE_MAX_RESULTS = 8;
const BARCODE_MAX_CANVAS_SIDE = 1800;
const BARCODE_MAX_PIXELS = 2600000;
const BARCODE_NATIVE_TIMEOUT_MS = 900;
const BARCODE_WASM_TIMEOUT_MS = 8000;
const BARCODE_NATIVE_FORMATS = [
  'codabar',
  'code_39',
  'code_93',
  'code_128',
  'ean_8',
  'ean_13',
  'itf',
  'upc_a',
  'upc_e'
];
const BARCODE_ZXING_FORMATS = [
  'Codabar',
  'Code39',
  'Code93',
  'Code128',
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
  'ITF',
  'ITF14'
];
const BARCODE_FORMAT_LABELS = {
  codabar: 'Codabar',
  code_39: 'Code39',
  code_93: 'Code93',
  code_128: 'Code128',
  ean_8: 'EAN8',
  ean_13: 'EAN13',
  itf: 'ITF',
  upc_a: 'UPCA',
  upc_e: 'UPCE'
};
let barcodeDetectorFormatsPromise = null;

class BarcodeScanError extends Error {
  constructor(message, code = 'BARCODE_SCAN_ERROR', cause = null) {
    super(message);
    this.name = 'BarcodeScanError';
    this.code = code;
    this.cause = cause || undefined;
  }
}

function getErrorMessage(error) {
  return String(error?.message || error || '未知错误');
}

function createBarcodeError(message, code = 'BARCODE_SCAN_ERROR', cause = null) {
  const detail = cause ? getErrorMessage(cause) : '';
  return new BarcodeScanError(
    detail && !String(message).includes(detail) ? `${message}：${detail}` : message,
    code,
    cause
  );
}

function normalizeQrViewport(input = {}) {
  const width = Math.max(1, Math.round(Number(input.width || 0)));
  const height = Math.max(1, Math.round(Number(input.height || 0)));
  return {
    width,
    height,
    devicePixelRatio: Math.max(0.1, Number(input.devicePixelRatio || 1) || 1)
  };
}

function normalizeQrRect(input = {}) {
  const x = Math.round(Number(input.x ?? input.left ?? 0));
  const y = Math.round(Number(input.y ?? input.top ?? 0));
  const width = Math.round(Number(input.width ?? input.w ?? 0));
  const height = Math.round(Number(input.height ?? input.h ?? 0));
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function clampQrBox(box, maxWidth, maxHeight) {
  const x = Math.max(0, Math.min(maxWidth - 1, Math.round(box.x || 0)));
  const y = Math.max(0, Math.min(maxHeight - 1, Math.round(box.y || 0)));
  const right = Math.max(x + 1, Math.min(maxWidth, Math.round((box.x || 0) + (box.width || 0))));
  const bottom = Math.max(y + 1, Math.min(maxHeight, Math.round((box.y || 0) + (box.height || 0))));
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y)
  };
}

function getQrDecodeArea(bitmap, viewportInput = {}, rectInput = null, mode = 'global') {
  if (mode !== 'capture') {
    return { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  }
  const rect = normalizeQrRect(rectInput);
  if (!rect) throw new Error('缺少截图区域');
  const viewport = normalizeQrViewport(viewportInput);
  const scaleX = bitmap.width / viewport.width;
  const scaleY = bitmap.height / viewport.height;
  return clampQrBox({
    x: rect.x * scaleX,
    y: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY
  }, bitmap.width, bitmap.height);
}

async function createBitmapFromDataUrl(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

function createQrCanvas(width, height) {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('当前 Chrome 环境不支持离屏截图解析');
  }
  return new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
}

function cropBitmapToCanvas(bitmap, area) {
  const canvas = createQrCanvas(area.width, area.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  return canvas;
}

function getQrLocationBounds(location = {}, width = 1, height = 1) {
  const points = [
    location.topLeftCorner,
    location.topRightCorner,
    location.bottomRightCorner,
    location.bottomLeftCorner
  ].filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!points.length) return { x: 0, y: 0, width, height };
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const pad = Math.max(8, Math.round(Math.max(maxX - minX, maxY - minY) * 0.12));
  return clampQrBox({
    x: minX - pad,
    y: minY - pad,
    width: (maxX - minX) + pad * 2,
    height: (maxY - minY) + pad * 2
  }, width, height);
}

function getPointBounds(points = [], width = 1, height = 1, padRatio = 0.1, minPad = 6) {
  const clean = points
    .map((point) => ({
      x: Number(point?.x),
      y: Number(point?.y)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!clean.length) return { x: 0, y: 0, width, height };
  const minX = Math.min(...clean.map((point) => point.x));
  const minY = Math.min(...clean.map((point) => point.y));
  const maxX = Math.max(...clean.map((point) => point.x));
  const maxY = Math.max(...clean.map((point) => point.y));
  const pad = Math.max(minPad, Math.round(Math.max(maxX - minX, maxY - minY) * padRatio));
  return clampQrBox({
    x: minX - pad,
    y: minY - pad,
    width: (maxX - minX) + pad * 2,
    height: (maxY - minY) + pad * 2
  }, width, height);
}

function getNativeBarcodeBounds(result = {}, width = 1, height = 1) {
  if (Array.isArray(result.cornerPoints) && result.cornerPoints.length) {
    return getPointBounds(result.cornerPoints, width, height, 0.08, 6);
  }
  const box = result.boundingBox || result.rawBoundingBox || null;
  if (box) {
    const x = Number(box.x ?? box.left ?? 0);
    const y = Number(box.y ?? box.top ?? 0);
    const boxWidth = Number(box.width ?? 0);
    const boxHeight = Number(box.height ?? 0);
    if ([x, y, boxWidth, boxHeight].every(Number.isFinite) && boxWidth > 0 && boxHeight > 0) {
      return clampQrBox({ x, y, width: boxWidth, height: boxHeight }, width, height);
    }
  }
  return { x: 0, y: 0, width, height };
}

function getZxingBarcodeBounds(result = {}, width = 1, height = 1) {
  const position = result.position || {};
  const points = [
    position.topLeft,
    position.topRight,
    position.bottomRight,
    position.bottomLeft
  ];
  return getPointBounds(points, width, height, 0.08, 6);
}

function scaleBarcodeBounds(bounds, scale, width, height) {
  if (!bounds || !Number.isFinite(scale) || scale <= 0 || Math.abs(scale - 1) < 0.001) {
    return clampQrBox(bounds || { x: 0, y: 0, width, height }, width, height);
  }
  return clampQrBox({
    x: bounds.x / scale,
    y: bounds.y / scale,
    width: bounds.width / scale,
    height: bounds.height / scale
  }, width, height);
}

function createBarcodeScanCanvas(sourceCanvas) {
  const width = Math.max(1, Number(sourceCanvas.width || 1));
  const height = Math.max(1, Number(sourceCanvas.height || 1));
  const pixelScale = Math.sqrt(BARCODE_MAX_PIXELS / Math.max(1, width * height));
  const sideScale = BARCODE_MAX_CANVAS_SIDE / Math.max(width, height);
  const scale = Math.min(1, pixelScale, sideScale);
  if (scale >= 0.98) return { canvas: sourceCanvas, scale: 1 };
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  const canvas = createQrCanvas(scaledWidth, scaledHeight);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, width, height, 0, 0, scaledWidth, scaledHeight);
  return { canvas, scale };
}

function withScanTimeout(promise, timeoutMs, fallbackValue = [], options = {}) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        if (options.rejectOnTimeout) {
          reject(createBarcodeError(
            options.timeoutMessage || `识别超时（${timeoutMs}ms）`,
            options.timeoutCode || 'BARCODE_SCAN_TIMEOUT'
          ));
          return;
        }
        resolve(fallbackValue);
      }, timeoutMs);
    })
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizeNativeBarcodeFormat(format = '') {
  const key = String(format || '').toLowerCase();
  return BARCODE_FORMAT_LABELS[key] || String(format || 'Barcode').replace(/[^a-z0-9]+/gi, '');
}

function barcodeDedupeKey(item = {}) {
  const bounds = item.bounds || {};
  return [
    item.kind || '',
    item.format || '',
    item.text || '',
    Math.round(Number(bounds.x || 0) / 8),
    Math.round(Number(bounds.y || 0) / 8),
    Math.round(Number(bounds.width || 0) / 8),
    Math.round(Number(bounds.height || 0) / 8)
  ].join('|');
}

async function normalizeBarcodeResults(items = []) {
  const results = [];
  const seen = new Set();
  for (const item of items) {
    const text = String(item?.text || '').trim();
    if (!text) continue;
    const normalized = {
      ...item,
      text,
      kind: item.kind || 'barcode',
      format: item.format || 'Barcode'
    };
    const key = barcodeDedupeKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(normalized);
    if (results.length >= BARCODE_MAX_RESULTS) break;
  }
  return results;
}

async function getNativeBarcodeFormats() {
  const Detector = globalThis.BarcodeDetector;
  if (!Detector) return [];
  if (!barcodeDetectorFormatsPromise) {
    barcodeDetectorFormatsPromise = (async () => {
      try {
        if (typeof Detector.getSupportedFormats !== 'function') return BARCODE_NATIVE_FORMATS;
        const supported = await Detector.getSupportedFormats();
        const supportedSet = new Set((Array.isArray(supported) ? supported : []).map((item) => String(item).toLowerCase()));
        return BARCODE_NATIVE_FORMATS.filter((format) => supportedSet.has(format));
      } catch (error) {
        log('BarcodeDetector formats unavailable', error?.message || error);
        return [];
      }
    })();
  }
  return barcodeDetectorFormatsPromise;
}

async function decodeBarcodeWithNative(sourceCanvas, mode = 'global') {
  const Detector = globalThis.BarcodeDetector;
  if (!Detector) return [];
  const formats = await getNativeBarcodeFormats();
  if (!formats.length) return [];
  const prepared = createBarcodeScanCanvas(sourceCanvas);
  let bitmap = null;
  try {
    const detector = new Detector({ formats });
    try {
      bitmap = await createImageBitmap(prepared.canvas);
    } catch {
      bitmap = null;
    }
    const detected = await withScanTimeout(
      detector.detect(bitmap || prepared.canvas),
      BARCODE_NATIVE_TIMEOUT_MS,
      []
    );
    const items = [];
    for (const result of Array.isArray(detected) ? detected : []) {
      const bounds = scaleBarcodeBounds(
        getNativeBarcodeBounds(result, prepared.canvas.width, prepared.canvas.height),
        prepared.scale,
        sourceCanvas.width,
        sourceCanvas.height
      );
      items.push({
        text: result.rawValue || result.value || '',
        kind: 'barcode',
        mode,
        format: normalizeNativeBarcodeFormat(result.format),
        bounds,
        previewDataUrl: await buildQrPreviewDataUrl(sourceCanvas, bounds),
        source: 'BarcodeDetector'
      });
    }
    return normalizeBarcodeResults(items);
  } catch (error) {
    log('BarcodeDetector decode failed', error?.message || error);
    return [];
  } finally {
    bitmap?.close?.();
  }
}

async function runZxingWorkerDecode(image, options, timeoutMs) {
  try {
    return await decodeBarcodeInOffscreen(image, options, timeoutMs);
  } catch (error) {
    throw createBarcodeError(
      getErrorMessage(error),
      error?.code || 'BARCODE_WORKER_DECODE_FAILED',
      error
    );
  }
}

async function readZxingBarcodesCancelable(image, options) {
  return runZxingWorkerDecode(image, options, BARCODE_WASM_TIMEOUT_MS);
}

async function decodeBarcodeWithZxing(sourceCanvas, mode = 'global') {
  const prepared = createBarcodeScanCanvas(sourceCanvas);
  const ctx = prepared.canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, prepared.canvas.width, prepared.canvas.height);
  try {
    const decoded = await readZxingBarcodesCancelable(
      image,
      {
        formats: BARCODE_ZXING_FORMATS,
        maxNumberOfSymbols: BARCODE_MAX_RESULTS,
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        tryDownscale: true,
        downscaleThreshold: 500,
        downscaleFactor: 2,
        minLineCount: 2,
        binarizer: 'LocalAverage',
        textMode: 'HRI',
        eanAddOnSymbol: 'Ignore',
        returnErrors: false
      }
    );
    const items = [];
    for (const result of Array.isArray(decoded) ? decoded : []) {
      if (result?.isValid === false || result?.error) continue;
      const bounds = scaleBarcodeBounds(
        getZxingBarcodeBounds(result, prepared.canvas.width, prepared.canvas.height),
        prepared.scale,
        sourceCanvas.width,
        sourceCanvas.height
      );
      let previewDataUrl = '';
      try {
        previewDataUrl = await buildQrPreviewDataUrl(sourceCanvas, bounds);
      } catch (error) {
        log('barcode preview build failed', getErrorMessage(error));
      }
      items.push({
        text: result.text || '',
        kind: 'barcode',
        mode,
        format: result.format || result.symbology || 'Barcode',
        bounds,
        previewDataUrl,
        source: 'zxing-wasm'
      });
    }
    return normalizeBarcodeResults(items);
  } catch (error) {
    log('zxing-wasm decode failed', error?.message || error);
    if (error instanceof BarcodeScanError) throw error;
    throw createBarcodeError('zxing-wasm 条码识别失败', 'BARCODE_WASM_DECODE_FAILED', error);
  }
}

async function decodeBarcodeCanvas(sourceCanvas, mode = 'global') {
  const nativeResults = await decodeBarcodeWithNative(sourceCanvas, mode);
  if (nativeResults.length) return nativeResults;
  return decodeBarcodeWithZxing(sourceCanvas, mode);
}

async function decodeScanCanvas(sourceCanvas, mode = 'global') {
  const qrResults = await decodeQrCanvas(sourceCanvas, mode);
  if (qrResults.length) return qrResults;
  return decodeBarcodeCanvas(sourceCanvas, mode);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function canvasToDataUrl(canvas, type = 'image/png') {
  const blob = await canvas.convertToBlob({ type });
  const buffer = await blob.arrayBuffer();
  return `data:${blob.type || type};base64,${arrayBufferToBase64(buffer)}`;
}

async function buildQrPreviewDataUrl(sourceCanvas, box) {
  const area = clampQrBox(box, sourceCanvas.width, sourceCanvas.height);
  const maxSide = 180;
  const scale = Math.min(1, maxSide / Math.max(area.width, area.height));
  const width = Math.max(48, Math.round(area.width * scale));
  const height = Math.max(48, Math.round(area.height * scale));
  const preview = createQrCanvas(width, height);
  const ctx = preview.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sourceCanvas, area.x, area.y, area.width, area.height, 0, 0, width, height);
  return canvasToDataUrl(preview);
}

function maskQrBounds(ctx, box, width, height) {
  const pad = Math.max(12, Math.round(Math.max(box.width, box.height) * 0.18));
  const area = clampQrBox({
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2
  }, width, height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(area.x, area.y, area.width, area.height);
}

async function decodeQrCanvas(sourceCanvas, mode = 'global') {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const workCanvas = createQrCanvas(width, height);
  const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
  workCtx.drawImage(sourceCanvas, 0, 0);

  const results = [];
  const seen = new Set();
  for (let index = 0; index < QR_MAX_RESULTS; index += 1) {
    const image = workCtx.getImageData(0, 0, width, height);
    const decoded = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
    if (!decoded?.data) break;
    const bounds = getQrLocationBounds(decoded.location || {}, width, height);
    const dedupeKey = `${decoded.data}|${Math.round(bounds.x / 8)}:${Math.round(bounds.y / 8)}:${Math.round(bounds.width / 8)}:${Math.round(bounds.height / 8)}`;
    maskQrBounds(workCtx, bounds, width, height);
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push({
      text: decoded.data,
      kind: 'qr',
      format: 'QRCode',
      mode,
      bounds,
      previewDataUrl: await buildQrPreviewDataUrl(sourceCanvas, bounds)
    });
  }
  return results;
}

async function decodeQrInTab({ tabId = 0, windowId = 0, mode = 'global', rect = null, viewport = {} } = {}) {
  if (!tabId || !windowId) return { ok: false, error: '找不到可用标签页' };
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createBitmapFromDataUrl(dataUrl);
  try {
    const area = getQrDecodeArea(bitmap, viewport, rect, mode);
    if (area.width < 12 || area.height < 12) {
      return { ok: false, error: mode === 'capture' ? '截图区域太小，请重新框选。' : '当前可视化区域内未识别到条码。' };
    }
    const cropCanvas = cropBitmapToCanvas(bitmap, area);
    const results = await decodeScanCanvas(cropCanvas, mode);
    if (!results.length) {
      return {
        ok: false,
        error: mode === 'capture' ? '未识别到条码，请放大或重新框选。' : '当前可视化区域内未识别到条码。'
      };
    }
    return {
      ok: true,
      mode,
      count: results.length,
      results
    };
  } finally {
    bitmap.close?.();
  }
}

/**
 * 在 fillInTab 执行期间保持 Service Worker 活跃。
 * MV3 SW 在 30 秒无活动后会被 Chrome 终止，长时间填充会导致响应丢失。
 * 通过每 20 秒向自身 runtime 发一个 ping 心跳来重置计时器。
 */
function startSWKeepalive() {
  let alive = true;
  const tick = () => {
    if (!alive) return;
    chrome.runtime.sendMessage({ type: 'formpilotv2:keepalive-ping' }).catch(() => {});
    setTimeout(tick, 20000);
  };
  setTimeout(tick, 20000);
  return () => { alive = false; };
}

function mergeFillDetails(baseDetail = [], extraDetail = []) {
  const merged = new Map();
  const toKey = (item = {}, index = 0) => {
    if (item?.id) return `id:${item.id}`;
    if (item?.selector) return `sel:${item.selector}`;
    return `idx:${index}`;
  };
  baseDetail.forEach((item, index) => merged.set(toKey(item, index), item));
  extraDetail.forEach((item, index) => merged.set(toKey(item, index + 10000), item));
  return Array.from(merged.values());
}

function mergeFillExecution(baseResult = {}, extraResult = {}) {
  if (!extraResult?.ok) return cloneValue(baseResult || {});
  const merged = cloneValue(baseResult || {});
  const baseFill = merged.fillResult || {};
  const extraFill = extraResult.fillResult || {};
  merged.fillResult = {
    ...baseFill,
    ...extraFill,
    applied: Number(baseFill.applied || 0) + Number(extraFill.applied || 0),
    failed: Number(baseFill.failed || 0) + Number(extraFill.failed || 0),
    detail: mergeFillDetails(baseFill.detail || [], extraFill.detail || [])
  };
  const fields = [...(Array.isArray(merged.detectedFields) ? merged.detectedFields : []), ...(Array.isArray(extraResult.detectedFields) ? extraResult.detectedFields : [])];
  const seen = new Set();
  merged.detectedFields = fields.filter((field) => {
    const key = `${field?.id || ''}|${field?.selector || ''}|${field?.domId || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  merged.values = {
    ...(merged.values || {}),
    ...(extraResult.values || {})
  };
  return merged;
}

async function verifyMissingFieldsInTab(tabId, fields = [], scopeSelector = '', settings = {}) {
  const verifyRes = await sendMessageToTab(tabId, {
    type: 'formpilotv2:verify-fields',
    fields,
    scopeSelector,
    settings
  });
  if (!verifyRes?.ok) {
    return {
      ok: false,
      error: verifyRes?.error || '字段校验失败',
      detail: []
    };
  }
  const detail = Array.isArray(verifyRes.detail) ? verifyRes.detail : [];
  const missingKeys = new Set(
    detail
      .filter((item) => item && item.ok === false)
      .map((item) => item.id)
      .filter(Boolean)
  );
  const missingFields = fields.filter((field) => missingKeys.has(field.id));
  return {
    ok: true,
    detail,
    missingFields
  };
}

const RECHECK_MAX_ROUNDS = 6;
const RECHECK_ROUND_WAIT_MS = 420;
const RECHECK_IDLE_ROUNDS = 3;

function getFieldStableKey(field = {}) {
  return `${normText(field?.id || '')}|${normText(field?.selector || '')}|${normText(field?.domId || '')}`;
}

async function fillWithValidation(tabId, inputFields = [], scopeSelector = '', pathKey = '', options = {}) {
  const runId = getFillRunId(options);
  assertFillNotCancelled(tabId, runId);
  const first = await fillWithPreparedFields(tabId, inputFields, scopeSelector, pathKey, { ...options, runId });
  if (!first?.ok) return first;
  if (!options?.validateAll) {
    return first;
  }
  assertFillNotCancelled(tabId, runId);

  const settings = await getSettings();
  const rounds = [];
  const seenMissing = new Set();
  let merged = cloneValue(first);
  let latestFields = Array.isArray(first.fields) ? first.fields.slice() : [];
  let latestDisplayFields = Array.isArray(first.detectedFields) ? first.detectedFields.slice() : latestFields.slice();
  let latestPathKey = first.pathKey || pathKey || '';
  let firstRoundMissingCount = null;
  let previousMissingCount = Number.POSITIVE_INFINITY;
  let stalledRounds = 0;
  let idleRounds = 0;
  let firstError = '';

  for (let round = 1; round <= RECHECK_MAX_ROUNDS; round += 1) {
    assertFillNotCancelled(tabId, runId);
    await sleep(RECHECK_ROUND_WAIT_MS);
    assertFillNotCancelled(tabId, runId);
    const roundInfo = {
      round,
      rescanned: false,
      retried: false,
      detectedCount: 0,
      missingBefore: 0,
      newMissingCount: 0
    };

    const scanAfter = await scanInTab(tabId, scopeSelector);
    assertFillNotCancelled(tabId, runId);
    if (!scanAfter?.ok) {
      roundInfo.error = scanAfter?.error || '重扫识别失败';
      rounds.push(roundInfo);
      firstError = firstError || roundInfo.error;
      break;
    }

    roundInfo.rescanned = true;
    latestPathKey = scanAfter.pathKey || latestPathKey;
    latestFields = applyFieldFilterBySettings(scanAfter.fields || [], settings).fields;
    latestDisplayFields = applyFieldFilterBySettings(scanAfter.fields || [], settings, { skipOptionalFields: false }).fields;
    roundInfo.detectedCount = latestFields.length;

    const verifyBefore = await verifyMissingFieldsInTab(tabId, latestFields, scopeSelector, settings);
    assertFillNotCancelled(tabId, runId);
    if (!verifyBefore.ok) {
      roundInfo.error = verifyBefore.error || '字段校验失败';
      rounds.push(roundInfo);
      firstError = firstError || roundInfo.error;
      break;
    }

    const missingBefore = Array.isArray(verifyBefore.missingFields) ? verifyBefore.missingFields : [];
    roundInfo.missingBefore = missingBefore.length;
    if (firstRoundMissingCount == null) {
      firstRoundMissingCount = missingBefore.length;
    }
    for (const item of missingBefore) {
      const key = getFieldStableKey(item);
      if (!key || seenMissing.has(key)) continue;
      seenMissing.add(key);
      roundInfo.newMissingCount += 1;
    }

    if (!missingBefore.length) {
      rounds.push(roundInfo);
      idleRounds += 1;
      if (idleRounds >= RECHECK_IDLE_ROUNDS) {
        break;
      }
      continue;
    }
    idleRounds = 0;

    const retry = await fillWithPreparedFields(
      tabId,
      missingBefore,
      scopeSelector,
      latestPathKey || first.pathKey || '',
      {
        skipRuntimeEnsure: true,
        allowLowConfidence: true,
        forceIncludeIds: missingBefore.map((field) => field?.id).filter(Boolean),
        runId
      }
    );
    if (retry?.cancelled) return retry;

    roundInfo.retried = true;
    roundInfo.retryApplied = Number(retry?.fillResult?.applied || 0);
    roundInfo.retryFailed = Number(retry?.fillResult?.failed || 0);
    if (!retry?.ok) {
      roundInfo.error = retry?.error || '补填失败';
      rounds.push(roundInfo);
      firstError = firstError || roundInfo.error;
      break;
    }

    merged = mergeFillExecution(merged, retry);
    rounds.push(roundInfo);

    const madeProgress = roundInfo.newMissingCount > 0 || roundInfo.retryApplied > 0;
    if (!madeProgress && missingBefore.length >= previousMissingCount) {
      stalledRounds += 1;
      if (stalledRounds >= 2) {
        break;
      }
    } else {
      stalledRounds = 0;
    }
    previousMissingCount = missingBefore.length;
  }

  assertFillNotCancelled(tabId, runId);
  const finalScan = await scanInTab(tabId, scopeSelector);
  assertFillNotCancelled(tabId, runId);
  if (finalScan?.ok) {
    latestPathKey = finalScan.pathKey || latestPathKey;
    latestFields = applyFieldFilterBySettings(finalScan.fields || [], settings).fields;
    latestDisplayFields = applyFieldFilterBySettings(finalScan.fields || [], settings, { skipOptionalFields: false }).fields;
  } else if (!firstError) {
    firstError = finalScan?.error || '最终重扫失败';
  }

  let verifyAfter = await verifyMissingFieldsInTab(tabId, latestFields, scopeSelector, settings);
  assertFillNotCancelled(tabId, runId);
  let missingAfterFields = verifyAfter.ok && Array.isArray(verifyAfter.missingFields) ? verifyAfter.missingFields : [];
  for (let finalRound = 1; finalRound <= 2 && missingAfterFields.length; finalRound += 1) {
    assertFillNotCancelled(tabId, runId);
    const roundInfo = {
      round: RECHECK_MAX_ROUNDS + finalRound,
      rescanned: true,
      retried: true,
      detectedCount: latestFields.length,
      missingBefore: missingAfterFields.length,
      newMissingCount: missingAfterFields.length,
      finalRetry: true
    };
    const retry = await fillWithPreparedFields(
      tabId,
      missingAfterFields,
      scopeSelector,
      latestPathKey || first.pathKey || '',
      {
        skipRuntimeEnsure: true,
        allowLowConfidence: true,
        forceIncludeIds: missingAfterFields.map((field) => field?.id).filter(Boolean),
        runId
      }
    );
    if (retry?.cancelled) return retry;
    roundInfo.retryApplied = Number(retry?.fillResult?.applied || 0);
    roundInfo.retryFailed = Number(retry?.fillResult?.failed || 0);
    if (!retry?.ok) {
      roundInfo.error = retry?.error || '最终补填失败';
      rounds.push(roundInfo);
      firstError = firstError || roundInfo.error;
      break;
    }
    merged = mergeFillExecution(merged, retry);
    rounds.push(roundInfo);
    await sleep(RECHECK_ROUND_WAIT_MS);
    assertFillNotCancelled(tabId, runId);

    const scanAfterRetry = await scanInTab(tabId, scopeSelector);
    assertFillNotCancelled(tabId, runId);
    if (scanAfterRetry?.ok) {
      latestPathKey = scanAfterRetry.pathKey || latestPathKey;
      latestFields = applyFieldFilterBySettings(scanAfterRetry.fields || [], settings).fields;
      latestDisplayFields = applyFieldFilterBySettings(scanAfterRetry.fields || [], settings, { skipOptionalFields: false }).fields;
    } else {
      firstError = firstError || scanAfterRetry?.error || '最终补填后重扫失败';
      break;
    }
    verifyAfter = await verifyMissingFieldsInTab(tabId, latestFields, scopeSelector, settings);
    assertFillNotCancelled(tabId, runId);
    missingAfterFields = verifyAfter.ok && Array.isArray(verifyAfter.missingFields) ? verifyAfter.missingFields : [];
  }
  const missingAfter = verifyAfter.ok ? Number(verifyAfter.missingFields?.length || 0) : null;
  if (!verifyAfter.ok && !firstError) {
    firstError = verifyAfter.error || '最终校验失败';
  }

  merged.pathKey = latestPathKey || merged.pathKey || '';
  merged.detectedFields = latestDisplayFields;
  merged.recheck = {
    attempted: true,
    retried: rounds.some((item) => item.retried),
    roundCount: rounds.length,
    rounds,
    missingBefore: firstRoundMissingCount == null ? 0 : firstRoundMissingCount,
    missingAfter,
    verifyFailed: !verifyAfter.ok,
    error: firstError
  };
  return merged;
}

async function fillInTab(tabId, scopeSelector = '', options = {}) {
  const runId = getFillRunId(options);
  const stopKeepalive = startSWKeepalive();
  try {
    assertFillNotCancelled(tabId, runId);
    const scanResult = await scanInTab(tabId, scopeSelector);
    assertFillNotCancelled(tabId, runId);
    if (!scanResult?.ok) return scanResult;
    return await fillWithValidation(
      tabId,
      scanResult.fields || [],
      scopeSelector,
      scanResult.pathKey || '',
      { skipRuntimeEnsure: true, validateAll: true, runId }
    );
  } finally {
    stopKeepalive();
  }
}

async function fillWithPreparedFields(tabId, inputFields = [], scopeSelector = '', pathKey = '', options = {}) {
  const runId = getFillRunId(options);
  assertFillNotCancelled(tabId, runId);
  if (!options?.skipRuntimeEnsure) {
    await ensureRuntimeModules(tabId);
  }
  assertFillNotCancelled(tabId, runId);
  const resolvedPathKey = pathKey || (await getTabPathKey(tabId));
  const store = resolvedPathKey ? await getMappingStore() : {};
  const mappedFields = applyMappingsToFields(inputFields || [], store[resolvedPathKey] || {});
  const settings = await getSettings();
  assertFillNotCancelled(tabId, runId);
  const normalized = detectEngineNormalize(mappedFields);
  const displayFields = applyFieldFilterBySettings(normalized, settings, { skipOptionalFields: false }).fields;
  const filteredNormalized = applyFieldFilterBySettings(normalized, settings).fields;
  const fillPlan = prepareFieldsForFill(filteredNormalized, {
    allowLowConfidence: options?.allowLowConfidence === true,
    forceIncludeIds: Array.isArray(options?.forceIncludeIds) ? options.forceIncludeIds : []
  });
  const fieldsForFill = (fillPlan.fields || []).map((field) => ({
    ...field,
    meta: {
      ...(field.meta || {}),
      pathKey: resolvedPathKey
    }
  }));
  if (settings?.debugLogs) {
    log('填充计划', {
      tabId,
      pathKey: resolvedPathKey,
      scopeSelector: scopeSelector || '(auto)',
      summary: fillPlan.summary || {},
      dropped: (fillPlan.dropped || []).map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.label || '',
        placeholder: item.placeholder || '',
        selector: item.selector || '',
        reason: item.reason || (item.reasons || [])[0] || ''
      }))
    });
  }
  // 根据 provider 设置决定数据来源：LLM 模式或 heuristic（本地 Mock）
  let values;
  const provider = settings.provider || 'heuristic';
  const scopedSettings = { ...settings, currentPathKey: resolvedPathKey };
  if (provider !== 'heuristic' && fieldsForFill.length > 0) {
    try {
      log(`使用 LLM(${provider}) 生成填充值，字段数：${fieldsForFill.length}`);
      const llmValues = await generateValuesWithLLM(fieldsForFill, scopedSettings);
      assertFillNotCancelled(tabId, runId);
      // LLM 返回缺失的字段用 heuristic 补全
      const heuristicValues = generateValues(fieldsForFill, scopedSettings);
      values = {};
      for (const field of fieldsForFill) {
        values[field.id] =
          llmValues[field.id] != null && String(llmValues[field.id]).trim() !== ''
            ? llmValues[field.id]
            : heuristicValues[field.id];
      }
      log(`LLM 生成完成，命中：${Object.keys(llmValues).length}，补全：${fieldsForFill.length - Object.keys(llmValues).length}`);
    } catch (llmErr) {
      log(`LLM 生成失败，已降级到 heuristic：${llmErr.message}`);
      assertFillNotCancelled(tabId, runId);
      values = generateValues(fieldsForFill, scopedSettings);
    }
  } else {
    values = generateValues(fieldsForFill, scopedSettings);
  }
  assertFillNotCancelled(tabId, runId);

  const fillSettings = runId ? { ...settings, fillRunId: runId } : settings;
  const fillResult = await sendMessageToTab(tabId, {
    type: 'formpilotv2:fill',
    fields: fieldsForFill,
    values,
    settings: fillSettings,
    scopeSelector,
    runId
  });
  if (fillResult?.cancelled || isFillCancelled(tabId, runId)) {
    return buildFillCancelledResponse(runId, {
      fillResult: fillResult || null
    });
  }

  if (!fillResult?.ok) {
    if (settings?.debugLogs) {
      log('填充失败', { tabId, pathKey: resolvedPathKey, error: fillResult?.error || '未知错误' });
    }
    return {
      ok: false,
      error: fillResult?.error || '填充失败'
    };
  }

  if (settings?.debugLogs) {
    log('填充结果', {
      tabId,
      pathKey: resolvedPathKey,
      applied: fillResult?.applied || 0,
      failed: fillResult?.failed || 0,
      detail: (fillResult?.detail || []).map((item) => ({
        id: item.id,
        kind: item.kind,
        selector: item.selector || '',
        domId: item.domId || '',
        ok: !!item.ok,
        reason: item.reason || ''
      }))
    });
  }

  await saveMappingsFromFill(resolvedPathKey, filteredNormalized, fillResult?.detail || []);

  const highlightDetail = Array.isArray(fillResult?.detail) ? fillResult.detail.slice() : [];
  const dropped = Array.isArray(fillPlan?.dropped) ? fillPlan.dropped : [];
  for (const field of dropped) {
    highlightDetail.push({
      id: field.id,
      kind: field.kind,
      selector: field.selector,
      domId: field.domId || '',
      ok: false,
      skipped: true,
      reason: '低置信字段，已跳过'
    });
  }
  await sendMessageToTab(tabId, {
    type: 'formpilotv2:show-fill-highlights',
    fields: displayFields,
    detail: highlightDetail,
    autoHideMs: 3000
  }).catch(() => null);

  return {
    ok: true,
    pathKey: resolvedPathKey,
    fields: fieldsForFill,
    detectedFields: displayFields,
    values,
    fillResult,
    fillPlan
  };
}

const PAGINATED_FILL_MAX_PAGES = 12;
const PAGINATED_TRANSITION_WAIT_MS = 5200;
const PAGINATED_TRANSITION_POLL_MS = 520;

function mergeUniqueFields(baseFields = [], extraFields = []) {
  const merged = [];
  const seen = new Set();
  const add = (field = {}) => {
    if (!field || typeof field !== 'object') return;
    const key = [
      normText(field.id || ''),
      normText(field.selector || ''),
      normText(field.domId || ''),
      normText(field.label || ''),
      normText(field.placeholder || '')
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(field);
  };
  (baseFields || []).forEach(add);
  (extraFields || []).forEach(add);
  return merged;
}

function mergeFillPlans(basePlan = {}, extraPlan = {}) {
  const baseSummary = basePlan?.summary || {};
  const extraSummary = extraPlan?.summary || {};
  const sum = (key) => Number(baseSummary[key] || 0) + Number(extraSummary[key] || 0);
  return {
    ...(basePlan || {}),
    ...(extraPlan || {}),
    fields: mergeUniqueFields(basePlan?.fields || [], extraPlan?.fields || []),
    dropped: [...(Array.isArray(basePlan?.dropped) ? basePlan.dropped : []), ...(Array.isArray(extraPlan?.dropped) ? extraPlan.dropped : [])],
    summary: {
      total: sum('total'),
      prepared: sum('prepared'),
      dropped: sum('dropped'),
      corrected: sum('corrected')
    }
  };
}

function mergePaginatedFillResult(aggregate = null, pageResult = {}) {
  if (!aggregate) return cloneValue(pageResult || {});
  const merged = mergeFillExecution(aggregate, pageResult);
  merged.fields = mergeUniqueFields(aggregate.fields || [], pageResult.fields || []);
  merged.detectedFields = mergeUniqueFields(aggregate.detectedFields || [], pageResult.detectedFields || []);
  merged.fillPlan = mergeFillPlans(aggregate.fillPlan || {}, pageResult.fillPlan || {});
  merged.pathKey = pageResult.pathKey || aggregate.pathKey || '';
  return merged;
}

function summarizeActionState(state = {}) {
  if (!state?.ok) return { ok: false, error: state?.error || '' };
  const pick = (item = {}) => ({
    id: item.id || '',
    kind: item.kind || '',
    text: item.text || '',
    type: item.type || '',
    role: item.role || '',
    score: Number(item.score || 0),
    rect: item.rect || null,
    className: item.className || ''
  });
  return {
    ok: true,
    fingerprint: state.fingerprint || '',
    fieldSignature: state.fieldSignature || '',
    actionSignature: state.actionSignature || '',
    pageInfo: state.pageInfo || {},
    actionCount: Array.isArray(state.actions) ? state.actions.length : 0,
    nextCandidates: (state.nextCandidates || []).map(pick),
    prevCandidates: (state.prevCandidates || []).map(pick),
    submitCandidates: (state.submitCandidates || []).map(pick)
  };
}

async function getPageActionStateInTab(tabId) {
  const result = await sendMessageToTab(tabId, { type: 'formpilotv2:get-page-actions' });
  if (!result?.ok) {
    return {
      ok: false,
      error: result?.error || '页面动作识别失败'
    };
  }
  return result;
}

async function clickNextPageActionInTab(tabId) {
  const result = await sendMessageToTab(tabId, {
    type: 'formpilotv2:click-page-action',
    action: 'next'
  });
  if (!result?.ok) {
    return {
      ok: false,
      error: result?.error || '未找到可点击的下一页动作',
      state: result?.state || null
    };
  }
  return result;
}

function hasPageTransitioned(before = {}, after = {}) {
  if (!before?.ok || !after?.ok) return false;
  if (before.url && after.url && before.url !== after.url) return true;
  const beforePage = before.pageInfo || {};
  const afterPage = after.pageInfo || {};
  if (Number(beforePage.current || 0) && Number(afterPage.current || 0) && Number(beforePage.current || 0) !== Number(afterPage.current || 0)) {
    return true;
  }
  if (before.fieldSignature && after.fieldSignature && before.fieldSignature !== after.fieldSignature) {
    return true;
  }
  return false;
}

async function waitForPageTransition(tabId, beforeState = {}, options = {}) {
  const runId = getFillRunId(options);
  const deadline = Date.now() + PAGINATED_TRANSITION_WAIT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    assertFillNotCancelled(tabId, runId);
    await sleep(PAGINATED_TRANSITION_POLL_MS);
    assertFillNotCancelled(tabId, runId);
    latest = await getPageActionStateInTab(tabId);
    if (hasPageTransitioned(beforeState, latest)) {
      return { changed: true, state: latest };
    }
  }
  return { changed: false, state: latest };
}

async function fillPaginatedInTab(tabId, scopeSelector = '', options = {}) {
  const runId = getFillRunId(options);
  const stopKeepalive = startSWKeepalive();
  const pages = [];
  const visited = new Set();
  let aggregate = null;
  let finalActionState = null;
  let stopReason = 'completed';
  let nextInitialState = null;

  try {
    await ensureRuntimeModules(tabId);
    assertFillNotCancelled(tabId, runId);
    for (let pageIndex = 1; pageIndex <= PAGINATED_FILL_MAX_PAGES; pageIndex += 1) {
      assertFillNotCancelled(tabId, runId);
      const beforeActions = nextInitialState?.ok ? nextInitialState : await getPageActionStateInTab(tabId);
      assertFillNotCancelled(tabId, runId);
      nextInitialState = null;
      const visitKey = beforeActions?.ok
        ? `${beforeActions.fieldSignature || beforeActions.fingerprint || ''}|${beforeActions.pageInfo?.current || ''}|${beforeActions.pageInfo?.total || ''}`
        : `page-${pageIndex}`;
      if (visitKey && visited.has(visitKey)) {
        stopReason = 'loop-detected';
        finalActionState = beforeActions;
        break;
      }
      if (visitKey) visited.add(visitKey);

      const scanResult = await scanInTab(tabId, scopeSelector);
      assertFillNotCancelled(tabId, runId);
      if (!scanResult?.ok) {
        if (!aggregate) return scanResult;
        stopReason = 'scan-failed';
        pages.push({
          pageIndex,
          beforeActions: summarizeActionState(beforeActions),
          error: scanResult?.error || '当前页识别失败'
        });
        break;
      }

      const pageResult = await fillWithValidation(
        tabId,
        scanResult.fields || [],
        scopeSelector,
        scanResult.pathKey || '',
        { skipRuntimeEnsure: true, validateAll: true, runId }
      );
      if (pageResult?.cancelled) return pageResult;
      if (!pageResult?.ok) {
        if (!aggregate) return pageResult;
        stopReason = 'fill-failed';
        pages.push({
          pageIndex,
          beforeActions: summarizeActionState(beforeActions),
          detectedCount: Number(scanResult.fields?.length || 0),
          error: pageResult?.error || '当前页填充失败'
        });
        break;
      }

      aggregate = mergePaginatedFillResult(aggregate, pageResult);
      const afterActions = await getPageActionStateInTab(tabId);
      assertFillNotCancelled(tabId, runId);
      finalActionState = afterActions;
      const pageRecord = {
        pageIndex,
        beforeActions: summarizeActionState(beforeActions),
        afterActions: summarizeActionState(afterActions),
        detectedCount: Number(scanResult.fields?.length || 0),
        applied: Number(pageResult.fillResult?.applied || 0),
        failed: Number(pageResult.fillResult?.failed || 0),
        recheck: pageResult.recheck || null
      };
      pages.push(pageRecord);

      if (!afterActions?.ok) {
        stopReason = 'action-detect-failed';
        pageRecord.stopMessage = afterActions?.error || '页面动作识别失败';
        break;
      }

      const current = Number(afterActions.pageInfo?.current || 0);
      const total = Number(afterActions.pageInfo?.total || 0);
      if (total > 0 && current >= total) {
        stopReason = 'submit-page';
        break;
      }

      const nextCandidates = Array.isArray(afterActions.nextCandidates) ? afterActions.nextCandidates : [];
      if (!nextCandidates.length) {
        stopReason = (afterActions.submitCandidates || []).length ? 'submit-page' : 'no-next-action';
        break;
      }

      assertFillNotCancelled(tabId, runId);
      const clickResult = await clickNextPageActionInTab(tabId);
      assertFillNotCancelled(tabId, runId);
      pageRecord.nextClick = clickResult?.ok
        ? {
          ok: true,
          chosen: clickResult.chosen || null
        }
        : {
          ok: false,
          error: clickResult?.error || '下一页点击失败'
        };
      if (!clickResult?.ok) {
        stopReason = 'next-click-failed';
        break;
      }

      const transition = await waitForPageTransition(tabId, afterActions, { runId });
      assertFillNotCancelled(tabId, runId);
      pageRecord.transition = {
        changed: !!transition.changed,
        state: summarizeActionState(transition.state || {})
      };
      if (!transition.changed) {
        stopReason = 'next-blocked';
        pageRecord.stopMessage = '点击下一页后页面没有进入新一页，可能存在当前页校验错误，已停止翻页';
        finalActionState = transition.state || afterActions;
        break;
      }
      nextInitialState = transition.state;
      finalActionState = transition.state;
    }

    if (!aggregate) {
      return {
        ok: false,
        error: '分页填充未产生有效结果',
        pagination: {
          enabled: true,
          pageCount: pages.length,
          stopReason,
          pages,
          finalActions: summarizeActionState(finalActionState || {})
        }
      };
    }
    if (pages.length >= PAGINATED_FILL_MAX_PAGES && stopReason === 'completed') {
      stopReason = 'max-pages-reached';
    }
    aggregate.pagination = {
      enabled: true,
      pageCount: pages.length,
      stopReason,
      pages,
      finalActions: summarizeActionState(finalActionState || {})
    };
    return aggregate;
  } finally {
    stopKeepalive();
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  log('已初始化默认配置');
});

try {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo?.status === 'loading' || changeInfo?.url) {
      clearRuntimeCacheForTab(tabId);
    }
    if (tab?.active) {
      rememberLastWebTab(tabId, tab?.url || changeInfo?.url || '');
    }
  });
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    await rememberLastWebTab(tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => {
    clearRuntimeCacheForTab(tabId);
  });
} catch {
  // ignore
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (!msg?.type) return sendResponse({ ok: false, error: '缺少消息类型' });

    if (msg.type === 'formpilotv2:keepalive-ping') {
      return sendResponse({ ok: true });
    }

    if (msg.type === 'formpilotv2:get-active-tab') {
      const tab = await getActiveTab(Number(msg.tabId || 0));
      return sendResponse({
        ok: true,
        tab: tab ? { id: tab.id, title: tab.title || '', url: tab.url || '' } : null
      });
    }

    if (msg.type === 'formpilotv2:get-settings') {
      const settings = await getSettings();
      return sendResponse({ ok: true, settings });
    }

    if (msg.type === 'formpilotv2:set-settings') {
      const next = mergeSettings(msg.settings || {});
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
      return sendResponse({ ok: true, settings: next });
    }

    if (msg.type === HASHIDS_TRANSFORM_MESSAGE) {
      const settings = await getSettings();
      const project = getEnabledHashidsProject(settings, msg.projectId);
      const result = transformHashids({
        operation: msg.operation,
        value: msg.value,
        salt: project.salt,
        minLength: project.minLength
      });
      return sendResponse({
        ok: true,
        operation: msg.operation,
        result,
        project: { id: project.id, name: project.name }
      });
    }

    if (msg.type === MANUAL_FIELD_LIBRARY_MESSAGES.LIST || msg.type === MANUAL_FIELD_LIBRARY_MESSAGES.LIST_SELF) {
      const store = await getManualFieldLibraryStore();
      const pathKey = (msg.type === MANUAL_FIELD_LIBRARY_MESSAGES.LIST && msg.all)
        ? ''
        : (msg.type === MANUAL_FIELD_LIBRARY_MESSAGES.LIST_SELF
        ? await resolvePathKeyFromMessage(msg, sender)
        : normalizePathKeyInput(msg.pathKey || ''));
      if (pathKey) {
        const bucket = normalizeManualLibraryBucket(store[pathKey], pathKey);
        return sendResponse({
          ok: true,
          pathKey,
          bucket: cloneValue(bucket),
          entries: getManualFieldSummaries(bucket)
        });
      }
      const buckets = Object.entries(store)
        .map(([entryPathKey, bucket]) => {
          const normalizedBucket = normalizeManualLibraryBucket(bucket, entryPathKey);
          return {
            pathKey: entryPathKey,
            meta: cloneValue(normalizedBucket.meta),
            entries: getManualFieldSummaries(normalizedBucket)
          };
        })
        .sort((a, b) => Number(b.meta?.updatedAt || 0) - Number(a.meta?.updatedAt || 0));
      return sendResponse({
        ok: true,
        total: buckets.reduce((sum, bucket) => sum + Number(bucket.meta?.entryCount || 0), 0),
        buckets
      });
    }

    if (msg.type === MANUAL_FIELD_LIBRARY_MESSAGES.SAVE_SELF) {
      const pathKey = await resolvePathKeyFromMessage(msg, sender);
      const result = await saveManualFieldToLibrary(pathKey, msg.field || {});
      return sendResponse(result);
    }

    if (msg.type === MANUAL_FIELD_LIBRARY_MESSAGES.REMOVE) {
      const pathKey = await resolvePathKeyFromMessage(msg, sender);
      const entryId = normText(msg.entryId || msg.id || msg.key || '');
      const result = await removeManualFieldFromLibrary(pathKey, entryId);
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:list-api-templates') {
      const store = await getTemplateStore();
      const templates = Array.isArray(store.api)
        ? store.api.map((item) => hydrateApiTemplate(item))
        : [];
      templates.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
      return sendResponse({ ok: true, templates });
    }

    if (msg.type === 'formpilotv2:save-api-template') {
      const template = msg.template || {};
      const name = String(template.name || '').trim();
      if (!name) return sendResponse({ ok: false, error: '模板名称不能为空' });
      const nextTemplate = {
        ...template,
        name,
        project: normalizeApiProject(template.project),
        environment: normalizeApiEnvironment(template.environment),
        templateCategory: classifyApiTemplate(template)
      };
      const saved = await saveTemplate('api', nextTemplate);
      return sendResponse({
        ok: true,
        template: hydrateApiTemplate(saved)
      });
    }

    if (msg.type === 'formpilotv2:remove-api-template') {
      const templateId = String(msg.templateId || msg.id || msg.name || '').trim();
      if (!templateId) return sendResponse({ ok: false, error: '缺少模板 ID' });
      await removeTemplate('api', templateId);
      return sendResponse({ ok: true });
    }

    if (msg.type === 'formpilotv2:parse-curl') {
      try {
        const parsed = parseCurlCommand(String(msg.curlText || ''));
        return sendResponse({ ok: true, parsed });
      } catch (error) {
        return sendResponse({ ok: false, error: error?.message || String(error) });
      }
    }

    if (msg.type === 'formpilotv2:run-api-template') {
      const store = await getTemplateStore();
      const templateId = String(msg.templateId || msg.id || msg.name || '').trim();
      const template = (store.api || []).find((item) => (item.id || item.name) === templateId);
      if (!template) return sendResponse({ ok: false, error: '找不到指定的 API 模板' });
      const interfaceMap = {};
      for (const item of store.api || []) {
        if (classifyApiTemplate(item) !== 'interface') continue;
        const itemId = normText(item.id || item.name || '');
        if (!itemId) continue;
        const hydrated = hydrateApiTemplate(item);
        interfaceMap[itemId] = hydrated;
        const itemName = normText(item.name || '');
        if (itemName) interfaceMap[itemName] = hydrated;
      }
      const settings = await getSettings();
      const logs = [];
      const params = {
        loopCount: Math.max(1, Number(msg.params?.loopCount || template.loopCount || 1)),
        intervalMs: Math.max(0, Number(msg.params?.intervalMs || template.intervalMs || 0)),
        retryCount: Math.max(0, Number(msg.params?.retryCount || template.retryCount || 0)),
        bodyPatch: msg.params?.bodyPatch || null
      };
      const runtimeVariables = await resolveTemplateVariables(template, settings, 0, {}, (line) => logs.push(String(line)));
      const summary = classifyApiTemplate(template) === 'flow'
        ? await executeApiFlowTemplate(template, {
          settings,
          interfaceMap,
          params,
          onLog: (line) => logs.push(String(line))
        })
        : await executeApiTemplate(template, {
          settings,
          params: {
            ...params,
            variables: runtimeVariables
          },
          onLog: (line) => logs.push(String(line))
        });
      return sendResponse({
        ok: true,
        template: hydrateApiTemplate(template),
        summary,
        logs
      });
    }

    if (msg.type === FIELD_MAPPING_MESSAGES.GET) {
      const tabId = Number(msg.tabId || 0) || (await getActiveTab())?.id;
      if (!tabId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      const pathKey = await getTabPathKey(tabId);
      const store = await getMappingStore();
      const bucket = normalizeBucket(store[pathKey], pathKey);
      return sendResponse({ ok: true, pathKey, mapping: bucket.fields || {}, bucket });
    }

    if (msg.type === FIELD_MAPPING_MESSAGES.GET_SELF) {
      const tabId = sender?.tab?.id;
      if (!tabId) return sendResponse({ ok: false, error: '当前页面无 tab 上下文' });
      const pathKey = await getTabPathKey(tabId);
      const store = await getMappingStore();
      const bucket = normalizeBucket(store[pathKey], pathKey);
      return sendResponse({ ok: true, pathKey, mapping: bucket.fields || {}, bucket });
    }

    if (msg.type === FIELD_MAPPING_MESSAGES.SET) {
      const tabId = Number(msg.tabId || 0) || (await getActiveTab())?.id;
      if (!tabId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      const pathKey = await getTabPathKey(tabId);
      const result = await upsertMapping(pathKey, msg.field || {}, msg.kind || '');
      return sendResponse(result);
    }

    if (msg.type === FIELD_MAPPING_MESSAGES.SET_SELF) {
      const tabId = sender?.tab?.id;
      if (!tabId) return sendResponse({ ok: false, error: '当前页面无 tab 上下文' });
      const pathKey = await getTabPathKey(tabId);
      const result = await upsertMapping(pathKey, msg.field || {}, msg.kind || '');
      return sendResponse(result);
    }

    if (msg.type === FIELD_MAPPING_MESSAGES.LIST_TEMPLATES) {
      const pathKey = await resolvePathKeyFromMessage(msg, sender);
      if (!pathKey) return sendResponse({ ok: false, error: '找不到可用路径' });
      const store = await getMappingStore();
      const bucket = normalizeBucket(store[pathKey], pathKey);
      return sendResponse({
        ok: true,
        pathKey,
        templates: getTemplateSummaries(bucket),
        bucket
      });
    }

    if (msg.type === FIELD_MAPPING_MESSAGES.SAVE_TEMPLATE) {
      const pathKey = await resolvePathKeyFromMessage(msg, sender);
      if (!pathKey) return sendResponse({ ok: false, error: '找不到可用路径' });
      const templateName = msg.templateName || msg.name || '';
      const store = await getMappingStore();
      const bucket = normalizeBucket(store[pathKey], pathKey);
      const result = upsertTemplateInBucket(bucket, templateName, msg.mapping ?? msg.fields ?? {}, 'save');
      if (!result.ok) return sendResponse(result);
      store[pathKey] = result.bucket;
      await saveMappingStore(store);
      return sendResponse({
        ok: true,
        pathKey,
        template: result.template,
        templates: getTemplateSummaries(result.bucket),
        bucket: result.bucket
      });
    }

    if (msg.type === FIELD_MAPPING_MESSAGES.UPDATE_TEMPLATE) {
      const pathKey = await resolvePathKeyFromMessage(msg, sender);
      if (!pathKey) return sendResponse({ ok: false, error: '找不到可用路径' });
      const templateName = msg.templateName || msg.name || '';
      const store = await getMappingStore();
      const bucket = normalizeBucket(store[pathKey], pathKey);
      const result = upsertTemplateInBucket(bucket, templateName, msg.mapping ?? msg.fields ?? bucket.fields, 'update');
      if (!result.ok) return sendResponse(result);
      store[pathKey] = result.bucket;
      await saveMappingStore(store);
      return sendResponse({
        ok: true,
        pathKey,
        template: result.template,
        templates: getTemplateSummaries(result.bucket),
        bucket: result.bucket
      });
    }

    if (msg.type === FIELD_MAPPING_MESSAGES.APPLY_TEMPLATE) {
      const pathKey = await resolvePathKeyFromMessage(msg, sender);
      if (!pathKey) return sendResponse({ ok: false, error: '找不到可用路径' });
      const templateName = msg.templateName || msg.name || '';
      const store = await getMappingStore();
      const bucket = normalizeBucket(store[pathKey], pathKey);
      const result = applyTemplateToBucket(bucket, templateName, { merge: Boolean(msg.merge) });
      if (!result.ok) return sendResponse(result);
      store[pathKey] = result.bucket;
      await saveMappingStore(store);
      return sendResponse({
        ok: true,
        pathKey,
        template: result.template,
        mapping: result.bucket.fields || {},
        bucket: result.bucket
      });
    }

    if (msg.type === 'formpilotv2:cancel-fill' || msg.type === 'formpilotv2:cancel-fill-self') {
      const tabId = msg.type === 'formpilotv2:cancel-fill-self'
        ? sender?.tab?.id
        : (Number(msg.tabId || 0) || sender?.tab?.id || (await getActiveTab())?.id);
      const runId = getFillRunId(msg);
      if (!tabId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      if (!runId) return sendResponse({ ok: false, error: '缺少填充运行 ID' });
      markFillCancelled(tabId, runId);
      await notifyTabFillCancelled(tabId, runId);
      return sendResponse({ ok: true, cancelled: true, runId });
    }

    if (msg.type === 'formpilotv2:scan') {
      const tabId = Number(msg.tabId || 0) || (await getActiveTab())?.id;
      if (!tabId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      const result = await scanInTab(tabId, msg.scopeSelector || '');
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:qr-decode') {
      const tab = Number(msg.tabId || 0) ? await chrome.tabs.get(Number(msg.tabId || 0)) : await getActiveTab();
      if (!tab?.id || !tab.windowId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      const result = await decodeQrInTab({
        tabId: tab.id,
        windowId: tab.windowId,
        mode: msg.mode === 'capture' ? 'capture' : 'global',
        rect: msg.rect || null,
        viewport: msg.viewport || {}
      });
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:qr-decode-self') {
      const tabId = sender?.tab?.id;
      const windowId = sender?.tab?.windowId;
      if (!tabId || !windowId) return sendResponse({ ok: false, error: '当前页面无 tab 上下文' });
      const result = await decodeQrInTab({
        tabId,
        windowId,
        mode: msg.mode === 'capture' ? 'capture' : 'global',
        rect: msg.rect || null,
        viewport: msg.viewport || {}
      });
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:fill') {
      const tabId = Number(msg.tabId || 0) || (await getActiveTab())?.id;
      if (!tabId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      const settings = await getSettings();
      const result = settings.paginateFillEnabled === true
        ? await fillPaginatedInTab(tabId, msg.scopeSelector || '', { runId: getFillRunId(msg) })
        : await fillInTab(tabId, msg.scopeSelector || '', { runId: getFillRunId(msg) });
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:scan-self') {
      const tabId = sender?.tab?.id;
      if (!tabId) return sendResponse({ ok: false, error: '当前页面无 tab 上下文' });
      const result = await scanInTab(tabId, msg.scopeSelector || '');
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:fill-self') {
      const tabId = sender?.tab?.id;
      if (!tabId) return sendResponse({ ok: false, error: '当前页面无 tab 上下文' });
      const settings = await getSettings();
      const result = settings.paginateFillEnabled === true
        ? await fillPaginatedInTab(tabId, msg.scopeSelector || '', { runId: getFillRunId(msg) })
        : await fillInTab(tabId, msg.scopeSelector || '', { runId: getFillRunId(msg) });
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:fill-paginated') {
      const tabId = Number(msg.tabId || 0) || (await getActiveTab())?.id;
      if (!tabId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      const result = await fillPaginatedInTab(tabId, msg.scopeSelector || '', { runId: getFillRunId(msg) });
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:fill-paginated-self') {
      const tabId = sender?.tab?.id;
      if (!tabId) return sendResponse({ ok: false, error: '当前页面无 tab 上下文' });
      const result = await fillPaginatedInTab(tabId, msg.scopeSelector || '', { runId: getFillRunId(msg) });
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:fill-custom') {
      const tabId = Number(msg.tabId || 0) || (await getActiveTab())?.id;
      if (!tabId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      const result = await fillWithValidation(
        tabId,
        msg.fields || [],
        msg.scopeSelector || '',
        '',
        { validateAll: Boolean(msg.validateAll), runId: getFillRunId(msg) }
      );
      return sendResponse(result);
    }

    if (msg.type === 'formpilotv2:fill-custom-self') {
      const tabId = sender?.tab?.id;
      if (!tabId) return sendResponse({ ok: false, error: '当前页面无 tab 上下文' });
      const result = await fillWithValidation(
        tabId,
        msg.fields || [],
        msg.scopeSelector || '',
        '',
        { validateAll: Boolean(msg.validateAll), runId: getFillRunId(msg) }
      );
      return sendResponse(result);
    }

    // 使用预设的 values 直接填充（预览确认流程）
    if (msg.type === 'formpilotv2:fill-with-values-self') {
      const tabId = sender?.tab?.id;
      if (!tabId) return sendResponse({ ok: false, error: '当前页面无 tab 上下文' });
      const settings = await getSettings();
      const runId = getFillRunId(msg);
      const fillResult = await sendMessageToTab(tabId, {
        type: 'formpilotv2:fill',
        fields: msg.fields || [],
        values: msg.values || {},
        settings: runId ? { ...settings, fillRunId: runId } : settings,
        scopeSelector: msg.scopeSelector || '',
        runId
      });
      return sendResponse(fillResult);
    }

    if (msg.type === 'formpilotv2:open-options') {
      await chrome.runtime.openOptionsPage();
      return sendResponse({ ok: true });
    }

    if (msg.type === 'formpilotv2:open-options-anchor') {
      const anchor = normText(msg.anchor || 'dataSection').replace(/[^a-zA-Z0-9_-]/g, '');
      const seed = msg.seed && typeof msg.seed === 'object' ? cloneValue(msg.seed) : null;
      if (seed) {
        await chrome.storage.local.set({ [PENDING_MOCK_RULE_SEED_KEY]: seed });
      } else {
        await chrome.storage.local.remove(PENDING_MOCK_RULE_SEED_KEY);
      }
      await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#${anchor || 'dataSection'}`) });
      return sendResponse({ ok: true, anchor: anchor || 'dataSection' });
    }

    if (msg.type === 'formpilotv2:open-template-center') {
      await chrome.tabs.create({ url: chrome.runtime.getURL('template-center.html') });
      return sendResponse({ ok: true });
    }

    if (msg.type === 'formpilotv2:open-sidepanel') {
      const tabId = sender?.tab?.id || Number(msg.tabId || 0);
      if (!tabId) return sendResponse({ ok: false, error: '缺少 tabId' });
      try {
        await chrome.sidePanel.open({ tabId });
        return sendResponse({ ok: true });
      } catch (error) {
        return sendResponse({
          ok: false,
          error: error?.message || 'sidePanel.open 执行失败'
        });
      }
    }

    // 通过 API 响应变量回填表单
    if (msg.type === 'formpilotv2:fill-from-vars') {
      const tabId = Number(msg.tabId || 0) || (await getActiveTab())?.id;
      if (!tabId) return sendResponse({ ok: false, error: '找不到可用标签页' });
      const fieldMap = msg.fieldMap || {};
      const fields = Object.entries(fieldMap).map(([selector, value]) => ({
        id: `var_${selector}`,
        kind: 'text',
        selector,
        domId: '',
        label: '',
        placeholder: ''
      }));
      const values = Object.fromEntries(
        Object.entries(fieldMap).map(([selector, value]) => [`var_${selector}`, value])
      );
      const settings = await getSettings();
      const runId = getFillRunId(msg);
      const fillResult = await sendMessageToTab(tabId, {
        type: 'formpilotv2:fill',
        fields,
        values,
        settings: runId ? { ...settings, fillRunId: runId } : settings,
        scopeSelector: msg.scopeSelector || '',
        runId
      });
      return sendResponse(fillResult);
    }

    // 测试 LLM 连接
    if (msg.type === 'formpilotv2:test-llm') {
      const settings = await getSettings();
      const result = await testLLMConnection(settings);
      return sendResponse({ ok: result.ok, ...result });
    }

    // 获取已存储的文件列表（供 fill.js 注入 file input）
    if (msg.type === 'formpilotv2:get-file-store') {
      const data = await chrome.storage.local.get('formPilotV2FileStore');
      const category = String(msg.category || '').trim();
      const files = Array.isArray(data.formPilotV2FileStore) ? data.formPilotV2FileStore : [];
      const filtered = category
        ? files.filter((file) => String(file?.category || '').trim() === category)
        : files;
      return sendResponse({ ok: true, files: filtered });
    }

    return sendResponse({ ok: false, error: `未知消息类型: ${msg.type}` });
  })().catch((error) => {
    sendResponse({
      ok: false,
      cancelled: error?.cancelled === true,
      code: error?.code || '',
      runId: error?.runId || getFillRunId(msg || {}),
      error: error?.message || String(error)
    });
  });

  return true;
});
