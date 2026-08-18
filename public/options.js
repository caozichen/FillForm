import {
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  migrateDefaultEmailPool,
  migrateTestDataLibraryDefaults
} from './core/types.js';
import { md5 } from './core/md5.js';
import {
  buildApiExecutionRequest,
  executeApiTemplate,
  getTemplateStore,
  parseCurlCommand,
  removeTemplate,
  saveTemplate,
  templateToCurl
} from './core/templateEngine.js';

const $ = (id) => document.getElementById(id);

const els = {
  mode: $('mode'),
  provider: $('provider'),
  floatingEnabled: $('floatingEnabled'),
  inlinePanelEnabled: $('inlinePanelEnabled'),
  fillRadioCheckbox: $('fillRadioCheckbox'),
  fillOptionalFields: $('fillOptionalFields'),
  paginateFillEnabled: $('paginateFillEnabled'),
  debugLogs: $('debugLogs'),
  deepseekBaseUrl: $('deepseekBaseUrl'),
  deepseekModel: $('deepseekModel'),
  deepseekApiKey: $('deepseekApiKey'),
  zhipuBaseUrl: $('zhipuBaseUrl'),
  zhipuModel: $('zhipuModel'),
  zhipuThinkingType: $('zhipuThinkingType'),
  zhipuReasoningEffort: $('zhipuReasoningEffort'),
  zhipuMaxTokens: $('zhipuMaxTokens'),
  zhipuApiKey: $('zhipuApiKey'),
  openaiBaseUrl: $('openaiBaseUrl'),
  openaiModel: $('openaiModel'),
  openaiReasoningEffort: $('openaiReasoningEffort'),
  openaiApiKey: $('openaiApiKey'),
  temperature: $('temperature'),
  temperatureDisplay: $('temperatureDisplay'),
  testConnectionBtn: $('testConnectionBtn'),
  testConnectionResult: $('testConnectionResult'),
  openTemplateCenterBtn: $('openTemplateCenterBtn'),
  testDataEnabled: $('testDataEnabled'),
  testDataSummary: $('testDataSummary'),
  testDataChineseName: $('testDataChineseName'),
  testDataEnglishName: $('testDataEnglishName'),
  testDataMobileCn: $('testDataMobileCn'),
  testDataMobileHk: $('testDataMobileHk'),
  testDataMobileMo: $('testDataMobileMo'),
  testDataEmail: $('testDataEmail'),
  testDataCompanyName: $('testDataCompanyName'),
  testDataSocialCreditCode: $('testDataSocialCreditCode'),
  testDataIdCn: $('testDataIdCn'),
  testDataIdHmt: $('testDataIdHmt'),
  testDataPassport: $('testDataPassport'),
  testDataLandline: $('testDataLandline'),
  testDataAddress: $('testDataAddress'),
  testDataDate: $('testDataDate'),
  testDataPlainText: $('testDataPlainText'),
  testDataRichText: $('testDataRichText'),
  testDataRichTextCard: $('testDataRichTextCard'),
  testDataRichTextEditor: $('testDataRichTextEditor'),
  testDataRichTextSourceMode: $('testDataRichTextSourceMode'),
  testDataRichTextColor: $('testDataRichTextColor'),
  testDataRichTextError: $('testDataRichTextError'),
  testDataNumber: $('testDataNumber'),
  testDataBankCardCn: $('testDataBankCardCn'),
  testDataBankCardHk: $('testDataBankCardHk'),
  decryptProjectOptions: $('decryptProjectOptions'),
  decryptConfigEmpty: $('decryptConfigEmpty'),
  decryptConfigEditBtn: $('decryptConfigEditBtn'),
  decryptConfigEditor: $('decryptConfigEditor'),
  decryptConfigTableBody: $('decryptConfigTableBody'),
  decryptConfigAddRowBtn: $('decryptConfigAddRowBtn'),
  decryptConfigSaveBtn: $('decryptConfigSaveBtn'),
  decryptConfigCancelBtn: $('decryptConfigCancelBtn'),
  decryptConfigError: $('decryptConfigError'),
  decryptSection: $('decryptSection'),
  decryptSectionNav: $('decryptSectionNav'),
  decryptVisibilityMessage: $('decryptVisibilityMessage'),
  fileUploadInput: $('fileUploadInput'),
  fileUploadCategory: $('fileUploadCategory'),
  fileUploadDropZone: $('fileUploadDropZone'),
  fileUploadBtn: $('fileUploadBtn'),
  fileUploadList: $('fileUploadList'),
  fileUploadClearBtn: $('fileUploadClearBtn'),
  mockRuleScope: $('mockRuleScope'),
  mockRuleMatch: $('mockRuleMatch'),
  mockRuleKind: $('mockRuleKind'),
  mockRulePreset: $('mockRulePreset'),
  mockRuleValue: $('mockRuleValue'),
  mockRuleAddBtn: $('mockRuleAddBtn'),
  mockPresetCatalogList: $('mockPresetCatalogList'),
  mockRuleList: $('mockRuleList'),
  mockRuleEmpty: $('mockRuleEmpty'),
  manualFieldLibraryList: $('manualFieldLibraryList'),
  manualFieldLibraryEmpty: $('manualFieldLibraryEmpty'),
  saveBtn: $('saveBtn'),
  saveBtnBottom: $('saveBtnBottom'),
  saveStatus: $('saveStatus'),
  tabControlSaveBtn: $('tabControlSaveBtn'),
  tabControlError: $('tabControlError'),
  tabControlStatus: $('tabControlStatus'),
  tabPasswordModal: $('tabPasswordModal'),
  tabPasswordInput: $('tabPasswordInput'),
  tabPasswordError: $('tabPasswordError'),
  tabPasswordCancelBtn: $('tabPasswordCancelBtn'),
  tabPasswordConfirmBtn: $('tabPasswordConfirmBtn'),
  curlInput: $('curlInput'),
  parseCurlBtn: $('parseCurlBtn'),
  saveApiTemplateBtn: $('saveApiTemplateBtn'),
  curlResult: $('curlResult'),
  templateList: $('templateList'),
  templateCount: $('templateCount'),
  uiTemplateCount: $('uiTemplateCount'),
  apiTemplateCount: $('apiTemplateCount'),
  runnerTemplateSelect: $('runnerTemplateSelect'),
  runnerTemplateSummary: $('runnerTemplateSummary'),
  runnerLoopCount: $('runnerLoopCount'),
  runnerIntervalMs: $('runnerIntervalMs'),
  runnerRetryCount: $('runnerRetryCount'),
  runnerBodyPatch: $('runnerBodyPatch'),
  loadRunnerTemplateBtn: $('loadRunnerTemplateBtn'),
  runTemplateBtn: $('runTemplateBtn'),
  stopTemplateBtn: $('stopTemplateBtn'),
  clearRunnerLogBtn: $('clearRunnerLogBtn'),
  runnerRequestPreview: $('runnerRequestPreview'),
  runnerLog: $('runnerLog'),
  runnerStatus: $('runnerStatus'),
  mappingPathInfo: $('mappingPathInfo'),
  refreshMappingBtn: $('refreshMappingBtn'),
  rescanMappingBtn: $('rescanMappingBtn'),
  mappingTemplateCount: $('mappingTemplateCount'),
  mappingTemplateList: $('mappingTemplateList'),
  mappingFieldCount: $('mappingFieldCount'),
  mappingFieldList: $('mappingFieldList'),
  mappingScanCount: $('mappingScanCount'),
  mappingScanList: $('mappingScanList')
};

const state = {
  parsedCurl: null,
  rows: [],
  apiRows: [],
  selectedTemplateId: '',
  abortController: null,
  isRunning: false,
  activeTabId: 0,
  activeTabUrl: '',
  activePathKey: '',
  mockRules: [],
  manualFieldBuckets: [],
  fileStore: [],
  decryptConfig: { selectedProjectIds: [], projects: [] },
  decryptDraft: null,
  decryptEditing: false,
  decryptConfigUnlocked: false,
  pendingProtectedTabInput: null,
  pendingMockRuleFingerprint: '',
  richTextSourceMode: false,
  richTextSelectionRange: null
};

const PANEL_TAB_VALUES = ['ui', 'qr', 'api', 'crypto'];
const DEFAULT_VISIBLE_PANEL_TABS = ['ui', 'qr'];
const PROTECTED_PANEL_TAB_VALUE = 'crypto';
const PROTECTED_PANEL_TAB_PASSWORD_MD5 = '83eef8b2ef296e607cbe09302f63e128';
const OPENAI_REASONING_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];
const OPENAI_LEGACY_DEFAULT_MODEL = 'gpt-4.1-mini';
const ZHIPU_THINKING_TYPE_VALUES = ['disabled', 'enabled'];
const ZHIPU_REASONING_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
let tabControlStatusTimer = 0;
let decryptVisibilityMessageTimer = 0;

const LEGACY_DEFAULT_RICH_TEXT_POOL = [
  '<p>这是一段用于富文本编辑器的测试内容。</p>',
  '<p><strong>测试标题</strong><br>这里可以填写多行说明。</p>'
];

const MOCK_PRESET_LABELS = {
  fixed: '固定文本',
  cnPhone: '大陆手机号',
  hkPhone: '香港手机号',
  cnLandline: '大陆固定电话',
  hkLandline: '香港固定电话',
  cnName: '中国大陆姓名',
  enName: '英文姓名',
  cnFirstName: '中文名字',
  cnLastName: '中文姓氏',
  enFirstName: '英文名字',
  enLastName: '英文姓氏',
  companyZh: '中文企业名称',
  companyEn: '英文企业名称',
  companyGov: '政府机构名称',
  date: '随机日期',
  dateOld: '一年以前日期',
  selectRandom: '随机下拉',
  radioRandom: '随机单选',
  checkboxRandom: '随机复选',
  address: '大陆地址',
  addressHk: '香港地址',
  emailRandom: '随机邮箱',
  phoneRandom: '随机手机号',
  moPhone: '澳门手机号',
  cnIdcard: '中国内地身份证号',
  hmtResidentId: '港澳台居民证号',
  passportNo: '护照号',
  websiteCn: '中文官网地址',
  websiteGlobal: '国际官网地址',
  orgMission: '机构宗旨',
  serviceContent: '主要服务内容',
  companyIntro: '机构/企业简介',
  projectDescription: '项目描述',
  employeeCount: '员工人数',
  amountBudget: '预算金额',
  departmentName: '部门名称',
  jobTitleZh: '中文职位',
  jobTitleEn: '英文职位'
};

const MOCK_PRESET_OPTIONS = Array.from(els.mockRulePreset?.options || []).map((option) => ({
  value: String(option.value || '').trim(),
  label: String(option.textContent || option.value || '').trim()
}));

const MOCK_PRESET_KIND_MAP = {
  any: null,
  text: ['fixed', 'orgMission', 'serviceContent', 'companyIntro', 'projectDescription', 'websiteCn', 'websiteGlobal', 'employeeCount', 'amountBudget', 'departmentName'],
  phone: ['cnPhone', 'hkPhone', 'moPhone', 'phoneRandom', 'fixed'],
  tel: ['cnLandline', 'hkLandline', 'fixed'],
  fullName: ['cnName', 'enName', 'fixed'],
  firstName: ['cnFirstName', 'enFirstName', 'cnName', 'enName', 'fixed'],
  lastName: ['cnLastName', 'enLastName', 'cnName', 'enName', 'fixed'],
  companyName: ['companyZh', 'companyEn', 'companyGov', 'fixed'],
  companyId: ['fixed'],
  email: ['emailRandom', 'fixed'],
  verification: ['fixed'],
  idcard: ['cnIdcard', 'hmtResidentId', 'passportNo', 'fixed'],
  bankCard: ['fixed'],
  date: ['date', 'dateOld', 'fixed'],
  jobTitle: ['jobTitleZh', 'jobTitleEn', 'fixed'],
  select: ['selectRandom', 'fixed'],
  radioGroup: ['radioRandom', 'fixed'],
  checkboxGroup: ['checkboxRandom', 'fixed'],
  addressComponent: ['address', 'addressHk', 'fixed'],
  addressDetail: ['address', 'addressHk', 'fixed'],
  file: ['fixed']
};

const MOCK_PRESET_SAMPLE_MAP = {
  fixed: '自定义固定值',
  cnPhone: '13800138000',
  hkPhone: '61234567',
  cnLandline: '021-62888888',
  hkLandline: '852-31234567',
  cnName: '王晓彤',
  enName: 'Olivia Hall',
  cnFirstName: '晓彤',
  cnLastName: '王',
  enFirstName: 'Olivia',
  enLastName: 'Hall',
  companyZh: '灵犀科技有限公司',
  companyEn: 'Nova Bridge Solutions',
  companyGov: '市场监督管理局',
  date: '2025-06-18',
  dateOld: '2021-04-09',
  selectRandom: '随机选择一个可用项',
  radioRandom: '随机点选一个单选项',
  checkboxRandom: '随机点选一个选项',
  address: '广东省深圳市南山区科技园路88号',
  addressHk: '香港灣仔區軒尼詩道88號',
  emailRandom: 'qa_123456@example.com',
  phoneRandom: '随机手机号',
  moPhone: '66123456',
  cnIdcard: '110101199001011234',
  hmtResidentId: '810000199001011234',
  passportNo: 'E12345678',
  websiteCn: 'https://www.lingxi-bridge.cn',
  websiteGlobal: 'https://www.communitybridge.hk',
  orgMission: '致力于提供可持续社区服务',
  serviceContent: '社区支援、培训与资源对接',
  companyIntro: '长期聚焦社会服务数字化建设',
  projectDescription: '分阶段推进并滚动复盘',
  employeeCount: '35',
  amountBudget: '500000',
  departmentName: '项目运营部',
  jobTitleZh: '项目经理',
  jobTitleEn: 'Project Manager'
};

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

function cleanDecryptText(value = '') {
  return String(value ?? '').trim();
}

