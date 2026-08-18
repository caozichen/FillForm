(function bootstrapFormPilotV2Agent() {
  if (!window || !document || location.protocol.startsWith('chrome-extension')) return;
  if (window.__formPilotV2AgentLoaded) return;
  window.__formPilotV2AgentLoaded = true;

  const OVERLAY_ID = 'formpilot-v2-fab-root';
  const STYLE_ID = 'formpilot-v2-overlay-style';
  const OVERLAY_POS_KEY = 'formPilotV2OverlayTop';
  const SETTINGS_KEY = 'formPilotV2Settings';
  const PANEL_TAB_VALUES = ['ui', 'qr', 'api', 'crypto'];
  const DEFAULT_VISIBLE_PANEL_TABS = ['ui', 'qr'];
  const HIGHLIGHT_LAYER_ID = 'formpilot-v2-highlight-layer';
  const ACTION_COOLDOWN_MS = 500;
  const MESSAGE_TIMEOUT_MS = 35000;
  const MANUAL_EID_ATTR = 'data-formpilot-v2-eid';
  const state = {
    detectedFields: [],
    manualFields: [],
    lastDetail: [],
    highlightAutoClearTimer: 0,
    manualHoverField: null,
    manualPickEnabled: false,
    manualPickPanelWasOpen: false,
    manualSelectedFieldId: '',
    manualSelectedTimer: 0,
    manualFlowHintShown: false,
    lastManualField: null,
    actionLastAt: {},
    pathKey: '',
    activePanel: 'ui',
    visiblePanelTabs: DEFAULT_VISIBLE_PANEL_TABS.slice(),
    apiTemplates: [],
    apiInterfaces: [],
    apiFlows: [],
    apiDraftSteps: [],
    apiDraftParsed: null,
    apiDraftLogs: [],
    apiInterfaceName: '',
    apiFlowName: '',
    apiRunCount: 0,
    apiRunning: false,
    apiSelectedTemplateId: '',
    apiSelectedInterfaceId: '',
    apiSelectedFlowId: '',
    apiProjectFilter: '__all__',
    apiEnvFilter: '__all__',
    cryptoProjects: [],
    cryptoBusy: false,
    cryptoResult: null,
    cryptoError: '',
    provider: 'heuristic',
    fillOptionalFields: true,
    lastActionDurationMs: 0,
    lastAccuracyPct: 0,
    fillRunId: '',
    fillRunStatus: 'idle',
    fillStopRequested: false,
    cancelledFillRunIds: new Set(),
    qrItems: [],
    qrBusy: false,
    qrLightbox: null,
    qrNotice: ''
  };

  const KIND_OPTIONS = [
    { value: 'text', label: '文本' },
    { value: 'companyName', label: '企业名称' },
    { value: 'companyId', label: '企业编号/登记号' },
    { value: 'fullName', label: '姓名' },
    { value: 'firstName', label: '名字' },
    { value: 'lastName', label: '姓氏' },
    { value: 'email', label: '邮箱' },
    { value: 'verification', label: '验证码' },
    { value: 'phone', label: '手机号' },
    { value: 'tel', label: '固定电话' },
    { value: 'idcard', label: '证件号' },
    { value: 'number', label: '数字' },
    { value: 'bankCard', label: '银行卡号' },
    { value: 'date', label: '日期' },
    { value: 'jobTitle', label: '职位' },
    { value: 'select', label: '下拉选择' },
    { value: 'radioGroup', label: '单选组' },
    { value: 'checkboxGroup', label: '多选组' },
    { value: 'addressComponent', label: '地址组件' },
    { value: 'addressDetail', label: '地址明细' },
    { value: 'file', label: '文件上传' }
  ];

  const KIND_LABEL_MAP = Object.fromEntries(KIND_OPTIONS.map((x) => [x.value, x.label]));
  const API_ENV_OPTIONS = [
    { value: 'dev', label: '开发' },
    { value: 'test', label: '测试' },
    { value: 'staging', label: '预发' },
    { value: 'prod', label: '生产' }
  ];
  const API_ENV_LABEL_MAP = Object.fromEntries(API_ENV_OPTIONS.map((item) => [item.value, item.label]));

  function normText(input) {
    return String(input || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function createFillRunId() {
    return `fill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function rememberCancelledFillRun(runId = '') {
    const normalized = normText(runId);
    if (!normalized) return;
    state.cancelledFillRunIds.add(normalized);
    while (state.cancelledFillRunIds.size > 50) {
      const first = state.cancelledFillRunIds.values().next().value;
      state.cancelledFillRunIds.delete(first);
    }
  }

  function isFillRunCancelled(runId = '') {
    const normalized = normText(runId);
    if (!normalized) return false;
    return state.cancelledFillRunIds.has(normalized) || (state.fillRunId === normalized && state.fillStopRequested === true);
  }

  function buildFillCancelledResponse(runId = '') {
    return {
      ok: false,
      cancelled: true,
      runId: normText(runId),
      error: '本次填充已停止'
    };
  }

  const formPilotV2Utils = window.FormPilotV2Utils || (window.FormPilotV2Utils = {});
  formPilotV2Utils.isFillRunCancelled = (runId = '') => isFillRunCancelled(runId);

  function normalizeApiProject(value = '') {
    const normalized = normText(value);
    if (!normalized || normalized === '__all__') return '默认项目';
    return normalized;
  }

  function normalizeApiEnv(value = '') {
    const normalized = normText(value || '').toLowerCase();
    if (!normalized || normalized === '__all__') return 'test';
    if (API_ENV_LABEL_MAP[normalized]) return normalized;
    return 'test';
  }

  function getApiEnvLabel(value = '') {
    const key = normalizeApiEnv(value);
    return API_ENV_LABEL_MAP[key] || API_ENV_LABEL_MAP.test;
  }

  function normalizeRectLike(input) {
    if (!input || typeof input !== 'object') return null;
    const x = Number(input.x ?? input.left);
    const y = Number(input.y ?? input.top);
    const w = Number(input.w ?? input.width);
    const h = Number(input.h ?? input.height);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return {
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h)
    };
  }

  function serializeRectLike(input) {
    const rect = normalizeRectLike(input);
    if (!rect) return '';
    return `${rect.x}:${rect.y}:${rect.w}:${rect.h}`;
  }

  function getFieldRect(field) {
    return (
      normalizeRectLike(field?.meta?.manualRect) ||
      normalizeRectLike(field?.meta?.rect) ||
      normalizeRectLike(field?.meta?.boundingRect) ||
      normalizeRectLike(field?.meta?.box) ||
      normalizeRectLike(field?.rect) ||
      normalizeRectLike(field?.geometry) ||
      null
    );
  }

  function inferAddressSectionVariant(text = '') {
    const hint = normText(text);
    if (!hint) return '';
    if (/(英文|英語|english|\(英\)|（英）|_en\b|\ben\b)/i.test(hint)) return 'en';
    if (/(中文|简体|繁體|繁体|中文地址|\(中\)|（中）|_cn\b|\bcn\b)/i.test(hint)) return 'zh';
    return '';
  }

  function describeRect(rect) {
    const normalized = normalizeRectLike(rect);
    if (!normalized) return '';
    return `${normalized.x},${normalized.y},${normalized.w}×${normalized.h}`;
  }

  function getFieldIdentityParts(field) {
    return {
      domId: normText(field?.domId || ''),
      selector: normText(field?.selector || ''),
      containerSelector: normText(field?.containerSelector || ''),
      label: normText(field?.label || ''),
      placeholder: normText(field?.placeholder || ''),
      context: normText(field?.context || '').slice(0, 120),
      detailSelector: normText(field?.meta?.detailSelector || ''),
      sectionVariant: normText(field?.meta?.sectionVariant || field?.meta?.variant || ''),
      geometry: serializeRectLike(getFieldRect(field)),
      comboDomIds: Array.isArray(field?.meta?.comboboxDomIds) ? field.meta.comboboxDomIds.map((item) => normText(item)).filter(Boolean).join(',') : '',
      segmentDomIds: Array.isArray(field?.meta?.segmentDomIds) ? field.meta.segmentDomIds.map((item) => normText(item)).filter(Boolean).join(',') : ''
    };
  }

  function buildFieldIdentity(field) {
    const parts = getFieldIdentityParts(field);
    if (parts.domId) return `dom:${parts.domId}`;
    return [
      parts.selector && `sel:${parts.selector}`,
      parts.containerSelector && `container:${parts.containerSelector}`,
      parts.detailSelector && `detail:${parts.detailSelector}`,
      parts.sectionVariant && `variant:${parts.sectionVariant}`,
      parts.geometry && `geo:${parts.geometry}`,
      parts.label && `label:${parts.label}`,
      parts.context && `ctx:${parts.context}`,
      parts.placeholder && `ph:${parts.placeholder}`,
      parts.comboDomIds && `combo:${parts.comboDomIds}`,
      parts.segmentDomIds && `segment:${parts.segmentDomIds}`
    ]
      .filter(Boolean)
      .join('|');
  }

  function isSameRect(a, b, tolerance = 10) {
    const rectA = normalizeRectLike(a);
    const rectB = normalizeRectLike(b);
    if (!rectA || !rectB) return false;
    const dx = Math.abs(rectA.x - rectB.x);
    const dy = Math.abs(rectA.y - rectB.y);
    const dw = Math.abs(rectA.w - rectB.w);
    const dh = Math.abs(rectA.h - rectB.h);
    return dx <= tolerance && dy <= tolerance && dw <= tolerance && dh <= tolerance;
  }

  function buildDuplicateEvidence(candidate, field, matchedBy = []) {
    const evidence = [];
    const candidateParts = getFieldIdentityParts(candidate);
    const fieldParts = getFieldIdentityParts(field);
    const candidateRect = getFieldRect(candidate);
    const fieldRect = getFieldRect(field);

    if (candidateParts.domId && fieldParts.domId && candidateParts.domId === fieldParts.domId) {
      evidence.push(`同一 domId ${candidateParts.domId}`);
    }
    if (matchedBy.includes('selector')) evidence.push('选择器一致');
    if (matchedBy.includes('container')) evidence.push('容器上下文一致');
    if (matchedBy.includes('detail')) evidence.push('地址分组一致');
    if (matchedBy.includes('variant')) evidence.push('中/英区分标记一致');
    if (matchedBy.includes('geometry')) {
      evidence.push(
        `几何位置接近${
          candidateRect && fieldRect ? `（${describeRect(candidateRect)} / ${describeRect(fieldRect)}）` : ''
        }`
      );
    }
    if (matchedBy.includes('label') && candidateParts.label && fieldParts.label) evidence.push(`标签一致：${candidateParts.label}`);
    if (matchedBy.includes('placeholder') && candidateParts.placeholder && fieldParts.placeholder) evidence.push(`占位提示一致：${candidateParts.placeholder}`);
    return evidence.filter(Boolean).join('；');
  }

  function pickActionTooFast(action) {
    const now = Date.now();
    const last = Number(state.actionLastAt[action] || 0);
    if (now - last < ACTION_COOLDOWN_MS) return true;
    state.actionLastAt[action] = now;
    return false;
  }

  function withTimeout(promise, timeoutMs, label) {
    let timer = 0;
    const timeoutPromise = new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(`${label || '请求'}超时，请重试`));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  async function sendRuntimeMessage(payload, timeoutMs = MESSAGE_TIMEOUT_MS, label = '请求') {
    if (!isRuntimeAvailable()) {
      throw new Error('扩展上下文不可用，请刷新页面后重试');
    }
    return withTimeout(chrome.runtime.sendMessage(payload), timeoutMs, label);
  }

  function isRuntimeAvailable() {
    try {
      return !!(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function isContextInvalidatedError(error) {
    return /Extension context invalidated/i.test(String(error?.message || error || ''));
  }

  function appendStatus(panel, text) {
    const box = panel.querySelector('.formpilot-v2-status');
    if (!box) return;
    const line = `[${new Date().toLocaleTimeString()}] ${text}`;
    box.textContent = `${line}\n${box.textContent}`.trim();
  }

  function setMetric(panel, metric, value) {
    const nodes = panel.querySelectorAll(`[data-metric="${metric}"]`);
    nodes.forEach((node) => {
      node.textContent = String(value);
    });
    if (metric === 'filled') {
      const percentText = String(value || '0%');
      const percent = Number.parseFloat(percentText) || 0;
      const bar = panel.querySelector('[data-role="success-bar"]');
      if (bar instanceof HTMLElement) {
        bar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      }
    }
  }

  function setBadge(panel, text, tone = 'normal') {
    const node = panel.querySelector('.formpilot-v2-badge');
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone;
  }

  function buildFieldDisplayTitle(field = {}) {
    const candidates = [
      field.label,
      field.placeholder,
      field.meta?.sectionHint,
      field.meta?.fieldHint,
      field.selector,
      field.id
    ];
    for (const item of candidates) {
      const normalized = normText(item);
      if (normalized) return normalized;
    }
    return '(未命名字段)';
  }

  function shortenText(text, max = 34) {
    const value = normText(text);
    if (!value || value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  function buildFieldSecondaryText(field = {}, fieldDetail = null) {
    const kindLabel = KIND_LABEL_MAP[field.kind] || '文本';
    const parts = [`类型：${kindLabel}`];
    if (field.domId) {
      parts.push(`ID：${field.domId}`);
    } else if (field.id) {
      parts.push(`字段：${field.id.replace(/^manual_/, '')}`);
    }

    if (fieldDetail?.manualAdded) parts.push('已写入手动字段库');
    else if (fieldDetail?.manualSelected) parts.push('刚刚补点');
    else if (fieldDetail?.skipped) parts.push('低置信跳过');
    else if (fieldDetail?.ok === false) parts.push('未成功填充');
    else if (fieldDetail?.ok === true) parts.push('可直接填充');
    else if (field.selector) parts.push(shortenText(field.selector, 22));

    return parts.filter(Boolean).join(' · ');
  }

  function buildFieldGlyph(field = {}) {
    const map = {
      companyName: '⌂',
      companyId: '#',
      fullName: '人',
      firstName: '姓',
      lastName: '名',
      email: '✉',
      verification: '码',
      phone: '☎',
      tel: '☎',
      bankCard: '卡',
      date: '日',
      jobTitle: '职',
      select: '▾',
      radioGroup: '◉',
      checkboxGroup: '☑',
      addressComponent: '⌘',
      addressDetail: '⌘',
      file: '⇪'
    };
    return map[field.kind] || '•';
  }

  function buildFieldStatusChip(fieldDetail = null) {
    if (fieldDetail?.manualSelected) return { text: '已选中', tone: 'manual-selected' };
    if (fieldDetail?.manualAdded) return { text: '手动添加', tone: 'manual-added' };
    if (fieldDetail?.skipped) return { text: '待处理', tone: 'warning' };
    if (fieldDetail?.ok === false) return { text: '未填充', tone: 'error' };
    if (fieldDetail?.ok === true) return { text: '已填充', tone: 'success' };
    return { text: '已识别', tone: 'idle' };
  }

  function formatActionDuration(value = 0) {
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num <= 0) return '--';
    if (num < 10) return `${num.toFixed(1)}ms`;
    if (num < 1000) return `${Math.round(num)}ms`;
    return `${(num / 1000).toFixed(1)}s`;
  }

  function updateInsightMetrics(panel, fields = [], detail = []) {
    const detailRows = Array.isArray(detail) ? detail.filter((item) => item && item.id) : [];
    let accuracy = Number(state.lastAccuracyPct || 0);
    if (detailRows.length) {
      const effective = detailRows.filter((item) => !item.manualSelected && !item.manualHover);
      const total = effective.length;
      const success = effective.filter((item) => item.ok === true).length;
      if (total > 0) accuracy = (success / total) * 100;
    } else if (fields.length) {
      const confidences = fields
        .map((field) => Number(field.confidence || field.score || 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (confidences.length) {
        accuracy = (confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100;
      }
    }
    state.lastAccuracyPct = accuracy;
    setMetric(panel, 'responseMs', formatActionDuration(state.lastActionDurationMs));
    setMetric(panel, 'accuracyPct', accuracy > 0 ? `${accuracy.toFixed(1)}%` : '--');
    const bar = panel.querySelector('[data-metric="accuracyBar"]');
    if (bar instanceof HTMLElement) {
      bar.style.width = accuracy > 0 ? `${Math.max(8, Math.min(100, accuracy))}%` : '0%';
    }
  }

  function renderFieldList(panel, fields = [], values = {}, detail = []) {
    const list = panel.querySelector('.formpilot-v2-field-list');
    if (!list) return;

    const detailMap = new Map((detail || []).map((item) => [item.id, item]));
    list.innerHTML = '';

    if (!fields.length) {
      const item = document.createElement('li');
      item.className = 'formpilot-v2-field-item empty';
      item.innerHTML = `
        <div class="formpilot-v2-field-empty-copy">
          <div class="formpilot-v2-field-empty-title">暂无识别结果</div>
          <div class="formpilot-v2-field-empty-sub">点击“识别字段”后会在这里展示当前页字段。</div>
        </div>
      `;
      list.appendChild(item);
      return;
    }

    for (const field of fields) {
      const item = document.createElement('li');
      item.className = 'formpilot-v2-field-item';
      const fieldDetail = detailMap.get(field.id);
      item.dataset.status = fieldDetail
        ? (
            fieldDetail.manualSelected
              ? 'manual-selected'
              : (
            fieldDetail.manualAdded
              ? 'manual-added'
              : (fieldDetail.skipped ? 'warning' : (fieldDetail.ok ? 'success' : 'error'))
              )
          )
        : 'idle';
      const glyph = document.createElement('div');
      glyph.className = 'formpilot-v2-field-glyph formpilot-v2-field-iconbox';
      glyph.dataset.tone = item.dataset.status;
      glyph.textContent = buildFieldGlyph(field);

      const copy = document.createElement('div');
      copy.className = 'formpilot-v2-field-copy';

      const title = document.createElement('div');
      title.className = 'formpilot-v2-field-main formpilot-v2-field-title';
      title.textContent = buildFieldDisplayTitle(field);

      const meta = document.createElement('div');
      meta.className = 'formpilot-v2-field-sub formpilot-v2-field-subtitle';
      meta.textContent = buildFieldSecondaryText(field, fieldDetail);

      copy.append(title, meta);

      const chip = document.createElement('span');
      chip.className = 'formpilot-v2-field-state-icon formpilot-v2-field-status-pill';
      const statusChip = buildFieldStatusChip(fieldDetail);
      chip.dataset.tone = statusChip.tone;
      chip.textContent = statusChip.text;

      item.append(glyph, copy, chip);

      list.appendChild(item);
    }
  }

  function setBusy(panel, busy) {
    const controls = panel.querySelectorAll(
      '.formpilot-v2-action-btn, .formpilot-v2-tool-btn, .formpilot-v2-nav-btn, .formpilot-v2-mini-btn, .formpilot-v2-kind-select, .formpilot-v2-template-select, .formpilot-v2-source-select, .formpilot-v2-api-source-select, .formpilot-v2-api-run-select, .formpilot-v2-text-input, .formpilot-v2-textarea'
    );
    const fillButton = getFillButton(panel);
    const fillState = panel.dataset.fillState || state.fillRunStatus || 'idle';
    controls.forEach((node) => {
      if (node instanceof HTMLButtonElement || node instanceof HTMLSelectElement) {
        if (node === fillButton && (fillState === 'running' || fillState === 'stopping')) {
          node.disabled = fillState === 'stopping';
          return;
        }
        node.disabled = busy;
      }
    });
    panel.dataset.busy = busy ? 'true' : 'false';
  }

  function getFillButton(panel) {
    if (!(panel instanceof HTMLElement)) return null;
    return panel.querySelector('[data-role="fill-action"]') || panel.querySelector('[data-action="fill"], [data-action="fill-stop"]');
  }

  function setFillButtonState(panel, status = 'idle') {
    const button = getFillButton(panel);
    if (!(button instanceof HTMLButtonElement)) return;
    const states = {
      idle: {
        action: 'fill',
        icon: '⚡',
        label: '一键智能填充',
        disabled: false
      },
      starting: {
        action: 'fill',
        icon: '⚡',
        label: '启动中',
        disabled: true
      },
      running: {
        action: 'fill-stop',
        icon: '■',
        label: '停止填充',
        disabled: false
      },
      stopping: {
        action: 'fill-stop',
        icon: '■',
        label: '停止中',
        disabled: true
      }
    };
    const next = states[status] || states.idle;
    state.fillRunStatus = states[status] ? status : 'idle';
    panel.dataset.fillState = state.fillRunStatus;
    button.dataset.action = next.action;
    button.disabled = next.disabled;
    button.setAttribute('aria-label', next.label);
    button.title = next.label;
    const icon = button.querySelector('.formpilot-v2-action-icon');
    if (icon) icon.textContent = next.icon;
    const label = button.querySelector('.formpilot-v2-action-label') || button.querySelector('.formpilot-v2-action-icon + span');
    if (label) label.textContent = next.label;
  }

  async function requestStopFill(panel) {
    const runId = normText(state.fillRunId || '');
    if (!runId) {
      setFillButtonState(panel, 'idle');
      appendStatus(panel, '当前没有正在执行的一键填充');
      return;
    }
    if (state.fillRunStatus === 'stopping') return;
    state.fillStopRequested = true;
    rememberCancelledFillRun(runId);
    setFillButtonState(panel, 'stopping');
    setBadge(panel, '停止中', 'progress');
    appendStatus(panel, '正在停止本次填充...');
    try {
      const res = await sendRuntimeMessage(
        { type: 'formpilotv2:cancel-fill-self', runId },
        10000,
        '停止填充'
      );
      if (!res?.ok) {
        if (state.fillRunId === runId) {
          appendStatus(panel, `停止请求返回异常：${res?.error || '未知错误'}，本页填充循环已尝试停止`);
        }
        return;
      }
      if (state.fillRunId === runId) appendStatus(panel, '已发送停止指令，正在结束本次填充...');
    } catch (error) {
      if (state.fillRunId === runId) {
        appendStatus(panel, `停止请求发送失败：${error?.message || error}，本页填充循环已尝试停止`);
      }
    }
  }

  function updateMissingBlock(panel, fields = [], detail = []) {
    const countNode = panel.querySelector('.formpilot-v2-missing-count');
    const listNode = panel.querySelector('.formpilot-v2-missing-list');
    if (!countNode || !listNode) return;

    const explainText = '这里展示的是已识别但未成功填充的字段，通常来自低置信跳过、值缺失或未命中可写入控件。';
    countNode.title = explainText;
    listNode.title = explainText;

    const detailMap = new Map((detail || []).map((item) => [item.id, item]));
    const missing = [];
    for (const field of fields) {
      const row = detailMap.get(field.id);
      if (!row) continue;
      if (row.ok === true) continue;
      const title = field.label || field.placeholder || field.kind || field.selector || field.id;
      missing.push(title);
      if (missing.length >= 5) break;
    }

    countNode.textContent = missing.length ? `待补字段 ${missing.length} 个` : '待补字段 0 个';
    listNode.textContent = missing.length ? missing.join('，') : '当前页字段已基本完成匹配';
  }

  function getProviderLabel(provider = '') {
    switch (provider) {
      case 'deepseek':
        return 'DeepSeek';
      case 'openai':
        return 'OpenAI';
      case 'zhipu':
        return 'Zhipu GLM';
      case 'heuristic':
      default:
        return '本地 MOCK';
    }
  }

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

  function applyActivePanel(panel, nextPanel = 'ui') {
    const visiblePanels = normalizeVisiblePanelTabs(state.visiblePanelTabs);
    const visibleSet = new Set(visiblePanels);
    const previousPanel = state.activePanel;
    state.activePanel = visibleSet.has(nextPanel) ? nextPanel : visiblePanels[0];
    if (panel instanceof HTMLElement) {
      panel.dataset.activePanel = state.activePanel;
      panel.dataset.visiblePanels = visiblePanels.join(',');
    }
    const panelBodies = panel.querySelectorAll('[data-panel-body]');
    panelBodies.forEach((body) => {
      const panelName = body.getAttribute('data-panel-body') || '';
      const active = panelName === state.activePanel && visibleSet.has(panelName);
      body.hidden = !active;
      if (body instanceof HTMLElement) {
        body.style.display = active ? '' : 'none';
      }
    });
    const tabs = panel.querySelectorAll('[data-panel-tab]');
    tabs.forEach((tab) => {
      const panelName = tab.getAttribute('data-panel-tab') || '';
      const visible = visibleSet.has(panelName);
      const active = visible && panelName === state.activePanel;
      tab.classList.toggle('active', active);
      if (active) {
        tab.setAttribute('data-active', 'true');
      } else {
        tab.removeAttribute('data-active');
      }
      tab.hidden = !visible;
      if (tab instanceof HTMLElement) {
        tab.style.display = visible ? '' : 'none';
        tab.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }
      if (tab instanceof HTMLButtonElement) {
        tab.disabled = !visible;
      }
    });
    const footerNav = panel.querySelector('.formpilot-v2-footer-nav');
    if (footerNav instanceof HTMLElement) {
      footerNav.style.gridTemplateColumns = `repeat(${visiblePanels.length}, minmax(0, 1fr))`;
    }
    return previousPanel !== state.activePanel;
  }

  function applyVisiblePanelTabs(panel, rawTabs = DEFAULT_VISIBLE_PANEL_TABS) {
    state.visiblePanelTabs = normalizeVisiblePanelTabs(rawTabs);
    return applyActivePanel(panel, state.activePanel);
  }

  function normalizeCryptoProjects(rawConfig = {}) {
    const projects = Array.isArray(rawConfig?.projects) ? rawConfig.projects : [];
    const enabledIds = new Set((Array.isArray(rawConfig?.selectedProjectIds) ? rawConfig.selectedProjectIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean));
    return projects
      .map((project) => ({
        id: String(project?.id || '').trim(),
        name: String(project?.name || '').trim()
      }))
      .filter((project) => project.id && project.name && enabledIds.has(project.id));
  }

  function renderCryptoPanel(panel, rawConfig = null) {
    const select = panel.querySelector('[data-role="crypto-project-select"]');
    if (!(select instanceof HTMLSelectElement)) return;
    const previousValue = select.value || '';
    state.cryptoProjects = rawConfig ? normalizeCryptoProjects(rawConfig) : state.cryptoProjects;

    select.innerHTML = '';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '请选择项目';
    select.appendChild(emptyOption);

    for (const project of state.cryptoProjects) {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      select.appendChild(option);
    }

    const hasPrevious = state.cryptoProjects.some((project) => project.id === previousValue);
    select.value = hasPrevious ? previousValue : '';
    renderCryptoResult(panel);
    setCryptoBusy(panel, state.cryptoBusy);
  }

  function setCryptoBusy(panel, busy) {
    state.cryptoBusy = !!busy;
    panel.querySelectorAll('[data-action="crypto-decrypt"], [data-action="crypto-encrypt"]').forEach((node) => {
      if (node instanceof HTMLButtonElement) {
        node.disabled = state.cryptoBusy || panel.dataset.busy === 'true';
      }
    });
    const output = panel.querySelector('[data-role="crypto-output"]');
    if (output instanceof HTMLElement) {
      output.setAttribute('aria-busy', state.cryptoBusy ? 'true' : 'false');
    }
  }

  function renderCryptoResult(panel) {
    const output = panel.querySelector('[data-role="crypto-output"]');
    if (!(output instanceof HTMLElement)) return;
    output.innerHTML = '';

    if (state.cryptoBusy) {
      const busy = document.createElement('div');
      busy.className = 'formpilot-v2-crypto-message';
      busy.textContent = '正在处理...';
      output.appendChild(busy);
      return;
    }

    if (state.cryptoError) {
      const error = document.createElement('div');
      error.className = 'formpilot-v2-crypto-message';
      error.dataset.tone = 'error';
      error.textContent = state.cryptoError;
      output.appendChild(error);
      return;
    }

    if (!state.cryptoResult) {
      const empty = document.createElement('div');
      empty.className = 'formpilot-v2-qr-empty formpilot-v2-crypto-empty';
      empty.innerHTML = '<span class="formpilot-v2-crypto-empty-icon" aria-hidden="true">🔑</span><strong>暂无加解密结果</strong>';
      output.appendChild(empty);
      return;
    }

    const card = document.createElement('div');
    card.className = 'formpilot-v2-crypto-result-card';

    const head = document.createElement('div');
    head.className = 'formpilot-v2-crypto-result-head';
    const title = document.createElement('strong');
    title.textContent = state.cryptoResult.operation === 'encrypt' ? '加密结果' : '解密结果';
    const project = document.createElement('span');
    project.textContent = state.cryptoResult.projectName;
    head.append(title, project);

    const value = document.createElement('pre');
    value.className = 'formpilot-v2-crypto-result-value';
    value.textContent = state.cryptoResult.value;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'formpilot-v2-mini-btn formpilot-v2-crypto-copy-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = '复制结果';
    copyBtn.addEventListener('click', async () => {
      const copied = await copyQrText(state.cryptoResult?.value || '');
      copyBtn.textContent = copied ? '已复制' : '复制失败';
      window.setTimeout(() => { copyBtn.textContent = '复制结果'; }, 1400);
    });

    card.append(head, value, copyBtn);
    output.appendChild(card);
  }

  function formatCryptoFailure(operation, reason) {
    return `${operation === 'encrypt' ? '加密' : '解密'}失败，原因是：${reason || '未知错误'}`;
  }

  function revealCryptoOutput(panel) {
    const output = panel.querySelector('[data-role="crypto-output"]');
    if (!(output instanceof HTMLElement)) return;
    window.requestAnimationFrame(() => {
      const panelRect = panel.getBoundingClientRect();
      const outputRect = output.getBoundingClientRect();
      const target = panel.scrollTop + outputRect.top - panelRect.top - 12;
      panel.scrollTop = Math.max(0, target);
    });
  }

  async function runCryptoTransform(panel, root, operation) {
    if (state.cryptoBusy) return;

    const select = panel.querySelector('[data-role="crypto-project-select"]');
    const input = panel.querySelector('[data-role="crypto-value-input"]');
    const projectId = select instanceof HTMLSelectElement ? select.value : '';
    const value = input instanceof HTMLInputElement ? input.value.trim() : '';
    const projectName = state.cryptoProjects.find((item) => item.id === projectId)?.name || '';

    state.cryptoError = '';
    state.cryptoResult = null;
    if (!projectId) state.cryptoError = formatCryptoFailure(operation, '请先选择项目');
    else if (!value) state.cryptoError = formatCryptoFailure(operation, '请输入要加解的内容');
    if (state.cryptoError) {
      renderCryptoResult(panel);
      revealCryptoOutput(panel);
      setBadge(panel, '参数不完整', 'warning');
      return;
    }

    setCryptoBusy(panel, true);
    renderCryptoResult(panel);
    revealCryptoOutput(panel);
    setBadge(panel, operation === 'encrypt' ? '正在加密' : '正在解密', 'progress');
    try {
      const response = await sendRuntimeMessage({
        type: 'formpilotv2:hashids-transform',
        operation,
        projectId,
        value
      }, 10000, operation === 'encrypt' ? '数据加密' : '数据解密');
      if (!response?.ok) throw new Error(response?.error || '操作失败');

      state.cryptoResult = {
        operation,
        projectName: response.project?.name || projectName,
        value: String(response.result ?? '')
      };
      setBadge(panel, operation === 'encrypt' ? '加密完成' : '解密完成', 'success');
      appendStatus(panel, `${operation === 'encrypt' ? '数据加密' : '数据解密'}完成：${state.cryptoResult.projectName}`);
    } catch (error) {
      if (isContextInvalidatedError(error)) {
        markContextInvalidated(panel, root);
        return;
      }
      state.cryptoError = formatCryptoFailure(operation, error?.message || String(error));
      setBadge(panel, operation === 'encrypt' ? '加密失败' : '解密失败', 'warning');
      appendStatus(panel, state.cryptoError);
    } finally {
      setCryptoBusy(panel, false);
      renderCryptoResult(panel);
      revealCryptoOutput(panel);
    }
  }

  function renderProviderSelect(panel, provider = 'heuristic') {
    const providerValue = ['heuristic', 'deepseek', 'openai', 'zhipu'].includes(provider) ? provider : 'heuristic';
    const selects = panel.querySelectorAll('.formpilot-v2-source-select');
    selects.forEach((select) => {
      if (select instanceof HTMLSelectElement) {
        select.value = providerValue;
      }
    });
    setMetric(panel, 'providerText', getProviderLabel(provider));
  }

  function classifyApiTemplate(template = {}) {
    if (String(template?.templateCategory || template?.kind || '').toLowerCase() === 'flow') return 'flow';
    if (Array.isArray(template?.steps) && template.steps.length > 0) return 'flow';
    return 'interface';
  }

  function normalizeApiTemplate(template = {}) {
    const stepCount = Array.isArray(template?.steps) ? template.steps.length : 0;
    const body = template?.body;
    const bodyFieldCount =
      body && typeof body === 'object' && !Array.isArray(body)
        ? Object.keys(body).length
        : body
          ? 1
          : 0;
    return {
      ...template,
      id: template.id || template.name || '',
      name: template.name || template.endpoint || template.url || '未命名',
      endpoint: template.endpoint || template.url || '',
      method: template.method || 'GET',
      project: normalizeApiProject(template.project),
      environment: normalizeApiEnv(template.environment),
      environmentLabel: getApiEnvLabel(template.environment),
      variableSource: String(template.variableSource || 'mock').toLowerCase() === 'llm' ? 'llm' : 'mock',
      variableCount: Array.isArray(template.variables) ? template.variables.length : 0,
      kind: classifyApiTemplate(template),
      stepCount,
      bodyFieldCount,
      updatedAt: Number(template.updatedAt || 0) || 0
    };
  }

  function splitApiTemplates(templates = []) {
    const interfaces = [];
    const flows = [];
    for (const template of templates) {
      const normalized = normalizeApiTemplate(template);
      if (normalized.kind === 'flow') flows.push(normalized);
      else interfaces.push(normalized);
    }
    interfaces.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
    flows.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
    return { interfaces, flows };
  }

  function buildApiTemplateSummary(template = {}) {
    const normalized = normalizeApiTemplate(template);
    const parts = [`${normalized.project} · ${normalized.environmentLabel}`];
    if (normalized.kind === 'flow') {
      parts.push(`步骤 ${normalized.stepCount}`);
    } else {
      parts.push(`${normalized.method} ${normalized.endpoint}`.trim());
      if (normalized.bodyFieldCount > 0) {
        parts.push(`Body ${normalized.bodyFieldCount}`);
      }
      if (normalized.variableCount > 0) {
        parts.push(`变量 ${normalized.variableCount}`);
      }
      parts.push(normalized.variableSource === 'llm' ? '变量来源 LLM' : '变量来源 Mock');
    }
    return parts.filter(Boolean).join(' · ');
  }

  function buildApiTemplateCardBody(template = {}) {
    const summary = buildApiTemplateSummary(template);
    const meta = template.updatedAt ? new Date(template.updatedAt).toLocaleString() : '';
    return [summary, meta].filter(Boolean).join(' · ');
  }

  function buildApiPreview(template = {}) {
    const normalized = normalizeApiTemplate(template);
    if (normalized.kind === 'flow') {
      return `流程模板「${normalized.name}」：${normalized.project} / ${normalized.environmentLabel} · ${normalized.stepCount} 步，循环 ${normalized.loopCount || 1} 次，间隔 ${normalized.intervalMs || 0}ms，重试 ${normalized.retryCount || 0} 次。`;
    }
    const bodyText = normalized.bodyFieldCount > 0 ? `，Body 字段 ${normalized.bodyFieldCount} 个` : '';
    return `接口「${normalized.name}」：${normalized.project} / ${normalized.environmentLabel} · ${normalized.method} ${normalized.endpoint}${bodyText}。`;
  }

  function createApiStepId() {
    return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeApiStepList(steps = []) {
    const normalized = Array.isArray(steps)
      ? steps.map((step) => ({
        ...step
      }))
      : [];
    const validStepIds = new Set();
    for (const step of normalized) {
      const rawStepId = normText(step.stepId || step.id || '');
      const stepId = (rawStepId && !validStepIds.has(rawStepId)) ? rawStepId : createApiStepId();
      step.stepId = stepId;
      validStepIds.add(step.stepId);
    }
    normalized.forEach((step, index) => {
      const depends = Array.isArray(step.dependsOn) ? step.dependsOn : [];
      const filtered = Array.from(
        new Set(
          depends
            .map((item) => normText(item))
            .filter((item) => item && item !== step.stepId && validStepIds.has(item))
        )
      );
      if (filtered.length > 0) {
        step.dependsOn = filtered;
        return;
      }
      step.dependsOn = index > 0 ? [normalized[index - 1].stepId] : [];
    });
    return normalized;
  }

  function syncApiDraftSteps() {
    state.apiDraftSteps = normalizeApiStepList(state.apiDraftSteps);
  }

  function renderApiLog(panel, lines = []) {
    const box = panel.querySelector('[data-role="api-log"]');
    if (!box) return;
    const content = Array.isArray(lines) && lines.length ? lines.join('\n') : '暂无日志';
    box.textContent = content;
  }

  function appendApiLog(panel, text) {
    const box = panel.querySelector('[data-role="api-log"]');
    if (!box) return;
    const line = `[${new Date().toLocaleTimeString()}] ${text}`;
    box.textContent = `${line}\n${box.textContent}`.trim();
  }

  function renderApiStepList(panel) {
    const list = panel.querySelector('[data-role="api-step-list"]');
    if (!list) return;
    list.innerHTML = '';
    if (!state.apiDraftSteps.length) {
      const empty = document.createElement('div');
      empty.className = 'formpilot-v2-api-empty';
      empty.textContent = '先选择一个接口并点击“添加步骤”。';
      list.appendChild(empty);
      return;
    }

    syncApiDraftSteps();
    state.apiDraftSteps.forEach((step, index) => {
      const item = document.createElement('div');
      item.className = 'formpilot-v2-api-step-item';
      const info = document.createElement('div');
      info.className = 'formpilot-v2-api-step-info';
      const title = document.createElement('div');
      title.className = 'formpilot-v2-api-step-title';
      title.textContent = `${index + 1}. ${step.name || step.endpoint || '接口'}`;
      const meta = document.createElement('div');
      meta.className = 'formpilot-v2-api-step-meta';
      const scope = `${normalizeApiProject(step.project)} · ${getApiEnvLabel(step.environment)}`;
      const dependsOn = Array.isArray(step.dependsOn) ? step.dependsOn : [];
      const dependsText = dependsOn.length
        ? `依赖 ${dependsOn.map((depId) => {
          const dep = state.apiDraftSteps.find((item2) => item2.stepId === depId);
          return dep ? (dep.name || dep.stepId || depId) : depId;
        }).join('、')}`
        : '无依赖';
      meta.textContent = `${scope} · ${(step.method || 'GET')} ${step.endpoint || ''} · ${dependsText}`.trim();
      info.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'formpilot-v2-api-step-actions';
      if (index > 0) {
        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'formpilot-v2-mini-btn';
        upBtn.textContent = '上移';
        upBtn.addEventListener('click', () => {
          [state.apiDraftSteps[index - 1], state.apiDraftSteps[index]] = [state.apiDraftSteps[index], state.apiDraftSteps[index - 1]];
          syncApiDraftSteps();
          renderApiStepList(panel);
        });
        actions.appendChild(upBtn);
      }
      if (index < state.apiDraftSteps.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.className = 'formpilot-v2-mini-btn';
        downBtn.textContent = '下移';
        downBtn.addEventListener('click', () => {
          [state.apiDraftSteps[index + 1], state.apiDraftSteps[index]] = [state.apiDraftSteps[index], state.apiDraftSteps[index + 1]];
          syncApiDraftSteps();
          renderApiStepList(panel);
        });
        actions.appendChild(downBtn);
      }
      const depSelect = document.createElement('select');
      depSelect.className = 'formpilot-v2-template-select';
      depSelect.title = '步骤依赖';
      const noDep = document.createElement('option');
      noDep.value = '';
      noDep.textContent = '无依赖';
      depSelect.appendChild(noDep);
      for (let prev = 0; prev < index; prev += 1) {
        const prevStep = state.apiDraftSteps[prev];
        const option = document.createElement('option');
        option.value = prevStep.stepId;
        option.textContent = `${prev + 1}. ${prevStep.name || prevStep.endpoint || prevStep.stepId}`;
        depSelect.appendChild(option);
      }
      const selectedDep = (Array.isArray(step.dependsOn) ? step.dependsOn[0] : '') || '';
      depSelect.value = selectedDep;
      depSelect.addEventListener('change', () => {
        const depId = normText(depSelect.value || '');
        step.dependsOn = depId ? [depId] : [];
        renderApiStepList(panel);
      });
      actions.appendChild(depSelect);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'formpilot-v2-mini-btn';
      del.textContent = '删除';
      del.addEventListener('click', () => {
        state.apiDraftSteps.splice(index, 1);
        syncApiDraftSteps();
        renderApiStepList(panel);
      });
      actions.appendChild(del);
      item.append(info, actions);
      list.appendChild(item);
    });
  }

  function renderApiTemplateCards(panel, templates = []) {
    const interfaceList = panel.querySelector('[data-role="api-interface-list"]');
    const flowList = panel.querySelector('[data-role="api-flow-list"]');
    const interfaceSelect = panel.querySelector('[data-role="api-interface-select"]');
    const flowSelect = panel.querySelector('[data-role="api-flow-select"]');
    const preview = panel.querySelector('[data-role="api-curl-preview"]');
    const projectFilterSelect = panel.querySelector('[data-role="api-project-filter"]');
    const envFilterSelect = panel.querySelector('[data-role="api-env-filter"]');
    const { interfaces, flows } = splitApiTemplates(templates);
    state.apiInterfaces = interfaces;
    state.apiFlows = flows;
    const allTemplates = [...interfaces, ...flows];
    const projectOptions = Array.from(new Set(allTemplates.map((item) => normalizeApiProject(item.project))));
    const envOptions = Array.from(new Set(allTemplates.map((item) => normalizeApiEnv(item.environment))));

    const syncFilterSelect = (select, options, allLabel, selectedValue, labelGetter = (value) => value) => {
      if (!(select instanceof HTMLSelectElement)) return selectedValue;
      select.innerHTML = '';
      const allOption = document.createElement('option');
      allOption.value = '__all__';
      allOption.textContent = allLabel;
      select.appendChild(allOption);
      for (const value of options) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labelGetter(value);
        select.appendChild(option);
      }
      const nextValue = options.includes(selectedValue) || selectedValue === '__all__' ? selectedValue : '__all__';
      select.value = nextValue;
      return nextValue;
    };

    state.apiProjectFilter = syncFilterSelect(projectFilterSelect, projectOptions, '全部项目', state.apiProjectFilter);
    state.apiEnvFilter = syncFilterSelect(envFilterSelect, envOptions, '全部环境', state.apiEnvFilter, (value) => getApiEnvLabel(value));

    const matchesScope = (item) => {
      const projectMatch = state.apiProjectFilter === '__all__' || normalizeApiProject(item.project) === state.apiProjectFilter;
      const envMatch = state.apiEnvFilter === '__all__' || normalizeApiEnv(item.environment) === state.apiEnvFilter;
      return projectMatch && envMatch;
    };
    const filteredInterfaces = interfaces.filter(matchesScope);
    const filteredFlows = flows.filter(matchesScope);

    setMetric(panel, 'apiInterfaceCount', `接口 ${filteredInterfaces.length} 个`);
    setMetric(panel, 'apiFlowCount', `流程 ${filteredFlows.length} 个`);
    setMetric(panel, 'apiTemplateStat', `接口 ${filteredInterfaces.length}/${interfaces.length} · 流程 ${filteredFlows.length}/${flows.length}`);
    setMetric(panel, 'apiRunCount', `运行 ${state.apiRunCount || 0} 次`);

    const syncSelect = (select, items, selectedId, emptyLabel, placeholderLabel) => {
      if (!(select instanceof HTMLSelectElement)) return;
      select.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = items.length ? placeholderLabel : emptyLabel;
      select.appendChild(placeholder);
      for (const item of items) {
        const option = document.createElement('option');
        option.value = item.id || item.name || '';
        const scope = `${normalizeApiProject(item.project)} · ${getApiEnvLabel(item.environment)}`;
        const core = item.kind === 'flow'
          ? `步骤 ${item.stepCount || 0}`
          : `${item.method || 'GET'} ${item.endpoint || ''}`.trim();
        option.textContent = `${item.name || '未命名'} · ${scope} · ${core}`;
        select.appendChild(option);
      }
      const nextSelected = items.some((item) => (item.id || item.name || '') === selectedId)
        ? selectedId
        : items[0]?.id || items[0]?.name || '';
      select.value = nextSelected || '';
      return nextSelected || '';
    };

    state.apiSelectedInterfaceId = syncSelect(
      interfaceSelect,
      filteredInterfaces,
      state.apiSelectedInterfaceId,
      '暂无接口',
      '请选择接口'
    );
    state.apiSelectedFlowId = syncSelect(
      flowSelect,
      filteredFlows,
      state.apiSelectedFlowId,
      '暂无流程',
      '请选择流程模板'
    );

    const renderCardList = (listNode, items, kind) => {
      if (!listNode) return;
      listNode.innerHTML = '';
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'formpilot-v2-api-empty';
        empty.textContent = kind === 'interface'
          ? '暂无接口，先粘贴一段 curl 并保存。'
          : '暂无流程模板，先把接口组合成流程。';
        listNode.appendChild(empty);
        return;
      }

      for (const item of items) {
        const card = document.createElement('div');
        card.className = 'formpilot-v2-api-item';
        const head = document.createElement('div');
        head.className = 'formpilot-v2-api-item-head';
        const info = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'formpilot-v2-api-item-title';
        title.textContent = item.name || '未命名';
        const meta = document.createElement('div');
        meta.className = 'formpilot-v2-api-item-meta';
        meta.textContent = buildApiTemplateCardBody(item);
        info.append(title, meta);

        const actions = document.createElement('div');
        actions.className = 'formpilot-v2-api-item-actions';
        const useBtn = document.createElement('button');
        useBtn.type = 'button';
        useBtn.className = 'formpilot-v2-mini-btn formpilot-v2-api-card-btn';
        useBtn.textContent = kind === 'interface' ? '加入步骤' : '载入';
        useBtn.addEventListener('click', () => {
          if (kind === 'interface') {
            state.apiSelectedInterfaceId = item.id || item.name || '';
            const selectNode = panel.querySelector('[data-role="api-interface-select"]');
            if (selectNode instanceof HTMLSelectElement) selectNode.value = state.apiSelectedInterfaceId;
            addApiStepFromSelectedInterface(panel);
            return;
          }
          state.apiSelectedFlowId = item.id || item.name || '';
          const selectNode = panel.querySelector('[data-role="api-flow-select"]');
          if (selectNode instanceof HTMLSelectElement) selectNode.value = state.apiSelectedFlowId;
          loadApiFlowIntoDraft(panel, item);
        });
        actions.appendChild(useBtn);

        const runBtn = document.createElement('button');
        runBtn.type = 'button';
        runBtn.className = 'formpilot-v2-mini-btn formpilot-v2-api-card-btn';
        runBtn.textContent = '执行';
        runBtn.addEventListener('click', async () => {
          state.apiSelectedFlowId = item.id || item.name || '';
          const selectNode = panel.querySelector('[data-role="api-flow-select"]');
          if (selectNode instanceof HTMLSelectElement) selectNode.value = state.apiSelectedFlowId;
          await runSelectedApiTemplate(panel, item);
        });
        actions.appendChild(runBtn);

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'template-delete formpilot-v2-api-card-btn';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', async () => {
          await sendRuntimeMessage(
            { type: 'formpilotv2:remove-api-template', templateId: item.id || item.name || '' },
            12000,
            '删除 API 模板'
          );
          await reloadApiTemplates(panel);
        });
        actions.appendChild(delBtn);

        head.append(info, actions);
        card.append(head);
        listNode.appendChild(card);
      }
    };

    renderCardList(interfaceList, filteredInterfaces, 'interface');
    renderCardList(flowList, filteredFlows, 'flow');

    if (preview) {
      const selected = getSelectedApiTemplate(panel) || filteredInterfaces[0] || filteredFlows[0] || null;
      preview.textContent = selected ? buildApiPreview(selected) : '等待解析 curl。';
    }

    renderApiStepList(panel);
    renderApiLog(panel, state.apiDraftLogs);
  }

  async function reloadApiTemplates(panel) {
    try {
      const res = await sendRuntimeMessage({ type: 'formpilotv2:list-api-templates' }, 10000, '读取 API 模板');
      if (res?.ok) {
        state.apiTemplates = Array.isArray(res.templates) ? res.templates : [];
        renderApiTemplateCards(panel, state.apiTemplates);
        return;
      }
    } catch {
      // ignore
    }
    state.apiTemplates = [];
    renderApiTemplateCards(panel, []);
  }

  async function syncProviderFromSettings(panel) {
    const settings = await getSettings();
    state.provider = settings.provider || 'heuristic';
    renderProviderSelect(panel, state.provider);
  }

  function renderFillScopeToggle(panel, enabled = state.fillOptionalFields) {
    const isEnabled = enabled !== false;
    const toggle = panel?.querySelector?.('[data-action="toggle-fill-optional"]');
    if (!(toggle instanceof HTMLElement)) return;
    toggle.dataset.enabled = isEnabled ? 'true' : 'false';
    toggle.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
    toggle.setAttribute('title', isEnabled ? '当前：填全部' : '当前：仅必填');
    const text = toggle.querySelector('[data-metric="fillScopeText"]');
    if (text) text.textContent = isEnabled ? '填全部' : '仅必填';
  }

  async function syncFillScopeFromSettings(panel) {
    const settings = await getSettings();
    state.fillOptionalFields = settings.fillOptionalFields !== false;
    renderFillScopeToggle(panel, state.fillOptionalFields);
  }

  async function setFillOptionalFields(panel, nextEnabled) {
    const current = await getSettings();
    const nextSettings = { ...current, fillOptionalFields: nextEnabled };
    await sendRuntimeMessage({ type: 'formpilotv2:set-settings', settings: nextSettings }, 10000, '保存填写范围');
    state.fillOptionalFields = nextEnabled;
    renderFillScopeToggle(panel, nextEnabled);
    appendStatus(panel, nextEnabled ? '填写范围：全部字段' : '填写范围：仅必填字段');
    setBadge(panel, nextEnabled ? '填全部' : '仅必填', 'success');
  }

  async function toggleFillOptionalFields(panel) {
    const current = await getSettings();
    await setFillOptionalFields(panel, !(current.fillOptionalFields !== false));
  }

  async function switchProvider(panel, provider) {
    const nextProvider = ['heuristic', 'deepseek', 'openai', 'zhipu'].includes(provider) ? provider : 'heuristic';
    state.provider = nextProvider;
    renderProviderSelect(panel, nextProvider);
    try {
      const current = await getSettings();
      const nextSettings = { ...current, provider: nextProvider };
      await sendRuntimeMessage({ type: 'formpilotv2:set-settings', settings: nextSettings }, 10000, '保存数据来源');
      appendStatus(panel, `数据来源已切换为：${getProviderLabel(nextProvider)}`);
      setBadge(panel, `数据来源：${getProviderLabel(nextProvider)}`, 'success');
    } catch (error) {
      appendStatus(panel, `切换数据来源失败：${error?.message || error}`);
      setBadge(panel, '数据来源切换失败', 'error');
    }
  }

  function getSelectedApiTemplate(panel) {
    const templates = Array.isArray(state.apiTemplates) ? state.apiTemplates : [];
    const select = panel.querySelector('[data-role="api-flow-select"]');
    const templateId = select instanceof HTMLSelectElement ? normText(select.value || '') : state.apiSelectedFlowId;
    return templates.find((item) => (item.id || item.name || '') === templateId) || null;
  }

  function loadApiDraft(panel, template = null) {
    const nameInput = panel.querySelector('[data-role="api-flow-name"]');
    if (nameInput instanceof HTMLInputElement) {
      nameInput.value = template?.name || '';
    }
    const loopInput = panel.querySelector('[data-role="api-loop-count"]');
    const intervalInput = panel.querySelector('[data-role="api-interval-ms"]');
    const retryInput = panel.querySelector('[data-role="api-retry-count"]');
    const flowProjectInput = panel.querySelector('[data-role="api-flow-project"]');
    const flowEnvSelect = panel.querySelector('[data-role="api-flow-env"]');
    if (loopInput instanceof HTMLInputElement) loopInput.value = String(template?.loopCount || 1);
    if (intervalInput instanceof HTMLInputElement) intervalInput.value = String(template?.intervalMs || 300);
    if (retryInput instanceof HTMLInputElement) retryInput.value = String(template?.retryCount || 1);
    if (flowProjectInput instanceof HTMLInputElement) {
      flowProjectInput.value = template ? normalizeApiProject(template.project) : '';
    }
    if (flowEnvSelect instanceof HTMLSelectElement) {
      flowEnvSelect.value = normalizeApiEnv(template?.environment || 'test');
    }
    state.apiFlowName = template?.name || '';
    state.apiDraftSteps = normalizeApiStepList(Array.isArray(template?.steps)
      ? template.steps.map((item) => ({ ...item }))
      : []);
    renderApiStepList(panel);
    const preview = panel.querySelector('[data-role="api-curl-preview"]');
    if (preview) {
      preview.textContent = template ? buildApiPreview(template) : '等待解析 curl。';
    }
  }

  function loadApiFlowIntoDraft(panel, template = null) {
    loadApiDraft(panel, template);
    appendApiLog(panel, `已载入流程模板：${template?.name || template?.id || '未命名'}`);
  }

  function getCurrentInterfaceSelection(panel) {
    const select = panel.querySelector('[data-role="api-interface-select"]');
    const selectedId = select instanceof HTMLSelectElement ? normText(select.value || '') : state.apiSelectedInterfaceId;
    const templates = Array.isArray(state.apiInterfaces) ? state.apiInterfaces : [];
    return templates.find((item) => (item.id || item.name || '') === selectedId) || null;
  }

  function getCurrentFlowSelection(panel) {
    const select = panel.querySelector('[data-role="api-flow-select"]');
    const selectedId = select instanceof HTMLSelectElement ? normText(select.value || '') : state.apiSelectedFlowId;
    const templates = Array.isArray(state.apiFlows) ? state.apiFlows : [];
    return templates.find((item) => (item.id || item.name || '') === selectedId) || null;
  }

  async function saveApiInterfaceFromCurl(panel) {
    const nameInput = panel.querySelector('[data-role="api-interface-name"]');
    const curlInput = panel.querySelector('[data-role="api-curl-input"]');
    const preview = panel.querySelector('[data-role="api-curl-preview"]');
    const projectInput = panel.querySelector('[data-role="api-interface-project"]');
    const envSelect = panel.querySelector('[data-role="api-interface-env"]');
    const variableSourceSelect = panel.querySelector('[data-role="api-interface-variable-source"]');
    const name = normText(nameInput instanceof HTMLInputElement ? nameInput.value : '');
    const curlText = normText(curlInput instanceof HTMLTextAreaElement ? curlInput.value : '');
    const project = normalizeApiProject(
      projectInput instanceof HTMLInputElement
        ? projectInput.value
        : (state.apiProjectFilter === '__all__' ? '' : state.apiProjectFilter)
    );
    const environment = normalizeApiEnv(
      envSelect instanceof HTMLSelectElement
        ? envSelect.value
        : (state.apiEnvFilter === '__all__' ? '' : state.apiEnvFilter)
    );
    const variableSource = (
      variableSourceSelect instanceof HTMLSelectElement
        ? normText(variableSourceSelect.value || '')
        : 'mock'
    ) === 'llm' ? 'llm' : 'mock';
    if (!curlText) {
      if (preview) preview.textContent = '请先粘贴 curl 内容。';
      return;
    }
    if (preview) preview.textContent = '正在解析 curl...';
    try {
      const parsedRes = await sendRuntimeMessage({ type: 'formpilotv2:parse-curl', curlText }, 12000, '解析 curl');
      if (!parsedRes?.ok) {
        if (preview) preview.textContent = `解析失败：${parsedRes?.error || '未知错误'}`;
        return;
      }
      const parsed = parsedRes.parsed || {};
      state.apiDraftParsed = parsed;
      let urlLabel = '';
      try {
        urlLabel = parsed.url ? new URL(parsed.url).pathname.split('/').filter(Boolean).pop() || new URL(parsed.url).hostname : '';
      } catch {
        urlLabel = parsed.url ? String(parsed.url).replace(/^https?:\/\//i, '').split('/').filter(Boolean).pop() || String(parsed.url).replace(/^https?:\/\//i, '') : '';
      }
      const derivedName =
        name ||
        (urlLabel ? `接口 · ${urlLabel}` : '') ||
        `接口 ${new Date().toLocaleTimeString()}`;
      const template = {
        name: derivedName,
        endpoint: parsed.urlTemplate || parsed.url || '',
        method: parsed.method || 'GET',
        headers: parsed.headersTemplate || parsed.headers || {},
        body: parsed.bodyTemplate ?? parsed.body ?? '',
        curl: curlText,
        project,
        environment,
        variableSource,
        variables: Array.isArray(parsed.variables)
          ? parsed.variables.map((item) => ({
            ...item,
            source: variableSource
          }))
          : [],
        templateCategory: 'interface'
      };
      const saveRes = await sendRuntimeMessage({ type: 'formpilotv2:save-api-template', template }, 15000, '保存接口');
      if (!saveRes?.ok) {
        if (preview) preview.textContent = `保存失败：${saveRes?.error || '未知错误'}`;
        return;
      }
      state.apiSelectedInterfaceId = saveRes.template?.id || saveRes.template?.name || '';
      if (nameInput instanceof HTMLInputElement) nameInput.value = saveRes.template?.name || derivedName;
      if (projectInput instanceof HTMLInputElement) projectInput.value = project;
      if (envSelect instanceof HTMLSelectElement) envSelect.value = environment;
      if (preview) preview.textContent = buildApiPreview({ ...template, ...saveRes.template });
      const variableNames = Array.isArray(template.variables) ? template.variables.map((item) => item.name).filter(Boolean) : [];
      if (variableNames.length) {
        appendApiLog(panel, `已识别可替换变量：${variableNames.join('、')}`);
      }
      appendApiLog(panel, `接口已保存：${saveRes.template?.name || derivedName}`);
      await reloadApiTemplates(panel);
    } catch (error) {
      if (preview) preview.textContent = `解析失败：${error?.message || error}`;
    }
  }

  function addApiStepFromSelectedInterface(panel) {
    const template = getCurrentInterfaceSelection(panel);
    if (!template) {
      appendApiLog(panel, '请先选择一个已保存接口。');
      return;
    }
    const stepId = createApiStepId();
    const previous = state.apiDraftSteps[state.apiDraftSteps.length - 1];
    state.apiDraftSteps = [
      ...state.apiDraftSteps,
      {
        id: stepId,
        stepId,
        sourceTemplateId: template.id || template.name || '',
        name: template.name,
        endpoint: template.endpoint || template.url || '',
        method: template.method || 'GET',
        project: normalizeApiProject(template.project),
        environment: normalizeApiEnv(template.environment),
        variableSource: String(template.variableSource || 'mock').toLowerCase() === 'llm' ? 'llm' : 'mock',
        variables: Array.isArray(template.variables) ? template.variables.map((item) => ({ ...item })) : [],
        headers: template.headers || {},
        body: template.body ?? '',
        dependsOn: previous?.stepId ? [previous.stepId] : []
      }
    ];
    syncApiDraftSteps();
    renderApiStepList(panel);
    appendApiLog(panel, `已添加步骤：${template.name || template.endpoint || template.id || '未命名'}`);
  }

  async function saveApiFlow(panel) {
    const nameInput = panel.querySelector('[data-role="api-flow-name"]');
    const projectInput = panel.querySelector('[data-role="api-flow-project"]');
    const envSelect = panel.querySelector('[data-role="api-flow-env"]');
    const flowName = normText(nameInput instanceof HTMLInputElement ? nameInput.value : '') || `流程 ${new Date().toLocaleTimeString()}`;
    const project = normalizeApiProject(projectInput instanceof HTMLInputElement ? projectInput.value : state.apiProjectFilter);
    const environment = normalizeApiEnv(envSelect instanceof HTMLSelectElement ? envSelect.value : state.apiEnvFilter);
    if (!state.apiDraftSteps.length) {
      appendApiLog(panel, '请先添加至少一个步骤。');
      return;
    }
    try {
      const template = {
        name: flowName,
        steps: normalizeApiStepList(state.apiDraftSteps).map((item) => ({
          ...item,
          stepId: item.stepId || item.id || createApiStepId(),
          dependsOn: Array.isArray(item.dependsOn)
            ? item.dependsOn.map((dep) => normText(dep)).filter(Boolean)
            : []
        })),
        loopCount: Number(panel.querySelector('[data-role="api-loop-count"]')?.value || 1),
        intervalMs: Number(panel.querySelector('[data-role="api-interval-ms"]')?.value || 300),
        retryCount: Number(panel.querySelector('[data-role="api-retry-count"]')?.value || 1),
        project,
        environment,
        templateCategory: 'flow'
      };
      const saveRes = await sendRuntimeMessage({ type: 'formpilotv2:save-api-template', template }, 15000, '保存流程模板');
      if (!saveRes?.ok) {
        appendApiLog(panel, `流程保存失败：${saveRes?.error || '未知错误'}`);
        return;
      }
      state.apiSelectedFlowId = saveRes.template?.id || saveRes.template?.name || '';
      if (nameInput instanceof HTMLInputElement) nameInput.value = saveRes.template?.name || flowName;
      appendApiLog(panel, `流程模板已保存：${saveRes.template?.name || flowName}`);
      await reloadApiTemplates(panel);
    } catch (error) {
      appendApiLog(panel, `流程保存异常：${error?.message || error}`);
    }
  }

  async function runSelectedApiTemplate(panel, templateOverride = null) {
    const template = templateOverride || getCurrentFlowSelection(panel) || getSelectedApiTemplate(panel);
    if (!template) {
      appendApiLog(panel, '请先选择一个流程模板。');
      return;
    }
    state.apiRunning = true;
    setBusy(panel, true);
    setBadge(panel, '执行 API 中', 'progress');
    renderApiLog(panel, ['执行中...']);
    try {
      const res = await sendRuntimeMessage(
        {
          type: 'formpilotv2:run-api-template',
          templateId: template.id || template.name || '',
          params: {
            loopCount: Math.max(1, Number(panel.querySelector('[data-role="api-loop-count"]')?.value || template.loopCount || 1)),
            intervalMs: Math.max(0, Number(panel.querySelector('[data-role="api-interval-ms"]')?.value || template.intervalMs || 300)),
            retryCount: Math.max(0, Number(panel.querySelector('[data-role="api-retry-count"]')?.value || template.retryCount || 1))
          }
        },
        30000,
        '执行 API 模板'
      );
      if (!res?.ok) {
        appendApiLog(panel, `API 执行失败：${res?.error || '未知错误'}`);
        setBadge(panel, 'API 执行失败', 'error');
        return;
      }
      const summary = res.summary || {};
      state.apiRunCount = Number(state.apiRunCount || 0) + 1;
      setMetric(panel, 'apiRunCount', `运行 ${state.apiRunCount} 次`);
      const logs = Array.isArray(res.logs) ? res.logs : [];
      state.apiDraftLogs = logs.slice();
      renderApiLog(panel, logs.length ? logs : [`API 执行完成：成功 ${summary.successCount || 0}，失败 ${summary.failureCount || 0}`]);
      setBadge(panel, 'API 执行完成', 'success');
    } catch (error) {
      appendApiLog(panel, `API 执行异常：${error?.message || error}`);
      setBadge(panel, 'API 执行异常', 'error');
    } finally {
      state.apiRunning = false;
      if (panel.dataset.busy === 'true') setBusy(panel, false);
    }
  }

  function ensureHighlightLayer() {
    let layer = document.getElementById(HIGHLIGHT_LAYER_ID);
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = HIGHLIGHT_LAYER_ID;
    layer.dataset.active = 'false';
    document.documentElement.appendChild(layer);
    return layer;
  }

  function clearHighlights() {
    if (state.highlightAutoClearTimer) {
      window.clearTimeout(state.highlightAutoClearTimer);
      state.highlightAutoClearTimer = 0;
    }
    const layer = document.getElementById(HIGHLIGHT_LAYER_ID);
    if (layer) {
      layer.replaceChildren();
      layer.dataset.active = 'false';
    }
    window.__formPilotV2HighlightedFields = [];
    window.__formPilotV2HighlightDetail = [];
  }

  function scheduleHighlightAutoClear(delayMs = 0) {
    if (state.highlightAutoClearTimer) {
      window.clearTimeout(state.highlightAutoClearTimer);
      state.highlightAutoClearTimer = 0;
    }
    if (!(delayMs > 0)) return;
    state.highlightAutoClearTimer = window.setTimeout(() => {
      state.highlightAutoClearTimer = 0;
      clearHighlights();
    }, delayMs);
  }

  function getAllDisplayFields() {
    const merged = [];
    const seen = new Set();
    const collect = (list) => {
      for (const field of Array.isArray(list) ? list : []) {
        const identity = buildFieldIdentity(field);
        const key = identity || `${field.domId || ''}|${field.selector || ''}|${field.containerSelector || ''}|${field.label || ''}|${field.placeholder || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(field);
      }
    };
    collect(state.detectedFields);
    collect(state.manualFields);
    return merged;
  }

  function findFieldById(fieldId) {
    if (!fieldId) return null;
    const inDetected = state.detectedFields.find((x) => x.id === fieldId);
    if (inDetected) return inDetected;
    return state.manualFields.find((x) => x.id === fieldId) || null;
  }

  function updateFieldKindLocal(fieldId, nextKind) {
    let changed = false;
    for (const list of [state.detectedFields, state.manualFields]) {
      for (const field of list) {
        if (field.id !== fieldId) continue;
        field.kind = nextKind;
        changed = true;
      }
    }
    if (!changed) return false;
    state.lastDetail = (state.lastDetail || []).map((item) => {
      if (item.id !== fieldId) return item;
      return { ...item, kind: nextKind };
    });
    return true;
  }

  function ensureFieldDomId(el) {
    if (!(el instanceof Element)) return '';
    const attr = (window.FormPilotV2Utils && window.FormPilotV2Utils.EID_ATTR) || MANUAL_EID_ATTR;
    const existing = el.getAttribute(attr);
    if (existing) return existing;
    const next = `fp2m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    el.setAttribute(attr, next);
    return next;
  }

  function findManualFillTarget(node, panelRoot) {
    if (!(node instanceof Element)) return null;
    if (panelRoot && panelRoot.contains(node)) return null;
    const target = node.closest(
      'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), textarea, select, button[role="combobox"], [role="combobox"], [contenteditable="true"]'
    );
    if (!(target instanceof Element)) return null;
    if (target.closest('#formpilot-v2-fab-root')) return null;
    if (target instanceof HTMLInputElement && target.type === 'file') return null;
    return target;
  }

  function inferKindFromHint(hintText = '') {
    const hint = normText(hintText);
    if (hint === '姓' || hint === '姓氏') return 'lastName';
    if (hint === '名' || hint === '名字') return 'firstName';
    if (/(公司|企業|企业|機構|机构|政府|government|organization|organisation|company|corp|corporation).*(名稱|名称|name)|cert.*name|legal\s*entity\s*name|enterprise\s*name/i.test(hint)) return 'companyName';
    if (/(银行卡|銀行卡|银行卡号|銀行卡號|银行账号|銀行賬號|银行账户|銀行賬戶|储蓄卡|儲蓄卡|借记卡|借記卡|debit\s*card|bank\s*(card|account|acct)|card\s*(number|no\.?))/i.test(hint) && !/(身份证|身份證|身份証|身分證|身分証|证件|證件|護照|护照|id\s*card|idcard|identity|passport)/i.test(hint)) return 'bankCard';
    if (/(统一社会信用代码|統一社會信用代碼|社会信用代码|社會信用代碼|信用代码|信用代碼|统一信用代码|統一信用代碼|納税人識別號|纳税人识别号|商業登記(?:證)?號(?:碼)?|商业登记(?:证)?号(?:码)?|商業登記|商业登记|商業登記證|商业登记证|unified social credit(?: code| identifier)?|social credit code|taxpayer identification(?: number)?|tax id|brn|business registration(?: number| no\.?| #)?|registration number|company registration(?: number| no\.?)|證照編號|证照编号)/i.test(hint)) return 'companyId';
    if (/(驗證碼|验证码|verify code|verification code)/i.test(hint)) return 'verification';
    if (/(職位|职位|職稱|position|title)/i.test(hint)) return 'jobTitle';
    if (/邮箱|郵箱|電郵|email/i.test(hint)) return 'email';
    if (/身份证|证件|id\s*card|idcard/i.test(hint)) return 'idcard';
    if (/固定电话|固話|固话|landline|telephone|tel/i.test(hint)) return 'tel';
    if (/电话|電話|手机|手机号|流動電話|移动电话|mobile|phone/i.test(hint)) return 'phone';
    if (/(姓名|聯絡人|联系人|name|別稱|别称|暱稱|昵称|alias|preferred\s*name)/i.test(hint)) return 'fullName';
    if (/日期|时间|生日|date|time/i.test(hint)) return 'date';
    if (/地址|通訊地址|通讯地址|省份|城市|区县|地區|区域|address|街號|街号|室|樓|楼|大廈|大厦/i.test(hint)) return 'addressDetail';
    if (/请选择|請選擇|下拉|選項|选项|combobox|dropdown/i.test(hint)) return 'select';
    return 'text';
  }

  function escapeSelectorAttr(value = '') {
    return String(value || '').replace(/"/g, '\\"');
  }

  function selectorMatchCount(selector = '') {
    const normalized = normText(selector);
    if (!normalized) return 0;
    try {
      return document.querySelectorAll(normalized).length;
    } catch {
      return 0;
    }
  }

  function hashText(input = '') {
    const text = String(input || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function buildManualFieldFingerprint(field = {}) {
    const parts = [
      normText(field.kind || '').toLowerCase(),
      normText(field.label || '').toLowerCase(),
      normText(field.placeholder || '').toLowerCase(),
      normText(field.selector || '').toLowerCase(),
      normText(field.containerSelector || '').toLowerCase()
    ]
      .map((item) => item.replace(/\s+/g, ' '))
      .filter(Boolean);
    if (!parts.length) return '';
    return `manual|${hashText(parts.join('|'))}`;
  }

  function isStableClassToken(token = '') {
    const normalized = normText(token);
    if (!normalized) return false;
    if (normalized.length < 3) return false;
    if (/^\d+$/.test(normalized)) return false;
    if (/[A-Z]/.test(normalized) && normalized.length > 24) return false;
    if (/\d{4,}/.test(normalized)) return false;
    if (/^(css-|sc-|jsx-|emotion-|chakra-|ant-|Mui)/.test(normalized)) return false;
    return true;
  }

  function isStableIdToken(token = '') {
    const normalized = normText(token);
    if (!normalized) return false;
    if (normalized.length < 2 || normalized.length > 48) return false;
    if (/^\d+$/.test(normalized)) return false;
    if (/\d{4,}/.test(normalized)) return false;
    if (/(react-select|chakra|emotion|mui|tmp|temp|uuid|random)/i.test(normalized)) return false;
    return true;
  }

  function buildElementStableSelectors(el) {
    if (!(el instanceof Element)) return [];
    const selectors = [];
    const push = (selector) => {
      const normalized = normText(selector);
      if (!normalized || selectors.includes(normalized)) return;
      selectors.push(normalized);
    };

    const tag = (el.tagName || '').toLowerCase();
    if (!tag) return selectors;

    const elementId = normText(el.getAttribute('id'));
    if (isStableIdToken(elementId)) {
      push(`#${CSS.escape(elementId)}`);
    }

    const type = normText(el.getAttribute('type'));
    const attrs = ['name', 'data-testid', 'data-testid', 'data-field', 'data-name', 'aria-label', 'placeholder'];
    for (const attr of attrs) {
      const value = normText(el.getAttribute(attr));
      if (!value) continue;
      const safe = escapeSelectorAttr(value);
      push(`${tag}[${attr}="${safe}"]`);
      if (type && tag === 'input') {
        push(`${tag}[type="${escapeSelectorAttr(type)}"][${attr}="${safe}"]`);
      }
    }

    if (type && tag === 'input') {
      push(`${tag}[type="${escapeSelectorAttr(type)}"]`);
    }

    const stableClasses = Array.from(el.classList || []).filter(isStableClassToken).slice(0, 2);
    if (stableClasses.length) {
      push(`${tag}.${stableClasses.map((x) => CSS.escape(x)).join('.')}`);
    }

    return selectors;
  }

  function buildAnchorStableSelectors(el) {
    if (!(el instanceof Element)) return [];
    const anchors = [];
    const seen = new Set();
    let node = el.parentElement;
    let depth = 0;
    while (node && node !== document.body && depth < 6) {
      for (const selector of buildElementStableSelectors(node)) {
        if (seen.has(selector)) continue;
        seen.add(selector);
        anchors.push(selector);
        if (selectorMatchCount(selector) === 1) {
          return anchors;
        }
      }
      node = node.parentElement;
      depth += 1;
    }
    return anchors;
  }

  function resolveManualLocator(el, containerEl = null) {
    if (!(el instanceof Element)) return { selector: '', candidates: [], matchCount: 0 };
    const directSelectors = buildElementStableSelectors(el);
    const candidates = [];
    const seen = new Set();
    const push = (selector) => {
      const normalized = normText(selector);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    };

    for (const selector of directSelectors) push(selector);

    const anchors = [
      ...buildAnchorStableSelectors(containerEl instanceof Element ? containerEl : el),
      ...buildAnchorStableSelectors(el)
    ];

    for (const anchor of anchors) {
      for (const direct of directSelectors) {
        if (direct.startsWith('#')) continue;
        push(`${anchor} ${direct}`);
      }
    }

    const utils = window.FormPilotV2Utils || {};
    if (typeof utils.buildSelector === 'function') {
      try {
        push(utils.buildSelector(el));
      } catch {
        // ignore
      }
    }

    let bestSelector = '';
    let bestCount = 0;
    for (const selector of candidates) {
      const count = selectorMatchCount(selector);
      if (count === 1) {
        bestSelector = selector;
        bestCount = 1;
        break;
      }
      if (!bestSelector && count > 0) {
        bestSelector = selector;
        bestCount = count;
      } else if (bestSelector && count > 0 && count < bestCount) {
        bestSelector = selector;
        bestCount = count;
      }
    }

    if (!bestSelector && candidates.length) {
      bestSelector = candidates[0];
      bestCount = selectorMatchCount(bestSelector);
    }

    return {
      selector: bestSelector,
      candidates: candidates.slice(0, 10),
      matchCount: bestCount
    };
  }

  function buildManualSelector(el, containerEl = null) {
    return resolveManualLocator(el, containerEl).selector || '';
  }

  function buildManualFieldFromElement(el) {
    const utils = window.FormPilotV2Utils || {};
    const label = typeof utils.getLabelText === 'function' ? normText(utils.getLabelText(el)) : normText(el.getAttribute('aria-label'));
    const placeholder = normText(el.getAttribute('placeholder'));
    const container = typeof utils.findContainer === 'function' ? utils.findContainer(el) : el.closest('form, .form-item, .form-field, .ant-form-item, .el-form-item');
    const context = normText(container?.innerText || '').slice(0, 220);
    const role = normText(el.getAttribute('role'));
    const rect = el.getBoundingClientRect();
    const hint = `${label} ${placeholder} ${context} ${role}`;
    const kind = inferKindFromHint(hint);
    const sectionVariant = inferAddressSectionVariant(hint);
    const domId = ensureFieldDomId(el);
    const geometry = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height)
    };

    const fieldLocator = resolveManualLocator(el, container);
    const containerLocator = resolveManualLocator(container || el.parentElement || el);
    const locatorStability = (() => {
      const fieldScore = fieldLocator.matchCount > 0 ? (1 / fieldLocator.matchCount) : 0;
      const containerScore = containerLocator.matchCount > 0 ? (1 / containerLocator.matchCount) : 0;
      return Math.max(fieldScore, containerScore, 0);
    })();
    const selector = fieldLocator.selector || buildManualSelector(el, container);
    const containerSelector = containerLocator.selector || buildManualSelector(container || el.parentElement || el);
    const fingerprint = buildManualFieldFingerprint({
      kind,
      label,
      placeholder,
      selector,
      containerSelector
    });

    return {
      id: `manual_${domId}`,
      kind,
      domId,
      selector,
      label,
      placeholder,
      context,
      confidence: 0.96,
      score: 0.96,
      reason: '手动补点添加',
      reasons: ['手动补点添加'],
      source: 'manual-pick',
      containerSelector,
      fingerprint,
      meta: {
        manualRect: geometry,
        sectionVariant,
        fieldHint: hint,
        fieldFingerprint: fingerprint,
        locatorStability,
        locatorCandidates: fieldLocator.candidates,
        locatorMatchCount: fieldLocator.matchCount,
        containerLocatorCandidates: containerLocator.candidates,
        containerLocatorMatchCount: containerLocator.matchCount,
        stableSelector: selector || '',
        stableContainerSelector: containerSelector || ''
      }
    };
  }

  async function persistManualFieldToLibrary(field) {
    if (!field) return { ok: false, error: '字段为空' };
    try {
      return await sendRuntimeMessage(
        { type: 'formpilotv2:save-manual-field-self', field },
        12000,
        '保存手动字段库'
      );
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  function resolveFieldRect(field) {
    const manualRect = getFieldRect(field);
    if (manualRect) return manualRect;
    const el = getFieldElement(field);
    if (!(el instanceof HTMLElement)) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height)
    };
  }

  function buildFieldMatchProfile(field) {
    const parts = getFieldIdentityParts(field);
    return {
      ...parts,
      rect: resolveFieldRect(field)
    };
  }

  function findDuplicateField(candidate, fields = []) {
    const candidateProfile = buildFieldMatchProfile(candidate);
    const candidateIdentity = buildFieldIdentity(candidate);

    for (const field of fields) {
      const fieldProfile = buildFieldMatchProfile(field);
      const matchedBy = [];

      if (candidateProfile.domId && fieldProfile.domId && candidateProfile.domId === fieldProfile.domId) {
        return {
          duplicated: true,
          reason: 'domId 命中重复',
          field,
          matchedBy: ['domId']
        };
      }

      if (candidateProfile.selector && candidateProfile.selector === fieldProfile.selector) matchedBy.push('selector');
      if (candidateProfile.containerSelector && candidateProfile.containerSelector === fieldProfile.containerSelector) matchedBy.push('container');
      if (candidateProfile.detailSelector && candidateProfile.detailSelector === fieldProfile.detailSelector) matchedBy.push('detail');
      if (candidateProfile.sectionVariant && candidateProfile.sectionVariant === fieldProfile.sectionVariant) matchedBy.push('variant');
      if (candidateProfile.label && candidateProfile.label === fieldProfile.label) matchedBy.push('label');
      if (candidateProfile.placeholder && candidateProfile.placeholder === fieldProfile.placeholder) matchedBy.push('placeholder');
      if (isSameRect(candidateProfile.rect, fieldProfile.rect, 10)) matchedBy.push('geometry');

      const hasStrongMatch =
        (matchedBy.includes('selector') && (matchedBy.includes('container') || matchedBy.includes('detail') || matchedBy.includes('variant') || matchedBy.includes('geometry'))) ||
        (matchedBy.includes('detail') && (matchedBy.includes('container') || matchedBy.includes('geometry'))) ||
        (matchedBy.includes('container') && matchedBy.includes('geometry') && (matchedBy.includes('variant') || matchedBy.includes('label'))) ||
        (matchedBy.includes('selector') && matchedBy.includes('label') && matchedBy.includes('geometry'));

      if (hasStrongMatch) {
        return {
          duplicated: true,
          reason: buildDuplicateEvidence(candidate, field, matchedBy) || '选择器/容器/位置命中重复',
          field,
          matchedBy
        };
      }

      // 仅凭占位提示相同，不应认定为重复，尤其是“中/英”地址这种并列字段。
      if (matchedBy.length === 1 && matchedBy[0] === 'placeholder') {
        continue;
      }

      // 兼容旧数据：若 selector/容器都缺失，但 ID 以外的其它维度完全一致，也允许判重。
      if (!candidateIdentity && matchedBy.includes('geometry') && matchedBy.includes('label') && matchedBy.includes('placeholder')) {
        return {
          duplicated: true,
          reason: buildDuplicateEvidence(candidate, field, matchedBy) || '位置矩形命中重复',
          field,
          matchedBy
        };
      }
    }

    return { duplicated: false, reason: '', field: null, matchedBy: [] };
  }

  function getFieldElement(field) {
    if (!field) return null;

    if (field.domId) {
      const attr = (window.FormPilotV2Utils && window.FormPilotV2Utils.EID_ATTR) || MANUAL_EID_ATTR;
      const byDom = document.querySelector(`[${attr}="${CSS.escape(field.domId)}"]`);
      if (byDom) return byDom;
    }

    if (!field.selector) return null;
    try {
      return document.querySelector(field.selector);
    } catch {
      return null;
    }
  }

  function getHighlightStatus(field, detailMap) {
    if (!detailMap?.size) return 'detected';
    const fieldDetail = detailMap.get(field.id);
    if (!fieldDetail) return 'detected';
    if (fieldDetail.manualSelected) return 'manual-selected';
    if (fieldDetail.manualHover) return 'manual-hover';
    if (fieldDetail.manualAdded) return 'manual-added';
    if (fieldDetail.skipped) return 'warning';
    return fieldDetail.ok ? 'success' : 'error';
  }

  function renderHighlights(fields = [], detail = []) {
    const layer = ensureHighlightLayer();
    const detailMap = new Map((detail || []).map((item) => [item.id, item]));
    layer.replaceChildren();

    if (!fields.length) {
      layer.dataset.active = 'false';
      return;
    }

    const prioritize = (field) => {
      const row = detailMap.get(field.id);
      if (!row) return 1;
      if (row.manualSelected || row.manualHover) return 6;
      if (row.ok === false && !row.skipped) return 5;
      if (row.skipped) return 4;
      if (row.manualAdded) return 3;
      if (row.ok === true) return 1;
      return 1;
    };

    const sortedFields = fields
      .slice()
      .sort((a, b) => prioritize(b) - prioritize(a));

    // 识别很多字段时，优先显示关键状态，避免全屏高亮导致渲染负担。
    const maxCount = detailMap.size > 0 ? 32 : 48;
    const renderFields = sortedFields.slice(0, maxCount);

    const fragments = [];
    for (const [index, field] of renderFields.entries()) {
      const element = getFieldElement(field);
      if (!(element instanceof HTMLElement)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 6 || rect.height < 6) continue;
      if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) continue;

      const box = document.createElement('div');
      box.className = 'formpilot-v2-highlight-box';
      box.dataset.status = getHighlightStatus(field, detailMap);
      box.style.left = `${Math.max(0, rect.left)}px`;
      box.style.top = `${Math.max(0, rect.top)}px`;
      box.style.width = `${Math.max(14, rect.width)}px`;
      box.style.height = `${Math.max(14, rect.height)}px`;

      const tag = document.createElement('div');
      tag.className = 'formpilot-v2-highlight-tag';
      tag.textContent = `${index + 1} · ${field.kind || 'text'}`;
      tag.title = field.label || field.placeholder || field.selector || field.id || '';

      box.appendChild(tag);
      fragments.push(box);
    }

    if (!fragments.length) {
      layer.dataset.active = 'false';
      return;
    }

    layer.append(...fragments);
    layer.dataset.active = 'true';
  }

  function scheduleHighlightRefresh() {
    const now = Date.now();
    if (window.__formPilotV2HighlightLastAt && now - window.__formPilotV2HighlightLastAt < 120) return;
    if (window.__formPilotV2HighlightRaf) return;
    window.__formPilotV2HighlightRaf = window.requestAnimationFrame(() => {
      window.__formPilotV2HighlightRaf = 0;
      window.__formPilotV2HighlightLastAt = Date.now();
      renderHighlights(window.__formPilotV2HighlightedFields || [], window.__formPilotV2HighlightDetail || []);
    });
  }

  function rememberHighlights(fields = [], detail = []) {
    window.__formPilotV2HighlightedFields = Array.isArray(fields) ? fields.slice() : [];
    window.__formPilotV2HighlightDetail = Array.isArray(detail) ? detail.slice() : [];
    scheduleHighlightRefresh();
  }

  function measurePanelHeight(panel) {
    const wasOpen = panel.classList.contains('open');
    const prevVisibility = panel.style.visibility;
    const prevPointerEvents = panel.style.pointerEvents;

    if (!wasOpen) {
      panel.classList.add('open');
      panel.style.visibility = 'hidden';
      panel.style.pointerEvents = 'none';
    }

    const height = Math.max(panel.getBoundingClientRect().height, panel.scrollHeight, 320);

    if (!wasOpen) {
      panel.classList.remove('open');
      panel.style.visibility = prevVisibility;
      panel.style.pointerEvents = prevPointerEvents;
    }

    return height;
  }

  function getPanelNaturalWidth(panel) {
    const wasOpen = panel.classList.contains('open');
    const prevVisibility = panel.style.visibility;
    const prevPointerEvents = panel.style.pointerEvents;

    if (!wasOpen) {
      panel.classList.add('open');
      panel.style.visibility = 'hidden';
      panel.style.pointerEvents = 'none';
    }

    const width = Math.max(panel.getBoundingClientRect().width, 280);

    if (!wasOpen) {
      panel.classList.remove('open');
      panel.style.visibility = prevVisibility;
      panel.style.pointerEvents = prevPointerEvents;
    }

    return width;
  }

  function clampOverlayPosition(left, top) {
    const margin = 8;
    const width = 58;
    const height = 58;
    return {
      left: Math.round(Math.max(margin, Math.min(window.innerWidth - width - margin, Number(left) || margin))),
      top: Math.round(Math.max(margin, Math.min(window.innerHeight - height - margin, Number(top) || margin)))
    };
  }

  function applyOverlayPosition(root, position) {
    if (!(root instanceof HTMLElement) || !position) return;
    const next = clampOverlayPosition(position.left, position.top);
    root.style.left = `${next.left}px`;
    root.style.top = `${next.top}px`;
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  function syncPanelPlacement(root, panel) {
    if (!(root instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

    const margin = 16;
    const rootRect = root.getBoundingClientRect();
    const roomLeft = Math.max(0, Math.floor(rootRect.left - margin));
    const roomRight = Math.max(0, Math.floor(window.innerWidth - rootRect.right - margin));
    const openRight = roomRight >= roomLeft;
    const sideRoom = openRight ? roomRight : roomLeft;
    const maxPanelWidth = Math.max(260, Math.min(412, sideRoom - 20 || getPanelNaturalWidth(panel)));
    root.dataset.panelSide = openRight ? 'right' : 'left';
    panel.style.maxWidth = `${maxPanelWidth}px`;

    const panelHeight = measurePanelHeight(panel);
    const roomAbove = Math.max(220, Math.floor(rootRect.bottom - margin));
    const roomBelow = Math.max(220, Math.floor(window.innerHeight - rootRect.top - margin));
    const placeBelow = roomBelow >= panelHeight || roomBelow >= roomAbove;

    root.dataset.panelPlacement = placeBelow ? 'below' : 'above';
    panel.style.maxHeight = `${placeBelow ? roomBelow : roomAbove}px`;
  }

  function markContextInvalidated(panel, root) {
    panel.dataset.busy = 'false';
    appendStatus(panel, '扩展已更新或被重新加载，请刷新当前页面后再使用。');
    panel.classList.add('open');
    setBadge(panel, '需要刷新', 'error');
    renderFieldList(panel, []);
    clearHighlights();
    const buttons = panel.querySelectorAll('[data-action]');
    buttons.forEach((btn) => {
      if (btn instanceof HTMLButtonElement) {
        btn.disabled = true;
      }
    });
    if (root instanceof HTMLElement) {
      root.dataset.invalidated = 'true';
    }
  }

  async function loadOverlayPosition() {
    if (!isRuntimeAvailable()) return null;
    try {
      const res = await chrome.storage.local.get(OVERLAY_POS_KEY);
      const value = res[OVERLAY_POS_KEY];
      if (value && typeof value === 'object') {
        const left = Number(value.left);
        const top = Number(value.top);
        return Number.isFinite(left) && Number.isFinite(top) ? clampOverlayPosition(left, top) : null;
      }
      const legacyTop = Number(value);
      if (Number.isFinite(legacyTop)) {
        return clampOverlayPosition(window.innerWidth - 58 - 12, legacyTop);
      }
      return null;
    } catch {
      return null;
    }
  }

  async function saveOverlayPosition(position) {
    if (!isRuntimeAvailable()) return;
    try {
      await chrome.storage.local.set({ [OVERLAY_POS_KEY]: clampOverlayPosition(position?.left, position?.top) });
    } catch {
      // ignore
    }
  }

  async function getSettings() {
    if (!isRuntimeAvailable()) return {};
    const res = await chrome.runtime.sendMessage({ type: 'formpilotv2:get-settings' }).catch(() => null);
    return res?.settings || {};
  }

  function bindSettingsChangeListener(panel) {
    if (!isRuntimeAvailable() || !chrome?.storage?.onChanged) return;
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local' || !changes?.[SETTINGS_KEY]) return;
        const nextSettings = changes[SETTINGS_KEY].newValue || {};
        const nextTabs = normalizeVisiblePanelTabs(nextSettings.visiblePanelTabs);
        const tabsChanged = nextTabs.join('|') !== state.visiblePanelTabs.join('|');
        renderCryptoPanel(panel, nextSettings.decryptConfig || {});
        if (!tabsChanged) return;
        const activeChanged = applyVisiblePanelTabs(panel, nextTabs);
        if (activeChanged && state.activePanel === 'api') {
          reloadApiTemplates(panel).catch(() => {});
        }
      });
    } catch {
      // ignore
    }
  }

  // ─── 区域选择器 ────────────────────────────────────────────────────────────
  class AreaSelector {
    constructor() {
      this._active = false;
      this._overlay = null;
      this._highlight = null;
      this._onMove = this._onMove.bind(this);
      this._onClick = this._onClick.bind(this);
      this._onResolve = null;
    }

    activate() {
      if (this._active) return;
      this._active = true;

      // 半透明遮罩
      const overlay = document.createElement('div');
      overlay.id = 'formpilot-v2-area-mask';
      overlay.style.cssText = [
        'position:fixed;inset:0;z-index:2147483640',
        'background:rgba(0,105,80,0.08);cursor:crosshair',
        'pointer-events:all'
      ].join(';');
      document.documentElement.appendChild(overlay);
      this._overlay = overlay;

      // 高亮选区框
      const hl = document.createElement('div');
      hl.id = 'formpilot-v2-area-hl';
      hl.style.cssText = [
        'position:fixed;z-index:2147483641',
        'border:2px solid #006950;background:rgba(0,105,80,0.12)',
        'border-radius:6px;pointer-events:none;display:none',
        'transition:all 0.1s ease'
      ].join(';');
      document.documentElement.appendChild(hl);
      this._highlight = hl;

      document.addEventListener('mousemove', this._onMove, true);
      document.addEventListener('click', this._onClick, true);

      return new Promise((resolve) => { this._onResolve = resolve; });
    }

    _onMove(ev) {
      if (!this._active || !this._highlight) return;
      const el = this._getTarget(ev);
      if (!el) { this._highlight.style.display = 'none'; return; }
      const rect = el.getBoundingClientRect();
      const hl = this._highlight;
      hl.style.display = 'block';
      hl.style.left = `${rect.left - 2}px`;
      hl.style.top = `${rect.top - 2}px`;
      hl.style.width = `${rect.width + 4}px`;
      hl.style.height = `${rect.height + 4}px`;
    }

    _onClick(ev) {
      if (!this._active) return;
      ev.preventDefault();
      ev.stopPropagation();
      const el = this._getTarget(ev);
      const selector = el ? this._buildSelector(el) : '';
      this.deactivate();
      if (this._onResolve) this._onResolve(selector);
    }

    _getTarget(ev) {
      // 临时将遮罩和高亮层设为 none，让 elementFromPoint 穿透到底层元素
      const prevMask = this._overlay?.style.pointerEvents;
      const prevHl = this._highlight?.style.pointerEvents;
      if (this._overlay) this._overlay.style.pointerEvents = 'none';
      if (this._highlight) this._highlight.style.pointerEvents = 'none';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (this._overlay) this._overlay.style.pointerEvents = prevMask ?? 'all';
      if (this._highlight) this._highlight.style.pointerEvents = prevHl ?? 'none';

      if (!el || el.id === 'formpilot-v2-area-mask' || el.id === 'formpilot-v2-area-hl') return null;
      if (el.closest('#formpilot-v2-fab-root')) return null;
      return el;
    }

    _buildSelector(el) {
      const utils = window.FormPilotV2Utils || {};
      if (typeof utils.buildSelector === 'function') {
        try { const s = utils.buildSelector(el); if (s) return s; } catch {}
      }
      if (el.id && !/^\d/.test(el.id)) return `#${CSS.escape(el.id)}`;
      const cls = Array.from(el.classList).slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
      return cls || el.tagName.toLowerCase();
    }

    deactivate() {
      if (!this._active) return;
      this._active = false;
      document.removeEventListener('mousemove', this._onMove, true);
      document.removeEventListener('click', this._onClick, true);
      this._overlay?.remove();
      this._highlight?.remove();
      this._overlay = null;
      this._highlight = null;
    }
  }

  const areaSelector = new AreaSelector();

  class QrRegionSelector {
    constructor() {
      this._active = false;
      this._overlay = null;
      this._box = null;
      this._hint = null;
      this._start = null;
      this._resolve = null;
      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);
    }

    activate() {
      this.deactivate();
      this._active = true;
      const overlay = document.createElement('div');
      overlay.id = 'formpilot-v2-qr-mask';
      overlay.className = 'formpilot-v2-qr-mask';
      const hint = document.createElement('div');
      hint.className = 'formpilot-v2-qr-mask-hint';
      hint.textContent = '拖拽框选条码区域，Esc 取消';
      const box = document.createElement('div');
      box.className = 'formpilot-v2-qr-mask-box';
      overlay.append(hint, box);
      document.documentElement.appendChild(overlay);
      this._overlay = overlay;
      this._hint = hint;
      this._box = box;
      overlay.addEventListener('pointerdown', this._onPointerDown, true);
      document.addEventListener('pointermove', this._onPointerMove, true);
      document.addEventListener('pointerup', this._onPointerUp, true);
      document.addEventListener('keydown', this._onKeyDown, true);
      return new Promise((resolve) => { this._resolve = resolve; });
    }

    _onPointerDown(ev) {
      if (!this._active || ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      this._start = {
        x: Math.max(0, Math.min(window.innerWidth, ev.clientX)),
        y: Math.max(0, Math.min(window.innerHeight, ev.clientY))
      };
      if (this._box) {
        this._box.style.display = 'block';
        this._box.style.left = `${this._start.x}px`;
        this._box.style.top = `${this._start.y}px`;
        this._box.style.width = '0px';
        this._box.style.height = '0px';
      }
      try { this._overlay?.setPointerCapture?.(ev.pointerId); } catch {}
    }

    _onPointerMove(ev) {
      if (!this._active || !this._start || !this._box) return;
      ev.preventDefault();
      ev.stopPropagation();
      const current = {
        x: Math.max(0, Math.min(window.innerWidth, ev.clientX)),
        y: Math.max(0, Math.min(window.innerHeight, ev.clientY))
      };
      this._paintRect(this._buildRect(this._start, current));
    }

    _onPointerUp(ev) {
      if (!this._active || !this._start) return;
      ev.preventDefault();
      ev.stopPropagation();
      const current = {
        x: Math.max(0, Math.min(window.innerWidth, ev.clientX)),
        y: Math.max(0, Math.min(window.innerHeight, ev.clientY))
      };
      const rect = this._buildRect(this._start, current);
      const resolve = this._resolve;
      this.deactivate();
      resolve?.(rect.width >= 12 && rect.height >= 12 ? { rect, viewport: getQrViewport() } : null);
    }

    _onKeyDown(ev) {
      if (!this._active || ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      const resolve = this._resolve;
      this.deactivate();
      resolve?.(null);
    }

    _buildRect(a, b) {
      const left = Math.min(a.x, b.x);
      const top = Math.min(a.y, b.y);
      return {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(Math.abs(a.x - b.x)),
        height: Math.round(Math.abs(a.y - b.y))
      };
    }

    _paintRect(rect) {
      if (!this._box) return;
      this._box.style.left = `${rect.x}px`;
      this._box.style.top = `${rect.y}px`;
      this._box.style.width = `${rect.width}px`;
      this._box.style.height = `${rect.height}px`;
    }

    deactivate() {
      if (!this._active && !this._overlay) return;
      this._active = false;
      this._start = null;
      this._overlay?.removeEventListener('pointerdown', this._onPointerDown, true);
      document.removeEventListener('pointermove', this._onPointerMove, true);
      document.removeEventListener('pointerup', this._onPointerUp, true);
      document.removeEventListener('keydown', this._onKeyDown, true);
      this._overlay?.remove();
      this._overlay = null;
      this._box = null;
      this._hint = null;
      this._resolve = null;
    }
  }

  const qrSelector = new QrRegionSelector();

  function getQrViewport() {
    return {
      width: Math.round(window.innerWidth || document.documentElement.clientWidth || 0),
      height: Math.round(window.innerHeight || document.documentElement.clientHeight || 0),
      devicePixelRatio: Number(window.devicePixelRatio || 1) || 1
    };
  }

  function setQrBusy(panel, busy, label = '') {
    state.qrBusy = !!busy;
    const buttons = panel.querySelectorAll('[data-role="qr-capture-btn"], [data-role="qr-global-btn"]');
    buttons.forEach((node) => {
      if (node instanceof HTMLButtonElement) node.disabled = !!busy || panel.dataset.busy === 'true';
    });
    if (label) setBadge(panel, label, busy ? 'progress' : 'normal');
  }

  function buildQrItem(result = {}, mode = 'capture') {
    return {
      id: `qr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: normText(result.text || result.data || ''),
      previewDataUrl: String(result.previewDataUrl || ''),
      kind: String(result.kind || result.type || 'qr'),
      format: String(result.format || (result.kind === 'barcode' ? 'Barcode' : 'QRCode')),
      mode,
      detectedAt: Date.now()
    };
  }

  function renderQrPanel(panel) {
    const head = panel.querySelector('[data-role="qr-results-head"]');
    const empty = panel.querySelector('[data-role="qr-empty"]');
    const notice = panel.querySelector('[data-role="qr-notice"]');
    const results = panel.querySelector('[data-role="qr-results"]');
    if (!results) return;

    const items = Array.isArray(state.qrItems) ? state.qrItems : [];
    if (head instanceof HTMLElement) head.hidden = !items.length;
    if (empty instanceof HTMLElement) empty.hidden = !!items.length || !!state.qrNotice;
    if (notice instanceof HTMLElement) {
      notice.textContent = state.qrNotice || '';
      notice.hidden = !state.qrNotice;
    }

    results.innerHTML = '';
    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'formpilot-v2-qr-result-card';

      const previewBtn = document.createElement('button');
      previewBtn.className = 'formpilot-v2-qr-preview-btn';
      previewBtn.type = 'button';
      previewBtn.setAttribute('aria-label', '放大查看条码');
      if (item.previewDataUrl) {
        const img = document.createElement('img');
        img.alt = '条码预览';
        img.src = item.previewDataUrl;
        previewBtn.appendChild(img);
        previewBtn.addEventListener('click', () => showQrPreviewLightbox(item.previewDataUrl));
      } else {
        const icon = document.createElement('span');
        icon.className = 'formpilot-v2-qr-icon';
        previewBtn.appendChild(icon);
      }

      const copy = document.createElement('div');
      copy.className = 'formpilot-v2-qr-result-copy';
      const title = document.createElement('div');
      title.className = 'formpilot-v2-qr-result-title';
      const modeLabel = item.mode === 'global' ? '全局识别' : '截取识别';
      title.textContent = `${modeLabel} · ${item.format || '条码'}`;
      const text = document.createElement('div');
      text.className = 'formpilot-v2-qr-result-text';
      text.textContent = item.text || '(空内容)';
      text.title = item.text || '';
      copy.append(title, text);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'formpilot-v2-mini-btn formpilot-v2-qr-copy-btn';
      copyBtn.type = 'button';
      copyBtn.textContent = '复制内容';
      copyBtn.addEventListener('click', async () => {
        const ok = await copyQrText(item.text || '');
        copyBtn.textContent = ok ? '已复制' : '复制失败';
        window.setTimeout(() => { copyBtn.textContent = '复制内容'; }, 1400);
      });

      card.append(previewBtn, copy, copyBtn);
      results.appendChild(card);
    }
  }

  async function copyQrText(text = '') {
    const value = String(text || '');
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      try {
        const input = document.createElement('textarea');
        input.value = value;
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.documentElement.appendChild(input);
        input.focus();
        input.select();
        const ok = document.execCommand('copy');
        input.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function showQrPreviewLightbox(src = '') {
    if (!src) return;
    closeQrPreviewLightbox();
    const root = document.createElement('div');
    root.className = 'formpilot-v2-qr-lightbox';
    const img = document.createElement('img');
    img.alt = '条码大图';
    img.src = src;
    root.appendChild(img);
    root.addEventListener('click', (ev) => {
      if (ev.target === root) closeQrPreviewLightbox();
    });
    document.addEventListener('keydown', closeQrPreviewOnEscape, true);
    document.documentElement.appendChild(root);
    state.qrLightbox = root;
  }

  function closeQrPreviewOnEscape(ev) {
    if (ev.key === 'Escape') closeQrPreviewLightbox();
  }

  function closeQrPreviewLightbox() {
    state.qrLightbox?.remove?.();
    state.qrLightbox = null;
    document.removeEventListener('keydown', closeQrPreviewOnEscape, true);
  }

  function appendQrResults(panel, results = [], mode = 'capture') {
    const nextItems = (Array.isArray(results) ? results : [])
      .map((item) => buildQrItem(item, mode))
      .filter((item) => item.text);
    if (!nextItems.length) return;
    state.qrNotice = '';
    state.qrItems = [...nextItems, ...(state.qrItems || [])].slice(0, 30);
    renderQrPanel(panel);
  }
  // ─────────────────────────────────────────────────────────────────────────

  async function injectOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const settings = await getSettings();
    if (settings.floatingEnabled === false) return;
    state.visiblePanelTabs = normalizeVisiblePanelTabs(settings.visiblePanelTabs);
    state.cryptoProjects = normalizeCryptoProjects(settings.decryptConfig || {});

    if (!document.getElementById(STYLE_ID) && isRuntimeAvailable()) {
      const link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('ui/overlay.css');
      document.documentElement.appendChild(link);
    }

    const root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.style.top = '45%';
    root.dataset.panelPlacement = 'above';
    root.dataset.panelSide = 'left';
    root.dataset.manualPick = 'false';

    const panel = document.createElement('div');
    panel.id = 'formpilot-v2-fab-panel';
    panel.innerHTML = `
      <div class="formpilot-v2-shell">
        <div class="formpilot-v2-hero-card">
          <div class="formpilot-v2-hero-top">
            <div class="formpilot-v2-brand">
              <div class="formpilot-v2-brand-icon">◈</div>
              <div class="formpilot-v2-brand-copy">
                <div class="formpilot-v2-brand-title">灵析专业测试伙伴为您护航</div>
                <div class="formpilot-v2-hero-url">${location.origin}${location.pathname}</div>
              </div>
            </div>
            <button class="formpilot-v2-hero-settings" type="button" data-action="options" aria-label="打开设置中心">⚙</button>
          </div>
          <div class="formpilot-v2-status-combo formpilot-v2-status-bar">
            <div class="formpilot-v2-status-left">
              <div class="formpilot-v2-online-chip">
                <span class="formpilot-v2-status-dot"></span>
                <span>在线</span>
              </div>
              <button class="formpilot-v2-fill-scope-toggle" type="button" data-action="toggle-fill-optional" data-enabled="true" aria-pressed="true" title="当前：填全部">
                <span class="formpilot-v2-fill-scope-switch"><span></span></span>
                <span class="formpilot-v2-fill-scope-text" data-metric="fillScopeText">填全部</span>
              </button>
            </div>
            <div class="formpilot-v2-status-cluster">
              <div class="formpilot-v2-status-inline">
                <span class="formpilot-v2-status-inline-label">当前状态</span>
                <span class="formpilot-v2-badge" data-tone="normal">等待操作</span>
              </div>
            </div>
          </div>
        </div>
        <div class="formpilot-v2-panel-body" data-panel-body="ui">
          <div class="formpilot-v2-config-grid">
            <div class="formpilot-v2-select-card">
              <div class="formpilot-v2-select-title">数据来源</div>
              <select class="formpilot-v2-source-select" data-role="provider-select">
                <option value="heuristic">本地 MOCK · 快速规则</option>
                <option value="deepseek">DeepSeek · 云端补全</option>
                <option value="openai">OpenAI · 云端推理</option>
                <option value="zhipu">Zhipu GLM · 云端推理</option>
              </select>
              <div class="formpilot-v2-select-tip" data-metric="providerText">本地 MOCK</div>
            </div>
            <!-- 2026-06-29: 按界面要求隐藏匹配模板区，保留原代码便于后续恢复。
            <div class="formpilot-v2-select-card">
              <div class="formpilot-v2-select-head">
                <div class="formpilot-v2-select-title">匹配模板</div>
                <div class="formpilot-v2-found-count" data-metric="templateCount">模板 0 个</div>
              </div>
              <select class="formpilot-v2-template-select" data-role="template-select">
                <option value="">（无可用模板）</option>
              </select>
              <div class="formpilot-v2-template-mini-row">
                <button class="formpilot-v2-mini-btn" type="button" data-action="template-apply">套用</button>
                <button class="formpilot-v2-mini-btn" type="button" data-action="template-save">保存</button>
              </div>
            </div>
            -->
          </div>
          <div class="formpilot-v2-action-stack">
            <button class="formpilot-v2-action-btn primary formpilot-v2-action-btn-lg" data-role="fill-action" data-action="fill">
              <span class="formpilot-v2-action-icon">⚡</span>
              <span class="formpilot-v2-action-label">一键智能填充</span>
            </button>
            <div class="formpilot-v2-action-row">
              <button class="formpilot-v2-action-btn accent" data-action="area-select">
                <span class="formpilot-v2-action-icon">⊡</span>
                <span>选区填充</span>
              </button>
              <button class="formpilot-v2-action-btn accent" data-action="scan">
                <span class="formpilot-v2-action-icon">⌕</span>
                <span>识别字段</span>
              </button>
            </div>
            <div class="formpilot-v2-action-row formpilot-v2-action-row-mini">
              <button class="formpilot-v2-mini-btn" type="button" data-action="manual-pick">手动补点</button>
              <button class="formpilot-v2-mini-btn" type="button" data-action="clear-highlights">清除框选</button>
            </div>
            <!-- 2026-06-29: 按界面要求隐藏补点流程说明和补规则入口，保留原代码便于后续恢复。
            <div class="formpilot-v2-manual-guide" data-role="manual-guide">
              补点流程：1) 点“手动补点”；2) 点页面遗漏字段；3) 按 Esc 结束；4) 点击“保存”沉淀模板；5) 在设置中心「手动字段库」点“带入规则”。
            </div>
            <button class="formpilot-v2-mini-btn formpilot-v2-manual-open-btn" type="button" data-action="manual-open-rules">补点字段去设置补规则</button>
            -->
          </div>
          <div class="formpilot-v2-section formpilot-v2-detected-card">
            <div class="formpilot-v2-section-head compact">
              <div>
                <div class="formpilot-v2-section-title">已检测字段</div>
                <div class="formpilot-v2-found-count" data-metric="foundText">已检测 0 个</div>
              </div>
              <div class="formpilot-v2-field-head-tools">
                <span class="formpilot-v2-sync-chip" data-metric="syncText">自动同步中</span>
              </div>
            </div>
            <div class="formpilot-v2-field-board">
              <ul class="formpilot-v2-field-list"></ul>
            </div>
            <div class="formpilot-v2-missing-card formpilot-v2-missing-inline">
              <div>
                <div class="formpilot-v2-missing-count">待补字段 0 个</div>
                <div class="formpilot-v2-missing-list">当前页字段已基本完成匹配</div>
              </div>
            </div>
          </div>
          <div class="formpilot-v2-insight-card">
            <div class="formpilot-v2-insight-head">
              <div class="formpilot-v2-section-title">处理效率分析</div>
              <div class="formpilot-v2-insight-mark">▥</div>
            </div>
            <div class="formpilot-v2-insight-grid">
              <div class="formpilot-v2-insight-metric">
                <span>响应速度</span>
                <strong data-metric="responseMs">--</strong>
              </div>
              <div class="formpilot-v2-insight-metric">
                <span>识别准确率</span>
                <strong data-metric="accuracyPct">--</strong>
              </div>
            </div>
            <div class="formpilot-v2-insight-bar">
              <span data-metric="accuracyBar"></span>
            </div>
          </div>
          <div class="formpilot-v2-log-card">
            <div class="formpilot-v2-section-title">执行日志</div>
            <div class="formpilot-v2-status">等待操作...</div>
          </div>
        </div>
        <div class="formpilot-v2-panel-body formpilot-v2-qr-panel" data-panel-body="qr" hidden>
          <div class="formpilot-v2-section formpilot-v2-qr-card">
            <div class="formpilot-v2-section-head">
              <div>
                <div class="formpilot-v2-section-title">条码面板</div>
                <div class="formpilot-v2-section-sub">识别当前页面条码内容。</div>
              </div>
              <div class="formpilot-v2-qr-mark" aria-hidden="true">
                <span class="formpilot-v2-qr-icon"></span>
              </div>
            </div>
            <div class="formpilot-v2-qr-actions">
              <button class="formpilot-v2-action-btn accent" type="button" data-action="qr-capture" data-role="qr-capture-btn">
                <span class="formpilot-v2-screenshot-icon" aria-hidden="true"></span>
                <span>截取识别</span>
                <span class="formpilot-v2-help-tip" aria-label="截取识别仅支持单个二维码/条形码">?</span>
              </button>
              <button class="formpilot-v2-action-btn accent" type="button" data-action="qr-global" data-role="qr-global-btn">
                <span class="formpilot-v2-action-icon">◎</span>
                <span>全局识别</span>
              </button>
            </div>
            <div class="formpilot-v2-qr-results-head" data-role="qr-results-head" hidden>
              <span>识别结果</span>
              <button class="formpilot-v2-mini-btn" type="button" data-action="qr-clear">清空</button>
            </div>
            <div class="formpilot-v2-qr-output">
              <div class="formpilot-v2-qr-notice" data-role="qr-notice" hidden></div>
              <div class="formpilot-v2-qr-results" data-role="qr-results"></div>
              <div class="formpilot-v2-qr-empty" data-role="qr-empty">
                <span class="formpilot-v2-qr-empty-icon" aria-hidden="true"></span>
                <strong>暂无条码识别结果</strong>
              </div>
            </div>
          </div>
        </div>
        <div class="formpilot-v2-panel-body" data-panel-body="api" hidden>
          <div class="formpilot-v2-config-grid formpilot-v2-api-top-grid">
            <div class="formpilot-v2-select-card">
              <div class="formpilot-v2-select-head">
                <div class="formpilot-v2-select-title">数据来源</div>
                <div class="formpilot-v2-found-count" data-metric="apiTemplateStat">接口 0/0 · 流程 0/0</div>
              </div>
              <select class="formpilot-v2-source-select" data-role="provider-select">
                <option value="heuristic">本地 MOCK · 快速规则</option>
                <option value="deepseek">DeepSeek · 云端补全</option>
                <option value="openai">OpenAI · 云端推理</option>
                <option value="zhipu">Zhipu GLM · 云端推理</option>
              </select>
              <div class="formpilot-v2-select-tip" data-metric="providerText">本地 MOCK</div>
            </div>
            <div class="formpilot-v2-select-card formpilot-v2-api-filter-card">
              <div class="formpilot-v2-select-head">
                <div class="formpilot-v2-select-title">项目与环境</div>
              </div>
              <div class="formpilot-v2-api-filter-grid">
                <select class="formpilot-v2-template-select" data-role="api-project-filter">
                  <option value="__all__">全部项目</option>
                </select>
                <select class="formpilot-v2-template-select" data-role="api-env-filter">
                  <option value="__all__">全部环境</option>
                </select>
              </div>
              <div class="formpilot-v2-select-tip">按项目和环境筛选接口与流程。</div>
            </div>
          </div>
          <div class="formpilot-v2-section">
            <div class="formpilot-v2-section-head">
              <div>
                <div class="formpilot-v2-section-title">接口库</div>
                <div class="formpilot-v2-section-sub">先粘贴 curl，解析后保存为接口，供流程模板复用。</div>
              </div>
              <div class="formpilot-v2-found-count" data-metric="apiInterfaceCount">接口 0 个</div>
            </div>
            <label class="formpilot-v2-stack">
              <span class="formpilot-v2-inline-label">接口名称</span>
              <input class="formpilot-v2-text-input" data-role="api-interface-name" placeholder="例如：获取验证码 / 企业注册" />
            </label>
            <div class="formpilot-v2-api-scope-grid">
              <label class="formpilot-v2-stack">
                <span class="formpilot-v2-inline-label">项目</span>
                <input class="formpilot-v2-text-input" data-role="api-interface-project" placeholder="例如：社联注册" />
              </label>
              <label class="formpilot-v2-stack">
                <span class="formpilot-v2-inline-label">环境</span>
                <select class="formpilot-v2-template-select" data-role="api-interface-env">
                  <option value="dev">开发</option>
                  <option value="test" selected>测试</option>
                  <option value="staging">预发</option>
                  <option value="prod">生产</option>
                </select>
              </label>
              <label class="formpilot-v2-stack">
                <span class="formpilot-v2-inline-label">变量来源</span>
                <select class="formpilot-v2-template-select" data-role="api-interface-variable-source">
                  <option value="mock" selected>本地 Mock 生成</option>
                  <option value="llm">大模型生成</option>
                </select>
              </label>
            </div>
            <label class="formpilot-v2-stack">
              <span class="formpilot-v2-inline-label">curl 内容</span>
              <textarea class="formpilot-v2-textarea" data-role="api-curl-input" rows="5" placeholder="粘贴 curl 命令"></textarea>
            </label>
            <div class="formpilot-v2-action-hint formpilot-v2-api-hint">
              <span>解析后保存到接口库</span>
              <span>接口可被流程模板重复调用</span>
            </div>
            <div class="formpilot-v2-api-toolbar">
              <button class="formpilot-v2-action-btn accent" type="button" data-action="api-parse-save-interface">
                <span class="formpilot-v2-action-icon">⌘</span>
                <span>解析并保存接口</span>
              </button>
              <button class="formpilot-v2-action-btn ghost" type="button" data-action="api-clear-curl">
                <span class="formpilot-v2-action-icon">⌫</span>
                <span>清空输入</span>
              </button>
              <button class="formpilot-v2-action-btn ghost" type="button" data-action="api-open-center">
                <span class="formpilot-v2-action-icon">↗</span>
                <span>打开模板中心</span>
              </button>
            </div>
            <div class="formpilot-v2-api-summary" data-role="api-curl-preview">等待解析 curl。</div>
            <div class="formpilot-v2-api-list-group">
              <div class="formpilot-v2-api-subhead">已保存接口</div>
              <div class="formpilot-v2-api-list" data-role="api-interface-list"></div>
            </div>
          </div>
          <div class="formpilot-v2-section">
            <div class="formpilot-v2-section-head">
              <div>
                <div class="formpilot-v2-section-title">流程模板</div>
                <div class="formpilot-v2-section-sub">从已保存接口选择一步或多步，组合成可执行流程。</div>
              </div>
              <div class="formpilot-v2-found-count" data-metric="apiFlowCount">流程 0 个</div>
            </div>
            <label class="formpilot-v2-stack">
              <span class="formpilot-v2-inline-label">流程名称</span>
              <input class="formpilot-v2-text-input" data-role="api-flow-name" placeholder="例如：企业注册流程" />
            </label>
            <div class="formpilot-v2-api-scope-grid">
              <label class="formpilot-v2-stack">
                <span class="formpilot-v2-inline-label">项目</span>
                <input class="formpilot-v2-text-input" data-role="api-flow-project" placeholder="例如：社联注册" />
              </label>
              <label class="formpilot-v2-stack">
                <span class="formpilot-v2-inline-label">环境</span>
                <select class="formpilot-v2-template-select" data-role="api-flow-env">
                  <option value="dev">开发</option>
                  <option value="test" selected>测试</option>
                  <option value="staging">预发</option>
                  <option value="prod">生产</option>
                </select>
              </label>
            </div>
            <div class="formpilot-v2-api-toolbar formpilot-v2-api-step-toolbar">
              <select class="formpilot-v2-template-select formpilot-v2-api-source-select" data-role="api-interface-select">
                <option value="">（暂无接口）</option>
              </select>
              <button class="formpilot-v2-action-btn ghost formpilot-v2-icon-btn" type="button" data-action="api-add-step" title="添加步骤" aria-label="添加步骤">
                <span class="formpilot-v2-action-icon">＋</span>
              </button>
              <button class="formpilot-v2-action-btn primary formpilot-v2-action-btn-compact" type="button" data-action="api-save-flow">
                <span class="formpilot-v2-action-icon">保存</span>
                <span>保存流程</span>
              </button>
            </div>
            <div class="formpilot-v2-api-subhead">当前步骤</div>
            <div class="formpilot-v2-api-step-list" data-role="api-step-list"></div>
            <div class="formpilot-v2-api-list-group">
              <div class="formpilot-v2-api-subhead">已保存流程</div>
              <div class="formpilot-v2-api-list" data-role="api-flow-list"></div>
            </div>
          </div>
          <div class="formpilot-v2-section">
            <div class="formpilot-v2-section-head">
              <div>
                <div class="formpilot-v2-section-title">执行与日志</div>
                <div class="formpilot-v2-section-sub">选择流程模板，支持循环、间隔与失败重试。</div>
              </div>
              <div class="formpilot-v2-found-count" data-metric="apiRunCount">运行 0 次</div>
            </div>
            <select class="formpilot-v2-template-select formpilot-v2-api-run-select" data-role="api-flow-select">
              <option value="">（暂无流程模板）</option>
            </select>
            <div class="formpilot-v2-api-run-grid">
              <label class="formpilot-v2-stack">
                <span class="formpilot-v2-inline-label">循环次数</span>
                <input type="number" min="1" step="1" value="1" class="formpilot-v2-text-input" data-role="api-loop-count" />
              </label>
              <label class="formpilot-v2-stack">
                <span class="formpilot-v2-inline-label">间隔(ms)</span>
                <input type="number" min="0" step="100" value="300" class="formpilot-v2-text-input" data-role="api-interval-ms" />
              </label>
              <label class="formpilot-v2-stack">
                <span class="formpilot-v2-inline-label">失败重试</span>
                <input type="number" min="0" step="1" value="1" class="formpilot-v2-text-input" data-role="api-retry-count" />
              </label>
            </div>
            <div class="formpilot-v2-api-toolbar">
              <button class="formpilot-v2-action-btn primary" type="button" data-action="api-run-flow">
                <span class="formpilot-v2-action-icon">▶</span>
                <span>开始执行</span>
              </button>
              <button class="formpilot-v2-action-btn ghost" type="button" data-action="api-stop-flow">
                <span class="formpilot-v2-action-icon">⏸</span>
                <span>停止执行</span>
              </button>
              <button class="formpilot-v2-action-btn ghost" type="button" data-action="api-refresh">
                <span class="formpilot-v2-action-icon">↻</span>
                <span>刷新列表</span>
              </button>
            </div>
            <pre class="formpilot-v2-api-log" data-role="api-log">暂无日志</pre>
          </div>
        </div>
        <div class="formpilot-v2-panel-body formpilot-v2-crypto-panel" data-panel-body="crypto" hidden>
          <div class="formpilot-v2-section formpilot-v2-crypto-card">
            <div class="formpilot-v2-section-head">
              <div>
                <div class="formpilot-v2-section-title">数据加解</div>
                <div class="formpilot-v2-section-sub">选择已启用的项目后执行加密或解密。</div>
              </div>
            </div>
            <label class="formpilot-v2-stack">
              <span class="formpilot-v2-inline-label">项目</span>
              <select class="formpilot-v2-template-select" data-role="crypto-project-select">
                <option value="">请选择项目</option>
              </select>
            </label>
            <input class="formpilot-v2-text-input formpilot-v2-crypto-input" data-role="crypto-value-input" placeholder="请输入要加解的内容" />
            <div class="formpilot-v2-crypto-actions">
              <button class="formpilot-v2-action-btn accent" type="button" data-action="crypto-decrypt">
                <span class="formpilot-v2-action-icon">🔓</span>
                <span>解密</span>
              </button>
              <button class="formpilot-v2-action-btn accent" type="button" data-action="crypto-encrypt">
                <span class="formpilot-v2-action-icon">🔒</span>
                <span>加密</span>
              </button>
            </div>
            <div class="formpilot-v2-qr-output formpilot-v2-crypto-output" data-role="crypto-output" aria-live="polite">
              <div class="formpilot-v2-qr-empty formpilot-v2-crypto-empty">
                <span class="formpilot-v2-crypto-empty-icon" aria-hidden="true">🔑</span>
                <strong>暂无加解密结果</strong>
              </div>
            </div>
          </div>
        </div>
        <div class="formpilot-v2-footer-nav">
          <button class="formpilot-v2-nav-btn active" type="button" data-panel-tab="ui"><span>▦</span><em>界面面板</em></button>
          <button class="formpilot-v2-nav-btn" type="button" data-panel-tab="qr"><span class="formpilot-v2-qr-icon" aria-hidden="true"></span><em>条码面板</em></button>
          <button class="formpilot-v2-nav-btn" type="button" data-panel-tab="api"><span>◇</span><em>API 面板</em></button>
          <button class="formpilot-v2-nav-btn" type="button" data-panel-tab="crypto"><span>🔑</span><em>数据加解</em></button>
        </div>
      </div>
    `;

    const fab = document.createElement('button');
    fab.id = 'formpilot-v2-fab-btn';
    fab.type = 'button';
    fab.textContent = '填';
    fab.setAttribute('aria-label', 'FillForm 控制中心');

    root.appendChild(panel);
    root.appendChild(fab);
    document.documentElement.appendChild(root);
    renderFieldList(panel, []);
    renderQrPanel(panel);
    renderCryptoPanel(panel);
    ensureHighlightLayer();

    const refreshDisplay = (detail = state.lastDetail || []) => {
      state.lastDetail = Array.isArray(detail) ? detail.slice() : [];
      const detailList = state.lastDetail.slice();
      const detailIdSet = new Set(detailList.map((item) => item.id));
      for (const field of state.manualFields) {
        if (detailIdSet.has(field.id)) continue;
        detailList.push({
          id: field.id,
          kind: field.kind,
          selector: field.selector,
          domId: field.domId || '',
          ok: true,
          manualAdded: true,
          reason: '手动补点字段'
        });
      }

      const displayFields = getAllDisplayFields();
      const highlightFields = displayFields.slice();
      if (state.manualHoverField) {
        highlightFields.push(state.manualHoverField);
        detailList.push({
          id: state.manualHoverField.id,
          manualHover: true,
          ok: true
        });
      }
      if (state.manualSelectedFieldId) {
        detailList.push({
          id: state.manualSelectedFieldId,
          manualSelected: true,
          ok: true
        });
      }

      setMetric(panel, 'found', displayFields.length);
      setMetric(panel, 'foundText', `已检测 ${displayFields.length} 个`);
      setMetric(panel, 'syncText', state.manualFields.length ? `已同步 ${state.manualFields.length} 个手动字段` : '自动同步中');
      renderFieldList(panel, displayFields, {}, detailList);
      updateMissingBlock(panel, displayFields, detailList);
      updateInsightMetrics(panel, displayFields, detailList);
      rememberHighlights(highlightFields, detailList);
    };

    const updateTemplateSelector = (templates = [], selectedName = '') => {
      const select = panel.querySelector('.formpilot-v2-template-select');
      if (!(select instanceof HTMLSelectElement)) return;
      select.innerHTML = '';
      if (!templates.length) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '（无可用模板）';
        select.appendChild(empty);
        setMetric(panel, 'templateCount', '模板 0 个');
        return;
      }
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '请选择模板';
      select.appendChild(placeholder);
      for (const item of templates) {
        const option = document.createElement('option');
        option.value = item.name || '';
        option.textContent = item.name || '未命名模板';
        select.appendChild(option);
      }
      if (selectedName) select.value = selectedName;
      setMetric(panel, 'templateCount', `模板 ${templates.length} 个`);
    };

    const reloadTemplateList = async () => {
      try {
        const res = await sendRuntimeMessage(
          { type: 'formpilotv2:list-field-mapping-templates' },
          10000,
          '读取模板列表'
        );
        if (res?.ok) {
          state.pathKey = res.pathKey || state.pathKey || '';
          updateTemplateSelector(Array.isArray(res.templates) ? res.templates : []);
          return;
        }
      } catch {
        // 兼容旧后台：忽略即可
      }
      updateTemplateSelector([]);
    };

    const reloadManualFieldLibrarySelf = async () => {
      try {
        const res = await sendRuntimeMessage(
          { type: 'formpilotv2:list-manual-fields-self' },
          10000,
          '读取手动字段库'
        );
        if (!res?.ok) return;
        state.pathKey = res.pathKey || state.pathKey || '';
        const savedFields = Array.isArray(res.entries)
          ? res.entries
            .map((entry) => entry?.field || null)
            .filter(Boolean)
            .map((field) => ({ ...field, source: 'manual-library' }))
          : [];
        const merged = [];
        for (const field of [...savedFields, ...state.manualFields]) {
          const duplicated = findDuplicateField(field, merged);
          if (!duplicated?.duplicated) merged.push(field);
        }
        state.manualFields = merged;
        refreshDisplay(state.lastDetail || []);
      } catch {
        // ignore
      }
    };

    const flashManualSelection = (fieldId) => {
      if (state.manualSelectedTimer) {
        window.clearTimeout(state.manualSelectedTimer);
        state.manualSelectedTimer = 0;
      }
      state.manualSelectedFieldId = fieldId;
      refreshDisplay(state.lastDetail || []);
      state.manualSelectedTimer = window.setTimeout(() => {
        state.manualSelectedTimer = 0;
        if (state.manualSelectedFieldId === fieldId) {
          state.manualSelectedFieldId = '';
          refreshDisplay(state.lastDetail || []);
        }
      }, 1500);
    };

    const clearManualHover = () => {
      if (!state.manualHoverField) return;
      state.manualHoverField = null;
      refreshDisplay();
    };

    const updateManualGuide = (mode = 'idle') => {
      const guideNode = panel.querySelector('[data-role="manual-guide"]');
      if (!(guideNode instanceof HTMLElement)) return;
      guideNode.dataset.mode = mode;
      if (mode === 'active') {
        guideNode.textContent = '补点中：控制中心已收起，请直接点击页面字段，按 Esc 可结束补点。';
        return;
      }
      if (mode === 'done') {
        guideNode.textContent = '已补点：请先在字段列表确认映射类型并点击“保存”，如需定制数据规则请点右上角齿轮进入设置中心。';
        return;
      }
      guideNode.textContent = '补点流程：1) 点“手动补点”；2) 点页面遗漏字段；3) 按 Esc 结束；4) 点击“保存”沉淀模板；5) 在设置中心「手动字段库」点“带入规则”。';
    };

    const manualHoverHandler = (ev) => {
      if (!state.manualPickEnabled) return;
      const target = findManualFillTarget(ev.target, root);
      if (!target) {
        clearManualHover();
        return;
      }
      const field = buildManualFieldFromElement(target);
      const hoverId = `manual_hover_${field.domId || Math.random().toString(36).slice(2, 8)}`;
      if (state.manualHoverField && state.manualHoverField.id === hoverId) return;
      state.manualHoverField = {
        ...field,
        id: hoverId,
        source: 'manual-hover'
      };
      refreshDisplay();
    };

    const manualPickHandler = (ev) => {
      if (!state.manualPickEnabled) return;
      const target = findManualFillTarget(ev.target, root);
      if (!target) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === 'function') {
        ev.stopImmediatePropagation();
      }

      const field = buildManualFieldFromElement(target);
      const autoDup = findDuplicateField(field, state.detectedFields);
      const manualDup = findDuplicateField(field, state.manualFields);
      const duplicateNotes = [];

      if (autoDup.duplicated) {
        const duplicatedId = autoDup.field?.id || '';
        if (duplicatedId) {
          state.detectedFields = state.detectedFields.filter((item) => item.id !== duplicatedId);
          state.lastDetail = (state.lastDetail || []).filter((item) => item.id !== duplicatedId);
        }
        const evidence = autoDup.reason || buildDuplicateEvidence(field, autoDup.field, autoDup.matchedBy || []);
        duplicateNotes.push(`检测到自动字段重复，已切换为手动字段${evidence ? `（${evidence}）` : ''}`);
      }

      if (manualDup.duplicated) {
        const duplicatedId = manualDup.field?.id || '';
        const duplicateIdentity = buildFieldIdentity(manualDup.field);
        state.manualFields = state.manualFields.filter((item) => {
          if (duplicatedId && item.id === duplicatedId) return false;
          return !duplicateIdentity || buildFieldIdentity(item) !== duplicateIdentity;
        });
        state.lastDetail = (state.lastDetail || []).filter((item) => item.id !== duplicatedId);
        const evidence = manualDup.reason || buildDuplicateEvidence(field, manualDup.field, manualDup.matchedBy || []);
        duplicateNotes.push(`检测到手动字段重复，已按你本次点击覆盖${evidence ? `（${evidence}）` : ''}`);
      }

      const currentIdentity = buildFieldIdentity(field);
      state.manualFields = [
        field,
        ...state.manualFields.filter((item) => item.id !== field.id && (!currentIdentity || buildFieldIdentity(item) !== currentIdentity))
      ];
      state.lastManualField = field;
      state.lastDetail = [
        ...(state.lastDetail || []).filter((item) => item.id !== field.id),
        {
          id: field.id,
          kind: field.kind,
          selector: field.selector,
          domId: field.domId || '',
          ok: true,
          manualAdded: true,
          reason: '手动补点字段'
        }
      ];
      state.manualHoverField = null;
      flashManualSelection(field.id);
      setBadge(panel, `手动补点 ${state.manualFields.length}`, 'progress');
      setMetric(panel, 'syncText', `已同步 ${state.manualFields.length} 个手动字段`);
      if (duplicateNotes.length) {
        appendStatus(panel, duplicateNotes.join('；'));
      }
      sendRuntimeMessage(
        { type: 'formpilotv2:save-manual-field-self', field },
        10000,
        '保存手动字段'
      ).catch(() => null);
      const displayLabel = field.label || field.placeholder || field.selector || field.id;
      const basisParts = [];
      const identityParts = getFieldIdentityParts(field);
      if (identityParts.domId) basisParts.push('稳定 domId');
      if (identityParts.containerSelector) basisParts.push('容器上下文');
      if (identityParts.detailSelector) basisParts.push('分组线索');
      if (identityParts.sectionVariant) basisParts.push(`中/英标记 ${identityParts.sectionVariant.toUpperCase()}`);
      if (identityParts.geometry) basisParts.push(`位置 ${identityParts.geometry}`);
      appendStatus(panel, `已手动添加字段：${displayLabel}${basisParts.length ? `（区分依据：${basisParts.join(' / ')}）` : ''}`);
      if (!state.manualFlowHintShown) {
        state.manualFlowHintShown = true;
        appendStatus(panel, '下一步：先在字段列表确认映射类型并点“保存”；如需指定港版手机号/机构宗旨等规则，点右上角齿轮进入设置中心操作。');
      }
      updateManualGuide('done');
      persistManualFieldToLibrary(field).then((res) => {
        if (res?.ok) {
          appendStatus(panel, '该字段已写入手动字段库，可在设置中心直接带入 Mock 规则');
          return;
        }
        appendStatus(panel, `手动字段入库失败：${res?.error || '未知错误'}`);
      });
    };

    const manualKeydownHandler = (ev) => {
      if (!state.manualPickEnabled) return;
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      toggleManualPick(false, { reason: '手动补点已关闭（Esc）' });
    };

    const toggleManualPick = (enabled, options = {}) => {
      state.manualPickEnabled = !!enabled;
      root.dataset.manualPick = enabled ? 'true' : 'false';
      document.documentElement.classList.toggle('formpilot-v2-manual-pick', !!enabled);
      const manualBtns = panel.querySelectorAll('[data-action="manual-pick"]');
      manualBtns.forEach((btn) => {
        if (btn instanceof HTMLElement) {
          btn.dataset.active = enabled ? 'true' : 'false';
        }
      });
      if (enabled) {
        state.manualPickPanelWasOpen = panel.classList.contains('open');
        if (state.manualPickPanelWasOpen) {
          panel.classList.remove('open');
        }
        document.addEventListener('click', manualPickHandler, true);
        document.addEventListener('mousemove', manualHoverHandler, true);
        document.addEventListener('keydown', manualKeydownHandler, true);
        updateManualGuide('active');
        appendStatus(panel, '手动补点已开启：控制中心已收起，请点击页面中遗漏字段（Esc 结束）');
        setBadge(panel, '手动补点中', 'progress');
      } else {
        document.removeEventListener('click', manualPickHandler, true);
        document.removeEventListener('mousemove', manualHoverHandler, true);
        document.removeEventListener('keydown', manualKeydownHandler, true);
        clearManualHover();
        if (state.manualSelectedTimer) {
          window.clearTimeout(state.manualSelectedTimer);
          state.manualSelectedTimer = 0;
        }
        state.manualSelectedFieldId = '';
        if (state.manualPickPanelWasOpen) {
          syncPanelPlacement(root, panel);
          panel.classList.add('open');
          requestAnimationFrame(() => syncPanelPlacement(root, panel));
          state.manualPickPanelWasOpen = false;
        }
        updateManualGuide(state.manualFields.length ? 'done' : 'idle');
        appendStatus(panel, options.reason || '手动补点已关闭');
        setBadge(panel, '等待操作', 'normal');
      }
    };

    refreshDisplay([]);
    updateManualGuide('idle');
    applyVisiblePanelTabs(panel, state.visiblePanelTabs);
    reloadTemplateList().catch(() => {});
    reloadManualFieldLibrarySelf().catch(() => {});
    syncProviderFromSettings(panel).catch(() => {});
    syncFillScopeFromSettings(panel).catch(() => {});
    reloadApiTemplates(panel).catch(() => {});
    bindSettingsChangeListener(panel);

    const savedPosition = await loadOverlayPosition();
    if (savedPosition) {
      applyOverlayPosition(root, savedPosition);
    }

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    fab.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      dragging = true;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      const rect = root.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      fab.setPointerCapture(ev.pointerId);
    });

    fab.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.hypot(dx, dy) > 3) moved = true;
      applyOverlayPosition(root, {
        left: startLeft + dx,
        top: startTop + dy
      });
      if (panel.classList.contains('open')) {
        syncPanelPlacement(root, panel);
      }
    });

    const finishDrag = async () => {
      if (!dragging) return;
      dragging = false;
      const rect = root.getBoundingClientRect();
      const currentPosition = clampOverlayPosition(rect.left, rect.top);
      applyOverlayPosition(root, currentPosition);
      if (panel.classList.contains('open')) {
        syncPanelPlacement(root, panel);
      }
      await saveOverlayPosition(currentPosition);
    };

    fab.addEventListener('pointerup', finishDrag);
    fab.addEventListener('pointercancel', finishDrag);

    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      if (resizeRaf) return;
      resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = 0;
        const rect = root.getBoundingClientRect();
        applyOverlayPosition(root, {
          left: rect.left,
          top: rect.top
        });
        if (panel.classList.contains('open')) {
          syncPanelPlacement(root, panel);
        }
      });
    });

    fab.addEventListener('click', (ev) => {
      if (moved) {
        ev.preventDefault();
        return;
      }
      if (panel.classList.contains('open')) {
        if (state.manualPickEnabled) toggleManualPick(false);
        panel.classList.remove('open');
        return;
      }
      syncPanelPlacement(root, panel);
      panel.classList.add('open');
      requestAnimationFrame(() => syncPanelPlacement(root, panel));
    });

    panel.addEventListener('change', async (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLSelectElement)) return;

      if (target.classList.contains('formpilot-v2-source-select')) {
        await switchProvider(panel, target.value);
        return;
      }

      if (target.matches('[data-role="api-interface-select"]')) {
        state.apiSelectedInterfaceId = normText(target.value || '');
        const template = getCurrentInterfaceSelection(panel);
        const preview = panel.querySelector('[data-role="api-curl-preview"]');
        if (preview) preview.textContent = template ? buildApiPreview(template) : '等待解析 curl。';
        return;
      }

      if (target.matches('[data-role="api-flow-select"]')) {
        state.apiSelectedFlowId = normText(target.value || '');
        const template = getCurrentFlowSelection(panel);
        const preview = panel.querySelector('[data-role="api-curl-preview"]');
        if (preview && template) preview.textContent = buildApiPreview(template);
        return;
      }

      if (target.matches('[data-role="api-project-filter"]')) {
        state.apiProjectFilter = normText(target.value || '') || '__all__';
        renderApiTemplateCards(panel, state.apiTemplates);
        return;
      }

      if (target.matches('[data-role="api-env-filter"]')) {
        state.apiEnvFilter = normText(target.value || '') || '__all__';
        renderApiTemplateCards(panel, state.apiTemplates);
        return;
      }

      if (!target.classList.contains('formpilot-v2-kind-select')) return;
      const fieldId = target.getAttribute('data-field-id') || '';
      const nextKind = normText(target.value || '');
      if (!fieldId || !nextKind) return;

      const field = findFieldById(fieldId);
      if (!field) {
        appendStatus(panel, '字段映射更新失败：未找到字段');
        return;
      }

      const prevKind = field.kind || 'text';
      if (prevKind === nextKind) return;
      updateFieldKindLocal(fieldId, nextKind);
      refreshDisplay(state.lastDetail || []);
      appendStatus(panel, `字段映射已调整：${field.label || field.placeholder || field.selector} -> ${KIND_LABEL_MAP[nextKind] || nextKind}`);
      setBadge(panel, '映射已调整', 'progress');

      try {
        const res = await sendRuntimeMessage(
          { type: 'formpilotv2:set-field-mapping-self', field: { ...field, kind: nextKind }, kind: nextKind },
          10000,
          '保存字段映射'
        );
        if (!res?.ok) {
          appendStatus(panel, `保存映射失败：${res?.error || '未知错误'}`);
          setBadge(panel, '映射保存失败', 'warning');
          return;
        }
        appendStatus(panel, '映射已保存到当前路径模板库');
        setBadge(panel, '映射已保存', 'success');
      } catch (error) {
        appendStatus(panel, `保存映射失败：${error?.message || error}`);
        setBadge(panel, '映射保存失败', 'warning');
      }
    });

    panel.addEventListener('click', async (ev) => {
      const panelTab = ev.target instanceof Element ? ev.target.closest('[data-panel-tab]') : null;
      if (panelTab instanceof HTMLElement) {
        const nextPanel = panelTab.getAttribute('data-panel-tab') || 'ui';
        applyActivePanel(panel, nextPanel);
        if (state.activePanel === 'api') {
          await reloadApiTemplates(panel);
        }
        return;
      }

      const actionEl = ev.target instanceof Element ? ev.target.closest('[data-action]') : null;
      if (!(actionEl instanceof HTMLElement)) return;
      const action = actionEl.getAttribute('data-action');
      if (!action) return;
      if (pickActionTooFast(action)) return;
      if (!isRuntimeAvailable()) {
        if (state.manualPickEnabled) toggleManualPick(false);
        markContextInvalidated(panel, root);
        return;
      }

      if (action === 'qr-clear') {
        state.qrItems = [];
        state.qrNotice = '';
        renderQrPanel(panel);
        return;
      }

      if (action === 'qr-capture') {
        if (state.qrBusy) return;
        state.qrNotice = '';
        renderQrPanel(panel);
        setQrBusy(panel, true, '框选条码');
        appendStatus(panel, '条码截取识别：请拖拽框选条码区域');
        try {
          const selection = await qrSelector.activate();
          if (!selection) {
            setBadge(panel, '条码识别已取消', 'normal');
            return;
          }
          state.qrNotice = '正在识别条码...';
          renderQrPanel(panel);
          setBadge(panel, '识别中', 'progress');
          const res = await sendRuntimeMessage(
            {
              type: 'formpilotv2:qr-decode-self',
              mode: 'capture',
              rect: selection.rect,
              viewport: selection.viewport
            },
            MESSAGE_TIMEOUT_MS,
            '条码截取识别'
          );
          if (!res?.ok || !Array.isArray(res.results) || !res.results.length) {
            state.qrNotice = res?.error || '未识别到条码，请放大或重新框选。';
            renderQrPanel(panel);
            setBadge(panel, '识别失败', 'warning');
            appendStatus(panel, state.qrNotice);
            return;
          }
          appendQrResults(panel, res.results, 'capture');
          setBadge(panel, '识别完成', 'success');
          appendStatus(panel, `条码截取识别成功：${res.results.length} 个`);
        } catch (error) {
          if (isContextInvalidatedError(error)) { markContextInvalidated(panel, root); return; }
          state.qrNotice = error?.message || '未识别到条码，请放大或重新框选。';
          renderQrPanel(panel);
          setBadge(panel, '识别失败', 'warning');
          appendStatus(panel, state.qrNotice);
        } finally {
          qrSelector.deactivate();
          setQrBusy(panel, false);
        }
        return;
      }

      if (action === 'qr-global') {
        if (state.qrBusy) return;
        state.qrNotice = '正在扫描当前可视区域...';
        renderQrPanel(panel);
        setQrBusy(panel, true, '全局识别中');
        appendStatus(panel, '条码全局识别：扫描当前可视区域');
        try {
          const res = await sendRuntimeMessage(
            {
              type: 'formpilotv2:qr-decode-self',
              mode: 'global',
              viewport: getQrViewport()
            },
            MESSAGE_TIMEOUT_MS,
            '条码全局识别'
          );
          if (!res?.ok || !Array.isArray(res.results) || !res.results.length) {
            state.qrNotice = res?.error || '当前可视化区域内未识别到条码。';
            renderQrPanel(panel);
            setBadge(panel, '识别失败', 'warning');
            appendStatus(panel, state.qrNotice);
            return;
          }
          appendQrResults(panel, res.results, 'global');
          setBadge(panel, '识别完成', 'success');
          appendStatus(panel, `条码全局识别成功：${res.results.length} 个`);
        } catch (error) {
          if (isContextInvalidatedError(error)) { markContextInvalidated(panel, root); return; }
          state.qrNotice = error?.message || '当前可视化区域内未识别到条码。';
          renderQrPanel(panel);
          setBadge(panel, '识别失败', 'warning');
          appendStatus(panel, state.qrNotice);
        } finally {
          setQrBusy(panel, false);
        }
        return;
      }

      if (action === 'crypto-decrypt' || action === 'crypto-encrypt') {
        await runCryptoTransform(panel, root, action === 'crypto-encrypt' ? 'encrypt' : 'decrypt');
        return;
      }

      if (action === 'set-fill-scope') {
        const scope = actionEl.getAttribute('data-fill-scope') || 'all';
        try {
          await setFillOptionalFields(panel, scope !== 'required');
        } catch (error) {
          appendStatus(panel, `填写范围切换失败：${error?.message || error}`);
          setBadge(panel, '切换失败', 'warning');
        }
        return;
      }

      if (action === 'toggle-fill-optional') {
        try {
          await toggleFillOptionalFields(panel);
        } catch (error) {
          appendStatus(panel, `填写范围切换失败：${error?.message || error}`);
          setBadge(panel, '切换失败', 'warning');
        }
        return;
      }

      if (action === 'manual-pick') {
        if (panel.dataset.busy === 'true') {
          appendStatus(panel, '正在执行任务，请稍后再开启手动补点');
          return;
        }
        const nextEnabled = !state.manualPickEnabled;
        toggleManualPick(nextEnabled);
        actionEl.dataset.active = nextEnabled ? 'true' : 'false';
        return;
      }

      if (action === 'clear-highlights') {
        state.manualHoverField = null;
        clearHighlights();
        appendStatus(panel, '已清除页面框选');
        setBadge(panel, '框选已清除', 'normal');
        return;
      }

      if (action === 'manual-open-rules') {
        const seed = state.lastManualField || state.manualFields[0] || null;
        if (!seed) {
          appendStatus(panel, '暂无可补规则的手动字段，请先执行手动补点');
          setBadge(panel, '暂无手动字段', 'warning');
          return;
        }
        try {
          await sendRuntimeMessage(
            {
              type: 'formpilotv2:open-options-anchor',
              anchor: 'dataSection',
              seed: {
                pathKey: state.pathKey || '',
                kind: seed.kind || 'text',
                label: seed.label || '',
                placeholder: seed.placeholder || '',
                selector: seed.selector || '',
                fingerprint: seed.fingerprint || seed?.meta?.fieldFingerprint || '',
                title: seed.label || seed.placeholder || seed.selector || seed.id || '手动字段',
                matchText: seed.label || seed.placeholder || seed.selector || ''
              }
            },
            10000,
            '打开设置并定位规则'
          );
          appendStatus(panel, '已打开设置中心并定位到规则编辑区');
          setBadge(panel, '去设置补规则', 'success');
        } catch (error) {
          appendStatus(panel, `打开设置中心失败：${error?.message || error}`);
          setBadge(panel, '打开设置失败', 'error');
        }
        return;
      }

      if (action === 'manual-field-delete') {
        const fieldId = actionEl.getAttribute('data-field-id') || '';
        if (!fieldId) return;
        const idx = state.manualFields.findIndex((f) => f.id === fieldId);
        if (idx >= 0) {
          const removed = state.manualFields.splice(idx, 1)[0];
          state.lastDetail = (state.lastDetail || []).filter((item) => item.id !== fieldId);
          refreshDisplay(state.lastDetail || []);
          appendStatus(panel, `已移除手动字段：${removed.label || removed.placeholder || removed.selector || fieldId}`);
          setBadge(panel, `手动字段 ${state.manualFields.length}`, 'normal');
          setMetric(panel, 'syncText', state.manualFields.length ? `已同步 ${state.manualFields.length} 个手动字段` : '自动同步中');
        }
        return;
      }

      if (action === 'area-select') {
        if (panel.dataset.busy === 'true') {
          appendStatus(panel, '正在执行任务，请稍候再开启选区填充');
          return;
        }
        const isActive = actionEl.dataset.active === 'true';
        if (isActive) {
          areaSelector.deactivate();
          actionEl.dataset.active = 'false';
          appendStatus(panel, '选区填充已取消');
          setBadge(panel, '等待操作', 'normal');
          return;
        }
        actionEl.dataset.active = 'true';
        setBadge(panel, '请点击选区', 'progress');
        appendStatus(panel, '选区模式：请点击要填充的区域容器');
        try {
          const selector = await areaSelector.activate();
          actionEl.dataset.active = 'false';
          if (!selector) {
            appendStatus(panel, '选区已取消');
            setBadge(panel, '等待操作', 'normal');
            return;
          }
          appendStatus(panel, `选区已确认：${selector}，开始填充...`);
          setBadge(panel, '区域填充中', 'progress');
          setBusy(panel, true);
          const startedAt = performance.now();
          let res;
          try {
            const combinedFields = getAllDisplayFields();
            if (combinedFields.length > 0) {
              res = await sendRuntimeMessage(
                { type: 'formpilotv2:fill-custom-self', fields: combinedFields, scopeSelector: selector, validateAll: true },
                MESSAGE_TIMEOUT_MS + 5000,
                '选区填充'
              );
            } else {
              res = await sendRuntimeMessage(
                { type: 'formpilotv2:fill-self', scopeSelector: selector },
                MESSAGE_TIMEOUT_MS + 5000,
                '选区填充'
              );
            }
          } finally {
            if (panel.dataset.busy === 'true') setBusy(panel, false);
          }
          if (!res?.ok) {
            appendStatus(panel, `选区填充失败：${res?.error || '未知错误'}`);
            setBadge(panel, '选区填充失败', 'error');
            return;
          }
          const applied = Number(res.fillResult?.applied || 0);
          const failed = Number(res.fillResult?.failed || 0);
          const percent = (applied + failed) > 0 ? `${Math.round((applied / (applied + failed)) * 100)}%` : '0%';
          state.lastActionDurationMs = performance.now() - startedAt;
          if ((applied + failed) > 0) {
            state.lastAccuracyPct = (applied / (applied + failed)) * 100;
          }
          setBadge(panel, `选区填充完成 ${percent}`, failed ? 'warning' : 'success');
          appendStatus(panel, `选区填充完成：成功 ${applied}，失败 ${failed}`);
          scheduleHighlightAutoClear(3000);
        } catch (error) {
          actionEl.dataset.active = 'false';
          areaSelector.deactivate();
          if (isContextInvalidatedError(error)) { markContextInvalidated(panel, root); return; }
          appendStatus(panel, `选区填充异常：${error?.message || error}`);
          setBadge(panel, '选区填充失败', 'error');
        }
        return;
      }

      if (action === 'history') {
        appendStatus(panel, '历史功能即将上线，当前可在日志中查看执行轨迹');
        return;
      }

      if (action.startsWith('api-') && panel.dataset.busy === 'true' && action !== 'api-stop-flow') {
        appendApiLog(panel, '当前有 API 任务执行中，请稍候...');
        return;
      }

      if (action === 'api-template-refresh') {
        await reloadApiTemplates(panel);
        appendApiLog(panel, 'API 模板列表已刷新');
        return;
      }

      if (action === 'api-template-run') {
        await runSelectedApiTemplate(panel);
        return;
      }

      if (action === 'api-template-center') {
        try {
          await sendRuntimeMessage({ type: 'formpilotv2:open-template-center' }, 8000, '打开模板中心');
        } catch (error) {
          appendStatus(panel, `打开模板中心失败：${error?.message || error}`);
          setBadge(panel, '模板中心打开失败', 'error');
          return;
        }
        appendStatus(panel, '已打开模板中心');
        setBadge(panel, '模板中心已打开', 'success');
        return;
      }

      if (action === 'api-parse-save-interface') {
        await saveApiInterfaceFromCurl(panel);
        return;
      }

      if (action === 'api-clear-curl') {
        const nameInput = panel.querySelector('[data-role="api-interface-name"]');
        const curlInput = panel.querySelector('[data-role="api-curl-input"]');
        const preview = panel.querySelector('[data-role="api-curl-preview"]');
        if (nameInput instanceof HTMLInputElement) nameInput.value = '';
        if (curlInput instanceof HTMLTextAreaElement) curlInput.value = '';
        state.apiDraftParsed = null;
        if (preview) preview.textContent = '等待解析 curl。';
        appendApiLog(panel, '已清空接口输入。');
        return;
      }

      if (action === 'api-open-center') {
        try {
          await sendRuntimeMessage({ type: 'formpilotv2:open-template-center' }, 8000, '打开模板中心');
          appendApiLog(panel, '已打开模板中心');
        } catch (error) {
          appendApiLog(panel, `打开模板中心失败：${error?.message || error}`);
        }
        return;
      }

      if (action === 'api-refresh') {
        await reloadApiTemplates(panel);
        appendApiLog(panel, 'API 列表已刷新。');
        return;
      }

      if (action === 'api-add-step') {
        addApiStepFromSelectedInterface(panel);
        return;
      }

      if (action === 'api-save-flow') {
        await saveApiFlow(panel);
        return;
      }

      if (action === 'api-run-flow') {
        await runSelectedApiTemplate(panel);
        return;
      }

      if (action === 'api-stop-flow') {
        appendApiLog(panel, '当前版本的后台执行暂不支持强制中断。');
        return;
      }

      if (action === 'toggle-log') {
        panel.classList.toggle('log-visible');
        appendStatus(panel, panel.classList.contains('log-visible') ? '已展开日志面板' : '已收起日志面板');
        return;
      }

      if (action === 'clear-log') {
        const box = panel.querySelector('.formpilot-v2-status');
        if (box) box.textContent = '等待操作...';
        return;
      }

      if (action === 'template-save') {
        if (panel.dataset.busy === 'true') {
          appendStatus(panel, '正在执行任务，请稍候后再保存模板');
          return;
        }
        const defaultName = `模板_${new Date().toLocaleDateString().replace(/\//g, '-')}`;
        const templateName = window.prompt('请输入模板名称（用于当前页面路径）', defaultName);
        const name = normText(templateName || '');
        if (!name) return;
        try {
          const currentMappingRes = await sendRuntimeMessage(
            { type: 'formpilotv2:get-field-mapping-self' },
            10000,
            '读取当前映射'
          );
          const mappingPayload = currentMappingRes?.ok ? (currentMappingRes.mapping || {}) : {};
          const res = await sendRuntimeMessage(
            { type: 'formpilotv2:save-field-mapping-template', name, mapping: mappingPayload },
            12000,
            '保存模板'
          );
          if (!res?.ok) {
            appendStatus(panel, `模板保存失败：${res?.error || '未知错误'}`);
            setBadge(panel, '模板保存失败', 'warning');
            return;
          }
          state.pathKey = res.pathKey || state.pathKey || '';
          await reloadTemplateList();
          const select = panel.querySelector('.formpilot-v2-template-select');
          if (select instanceof HTMLSelectElement) select.value = name;
          appendStatus(panel, `模板已保存：${name}`);
          setBadge(panel, '模板已保存', 'success');
        } catch (error) {
          appendStatus(panel, `模板保存失败：${error?.message || error}`);
          setBadge(panel, '模板保存失败', 'warning');
        }
        return;
      }

      if (action === 'template-apply') {
        if (panel.dataset.busy === 'true') {
          appendStatus(panel, '正在执行任务，请稍候后再套用模板');
          return;
        }
        const select = panel.querySelector('.formpilot-v2-template-select');
        const templateName = select instanceof HTMLSelectElement ? normText(select.value || '') : '';
        if (!templateName) {
          appendStatus(panel, '请先选择要套用的模板');
          return;
        }
        try {
          const res = await sendRuntimeMessage(
            { type: 'formpilotv2:apply-field-mapping-template', name: templateName },
            12000,
            '套用模板'
          );
          if (!res?.ok) {
            appendStatus(panel, `套用模板失败：${res?.error || '未知错误'}`);
            setBadge(panel, '模板套用失败', 'warning');
            return;
          }
          appendStatus(panel, `模板已套用：${templateName}`);
          setBadge(panel, '模板已套用', 'success');
          // 模板套用后立即重新识别，刷新字段种类与框选。
          const scanRes = await sendRuntimeMessage({ type: 'formpilotv2:scan-self' }, MESSAGE_TIMEOUT_MS, '识别字段');
          if (scanRes?.ok) {
            state.pathKey = scanRes.pathKey || state.pathKey || '';
            state.detectedFields = Array.isArray(scanRes.fields) ? scanRes.fields : [];
            state.lastDetail = [];
            refreshDisplay([]);
          }
        } catch (error) {
          appendStatus(panel, `套用模板失败：${error?.message || error}`);
          setBadge(panel, '模板套用失败', 'warning');
        }
        return;
      }

      if (action === 'fill-stop') {
        await requestStopFill(panel);
        return;
      }

      if (panel.dataset.busy === 'true') {
        appendStatus(panel, '正在处理上一个任务，请稍候...');
        return;
      }

      setBusy(panel, true);
      if (action === 'options') {
        try {
          await sendRuntimeMessage({ type: 'formpilotv2:open-options' }, 8000, '打开设置');
        } catch (error) {
          if (isContextInvalidatedError(error)) {
            if (state.manualPickEnabled) toggleManualPick(false);
            markContextInvalidated(panel, root);
            return;
          }
          appendStatus(panel, `打开设置失败: ${error?.message || error}`);
          setBadge(panel, '设置失败', 'error');
          return;
        } finally {
          if (panel.dataset.busy === 'true') setBusy(panel, false);
        }
        appendStatus(panel, '已打开设置中心');
        setBadge(panel, '设置已打开', 'success');
        return;
      }

      if (action === 'scan') {
        const startedAt = performance.now();
        setBadge(panel, '识别中', 'progress');
        appendStatus(panel, '开始识别字段...');
        let res = null;
        try {
          res = await sendRuntimeMessage({ type: 'formpilotv2:scan-self' }, MESSAGE_TIMEOUT_MS, '识别字段');
        } catch (error) {
          if (isContextInvalidatedError(error)) {
            if (state.manualPickEnabled) toggleManualPick(false);
            markContextInvalidated(panel, root);
            return;
          }
          appendStatus(panel, `识别失败: ${error?.message || error}`);
          setBadge(panel, '识别失败', 'error');
          state.detectedFields = [];
          state.lastDetail = [];
          refreshDisplay([]);
          clearHighlights();
          return;
        } finally {
          if (panel.dataset.busy === 'true') setBusy(panel, false);
        }
        if (!res?.ok) {
          appendStatus(panel, `识别失败: ${res?.error || '未知错误'}`);
          setBadge(panel, '识别失败', 'error');
          state.detectedFields = [];
          state.lastDetail = [];
          refreshDisplay([]);
          clearHighlights();
          return;
        }
        state.detectedFields = Array.isArray(res.fields) ? res.fields : [];
        state.pathKey = res.pathKey || state.pathKey || '';
        state.lastDetail = [];
        state.lastActionDurationMs = performance.now() - startedAt;
        const displayFields = getAllDisplayFields();
        const autoCount = state.detectedFields.length;
        const manualCount = state.manualFields.length;
        setMetric(panel, 'found', displayFields.length);
        setMetric(panel, 'filled', '0%');
        setBadge(panel, `识别完成 ${displayFields.length}`, 'success');
        refreshDisplay([]);
        reloadTemplateList().catch(() => {});
        reloadManualFieldLibrarySelf().catch(() => {});
        appendStatus(panel, `识别成功：自动 ${autoCount}，手动 ${manualCount}，总计 ${displayFields.length}`);
        return;
      }

      if (action === 'fill') {
        const runId = createFillRunId();
        state.fillRunId = runId;
        state.fillStopRequested = false;
        state.cancelledFillRunIds.delete(runId);
        setFillButtonState(panel, 'starting');
        const startedAt = performance.now();
        setBadge(panel, '填充中', 'progress');
        appendStatus(panel, '开始一键填充...');
        let res = null;
        try {
          const settings = await getSettings();
          if (isFillRunCancelled(runId)) {
            res = buildFillCancelledResponse(runId);
          }
          setFillButtonState(panel, isFillRunCancelled(runId) ? 'stopping' : 'running');
          const paginateEnabled = settings.paginateFillEnabled === true;
          if (res?.cancelled) {
            // 用户在后台填充请求发出前点击了停止。
          } else if (paginateEnabled) {
            res = await sendRuntimeMessage(
              { type: 'formpilotv2:fill-paginated-self', runId },
              Math.max(MESSAGE_TIMEOUT_MS * 6, 180000),
              '分页填充执行'
            );
          } else {
            // 多 tab 场景下，先在当前 tab 重新识别，再按识别结果填充，避免跨页面状态串台。
            const scanRes = await sendRuntimeMessage(
              { type: 'formpilotv2:scan-self' },
              MESSAGE_TIMEOUT_MS + 5000,
              '一键填充-识别'
            );
            if (isFillRunCancelled(runId)) {
              res = buildFillCancelledResponse(runId);
            } else if (!scanRes?.ok) {
              res = scanRes;
            } else {
              res = await sendRuntimeMessage(
                { type: 'formpilotv2:fill-custom-self', fields: scanRes.fields || [], validateAll: true, runId },
                MESSAGE_TIMEOUT_MS + 5000,
                '一键填充-执行'
              );
              if (res?.ok) {
                res.detectedFields = Array.isArray(scanRes.fields) ? scanRes.fields : [];
                res.pathKey = scanRes.pathKey || res.pathKey || '';
              }
            }
          }

          const autoDetected = Array.isArray(res?.detectedFields) ? res.detectedFields : [];
          const manualExtra = state.manualFields.filter((field) => !findDuplicateField(field, autoDetected).duplicated);
          if (res?.ok && !paginateEnabled && manualExtra.length > 0 && !isFillRunCancelled(runId)) {
            const manualRes = await sendRuntimeMessage(
              { type: 'formpilotv2:fill-custom-self', fields: manualExtra, validateAll: true, runId },
              MESSAGE_TIMEOUT_MS + 5000,
              '手动字段补填'
            );
            if (manualRes?.cancelled) {
              res = manualRes;
            } else if (manualRes?.ok) {
              const baseApplied = Number(res?.fillResult?.applied || 0);
              const baseFailed = Number(res?.fillResult?.failed || 0);
              const extraApplied = Number(manualRes?.fillResult?.applied || 0);
              const extraFailed = Number(manualRes?.fillResult?.failed || 0);
              const mergedDetail = new Map();
              const baseDetail = Array.isArray(res?.fillResult?.detail) ? res.fillResult.detail : [];
              const extraDetail = Array.isArray(manualRes?.fillResult?.detail) ? manualRes.fillResult.detail : [];
              for (const item of baseDetail) mergedDetail.set(item.id || `base_${mergedDetail.size}`, item);
              for (const item of extraDetail) mergedDetail.set(item.id || `extra_${mergedDetail.size}`, item);

              res.fillResult = {
                ...(res.fillResult || {}),
                applied: baseApplied + extraApplied,
                failed: baseFailed + extraFailed,
                detail: Array.from(mergedDetail.values())
              };
              appendStatus(panel, `手动字段补填：成功 ${extraApplied}，失败 ${extraFailed}`);
            } else {
              appendStatus(panel, `手动字段补填失败：${manualRes?.error || '未知错误'}`);
            }
          } else if (res?.ok && isFillRunCancelled(runId)) {
            res = buildFillCancelledResponse(runId);
          }
        } catch (error) {
          if (isFillRunCancelled(runId)) {
            res = buildFillCancelledResponse(runId);
          } else {
            if (isContextInvalidatedError(error)) {
              if (state.manualPickEnabled) toggleManualPick(false);
              markContextInvalidated(panel, root);
              return;
            }
            appendStatus(panel, `填充失败: ${error?.message || error}`);
            setBadge(panel, '填充失败', 'error');
            return;
          }
        } finally {
          if (state.fillRunId === runId) {
            state.fillRunId = '';
            state.fillStopRequested = false;
            if (root.dataset.invalidated !== 'true') setFillButtonState(panel, 'idle');
          }
          if (panel.dataset.busy === 'true' && root.dataset.invalidated !== 'true') setBusy(panel, false);
        }
        if (res?.cancelled) {
          appendStatus(panel, '填充已停止');
          setBadge(panel, '已停止', 'normal');
          return;
        }
        if (!res?.ok) {
          appendStatus(panel, `填充失败: ${res?.error || '未知错误'}`);
          setBadge(panel, '填充失败', 'error');
          return;
        }
        const applied = Number(res.fillResult?.applied || 0);
        const failed = Number(res.fillResult?.failed || 0);
        const total = applied + failed;
        const detectedTotal = Number(res.detectedFields?.length || res.fillPlan?.summary?.total || total);
        const preparedTotal = Number(res.fillPlan?.summary?.prepared || total);
        const droppedTotal = Number(res.fillPlan?.summary?.dropped || 0);
        const percent = total > 0 ? `${Math.round((applied / total) * 100)}%` : '0%';
        state.lastActionDurationMs = performance.now() - startedAt;
        state.lastAccuracyPct = total > 0 ? (applied / total) * 100 : state.lastAccuracyPct;
        setMetric(panel, 'filled', percent);
        setBadge(panel, `填充完成 ${percent}`, failed ? 'warning' : 'success');
        if (Array.isArray(res.detectedFields)) {
          state.detectedFields = res.detectedFields.filter((field) => field.source !== 'manual-pick');
        }
        state.pathKey = res.pathKey || state.pathKey || '';
        const detail = Array.isArray(res.fillResult?.detail) ? res.fillResult.detail.slice() : [];
        const dropped = Array.isArray(res.fillPlan?.dropped) ? res.fillPlan.dropped : [];
        for (const field of dropped) {
          detail.push({
            id: field.id,
            kind: field.kind,
            selector: field.selector,
            domId: field.domId || '',
            ok: false,
            skipped: true,
            reason: '低置信字段，已跳过'
          });
        }
        const displayFields = getAllDisplayFields();
        setMetric(panel, 'found', displayFields.length || detectedTotal);
        state.lastDetail = detail.slice();
        refreshDisplay(detail);
        scheduleHighlightAutoClear(3000);
        reloadTemplateList().catch(() => {});
        if (res.pagination?.enabled) {
          const reasonMap = {
            'submit-page': '已到提交页',
            'no-next-action': '未找到下一页动作',
            'next-blocked': '下一页未进入新页，可能存在当前页校验错误',
            'next-click-failed': '下一页点击失败',
            'action-detect-failed': '页面动作识别失败',
            'scan-failed': '当前页识别失败',
            'fill-failed': '当前页填充失败',
            'loop-detected': '检测到页面循环',
            'max-pages-reached': '达到最大页数保护'
          };
          const pageCount = Number(res.pagination.pageCount || 0);
          const stopReason = res.pagination.stopReason || '';
          appendStatus(panel, `分页填充：已处理 ${pageCount} 页，${reasonMap[stopReason] || stopReason || '已停止'}`);
          const lastPage = Array.isArray(res.pagination.pages) ? res.pagination.pages[res.pagination.pages.length - 1] : null;
          if (lastPage?.stopMessage) appendStatus(panel, lastPage.stopMessage);
        }
        const failedRows = detail.filter((item) => item && item.ok === false && !item.skipped).slice(0, 6);
        failedRows.forEach((row) => {
          const field = displayFields.find((f) => f.id === row.id);
          const name = field?.label || field?.placeholder || field?.selector || row.selector || row.id;
          appendStatus(panel, `字段填充失败：${name}${row.reason ? `（${row.reason}）` : ''}`);
        });
        appendStatus(panel, `填充完成：识别 ${detectedTotal}，计划填充 ${preparedTotal}，跳过 ${droppedTotal}，成功 ${applied}，失败 ${failed}`);
      }
    });

    window.addEventListener(
      'resize',
      () => {
        if (panel.classList.contains('open')) {
          syncPanelPlacement(root, panel);
        }
        scheduleHighlightRefresh();
      },
      { passive: true }
    );

    window.addEventListener(
      'scroll',
      () => {
        scheduleHighlightRefresh();
      },
      { passive: true, capture: true }
    );
  }

  const ACTION_TEXT_PATTERNS = {
    prev: /(?:\u4e0a\u4e00[\u9875\u9801]|\u4e0a\u4e00\u6b65|\u8fd4\u56de|\u4e0a\u4e00|previous|prev|back)/i,
    next: /(?:\u4e0b\u4e00[\u9875\u9801]|\u4e0b\u4e00\u6b65|\u7ee7\u7eed|\u7e7c\u7e8c|\u4e0b\u4e00|next|continue)/i,
    submit: /(?:\u63d0\u4ea4|\u78ba\u8a8d\u652f\u4ed8|\u786e\u8ba4\u652f\u4ed8|\u78ba\u8a8d\u63d0\u4ea4|\u786e\u8ba4\u63d0\u4ea4|\u9001\u51fa|\u905e\u4ea4|\u652f\u4ed8|submit|confirm\s*(payment|pay|submit)?|pay\s*now)/i
  };

  const ACTION_CONTROL_SELECTOR = [
    'button',
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    'a[href]'
  ].join(',');

  const ACTION_FIELD_CONTROL_SELECTOR = [
    'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"])',
    'textarea',
    'select',
    'button[role="combobox"]',
    '[role="combobox"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[contenteditable="true"]'
  ].join(',');

  function hashActionText(input = '') {
    const text = String(input || '');
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function isElementVisibleForAction(el) {
    if (!el || !(el instanceof Element)) return false;
    if (el.hidden || el.closest('[aria-hidden="true"]') || el.closest(`#${OVERLAY_ID}`)) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getActionNodeText(el) {
    if (!(el instanceof Element)) return '';
    return normText(
      el.innerText ||
      el.textContent ||
      el.getAttribute('value') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      ''
    );
  }

  function getActionSignal(el) {
    if (!(el instanceof Element)) return '';
    return normText([
      getActionNodeText(el),
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.getAttribute('name') || '',
      el.getAttribute('id') || '',
      el.getAttribute('data-action') || '',
      el.getAttribute('class') || ''
    ].join(' '));
  }

  function getActionTextSignal(el) {
    if (!(el instanceof Element)) return '';
    return normText([
      getActionNodeText(el),
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.getAttribute('name') || '',
      el.getAttribute('id') || '',
      el.getAttribute('data-action') || ''
    ].join(' '));
  }

  function hasActionClassHint(className = '') {
    return String(className)
      .split(/\s+/)
      .filter(Boolean)
      .some((token) => /^(submit-btn|btn-submit|btn-primary|primary|action-btn|footer-btn|pager-btn|pagination-btn)$/i.test(token));
  }

  function hasExcludedActionClass(className = '') {
    return String(className)
      .split(/\s+/)
      .filter(Boolean)
      .some((token) => (
        /(?:^|[-_])(?:runtime-control-clear|runtime-input-clear|runtime-upload|upload-trigger|upload-image|cascader-trigger|mobile-area-code|calendar|signature|radio-group|checkbox-root|radio-group-item|select-trigger|combobox)(?:$|[-_])/i.test(token)
        || /(?:^|[-_])(?:date|time)[-_]?(?:picker|input|trigger|selector|panel)(?:$|[-_])/i.test(token)
      ));
  }

  function labelForActionControl(el) {
    if (!(el instanceof Element)) return '';
    const labels = el.labels ? Array.from(el.labels).map((node) => normText(node.textContent)).filter(Boolean) : [];
    if (labels.length) return labels.join(' / ');
    const id = el.getAttribute('id');
    if (id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (explicit) return normText(explicit.textContent);
    }
    const container = el.closest('.fb-form-field, .fb-form-item, .form-item, .form-field, .arco-form-item, .ant-form-item, .el-form-item, [role="group"], fieldset');
    if (container) {
      const candidate = container.querySelector('.fb-form-label, .label, label, legend, .arco-form-item-label, .ant-form-item-label, .el-form-item__label');
      if (candidate) return normText(candidate.textContent).slice(0, 120);
    }
    return '';
  }

  function collectActionFieldSignature() {
    const rows = Array.from(document.querySelectorAll(ACTION_FIELD_CONTROL_SELECTOR))
      .filter(isElementVisibleForAction)
      .filter((el) => !el.closest(`#${OVERLAY_ID}`))
      .filter((el) => {
        const tag = el.tagName.toLowerCase();
        const type = String(el.getAttribute('type') || '').toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'reset' || type === 'button') return false;
        if (tag === 'button' && el.getAttribute('role') !== 'combobox') return false;
        return true;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return [
          el.tagName.toLowerCase(),
          String(el.getAttribute('type') || '').toLowerCase(),
          String(el.getAttribute('role') || '').toLowerCase(),
          labelForActionControl(el),
          el.getAttribute('placeholder') || '',
          getActionNodeText(el).slice(0, 120),
          Math.round(rect.top / 8) * 8,
          Math.round(rect.left / 8) * 8
        ].join('|');
      });
    return hashActionText(rows.join('\n'));
  }

  function detectPageInfoFromText() {
    const bodyText = normText(document.body?.innerText || '');
    const zh = bodyText.match(/\u7b2c\s*(\d+)\s*[\u9875\u9801]\s*\/\s*\u5171\s*(\d+)\s*[\u9875\u9801]/);
    if (zh) {
      return {
        current: Number(zh[1] || 0) || 0,
        total: Number(zh[2] || 0) || 0,
        source: 'text-page-marker',
        text: zh[0]
      };
    }
    const en = bodyText.match(/\bpage\s*(\d+)\s*(?:of|\/)\s*(\d+)\b/i);
    if (en) {
      return {
        current: Number(en[1] || 0) || 0,
        total: Number(en[2] || 0) || 0,
        source: 'text-page-marker',
        text: en[0]
      };
    }
    const ariaCurrent = document.querySelector('[aria-current="step"], [aria-current="page"], [data-current="true"], .active[data-step], .current[data-step]');
    if (ariaCurrent instanceof Element) {
      const currentText = normText(ariaCurrent.getAttribute('data-step') || ariaCurrent.textContent || '');
      const current = Number((currentText.match(/\d+/) || [])[0] || 0) || 0;
      const stepNodes = Array.from(document.querySelectorAll('[data-step], [role="tab"], [aria-current="step"], [aria-current="page"]'))
        .filter(isElementVisibleForAction);
      if (current || stepNodes.length > 1) {
        return {
          current,
          total: stepNodes.length > 1 ? stepNodes.length : 0,
          source: 'step-indicator',
          text: currentText
        };
      }
    }
    return { current: 0, total: 0, source: '', text: '' };
  }

  function isActionExcludedControl(el) {
    if (!(el instanceof Element)) return true;
    const role = String(el.getAttribute('role') || '').toLowerCase();
    if (['combobox', 'radio', 'checkbox', 'switch', 'tab', 'option', 'menuitem'].includes(role)) return true;
    const tag = el.tagName.toLowerCase();
    const type = String(el.getAttribute('type') || '').toLowerCase();
    if (tag === 'input' && !['button', 'submit'].includes(type)) return true;
    const className = String(el.getAttribute('class') || '');
    if (hasExcludedActionClass(className)) {
      return true;
    }
    if (el.closest('.fb-runtime-control-clear, .fb-runtime-input-clear, .fb-runtime-upload-trigger, .fb-runtime-upload-image-trigger, .fb-signature-empty-trigger')) return true;
    return false;
  }

  function inferActionTextKind(signal = '') {
    if (ACTION_TEXT_PATTERNS.prev.test(signal)) return 'prev';
    if (ACTION_TEXT_PATTERNS.next.test(signal)) return 'next';
    if (ACTION_TEXT_PATTERNS.submit.test(signal)) return 'submit';
    return '';
  }

  function isSafeActionAnchor(el, requestedAction = '') {
    if (!(el instanceof Element) || el.tagName.toLowerCase() !== 'a') return true;
    if (el.closest('.fb-runtime-form-footer, .fb-runtime-form-footer__powered-by, footer, [class*="powered-by"], [class*="powered_by"], [class*="copyright"]')) {
      return false;
    }
    const explicitKind = inferActionTextKind(getActionTextSignal(el));
    if (!explicitKind || (requestedAction && explicitKind !== requestedAction)) return false;
    if (String(el.getAttribute('target') || '').toLowerCase() === '_blank') return false;
    const href = el.getAttribute('href');
    if (!href) return false;
    try {
      const url = new URL(href, location.href);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === location.origin;
    } catch {
      return false;
    }
  }

  function scoreActionCandidate(el, context = {}) {
    const rect = el.getBoundingClientRect();
    const signal = getActionTextSignal(el);
    const className = String(el.getAttribute('class') || '');
    const tag = el.tagName.toLowerCase();
    const type = String(el.getAttribute('type') || '').toLowerCase();
    const textKind = inferActionTextKind(signal);
    const inField = !!el.closest('.fb-form-field, .fb-form-item, .form-item, .form-field, .arco-form-item, .ant-form-item, .el-form-item, fieldset');
    const actionContainer = el.closest('[class*="footer"], [class*="action"], [class*="submit"], [class*="pager"], [class*="pagination"], [class*="button-group"], [data-actions], [data-footer]');
    let score = 0;
    if (tag === 'button' || tag === 'input') score += 2;
    if (type === 'button' || type === 'submit') score += 2;
    if (hasActionClassHint(className)) score += 8;
    if (actionContainer) score += 5;
    if (rect.width >= 80 && rect.height >= 30) score += 2;
    if (rect.width >= 120) score += 2;
    if (rect.height >= 40) score += 1;
    if (context.maxControlBottom && rect.top >= context.maxControlBottom - 220) score += 3;
    if (window.innerHeight && rect.top > window.innerHeight * 0.45) score += 1;
    if (textKind) score += 6;
    if (inField && !hasActionClassHint(className)) score -= 8;
    if (hasExcludedActionClass(className)) score -= 8;
    if (el.getAttribute('aria-disabled') === 'true' || el.disabled) score -= 20;
    return { score, textKind };
  }

  function groupActionRows(candidates = []) {
    const sorted = [...candidates].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const rows = [];
    for (const candidate of sorted) {
      let row = rows.find((item) => Math.abs(item.y - candidate.rect.y) <= 18);
      if (!row) {
        row = { y: candidate.rect.y, items: [] };
        rows.push(row);
      }
      row.items.push(candidate);
      row.y = Math.round((row.y + candidate.rect.y) / 2);
    }
    rows.forEach((row) => row.items.sort((a, b) => a.rect.x - b.rect.x));
    return rows;
  }

  function assignStructuralActionKinds(candidates = [], pageInfo = {}) {
    const rows = groupActionRows(candidates);
    const actionRows = rows
      .filter((row) => row.items.some((item) => item.score >= 8))
      .sort((a, b) => b.y - a.y);
    const primaryRow = actionRows[0] || rows[rows.length - 1] || { items: [] };
    const total = Number(pageInfo?.total || 0);
    const current = Number(pageInfo?.current || 0);
    const hasPageProgress = total > 1 && current > 0;

    for (const row of rows) {
      const rowItems = row.items;
      rowItems.forEach((item, index) => {
        let structuralKind = '';
        if (item.textKind) {
          structuralKind = item.textKind;
        } else if (row === primaryRow && hasPageProgress && item.tag !== 'a') {
          const isFirst = index === 0;
          const isLast = index === rowItems.length - 1;
          if (current <= 1 && rowItems.length === 1 && current < total) {
            structuralKind = 'next';
          } else if (current >= total) {
            if (rowItems.length >= 2 && isFirst) structuralKind = 'prev';
            else if (isLast) structuralKind = 'submit';
          } else if (current > 1 && current < total) {
            if (rowItems.length >= 2 && isFirst) structuralKind = 'prev';
            else if (isLast) structuralKind = 'next';
          }
        }
        item.kind = structuralKind || item.kind || '';
        item.safeNext = item.kind === 'next'
          && !item.disabled
          && item.score >= 8
          && (item.tag !== 'a' || item.textKind === 'next');
      });
    }
    return rows;
  }

  function collectPageActionState() {
    const controls = Array.from(document.querySelectorAll(ACTION_FIELD_CONTROL_SELECTOR))
      .filter(isElementVisibleForAction)
      .map((el) => el.getBoundingClientRect());
    const maxControlBottom = controls.reduce((max, rect) => Math.max(max, rect.bottom), 0);
    const pageInfo = detectPageInfoFromText();
    const rawNodes = Array.from(document.querySelectorAll(ACTION_CONTROL_SELECTOR))
      .filter(isElementVisibleForAction)
      .filter((el) => !isActionExcludedControl(el))
      .filter((el) => isSafeActionAnchor(el));
    const candidates = rawNodes
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const scored = scoreActionCandidate(el, { maxControlBottom });
        const className = String(el.getAttribute('class') || '');
        const text = getActionNodeText(el);
        const disabled = !!el.disabled || el.getAttribute('aria-disabled') === 'true';
        return {
          index,
          node: el,
          id: `act_${index}_${hashActionText(`${text}|${className}|${Math.round(rect.left)}|${Math.round(rect.top)}`)}`,
          kind: scored.textKind || '',
          textKind: scored.textKind || '',
          score: scored.score,
          disabled,
          tag: el.tagName.toLowerCase(),
          type: String(el.getAttribute('type') || '').toLowerCase(),
          role: String(el.getAttribute('role') || '').toLowerCase(),
          text,
          ariaLabel: el.getAttribute('aria-label') || '',
          title: el.getAttribute('title') || '',
          className: className.slice(0, 220),
          rect: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
          },
          html: el.outerHTML.replace(/\s+/g, ' ').slice(0, 500)
        };
      })
      .filter((item) => item.score >= 4)
      .sort((a, b) => b.score - a.score || b.rect.y - a.rect.y);
    const rows = assignStructuralActionKinds(candidates, pageInfo);
    const publicActions = candidates
      .map(({ node, ...item }) => item)
      .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const nextCandidates = publicActions
      .filter((item) => item.safeNext)
      .sort((a, b) => b.score - a.score || b.rect.y - a.rect.y);
    const prevCandidates = publicActions.filter((item) => item.kind === 'prev' && !item.disabled);
    const submitCandidates = publicActions.filter((item) => item.kind === 'submit' && !item.disabled);
    const fieldSignature = collectActionFieldSignature();
    const actionSignature = hashActionText(publicActions.map((item) => `${item.kind}|${item.text}|${item.rect.x}:${item.rect.y}:${item.rect.w}:${item.rect.h}`).join('\n'));
    const pageKey = [
      location.href,
      pageInfo.current || '',
      pageInfo.total || '',
      fieldSignature,
      actionSignature
    ].join('|');
    return {
      ok: true,
      url: location.href,
      pageInfo,
      fieldSignature,
      actionSignature,
      fingerprint: hashActionText(pageKey),
      actions: publicActions,
      actionRows: rows.map((row) => ({
        y: row.y,
        items: row.items.map((item) => item.id)
      })),
      nextCandidates,
      prevCandidates,
      submitCandidates
    };
  }

  function collectTransientPanelsForAction() {
    return Array.from(
      document.querySelectorAll(
        '[role="listbox"], [role="menu"], [role="tree"], [role="dialog"][data-state="open"], [data-radix-popper-content-wrapper], [id^="reka-select-content"], [id^="reka-popover-content"], .el-select-dropdown, .ant-select-dropdown, .ant-cascader-menus, .arco-select-dropdown, .arco-trigger-popup, .n-base-select-dropdown, .semi-select-dropdown, .t-select__dropdown, .t-select__menu, .rc-select-dropdown, .dropdown-menu, .dropdown__menu, .select-dropdown, [class*="select-dropdown"], [class*="select-popup"], .fb-runtime-cascader-panel, .fb-runtime-cascader-content, .fb-timepicker-container, .mobile-time-picker-panel, .time-picker-panel'
      )
    ).filter((node) => node instanceof Element && isElementVisibleForAction(node) && !node.closest(`#${OVERLAY_ID}`));
  }

  async function closeTransientPanelsForAction() {
    const panels = collectTransientPanelsForAction();
    if (!panels.length) return false;
    const init = { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape' };
    const targets = [
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
      document.body,
      document.documentElement
    ].filter(Boolean);
    for (const target of targets) {
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', init));
        target.dispatchEvent(new KeyboardEvent('keyup', init));
      } catch {
        // ignore
      }
    }
    try { document.activeElement?.blur?.(); } catch {}
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    return true;
  }

  async function clickPageAction(action = 'next') {
    await closeTransientPanelsForAction();
    const state = collectPageActionState();
    if (!state.ok) return state;
    const liveCandidates = collectPageActionState().actions || [];
    const candidates = action === 'next'
      ? liveCandidates.filter((item) => item.safeNext)
      : liveCandidates.filter((item) => item.kind === action && !item.disabled);
    const chosen = candidates.sort((a, b) => b.score - a.score || b.rect.y - a.rect.y)[0];
    if (!chosen) {
      return {
        ok: false,
        error: `No ${action} action candidate`,
        state
      };
    }
    const node = Array.from(document.querySelectorAll(ACTION_CONTROL_SELECTOR))
      .filter(isElementVisibleForAction)
      .filter((el) => !isActionExcludedControl(el))
      .filter((el) => isSafeActionAnchor(el))
      .find((el, index) => {
        const rect = el.getBoundingClientRect();
        const text = getActionNodeText(el);
        const className = String(el.getAttribute('class') || '');
        const id = `act_${index}_${hashActionText(`${text}|${className}|${Math.round(rect.left)}|${Math.round(rect.top)}`)}`;
        return id === chosen.id;
      });
    if (!(node instanceof HTMLElement)) {
      return {
        ok: false,
        error: 'Action candidate disappeared',
        state,
        chosen
      };
    }
    if (!isSafeActionAnchor(node, action)) {
      return {
        ok: false,
        error: 'Unsafe action anchor',
        state,
        chosen
      };
    }
    node.scrollIntoView({ block: 'center', inline: 'center' });
    await closeTransientPanelsForAction();
    node.click();
    return {
      ok: true,
      action,
      chosen,
      before: state
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (!msg?.type) return sendResponse({ ok: false, error: 'missing type' });

      if (msg.type === 'formpilotv2:scan') {
        if (!window.FormPilotV2Scan?.detectFields) {
          return sendResponse({ ok: false, error: 'scan 模块未就绪' });
        }
        const result = window.FormPilotV2Scan.detectFields(msg.scopeSelector || '');
        return sendResponse(result);
      }

      if (msg.type === 'formpilotv2:cancel-fill') {
        const runId = normText(msg.runId || msg.fillRunId || '');
        if (runId) rememberCancelledFillRun(runId);
        return sendResponse({ ok: true, cancelled: true, runId });
      }

      if (msg.type === 'formpilotv2:fill') {
        if (!window.FormPilotV2Fill?.fillFields) {
          return sendResponse({ ok: false, error: 'fill 模块未就绪' });
        }
        const runId = normText(msg.runId || msg.settings?.fillRunId || msg.settings?.runId || '');
        const fillSettings = {
          ...(msg.settings || {}),
          ...(runId ? { fillRunId: runId } : {})
        };
        const result = await window.FormPilotV2Fill.fillFields(
          msg.fields || [],
          msg.values || {},
          msg.scopeSelector || '',
          fillSettings
        );
        return sendResponse(result);
      }

      if (msg.type === 'formpilotv2:verify-fields') {
        if (!window.FormPilotV2Fill?.verifyFieldsCompletion) {
          return sendResponse({ ok: false, error: 'fill 校验模块未就绪' });
        }
        const result = window.FormPilotV2Fill.verifyFieldsCompletion(
          msg.fields || [],
          msg.scopeSelector || '',
          msg.settings || {}
        );
        return sendResponse(result);
      }

      if (msg.type === 'formpilotv2:show-fill-highlights') {
        const fields = Array.isArray(msg.fields) ? msg.fields : [];
        const detail = Array.isArray(msg.detail) ? msg.detail : [];
        rememberHighlights(fields, detail);
        scheduleHighlightAutoClear(Number(msg.autoHideMs || 0));
        return sendResponse({ ok: true, count: fields.length });
      }

      if (msg.type === 'formpilotv2:get-page-actions') {
        return sendResponse(collectPageActionState());
      }

      if (msg.type === 'formpilotv2:click-page-action') {
        return sendResponse(await clickPageAction(msg.action || 'next'));
      }

      return sendResponse({ ok: false, error: `unknown message: ${msg.type}` });
    })().catch((error) => {
      sendResponse({ ok: false, error: error?.message || String(error) });
    });

    return true;
  });

  injectOverlay().catch((error) => {
    console.warn('[FillForm] overlay inject failed', error);
  });
})();
