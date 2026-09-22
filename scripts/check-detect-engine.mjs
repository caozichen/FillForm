import assert from 'node:assert/strict';

import {
  detectEngineNormalize as normalizeLegacy,
  prepareFieldsForFill as prepareLegacy
} from '../legacy/core/detectEngine.js';
import {
  detectEngineNormalize as normalizePublic,
  prepareFieldsForFill as preparePublic
} from '../public/core/detectEngine.js';
import { generateValueForField } from '../public/core/dataEngine.js';

const fixtures = [
  {
    id: 'traditional-time',
    kind: 'date',
    label: '時間',
    placeholder: '請選擇時間',
    context: '時間 請選擇時間',
    selector: '#traditional-time',
    domId: 'traditional-time',
    score: 0.8,
    confidence: 0.8,
    meta: { customDateButton: true, locatorStability: 1 }
  },
  {
    id: 'readonly-time-picker',
    kind: 'date',
    label: '預約時間',
    placeholder: '請選擇時間',
    context: '預約時間 請選擇時間',
    selector: '#readonly-time-picker',
    domId: 'readonly-time-picker',
    score: 0.8,
    confidence: 0.8,
    constraints: { dateLike: true, inputType: 'time' },
    meta: { pickerLike: true, selectLike: true, locatorStability: 1 }
  },
  {
    id: 'conflicting-time-description',
    kind: 'date',
    label: '[75e]請補充放學時間（星期六、日及公眾假期）',
    placeholder: '請選擇放學時間',
    context: '[75e]請補充放學時間 日期格式為時:分，選擇表明為幾時幾分',
    selector: '#conflicting-time-description',
    domId: 'conflicting-time-description',
    score: 0.92,
    confidence: 0.92,
    constraints: { dateLike: true, inputType: 'time' },
    meta: { customDateButton: true, datePickerMode: 'time', timeOnly: true, locatorStability: 1 }
  },
  {
    id: 'ordinary-date',
    kind: 'date',
    label: '活動日期',
    placeholder: '請選擇日期',
    context: '活動日期 日期格式為年-月-日',
    selector: '#ordinary-date',
    domId: 'ordinary-date',
    score: 0.92,
    confidence: 0.92,
    constraints: { dateLike: true, inputType: 'date' },
    meta: { customDateButton: true, datePickerMode: 'date', locatorStability: 1 }
  },
  {
    id: 'birthday-ymd',
    kind: 'date',
    label: '生日',
    context: '生日 年月日',
    selector: '#birthday-ymd',
    domId: 'birthday-ymd',
    score: 0.92,
    confidence: 0.92,
    constraints: { dateLike: true, inputType: 'date' },
    meta: { widget: 'birthday', birthdayComposite: true, dateCollectType: 'ymd', segmentRoles: ['year', 'month', 'day'], locatorStability: 1 }
  },
  {
    id: 'birthday-ym',
    kind: 'date',
    label: '生日（年月）',
    context: '生日 年月',
    selector: '#birthday-ym',
    domId: 'birthday-ym',
    score: 0.92,
    confidence: 0.92,
    constraints: { dateLike: true, inputType: 'date' },
    meta: { widget: 'birthday', birthdayComposite: true, dateCollectType: 'ym', segmentRoles: ['year', 'month'], locatorStability: 1 }
  },
  {
    id: 'birthday-md',
    kind: 'date',
    label: '生日（月日）',
    context: '生日 月日',
    selector: '#birthday-md',
    domId: 'birthday-md',
    score: 0.92,
    confidence: 0.92,
    constraints: { dateLike: true, inputType: 'date' },
    meta: { widget: 'birthday', birthdayComposite: true, dateCollectType: 'md', segmentRoles: ['month', 'day'], locatorStability: 1 }
  },
  {
    id: 'department-select',
    kind: 'select',
    label: '部門',
    placeholder: '請選擇',
    context: '部門 請選擇',
    selector: '#department-select',
    domId: 'department-select',
    score: 0.8,
    confidence: 0.8,
    options: [{ label: '研發', value: 'engineering', domId: 'department-option-1' }],
    meta: { selectLike: true, locatorStability: 1 }
  },
  {
    id: 'dynamic-department-select',
    kind: 'text',
    label: '團隊',
    placeholder: '請選擇團隊',
    context: '團隊 請選擇團隊',
    selector: '#dynamic-department-select',
    domId: 'dynamic-department-select',
    score: 0.8,
    confidence: 0.8,
    options: [{ label: '產品', value: 'product', domId: 'dynamic-department-option-1' }],
    meta: { selectLike: true, locatorStability: 1 }
  },
  {
    id: 'time-format-select',
    kind: 'date',
    label: '時間格式',
    placeholder: '請選擇',
    context: '時間格式 請選擇',
    selector: '#time-format-select',
    domId: 'time-format-select',
    score: 0.8,
    confidence: 0.8,
    constraints: { dateLike: true },
    options: [{ label: '24 小時制', value: '24h', domId: 'time-format-option-1' }],
    meta: { selectLike: true, locatorStability: 1 }
  },
  {
    id: 'candidate-code',
    kind: 'text',
    label: 'Candidate code',
    placeholder: 'Enter candidate code',
    context: 'Candidate code Enter candidate code',
    selector: '#candidate-code',
    domId: 'candidate-code',
    score: 0.8,
    confidence: 0.8,
    meta: { locatorStability: 1 }
  },
  {
    id: 'update-notes',
    kind: 'text',
    label: 'Update notes',
    placeholder: 'Enter update notes',
    context: 'Update notes Enter update notes',
    selector: '#update-notes',
    domId: 'update-notes',
    score: 0.8,
    confidence: 0.8,
    meta: { locatorStability: 1 }
  },
  {
    id: 'start-date-token',
    kind: 'text',
    label: 'start_date',
    placeholder: 'Enter start_date',
    context: 'start_date Enter start_date',
    selector: '#start-date-token',
    domId: 'start-date-token',
    score: 0.8,
    confidence: 0.8,
    meta: { locatorStability: 1 }
  },
  {
    id: 'custom-renderer-signature',
    kind: 'text',
    label: '签名',
    placeholder: '请在此处签名',
    context: '签名 请在此处签名',
    selector: '#custom-renderer-signature',
    domId: 'custom-renderer-signature',
    score: 0.92,
    confidence: 0.92,
    constraints: { required: true },
    meta: {
      widget: 'signature',
      signature: true,
      required: true,
      customRendererAdapter: 'fb-form-renderer',
      locatorStability: 1
    }
  }
];