function maskDecryptSalt(value = '') {
  const salt = cleanDecryptText(value);
  if (salt.length <= 6) return salt;
  return `${salt.slice(0, 3)}${'*'.repeat(salt.length - 6)}${salt.slice(-3)}`;
}

function sanitizePositiveInteger(value = '') {
  return String(value ?? '').replace(/\D/g, '').replace(/^0+/, '');
}

function buildStableDecryptProjectId(project = {}, index = 0) {
  const source = `${cleanDecryptText(project.name)}|${cleanDecryptText(project.salt)}|${cleanDecryptText(project.minLength)}|${index}`;
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  }
  return `decrypt_${Math.abs(hash).toString(36) || index}`;
}

function createDecryptProjectId() {
  return `decrypt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDecryptDraftProject(projectId = '') {
  return state.decryptDraft?.projects?.find((project) => project.id === projectId) || null;
}

function normalizeDecryptProject(project = {}, index = 0) {
  return {
    id: cleanDecryptText(project.id) || buildStableDecryptProjectId(project, index),
    name: cleanDecryptText(project.name),
    salt: cleanDecryptText(project.salt),
    minLength: sanitizePositiveInteger(project.minLength)
  };
}

function normalizeDecryptConfig(raw = {}) {
  const projects = (Array.isArray(raw.projects) ? raw.projects : [])
    .map((project, index) => normalizeDecryptProject(project, index));
  const projectIds = new Set(projects.map((project) => project.id));
  const selectedProjectIds = (Array.isArray(raw.selectedProjectIds) ? raw.selectedProjectIds : [])
    .map((id) => cleanDecryptText(id))
    .filter((id, index, list) => id && projectIds.has(id) && list.indexOf(id) === index);
  return { selectedProjectIds, projects };
}

function mergeSettings(raw = {}) {
  const testDataLibrary = normalizeTestDataLibrary(raw.testDataLibrary || {}, raw);
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    visiblePanelTabs: normalizeVisiblePanelTabs(raw.visiblePanelTabs),
    decryptConfig: normalizeDecryptConfig(raw.decryptConfig || DEFAULT_SETTINGS.decryptConfig),
    testDataLibrary,
    mockRuleCenter: {
      ...(DEFAULT_SETTINGS.mockRuleCenter || {}),
      ...(raw.mockRuleCenter || {})
    },
    deepseek: { ...DEFAULT_SETTINGS.deepseek, ...(raw.deepseek || {}) },
    zhipu: normalizeZhipuSettings(raw.zhipu || {}),
    openai: normalizeOpenAISettings(raw.openai || {})
  };
}

function normText(input) {
  return String(input || '').replace(/\s+/g, ' ').trim();
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function linesToList(value = '') {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToLines(value = []) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join('\n');
}

const RICH_TEXT_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

function formatRichTextError(error) {
  return error?.message || String(error || '未知错误');
}

function setSaveStatus(message = '', variant = '') {
  if (!els.saveStatus) return;
  els.saveStatus.textContent = message;
  els.saveStatus.classList.remove('success', 'info', 'error');
  if (variant) els.saveStatus.classList.add(variant);
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

function readVisiblePanelTabsFromForm() {
  return Array.from(document.querySelectorAll('input[name="visibleTabs"]:checked'))
    .map((input) => input instanceof HTMLInputElement ? input.value : '')
    .filter((value) => PANEL_TAB_VALUES.includes(value));
}

function writeVisiblePanelTabsToForm(raw = DEFAULT_VISIBLE_PANEL_TABS) {
  const selected = new Set(normalizeVisiblePanelTabs(raw));
  document.querySelectorAll('input[name="visibleTabs"]').forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.checked = selected.has(input.value)
        && (input.value !== PROTECTED_PANEL_TAB_VALUE || state.decryptConfigUnlocked);
    }
  });
}

function setTabControlError(visible) {
  if (els.tabControlError) {
    els.tabControlError.hidden = !visible;
  }
}

function setTabControlStatus(message = '', variant = 'success') {
  if (!els.tabControlStatus) return;
  if (tabControlStatusTimer) {
    window.clearTimeout(tabControlStatusTimer);
    tabControlStatusTimer = 0;
  }
  els.tabControlStatus.textContent = message;
  els.tabControlStatus.classList.toggle('error', variant === 'error');
  els.tabControlStatus.hidden = !message;
  if (message) {
    tabControlStatusTimer = window.setTimeout(() => {
      els.tabControlStatus.hidden = true;
      els.tabControlStatus.textContent = '';
      els.tabControlStatus.classList.remove('error');
      tabControlStatusTimer = 0;
    }, 3000);
  }
}

function showDecryptVisibilityMessage(message = '') {
  if (!els.decryptVisibilityMessage) return;
  if (decryptVisibilityMessageTimer) {
    window.clearTimeout(decryptVisibilityMessageTimer);
    decryptVisibilityMessageTimer = 0;
  }
  els.decryptVisibilityMessage.textContent = message;
  els.decryptVisibilityMessage.hidden = !message;
  if (message) {
    decryptVisibilityMessageTimer = window.setTimeout(() => {
      els.decryptVisibilityMessage.hidden = true;
      els.decryptVisibilityMessage.textContent = '';
      decryptVisibilityMessageTimer = 0;
    }, 3000);
  }
}

function setDecryptConfigVisibility(visible, options = {}) {
  const shouldShow = visible === true;
  if (els.decryptSection) els.decryptSection.hidden = !shouldShow;
  if (els.decryptSectionNav) els.decryptSectionNav.hidden = !shouldShow;

  if (!shouldShow && els.decryptSectionNav?.classList.contains('active')) {
    document.querySelectorAll('[data-section-nav]').forEach((item) => {
      item.classList.toggle('active', item.getAttribute('data-section-nav') === 'baseSection');
    });
  }

  if (options.notify === true) {
    showDecryptVisibilityMessage(shouldShow ? '解密配置已开启' : '解密配置已隐藏');
  }
}

function closeTabPasswordModal() {
  if (els.tabPasswordModal) els.tabPasswordModal.hidden = true;
  if (els.tabPasswordInput) els.tabPasswordInput.value = '';
  if (els.tabPasswordError) els.tabPasswordError.hidden = true;
  state.pendingProtectedTabInput = null;
}

function openTabPasswordModal(input) {
  state.pendingProtectedTabInput = input;
  if (els.tabPasswordInput) els.tabPasswordInput.value = '';
  if (els.tabPasswordError) els.tabPasswordError.hidden = true;
  if (els.tabPasswordModal) els.tabPasswordModal.hidden = false;
  window.setTimeout(() => els.tabPasswordInput?.focus(), 0);
}

function confirmProtectedTabPassword() {
  const input = state.pendingProtectedTabInput;
  if (!input) {
    closeTabPasswordModal();
    return;
  }
  if (md5(els.tabPasswordInput?.value || '') !== PROTECTED_PANEL_TAB_PASSWORD_MD5) {
    input.checked = false;
    if (els.tabPasswordError) els.tabPasswordError.hidden = false;
    els.tabPasswordInput?.focus();
    els.tabPasswordInput?.select();
    return;
  }
  state.decryptConfigUnlocked = true;
  input.checked = true;
  closeTabPasswordModal();
  setDecryptConfigVisibility(true, { notify: true });
  setTabControlError(false);
  setTabControlStatus('验证通过，请保存', 'success');
}

function cancelProtectedTabPassword() {
  if (state.pendingProtectedTabInput) {
    state.pendingProtectedTabInput.checked = false;
  }
  closeTabPasswordModal();
  setTabControlStatus('');
}

function cloneDecryptConfig(config = {}) {
  return normalizeDecryptConfig(JSON.parse(JSON.stringify(config || {})));
}

function setDecryptConfigError(message = '') {
  if (!els.decryptConfigError) return;
  els.decryptConfigError.textContent = message;
  els.decryptConfigError.hidden = !message;
}

function readDecryptProjectSelection() {
  return Array.from(document.querySelectorAll('input[name="decryptProjectEnabled"]:checked'))
    .map((input) => input instanceof HTMLInputElement ? input.value : '')
    .filter(Boolean);
}

function readDecryptConfigFromForm() {
  return normalizeDecryptConfig({
    projects: state.decryptConfig.projects,
    selectedProjectIds: readDecryptProjectSelection()
  });
}

function createEmptyDecryptProject() {
  return {
    id: createDecryptProjectId(),
    name: '',
    salt: '',
    minLength: ''
  };
}

function renderDecryptProjectOptions(config = state.decryptConfig) {
  if (!els.decryptProjectOptions) return;
  const normalized = normalizeDecryptConfig(config);
  const selected = new Set(normalized.selectedProjectIds);
  els.decryptProjectOptions.innerHTML = '';

  if (els.decryptConfigEmpty) {
    els.decryptConfigEmpty.hidden = normalized.projects.length > 0;
  }

  normalized.projects.forEach((project) => {
    const label = document.createElement('label');
    label.className = 'decrypt-option';
    label.classList.toggle('is-disabled', state.decryptEditing);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'decryptProjectEnabled';
    checkbox.value = project.id;
    checkbox.checked = selected.has(project.id);
    checkbox.disabled = state.decryptEditing;

    const text = document.createElement('span');
    text.textContent = project.name || '未命名项目';

    label.append(checkbox, text);
    els.decryptProjectOptions.appendChild(label);
  });
}

function createDecryptInput(project, field, placeholder) {
  const input = document.createElement('input');
  input.type = 'text';
  if (field === 'salt') {
    input.dataset.saltChanged = 'false';
    input.value = maskDecryptSalt(project[field]);
  } else {
    input.value = field === 'minLength' ? sanitizePositiveInteger(project[field]) : (project[field] || '');
  }
  input.placeholder = placeholder;
  input.dataset.decryptField = field;
  input.autocomplete = 'off';
  if (field === 'minLength') {
    input.inputMode = 'numeric';
    input.pattern = '[1-9][0-9]*';
  }
  return input;
}

function renderDecryptDraftRows() {
  if (!els.decryptConfigTableBody) return;
  const draft = state.decryptDraft || { projects: [] };
  els.decryptConfigTableBody.innerHTML = '';

  if (!draft.projects.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'decrypt-table-empty';
    cell.textContent = '暂无配置行，点击新增项目添加。';
    row.appendChild(cell);
    els.decryptConfigTableBody.appendChild(row);
    return;
  }

  draft.projects.forEach((project) => {
    const row = document.createElement('tr');
    row.dataset.projectId = project.id;

    const nameCell = document.createElement('td');
    nameCell.appendChild(createDecryptInput(project, 'name', '请输入项目名称'));

    const saltCell = document.createElement('td');
    saltCell.appendChild(createDecryptInput(project, 'salt', '请输入盐值'));

    const lengthCell = document.createElement('td');
    lengthCell.appendChild(createDecryptInput(project, 'minLength', '请输入最小长度'));

    const actionCell = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'option-btn danger decrypt-row-delete';
    deleteBtn.textContent = '删除';
    actionCell.appendChild(deleteBtn);

    row.append(nameCell, saltCell, lengthCell, actionCell);
    els.decryptConfigTableBody.appendChild(row);
  });
}

function collectDecryptDraftFromTable(options = {}) {
  const validate = options.validate === true;
  if (!els.decryptConfigTableBody) return normalizeDecryptConfig(state.decryptDraft || {});
  const rows = Array.from(els.decryptConfigTableBody.querySelectorAll('tr[data-project-id]'));
  const projects = [];
  let hasInvalid = false;

  rows.forEach((row) => {
    const project = { id: row.dataset.projectId || createDecryptProjectId() };
    const currentProject = getDecryptDraftProject(project.id);
    row.querySelectorAll('input[data-decrypt-field]').forEach((input) => {
      const field = input.dataset.decryptField;
      const rawValue = field === 'salt' && input.dataset.saltChanged !== 'true'
        ? currentProject?.salt
        : input.value;
      const value = field === 'minLength' ? sanitizePositiveInteger(rawValue) : cleanDecryptText(rawValue);
      if (field === 'minLength') input.value = value;
      project[field] = value;
      const invalid = validate && !value;
      input.classList.toggle('is-invalid', invalid);
      if (invalid) hasInvalid = true;
    });
    projects.push(normalizeDecryptProject(project));
  });

  if (validate && hasInvalid) {
    setDecryptConfigError('请完整填写每一行的项目名称、盐值和最小长度。');
    return null;
  }

  setDecryptConfigError('');
  return normalizeDecryptConfig({
    projects,
    selectedProjectIds: readDecryptProjectSelection()
  });
}

function renderDecryptConfig(config = state.decryptConfig) {
  const normalized = normalizeDecryptConfig(config);
  state.decryptConfig = normalized;
  renderDecryptProjectOptions(normalized);

  if (els.decryptConfigEditor) {
    els.decryptConfigEditor.hidden = !state.decryptEditing;
  }

  if (els.decryptConfigEditBtn) {
    els.decryptConfigEditBtn.classList.toggle('active', state.decryptEditing);
  }

  if (state.decryptEditing) {
    renderDecryptDraftRows();
  }
}

function enterDecryptConfigEditMode() {
  state.decryptDraft = cloneDecryptConfig(state.decryptConfig);
  if (!state.decryptDraft.projects.length) {
    state.decryptDraft.projects.push(createEmptyDecryptProject());
  }
  state.decryptEditing = true;
  setDecryptConfigError('');
  renderDecryptConfig(state.decryptConfig);
}

function cancelDecryptConfigEditMode() {
  state.decryptDraft = null;
  state.decryptEditing = false;
  setDecryptConfigError('');
  renderDecryptConfig(state.decryptConfig);
}

async function saveDecryptConfig() {
  const draft = collectDecryptDraftFromTable({ validate: true });
  if (!draft) return;
  const res = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const current = mergeSettings(res[STORAGE_KEYS.SETTINGS] || {});
  const settings = mergeSettings({
    ...current,
    decryptConfig: draft
  });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  state.decryptDraft = null;
  state.decryptEditing = false;
  renderDecryptConfig(settings.decryptConfig);
  setSaveStatus('解密配置已保存', 'success');
}

function getValidatedVisiblePanelTabs() {
  const selected = readVisiblePanelTabsFromForm();
  if (!selected.length) {
    setTabControlError(true);
    setTabControlStatus('');
    throw new Error('请至少选择一个展示Tab');
  }
  setTabControlError(false);
  return normalizeVisiblePanelTabs(selected);
}

function setRichTextError(message = '') {
  if (!els.testDataRichTextError) return;
  els.testDataRichTextError.textContent = message;
  els.testDataRichTextError.classList.toggle('is-visible', !!message);
}

function validateRichTextSource(html = '') {
  const source = String(html || '');
  const forbiddenTag = source.match(/<\s*(script|iframe|object|embed|base|meta|link)\b/i);
  if (forbiddenTag) {
    throw new Error(`富文本源码包含不允许的 <${forbiddenTag[1].toLowerCase()}> 标签`);
  }
  const eventAttr = source.match(/\son[a-z]+\s*=/i);
  if (eventAttr) {
    throw new Error(`富文本源码包含事件属性 ${eventAttr[0].trim()}，为避免执行脚本已阻止转换`);
  }
  if (/javascript\s*:/i.test(source)) {
    throw new Error('富文本源码包含 javascript: 链接，为避免执行脚本已阻止转换');
  }

  const stack = [];
  const tagPattern = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)\b([^>]*)>/g;
  let match;
  while ((match = tagPattern.exec(source))) {
    const isClosing = !!match[1];
    const tagName = match[2].toLowerCase();
    const tagTail = match[3] || '';
    if (RICH_TEXT_VOID_TAGS.has(tagName)) continue;
    if (isClosing) {
      const latest = stack.pop();
      if (!latest) {
        throw new Error(`富文本源码出现多余的 </${tagName}> 结束标签`);
      }
      if (latest !== tagName) {
        throw new Error(`富文本源码标签不匹配：遇到 </${tagName}>，但最近未关闭的是 <${latest}>`);
      }
      continue;
    }
    if (/\/\s*$/.test(tagTail)) continue;
    stack.push(tagName);
  }
  if (stack.length) {
    throw new Error(`富文本源码标签未闭合：<${stack[stack.length - 1]}>`);
  }
  return source;
}

function normalizeRichTextHtml(html = '') {
  const value = String(html || '').trim();
  if (!value) return '';
  const holder = document.createElement('div');
  holder.innerHTML = value;
  const visibleText = String(holder.textContent || '').replace(/\u00a0/g, ' ').trim();
  const richNode = holder.querySelector('img,svg,table,video,audio,hr,br,ul,ol,li');
  return visibleText || richNode ? holder.innerHTML.trim() : '';
}

function isNodeInRichTextEditor(node) {
  if (!els.testDataRichTextEditor || !node) return false;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  return !!(element && els.testDataRichTextEditor.contains(element));
}

function rememberRichTextSelection() {
  if (!els.testDataRichTextEditor || state.richTextSourceMode) return;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !isNodeInRichTextEditor(selection.anchorNode)) return;
  state.richTextSelectionRange = selection.getRangeAt(0).cloneRange();
}

function restoreRichTextSelection() {
  if (!els.testDataRichTextEditor || state.richTextSourceMode) return false;
  els.testDataRichTextEditor.focus();
  if (!state.richTextSelectionRange) return false;
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  selection.addRange(state.richTextSelectionRange);
  return true;
}

function syncRichTextEditorToSource() {
  if (!els.testDataRichText || !els.testDataRichTextEditor) return true;
  els.testDataRichText.value = normalizeRichTextHtml(els.testDataRichTextEditor.innerHTML);
  setRichTextError('');
  return true;
}

function syncRichTextSourceToEditor() {
  if (!els.testDataRichText || !els.testDataRichTextEditor) return true;
  const source = validateRichTextSource(els.testDataRichText.value || '');
  els.testDataRichTextEditor.innerHTML = source;
  setRichTextError('');
  return true;
}

function setRichTextMode(sourceMode, options = {}) {
  const nextMode = !!sourceMode;
  const sync = options.sync !== false;
  const previousMode = state.richTextSourceMode;
  const previousSource = els.testDataRichText?.value || '';
  const previousHtml = els.testDataRichTextEditor?.innerHTML || '';
  try {
    if (sync) {
      if (nextMode) syncRichTextEditorToSource();
      else syncRichTextSourceToEditor();
    }
    state.richTextSourceMode = nextMode;
    els.testDataRichTextCard?.classList.toggle('is-source-mode', nextMode);
    if (els.testDataRichTextSourceMode) els.testDataRichTextSourceMode.checked = nextMode;
    setRichTextError('');
    return true;
  } catch (error) {
    if (els.testDataRichText) els.testDataRichText.value = previousSource;
    if (els.testDataRichTextEditor) els.testDataRichTextEditor.innerHTML = previousHtml;
    state.richTextSourceMode = previousMode;
    els.testDataRichTextCard?.classList.toggle('is-source-mode', previousMode);
    if (els.testDataRichTextSourceMode) els.testDataRichTextSourceMode.checked = previousMode;
    setRichTextError(`转换失败：${formatRichTextError(error)}`);
    return false;
  }
}

function readRichTextPoolFromForm() {
  if (!els.testDataRichText) return [];
  if (state.richTextSourceMode) {
    return linesToList(els.testDataRichText.value || '');
  }
  if (els.testDataRichTextEditor) {
    syncRichTextEditorToSource();
    return els.testDataRichText.value ? [els.testDataRichText.value] : [];
  }
  return linesToList(els.testDataRichText.value || '');
}

function writeRichTextPoolToForm(pool = []) {
  const source = listToLines(pool);
  if (els.testDataRichText) els.testDataRichText.value = source;
  if (!els.testDataRichTextEditor) return;
  try {
    validateRichTextSource(source);
    els.testDataRichTextEditor.innerHTML = source;
    setRichTextMode(false, { sync: false });
    setRichTextError('');
  } catch (error) {
    els.testDataRichTextEditor.textContent = source;
    setRichTextMode(true, { sync: false });
    setRichTextError(`富文本源码转换失败：${formatRichTextError(error)}`);
  }
}

function normalizeList(value = [], fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return Array.from(
    new Set(
      (Array.isArray(source) ? source : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
}

function isSameStringList(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((item, index) => String(item || '').trim() === String(b[index] || '').trim());
}

function normalizeRichTextList(value = [], fallback = []) {
  const normalized = normalizeList(value, fallback);
  return isSameStringList(normalized, LEGACY_DEFAULT_RICH_TEXT_POOL) ? normalizeList(fallback, fallback) : normalized;
}

const FILE_CATEGORY_LABELS = {
  document: '文档类',
  image: '图片类',
  video: '视频类',
  audio: '音频类',
  archive: '压缩包类'
};

const FILE_CATEGORY_ORDER = ['document', 'image', 'video', 'audio', 'archive'];

function createEmptyFilePools() {
  return {
    document: [],
    image: [],
    video: [],
    audio: [],
    archive: []
  };
}

function inferFileCategory(file = {}) {
  const mime = String(file.mimeType || file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|ico|heic)$/.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|wmv|m4v)$/.test(name)) return 'video';
  if (mime.startsWith('audio/') || /\.(mp3|wav|aac|m4a|flac|ogg|wma)$/.test(name)) return 'audio';
  if (/zip|rar|7z|tar|gzip|compressed|x-zip|x-rar/i.test(mime) || /\.(zip|rar|7z|tar|gz|bz2)$/.test(name)) return 'archive';
  return 'document';
}

function normalizeFileCategory(category = '', file = {}) {
  const value = String(category || '').trim();
  return FILE_CATEGORY_ORDER.includes(value) ? value : inferFileCategory(file);
}

function buildFilePoolsFromStore(files = []) {
  const pools = createEmptyFilePools();
  for (const file of files || []) {
    const category = normalizeFileCategory(file.category, file);
    pools[category].push({
      name: file.name || '',
      mimeType: file.mimeType || 'application/octet-stream',
      size: Number(file.size || 0),
      updatedAt: Number(file.updatedAt || Date.now())
    });
  }
  return pools;
}

function normalizeTestDataLibrary(raw = {}, fallbackSettings = {}) {
  const migratedRaw = migrateTestDataLibraryDefaults(raw);
  const defaults = cloneJson(DEFAULT_SETTINGS.testDataLibrary || {});
  const defaultPools = defaults.pools || {};
  const rawPools = migratedRaw?.pools || {};
  const legacyEmail = Array.isArray(fallbackSettings.emailPoolList) && fallbackSettings.emailPoolList.length
    ? migrateDefaultEmailPool(fallbackSettings.emailPoolList)
    : defaultPools.email;
  return {
    version: Number(migratedRaw.version || defaults.version || 1),
    enabled: migratedRaw.enabled !== false,
    pools: {
      chineseName: normalizeList(rawPools.chineseName, defaultPools.chineseName),
      englishName: normalizeList(rawPools.englishName, defaultPools.englishName),
      mobile: {
        cn: normalizeList(rawPools.mobile?.cn, defaultPools.mobile?.cn),
        hk: normalizeList(rawPools.mobile?.hk, defaultPools.mobile?.hk),
        mo: normalizeList(rawPools.mobile?.mo, defaultPools.mobile?.mo)
      },
      email: normalizeList(rawPools.email, legacyEmail),
      companyName: normalizeList(rawPools.companyName, defaultPools.companyName),
      socialCreditCode: normalizeList(rawPools.socialCreditCode, defaultPools.socialCreditCode),
      idDocument: {
        cnId: normalizeList(rawPools.idDocument?.cnId, defaultPools.idDocument?.cnId),
        hmtResident: normalizeList(rawPools.idDocument?.hmtResident, defaultPools.idDocument?.hmtResident),
        passport: normalizeList(rawPools.idDocument?.passport, defaultPools.idDocument?.passport)
      },
      landline: normalizeList(rawPools.landline, defaultPools.landline),
      address: normalizeList(rawPools.address, defaultPools.address),
      date: normalizeList(rawPools.date, defaultPools.date),
      plainText: normalizeList(rawPools.plainText, defaultPools.plainText),
      richText: normalizeRichTextList(rawPools.richText, defaultPools.richText),
      number: normalizeList(rawPools.number, defaultPools.number),
      bankCard: {
        cn: normalizeList(rawPools.bankCard?.cn, defaultPools.bankCard?.cn),
        hk: normalizeList(rawPools.bankCard?.hk, defaultPools.bankCard?.hk)
      },
      file: state.fileStore.length
        ? buildFilePoolsFromStore(state.fileStore)
        : {
            ...createEmptyFilePools(),
            ...(rawPools.file && typeof rawPools.file === 'object' ? rawPools.file : {})
          }
    }
  };
}

function renderTestDataSummary(library = {}) {
  if (!els.testDataSummary) return;
  const pools = library?.pools || {};
  const counts = [
    pools.chineseName,
    pools.englishName,
    pools.mobile?.cn,
    pools.mobile?.hk,
    pools.mobile?.mo,
    pools.email,
    pools.companyName,
    pools.socialCreditCode,
    pools.idDocument?.cnId,
    pools.idDocument?.hmtResident,
    pools.idDocument?.passport,
    pools.landline,
    pools.address,
    pools.date,
    pools.plainText,
    pools.richText,
    pools.number,
    pools.bankCard?.cn,
    pools.bankCard?.hk
  ].reduce((sum, list) => sum + (Array.isArray(list) && list.length ? 1 : 0), 0);
  const fileCount = Object.values(buildFilePoolsFromStore(state.fileStore)).reduce((sum, list) => sum + list.length, 0);
  els.testDataSummary.textContent = `已准备 ${counts} 类文本数据，${fileCount} 个文件资源`;
}

function readTestDataLibraryFromForm() {
  const library = normalizeTestDataLibrary({}, {});
  library.enabled = els.testDataEnabled?.checked !== false;
  library.pools.chineseName = linesToList(els.testDataChineseName?.value || '');
  library.pools.englishName = linesToList(els.testDataEnglishName?.value || '');
  library.pools.mobile.cn = linesToList(els.testDataMobileCn?.value || '');
  library.pools.mobile.hk = linesToList(els.testDataMobileHk?.value || '');
  library.pools.mobile.mo = linesToList(els.testDataMobileMo?.value || '');
  library.pools.email = linesToList(els.testDataEmail?.value || '');
  library.pools.companyName = linesToList(els.testDataCompanyName?.value || '');
  library.pools.socialCreditCode = linesToList(els.testDataSocialCreditCode?.value || '');
  library.pools.idDocument.cnId = linesToList(els.testDataIdCn?.value || '');
  library.pools.idDocument.hmtResident = linesToList(els.testDataIdHmt?.value || '');
  library.pools.idDocument.passport = linesToList(els.testDataPassport?.value || '');
  library.pools.landline = linesToList(els.testDataLandline?.value || '');
  library.pools.address = linesToList(els.testDataAddress?.value || '');
  library.pools.date = linesToList(els.testDataDate?.value || '');
  library.pools.plainText = linesToList(els.testDataPlainText?.value || '');
  library.pools.richText = readRichTextPoolFromForm();
  library.pools.number = linesToList(els.testDataNumber?.value || '');
  library.pools.bankCard.cn = linesToList(els.testDataBankCardCn?.value || '');
  library.pools.bankCard.hk = linesToList(els.testDataBankCardHk?.value || '');
  library.pools.file = buildFilePoolsFromStore(state.fileStore);
  renderTestDataSummary(library);
  return library;
}

function writeTestDataLibraryToForm(rawLibrary = {}, settings = {}) {
  const library = normalizeTestDataLibrary(rawLibrary, settings);
  if (els.testDataEnabled) els.testDataEnabled.checked = library.enabled !== false;
  if (els.testDataChineseName) els.testDataChineseName.value = listToLines(library.pools.chineseName);
  if (els.testDataEnglishName) els.testDataEnglishName.value = listToLines(library.pools.englishName);
  if (els.testDataMobileCn) els.testDataMobileCn.value = listToLines(library.pools.mobile.cn);
  if (els.testDataMobileHk) els.testDataMobileHk.value = listToLines(library.pools.mobile.hk);
  if (els.testDataMobileMo) els.testDataMobileMo.value = listToLines(library.pools.mobile.mo);
  if (els.testDataEmail) els.testDataEmail.value = listToLines(library.pools.email);
  if (els.testDataCompanyName) els.testDataCompanyName.value = listToLines(library.pools.companyName);
  if (els.testDataSocialCreditCode) els.testDataSocialCreditCode.value = listToLines(library.pools.socialCreditCode);
  if (els.testDataIdCn) els.testDataIdCn.value = listToLines(library.pools.idDocument.cnId);
  if (els.testDataIdHmt) els.testDataIdHmt.value = listToLines(library.pools.idDocument.hmtResident);
  if (els.testDataPassport) els.testDataPassport.value = listToLines(library.pools.idDocument.passport);
  if (els.testDataLandline) els.testDataLandline.value = listToLines(library.pools.landline);
  if (els.testDataAddress) els.testDataAddress.value = listToLines(library.pools.address);
  if (els.testDataDate) els.testDataDate.value = listToLines(library.pools.date);
  if (els.testDataPlainText) els.testDataPlainText.value = listToLines(library.pools.plainText);
  writeRichTextPoolToForm(library.pools.richText);
  if (els.testDataNumber) els.testDataNumber.value = listToLines(library.pools.number);
  if (els.testDataBankCardCn) els.testDataBankCardCn.value = listToLines(library.pools.bankCard.cn);
  if (els.testDataBankCardHk) els.testDataBankCardHk.value = listToLines(library.pools.bankCard.hk);
  renderTestDataSummary(library);
  return library;
}

function buildPathKeyFromUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (!/^https?:/.test(parsed.protocol)) return '';
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return '';
  }
}

function parseFingerprintPreview(fingerprint = '') {
  const items = String(fingerprint || '').split('|');
  const parts = {};
  for (const item of items) {
    const idx = item.indexOf(':');
    if (idx <= 0) continue;
    const key = item.slice(0, idx);
    const value = item.slice(idx + 1);
    parts[key] = value;
  }
  return {
    label: parts.label || '(无标签)',
    selector: parts.sel || '(无选择器)',
    container: parts.container || '',
    placeholder: parts.ph || '',
    detail: parts.detail || '',
    variant: parts.variant || ''
  };
}

function describeMappingStrategy(kind = '', preview = {}) {
  const title = preview.label || preview.placeholder || preview.selector || '';
  if (kind === 'phone') {
    return /香港|hk|hong kong|流動電話|機構|网址|網址/i.test(title)
      ? '默认生成：香港手机号'
      : '默认生成：手机号（大陆 11 位格式）';
  }
  if (kind === 'tel') return '默认生成：固定电话（会按页面语义区分大陆/香港）';
  if (kind === 'email') return '默认生成：邮箱池或随机邮箱';
  if (kind === 'date') return '默认生成：日期';
  if (kind === 'select') return '默认策略：随机选择一个可用选项';
  if (kind === 'radioGroup') return '默认策略：随机勾选一个单选项';
  if (kind === 'checkboxGroup') return '默认策略：随机勾选 1 项';
  if (kind === 'addressComponent') return '默认策略：按省/市/区/街道生成地址组件';
  if (kind === 'addressDetail') return '默认策略：按页面提示生成地址明细';
  if (kind === 'companyName') return '默认生成：企业名称';
  if (kind === 'companyId') return '默认生成：企业编号/登记号';
  if (kind === 'bankCard') return '默认生成：银行卡号（按字段语义区分中国境内/香港）';
  if (kind === 'fullName' || kind === 'firstName' || kind === 'lastName') return '默认生成：姓名';
  if (kind === 'verification') return '默认生成：6 位验证码';
  if (kind === 'jobTitle') return '默认生成：职位';
  if (kind === 'file') return '默认策略：使用设置中心上传的文件';
  return '默认生成：通用文本';
}

function clearListNode(node, emptyText) {
  if (!node) return;
  node.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'mapping-item';
  const title = document.createElement('div');
  title.className = 'mapping-item-title';
  title.textContent = emptyText;
  li.appendChild(title);
  node.appendChild(li);
}

function readForm() {
  const testDataLibrary = readTestDataLibraryFromForm();
  return {
    mode: els.mode.value,
    provider: els.provider.value,
    floatingEnabled: els.floatingEnabled.checked,
    inlinePanelEnabled: els.inlinePanelEnabled.checked,
    fillRadioCheckbox: els.fillRadioCheckbox.checked,
    fillOptionalFields: els.fillOptionalFields.checked,
    paginateFillEnabled: els.paginateFillEnabled.checked,
    visiblePanelTabs: normalizeVisiblePanelTabs(readVisiblePanelTabsFromForm()),
    debugLogs: els.debugLogs.checked,
    deepseek: {
      baseUrl: els.deepseekBaseUrl.value.trim(),
      model: els.deepseekModel.value.trim(),
      apiKey: els.deepseekApiKey.value.trim()
    },
    zhipu: {
      baseUrl: els.zhipuBaseUrl.value.trim(),
      model: els.zhipuModel.value.trim(),
      apiKey: els.zhipuApiKey.value.trim(),
      thinkingType: normalizeZhipuThinkingType(els.zhipuThinkingType?.value),
      reasoningEffort: normalizeZhipuReasoningEffort(els.zhipuReasoningEffort?.value),
      maxTokens: normalizeZhipuMaxTokens(els.zhipuMaxTokens?.value)
    },
    openai: {
      baseUrl: els.openaiBaseUrl.value.trim(),
      model: els.openaiModel.value.trim(),
      reasoningEffort: normalizeOpenAIReasoningEffort(els.openaiReasoningEffort?.value),
      apiKey: els.openaiApiKey.value.trim()
    },
    temperature: Number(els.temperature?.value ?? 0.2),
    testDataLibrary,
    decryptConfig: readDecryptConfigFromForm(),
    emailPoolEnabled: testDataLibrary.enabled !== false,
    emailPoolList: testDataLibrary.pools.email,
    mockRules: state.mockRules.map((item) => normalizeMockRule(item)),
    mockRuleCenter: buildMockRuleCenterFromRules(state.mockRules),
    fileUploadPaths: []
  };
}

function writeForm(settings) {
  els.mode.value = settings.mode || 'content';
  els.provider.value = settings.provider || 'heuristic';
  els.floatingEnabled.checked = settings.floatingEnabled !== false;
  els.inlinePanelEnabled.checked = settings.inlinePanelEnabled !== false;
  els.fillRadioCheckbox.checked = settings.fillRadioCheckbox !== false;
  els.fillOptionalFields.checked = settings.fillOptionalFields !== false;
  els.paginateFillEnabled.checked = settings.paginateFillEnabled === true;
  writeVisiblePanelTabsToForm(settings.visiblePanelTabs);
  setDecryptConfigVisibility(
    state.decryptConfigUnlocked
      && normalizeVisiblePanelTabs(settings.visiblePanelTabs).includes(PROTECTED_PANEL_TAB_VALUE)
  );
  setTabControlError(false);
  setTabControlStatus('');
  els.debugLogs.checked = !!settings.debugLogs;
  els.deepseekBaseUrl.value = settings.deepseek?.baseUrl || '';
  els.deepseekModel.value = settings.deepseek?.model || '';
  els.deepseekApiKey.value = settings.deepseek?.apiKey || '';
  if (els.zhipuBaseUrl) els.zhipuBaseUrl.value = settings.zhipu?.baseUrl || '';
  if (els.zhipuModel) els.zhipuModel.value = settings.zhipu?.model || '';
  if (els.zhipuApiKey) els.zhipuApiKey.value = settings.zhipu?.apiKey || '';
  if (els.zhipuThinkingType) {
    els.zhipuThinkingType.value = normalizeZhipuThinkingType(settings.zhipu?.thinkingType);
  }
  if (els.zhipuReasoningEffort) {
    els.zhipuReasoningEffort.value = normalizeZhipuReasoningEffort(settings.zhipu?.reasoningEffort);
  }
  if (els.zhipuMaxTokens) {
    els.zhipuMaxTokens.value = String(normalizeZhipuMaxTokens(settings.zhipu?.maxTokens));
  }
  els.openaiBaseUrl.value = settings.openai?.baseUrl || '';
  els.openaiModel.value = settings.openai?.model || '';
  if (els.openaiReasoningEffort) {
    els.openaiReasoningEffort.value = normalizeOpenAIReasoningEffort(settings.openai?.reasoningEffort);
  }
  els.openaiApiKey.value = settings.openai?.apiKey || '';
  if (els.temperature) {
    const temp = Number(settings.temperature ?? 0.2);
    els.temperature.value = String(temp);
    if (els.temperatureDisplay) els.temperatureDisplay.textContent = String(temp);
  }
  writeTestDataLibraryToForm(settings.testDataLibrary || {}, settings);
  renderDecryptConfig(settings.decryptConfig || {});
  // fileUploadPaths（磁盘路径）已废弃，文件改为 base64 存储，由 initFileUpload 单独加载。
}

function normalizeMockRule(rule = {}) {
  return {
    id: rule.id || `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    scope: buildPathKeyFromUrl(rule.scope || rule.pathKey || '') || String(rule.scope || rule.pathKey || '').trim(),
    fingerprint: String(rule.fingerprint || '').trim().toLowerCase(),
    match: String(rule.match || '').trim(),
    kind: String(rule.kind || 'any').trim() || 'any',
    preset: String(rule.preset || 'fixed').trim() || 'fixed',
    value: rule.value == null ? '' : String(rule.value).trim(),
    updatedAt: Number(rule.updatedAt || Date.now()) || Date.now()
  };
}

