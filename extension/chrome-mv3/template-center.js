import { STORAGE_KEYS } from './core/types.js';
import { getTemplateStore } from './core/templateEngine.js';
import { applyApiChanges, ENDPOINTS_KEY } from './core/templatePersistence.js';

// ─── 工具 ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function logLine(text) {
  const box = $('flowRunLog');
  if (!box) return;
  const line = `[${new Date().toLocaleTimeString()}] ${text}`;
  box.textContent = `${line}\n${box.textContent}`.slice(0, 8000).trim();
}

function setStatus(text) {
  const badge = $('flowRunStatus');
  if (!badge) return;
  badge.textContent = text;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esc(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Tab 切换 ──────────────────────────────────────────────────────────────

document.querySelectorAll('.tc-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const key = tab.dataset.tab;
    document.querySelectorAll('.tc-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tc-section').forEach((s) => s.classList.remove('active'));
    const section = $(`tab-${key}`);
    if (section) section.classList.add('active');
    if (key === 'page') loadPageTemplates();
    if (key === 'api') loadApiTemplates();
  });
});

$('backToOptions')?.addEventListener('click', () => chrome.runtime.openOptionsPage());

// ─── 页面模板 ──────────────────────────────────────────────────────────────

function parseUiFieldFingerprint(fingerprint = '') {
  const parts = String(fingerprint || '').split('|');
  const meta = {};
  for (const part of parts) {
    const index = part.indexOf(':');
    if (index <= 0) continue;
    const key = part.slice(0, index);
    const value = part.slice(index + 1);
    meta[key] = value;
  }
  return {
    label: meta.label || '',
    selector: meta.sel || '',
    container: meta.container || '',
    placeholder: meta.ph || '',
    detail: meta.detail || '',
    variant: meta.variant || ''
  };
}

function getUiFieldTitle(meta = {}) {
  return meta.label || meta.placeholder || meta.selector || '未命名字段';
}