const nameWithPollutedContextFixture = {
  id: 'name-with-form-email-context',
  kind: 'fullName',
  label: '姓名',
  placeholder: '请输入姓名',
  context: '姓名 请输入姓名 联系方式 邮箱 请输入电子邮件',
  selector: '#polluted-context-name-input',
  domId: 'polluted-context-name-input',
  score: 0.92,
  confidence: 0.92,
  source: 'scan:custom-renderer',
  meta: {
    customRendererAdapter: 'fb-form-renderer',
    locatorStability: 1
  }
};

const creditCodeFixture = {
  id: 'unified-social-credit-code',
  kind: 'companyId',
  label: '统一社会信用代码',
  placeholder: '请输入统一社会信用代码',
  context: '统一社会信用代码 0/20 请输入统一社会信用代码',
  selector: 'input[placeholder="请输入统一社会信用代码"]',
  domId: 'credit-code',
  score: 0.92,
  confidence: 0.92,
  meta: { locatorStability: 1 }
};

const idPhotoUploadFixture = {
  id: 'agent-id-portrait',
  kind: 'file',
  label: '经办人身份证头像面',
  placeholder: '',
  context: '经办人身份证头像面 经办人身份证头像面',
  selector: 'input[name="file"]',
  domId: 'agent-id-portrait',
  score: 0.87,
  confidence: 0.87,
  meta: { locatorStability: 1 }
};

const editorCodeButtonFixture = {
  id: 'editor-code-button',
  kind: 'text',
  label: '代码',
  placeholder: '',
  context: '代码',
  selector: 'button.ql-code',
  domId: 'editor-code-button',
  score: 0.62,
  confidence: 0.62,
  meta: { locatorStability: 1 }
};

const contextOnlyEmailFixture = {
  id: 'context-only-email',
  kind: 'text',
  label: '',
  placeholder: '',
  context: '请填写邮箱',
  selector: '#context-only-email-input',
  domId: 'context-only-email-input',
  score: 0.72,
  confidence: 0.72,
  meta: { locatorStability: 1 }
};