function buildMockRuleCenterFromRules(rules = []) {
  const center = {
    globalRules: [],
    scopedRules: {},
    fingerprintRules: {}
  };
  for (const raw of rules || []) {
    const rule = normalizeMockRule(raw);
    if (rule.fingerprint) {
      const key = String(rule.fingerprint).trim().toLowerCase();
      if (!key) continue;
      center.fingerprintRules[key] = center.fingerprintRules[key] || [];
      center.fingerprintRules[key].push(rule);
      continue;
    }
    if (rule.scope) {
      const key = String(rule.scope).trim().toLowerCase();
      center.scopedRules[key] = center.scopedRules[key] || [];
      center.scopedRules[key].push(rule);
      continue;
    }
    center.globalRules.push(rule);
  }
  return center;
}

function flattenMockRulesFromCenter(center = {}) {
  const out = [];
  const pushRule = (rule = {}, ext = {}) => {
    out.push(
      normalizeMockRule({
        ...rule,
        ...ext
      })
    );
  };
  for (const rule of center?.globalRules || []) pushRule(rule);
  for (const [scope, rules] of Object.entries(center?.scopedRules || {})) {
    for (const rule of rules || []) pushRule(rule, { scope });
  }
  for (const [fingerprint, rules] of Object.entries(center?.fingerprintRules || {})) {
    for (const rule of rules || []) pushRule(rule, { fingerprint });
  }
  return out;
}

