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
  }
];

const engines = [
  { name: 'legacy/background', normalize: normalizeLegacy, prepare: prepareLegacy },
  { name: 'public/check-script', normalize: normalizePublic, prepare: preparePublic }
];

for (const engine of engines) {
  const normalized = engine.normalize(structuredClone(fixtures));
  const byId = new Map(normalized.map((field) => [field.id, field]));

  assert.equal(byId.get('traditional-time')?.kind, 'date', `${engine.name}: 繁體時間被誤判`);
  assert.equal(byId.get('readonly-time-picker')?.kind, 'date', `${engine.name}: readonly 時間被誤判`);
  assert.equal(byId.get('department-select')?.kind, 'select', `${engine.name}: 一般下拉被誤判`);
  assert.equal(byId.get('dynamic-department-select')?.kind, 'select', `${engine.name}: 動態下拉未被識別`);
  assert.equal(byId.get('time-format-select')?.kind, 'select', `${engine.name}: 時間格式下拉被誤判`);
  assert.equal(byId.get('candidate-code')?.kind, 'text', `${engine.name}: Candidate 被誤判為日期`);
  assert.equal(byId.get('update-notes')?.kind, 'text', `${engine.name}: Update 被誤判為日期`);
  assert.equal(byId.get('start-date-token')?.kind, 'date', `${engine.name}: start_date 未被識別為日期`);

  const prepared = engine.prepare(normalized);
  const preparedIds = new Set(prepared.fields.map((field) => field.id));
  for (const fixture of fixtures) {
    assert.ok(preparedIds.has(fixture.id), `${engine.name}: ${fixture.id} 未進入填充清單`);
  }
}

globalThis.window = {};
await import('../public/content/scan.js');

const { classifyField, isDateHintText, isDatePickerClassText } = window.FormPilotV2Utils || {};
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

function createScanElement(tagName, attrs = {}, parentAttrs = {}) {
  const makeNode = (values) => ({
    getAttribute(name) {
      return Object.hasOwn(values, name) ? values[name] : null;
    },
    hasAttribute(name) {
      return Object.hasOwn(values, name);
    }
  });
  return {
    ...makeNode(attrs),
    tagName: tagName.toUpperCase(),
    parentElement: makeNode(parentAttrs)
  };
}

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

assert.doesNotMatch(String(candidateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: Candidate 生成了日期');
assert.doesNotMatch(String(updateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: Update 生成了日期');
assert.match(String(startDateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: start_date 未生成日期');
assert.match(String(actualDateValue), /^\d{4}-\d{2}-\d{2}$/, 'data: DATE 字段未生成日期');
assert.match(String(actualTimeValue), /^\d{2}:\d{2}$/, 'data: TIME 字段未生成时间');

console.log(`detect regression passed: ${engines.length} engines, ${fixtures.length} fixtures, scan and data`);