const engines = [
  { name: 'legacy/background', normalize: normalizeLegacy, prepare: prepareLegacy },
  { name: 'public/check-script', normalize: normalizePublic, prepare: preparePublic }
];

for (const engine of engines) {
  const normalized = engine.normalize(structuredClone(fixtures));
  const byId = new Map(normalized.map((field) => [field.id, field]));

  assert.equal(byId.get('traditional-time')?.kind, 'date', `${engine.name}: 繁體時間被誤判`);
  assert.equal(byId.get('readonly-time-picker')?.kind, 'date', `${engine.name}: readonly 時間被誤判`);
  assert.equal(byId.get('conflicting-time-description')?.kind, 'date', `${engine.name}: 含日期說明的時間題被誤判`);
  assert.equal(byId.get('conflicting-time-description')?.meta?.datePickerMode, 'time', `${engine.name}: 時間子類型在標準化後丟失`);
  assert.equal(byId.get('conflicting-time-description')?.meta?.timeOnly, true, `${engine.name}: 純時間標記在標準化後丟失`);
  assert.equal(byId.get('ordinary-date')?.kind, 'date', `${engine.name}: 普通日期被誤判`);
  assert.equal(byId.get('birthday-ymd')?.kind, 'date', `${engine.name}: 年月日生日被誤判`);
  assert.equal(byId.get('birthday-ym')?.kind, 'date', `${engine.name}: 年月生日被誤判`);
  assert.equal(byId.get('birthday-md')?.kind, 'date', `${engine.name}: 月日生日被誤判`);
  assert.equal(byId.get('department-select')?.kind, 'select', `${engine.name}: 一般下拉被誤判`);
  assert.equal(byId.get('dynamic-department-select')?.kind, 'select', `${engine.name}: 動態下拉未被識別`);
  assert.equal(byId.get('time-format-select')?.kind, 'select', `${engine.name}: 時間格式下拉被誤判`);
  assert.equal(byId.get('candidate-code')?.kind, 'text', `${engine.name}: Candidate 被誤判為日期`);
  assert.equal(byId.get('update-notes')?.kind, 'text', `${engine.name}: Update 被誤判為日期`);
  assert.equal(byId.get('start-date-token')?.kind, 'date', `${engine.name}: start_date 未被識別為日期`);
  assert.equal(byId.get('custom-renderer-signature')?.kind, 'text', `${engine.name}: 簽名字段基礎類型被改寫`);
  assert.equal(byId.get('custom-renderer-signature')?.meta?.widget, 'signature', `${engine.name}: 簽名組件標記丟失`);
  assert.equal(byId.get('custom-renderer-signature')?.meta?.required, true, `${engine.name}: 簽名必填標記丟失`);

  const prepared = engine.prepare(normalized);
  const preparedIds = new Set(prepared.fields.map((field) => field.id));
  for (const fixture of fixtures) {
    assert.ok(preparedIds.has(fixture.id), `${engine.name}: ${fixture.id} 未進入填充清單`);
  }

  const normalizedPollutedName = engine.normalize([structuredClone(nameWithPollutedContextFixture)]);
  assert.equal(normalizedPollutedName.length, 1, `${engine.name}: 含整表邮箱上下文的姓名字段被丢弃`);
  assert.equal(normalizedPollutedName[0]?.kind, 'fullName', `${engine.name}: 姓名直接语义未优先于整表邮箱上下文`);

  const preparedPollutedName = engine.prepare(normalizedPollutedName);
  assert.equal(preparedPollutedName.fields.length, 1, `${engine.name}: 含整表邮箱上下文的姓名未进入填充计划`);
  assert.equal(preparedPollutedName.fields[0]?.kind, 'fullName', `${engine.name}: 填充计划将姓名误判为邮箱`);

  const normalizedContextOnlyEmail = engine.normalize([structuredClone(contextOnlyEmailFixture)]);
  assert.equal(normalizedContextOnlyEmail[0]?.kind, 'email', `${engine.name}: 无直接题干时未使用上下文兜底识别邮箱`);

  const normalizedCreditCode = engine.normalize([structuredClone(creditCodeFixture)]);
  assert.equal(normalizedCreditCode.length, 1, `${engine.name}: 统一社会信用代码被当成编辑器控件丢弃`);
  assert.equal(normalizedCreditCode[0]?.kind, 'companyId', `${engine.name}: 统一社会信用代码未被识别为企业编号`);
  assert.equal(engine.prepare(normalizedCreditCode).fields.length, 1, `${engine.name}: 统一社会信用代码未进入填充计划`);

  const normalizedIdPhoto = engine.normalize([structuredClone(idPhotoUploadFixture)]);
  assert.equal(normalizedIdPhoto.length, 1, `${engine.name}: 身份证照片上传被丢弃`);
  assert.equal(normalizedIdPhoto[0]?.kind, 'file', `${engine.name}: 身份证照片上传被改判为证件号`);

  const normalizedEditorCode = engine.normalize([structuredClone(editorCodeButtonFixture)]);
  assert.equal(normalizedEditorCode.length, 0, `${engine.name}: 编辑器“代码”按钮未被抑制`);
}