function formatMockRuleSummary(rule = {}) {
  const kindLabel = rule.kind === 'any' ? '全部类型' : rule.kind;
  const presetLabel = MOCK_PRESET_LABELS[rule.preset] || rule.preset || '固定文本';
  const scopeLabel = rule.scope ? ` · 作用于 ${rule.scope}` : '';
  return `${kindLabel} · ${presetLabel}${scopeLabel}`;
}

function inferPresetFromFieldRecord(record = {}) {
  const hint = `${record.title || ''} ${record.matchText || ''} ${record.kind || ''} ${record.selector || ''}`.toLowerCase();
  if (/機構宗旨|机构宗旨|mission|宗旨/.test(hint)) return 'orgMission';
  if (/服務內容|服务内容|service/.test(hint)) return 'serviceContent';
  if (/網址|网址|website|homepage|site|url/.test(hint)) return 'websiteGlobal';
  if (/全職|全职|員工|员工|職員|职员|staff|employee/.test(hint)) return 'employeeCount';
  if (/預算|预算|開支|开支|expense|budget|income|revenue|amount/.test(hint)) return 'amountBudget';
  if (/中文.*地址|地址.*中文|室／樓／大廈|區域／地區|地区|区域|street|road|address/.test(hint)) {
    return /香港|hk|hong kong|九龍|九龙|新界|港島|港岛/.test(hint) ? 'addressHk' : 'address';
  }
  if (/手機|手机|mobile|phone/.test(hint)) return /香港|hk|hong kong/.test(hint) ? 'hkPhone' : 'cnPhone';
  if (/電話|电话|tel|telephone|landline/.test(hint)) return /香港|hk|hong kong/.test(hint) ? 'hkLandline' : 'cnLandline';
  if (/英文|英語|英语|\(英\)|（英）/.test(hint)) {
    if (/name|姓名|名字|first|last|surname/.test(hint)) return 'enName';
    if (/position|title|職位|职位/.test(hint)) return 'jobTitleEn';
    if (/company|organisation|organization|機構|机构|企業|企业/.test(hint)) return 'companyEn';
  }
  if (/姓名|名字|姓氏|first|last|surname/.test(hint)) return 'cnName';
  if (/職位|职位|title|position/.test(hint)) return 'jobTitleZh';
  if (/企業|企业|公司|機構|机构|organization|organisation|company/.test(hint)) return 'companyZh';
  if (/email|郵箱|邮箱|電郵/.test(hint)) return 'emailRandom';
  if (/date|日期|時間|时间/.test(hint)) return 'date';
  if (/select|下拉|請選擇|请选择/.test(hint)) return 'selectRandom';
  return 'fixed';
}

