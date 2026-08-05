const els = {
  tabInfo: document.getElementById('tabInfo'),
  scanBtn: document.getElementById('scanBtn'),
  fillBtn: document.getElementById('fillBtn'),
  openOptionsBtn: document.getElementById('openOptionsBtn'),
  openSidepanelBtn: document.getElementById('openSidepanelBtn'),
  refreshTabBtn: document.getElementById('refreshTabBtn'),
  scopeSelectorInput: document.getElementById('scopeSelectorInput'),
  statusBadge: document.getElementById('statusBadge'),
  logBox: document.getElementById('logBox'),
  fieldList: document.getElementById('fieldList'),
  foundMetric: document.getElementById('foundMetric'),
  filledMetric: document.getElementById('filledMetric')
};

let currentTabId = 0;
const FORCED_TAB_ID = (() => {
  try {
    const raw = Number(new URLSearchParams(window.location.search || '').get('tabId') || 0);
    return Number.isInteger(raw) && raw > 0 ? raw : 0;
  } catch {
    return 0;
  }
})();

function sendMessageForTarget(message) {
  const payload = { ...(message || {}) };
  if (FORCED_TAB_ID > 0 && !('tabId' in payload)) {
    payload.tabId = FORCED_TAB_ID;
  }
  return chrome.runtime.sendMessage(payload);
}

function setStatus(text) {
  els.statusBadge.textContent = text;
}

function setStatusTone(tone = 'normal') {
  els.statusBadge.dataset.tone = tone;
}

function logLine(text) {
  const line = `[${new Date().toLocaleTimeString()}] ${text}`;
  els.logBox.textContent = `${line}\n${els.logBox.textContent}`.trim();
}

function renderFields(fields = []) {
  els.fieldList.innerHTML = '';
  els.foundMetric.textContent = String(fields.length || 0);
  if (!fields.length) {
    const li = document.createElement('li');
    li.textContent = '暂无识别结果';
    els.fieldList.appendChild(li);
    return;
  }

  for (const field of fields.slice(0, 100)) {
    const li = document.createElement('li');
    const title = field.label || field.placeholder || field.selector || field.id || '(未命名字段)';
    li.textContent = field.kind ? `${title} · ${field.kind}` : title;
    els.fieldList.appendChild(li);
  }
}

async function queryActiveTab() {
  const res = await sendMessageForTarget({ type: 'formpilotv2:get-active-tab' });
  if (!res?.ok || !res.tab) {
    els.tabInfo.textContent = '未检测到活动标签页';
    currentTabId = 0;
    return;
  }
  currentTabId = res.tab.id;
  const url = new URL(res.tab.url || 'https://example.com');
  els.tabInfo.innerHTML = `
<div><strong>${res.tab.title || '(无标题)'}</strong></div>
<div>${url.hostname}</div>
<div>tabId: ${res.tab.id}</div>`;
}

function getScopeSelector() {
  return String(els.scopeSelectorInput.value || '').trim();
}

async function handleScan() {
  if (!currentTabId) await queryActiveTab();
  if (!currentTabId) return;

  setStatus('识别中');
  setStatusTone('progress');
  const scopeSelector = getScopeSelector();
  const res = await sendMessageForTarget({
    type: 'formpilotv2:scan',
    scopeSelector
  });

  if (!res?.ok) {
    setStatus('识别失败');
    setStatusTone('error');
    logLine(`识别失败: ${res?.error || '未知错误'}`);
    return;
  }

  setStatus(`识别完成 ${res.fields.length}`);
  setStatusTone('success');
  els.filledMetric.textContent = '0%';
  logLine(`识别成功，共 ${res.fields.length} 个字段`);
  renderFields(res.fields || []);
}

async function handleFill() {
  if (!currentTabId) await queryActiveTab();
  if (!currentTabId) return;

  setStatus('填充中');
  setStatusTone('progress');
  const scopeSelector = getScopeSelector();
  const res = await sendMessageForTarget({
    type: 'formpilotv2:fill',
    scopeSelector
  });

  if (!res?.ok) {
    setStatus('填充失败');
    setStatusTone('error');
    logLine(`填充失败: ${res?.error || '未知错误'}`);
    return;
  }

  const applied = Number(res.fillResult?.applied || 0);
  const failed = Number(res.fillResult?.failed || 0);
  const total = applied + failed;
  const percent = total > 0 ? `${Math.round((applied / total) * 100)}%` : '0%';
  setStatus(`填充完成 ${applied}/${total}`);
  setStatusTone(failed ? 'warning' : 'success');
  els.filledMetric.textContent = percent;
  logLine(`填充完成，成功 ${applied}，失败 ${failed}`);
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
    logLine(`分页填充：已处理 ${Number(res.pagination.pageCount || 0)} 页，${reasonMap[res.pagination.stopReason] || res.pagination.stopReason || '已停止'}`);
  }
  renderFields(res.fields || []);
}

async function handleOpenSidepanel() {
  if (!currentTabId) await queryActiveTab();
  if (!currentTabId) return;

  const res = await sendMessageForTarget({ type: 'formpilotv2:open-sidepanel' });

  if (!res?.ok) {
    logLine(`打开侧边栏失败: ${res?.error || '未知错误'}`);
    setStatus('侧边栏失败');
    setStatusTone('error');
    return;
  }

  logLine('已触发打开侧边栏');
  setStatus('侧边栏已触发');
  setStatusTone('success');
}

els.scanBtn.addEventListener('click', handleScan);
els.fillBtn.addEventListener('click', handleFill);
els.refreshTabBtn.addEventListener('click', queryActiveTab);
els.openOptionsBtn.addEventListener('click', () => sendMessageForTarget({ type: 'formpilotv2:open-options' }));
els.openSidepanelBtn.addEventListener('click', handleOpenSidepanel);

queryActiveTab().catch((err) => {
  logLine(`初始化失败: ${err.message || err}`);
  setStatus('初始化失败');
  setStatusTone('error');
});