function buildUiTemplatePreview(fields = {}, limit = 3) {
  return Object.entries(fields || {})
    .map(([fingerprint, entry]) => {
      const meta = parseUiFieldFingerprint(fingerprint);
      return {
        title: getUiFieldTitle(meta),
        kind: entry?.kind || 'text'
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((entry) => `${entry.title} → ${entry.kind}`)
    .join('，');
}

function buildUiTemplateFieldDetails(fields = {}) {
  const entries = Object.entries(fields || {})
    .map(([fingerprint, entry]) => {
      const meta = parseUiFieldFingerprint(fingerprint);
      return {
        title: getUiFieldTitle(meta),
        selector: meta.selector || fingerprint,
        kind: entry?.kind || 'text',
        hits: Number(entry?.hits || 0),
        updatedAt: Number(entry?.updatedAt || 0) || 0
      };
    })
    .sort((a, b) => b.hits - a.hits || a.title.localeCompare(b.title));

  const details = document.createElement('details');
  details.className = 'tc-template-details';

  const summary = document.createElement('summary');
  summary.textContent = `查看映射字段（${entries.length}）`;
  details.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'tc-template-field-list';

  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'tc-template-field-empty';
    empty.textContent = '暂无字段映射';
    list.appendChild(empty);
    details.appendChild(list);
    return details;
  }

  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'tc-template-field-row';

    const main = document.createElement('div');
    main.className = 'tc-template-field-main';
    main.textContent = `${entry.title} · ${entry.kind}`;

    const selector = document.createElement('div');
    selector.className = 'tc-template-field-selector';
    selector.textContent = entry.selector;

    row.appendChild(main);
    row.appendChild(selector);
    list.appendChild(row);
  }

  details.appendChild(list);
  return details;
}

async function loadPageTemplates() {
  try {
    const data = await chrome.storage.local.get('formPilotV2FieldMappings');
    const store = data.formPilotV2FieldMappings || {};
    const list = $('pageTemplateList');
    const empty = $('pageTemplateEmpty');
    if (!list) return;

    const allEntries = [];
    let totalFields = 0;
    const domains = new Set();

    for (const [pathKey, bucket] of Object.entries(store)) {
      const templates = bucket.templates || {};
      domains.add((bucket.meta?.host || pathKey).split('/')[0]);
      for (const [name, template] of Object.entries(templates)) {
        const fieldCount = Object.keys(template.fields || {}).length;
        totalFields += fieldCount;
        allEntries.push({
          pathKey,
          name,
          fieldCount,
          updatedAt: template.updatedAt || 0,
          bucket,
          fields: template.fields || {}
        });
      }
    }

    allEntries.sort((a, b) => b.updatedAt - a.updatedAt);

    $('pageTemplateCount').textContent = String(allEntries.length);
    $('totalFieldCount').textContent = String(totalFields);
    $('domainCount').textContent = String(domains.size);

    list.innerHTML = '';

    if (!allEntries.length) {
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    for (const entry of allEntries) {
      const item = document.createElement('div');
      item.className = 'tc-template-item';
      item.innerHTML = `
        <div class="tc-template-icon">📋</div>
        <div class="tc-template-info">
          <div class="tc-template-name">${entry.name}</div>
          <div class="tc-template-meta">${entry.pathKey} · ${entry.fieldCount} 个字段 · ${new Date(entry.updatedAt).toLocaleDateString()}</div>
        </div>
        <div class="tc-template-actions">
          <button class="btn btn-ghost btn-sm" data-action="apply-page-tpl" data-path="${entry.pathKey}" data-name="${entry.name}">应用</button>
          <button class="btn btn-danger btn-sm" data-action="delete-page-tpl" data-path="${entry.pathKey}" data-name="${entry.name}">删除</button>
        </div>
      `;
      const info = item.querySelector('.tc-template-info');
      if (info && entry.fields && Object.keys(entry.fields).length) {
        const preview = document.createElement('div');
        preview.className = 'tc-template-preview';
        preview.textContent = buildUiTemplatePreview(entry.fields, 3);
        info.appendChild(preview);
        info.appendChild(buildUiTemplateFieldDetails(entry.fields));
      }
      list.appendChild(item);
    }

    list.onclick = handlePageTemplateAction;
  } catch (err) {
    logLine(`加载页面模板失败：${err.message || err}`);
  }
}

async function handlePageTemplateAction(ev) {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const pathKey = btn.dataset.path;
  const name = btn.dataset.name;

  if (action === 'apply-page-tpl') {
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'formpilotv2:apply-field-mapping-template',
        pathKey,
        name
      });
      logLine(res?.ok ? `模板「${name}」已套用` : `套用失败：${res?.error}`);
    } catch (err) {
      logLine(`套用失败：${err.message}`);
    }
  }

  if (action === 'delete-page-tpl') {
    if (!confirm(`确认删除模板「${name}」？`)) return;
    try {
      const data = await chrome.storage.local.get('formPilotV2FieldMappings');
      const store = data.formPilotV2FieldMappings || {};
      const bucket = store[pathKey];
      if (bucket?.templates?.[name]) {
        delete bucket.templates[name];
        await chrome.storage.local.set({ formPilotV2FieldMappings: store });
        logLine(`模板「${name}」已删除`);
        loadPageTemplates();
      }
    } catch (err) {
      logLine(`删除失败：${err.message}`);
    }
  }
}

// ─── API 模板（极简） ──────────────────────────────────────────────────────

const apiState = {
  endpoints: [],
  templates: [],
  editingTemplate: null,
  running: false,
  stopRequested: false
};