function getAllowedPresetValuesByKind(kind = 'any') {
  const normalizedKind = normText(kind || 'any') || 'any';
  if (normalizedKind === 'any') {
    return MOCK_PRESET_OPTIONS.map((item) => item.value);
  }
  const configured = MOCK_PRESET_KIND_MAP[normalizedKind];
  if (!Array.isArray(configured) || !configured.length) return ['fixed'];
  return Array.from(new Set(['fixed', ...configured]));
}

function getPresetKindHints(preset = '') {
  const keys = Object.keys(MOCK_PRESET_KIND_MAP).filter((kind) => {
    if (kind === 'any') return false;
    return (MOCK_PRESET_KIND_MAP[kind] || []).includes(preset);
  });
  return keys.length ? keys.join(' / ') : '全部';
}

function renderMockPresetCatalog(kind = 'any') {
  if (!els.mockPresetCatalogList) return;
  const activeKind = normText(kind || els.mockRuleKind?.value || 'any') || 'any';
  const allowed = new Set(getAllowedPresetValuesByKind(activeKind));
  const options = activeKind === 'any'
    ? MOCK_PRESET_OPTIONS
    : MOCK_PRESET_OPTIONS.filter((item) => allowed.has(item.value));

  els.mockPresetCatalogList.innerHTML = '';
  if (!options.length) return;

  for (const option of options) {
    const li = document.createElement('li');
    li.className = 'mock-preset-item';

    const head = document.createElement('div');
    head.className = 'mock-preset-item-head';

    const title = document.createElement('div');
    title.className = 'mock-preset-item-title';
    title.textContent = option.label || option.value;

    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'option-btn';
    useBtn.textContent = '带入';
    useBtn.addEventListener('click', () => {
      if (els.mockRulePreset) {
        refreshMockRulePresetOptions(activeKind, option.value);
        els.mockRulePreset.value = option.value;
        syncMockRuleValueState(option.value);
      }
      if (els.mockRuleValue && option.value !== 'fixed') {
        els.mockRuleValue.value = '';
      }
    });

    head.append(title, useBtn);

    const meta = document.createElement('div');
    meta.className = 'mock-preset-item-meta';
    const sample = MOCK_PRESET_SAMPLE_MAP[option.value] || '自动生成';
    meta.textContent = `preset=${option.value} · 适用类型：${getPresetKindHints(option.value)} · 示例：${sample}`;

    li.append(head, meta);
    els.mockPresetCatalogList.appendChild(li);
  }
}

function syncMockRuleValueState(preset = '') {
  if (!els.mockRuleValue) return;
  const currentPreset = normText(preset || els.mockRulePreset?.value || 'fixed');
  const isFixed = currentPreset === 'fixed';
  els.mockRuleValue.disabled = !isFixed;
  if (isFixed) {
    els.mockRuleValue.placeholder = '固定值（仅固定文本时填写）';
    return;
  }
  els.mockRuleValue.placeholder = '当前预设自动生成，无需填写固定值';
}

function refreshMockRulePresetOptions(kind = '', preferredPreset = '') {
  if (!els.mockRulePreset) return;
  const activeKind = normText(kind || els.mockRuleKind?.value || 'any') || 'any';
  const preferred = normText(preferredPreset || els.mockRulePreset.value || 'fixed') || 'fixed';
  const allowedSet = new Set(getAllowedPresetValuesByKind(activeKind));
  const visibleOptions = activeKind === 'any'
    ? [...MOCK_PRESET_OPTIONS]
    : MOCK_PRESET_OPTIONS.filter((item) => allowedSet.has(item.value));
  const hasPreferred = visibleOptions.some((item) => item.value === preferred);
  const renderOptions = hasPreferred
    ? visibleOptions
    : [
        ...visibleOptions,
        {
          value: preferred,
          label: MOCK_PRESET_LABELS[preferred] || `自定义：${preferred || 'fixed'}`
        }
      ];

  els.mockRulePreset.innerHTML = '';
  for (const optionDef of renderOptions) {
    const option = document.createElement('option');
    option.value = optionDef.value;
    option.textContent = optionDef.label || optionDef.value;
    els.mockRulePreset.appendChild(option);
  }

  const nextPreset = renderOptions.some((item) => item.value === preferred)
    ? preferred
    : (renderOptions[0]?.value || 'fixed');
  els.mockRulePreset.value = nextPreset;
  syncMockRuleValueState(nextPreset);
  renderMockPresetCatalog(activeKind);
}

function applyManualFieldToRuleForm(record = {}) {
  if (els.mockRuleScope) els.mockRuleScope.value = record.pathKey || '';
  if (els.mockRuleMatch) els.mockRuleMatch.value = record.matchText || record.title || '';
  state.pendingMockRuleFingerprint = normText(record.fingerprint || record?.field?.meta?.fieldFingerprint || '').toLowerCase();
  let nextKind = 'any';
  if (els.mockRuleKind) {
    nextKind = record.kind || 'any';
    els.mockRuleKind.value = Array.from(els.mockRuleKind.options || []).some((option) => option.value === nextKind) ? nextKind : 'any';
  }
  const preset = inferPresetFromFieldRecord(record);
  refreshMockRulePresetOptions(nextKind, preset);
  if (els.mockRuleValue) els.mockRuleValue.value = (els.mockRulePreset?.value || 'fixed') === 'fixed' ? (record.title || '') : '';
  setSaveStatus(`已带入规则编辑器：${record.title || record.matchText || '手动字段'}`, 'info');
  const formAnchor = els.mockRuleScope || els.mockRuleMatch;
  formAnchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderManualFieldLibrary() {
  if (!els.manualFieldLibraryList) return;
  const buckets = Array.isArray(state.manualFieldBuckets) ? state.manualFieldBuckets : [];
  const totalEntries = buckets.reduce((sum, bucket) => sum + (Array.isArray(bucket.entries) ? bucket.entries.length : 0), 0);
  els.manualFieldLibraryList.innerHTML = '';
  if (els.manualFieldLibraryEmpty) {
    els.manualFieldLibraryEmpty.style.display = totalEntries ? 'none' : '';
  }
  if (!totalEntries) return;

  for (const bucket of buckets) {
    const entries = Array.isArray(bucket.entries) ? bucket.entries : [];
    for (const entry of entries) {
      const li = document.createElement('li');
      li.className = 'manual-field-item';

      const head = document.createElement('div');
      head.className = 'manual-field-item-head';

      const info = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'manual-field-item-title';
      title.textContent = entry.title || entry.matchText || '手动字段';
      const meta = document.createElement('div');
      meta.className = 'manual-field-item-meta';
      meta.textContent = `${entry.kind || 'text'} · ${entry.pathKey || bucket.pathKey || ''}`;
      info.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'manual-field-item-actions';
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'option-btn';
      applyBtn.textContent = '带入规则';
      applyBtn.addEventListener('click', () => applyManualFieldToRuleForm(entry));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'template-delete';
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({
          type: 'formpilotv2:remove-manual-field',
          pathKey: entry.pathKey || bucket.pathKey || '',
          entryId: entry.key || entry.id || ''
        });
        await loadManualFieldLibrary();
      });
      actions.append(applyBtn, deleteBtn);

      head.append(info, actions);

      const body = document.createElement('div');
      body.className = 'manual-field-item-body';
      body.textContent = entry.selector || entry.field?.selector || entry.field?.placeholder || entry.field?.label || '';

      li.append(head, body);
      els.manualFieldLibraryList.appendChild(li);
    }
  }
}

async function loadManualFieldLibrary() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'formpilotv2:list-manual-fields', all: true });
    state.manualFieldBuckets = Array.isArray(res?.buckets) ? res.buckets : [];
    renderManualFieldLibrary();
  } catch (error) {
    setSaveStatus(`手动字段库读取失败: ${error?.message || error}`, 'error');
  }
}

function renderMockRules() {
  if (!els.mockRuleList) return;
  const rules = Array.isArray(state.mockRules) ? state.mockRules : [];
  els.mockRuleList.innerHTML = '';
  if (els.mockRuleEmpty) {
    els.mockRuleEmpty.style.display = rules.length ? 'none' : '';
  }
  if (!rules.length) return;

  for (const rule of [...rules].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))) {
    const li = document.createElement('li');
    li.className = 'mock-rule-item';
    const head = document.createElement('div');
    head.className = 'mock-rule-item-head';
    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'mock-rule-item-title';
    title.textContent = rule.match || '未命名规则';
    const meta = document.createElement('div');
    meta.className = 'mock-rule-item-meta';
    meta.textContent = `${formatMockRuleSummary(rule)}${rule.value ? ` · ${rule.value}` : ''}`;
    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'mock-rule-item-actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'template-delete';
    delBtn.textContent = '删除';
    delBtn.addEventListener('click', async () => {
      state.mockRules = state.mockRules.filter((item) => item.id !== rule.id);
      renderMockRules();
      await saveSettings();
    });
    actions.appendChild(delBtn);

    head.append(info, actions);
    li.appendChild(head);
    els.mockRuleList.appendChild(li);
  }
}

function collectMockRuleFromForm() {
  const scope = buildPathKeyFromUrl(els.mockRuleScope?.value || '') || normText(els.mockRuleScope?.value || '');
  const match = normText(els.mockRuleMatch?.value || '');
  const kind = normText(els.mockRuleKind?.value || 'any');
  const preset = normText(els.mockRulePreset?.value || 'fixed');
  const value = normText(els.mockRuleValue?.value || '');
  const fingerprint = normText(state.pendingMockRuleFingerprint || '').toLowerCase();
  if (!match) return null;
  if (preset === 'fixed' && !value) return null;
  return normalizeMockRule({ scope, match, kind, preset, value, fingerprint });
}

async function loadSettings() {
  const res = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings = mergeSettings(res[STORAGE_KEYS.SETTINGS] || {});
  writeForm(settings);
  refreshMockRulePresetOptions(els.mockRuleKind?.value || 'any', els.mockRulePreset?.value || 'fixed');
  const mergedRules = [
    ...(Array.isArray(settings.mockRules) ? settings.mockRules : []),
    ...flattenMockRulesFromCenter(settings.mockRuleCenter || {})
  ];
  const dedup = new Map();
  for (const item of mergedRules) {
    const rule = normalizeMockRule(item);
    const key = `${rule.scope}|${rule.fingerprint || ''}|${rule.match}|${rule.kind}|${rule.preset}|${rule.value}`;
    if (!dedup.has(key) || Number(dedup.get(key).updatedAt || 0) < Number(rule.updatedAt || 0)) {
      dedup.set(key, rule);
    }
  }
  state.mockRules = Array.from(dedup.values());
  renderMockRules();
}

async function saveSettings(options = {}) {
  const normalizedRules = state.mockRules.map((item) => normalizeMockRule(item));
  const visiblePanelTabs = getValidatedVisiblePanelTabs();
  const settings = mergeSettings({
    ...readForm(),
    visiblePanelTabs,
    mockRules: normalizedRules,
    mockRuleCenter: buildMockRuleCenterFromRules(normalizedRules)
  });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  setSaveStatus(options.statusMessage || `已保存 ${new Date().toLocaleTimeString()}`, 'success');
}

async function saveVisiblePanelTabs() {
  const visiblePanelTabs = getValidatedVisiblePanelTabs();
  const res = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const current = mergeSettings(res[STORAGE_KEYS.SETTINGS] || {});
  const settings = mergeSettings({
    ...current,
    visiblePanelTabs
  });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  setTabControlStatus('保存成功', 'success');
}

async function saveTestDataEnabledChange() {
  if (!els.testDataEnabled) return;
  const enabled = els.testDataEnabled.checked;
  setSaveStatus(enabled ? '正在开启测试数据池...' : '正在关闭测试数据池...', 'info');
  try {
    await saveSettings({
      statusMessage: enabled
        ? '已开启测试数据池，填充时将优先使用配置数据'
        : '已关闭测试数据池，填充时将改用随机生成'
    });
  } catch (error) {
    els.testDataEnabled.checked = !enabled;
    renderTestDataSummary(readTestDataLibraryFromForm());
    setSaveStatus(`测试数据池开关保存失败: ${error.message || error}`, 'error');
  }
}