globalThis.window = {};
await import('../public/content/scan.js');

const {
  classifyField,
  hasMultipleFieldKeyOwners,
  inferDatePickerMode,
  isDateHintText,
  isDatePickerClassText
} = window.FormPilotV2Utils || {};
assert.equal(typeof hasMultipleFieldKeyOwners, 'function', 'scan: 题目边界判断函数未暴露');
const createFieldOwner = (key) => ({
  getAttribute(name) {
    assert.equal(name, 'data-field-key');
    return key;
  }
});
const sharedFieldOwner = createFieldOwner('verification_code');
const createOwnedInput = (owner) => ({
  closest(selector) {
    assert.equal(selector, '[data-field-key]');
    return owner;
  }
});
assert.equal(
  hasMultipleFieldKeyOwners([createOwnedInput(sharedFieldOwner), createOwnedInput(sharedFieldOwner)]),
  false,
  'scan: 同一题目内的合法分段输入被拦截'
);
assert.equal(
  hasMultipleFieldKeyOwners([
    createOwnedInput(createFieldOwner('verification_code')),
    createOwnedInput(createFieldOwner('verification_code'))
  ]),
  false,
  'scan: 同字段键的多层包装分段输入被拦截'
);
assert.equal(
  hasMultipleFieldKeyOwners([
    createOwnedInput(createFieldOwner('username_mvlkrr')),
    createOwnedInput(createFieldOwner('email_mvlkrr'))
  ]),
  true,
  'scan: 跨多个 data-field-key 的输入未被拦截'
);
assert.equal(
  hasMultipleFieldKeyOwners([createOwnedInput(null), createOwnedInput(null)]),
  false,
  'scan: 无 data-field-key 的原生分段组件行为被改变'
);
assert.equal(typeof isDateHintText, 'function', 'scan: 日期提示词判断函数未暴露');
assert.equal(isDateHintText('Candidate code'), false, 'scan: Candidate 被误判为日期');
assert.equal(isDateHintText('Update notes'), false, 'scan: Update 被误判为日期');
assert.equal(isDateHintText('runtime notes'), false, 'scan: runtime 被误判为日期');
assert.equal(isDateHintText('公司成立原因'), false, 'scan: 成立语义被误判为日期');
assert.equal(isDateHintText('成立日期'), true, 'scan: 成立日期未识别');
assert.equal(isDateHintText('Select a date'), true, 'scan: 英文日期未识别');
assert.equal(isDateHintText('Choose time'), true, 'scan: 英文时间未识别');
assert.equal(isDateHintText('start_date'), true, 'scan: 下划线日期 token 未识别');
assert.equal(isDateHintText('請選擇時間'), true, 'scan: 繁體时间未识别');
assert.equal(isDatePickerClassText('form-control timepicker'), true, 'scan: timepicker 结构未识别');
assert.equal(isDatePickerClassText('el-date-picker'), true, 'scan: date-picker 结构未识别');
assert.equal(isDatePickerClassText('custom-select'), false, 'scan: 普通下拉结构被误判为 picker');
assert.equal(isDatePickerClassText('update-picker'), false, 'scan: update-picker 被误判为日期 picker');
assert.equal(isDatePickerClassText('candidate-picker'), false, 'scan: candidate-picker 被误判为日期 picker');
assert.equal(isDatePickerClassText('runtimepicker'), false, 'scan: runtimepicker 被误判为日期 picker');