function tokenizeCurl(input = '') {
  const text = String(input || '').replace(/\\\r?\n/g, ' ').trim();
  const out = [];
  let buf = '';
  let quote = '';
  let escNext = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escNext) {
      buf += ch;
      escNext = false;
      continue;
    }
    if (ch === '\\') {
      escNext = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      else buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

function parseCurl(curlText = '') {
  const tokens = tokenizeCurl(curlText);
  if (!tokens.length || tokens[0] !== 'curl') {
    throw new Error('请粘贴以 curl 开头的命令');
  }

  let url = '';
  let method = '';
  const headers = {};
  let bodyText = '';

  for (let i = 1; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!url && !t.startsWith('-')) {
      url = t;
      continue;
    }
    if (t === '-X' || t === '--request') {
      method = (tokens[i + 1] || '').toUpperCase();
      i += 1;
      continue;
    }
    if (t === '-H' || t === '--header') {
      const line = tokens[i + 1] || '';
      i += 1;
      const pos = line.indexOf(':');
      if (pos > 0) {
        const key = line.slice(0, pos).trim();
        const value = line.slice(pos + 1).trim();
        headers[key] = value;
      }
      continue;
    }
    if (t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '-d') {
      bodyText = tokens[i + 1] || '';
      i += 1;
      continue;
    }
    if (t.startsWith('http://') || t.startsWith('https://')) {
      url = t;
    }
  }

  if (!url) throw new Error('未解析到 URL');
  if (!method) method = bodyText ? 'POST' : 'GET';

  let bodyObj = null;
  if (bodyText) {
    try {
      bodyObj = JSON.parse(bodyText);
    } catch {
      bodyObj = bodyText;
    }
  }

  return { url, method, headers, bodyText, bodyObj };
}

function getEndpointById(id) {
  return apiState.endpoints.find((item) => item.id === id) || null;
}

function getTemplateById(id) {
  return apiState.templates.find((item) => item.id === id) || null;
}

function ensureEditingTemplate() {
  if (!apiState.editingTemplate) newTemplate();
}

function newTemplate() {
  apiState.editingTemplate = {
    id: uid('tpl'),
    name: '',
    steps: [],
    loop: { count: 1, intervalMs: 300, retry: 0 }
  };
  if ($('flowTemplateName')) $('flowTemplateName').value = '';
  if ($('flowRunCount')) $('flowRunCount').value = '1';
  if ($('flowRunInterval')) $('flowRunInterval').value = '300';
  if ($('flowRunRetry')) $('flowRunRetry').value = '0';
  renderStepList();
}

function renderEndpointSelects() {
  const addSelect = $('flowAddStepSelect');
  const templateSelect = $('flowTemplateSelect');
  const runSelect = $('flowRunTemplateSelect');

  if (addSelect) {
    addSelect.innerHTML = apiState.endpoints.length
      ? apiState.endpoints.map((ep) => `<option value="${ep.id}">${ep.name} (${ep.method} ${ep.url})</option>`).join('')
      : '<option value="">暂无接口，请先新增</option>';
  }

  const tplOptions = apiState.templates.length
    ? apiState.templates.map((tpl) => `<option value="${tpl.id}">${tpl.name || '未命名模板'}</option>`).join('')
    : '<option value="">暂无模板</option>';

  if (templateSelect) templateSelect.innerHTML = tplOptions;
  if (runSelect) runSelect.innerHTML = tplOptions;
}