async function savePaginateFillEnabledChange() {
  if (!els.paginateFillEnabled) return;
  const enabled = els.paginateFillEnabled.checked;
  setSaveStatus(enabled ? '正在开启翻页填充...' : '正在关闭翻页填充...', 'info');
  try {
    const res = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const current = res[STORAGE_KEYS.SETTINGS] || {};
    const settings = mergeSettings({
      ...current,
      paginateFillEnabled: enabled
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
    setSaveStatus(enabled ? '已开启翻页填充' : '已关闭翻页填充', 'success');
  } catch (error) {
    els.paginateFillEnabled.checked = !enabled;
    setSaveStatus(`翻页填充开关保存失败: ${error.message || error}`, 'error');
  }
}

function renderCurlResult(obj) {
  if (!els.curlResult) return;
  els.curlResult.textContent = obj ? JSON.stringify(obj, null, 2) : '';
}

function bindSectionNav() {
  const links = Array.from(document.querySelectorAll('[data-section-nav]'));
  links.forEach((link) => {
    link.addEventListener('click', () => {
      const targetId = link.getAttribute('data-section-nav');
      const target = document.getElementById(targetId || '');
      links.forEach((item) => {
        const sameTarget = item.getAttribute('data-section-nav') === targetId;
        item.classList.toggle('active', sameTarget);
      });
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function formatTemplateName(template) {
  return template?.name || template?.endpoint || template?.url || '(未命名模板)';
}

function buildUiTemplatePreview(fields = {}) {
  const previews = Object.entries(fields || {})
    .slice(0, 3)
    .map(([fingerprint, entry]) => {
      const meta = parseFingerprintPreview(fingerprint);
      const title = meta.label !== '(无标签)' ? meta.label : (meta.placeholder || meta.selector || '未命名字段');
      return `${title} -> ${entry?.kind || 'text'}`;
    })
    .filter(Boolean);

  return previews.join('，');
}

async function getUiTemplateRowsFromMappingStore() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.FIELD_MAPPINGS);
  const store = data?.[STORAGE_KEYS.FIELD_MAPPINGS] || {};
  const rows = [];

  for (const [pathKey, bucket] of Object.entries(store)) {
    const templates = bucket?.templates || {};
    for (const [name, template] of Object.entries(templates)) {
      const fields = template?.fields || {};
      rows.push({
        id: `ui:${pathKey}:${name}`,
        kind: 'ui',
        name: template?.name || name,
        pathKey,
        fieldCount: Object.keys(fields).length,
        fieldPreview: buildUiTemplatePreview(fields),
        updatedAt: Number(template?.updatedAt || template?.createdAt || 0) || 0
      });
    }
  }

  rows.sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
  return rows;
}

async function removeUiTemplate(pathKey, templateName) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.FIELD_MAPPINGS);
  const store = data?.[STORAGE_KEYS.FIELD_MAPPINGS] || {};
  const bucket = store?.[pathKey];
  if (!bucket?.templates || !bucket.templates[templateName]) return;
  delete bucket.templates[templateName];
  await chrome.storage.local.set({ [STORAGE_KEYS.FIELD_MAPPINGS]: store });
}

function buildTemplateNameFromUrl(url) {
  if (!url) return `API 模板 ${new Date().toLocaleTimeString()}`;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname;
    return `API 模板 · ${path}`;
  } catch {
    return `API 模板 ${new Date().toLocaleTimeString()}`;
  }
}

function getSelectedApiTemplate() {
  return state.apiRows.find((item) => item.id === state.selectedTemplateId) || null;
}

function updateRunnerStatus(text, variant = 'idle') {
  if (!els.runnerStatus) return;
  els.runnerStatus.textContent = text;
  els.runnerStatus.classList.remove('runner-status-running', 'runner-status-error');
  if (variant === 'running') els.runnerStatus.classList.add('runner-status-running');
  if (variant === 'error') els.runnerStatus.classList.add('runner-status-error');
}

function appendRunnerLog(line) {
  if (!els.runnerLog) return;
  const prefix = new Date().toLocaleTimeString();
  const current = els.runnerLog.textContent ? `${els.runnerLog.textContent}\n` : '';
  els.runnerLog.textContent = `${current}[${prefix}] ${line}`;
  els.runnerLog.scrollTop = els.runnerLog.scrollHeight;
}

function clearRunnerLog() {
  if (!els.runnerLog) return;
  els.runnerLog.textContent = '';
}

function setRunnerBusy(isRunning) {
  state.isRunning = isRunning;
  const hasApiTemplates = state.apiRows.length > 0;
  if (els.runTemplateBtn) els.runTemplateBtn.disabled = isRunning || !hasApiTemplates;
  if (els.stopTemplateBtn) els.stopTemplateBtn.disabled = !isRunning;
  if (els.loadRunnerTemplateBtn) els.loadRunnerTemplateBtn.disabled = isRunning || !hasApiTemplates;
  if (els.runnerTemplateSelect) els.runnerTemplateSelect.disabled = isRunning || !hasApiTemplates;
}

function safeParseJsonInput(text, emptyValue) {
  const normalized = String(text || '').trim();
  if (!normalized) return emptyValue;
  return JSON.parse(normalized);
}

function readRunnerParams() {
  const bodyPatch = safeParseJsonInput(els.runnerBodyPatch?.value || '', null);
  return {
    loopCount: Math.max(1, Number(els.runnerLoopCount?.value || 1)),
    intervalMs: Math.max(0, Number(els.runnerIntervalMs?.value || 0)),
    retryCount: Math.max(0, Number(els.runnerRetryCount?.value || 0)),
    bodyPatch
  };
}

function buildRunnerSummary(template) {
  if (!template) {
    return '请选择一个 API 模板，右侧会展示接口摘要、执行参数和最新请求预览。';
  }
  const method = String(template.method || 'GET').toUpperCase();
  const endpoint = template.url || template.endpoint || '-';
  const headerCount = Object.keys(template.headers || {}).length;
  const bodyType = template.body == null || template.body === '' ? '无请求体' : typeof template.body === 'string' ? '字符串体' : 'JSON 请求体';
  return [
    `模板名称：${formatTemplateName(template)}`,
    `请求方式：${method}`,
    `接口地址：${endpoint}`,
    `请求头数量：${headerCount}`,
    `请求体类型：${bodyType}`
  ].join('\n');
}

function renderRunnerRequestPreview() {
  if (!els.runnerTemplateSummary || !els.runnerRequestPreview) return;
  const template = getSelectedApiTemplate();
  els.runnerTemplateSummary.textContent = buildRunnerSummary(template);
  if (!template) {
    els.runnerRequestPreview.textContent = '';
    updateRunnerStatus(state.isRunning ? '执行中' : '待执行');
    return;
  }

  try {
    const request = buildApiExecutionRequest(template, {
      settings: mergeSettings(readForm()),
      params: readRunnerParams(),
      runIndex: 0
    });
    els.runnerRequestPreview.textContent = JSON.stringify(
      {
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.rawBody,
        上下文变量: request.context
      },
      null,
      2
    );
    if (!state.isRunning) updateRunnerStatus('待执行');
  } catch (error) {
    els.runnerRequestPreview.textContent = JSON.stringify(
      {
        error: error.message || String(error)
      },
      null,
      2
    );
    if (!state.isRunning) updateRunnerStatus('参数有误', 'error');
  }
}

function loadTemplateIntoEditor(template) {
  if (!template || !els.curlInput) return;
  els.curlInput.value = template.rawCurl || templateToCurl(template);
  state.parsedCurl = {
    url: template.url || template.endpoint || '',
    method: template.method || 'GET',
    headers: template.headers || {},
    body: template.body ?? ''
  };
  renderCurlResult(state.parsedCurl);
}

function populateRunnerTemplateSelect(apiRows) {
  if (!els.runnerTemplateSelect) return;
  const previous = state.selectedTemplateId;
  els.runnerTemplateSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = apiRows.length ? '请选择一个 API 模板' : '暂无可执行 API 模板';
  els.runnerTemplateSelect.appendChild(placeholder);

  for (const item of apiRows) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = formatTemplateName(item);
    els.runnerTemplateSelect.appendChild(option);
  }

  const nextSelected = apiRows.some((item) => item.id === previous)
    ? previous
    : apiRows[0]?.id || '';
  state.selectedTemplateId = nextSelected;
  els.runnerTemplateSelect.value = nextSelected;
  els.runnerTemplateSelect.disabled = state.isRunning || !apiRows.length;
  if (els.runTemplateBtn) els.runTemplateBtn.disabled = state.isRunning || !apiRows.length;
  if (els.loadRunnerTemplateBtn) els.loadRunnerTemplateBtn.disabled = state.isRunning || !apiRows.length;
  renderRunnerRequestPreview();
}

async function renderTemplates() {
  const hasTemplateUi = Boolean(els.templateList || els.templateCount || els.runnerTemplateSelect);
  if (!hasTemplateUi) return;
  const store = await getTemplateStore();
  const uiRows = await getUiTemplateRowsFromMappingStore();
  const apiRows = (store.api || []).map((item) => ({ ...item, kind: 'api' }));
  const rows = [...uiRows, ...apiRows];

  state.rows = rows;
  state.apiRows = apiRows;

  if (els.templateCount) els.templateCount.textContent = String(rows.length);
  if (els.uiTemplateCount) els.uiTemplateCount.textContent = String(uiRows.length);
  if (els.apiTemplateCount) els.apiTemplateCount.textContent = String(apiRows.length);

  populateRunnerTemplateSelect(apiRows);

  if (!els.templateList) return;
  els.templateList.innerHTML = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'template-empty';
    li.textContent = '暂无模板，可先在页面内保存一份 UI 模板，或粘贴一段 curl 保存 API 模板。';
    els.templateList.appendChild(li);
    return;
  }

  for (const item of rows) {
    const li = document.createElement('li');
    li.className = 'template-item';

    const name = formatTemplateName(item);
    const updated = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-';

    const head = document.createElement('div');
    head.className = 'template-item-head';

    const left = document.createElement('div');
    const kind = document.createElement('span');
    kind.className = 'template-kind';
    kind.textContent = item.kind;
    const title = document.createElement('div');
    title.textContent = name;
    title.className = 'template-name';
    const desc = document.createElement('div');
    desc.className = 'template-desc';
    desc.textContent = item.kind === 'api'
      ? (item.url || item.endpoint || 'API 流程模板')
      : [
          item.pathKey || '页面表单模板',
          item.fieldCount ? `${item.fieldCount} 个字段` : '',
          item.fieldPreview || ''
        ].filter(Boolean).join(' · ');
    left.appendChild(kind);
    left.appendChild(title);
    left.appendChild(desc);

    const meta = document.createElement('div');
    meta.className = 'template-meta';
    meta.textContent = updated;

    head.appendChild(left);
    head.appendChild(meta);
    li.appendChild(head);

    const actionRow = document.createElement('div');
    actionRow.className = 'template-actions';

    if (item.kind === 'api') {
      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.textContent = '设为执行模板';
      useBtn.className = 'template-action-btn';
      useBtn.addEventListener('click', () => {
        state.selectedTemplateId = item.id;
        els.runnerTemplateSelect.value = item.id;
        renderRunnerRequestPreview();
        document.getElementById('templateSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.textContent = '载入编辑器';
      loadBtn.className = 'template-action-btn';
      loadBtn.addEventListener('click', () => {
        loadTemplateIntoEditor(item);
      });

      actionRow.appendChild(useBtn);
      actionRow.appendChild(loadBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.className = 'template-delete';
    delBtn.addEventListener('click', async () => {
      if (item.kind === 'ui') {
        await removeUiTemplate(item.pathKey || '', item.name || '');
      } else {
        await removeTemplate(item.kind, item.id);
      }
      if (state.selectedTemplateId === item.id) state.selectedTemplateId = '';
      await renderTemplates();
    });

    actionRow.appendChild(delBtn);
    li.appendChild(actionRow);
    els.templateList.appendChild(li);
  }

  if (els.mappingPathInfo) {
    refreshMappingWorkbench({ rescan: false }).catch(() => {
      // ignore mapping refresh errors in template rendering path
    });
  }
}

function renderMappingTemplates(templates = []) {
  if (els.mappingTemplateCount) els.mappingTemplateCount.textContent = String(templates.length || 0);
  if (!els.mappingTemplateList) return;
  els.mappingTemplateList.innerHTML = '';
  if (!templates.length) {
    clearListNode(els.mappingTemplateList, '当前路径暂无映射模板');
    return;
  }

  for (const item of templates) {
    const li = document.createElement('li');
    li.className = 'mapping-item';
    const title = document.createElement('div');
    title.className = 'mapping-item-title';
    title.textContent = item.name || '(未命名模板)';
    const meta = document.createElement('div');
    meta.className = 'mapping-item-meta';
    meta.textContent = `版本 ${item.version || 1} · 字段 ${item.fieldCount || 0} · 更新 ${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}`;
    li.appendChild(title);
    li.appendChild(meta);
    els.mappingTemplateList.appendChild(li);
  }
}

function renderMappingFields(mapping = {}) {
  const entries = Object.entries(mapping || {});
  if (els.mappingFieldCount) els.mappingFieldCount.textContent = String(entries.length);
  if (!els.mappingFieldList) return;
  els.mappingFieldList.innerHTML = '';
  if (!entries.length) {
    clearListNode(els.mappingFieldList, '当前路径暂无字段映射');
    return;
  }

  entries.slice(0, 80).forEach(([fingerprint, entry]) => {
    const preview = parseFingerprintPreview(fingerprint);
    const li = document.createElement('li');
    li.className = 'mapping-item';
    const title = document.createElement('div');
    title.className = 'mapping-item-title';
    title.textContent = `${preview.label} -> ${entry?.kind || 'text'}`;
    const meta = document.createElement('div');
    meta.className = 'mapping-item-meta';
    meta.textContent = [
      preview.selector,
      preview.placeholder ? `placeholder: ${preview.placeholder}` : '',
      preview.variant ? `variant: ${preview.variant}` : '',
      Number.isFinite(Number(entry?.hits)) ? `hits: ${entry.hits}` : '',
      describeMappingStrategy(entry?.kind || 'text', preview)
    ].filter(Boolean).join(' · ');
    li.appendChild(title);
    li.appendChild(meta);
    els.mappingFieldList.appendChild(li);
  });
}

function renderScannedFields(fields = []) {
  if (els.mappingScanCount) els.mappingScanCount.textContent = String(fields.length || 0);
  if (!els.mappingScanList) return;
  els.mappingScanList.innerHTML = '';
  if (!fields.length) {
    clearListNode(els.mappingScanList, '未获取到当前页字段，请点击“重新识别当前页字段”');
    return;
  }
  fields.slice(0, 120).forEach((field, index) => {
    const li = document.createElement('li');
    li.className = 'mapping-item';
    const title = document.createElement('div');
    title.className = 'mapping-item-title';
    title.textContent = `${index + 1}. [${field.kind || 'text'}] ${field.label || field.placeholder || '(未命名字段)'}`;
    const meta = document.createElement('div');
    meta.className = 'mapping-item-meta';
    meta.textContent = `${field.selector || '(无选择器)'}${field.domId ? ` · domId:${field.domId}` : ''} · ${describeMappingStrategy(field.kind || 'text', field)}`;
    li.appendChild(title);
    li.appendChild(meta);
    els.mappingScanList.appendChild(li);
  });
}

async function resolveActiveTabContext() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'formpilotv2:get-active-tab' });
    let tab = res?.tab || null;
    let tabId = Number(tab?.id || 0);
    let tabUrl = tab?.url || '';

    // 设置页打开时，当前激活页通常是 chrome-extension://options.html，
    // 此时改为回退选择最近访问的 http(s) 业务页。
    if (!/^https?:/i.test(tabUrl || '')) {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const candidates = (tabs || []).filter((item) => /^https?:/i.test(String(item?.url || '')));
      if (candidates.length) {
        candidates.sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
        tab = candidates[0];
        tabId = Number(tab?.id || 0);
        tabUrl = tab?.url || '';
      }
    }

    const pathKey = buildPathKeyFromUrl(tabUrl);
    state.activeTabId = tabId;
    state.activeTabUrl = tabUrl;
    state.activePathKey = pathKey;
    return { tabId, tabUrl, pathKey };
  } catch (error) {
    return { tabId: 0, tabUrl: '', pathKey: '', error };
  }
}

async function refreshMappingWorkbench({ rescan = false } = {}) {
  const hasMappingUi = Boolean(
    els.mappingPathInfo ||
    els.mappingTemplateList ||
    els.mappingFieldList ||
    els.mappingScanList
  );
  if (!hasMappingUi) return;
  const { tabId, tabUrl, pathKey } = await resolveActiveTabContext();
  if (els.mappingPathInfo) {
    els.mappingPathInfo.textContent = pathKey
      ? `当前路径：${pathKey}`
      : `当前路径不可用，请先切换到目标表单页后再刷新`;
  }
  if (!tabId) {
    renderMappingTemplates([]);
    renderMappingFields({});
    renderScannedFields([]);
    return;
  }

  try {
    const [mappingRes, templateRes] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'formpilotv2:get-field-mapping', tabId }),
      chrome.runtime.sendMessage({ type: 'formpilotv2:list-field-mapping-templates', tabId, pathKey: pathKey || undefined })
    ]);

    renderMappingFields(mappingRes?.ok ? (mappingRes.mapping || {}) : {});
    renderMappingTemplates(templateRes?.ok ? (templateRes.templates || []) : []);
  } catch {
    renderMappingFields({});
    renderMappingTemplates([]);
  }

  if (rescan) {
    try {
      const scanRes = await chrome.runtime.sendMessage({ type: 'formpilotv2:scan', tabId });
      renderScannedFields(scanRes?.ok ? (scanRes.fields || []) : []);
    } catch {
      renderScannedFields([]);
    }
  }
}