function createScanElement(tagName, attrs = {}, parentAttrs = {}, options = {}) {
  const makeNode = (values) => ({
    getAttribute(name) {
      return Object.hasOwn(values, name) ? values[name] : null;
    },
    hasAttribute(name) {
      return Object.hasOwn(values, name);
    }
  });
  const childNodes = (options.childAttrs || []).map((values) => makeNode(values));
  return {
    ...makeNode(attrs),
    tagName: tagName.toUpperCase(),
    textContent: options.textContent || '',
    parentElement: makeNode(parentAttrs),
    querySelectorAll() {
      return childNodes;
    }
  };
}

const conflictingTimeTrigger = createScanElement(
  'button',
  { type: 'button' },
  {},
  { textContent: '請選擇放學時間', childAttrs: [{ class: 'lucide-clock-3' }] }
);
const ordinaryDateTrigger = createScanElement(
  'button',
  { type: 'button' },
  {},
  { textContent: '請選擇日期', childAttrs: [{ class: 'lucide-calendar-days' }] }
);
assert.equal(
  inferDatePickerMode(conflictingTimeTrigger, '[75e]請補充放學時間'),
  'time',
  'scan: 時間按鈕未根據時鐘結構識別'
);
assert.equal(
  inferDatePickerMode(ordinaryDateTrigger, '活動日期'),
  'date',
  'scan: 日期按鈕未根據日曆結構識別'
);

assert.equal(
  classifyField(
    createScanElement('input', { readonly: '', class: 'form-control timepicker' }),
    '預約時間',
    '請選擇時間',
    '預約時間 請選擇時間'
  ),
  'date',
  'scan: readonly timepicker 被误判为下拉'
);
assert.equal(
  classifyField(
    createScanElement('select'),
    '時間段',
    '請選擇',
    '時間段 請選擇'
  ),
  'select',
  'scan: 带时间文案的原生下拉被误判'
);
assert.equal(
  classifyField(
    createScanElement('input', { readonly: '', class: 'custom-select' }),
    '部門',
    '請選擇部門',
    '部門 請選擇部門'
  ),
  'select',
  'scan: 普通 readonly 下拉未识别'
);

const generatorSettings = { testDataLibrary: { enabled: false } };
const candidateValue = generateValueForField(fixtures.find((field) => field.id === 'candidate-code'), generatorSettings);
const updateValue = generateValueForField(fixtures.find((field) => field.id === 'update-notes'), generatorSettings);
const startDateValue = generateValueForField(fixtures.find((field) => field.id === 'start-date-token'), generatorSettings);
const actualDateValue = generateValueForField({ kind: 'date', label: 'Date' }, generatorSettings);
const actualTimeValue = generateValueForField({ kind: 'date', label: 'Appointment time' }, generatorSettings);
const conflictingTimeValue = generateValueForField(fixtures.find((field) => field.id === 'conflicting-time-description'), generatorSettings);
const ordinaryDateValue = generateValueForField(fixtures.find((field) => field.id === 'ordinary-date'), generatorSettings);
const birthdayYmdValue = generateValueForField(fixtures.find((field) => field.id === 'birthday-ymd'), generatorSettings);
const birthdayYmValue = generateValueForField(fixtures.find((field) => field.id === 'birthday-ym'), generatorSettings);
const birthdayMdValue = generateValueForField(fixtures.find((field) => field.id === 'birthday-md'), generatorSettings);