function renderEndpointList() {
  const list = $('flowEndpointList');
  if (!list) return;
  if (!apiState.endpoints.length) {
    list.innerHTML = '<div class="api-muted" style="margin-top:12px">暂无接口，先在上方贴一个 curl 并保存。</div>';
    return;
  }
  list.innerHTML = apiState.endpoints.map((ep) => {
    const bodyCount = ep.bodyObj && typeof ep.bodyObj === 'object'
      ? Object.keys(ep.bodyObj).length
      : (ep.bodyText ? 1 : 0);
    return `
      <div class="tc-template-item api-endpoint-item">
        <div class="tc-template-icon">⚡</div>
        <div class="tc-template-info">
          <div class="tc-template-name">${esc(ep.name)}</div>
          <div class="tc-template-meta">${esc(ep.method)} ${esc(ep.url)}</div>
          <div class="api-endpoint-meta">Body 字段数：${bodyCount}</div>
        </div>
        <div class="tc-template-actions">
          <button class="btn btn-danger btn-sm" data-action="delete-endpoint" data-id="${ep.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderStepList() {
  const wrap = $('flowStepList');
  if (!wrap) return;
  ensureEditingTemplate();
  const tpl = apiState.editingTemplate;
  if ($('flowTemplateName')) $('flowTemplateName').value = tpl.name || '';
  if ($('flowRunCount')) $('flowRunCount').value = String(tpl.loop?.count ?? 1);
  if ($('flowRunInterval')) $('flowRunInterval').value = String(tpl.loop?.intervalMs ?? 300);
  if ($('flowRunRetry')) $('flowRunRetry').value = String(tpl.loop?.retry ?? 0);

  if (!tpl.steps.length) {
    wrap.innerHTML = '<div class="api-muted">暂无步骤。先从下拉里选接口并点击“添加步骤”。</div>';
    return;
  }

  wrap.innerHTML = tpl.steps.map((step, idx) => {
    const ep = getEndpointById(step.endpointId);
    if (!ep) {
      return `
        <div class="tc-step-item">
          <div class="tc-step-num">${idx + 1}</div>
          <div class="tc-step-info">
            <div class="tc-step-name">步骤 ${idx + 1}</div>
            <div class="tc-step-meta">接口不存在，建议删除</div>
          </div>
          <button class="btn btn-danger btn-sm" data-act="remove-step" data-step-idx="${idx}">删除</button>
        </div>
      `;
    }
    return `
      <div class="tc-step-item">
        <div class="tc-step-num">${idx + 1}</div>
        <div class="tc-step-info">
          <div class="tc-step-name">${esc(ep.name)}</div>
          <div class="tc-step-meta">${esc(ep.method)} ${esc(ep.url)}</div>
        </div>
        <div class="api-step-actions">
          <button class="btn btn-ghost btn-sm" data-act="move-up" data-step-idx="${idx}">上移</button>
          <button class="btn btn-ghost btn-sm" data-act="move-down" data-step-idx="${idx}">下移</button>
          <button class="btn btn-danger btn-sm" data-act="remove-step" data-step-idx="${idx}">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

async function saveState(changes) {
  const saved = await applyApiChanges(changes);
  apiState.endpoints = saved.endpoints;
  apiState.templates = saved.templates;
}

async function loadState() {
  const data = await chrome.storage.local.get({ [ENDPOINTS_KEY]: [] });
  const store = await getTemplateStore();
  apiState.endpoints = Array.isArray(data[ENDPOINTS_KEY]) ? data[ENDPOINTS_KEY] : [];
  apiState.templates = Array.isArray(store.api) ? store.api : [];
  renderAll();
}

async function loadApiTemplates() {
  await loadState();
}

function renderAll() {
  renderEndpointSelects();
  renderEndpointList();
  renderStepList();
}

async function onEndpointListClick(ev) {
  const btn = ev.target.closest('button[data-action="delete-endpoint"]');
  if (!btn) return;
  const id = btn.getAttribute('data-id');
  if (!id) return;
  try {
    await saveState({ removedEndpointIds: [id] });
  } catch (error) {
    setStatus(`删除接口失败：${error.message || error}`);
    return;
  }
  if (apiState.editingTemplate) {
    apiState.editingTemplate.steps = (apiState.editingTemplate.steps || []).filter((step) => step.endpointId !== id);
  }
  renderAll();
}

function onAddStep() {
  ensureEditingTemplate();
  const epId = String($('flowAddStepSelect')?.value || '');
  if (!epId) return;
  const ep = getEndpointById(epId);
  if (!ep) return;
  apiState.editingTemplate.steps.push({ id: uid('step'), endpointId: ep.id });
  renderStepList();
}

function onStepListClick(ev) {
  const btn = ev.target.closest('button[data-act]');
  if (!btn || !apiState.editingTemplate) return;
  const act = btn.getAttribute('data-act');
  const stepIdx = Number(btn.getAttribute('data-step-idx'));
  if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= apiState.editingTemplate.steps.length) return;

  const arr = apiState.editingTemplate.steps;
  if (act === 'move-up' && stepIdx > 0) {
    [arr[stepIdx - 1], arr[stepIdx]] = [arr[stepIdx], arr[stepIdx - 1]];
    renderStepList();
    return;
  }
  if (act === 'move-down' && stepIdx < arr.length - 1) {
    [arr[stepIdx + 1], arr[stepIdx]] = [arr[stepIdx], arr[stepIdx + 1]];
    renderStepList();
    return;
  }
  if (act === 'remove-step') {
    arr.splice(stepIdx, 1);
    renderStepList();
  }
}

async function onParseSaveEndpoint() {
  const name = String($('flowEndpointName')?.value || '').trim();
  const curlText = String($('flowCurlInput')?.value || '').trim();
  const status = $('flowParseStatus');
  if (!name) {
    if (status) status.textContent = '请先填写接口名称';
    return;
  }
  if (!curlText) {
    if (status) status.textContent = '请先粘贴 curl';
    return;
  }
  try {
    const parsed = parseCurl(curlText);
    const item = {
      id: uid('ep'),
      name,
      curlText,
      method: parsed.method,
      url: parsed.url,
      headers: parsed.headers,
      bodyText: parsed.bodyText,
      bodyObj: parsed.bodyObj,
      createdAt: Date.now()
    };
    await saveState({ endpoints: [item] });
    renderAll();
    if (status) status.textContent = `已保存：${parsed.method} ${parsed.url}`;
    if ($('flowEndpointName')) $('flowEndpointName').value = '';
    if ($('flowCurlInput')) $('flowCurlInput').value = '';
  } catch (err) {
    if (status) status.textContent = `解析失败：${err?.message || err}`;
  }
}

function buildPresetTemplates(endpointByKey = {}) {
  const verify = endpointByKey.verify;
  const company = endpointByKey.register_company;
  const org = endpointByKey.register_org;
  const gov = endpointByKey.register_government;
  if (!verify || !company || !org || !gov) return [];
  return [
    {
      id: uid('tpl'),
      name: '企业注册流程（预置）',
      steps: [{ id: uid('step'), endpointId: verify.id }, { id: uid('step'), endpointId: company.id }],
      loop: { count: 1, intervalMs: 300, retry: 0 }
    },
    {
      id: uid('tpl'),
      name: '机构注册流程（预置）',
      steps: [{ id: uid('step'), endpointId: verify.id }, { id: uid('step'), endpointId: org.id }],
      loop: { count: 1, intervalMs: 300, retry: 0 }
    },
    {
      id: uid('tpl'),
      name: '政府注册流程（预置）',
      steps: [{ id: uid('step'), endpointId: verify.id }, { id: uid('step'), endpointId: gov.id }],
      loop: { count: 1, intervalMs: 300, retry: 0 }
    }
  ];
}

async function onImportPreset() {
  await loadState();
  const addedEndpoints = [];
  const endpointByKey = {};
  const signatureMap = new Map(apiState.endpoints.map((ep) => [`${String(ep.method || '').toUpperCase()} ${ep.url}`, ep]));

  const presets = [
    {
      key: 'verify',
      name: '获取验证码',
      method: 'POST',
      url: 'https://caring-company-api.test.lingxi.tech/fe/verify/code',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        language: 'zh'
      },
      bodyObj: {
        email: 'demo@example.com',
        verify_code_type: 1,
        captcha: null,
        contact: { title_type: 4, first_name_cn: '唐' }
      }
    },
    {
      key: 'register_company',
      name: '企业注册',
      method: 'POST',
      url: 'https://caring-company-api.test.lingxi.tech/fe/register/company',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        language: 'zh'
      },
      bodyObj: {
        brn: '0800379638642347',
        name_en: 'Aurora Technologies',
        cert_name_cn: '即将启动新一轮版本发布与回归验证。',
        cert_name_en: 'The next release train is scheduled with full regression coverage.',
        setup_date: '2024-05-16',
        brn_file: [],
        address: {
          office_cn: '四川省成都市青年路757号C座1506室',
          street_cn: '桃園市基隆市成功路291號5樓之2',
          areaArr: ['BwLjb8', 'Xwx98A'],
          office_en: '264 Union Street, Denver, New York 49052',
          street_en: '874 Broadway, Toronto, Massachusetts 10501',
          area_id: 'BwLjb8',
          district_id: 'Xwx98A'
        },
        contact: {
          captcha: null,
          verify_code: '',
          title_type: 4,
          first_name_cn: '唐',
          last_name_cn: '乐',
          last_name_en: 'Anderson',
          first_name_en: 'Sophia',
          email: 'demo@example.com',
          mobile: 60653634,
          position_cn: '产品经理',
          position_en: 'Solutions Architect'
        },
        isRead: true,
        prove_file: [],
        brn_file_id: ''
      }
    },
    {
      key: 'register_org',
      name: '机构注册',
      method: 'POST',
      url: 'https://caring-company-api.test.lingxi.tech/fe/register/org',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        language: 'zh'
      },
      bodyObj: {
        name_cn: '赛博信息技术有限公司',
        name_en: '',
        cert_name_cn: '我们正在优化流程并计划拓展华南市场。',
        cert_name_en: 'We are expanding into the APAC market and refining our ops.',
        agent_type: 2,
        is_free_tax: 1,
        free_tax_code: '',
        free_tax_file: [],
        setup_date: '2016-08-28',
        sign_file: [],
        is_vip: null,
        address: {
          office_cn: '浙江省北京市人民路753号5号楼201室',
          street_cn: '新竹市基隆市仁愛路849號A棟12樓之3',
          areaArr: ['BwLjb8', 'xbaEqb'],
          district_cn: '',
          office_en: '903 Elm Street, Seattle, Colorado 42936',
          street_en: '398 Sunset Boulevard, Berlin, California 43148',
          district_en: '',
          area_id: 'BwLjb8',
          district_id: 'xbaEqb'
        },
        contact: {
          captcha: '',
          verify_code: '',
          title_type: 6,
          first_name_cn: '梁',
          last_name_cn: '昊',
          last_name_en: 'Hall',
          first_name_en: 'Noah',
          email: 'demo@example.com',
          mobile: 66945774,
          position_cn: '销售主管',
          position_en: 'HR Manager'
        },
        isRead: true,
        prove_file: []
      }
    },
    {
      key: 'register_government',
      name: '政府注册',
      method: 'POST',
      url: 'https://caring-company-api.test.lingxi.tech/fe/register/government',
      headers: {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        language: 'zh'
      },
      bodyObj: {
        name_cn: '市场监督管理局',
        name_en: '',
        address: {
          office_cn: '江苏省成都市滨江路948号B座9层901',
          street_cn: '臺中市新竹市博愛路302號5樓之2',
          areaArr: ['3A7mJK', 'GA3D4b'],
          district_cn: '',
          office_en: '205 Queen Street, London, New York 91075',
          street_en: '91 Elm Street, Toronto, British Columbia 30458',
          district_en: '',
          area_id: '3A7mJK',
          district_id: 'GA3D4b'
        },
        contact: {
          captcha: '',
          verify_code: '',
          title_type: 4,
          first_name_cn: '杨',
          last_name_cn: '磊',
          last_name_en: 'Lewis',
          first_name_en: 'Liam',
          email: 'demo@example.com',
          mobile: 60585506,
          position_cn: '交互设计师',
          position_en: 'Machine Learning Engineer'
        },
        isRead: true,
        prove_file: []
      }
    }
  ];

  for (const preset of presets) {
    const signature = `${String(preset.method || '').toUpperCase()} ${preset.url}`;
    const existed = signatureMap.get(signature);
    if (existed) {
      endpointByKey[preset.key] = existed;
      continue;
    }
    const item = {
      id: uid('ep'),
      name: preset.name,
      curlText: '',
      method: preset.method,
      url: preset.url,
      headers: preset.headers || {},
      bodyText: JSON.stringify(preset.bodyObj || {}),
      bodyObj: deepClone(preset.bodyObj || {}),
      createdAt: Date.now()
    };
    addedEndpoints.push(item);
    signatureMap.set(signature, item);
    endpointByKey[preset.key] = item;
  }

  const presetTemplates = buildPresetTemplates(endpointByKey);
  const addedTemplates = presetTemplates.filter((tpl) => !apiState.templates.some((item) => item.name === tpl.name));
  await saveState({ endpoints: addedEndpoints, templates: addedTemplates });
  renderAll();
  if ($('flowParseStatus')) $('flowParseStatus').textContent = '已导入注册预置接口与模板';
  if ($('flowRunStatus')) $('flowRunStatus').textContent = '预置模板已刷新';
}