els.saveBtn.addEventListener('click', async () => {
  try {
    await saveSettings();
    renderRunnerRequestPreview();
  } catch (error) {
    setSaveStatus(`保存失败: ${error.message || error}`, 'error');
  }
});

els.saveBtnBottom?.addEventListener('click', async () => {
  try {
    await saveSettings();
    renderRunnerRequestPreview();
  } catch (error) {
    setSaveStatus(`保存失败: ${error.message || error}`, 'error');
  }
});

els.tabControlSaveBtn?.addEventListener('click', async () => {
  try {
    await saveVisiblePanelTabs();
  } catch (error) {
    if (error?.message === '请至少选择一个展示Tab') return;
    setTabControlStatus(`保存失败: ${error.message || error}`, 'error');
  }
});

document.querySelectorAll('input[name="visibleTabs"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (input instanceof HTMLInputElement
      && input.value === PROTECTED_PANEL_TAB_VALUE
      && input.checked) {
      input.checked = false;
      openTabPasswordModal(input);
      return;
    }
    if (input instanceof HTMLInputElement && input.value === PROTECTED_PANEL_TAB_VALUE) {
      state.decryptConfigUnlocked = false;
      setDecryptConfigVisibility(false, { notify: true });
    }
    if (readVisiblePanelTabsFromForm().length) {
      setTabControlError(false);
    }
    setTabControlStatus('');
  });
});

els.tabPasswordConfirmBtn?.addEventListener('click', () => {
  confirmProtectedTabPassword();
});

els.tabPasswordCancelBtn?.addEventListener('click', () => {
  cancelProtectedTabPassword();
});

els.tabPasswordModal?.addEventListener('click', (event) => {
  if (event.target === els.tabPasswordModal) {
    cancelProtectedTabPassword();
  }
});

els.tabPasswordInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    confirmProtectedTabPassword();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelProtectedTabPassword();
  }
});

els.decryptConfigEditBtn?.addEventListener('click', () => {
  enterDecryptConfigEditMode();
});

els.decryptConfigAddRowBtn?.addEventListener('click', () => {
  const draft = collectDecryptDraftFromTable({ validate: false }) || cloneDecryptConfig(state.decryptDraft || {});
  draft.projects.push(createEmptyDecryptProject());
  state.decryptDraft = draft;
  renderDecryptDraftRows();
});

els.decryptConfigCancelBtn?.addEventListener('click', () => {
  cancelDecryptConfigEditMode();
});

els.decryptConfigSaveBtn?.addEventListener('click', async () => {
  try {
    await saveDecryptConfig();
  } catch (error) {
    setDecryptConfigError(`保存失败: ${error.message || error}`);
  }
});

els.decryptConfigTableBody?.addEventListener('click', (event) => {
  const button = event.target instanceof Element ? event.target.closest('.decrypt-row-delete') : null;
  if (!button) return;
  const draft = collectDecryptDraftFromTable({ validate: false }) || cloneDecryptConfig(state.decryptDraft || {});
  const row = button.closest('tr[data-project-id]');
  const id = row?.dataset?.projectId || '';
  state.decryptDraft = normalizeDecryptConfig({
    projects: draft.projects.filter((project) => project.id !== id),
    selectedProjectIds: draft.selectedProjectIds
  });
  setDecryptConfigError('');
  renderDecryptDraftRows();
});

els.decryptConfigTableBody?.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement) {
    if (event.target.dataset.decryptField === 'minLength') {
      event.target.value = sanitizePositiveInteger(event.target.value);
    } else if (event.target.dataset.decryptField === 'salt') {
      event.target.dataset.saltChanged = 'true';
    }
    event.target.classList.remove('is-invalid');
    setDecryptConfigError('');
  }
});

els.decryptConfigTableBody?.addEventListener('beforeinput', (event) => {
  if (
    event.target instanceof HTMLInputElement
    && event.target.dataset.decryptField === 'salt'
    && event.target.dataset.saltChanged !== 'true'
  ) {
    event.target.value = '';
    event.target.dataset.saltChanged = 'true';
  }
});

els.decryptConfigTableBody?.addEventListener('focusout', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.dataset.decryptField === 'salt') {
    const row = event.target.closest('tr[data-project-id]');
    const project = getDecryptDraftProject(row?.dataset?.projectId || '');
    if (project && event.target.dataset.saltChanged === 'true') {
      project.salt = cleanDecryptText(event.target.value);
    }
    const salt = project?.salt || '';
    event.target.dataset.saltChanged = 'false';
    event.target.value = maskDecryptSalt(salt);
  }
});

els.decryptProjectOptions?.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === 'decryptProjectEnabled') {
    setSaveStatus('解密项目选择待保存', 'info');
  }
});

els.parseCurlBtn?.addEventListener('click', () => {
  try {
    state.parsedCurl = parseCurlCommand(els.curlInput.value);
    renderCurlResult(state.parsedCurl);
  } catch (error) {
    state.parsedCurl = null;
    renderCurlResult({ error: error.message || String(error) });
  }
});

els.saveApiTemplateBtn?.addEventListener('click', async () => {
  try {
    if (!state.parsedCurl) state.parsedCurl = parseCurlCommand(els.curlInput.value);
    const endpoint = state.parsedCurl.url || '';
    const template = await saveTemplate('api', {
      name: buildTemplateNameFromUrl(endpoint),
      endpoint,
      url: endpoint,
      method: state.parsedCurl.method,
      headers: state.parsedCurl.headers,
      body: state.parsedCurl.body,
      rawCurl: els.curlInput.value.trim(),
      mappingMode: 'mock'
    });
    state.selectedTemplateId = template.id;
    renderCurlResult({ ok: true, templateId: template.id, endpoint: template.endpoint });
    await renderTemplates();
  } catch (error) {
    renderCurlResult({ ok: false, error: error.message || String(error) });
  }
});

els.runnerTemplateSelect?.addEventListener('change', () => {
  state.selectedTemplateId = els.runnerTemplateSelect.value;
  renderRunnerRequestPreview();
});

els.loadRunnerTemplateBtn?.addEventListener('click', () => {
  loadTemplateIntoEditor(getSelectedApiTemplate());
});

els.clearRunnerLogBtn?.addEventListener('click', () => {
  clearRunnerLog();
  if (!state.isRunning) updateRunnerStatus('待执行');
});

els.stopTemplateBtn?.addEventListener('click', () => {
  if (!state.abortController) return;
  state.abortController.abort();
  appendRunnerLog('已请求停止执行，等待当前请求收尾。');
  updateRunnerStatus('停止中', 'error');
});

els.runTemplateBtn?.addEventListener('click', async () => {
  const template = getSelectedApiTemplate();
  if (!template) {
    updateRunnerStatus('未选择模板', 'error');
    appendRunnerLog('请先选择一个 API 模板。');
    return;
  }

  let params;
  try {
    params = readRunnerParams();
  } catch (error) {
    updateRunnerStatus('参数有误', 'error');
    appendRunnerLog(`执行参数解析失败：${error.message || error}`);
    renderRunnerRequestPreview();
    return;
  }

  clearRunnerLog();
  renderRunnerRequestPreview();
  state.abortController = new AbortController();
  setRunnerBusy(true);
  updateRunnerStatus('执行中', 'running');

  try {
    const result = await executeApiTemplate(template, {
      settings: mergeSettings(readForm()),
      params,
      signal: state.abortController.signal,
      onLog: appendRunnerLog
    });
    updateRunnerStatus(result.failureCount ? '执行完成（有失败）' : '执行完成', result.failureCount ? 'error' : 'idle');
  } catch (error) {
    updateRunnerStatus('执行失败', 'error');
    appendRunnerLog(`执行中断：${error.message || error}`);
  } finally {
    state.abortController = null;
    setRunnerBusy(false);
  }
});

els.refreshMappingBtn?.addEventListener('click', async () => {
  await refreshMappingWorkbench({ rescan: false });
});

els.rescanMappingBtn?.addEventListener('click', async () => {
  await refreshMappingWorkbench({ rescan: true });
});

['input', 'change'].forEach((eventName) => {
  [els.runnerLoopCount, els.runnerIntervalMs, els.runnerRetryCount, els.runnerBodyPatch].forEach((element) => {
    element?.addEventListener(eventName, () => {
      if (!state.isRunning) renderRunnerRequestPreview();
    });
  });
});

bindSectionNav();
setRunnerBusy(false);
updateRunnerStatus('待执行');

// ─── Temperature 滑块 ─────────────────────────────────────────────────────
if (els.temperature && els.temperatureDisplay) {
  els.temperature.addEventListener('input', () => {
    els.temperatureDisplay.textContent = els.temperature.value;
  });
}

// ─── 测试连接按钮 ────────────────────────────────────────────────────────────
if (els.testConnectionBtn) {
  els.testConnectionBtn.addEventListener('click', async () => {
    els.testConnectionBtn.disabled = true;
    els.testConnectionBtn.textContent = '测试中...';
    if (els.testConnectionResult) els.testConnectionResult.textContent = '';
    try {
      await saveSettings();
      const res = await chrome.runtime.sendMessage({ type: 'formpilotv2:test-llm' });
      if (els.testConnectionResult) {
        if (res?.ok) {
          els.testConnectionResult.textContent = `✓ 连接成功（${res.model}，延迟 ${res.latencyMs}ms）`;
          els.testConnectionResult.style.color = '#006950';
        } else {
          els.testConnectionResult.textContent = `✗ 连接失败：${res?.error || '未知错误'}`;
          els.testConnectionResult.style.color = '#93000a';
        }
      }
    } catch (err) {
      if (els.testConnectionResult) {
        els.testConnectionResult.textContent = `✗ 请求异常：${err.message || err}`;
        els.testConnectionResult.style.color = '#93000a';
      }
    } finally {
      els.testConnectionBtn.disabled = false;
      els.testConnectionBtn.textContent = '测试连接';
    }
  });
}

// ─── 打开模板中心 ─────────────────────────────────────────────────────────────
if (els.openTemplateCenterBtn) {
  els.openTemplateCenterBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('template-center.html') });
  });
}

// ─── 文件上传（base64 方案）─────────────────────────────────────────────────
const FILE_STORE_KEY = 'formPilotV2FileStore';
const PENDING_MOCK_RULE_SEED_KEY = 'formPilotV2PendingMockRuleSeed';
const IMAGE_PREVIEWABLE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic)$/i;
let activeImagePreviewCleanup = null;

