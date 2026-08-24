import { FIELD_KINDS } from './types.js';

function normalizeText(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeReasons(input) {
  if (Array.isArray(input)) {
    return input.map((item) => normalizeText(item)).filter(Boolean);
  }
  const single = normalizeText(input);
  return single ? [single] : [];
}

function normalizeRectLike(input) {
  if (!input || typeof input !== 'object') return null;
  const left = Number(input.left ?? input.x);
  const top = Number(input.top ?? input.y);
  const width = Number(input.width ?? input.w);
  const height = Number(input.height ?? input.h);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  return {
    x: Math.round(left),
    y: Math.round(top),
    w: Math.round(width),
    h: Math.round(height)
  };
}

function serializeRect(input) {
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

function clampScore(input, fallback = 0.5) {
  const score = Number(input);
  if (Number.isFinite(score)) {
    return Math.max(0, Math.min(1, score));
  }
  return fallback;
}

export function normalizeField(rawField, index = 0) {
  const kind = rawField.kind || FIELD_KINDS.UNKNOWN;
  const selector = normalizeText(rawField.selector);
  const label = normalizeText(rawField.label);
  const placeholder = normalizeText(rawField.placeholder);
  const context = normalizeText(rawField.context);
  const confidence = Number(rawField.confidence || 0.5);
  const score = clampScore(rawField.score, confidence);
  const reasons = normalizeReasons(rawField.reasons || rawField.reason);

  return {
    id: rawField.id || `f_${index}_${kind}`,
    kind,
    domId: rawField.domId || '',
    selector,
    label,
    placeholder,
    context,
    confidence,
    score,
    reason: reasons[0] || '',
    reasons,
    source: normalizeText(rawField.source || ''),
    lowConfidence: rawField.lowConfidence === true,
    containerSelector: rawField.containerSelector || '',
    widget: rawField.widget || '',
    options: Array.isArray(rawField.options)
      ? rawField.options.map((opt, i) => ({
          index: Number.isInteger(opt?.index) ? opt.index : i,
          label: normalizeText(opt?.label || ''),
          value: normalizeText(opt?.value || ''),
          selector: normalizeText(opt?.selector || ''),
          domId: normalizeText(opt?.domId || '')
        }))
      : [],
    constraints: rawField?.meta?.adapterName === 'lingxiLegacy' && rawField.constraints && typeof rawField.constraints === 'object'
      ? rawField.constraints
      : {},
    meta: rawField.meta && typeof rawField.meta === 'object' ? rawField.meta : {}
  };
}

export function buildFieldGraph(rawFields = []) {
  const bucket = new Map();

  const pickBetterField = (a, b) => {
    const kindA = a?.kind || FIELD_KINDS.TEXT;
    const kindB = b?.kind || FIELD_KINDS.TEXT;
    const structuralRank = (field, kind) => {
      if (kind === FIELD_KINDS.ADDRESS_COMPONENT) return 4;
      if (field?.meta?.segmented) return 3;
      if (kind === FIELD_KINDS.RADIO_GROUP || kind === FIELD_KINDS.CHECKBOX_GROUP) return 2;
      if (kind === FIELD_KINDS.SELECT && field?.meta?.selectLike) return 1;
      return 0;
    };
    const rankA = structuralRank(a, kindA);
    const rankB = structuralRank(b, kindB);
    if (rankA !== rankB) return rankB > rankA ? b : a;

    const scoreA = Number(a?.score || a?.confidence || 0);
    const scoreB = Number(b?.score || b?.confidence || 0);
    if (scoreA !== scoreB) return scoreB > scoreA ? b : a;

    if (kindA === FIELD_KINDS.TEXT && kindB !== FIELD_KINDS.TEXT) return b;
    if (kindB === FIELD_KINDS.TEXT && kindA !== FIELD_KINDS.TEXT) return a;

    const hintA = normalizeText(`${a?.label || ''} ${a?.placeholder || ''} ${a?.context || ''}`);
    const hintB = normalizeText(`${b?.label || ''} ${b?.placeholder || ''} ${b?.context || ''}`);
    return hintB.length > hintA.length ? b : a;
  };

  const buildKey = (field) => {
    const domId = normalizeText(field.domId || '');
    if (domId) return `dom:${domId}`;

    const selector = normalizeText(field.selector || '');
    const containerSelector = normalizeText(field.containerSelector || '');
    const label = normalizeText(field.label || '');
    const placeholder = normalizeText(field.placeholder || '');
    const context = normalizeText(field.context || '').slice(0, 120);
    const detailSelector = normalizeText(field?.meta?.detailSelector || '');
    const sectionVariant = normalizeText(field?.meta?.sectionVariant || field?.meta?.variant || '');
    const geometry = serializeRect(
      field?.meta?.manualRect ||
        field?.meta?.rect ||
        field?.meta?.boundingRect ||
        field?.meta?.box ||
        field?.rect ||
        field?.geometry ||
        null
    );
    const comboDomIds = Array.isArray(field?.meta?.comboboxDomIds) ? field.meta.comboboxDomIds.map((item) => normalizeText(item)).filter(Boolean).join(',') : '';
    const segmentDomIds = Array.isArray(field?.meta?.segmentDomIds) ? field.meta.segmentDomIds.map((item) => normalizeText(item)).filter(Boolean).join(',') : '';

    const segments = [
      selector && `sel:${selector}`,
      containerSelector && `container:${containerSelector}`,
      detailSelector && `detail:${detailSelector}`,
      sectionVariant && `variant:${sectionVariant}`,
      geometry && `geo:${geometry}`,
      label && `label:${label}`,
      context && `ctx:${context}`,
      placeholder && `ph:${placeholder}`,
      comboDomIds && `combo:${comboDomIds}`,
      segmentDomIds && `segment:${segmentDomIds}`
    ].filter(Boolean);

    if (segments.length) return segments.join('|');
    return `kind:${field.kind || FIELD_KINDS.UNKNOWN}`;
  };

  for (let i = 0; i < rawFields.length; i += 1) {
    const field = normalizeField(rawFields[i], i);
    if (!field.selector && !field.containerSelector && !field.domId) continue;
    const key = buildKey(field);
    const prev = bucket.get(key);
    bucket.set(key, prev ? pickBetterField(prev, field) : field);
  }
  return Array.from(bucket.values());
}

export function summarizeFieldGraph(fields = []) {
  const summary = {
    total: fields.length,
    byKind: {}
  };
  for (const f of fields) {
    summary.byKind[f.kind] = (summary.byKind[f.kind] || 0) + 1;
  }
  return summary;
}
