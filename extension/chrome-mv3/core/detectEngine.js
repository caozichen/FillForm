import { buildFieldGraph } from './fieldGraph.js';
import { FIELD_KINDS } from './types.js';

function normalizeText(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampScore(input, fallback = 0.5) {
  const score = Number(input);
  if (Number.isFinite(score)) {
    return Math.max(0, Math.min(1, score));
  }
  return fallback;
}

function pushReason(bucket, text) {
  const normalized = normalizeText(text);
  if (!normalized) return;
  if (!bucket.includes(normalized)) bucket.push(normalized);
}

const EDITOR_CONTROL_HINT_RE = /(加粗|粗体|斜体|下划线|删除线|字号|字体|字体大小|颜色|背景|对齐|缩进|列表|项目符号|编号|插入|链接|图片|表格|代码|预览|全屏|源码|html|撤销|重做|清除格式|清空|format|toolbar|editor|rich\s*text|wysiwyg)/i;
const ADDRESS_HIERARCHY_HINT_RE = /(省份|省.{0,8}城市|城市.{0,8}(区县|區縣|地区|地區|区域|區域)|province.{0,16}city|city.{0,16}(district|region|area|county)|district|region|area|区县|區縣|地區|地区|區域|区域)/i;
const ID_DOCUMENT_HINT_RE = /(身份证|身份證|身份証|身分證|身分証|证件|證件|護照|护照|id\s*card|idcard|identity\s*(document|card)|identification|passport|document\s*(number|no\.?))/i;
const BANK_CARD_HINT_RE = /(银行卡|銀行卡|银行卡号|銀行卡號|银行账号|銀行賬號|银行账户|銀行賬戶|储蓄卡|儲蓄卡|借记卡|借記卡|debit\s*card|bank\s*(card|account|acct)|card\s*(number|no\.?))/i;
const DATE_HINT_RE = /(?:日期|時間|时间|生日|出生日期|(?:^|[^A-Za-z])(?:birth\s*date|date\s*of\s*birth|dob|datetime|date|time)(?=$|[^A-Za-z]))/i;

function isBankCardHint(hint = '') {
  const text = String(hint || '');
  return BANK_CARD_HINT_RE.test(text) && !ID_DOCUMENT_HINT_RE.test(text);
}

function isLikelyEditorControl(field) {
  if (
    field?.meta?.adapterName === 'lingxiLegacy' &&
    (field.kind === FIELD_KINDS.RADIO_GROUP || field.kind === FIELD_KINDS.CHECKBOX_GROUP) &&
    Array.isArray(field.options) &&
    field.options.length > 0
  ) {
    return false;
  }
  const hint = stripBusinessIdentifierHints(
    `${field.label || ''} ${field.placeholder || ''} ${field.context || ''} ${field.reason || ''}`
  );
  return EDITOR_CONTROL_HINT_RE.test(hint);
}

function stripBusinessIdentifierHints(text) {
  return String(text || '').replace(
    /统一社会信用代码|統一社會信用代碼|社会信用代码|社會信用代碼|信用代码|信用代碼|统一信用代码|統一信用代碼|组织机构代码|組織機構代碼|机构代码|機構代碼|证照编号|證照編號|纳税人识别号|納税人識別號/gi,
    ' '
  );
}

function hasStructuredDateEvidence(field) {
  if (field?.kind !== FIELD_KINDS.DATE) return false;
  const inputType = normalizeText(field?.constraints?.inputType || '').toLowerCase();
  const widget = normalizeText(field?.meta?.widget || field?.meta?.componentType || '').toLowerCase();
  return (
    field?.constraints?.dateLike === true ||
    /^(date|time|datetime-local|month)$/.test(inputType) ||
    field?.meta?.pickerLike === true ||
    field?.meta?.customDateButton === true ||
    /(date|time)picker|datetime/.test(widget)
  );
}

function detectKindFromSemanticHint(hint) {
  if (/(公司|企業|企业|機構|机构|組織|组织|單位|单位|雇主|政府|government|organization|organisation|company|entity|agency|employer|corp|corporation).*(名稱|名称|name)|cert.*name|company\s*name|organization\s*name|organisation\s*name|legal\s*entity\s*name|enterprise\s*name/i.test(hint)) return FIELD_KINDS.COMPANY_NAME;
  if (isBankCardHint(hint)) return FIELD_KINDS.BANK_CARD;
  if (/(统一社会信用代码|統一社會信用代碼|社会信用代码|社會信用代碼|信用代码|信用代碼|统一信用代码|統一信用代碼|納税人識別號|纳税人识别号|商業登記(?:證)?號(?:碼)?|商业登记(?:证)?号(?:码)?|商業登記|商业登记|商業登記證|商业登记证|unified social credit(?: code| identifier)?|social credit code|taxpayer identification(?: number)?|tax id|brn|business registration(?: number| no\.?| #)?|registration number|company registration(?: number| no\.?)|證照編號|证照编号)/i.test(hint)) return FIELD_KINDS.COMPANY_ID;
  if (/(驗證碼|验证码|verify code|verification code)/i.test(hint)) return FIELD_KINDS.VERIFICATION;
  if (/(職位|职位|職稱|职称|職業|职业|工種|工种|occupation|profession|job\s*title|position|title)/i.test(hint)) return FIELD_KINDS.JOB_TITLE;
  if (/(姓氏|姓\(中\)|姓\(英\)|姓（中）|姓（英）|last name|family name|surname)/i.test(hint)) return FIELD_KINDS.LAST_NAME;
  if (/(名字|名\(中\)|名\(英\)|名（中）|名（英）|first name|given name|forename)/i.test(hint)) return FIELD_KINDS.FIRST_NAME;
  if (/邮箱|郵箱|電郵|电子邮件|電子郵件|电邮|e-?mail|mail\s*address/i.test(hint)) return FIELD_KINDS.EMAIL;
  if (/身份证|身份證|身份証|身分證|身分証|证件|證件|護照|护照|id\s*card|idcard|identity\s*(document|card)|identification|passport|document\s*(number|no\.?)/i.test(hint)) return FIELD_KINDS.IDCARD;
  if (/固定电话|固定電話|住宅電話|办公电话|辦公電話|固話|固话|landline|telephone|tel/i.test(hint)) return FIELD_KINDS.TEL;
  if (/电话|電話|手机|手機|手机号|手機號|手提電話|流動電話|移动电话|聯絡電話|联络电话|聯繫電話|联系电话|mobile|phone|contact\s*(number|phone)|phone\s*number/i.test(hint)) return FIELD_KINDS.PHONE;
  if (/姓名|中文姓名|英文姓名|全名|申請人|申请人|聯絡人|联系人|name|full\s*name|contact\s*person|applicant/i.test(hint)) return FIELD_KINDS.FULL_NAME;
  if (DATE_HINT_RE.test(hint)) return FIELD_KINDS.DATE;
  if (/地址|通訊地址|通讯地址|聯絡地址|联系地址|住址|居住地址|郵寄地址|邮寄地址|省份|城市|区县|區縣|地區|地区|区域|區域|address|mailing\s*address|residential\s*address|home\s*address|contact\s*address|street|road|district|region|area|city|state|province|街號|街号|街名|门牌|門牌|室|房|樓|楼|大廈|大厦|building|tower|block|flat|unit|room|floor|street\s*no|street\s*name/i.test(hint)) return FIELD_KINDS.ADDRESS_DETAIL;
  if (/请选择|請選擇|选择|選擇|下拉|選項|选项|combobox|dropdown|select|choose/i.test(hint)) return FIELD_KINDS.SELECT;

  return '';
}

function detectKindFromHint(field) {
  const shortLabel = normalizeText(field.label || '');
  const shortPlaceholder = normalizeText(field.placeholder || '');

  if (field.kind === FIELD_KINDS.ADDRESS_COMPONENT) return FIELD_KINDS.ADDRESS_COMPONENT;
  if (Array.isArray(field.meta?.comboboxDomIds) && field.meta.comboboxDomIds.length >= 2 && field.meta?.detailDomId) {
    return FIELD_KINDS.ADDRESS_COMPONENT;
  }
  if (hasStructuredDateEvidence(field)) return FIELD_KINDS.DATE;
  if (field.meta?.selectLike) return FIELD_KINDS.SELECT;
  if (shortLabel === '姓' || shortPlaceholder === '姓' || shortLabel === '姓氏' || shortPlaceholder === '姓氏') return FIELD_KINDS.LAST_NAME;
  if (shortLabel === '名' || shortPlaceholder === '名' || shortLabel === '名字' || shortPlaceholder === '名字') return FIELD_KINDS.FIRST_NAME;

  const directHint = normalizeText(`${field.label || ''} ${field.placeholder || ''}`);
  const directKind = detectKindFromSemanticHint(directHint);
  if (directKind) return directKind;
  return detectKindFromSemanticHint(normalizeText(field.context || ''));
}

function scoreField(field) {
  const reasons = [];
  let score = clampScore(field.score, field.confidence || 0.5);

  if (field.label) {
    score += 0.14;
    pushReason(reasons, '有标签文本');
  } else {
    score -= 0.14;
    pushReason(reasons, '缺少标签文本');
  }

  if (field.placeholder) {
    score += 0.06;
    pushReason(reasons, '有占位提示');
  }

  if (field.context) {
    score += 0.05;
    pushReason(reasons, '存在上下文');
  } else {
    score -= 0.05;
    pushReason(reasons, '缺少上下文');
  }

  if (field.domId) {
    score += 0.03;
    pushReason(reasons, '有稳定 domId');
  }

  const locatorStability = Number(field?.meta?.locatorStability || 0);
  if (Number.isFinite(locatorStability) && locatorStability > 0) {
    score += Math.min(0.12, locatorStability * 0.1);
    pushReason(reasons, `定位稳定度 ${locatorStability.toFixed(2)}`);
  }

  if (field.selector && field.selector.startsWith('#')) {
    score += 0.03;
    pushReason(reasons, '可用 id 定位');
  }

  if (field.meta?.segmented) {
    score += 0.18;
    pushReason(reasons, '分段输入已聚合');
  }

  if (field.kind === FIELD_KINDS.SELECT) {
    if (field.options?.length) {
      score += 0.16;
      pushReason(reasons, `下拉候选 ${field.options.length} 项`);
    } else if (field.meta?.selectLike) {
      score += 0.06;
      pushReason(reasons, '识别为下拉触发器，候选项待展开');
    } else {
      score -= 0.08;
      pushReason(reasons, '下拉候选为空');
    }
  }

  if (field?.constraints?.required) {
    score += 0.04;
    pushReason(reasons, '必填字段');
  }

  if (field?.constraints?.oneYearRequired || Number(field?.constraints?.olderThanDays || 0) >= 365) {
    score += 0.03;
    pushReason(reasons, '日期存在业务约束');
  }

  if (field.kind === FIELD_KINDS.RADIO_GROUP || field.kind === FIELD_KINDS.CHECKBOX_GROUP) {
    if ((field.options || []).length > 1) {
      score += 0.12;
      pushReason(reasons, '选项组已展开');
    } else {
      score -= 0.08;
      pushReason(reasons, '选项组候选不足');
    }
  }

  if (field.kind !== FIELD_KINDS.TEXT) {
    score += 0.06;
    pushReason(reasons, `语义类型 ${field.kind}`);
  }

  if (field.kind === FIELD_KINDS.TEXT) {
    if (/请输入$|請輸入$|默认$|請選擇$|请选择$/.test(field.placeholder || '')) {
      score -= 0.08;
      pushReason(reasons, '占位文案过于通用');
    }

    if (field.meta?.segmentCandidate) {
      score -= 0.22;
      pushReason(reasons, '疑似分段短输入成员');
    }

    if (!field.label && !field.placeholder) {
      score -= 0.18;
      pushReason(reasons, '文本框缺少直观语义');
    }
  }

  if (field.meta?.suppressed) {
    score = 0;
    pushReason(reasons, '已标记为抑制字段');
  }

  if (isLikelyEditorControl(field)) {
    score = 0;
    pushReason(reasons, '编辑器工具栏/配置控件已抑制');
  }

  return {
    score: clampScore(score, field.confidence || 0.5),
    reasons
  };
}

function shouldDropField(field) {
  if (field.meta?.suppressed) return true;
  if ((field.score || 0) < 0.2) return true;
  return false;
}

function correctField(field) {
  const corrected = { ...field, meta: { ...(field.meta || {}) } };
  if (isLikelyEditorControl(corrected)) {
    corrected.kind = FIELD_KINDS.UNKNOWN;
    corrected.meta.suppressed = true;
    corrected.meta.correctedByDetectEngine = true;
    corrected.reasons = [...(corrected.reasons || [])];
    pushReason(corrected.reasons, '编辑器工具栏/配置控件已抑制');
    corrected.reason = corrected.reasons[0] || '';
    corrected.score = 0;
    corrected.confidence = Math.min(corrected.confidence || 0.5, 0.2);
  }
  const preserveMappedKind =
    corrected.meta?.mappedByTemplate &&
    corrected.kind &&
    corrected.kind !== FIELD_KINDS.TEXT &&
    corrected.kind !== FIELD_KINDS.UNKNOWN;
  const preserveLegacyAdapterKind = corrected.meta?.adapterName === 'lingxiLegacy' && !!corrected.meta?.adapterWidget;
  const hasChoiceOptions = Array.isArray(corrected.options) && corrected.options.length > 0;
  const preserveStructuralKind =
    corrected.kind === FIELD_KINDS.ADDRESS_COMPONENT ||
    corrected.kind === FIELD_KINDS.FILE ||
    hasStructuredDateEvidence(corrected) ||
    (
      (corrected.kind === FIELD_KINDS.RADIO_GROUP || corrected.kind === FIELD_KINDS.CHECKBOX_GROUP) &&
      (hasChoiceOptions || corrected.meta?.componentGroup || corrected.meta?.questionLike)
    );
  const detectedKind = detectKindFromHint(corrected);
  if (!preserveMappedKind && !preserveLegacyAdapterKind && !preserveStructuralKind && detectedKind && detectedKind !== corrected.kind) {
    corrected.kind = detectedKind;
    corrected.meta.correctedByDetectEngine = true;
    corrected.reasons = [...(corrected.reasons || [])];
    pushReason(corrected.reasons, `按语义纠偏为 ${detectedKind}`);
    corrected.reason = corrected.reasons[0] || '';
    if (corrected.score < 0.72) corrected.score = 0.72;
    corrected.confidence = Math.max(corrected.confidence || 0.5, corrected.score);
  }

  if (!preserveMappedKind && !preserveLegacyAdapterKind && !preserveStructuralKind && corrected.meta?.selectLike) {
    corrected.kind = FIELD_KINDS.SELECT;
    corrected.meta.correctedByDetectEngine = true;
    corrected.reasons = [...(corrected.reasons || [])];
    pushReason(corrected.reasons, '按下拉触发器线索纠偏为 select');
    corrected.reason = corrected.reasons[0] || '';
    if ((corrected.score || 0) < 0.68) corrected.score = 0.68;
    corrected.confidence = Math.max(corrected.confidence || 0.5, corrected.score);
  }

  corrected.lowConfidence = (corrected.score || 0) < 0.58;
  return corrected;
}

function enhanceField(field) {
  const scored = scoreField(field);
  const mergedReasons = [...(Array.isArray(field.reasons) ? field.reasons : []), ...scored.reasons];
  const uniqueReasons = [];
  for (const item of mergedReasons) {
    pushReason(uniqueReasons, item);
  }
  const next = {
    ...field,
    score: scored.score,
    reasons: uniqueReasons,
    reason: uniqueReasons[0] || '',
    source: field.source || 'detect-engine',
    confidence: Math.max(field.confidence || 0.5, scored.score)
  };
  return correctField(next);
}

function fieldHint(field = {}) {
  return normalizeText(`${field.label || ''} ${field.placeholder || ''} ${field.context || ''}`);
}

function hasAddressHierarchyHint(field = {}) {
  return ADDRESS_HIERARCHY_HINT_RE.test(fieldHint(field));
}

function sameLooseAddressContext(a = {}, b = {}) {
  const labelA = normalizeText(a.label || '');
  const labelB = normalizeText(b.label || '');
  const contextA = normalizeText(a.context || '');
  const contextB = normalizeText(b.context || '');
  if (contextA && contextB && (contextA === contextB || contextA.includes(contextB) || contextB.includes(contextA))) return true;
  return !!(labelA && labelB && labelA === labelB && hasAddressHierarchyHint(a) && hasAddressHierarchyHint(b));
}

function uniqueList(items = []) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function promoteLooseAddressComponents(fields = []) {
  const coveredDetailDomIds = new Set();
  for (const field of fields) {
    if (field.kind !== FIELD_KINDS.ADDRESS_COMPONENT) continue;
    const detailDomId = normalizeText(field?.meta?.detailDomId || '');
    if (detailDomId) coveredDetailDomIds.add(detailDomId);
  }

  const details = fields.filter((field) => field.kind === FIELD_KINDS.ADDRESS_DETAIL);
  const consumed = new Set();
  const promotions = new Map();

  for (const field of fields) {
    if (field.kind !== FIELD_KINDS.SELECT || !field.meta?.selectLike || !hasAddressHierarchyHint(field)) continue;
    const detail = details.find((item) => {
      if (!item || consumed.has(item.id)) return false;
      if (item.domId && coveredDetailDomIds.has(item.domId)) return false;
      return sameLooseAddressContext(field, item);
    });
    if (!detail) continue;

    const comboDomIds = uniqueList([field.domId, ...(Array.isArray(field.meta?.comboboxDomIds) ? field.meta.comboboxDomIds : [])]);
    const comboSelectors = uniqueList([field.selector, ...(Array.isArray(field.meta?.comboboxSelectors) ? field.meta.comboboxSelectors : [])]);
    const component = enhanceField({
      ...field,
      id: `addr_${field.id || detail.id || Math.random().toString(36).slice(2, 8)}`,
      kind: FIELD_KINDS.ADDRESS_COMPONENT,
      placeholder: detail.placeholder || field.placeholder || '',
      context: field.context || detail.context || '',
      score: Math.max(field.score || 0, detail.score || 0, 0.9),
      confidence: Math.max(field.confidence || 0, detail.confidence || 0, 0.9),
      options: [],
      meta: {
        ...(field.meta || {}),
        selectLike: false,
        componentGroup: true,
        promotedAddressComponent: true,
        comboboxDomIds: comboDomIds,
        comboboxSelectors: comboSelectors,
        comboboxRoles: ['province', 'city', 'district'],
        detailDomId: detail.domId || '',
        detailSelector: detail.selector || '',
        sectionVariant: field.meta?.sectionVariant || detail.meta?.sectionVariant || ''
      }
    });
    promotions.set(field.id, component);
    consumed.add(detail.id);
    if (detail.domId) coveredDetailDomIds.add(detail.domId);
  }

  const out = [];
  for (const field of fields) {
    if (promotions.has(field.id)) {
      out.push(promotions.get(field.id));
      continue;
    }
    if (consumed.has(field.id)) continue;
    if (field.kind === FIELD_KINDS.ADDRESS_DETAIL && field.domId && coveredDetailDomIds.has(field.domId)) continue;
    out.push(field);
  }
  return out;
}

export function detectEngineNormalize(rawFields) {
  const list = buildFieldGraph(rawFields)
    .map((field) => enhanceField(field))
    .filter((field) => !shouldDropField(field));

  return promoteLooseAddressComponents(list);
}

export function prepareFieldsForFill(fields = [], options = {}) {
  const allowLowConfidence = options?.allowLowConfidence === true;
  const forceIncludeIds = new Set(
    Array.isArray(options?.forceIncludeIds)
      ? options.forceIncludeIds.map((item) => normalizeText(item)).filter(Boolean)
      : []
  );
  const prepared = [];
  const dropped = [];

  for (const rawField of fields) {
    const field = enhanceField(rawField);
    const hasStableLocator = Boolean(field.domId || field.selector || field.containerSelector);
    const hasExplicitSemantics = Boolean(field.label || field.placeholder || field.meta?.mappedByTemplate || field.meta?.correctedByDetectEngine);
    const locatorStability = Number(field?.meta?.locatorStability || 0);
    const hasStrongLocatorEvidence =
      !!field.selector?.startsWith?.('#') ||
      (!!field.selector && /\[(name|data-testid|data-field|data-name|aria-label)=/i.test(field.selector)) ||
      (!!field.domId && locatorStability >= 0.18) ||
      locatorStability >= 0.55;
    const hasContextSemantics = Boolean(field.context && normalizeText(field.context).length >= 8);
    const textThreshold = hasStrongLocatorEvidence
      ? (hasExplicitSemantics || hasContextSemantics ? 0.34 : 0.42)
      : (hasStableLocator && hasExplicitSemantics ? 0.46 : 0.58);
    const isWeakText = field.kind === FIELD_KINDS.TEXT && (field.score || 0) < textThreshold;
    const selectThreshold = field.meta?.mappedByTemplate ? 0.32 : (field.meta?.selectLike ? 0.36 : 0.48);
    const isWeakSelect = field.kind === FIELD_KINDS.SELECT && (field.score || 0) < selectThreshold;
    const shouldSkipByConfidence = !allowLowConfidence && !forceIncludeIds.has(normalizeText(field.id)) && (isWeakText || isWeakSelect);
    const shouldSkip = shouldDropField(field) || shouldSkipByConfidence;

    if (shouldSkip) {
      dropped.push({
        ...field,
        lowConfidence: isWeakText || isWeakSelect
      });
      continue;
    }

    prepared.push({
      ...field,
      meta: {
        ...(field.meta || {}),
        lowConfidenceBypassed: (isWeakText || isWeakSelect) && !shouldSkipByConfidence
      }
    });
  }

  return {
    fields: prepared,
    dropped,
    summary: {
      total: fields.length,
      prepared: prepared.length,
      dropped: dropped.length,
      corrected: prepared.filter((field) => field.meta?.correctedByDetectEngine).length
    }
  };
}