function getFileExtension(name = '') {
  const match = String(name || '').trim().match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function isPreviewableImageFile(file = {}, category = '') {
  const mime = String(file.mimeType || file.type || '').toLowerCase();
  const name = String(file.name || '');
  return !!file.base64 && (category === 'image' || mime.startsWith('image/') || IMAGE_PREVIEWABLE_EXTENSIONS.test(name));
}

function getFileVisual(file = {}, category = '') {
  const ext = getFileExtension(file.name);
  const mime = String(file.mimeType || file.type || '').toLowerCase();
  if (mime.includes('pdf') || ext === 'pdf') return { label: 'PDF', tone: 'pdf' };
  if (/(doc|docx|wps)$/.test(ext) || mime.includes('word')) return { label: 'DOC', tone: 'doc' };
  if (/(xls|xlsx|csv|numbers)$/.test(ext) || mime.includes('spreadsheet') || mime.includes('csv')) return { label: ext === 'csv' ? 'CSV' : 'XLS', tone: 'sheet' };
  if (/(ppt|pptx|key)$/.test(ext) || mime.includes('presentation')) return { label: 'PPT', tone: 'slides' };
  if (/(json|xml|html?|css|js|ts|tsx|jsx|vue|py|java|go|rs|php|rb|sql|yaml|yml)$/.test(ext)) return { label: ext.slice(0, 4).toUpperCase(), tone: 'code' };
  if (/(txt|md|rtf)$/.test(ext) || mime.startsWith('text/')) return { label: ext ? ext.slice(0, 4).toUpperCase() : 'TXT', tone: 'text' };
  if (category === 'video' || mime.startsWith('video/')) return { label: ext ? ext.slice(0, 4).toUpperCase() : 'VID', tone: 'video' };
  if (category === 'audio' || mime.startsWith('audio/')) return { label: ext ? ext.slice(0, 4).toUpperCase() : 'AUD', tone: 'audio' };
  if (category === 'archive' || /zip|rar|7z|tar|gzip|compressed/i.test(mime)) return { label: ext ? ext.slice(0, 4).toUpperCase() : 'ZIP', tone: 'archive' };
  return { label: ext ? ext.slice(0, 4).toUpperCase() : 'FILE', tone: normalizeFileCategory(category, file) };
}

function formatFileSize(file = {}) {
  const bytes = Number(file.size || 0) || (file.base64 ? Math.round((file.base64.length * 3) / 4) : 0);
  if (!bytes) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function closeImagePreview() {
  if (typeof activeImagePreviewCleanup === 'function') activeImagePreviewCleanup();
}

function openImagePreview(file = {}) {
  if (!file.base64) return;
  closeImagePreview();

  const overlay = document.createElement('div');
  overlay.className = 'image-preview-overlay';
  overlay.tabIndex = -1;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', file.name ? `查看原图：${file.name}` : '查看原图');

  const frame = document.createElement('div');
  frame.className = 'image-preview-frame';

  const img = document.createElement('img');
  img.src = file.base64;
  img.alt = file.name || '上传图片原图';

  const caption = document.createElement('div');
  caption.className = 'image-preview-caption';
  caption.textContent = file.name || '上传图片原图';

  frame.appendChild(img);
  frame.appendChild(caption);
  overlay.appendChild(frame);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', handleKeydown);
    overlay.classList.remove('is-visible');
    window.setTimeout(() => overlay.remove(), 160);
    activeImagePreviewCleanup = null;
  };
  const handleKeydown = (ev) => {
    if (ev.key === 'Escape') cleanup();
  };

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) cleanup();
  });
  document.addEventListener('keydown', handleKeydown);
  activeImagePreviewCleanup = cleanup;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  overlay.focus();
}

function createFilePreview(file = {}, category = '') {
  if (isPreviewableImageFile(file, category)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'file-store-thumb';
    button.title = '查看原图';
    button.setAttribute('aria-label', `查看原图：${file.name || '上传图片'}`);

    const img = document.createElement('img');
    img.src = file.base64;
    img.alt = file.name || '上传图片缩略图';
    img.loading = 'lazy';
    button.appendChild(img);

    button.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openImagePreview(file);
    });
    return button;
  }

  const visual = getFileVisual(file, category);
  const icon = document.createElement('div');
  icon.className = `file-store-icon file-store-icon-${visual.tone}`;
  icon.setAttribute('aria-hidden', 'true');

  const folded = document.createElement('span');
  folded.className = 'file-store-icon-fold';

  const mark = document.createElement('span');
  mark.className = 'file-store-icon-mark';

  const label = document.createElement('span');
  label.className = 'file-store-icon-label';
  label.textContent = visual.label;

  icon.appendChild(folded);
  icon.appendChild(mark);
  icon.appendChild(label);
  return icon;
}

function renderFileList(files = []) {
  if (!els.fileUploadList) return;
  const normalizedFiles = (Array.isArray(files) ? files : []).map((file) => ({
    ...file,
    category: normalizeFileCategory(file.category, file)
  }));
  state.fileStore = normalizedFiles;
  els.fileUploadList.innerHTML = '';
  if (!normalizedFiles.length) {
    const li = document.createElement('li');
    li.textContent = '暂无已上传文件';
    li.style.color = '#9aa5a0';
    els.fileUploadList.appendChild(li);
    renderTestDataSummary(readTestDataLibraryFromForm());
    return;
  }

  const grouped = FILE_CATEGORY_ORDER.map((category) => ({
    category,
    files: normalizedFiles.filter((file) => normalizeFileCategory(file.category, file) === category)
  })).filter((group) => group.files.length);

  for (const group of grouped) {
    const li = document.createElement('li');
    li.className = 'file-store-group';

    const title = document.createElement('div');
    title.className = 'file-store-group-title';
    title.textContent = `${FILE_CATEGORY_LABELS[group.category]}（${group.files.length}）`;
    li.appendChild(title);

    for (const file of group.files) {
      const row = document.createElement('div');
      row.className = 'file-store-row';
      const preview = createFilePreview(file, group.category);
      const detail = document.createElement('div');
      detail.className = 'file-store-detail';

      const name = document.createElement('div');
      name.className = 'file-store-name';
      name.textContent = file.name || '未命名文件';

      const meta = document.createElement('div');
      meta.className = 'file-store-meta';
      meta.textContent = `${formatFileSize(file)} · ${file.mimeType || 'unknown'}`;

      detail.appendChild(name);
      detail.appendChild(meta);
      row.appendChild(preview);
      row.appendChild(detail);
      li.appendChild(row);
    }
    els.fileUploadList.appendChild(li);
  }
  renderTestDataSummary(readTestDataLibraryFromForm());
}

async function loadFileStore() {
  const data = await chrome.storage.local.get(FILE_STORE_KEY);
  renderFileList(data[FILE_STORE_KEY] || []);
}

async function consumePendingMockRuleSeed() {
  try {
    const data = await chrome.storage.local.get(PENDING_MOCK_RULE_SEED_KEY);
    const seed = data?.[PENDING_MOCK_RULE_SEED_KEY];
    if (!seed || typeof seed !== 'object') return;
    await chrome.storage.local.remove(PENDING_MOCK_RULE_SEED_KEY);
    const record = {
      pathKey: seed.pathKey || seed.scope || '',
      title: seed.title || seed.label || seed.placeholder || seed.selector || '',
      matchText: seed.matchText || seed.label || seed.placeholder || seed.selector || '',
      kind: seed.kind || 'text',
      selector: seed.selector || '',
      fingerprint: seed.fingerprint || ''
    };
    applyManualFieldToRuleForm(record);
    setSaveStatus(`已定位到规则编辑区：${record.title || '手动字段'}`, 'info');
  } catch (error) {
    setSaveStatus(`读取待处理规则失败: ${error?.message || error}`, 'error');
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      base64: reader.result,
      mimeType: file.type || 'application/octet-stream',
      size: Number(file.size || 0),
      updatedAt: Date.now()
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

if (els.fileUploadBtn) {
  els.fileUploadBtn.addEventListener('click', () => els.fileUploadInput?.click());
}

async function storeUploadedFiles(files = []) {
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) return;
  els.fileUploadBtn.textContent = '上传中...';
  els.fileUploadBtn.disabled = true;
  if (els.fileUploadDropZone) els.fileUploadDropZone.classList.add('is-uploading');
  try {
    const selectedCategory = String(els.fileUploadCategory?.value || 'auto');
    const stored = (await Promise.all(selectedFiles.map(readFileAsBase64))).map((item) => ({
      ...item,
      category: selectedCategory === 'auto' ? inferFileCategory(item) : normalizeFileCategory(selectedCategory, item)
    }));
    const existing = await chrome.storage.local.get(FILE_STORE_KEY);
    const current = Array.isArray(existing[FILE_STORE_KEY]) ? existing[FILE_STORE_KEY] : [];
    const next = [...current, ...stored].reduce((acc, item) => {
      const key = `${item.name || ''}__${item.base64 || ''}`;
      if (acc.some((entry) => `${entry.name || ''}__${entry.base64 || ''}` === key)) return acc;
      acc.push(item);
      return acc;
    }, []);
    await chrome.storage.local.set({ [FILE_STORE_KEY]: next });
    renderFileList(next);
    await saveSettings();
  } catch (err) {
    setSaveStatus(`文件读取失败: ${err.message || err}`, 'error');
  } finally {
    els.fileUploadBtn.textContent = '选择文件';
    els.fileUploadBtn.disabled = false;
    if (els.fileUploadDropZone) els.fileUploadDropZone.classList.remove('is-uploading');
  }
}

if (els.fileUploadInput) {
  els.fileUploadInput.addEventListener('change', async (ev) => {
    await storeUploadedFiles(ev.target.files || []);
    ev.target.value = '';
  });
}

if (els.fileUploadDropZone) {
  els.fileUploadDropZone.addEventListener('click', (ev) => {
    if (ev.target === els.fileUploadBtn) return;
    els.fileUploadInput?.click();
  });
  els.fileUploadDropZone.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    els.fileUploadInput?.click();
  });
  ['dragenter', 'dragover'].forEach((eventName) => {
    els.fileUploadDropZone.addEventListener(eventName, (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      els.fileUploadDropZone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    els.fileUploadDropZone.addEventListener(eventName, (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      els.fileUploadDropZone.classList.remove('is-dragover');
    });
  });
  els.fileUploadDropZone.addEventListener('drop', async (ev) => {
    await storeUploadedFiles(ev.dataTransfer?.files || []);
  });
}

if (els.fileUploadClearBtn) {
  els.fileUploadClearBtn.addEventListener('click', async () => {
    const confirmed = window.confirm('确认清除所有已上传文件吗？清除后需要重新上传。');
    if (!confirmed) return;
    await chrome.storage.local.remove(FILE_STORE_KEY);
    renderFileList([]);
    await saveSettings();
  });
}

if (els.testDataEnabled) {
  els.testDataEnabled.addEventListener('change', saveTestDataEnabledChange);
}

if (els.paginateFillEnabled) {
  els.paginateFillEnabled.addEventListener('change', savePaginateFillEnabledChange);
}

[
  els.testDataEnabled,
  els.testDataChineseName,
  els.testDataEnglishName,
  els.testDataMobileCn,
  els.testDataMobileHk,
  els.testDataMobileMo,
  els.testDataEmail,
  els.testDataCompanyName,
  els.testDataSocialCreditCode,
  els.testDataIdCn,
  els.testDataIdHmt,
  els.testDataPassport,
  els.testDataLandline,
  els.testDataAddress,
  els.testDataDate,
  els.testDataPlainText,
  els.testDataRichText,
  els.testDataNumber,
  els.testDataBankCardCn,
  els.testDataBankCardHk
].filter(Boolean).forEach((node) => {
  node.addEventListener('input', () => {
    renderTestDataSummary(readTestDataLibraryFromForm());
  });
  node.addEventListener('change', () => {
    renderTestDataSummary(readTestDataLibraryFromForm());
  });
});

if (els.testDataRichTextEditor) {
  els.testDataRichTextEditor.addEventListener('input', () => {
    if (!state.richTextSourceMode) syncRichTextEditorToSource();
    rememberRichTextSelection();
    renderTestDataSummary(readTestDataLibraryFromForm());
  });
  ['keyup', 'mouseup', 'focus'].forEach((eventName) => {
    els.testDataRichTextEditor.addEventListener(eventName, rememberRichTextSelection);
  });
}

if (els.testDataRichTextSourceMode) {
  els.testDataRichTextSourceMode.addEventListener('change', () => {
    setRichTextMode(els.testDataRichTextSourceMode.checked);
    renderTestDataSummary(readTestDataLibraryFromForm());
  });
}

document.querySelectorAll('[data-rich-command]').forEach((button) => {
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });
  button.addEventListener('click', () => {
    if (!els.testDataRichTextEditor || state.richTextSourceMode) return;
    const command = button.getAttribute('data-rich-command');
    const value = button.getAttribute('data-rich-value') || null;
    if (!command) return;
    restoreRichTextSelection();
    document.execCommand(command, false, value);
    rememberRichTextSelection();
    syncRichTextEditorToSource();
    renderTestDataSummary(readTestDataLibraryFromForm());
  });
});

if (els.testDataRichTextColor) {
  els.testDataRichTextColor.addEventListener('input', () => {
    if (!els.testDataRichTextEditor || state.richTextSourceMode) return;
    restoreRichTextSelection();
    document.execCommand('foreColor', false, els.testDataRichTextColor.value || '#2563eb');
    rememberRichTextSelection();
    syncRichTextEditorToSource();
    renderTestDataSummary(readTestDataLibraryFromForm());
  });
}

if (els.mockRuleKind) {
  els.mockRuleKind.addEventListener('change', () => {
    refreshMockRulePresetOptions(els.mockRuleKind.value, els.mockRulePreset?.value || 'fixed');
  });
}

if (els.mockRulePreset) {
  els.mockRulePreset.addEventListener('change', () => {
    syncMockRuleValueState(els.mockRulePreset.value);
  });
}

if (els.mockRuleAddBtn) {
  els.mockRuleAddBtn.addEventListener('click', async () => {
    const nextRule = collectMockRuleFromForm();
    if (!nextRule) {
      setSaveStatus('请先填写规则关键词，并在固定文本模式下填写固定值', 'error');
      return;
    }
    state.mockRules = [nextRule, ...state.mockRules.filter((item) => item.id !== nextRule.id)];
    renderMockRules();
    await saveSettings();
    state.pendingMockRuleFingerprint = '';
    if (els.mockRuleValue) els.mockRuleValue.value = '';
    if (els.mockRuleScope) els.mockRuleScope.value = '';
    if (els.mockRuleMatch) els.mockRuleMatch.value = '';
    if (els.mockRuleKind) els.mockRuleKind.value = 'any';
    refreshMockRulePresetOptions('any', 'fixed');
  });
}
// ───────────────────────────────────────────────────────────────────────────

refreshMockRulePresetOptions(els.mockRuleKind?.value || 'any', els.mockRulePreset?.value || 'fixed');

loadSettings()
  .then(async () => {
    await renderTemplates();
    await refreshMappingWorkbench({ rescan: false });
    await loadFileStore();
    await loadManualFieldLibrary();
    await consumePendingMockRuleSeed();
  })
  .catch((error) => {
    setSaveStatus(`初始化失败: ${error.message || error}`, 'error');
  });