async function onSaveTemplate() {
  ensureEditingTemplate();
  const tpl = apiState.editingTemplate;
  const name = String($('flowTemplateName')?.value || '').trim();
  const loop = {
    count: Math.max(1, Number($('flowRunCount')?.value || tpl.loop?.count || 1)),
    intervalMs: Math.max(0, Number($('flowRunInterval')?.value || tpl.loop?.intervalMs || 300)),
    retry: Math.max(0, Number($('flowRunRetry')?.value || tpl.loop?.retry || 0))
  };

  if (!name) {
    $('flowRunStatus').textContent = '请先填写模板名称';
    return;
  }
  if (!tpl.steps.length) {
    $('flowRunStatus').textContent = '模板至少要有一个步骤';
    return;
  }

  tpl.name = name;
  tpl.loop = loop;
  const payload = deepClone(tpl);
  await saveState({ templates: [payload] });
  renderEndpointSelects();
  $('flowRunStatus').textContent = '模板已保存';
}

function onLoadTemplate() {
  const id = String($('flowTemplateSelect')?.value || '');
  const tpl = getTemplateById(id);
  if (!tpl) return;
  apiState.editingTemplate = deepClone(tpl);
  renderStepList();
  if ($('flowTemplateName')) $('flowTemplateName').value = tpl.name || '';
  if ($('flowRunCount')) $('flowRunCount').value = String(tpl.loop?.count ?? 1);
  if ($('flowRunInterval')) $('flowRunInterval').value = String(tpl.loop?.intervalMs ?? 300);
  if ($('flowRunRetry')) $('flowRunRetry').value = String(tpl.loop?.retry ?? 0);
  $('flowRunStatus').textContent = `已加载模板：${tpl.name || '未命名模板'}`;
}