assert.doesNotMatch(String(candidateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: Candidate 生成了日期');
assert.doesNotMatch(String(updateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: Update 生成了日期');
assert.match(String(startDateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: start_date 未生成日期');
assert.match(String(actualDateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: DATE 字段未生成日期');
assert.match(String(actualTimeValue), /^\d{2}:\d{2}$/, 'data: TIME 字段未生成时间');
assert.match(String(conflictingTimeValue), /^\d{2}:\d{2}$/, 'data: 含“日期格式”說明的時間題未生成時間');
assert.match(String(ordinaryDateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: 普通日期未生成日期');
assert.match(String(birthdayYmdValue), /^\d{4}-\d{2}-\d{2}$/, 'data: 年月日生日未生成日期');
assert.match(String(birthdayYmValue), /^\d{4}-\d{2}-\d{2}$/, 'data: 年月生日未生成日期');
assert.match(String(birthdayMdValue), /^\d{4}-\d{2}-\d{2}$/, 'data: 月日生日未生成日期');

await import('../public/content/fill.js');
const isDesensitizedDisplayOf = window.FormPilotV2Fill?.__test?.isDesensitizedDisplayOf;
const verifyValueAgainstConstraints = window.FormPilotV2Fill?.__test?.verifyValueAgainstConstraints;
assert.equal(typeof isDesensitizedDisplayOf, 'function', 'fill: 脱敏显示判断未暴露');
assert.equal(isDesensitizedDisplayOf('11***11', '110000199001011111'), true, 'fill: 11***11 未识别为原值的脱敏显示');
assert.equal(isDesensitizedDisplayOf('138****5678', '13812345678'), true, 'fill: 手机号掩码未识别');
assert.equal(isDesensitizedDisplayOf('6222 **** **** 1234', '6222021234561234'), true, 'fill: 带空格的卡号掩码未识别');
assert.equal(isDesensitizedDisplayOf('****', '13812345678'), true, 'fill: 全星号脱敏未识别');
assert.equal(isDesensitizedDisplayOf('99***00', '13812345678'), false, 'fill: 无关掩码被当成原值');
assert.equal(
  verifyValueAgainstConstraints('11***11', { numericLike: true, minLength: 11, pattern: '\\d{11}' }, '手机号').ok,
  true,
  'fill: 脱敏显示被数字或长度约束判失败'
);
assert.equal(
  verifyValueAgainstConstraints('abc', { numericLike: true }, '数字').ok,
  false,
  'fill: 非数字值不再被约束拦截'
);
const resolveDateFieldMode = window.FormPilotV2Fill?.__test?.resolveDateFieldMode;
const normalizeTimeText = window.FormPilotV2Fill?.__test?.normalizeTimeText;
const buildSignatureStrokePaths = window.FormPilotV2Fill?.__test?.buildSignatureStrokePaths;
assert.equal(typeof resolveDateFieldMode, 'function', 'fill: 時間/日期模式判斷未暴露');
assert.equal(typeof buildSignatureStrokePaths, 'function', 'fill: 簽名筆跡生成函數未暴露');
const signaturePaths = buildSignatureStrokePaths('王晓彤');
assert.equal(signaturePaths.length, 3, 'fill: 簽名筆跡路徑數量異常');
assert.ok(signaturePaths.every((path) => path.length >= 4), 'fill: 簽名筆跡路徑過短');
assert.ok(
  signaturePaths.flat().every(([x, y]) => x >= 0.04 && x <= 0.96 && y >= 0.04 && y <= 0.96),
  'fill: 簽名筆跡超出畫布範圍'
);
assert.deepEqual(signaturePaths, buildSignatureStrokePaths('王晓彤'), 'fill: 相同簽名種子未生成穩定筆跡');
assert.notDeepEqual(signaturePaths, buildSignatureStrokePaths('李晨宇'), 'fill: 不同簽名種子生成了完全相同筆跡');
assert.equal(normalizeTimeText('2026-03-06'), '12:30', 'fill: 日期字符串被誤解為緊湊時間');
assert.equal(normalizeTimeText('2030'), '20:30', 'fill: 合法緊湊時間未正常解析');
assert.equal(
  resolveDateFieldMode(fixtures.find((field) => field.id === 'conflicting-time-description'), conflictingTimeTrigger),
  'time',
  'fill: 含日期說明的時間題未進入時間分支'
);
assert.equal(
  resolveDateFieldMode(fixtures.find((field) => field.id === 'ordinary-date'), ordinaryDateTrigger),
  'date',
  'fill: 普通日期未保持日期分支'
);
for (const id of ['birthday-ymd', 'birthday-ym', 'birthday-md']) {
  assert.equal(resolveDateFieldMode(fixtures.find((field) => field.id === id), null), 'birthday', `fill: ${id} 未保持生日分支`);
}

console.log(`detect regression passed: ${engines.length} engines, ${fixtures.length} fixtures, scan and data`);