async function onDeleteTemplate() {
  const id = String($('flowTemplateSelect')?.value || '');
  if (!id) return;
  await saveState({ removedTemplateIds: [id] });
  if (apiState.editingTemplate && apiState.editingTemplate.id === id) newTemplate();
  renderEndpointSelects();
  $('flowRunStatus').textContent = '模板已删除';
}

function buildRunRequest(endpoint) {
  const headers = deepClone(endpoint.headers || {});
  const method = String(endpoint.method || 'GET').toUpperCase();
  const body = endpoint.bodyObj && typeof endpoint.bodyObj === 'object'
    ? deepClone(endpoint.bodyObj)
    : endpoint.bodyText;
  return { method, headers, body };
}

async function runOneStep(step, stepIndex, retry) {
  const endpoint = getEndpointById(step.endpointId);
  if (!endpoint) throw new Error('接口不存在');
  const request = buildRunRequest(endpoint);
  const maxTry = Math.max(0, Number(retry) || 0);
  let lastError = null;

  for (let attempt = 0; attempt <= maxTry; attempt += 1) {
    try {
      const init = {
        method: request.method,
        headers: { ...request.headers },
        credentials: 'include',
        cache: 'no-store'
      };
      if (request.body != null && !['GET', 'HEAD'].includes(request.method)) {
        const hasJsonHeader = Object.keys(init.headers).some((key) => key.toLowerCase() === 'content-type');
        if (!hasJsonHeader && typeof request.body !== 'string') {
          init.headers['content-type'] = 'application/json';
        }
        init.body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      }

      const response = await fetch(endpoint.url, init);
      const text = await response.text().catch(() => '');
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      logLine(`  - 步骤${stepIndex} ${endpoint.name} ${response.ok ? '成功' : '失败'} [${response.status}]`);
      logLine(`    请求体: ${typeof request.body === 'string' ? request.body : JSON.stringify(request.body)}`);
      logLine(`    响应体: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      return { ok: true, status: response.status, response: parsed };
    } catch (error) {
      lastError = error;
      logLine(`  - 步骤${stepIndex} 请求失败：${error?.message || error}`);
    }
  }

  throw lastError || new Error('请求失败');
}

async function runTemplate(tpl, params = {}) {
  if (apiState.running) return;
  const count = Math.max(1, Number(params.count || tpl.loop?.count || 1));
  const intervalMs = Math.max(0, Number(params.intervalMs ?? tpl.loop?.intervalMs ?? 300));
  const retry = Math.max(0, Number(params.retry ?? tpl.loop?.retry ?? 0));

  apiState.running = true;
  apiState.stopRequested = false;
  if ($('flowRunBtn')) $('flowRunBtn').disabled = true;
  if ($('flowStopBtn')) $('flowStopBtn').disabled = false;
  setStatus('执行中');
  if ($('flowRunLog')) $('flowRunLog').textContent = '等待执行…';
  logLine(`开始执行模板：${tpl.name || '未命名模板'}`);
  logLine(`循环=${count}，间隔=${intervalMs}ms，重试=${retry}`);

  let success = 0;
  let fail = 0;

  try {
    for (let round = 1; round <= count; round += 1) {
      if (apiState.stopRequested) break;
      logLine(`\n[第 ${round}/${count} 轮]`);
      let roundOk = true;

      for (let idx = 0; idx < tpl.steps.length; idx += 1) {
        if (apiState.stopRequested) break;
        try {
          await runOneStep(tpl.steps[idx], idx + 1, retry);
        } catch (error) {
          roundOk = false;
          logLine(`  - 步骤${idx + 1} 失败：${error?.message || error}`);
          break;
        }
      }

      if (roundOk) success += 1;
      else fail += 1;

      if (round < count && intervalMs > 0 && !apiState.stopRequested) {
        await sleep(intervalMs);
      }
    }
    setStatus(apiState.stopRequested ? '已停止' : '执行完成');
    logLine(`执行完成：成功=${success}，失败=${fail}`);
  } catch (error) {
    setStatus('执行失败');
    logLine(`执行异常：${error?.message || error}`);
  } finally {
    apiState.running = false;
    if ($('flowRunBtn')) $('flowRunBtn').disabled = false;
    if ($('flowStopBtn')) $('flowStopBtn').disabled = true;
  }
}

async function onRunTemplate() {
  if (apiState.running) return;
  const id = String($('flowRunTemplateSelect')?.value || '');
  const tpl = getTemplateById(id);
  if (!tpl) {
    $('flowRunStatus').textContent = '请先选择模板';
    return;
  }
  const params = {
    count: Math.max(1, Number($('flowRunCount')?.value || tpl.loop?.count || 1)),
    intervalMs: Math.max(0, Number($('flowRunInterval')?.value || tpl.loop?.intervalMs || 300)),
    retry: Math.max(0, Number($('flowRunRetry')?.value || tpl.loop?.retry || 0))
  };
  await runTemplate(tpl, params);
}

function onStopRun() {
  if (!apiState.running) return;
  apiState.stopRequested = true;
  $('flowRunStatus').textContent = '正在停止...';
}

function bindApiEvents() {
  $('flowParseSaveBtn')?.addEventListener('click', onParseSaveEndpoint);
  $('flowClearCurlBtn')?.addEventListener('click', () => {
    if ($('flowEndpointName')) $('flowEndpointName').value = '';
    if ($('flowCurlInput')) $('flowCurlInput').value = '';
    if ($('flowParseStatus')) $('flowParseStatus').textContent = '';
  });
  $('flowImportPresetBtn')?.addEventListener('click', onImportPreset);
  $('flowEndpointList')?.addEventListener('click', onEndpointListClick);
  $('flowAddStepBtn')?.addEventListener('click', onAddStep);
  $('flowNewTemplateBtn')?.addEventListener('click', newTemplate);
  $('flowStepList')?.addEventListener('click', onStepListClick);
  $('flowSaveTemplateBtn')?.addEventListener('click', onSaveTemplate);
  $('flowLoadTemplateBtn')?.addEventListener('click', onLoadTemplate);
  $('flowDeleteTemplateBtn')?.addEventListener('click', onDeleteTemplate);
  $('flowRunBtn')?.addEventListener('click', onRunTemplate);
  $('flowStopBtn')?.addEventListener('click', onStopRun);
  $('flowRefreshBtn')?.addEventListener('click', loadApiTemplates);
}

async function initApiModule() {
  bindApiEvents();
  await loadState();
  newTemplate();
  if ($('flowStopBtn')) $('flowStopBtn').disabled = true;
}

// ─── 初始化 ────────────────────────────────────────────────────────────────

$('refreshPageTemplates')?.addEventListener('click', loadPageTemplates);

loadPageTemplates();
initApiModule();
