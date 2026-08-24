(function initFormPilotV2Fill() {
  const FORM_PILOT_V2_FILL_BUILD = '2026-08-21-lingxi-legacy-01';
  if (window.FormPilotV2Fill?.__build === FORM_PILOT_V2_FILL_BUILD) return;

  const utils = window.FormPilotV2Utils || {};
  const EID_ATTR = utils.EID_ATTR || 'data-formpilot-v2-eid';
  const FIELD_LOCATOR_SELECTOR = [
    'input',
    'textarea',
    'select',
    'button',
    '[role="button"]',
    '[role="combobox"]',
    '[role="listbox"]',
    '[role="radiogroup"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[aria-haspopup="listbox"]',
    '[aria-controls]',
    '[aria-owns]',
    '[contenteditable="true"]'
  ].join(', ');
  const ADDRESS_COMBO_TRIGGER_SELECTOR = [
    'select',
    '[role="combobox"]',
    'button[aria-haspopup="listbox"]',
    '[aria-haspopup="listbox"][role="button"]',
    'button[aria-controls]',
    '[aria-controls][role="button"]',
    'button[aria-owns]',
    '[aria-owns][role="button"]'
  ].join(', ');
  const ADDRESS_SCOPE_HINT_RE = /(地址|住址|通訊地址|通讯地址|聯絡地址|联系地址|address|省份|城市|区县|區縣|地區|地区|區域|区域|province|city|district|region|area|county)/i;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normText(text) {
    return (utils.normText || ((x) => String(x || '').trim()))(text);
  }

  function getFillRunId(settings = {}) {
    return normText(settings?.fillRunId || settings?.runId || settings?.__fillRunId || '');
  }

  function isFillRunCancelled(settings = {}) {
    const runId = getFillRunId(settings);
    if (!runId) return false;
    const checker = typeof utils.isFillRunCancelled === 'function'
      ? utils.isFillRunCancelled
      : window.FormPilotV2Utils?.isFillRunCancelled;
    if (typeof checker !== 'function') return false;
    try {
      return checker(runId) === true;
    } catch {
      return false;
    }
  }

  function buildFillCancelledResult(settings = {}, detail = [], applied = 0, failed = 0, context = {}) {
    const result = {
      ok: false,
      cancelled: true,
      runId: getFillRunId(settings),
      error: '本次填充已停止',
      applied,
      failed,
      detail
    };
    publishFillSnapshot({
      at: Date.now(),
      total: Number(context.total || detail.length || 0),
      applied,
      failed,
      scopeSelector: context.scopeSelector || '',
      strictScope: !!context.strictScope,
      cancelled: true,
      detail
    });
    return result;
  }

  function isLikelyHtml(value = '') {
    return /<\s*\/?\s*[a-zA-Z][\w:-]*(?:\s+[^>]*)?>/.test(String(value || ''));
  }

  function sanitizeRichTextStyle(styleText = '') {
    const allowed = new Set(['color', 'background-color', 'font-weight', 'font-style', 'text-decoration']);
    return String(styleText || '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const idx = item.indexOf(':');
        if (idx <= 0) return '';
        const prop = item.slice(0, idx).trim().toLowerCase();
        const value = item.slice(idx + 1).trim();
        if (!allowed.has(prop)) return '';
        if (/expression\s*\(|url\s*\(|javascript\s*:/i.test(value)) return '';
        return `${prop}: ${value}`;
      })
      .filter(Boolean)
      .join('; ');
  }

  function sanitizeRichTextHtml(html = '') {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const forbidden = new Set(['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link']);
    const nodes = Array.from(template.content.querySelectorAll('*'));
    for (const node of nodes) {
      const tag = (node.tagName || '').toLowerCase();
      if (forbidden.has(tag)) {
        node.remove();
        continue;
      }
      for (const attr of Array.from(node.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value || '';
        if (name.startsWith('on')) {
          node.removeAttribute(attr.name);
          continue;
        }
        if ((name === 'href' || name === 'src' || name === 'xlink:href') && /javascript\s*:/i.test(value)) {
          node.removeAttribute(attr.name);
          continue;
        }
        if (name === 'style') {
          const safeStyle = sanitizeRichTextStyle(value);
          if (safeStyle) node.setAttribute('style', safeStyle);
          else node.removeAttribute('style');
        }
      }
    }
    return template.innerHTML.trim();
  }

  function richTextHtmlToText(html = '') {
    if (!isLikelyHtml(html)) return normText(html);
    const holder = document.createElement('div');
    holder.innerHTML = sanitizeRichTextHtml(html);
    return normText(holder.textContent || '');
  }

  function visible(el) {
    return (utils.visible || ((x) => !!x))(el);
  }

  function isDebugEnabled(settings = {}) {
    return settings?.debugLogs !== false;
  }

  function debugLog(settings = {}, ...args) {
    if (!isDebugEnabled(settings)) return;
    try {
      console.log('[FormPilot][Fill]', ...args);
    } catch {
      // ignore
    }
  }

  function readElementDisplayValue(el) {
    if (!(el instanceof Element)) return '';
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return normText(el.value || '');
    }
    if (el.isContentEditable) return normText(el.textContent || '');
    return normText(el.textContent || el.getAttribute('aria-label') || '');
  }

  function verifyTextLikeValue(el, expectedValue) {
    const expected = isLikelyHtml(expectedValue) ? richTextHtmlToText(expectedValue) : normText(expectedValue);
    if (!expected) return true;
    const actual = readElementDisplayValue(el);
    if (!actual) return false;
    return actual === expected || actual.includes(expected) || expected.includes(actual);
  }

  function normalizeChoiceText(text) {
    return normText(text)
      .replace(/\s+/g, '')
      .replace(/[()（）【】\[\]{}<>《》"'“”‘’`~·•、，,。.:：;；/\\_-]/g, '')
      .toLowerCase();
  }

  function normalizeAreaChoiceText(text) {
    return normalizeChoiceText(text).replace(/(省|市|区|县|州|盟|自治区|特别行政区|地區|地区)$/g, '');
  }

  function buildTextVariants(text) {
    const raw = normText(text);
    if (!raw) return [];
    return Array.from(
      new Set([
        raw,
        raw.replace(/\s+/g, ''),
        normalizeChoiceText(raw),
        normalizeAreaChoiceText(raw)
      ])
    ).filter(Boolean);
  }

  function flattenChoiceValue(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap((item) => flattenChoiceValue(item));
    if (typeof value === 'object') {
      return flattenChoiceValue([
        value.value,
        value.label,
        value.text,
        value.selectedText,
        value.name,
        value.index,
        ...(Array.isArray(value.values) ? value.values : []),
        ...(Array.isArray(value.labels) ? value.labels : []),
        ...(Array.isArray(value.texts) ? value.texts : []),
        ...(Array.isArray(value.indices) ? value.indices : [])
      ]);
    }
    const text = normText(value);
    return text ? [text] : [];
  }

  function pickRandomChoice(items = []) {
    const available = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)] || null;
  }

  const FILE_CATEGORY_ORDER = ['document', 'image', 'video', 'audio', 'archive'];

  function inferStoredFileCategory(file = {}) {
    const mime = String(file.mimeType || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|ico|heic)$/.test(name)) return 'image';
    if (mime.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|wmv|m4v)$/.test(name)) return 'video';
    if (mime.startsWith('audio/') || /\.(mp3|wav|aac|m4a|flac|ogg|wma)$/.test(name)) return 'audio';
    if (/zip|rar|7z|tar|gzip|compressed|x-zip|x-rar/i.test(mime) || /\.(zip|rar|7z|tar|gz|bz2)$/.test(name)) return 'archive';
    return 'document';
  }

  function inferFileCategoryFromTarget(el, field = {}) {
    const accept = String(el?.getAttribute?.('accept') || el?.accept || '').toLowerCase();
    const hint = `${field.label || ''} ${field.placeholder || ''} ${field.context || ''} ${field.selector || ''}`.toLowerCase();
    const text = `${accept} ${hint}`;
    if (/image|\.(png|jpe?g|gif|webp|bmp|svg|heic)|图片|照片|相片|图像|圖像/.test(text)) return 'image';
    if (/video|\.(mp4|mov|avi|mkv|webm|wmv)|视频|影片|視頻/.test(text)) return 'video';
    if (/audio|\.(mp3|wav|aac|m4a|flac|ogg)|音频|音訊|录音|錄音/.test(text)) return 'audio';
    if (/zip|rar|7z|tar|gzip|compressed|压缩|壓縮|压缩包|壓縮包/.test(text)) return 'archive';
    if (/pdf|word|excel|powerpoint|document|doc|docx|xls|xlsx|ppt|pptx|txt|文档|文件|材料|附件|資料|资料/.test(text)) return 'document';
    return '';
  }

  function filterFilesForTarget(files = [], category = '') {
    const available = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!category || !FILE_CATEGORY_ORDER.includes(category)) return available;
    const matched = available.filter((file) => String(file.category || '').trim() === category || inferStoredFileCategory(file) === category);
    return matched.length ? matched : available;
  }

  function randomInt(min = 1, max = 9) {
    const low = Number.isFinite(Number(min)) ? Number(min) : 1;
    const high = Number.isFinite(Number(max)) ? Number(max) : low;
    const start = Math.min(low, high);
    const end = Math.max(low, high);
    return Math.floor(Math.random() * (end - start + 1)) + start;
  }

  function toFiniteNumber(input) {
    if (input == null) return null;
    if (typeof input === 'string' && input.trim() === '') return null;
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
  }

  function parseYmdDate(value = '') {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function formatYmdDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function toStartOfDay(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function shiftCalendarMonths(date, amount = 0) {
    const source = toStartOfDay(date);
    if (!source) return null;
    const shifted = new Date(source.getFullYear(), source.getMonth() + Number(amount || 0), 1);
    const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
    shifted.setDate(Math.min(source.getDate(), lastDay));
    return shifted;
  }

  function getHalfYearDateWindow(referenceDate = new Date()) {
    const today = toStartOfDay(referenceDate) || toStartOfDay(new Date());
    return {
      min: shiftCalendarMonths(today, -6),
      max: shiftCalendarMonths(today, 6),
      today
    };
  }

  function normalizeDateCollectType(field = {}) {
    const explicit = String(field?.meta?.dateCollectType || field?.meta?.collectType || field?.collectType || '').toLowerCase();
    if (['ymd', 'ym', 'md'].includes(explicit)) return explicit;
    const roles = Array.isArray(field?.meta?.segmentRoles) ? field.meta.segmentRoles : [];
    if (roles.includes('year')) return roles.includes('day') ? 'ymd' : 'ym';
    if (roles.includes('month') && roles.includes('day')) return 'md';
    return 'ymd';
  }

  function parseDateForCollectType(value = '', collectType = 'ymd', referenceDate = new Date()) {
    const raw = String(value || '').trim();
    const fullDate = parseYmdDate(raw);
    if (fullDate) return fullDate;
    const reference = toStartOfDay(referenceDate) || toStartOfDay(new Date());

    if (collectType === 'ym') {
      const match = raw.match(/^(\d{4})[-/.](\d{1,2})$/);
      if (!match) return null;
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (month < 1 || month > 12) return null;
      const lastDay = new Date(year, month, 0).getDate();
      return toStartOfDay(new Date(year, month - 1, Math.min(reference.getDate(), lastDay)));
    }

    if (collectType === 'md') {
      const match = raw.match(/^(\d{1,2})[-/.](\d{1,2})$/);
      if (!match) return null;
      const month = Number(match[1]);
      const day = Number(match[2]);
      const { min, max } = getHalfYearDateWindow(reference);
      const candidates = [reference.getFullYear() - 1, reference.getFullYear(), reference.getFullYear() + 1]
        .map((year) => new Date(year, month - 1, day))
        .filter((date) => date.getMonth() === month - 1 && date.getDate() === day)
        .map(toStartOfDay)
        .filter((date) => date && date.getTime() >= min.getTime() && date.getTime() <= max.getTime())
        .sort((a, b) => Math.abs(a.getTime() - reference.getTime()) - Math.abs(b.getTime() - reference.getTime()));
      return candidates[0] || null;
    }
    return null;
  }

  function clampDateToBounds(date, minDate, maxDate) {
    let next = toStartOfDay(date);
    if (!next) return null;
    if (minDate && next.getTime() < minDate.getTime()) next = new Date(minDate);
    if (maxDate && next.getTime() > maxDate.getTime()) next = new Date(maxDate);
    return next;
  }

  function inferNumericLikeConstraint(el, constraints = {}) {
    if (!(el instanceof Element)) return false;
    const tag = (el.tagName || '').toLowerCase();
    const type = String(el.getAttribute('type') || '').toLowerCase();
    const role = String(el.getAttribute('role') || '').toLowerCase();
    const inputmode = String(el.getAttribute('inputmode') || '').toLowerCase();
    const pattern = String(el.getAttribute('pattern') || '').trim();
    const classText = String(el.getAttribute('class') || '').toLowerCase();
    if (type === 'number' || type === 'range') return true;
    if (role === 'spinbutton') return true;
    if (inputmode === 'numeric' || inputmode === 'decimal' || inputmode === 'tel') return true;
    if (el.hasAttribute('aria-valuemin') || el.hasAttribute('aria-valuemax')) return true;
    if (constraints?.numericLike) return true;
    if (String(constraints?.inputType || '').toLowerCase() === 'number') return true;
    if (/input-number|number-input|arco-input-number|ant-input-number/.test(classText)) return true;
    if (pattern && tag === 'input') {
      const normalized = pattern.replace(/^\^|\$$/g, '');
      if (/\\d|\[0-9]/.test(normalized) && !/[a-z]/i.test(normalized.replace(/\\d/g, ''))) {
        return true;
      }
    }
    return false;
  }

  function buildNumericValueByHint(hintText = '', maxLength = 0) {
    const hint = normText(hintText).toLowerCase();
    let value = '1';
    if (/百分|percent|rate|比例|佔比|占比/.test(hint)) value = String(randomInt(1, 100));
    else if (/次數|次数|count|num|qty|數量|数量|分數|分数|score/.test(hint)) value = String(randomInt(1, 60));
    else if (/金額|金额|amount|budget|expense|income|revenue|price/.test(hint)) value = String(randomInt(1000, 200000));
    else if (/人數|人数|headcount|staff|employee/.test(hint)) value = String(randomInt(1, 999));
    else value = String(randomInt(1, 9999));
    if (maxLength > 0) return value.slice(0, maxLength) || '1';
    return value;
  }

  function isBankCardHintText(hintText = '') {
    const hint = String(hintText || '');
    if (/(身份证|身份證|身份証|身分證|身分証|证件|證件|護照|护照|id\s*card|idcard|identity\s*(document|card)|identification|passport|document\s*(number|no\.?))/i.test(hint)) return false;
    return /(银行卡|銀行卡|银行卡号|銀行卡號|银行账号|銀行賬號|银行账户|銀行賬戶|储蓄卡|儲蓄卡|借记卡|借記卡|debit\s*card|bank\s*(card|account|acct)|card\s*(number|no\.?))/i.test(hint);
  }

  function normalizeByInputConstraint(el, rawValue = '', hintText = '', constraints = {}) {
    if (!(el instanceof Element)) return normText(rawValue);
    const tag = (el.tagName || '').toLowerCase();
    const type = String(constraints?.inputType || el.getAttribute('type') || '').toLowerCase();
    const pattern = String(constraints?.pattern || el.getAttribute('pattern') || '').trim();
    const maxLength = Number(constraints?.maxLength || el.getAttribute('maxlength') || 0);
    const minLength = Number(constraints?.minLength || el.getAttribute('minlength') || 0);
    let value = normText(rawValue);
    const hint = `${hintText} ${constraints?.hintText || ''} ${constraints?.type || ''} ${constraints?.kind || ''} ${constraints?.fieldKind || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('title') || ''}`;
    if (inferNumericLikeConstraint(el, constraints)) {
      if (isBankCardHintText(hint)) {
        let cardNo = value.replace(/\D/g, '');
        if (!cardNo) cardNo = '6222021000011000014';
        if (maxLength > 0) cardNo = cardNo.slice(0, maxLength) || '6222021000011000014'.slice(0, maxLength);
        return cardNo;
      }
      let numeric = value.replace(/[^\d.-]/g, '');
      const decimalAllowed = /decimal|\./i.test(String(constraints?.inputMode || el.getAttribute('inputmode') || '')) || /(\.\d+|\[0-9]\.[0-9])/i.test(pattern);
      if (!decimalAllowed) numeric = numeric.replace(/\./g, '');
      if (!numeric || numeric === '-' || numeric === '.' || numeric === '-.') {
        numeric = buildNumericValueByHint(hint, maxLength > 0 ? maxLength : 0);
      }
      if (maxLength > 0) numeric = numeric.slice(0, maxLength) || '1';
      const min = toFiniteNumber(constraints?.minNumber ?? constraints?.min) ?? toFiniteNumber(el.getAttribute('aria-valuemin'));
      const max = toFiniteNumber(constraints?.maxNumber ?? constraints?.max) ?? toFiniteNumber(el.getAttribute('aria-valuemax'));
      const asNum = Number(numeric);
      if (Number.isFinite(asNum)) {
        let clamped = asNum;
        if (Number.isFinite(min)) clamped = Math.max(min, clamped);
        if (Number.isFinite(max)) clamped = Math.min(max, clamped);
        numeric = Number.isInteger(clamped) ? String(Math.trunc(clamped)) : String(clamped);
      }
      if (minLength > 0 && numeric.length < minLength) {
        numeric = `${numeric}${String(randomInt(0, 9)).repeat(Math.max(0, minLength - numeric.length))}`;
      }
      return numeric || '1';
    }

    const dateLike = type === 'date' || !!constraints?.dateLike || /日期|date|成立|birthday|birth/.test(hint);
    if (dateLike) {
      let dt = parseYmdDate(value);
      const minDate = parseYmdDate(String(constraints?.min || el.getAttribute('min') || ''));
      const maxDate = parseYmdDate(String(constraints?.max || el.getAttribute('max') || ''));
      const halfYearWindow = getHalfYearDateWindow();
      const lowerBound = minDate && minDate.getTime() > halfYearWindow.min.getTime() ? minDate : halfYearWindow.min;
      const upperBound = maxDate && maxDate.getTime() < halfYearWindow.max.getTime() ? maxDate : halfYearWindow.max;
      if (lowerBound.getTime() > upperBound.getTime()) return value;
      if (!dt) {
        dt = clampDateToBounds(new Date(), lowerBound, upperBound);
      }
      dt = clampDateToBounds(dt, lowerBound, upperBound);
      return formatYmdDate(dt) || value;
    }

    if (type === 'email') {
      if (!/@/.test(value)) {
        return `qa_${Date.now().toString().slice(-6)}@example.com`;
      }
      return value;
    }

    if (type === 'url') {
      if (!/^https?:\/\//i.test(value)) {
        return 'https://www.communitybridge.hk';
      }
      return value;
    }

    if (pattern) {
      if (/^\^?\\d[\d\\\[\]\{\}\+\*\?\.\^\$-]*\$?$/.test(pattern) || /\\d|\[0-9]/.test(pattern)) {
        const digits = (value.replace(/[^\d]/g, '') || buildNumericValueByHint(hint, maxLength > 0 ? maxLength : 0));
        return maxLength > 0 ? digits.slice(0, maxLength) || '1' : digits;
      }
      if (/\[a-z0-9\]/i.test(pattern)) {
        const alnum = (value.replace(/[^a-z0-9]/gi, '') || `A${randomInt(1000, 9999)}`);
        return maxLength > 0 ? alnum.slice(0, maxLength) : alnum;
      }
    }

    if (maxLength > 0 && value.length > maxLength) {
      value = value.slice(0, maxLength);
    }
    if (minLength > 0 && value.length > 0 && value.length < minLength) {
      value = value.padEnd(minLength, '0');
    }
    if (!value && tag === 'textarea') {
      return '补充说明：由系统自动生成。';
    }
    return value;
  }

  function fillCompanionInputElement(el, hintText = '', constraints = {}) {
    if (!(el instanceof Element) || el.disabled) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') return false;
    const type = String(el.getAttribute('type') || '').toLowerCase();
    if (['checkbox', 'radio', 'hidden', 'file'].includes(type)) return false;
    const next = normalizeByInputConstraint(el, '', hintText, constraints);
    if (!next) return false;
    setNativeValue(el, next);
    return verifyTextLikeValue(el, next);
  }

  function queryOne(root, selector) {
    if (!root || !selector) return null;
    try {
      if (root instanceof Element && root.matches(selector)) return root;
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function queryAll(root, selector) {
    if (!root || !selector) return [];
    try {
      const result = [];
      if (root instanceof Element && root.matches(selector)) result.push(root);
      result.push(...Array.from(root.querySelectorAll(selector)));
      return result;
    } catch {
      return [];
    }
  }

  function collectOptionTexts(node) {
    const values = [
      node?.textContent || '',
      node?.getAttribute?.('aria-label') || '',
      node?.getAttribute?.('title') || '',
      node?.getAttribute?.('data-label') || '',
      node?.getAttribute?.('data-value') || '',
      node?.getAttribute?.('value') || '',
      node?.getAttribute?.('aria-valuetext') || ''
    ];

    if (node?.dataset) {
      values.push(node.dataset.label || '', node.dataset.value || '', node.dataset.text || '', node.dataset.title || '');
    }

    return Array.from(new Set(values.map((item) => normText(item)).filter(Boolean)));
  }

  const EDITOR_TOOLBAR_SELECTOR = [
    '[role="toolbar"]',
    '.ql-toolbar',
    '.tox-toolbar',
    '.ck-toolbar',
    '.fr-toolbar',
    '.w-e-toolbar',
    '.vditor-toolbar',
    '.bytemd-toolbar',
    '.editor-toolbar',
    '.form-editor-toolbar',
    '.rich-text-toolbar',
    '.editor-config',
    '.editor-settings',
    '.editor-actions'
  ].join(', ');

  const EDITOR_CONTROL_HINT_RE = /(加粗|粗体|斜体|下划线|删除线|字号|字体|字体大小|颜色|背景|对齐|缩进|列表|项目符号|编号|插入|链接|图片|表格|代码|预览|全屏|源码|html|撤销|重做|清除格式|清空|format|toolbar|editor|rich\s*text|wysiwyg)/i;

  function inferAddressSlot(text, fallback = '') {
    const hint = normText(text);
    if (!hint) return fallback || '';
    if (/(室\s*[／/]\s*樓\s*[／/]\s*大廈|室\/樓\/大廈|room\s*\/\s*floor\s*\/\s*block|flat\s*\/\s*floor\s*\/\s*block)/i.test(hint)) return 'roomFloorBuilding';
    if (/(街號及街名|街号及街名|street\s*no\s*(and|&)\s*street\s*name)/i.test(hint)) return 'street';
    if (/(省|province|state|自治区|特别行政区|country|國家|国家)/i.test(hint)) return 'province';
    if (/(市|city|town|municipality|prefecture|州|盟)/i.test(hint)) return 'city';
    if (/(区县|地区|地區|区域|區域|district|region|area|county|borough|ward|區|区|县|旗)/i.test(hint)) return 'district';
    if (/(街號|街号|门牌|門牌|门号|門號|house\s*no|street\s*no|street\s*number|road\s*no|number|no\.?)/i.test(hint)) return 'streetNo';
    if (/(街名|路名|street\s*name|road\s*name|street|road|avenue|lane|boulevard|巷|弄|道)/i.test(hint)) return 'streetName';
    if (/(楼|樓|building|tower|block|大廈|大厦|座|栋|棟)/i.test(hint)) return 'building';
    if (/(室|room|suite|unit|flat|floor|层|層|樓層|楼层)/i.test(hint)) return /floor|层|層/i.test(hint) ? 'floor' : 'room';
    if (/(详细|詳細|detail|address)/i.test(hint)) return 'detail';
    return fallback || '';
  }

  function splitStreetValue(text) {
    const raw = normText(text);
    if (!raw) return { streetName: '', streetNo: '' };
    const match = raw.match(/^(.*?)(\d+号)$/);
    if (match) {
      return {
        streetName: normText(match[1]),
        streetNo: normText(match[2])
      };
    }
    const alt = raw.match(/^(.*?)(\d+)(?:号)?$/);
    if (alt) {
      return {
        streetName: normText(alt[1]),
        streetNo: `${alt[2]}号`
      };
    }
    return {
      streetName: raw,
      streetNo: ''
    };
  }

  function splitFloorRoom(text) {
    const raw = normText(text);
    if (!raw) return { floor: '', room: '' };
    const match = raw.match(/(?:(\d+)\s*[层樓楼])?\s*(\d+\s*室)?/);
    if (!match) return { floor: '', room: raw };
    return {
      floor: normText(match[1] ? `${match[1]}层` : ''),
      room: normText(match[2] || (match[1] ? '' : raw))
    };
  }

  function parseAddressPartsFromText(text = '') {
    const source = normText(text);
    const result = { province: '', city: '', district: '', detail: source };
    if (!source) return result;

    let rest = source;
    const specialRegionMatch = rest.match(/^(香港|香港特别行政区|香港特別行政區|澳门|澳門|澳门特别行政区|澳門特別行政區)/);
    if (specialRegionMatch) {
      const region = /澳|澳门|澳門/.test(specialRegionMatch[1]) ? '澳门' : '香港';
      result.province = region;
      result.city = region;
      rest = rest.slice(specialRegionMatch[0].length);
    } else {
      const municipalityMatch = rest.match(/^(北京市|上海市|天津市|重庆市|重慶市)/);
      if (municipalityMatch) {
        result.province = municipalityMatch[1];
        result.city = municipalityMatch[1];
        rest = rest.slice(municipalityMatch[0].length);
      } else {
        const provinceMatch = rest.match(/^(.{2,24}?(?:省|自治区|自治區|特别行政区|特別行政區))/);
        if (provinceMatch) {
          result.province = provinceMatch[1];
          rest = rest.slice(provinceMatch[0].length);
        }
      }
    }

    if (!result.city) {
      const cityMatch = rest.match(/^(.{2,24}?(?:市|自治州|地区|地區|盟|州))/);
      if (cityMatch) {
        result.city = cityMatch[1];
        rest = rest.slice(cityMatch[0].length);
      }
    }

    const districtMatch = rest.match(/^(.{2,24}?(?:新区|新區|区|區|县|縣|旗))/);
    if (districtMatch) {
      result.district = districtMatch[1];
      rest = rest.slice(districtMatch[0].length);
    }

    result.detail = normText(rest) || source;
    return result;
  }

  function parseAddressValue(value) {
    const base = {
      province: '',
      city: '',
      district: '',
      street: '',
      streetName: '',
      streetNo: '',
      building: '',
      floor: '',
      room: '',
      detail: '',
      full: ''
    };

    if (value && typeof value === 'object') {
      base.province = normText(value.province || value.state || value.region || '');
      base.city = normText(value.city || '');
      base.district = normText(value.district || value.area || value.county || '');
      base.street = normText(value.street || value.road || '');
      base.streetName = normText(value.streetName || value.roadName || '');
      base.streetNo = normText(value.streetNo || value.houseNo || value.number || '');
      base.building = normText(value.building || value.block || value.tower || '');
      base.floor = normText(value.floor || '');
      base.room = normText(value.room || value.unit || value.suite || '');
      base.detail = normText(value.detail || value.address || value.addressLine || '');
      base.full = normText(value.full || value.fullAddress || '');
    } else {
      const text = normText(value);
      base.detail = text;
      base.full = text;
    }

    const parsedParts = parseAddressPartsFromText(base.full || base.detail || '');
    if (!base.province) base.province = parsedParts.province;
    if (!base.city) base.city = parsedParts.city;
    if (!base.district) base.district = parsedParts.district;
    if (parsedParts.detail && parsedParts.detail !== (base.full || base.detail)) {
      base.detail = base.detail && base.detail !== base.full ? base.detail : parsedParts.detail;
    }

    if (!base.street && base.detail) {
      const streetMatch = base.detail.match(/(.*?(?:街|路|道|巷|弄|lane|road|street|avenue)[^,\s，。]*)/i);
      if (streetMatch) base.street = normText(streetMatch[1]);
    }

    if (base.street && (!base.streetName || !base.streetNo)) {
      const split = splitStreetValue(base.street);
      if (!base.streetName) base.streetName = split.streetName;
      if (!base.streetNo) base.streetNo = split.streetNo;
    }

    if (!base.building && base.detail) {
      const buildingMatch = base.detail.match(/(\d+号楼|[一二三四五六七八九十百千]+号楼|[A-Za-z]+座|[A-Za-z]+栋|[A-Za-z]+樓|[A-Za-z]+楼)/);
      if (buildingMatch) base.building = normText(buildingMatch[1]);
    }

    if (!base.floor && base.room) {
      const split = splitFloorRoom(base.room);
      if (split.floor) base.floor = split.floor;
      if (split.room) base.room = split.room;
    }

    if (!base.room && base.detail) {
      const roomMatch = base.detail.match(/(\d+层\d+室|\d+室|\d+层|[一二三四五六七八九十百千]+层[一二三四五六七八九十百千]+室)/);
      if (roomMatch) {
        const split = splitFloorRoom(roomMatch[1]);
        base.floor = base.floor || split.floor;
        base.room = split.room || normText(roomMatch[1]);
      }
    }

    if (!base.street && base.full) {
      const split = splitStreetValue(base.full);
      if (split.streetName && split.streetName !== base.full) {
        base.street = split.streetName + split.streetNo;
        if (!base.streetName) base.streetName = split.streetName;
        if (!base.streetNo) base.streetNo = split.streetNo;
      }
    }

    return base;
  }

  function pickAddressValue(addr, slot, fallbackText = '') {
    const normalizedSlot = inferAddressSlot(slot, '');
    switch (normalizedSlot) {
      case 'province':
        return addr.province || '';
      case 'city':
        return addr.city || '';
      case 'district':
        return addr.district || '';
      case 'street':
        return addr.street || `${addr.streetNo || ''}${addr.streetName || ''}` || '';
      case 'streetName':
        return addr.streetName || splitStreetValue(addr.street || '').streetName || '';
      case 'streetNo':
        return addr.streetNo || splitStreetValue(addr.street || '').streetNo || '';
      case 'roomFloorBuilding':
        return `${addr.building || ''}${addr.floor || ''}${addr.room || ''}` || addr.detail || '';
      case 'building':
        return addr.building || '';
      case 'floor':
        return addr.floor || '';
      case 'room':
        return addr.room || '';
      case 'detail':
        return addr.detail || addr.full || '';
      default:
        return fallbackText || '';
    }
  }

  function isEditorToolbarElement(el) {
    return !!(el && (el.closest(EDITOR_TOOLBAR_SELECTOR) || EDITOR_CONTROL_HINT_RE.test(normText(`${el.textContent || ''} ${el.getAttribute?.('aria-label') || ''} ${el.getAttribute?.('title') || ''}`))));
  }

  function scoreElementMatch(el, field) {
    if (!el || !(el instanceof Element)) return -Infinity;
    if (isEditorToolbarElement(el)) return -Infinity;
    let score = 0;
    const tag = (el.tagName || '').toLowerCase();
    const role = normText(el.getAttribute('role') || '');
    const aria = normText(el.getAttribute('aria-label') || '');
    const placeholder = normText(el.getAttribute('placeholder') || '');
    const title = normText(el.getAttribute('title') || '');
    const text = normText(el.textContent || '');
    const context = normText(el.closest('form, fieldset, [role="group"], [role="radiogroup"], .form-field, .form-item, .el-form-item, .ant-form-item, .fb-form-field, .fb-form-item, .fb-runtime-input-field, .fb-form-fields > *')?.innerText || '');
    const fieldLabel = normText(field?.label || '');
    const fieldPlaceholder = normText(field?.placeholder || '');
    const fieldContext = normText(field?.context || '');
    const sectionHint = normText(field?.meta?.sectionHint || '');

    if (field?.domId && el.getAttribute(EID_ATTR) === field.domId) return 1000;
    if (fieldLabel && [aria, placeholder, title, text, context].some((value) => value && value.includes(fieldLabel))) score += 8;
    if (fieldPlaceholder && [aria, placeholder, title, text, context].some((value) => value && value.includes(fieldPlaceholder))) score += 6;
    if (fieldContext && context && (context.includes(fieldContext.slice(0, 40)) || fieldContext.includes(context.slice(0, 40)))) score += 4;
    if (sectionHint && context && context.includes(sectionHint)) score += 4;
    if (Array.isArray(field?.meta?.comboboxRoles) && field.meta.comboboxRoles.length && field.kind === 'addressComponent') score += 2;
    if (Array.isArray(field?.meta?.segmentRoles) && field.meta.segmentRoles.length && field.meta.segmented) score += 2;
    if (tag === 'select' || role === 'combobox' || role === 'listbox') score += 3;
    if (field?.kind === 'select' && (role === 'button' || el.getAttribute('aria-haspopup') === 'listbox' || el.getAttribute('aria-controls') || el.getAttribute('aria-owns'))) score += 3;
    if (el.closest(EDITOR_TOOLBAR_SELECTOR)) score -= 12;
    return score;
  }

  function autoRoot() {
    if (window.FormPilotV2Scan?.autoDetectRoot) return window.FormPilotV2Scan.autoDetectRoot();
    return document.body;
  }

  function findRoot(scopeSelector = '') {
    if (scopeSelector) {
      const scoped = document.querySelector(scopeSelector);
      if (scoped) return scoped;
    }
    return autoRoot();
  }

  function inRoot(root, el) {
    if (!root || !el) return false;
    return root === el || root.contains(el);
  }

  function pickVisibleFirst(candidates = []) {
    if (!Array.isArray(candidates) || !candidates.length) return null;
    return candidates.find((node) => visible(node)) || candidates[0] || null;
  }

  function findByDomId(domId, root, strictScope) {
    if (!domId) return null;
    const inScoped = pickVisibleFirst(queryAll(root, `[${EID_ATTR}="${domId}"]`));
    if (inScoped) return inScoped;
    if (strictScope) return null;
    return pickVisibleFirst(queryAll(document, `[${EID_ATTR}="${domId}"]`));
  }

  function collectContainerCandidates(field = {}) {
    const selectors = [];
    const seen = new Set();
    const push = (selector) => {
      const normalized = normText(selector);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      selectors.push(normalized);
    };

    push(field.containerSelector);
    push(field?.meta?.stableContainerSelector);
    if (Array.isArray(field?.meta?.containerLocatorCandidates)) {
      for (const selector of field.meta.containerLocatorCandidates) push(selector);
    }
    return selectors;
  }

  function findContainerNode(field, root, strictScope = false) {
    const containerCandidates = collectContainerCandidates(field);
    if (!containerCandidates.length) return null;
    for (const selector of containerCandidates) {
      const inScoped = queryOne(root, selector);
      if (inScoped) return inScoped;
    }
    if (strictScope) return null;
    for (const selector of containerCandidates) {
      const inDoc = queryOne(document, selector);
      if (inDoc) return inDoc;
    }
    return null;
  }

  function isExcludedElement(el, excludeElements) {
    return !!(el && excludeElements instanceof Set && excludeElements.has(el));
  }

  function collectLocatorCandidates(field = {}) {
    const candidates = [];
    const seen = new Set();
    const push = (selector) => {
      const normalized = normText(selector);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    };

    push(field.selector);
    push(field?.meta?.stableSelector);

    const fromMeta = Array.isArray(field?.meta?.locatorCandidates)
      ? field.meta.locatorCandidates
      : [];
    for (const selector of fromMeta) push(selector);

    return candidates;
  }

  function buildAnchoredLocatorCandidates(field = {}) {
    const locatorCandidates = collectLocatorCandidates(field);
    const containerCandidates = collectContainerCandidates(field);
    if (!locatorCandidates.length || !containerCandidates.length) return [];
    const merged = [];
    const seen = new Set();
    const push = (selector) => {
      const normalized = normText(selector);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      merged.push(normalized);
    };
    for (const containerSelector of containerCandidates) {
      for (const locatorSelector of locatorCandidates) {
        if (locatorSelector.startsWith('#')) continue;
        push(`${containerSelector} ${locatorSelector}`);
      }
    }
    return merged;
  }

  function pickBestCandidate(candidates = [], field, excludeElements) {
    const allowInvisible = field?.kind === 'file';
    const filtered = candidates.filter((candidate) => {
      if (isExcludedElement(candidate, excludeElements)) return false;
      if (allowInvisible) return true;
      return visible(candidate);
    });
    if (!filtered.length) return null;
    if (!(field?.label || field?.placeholder || field?.context)) return filtered[0] || null;
    let best = null;
    let bestScore = -Infinity;
    for (const candidate of filtered) {
      const score = scoreElementMatch(candidate, field);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return bestScore > -Infinity ? best : filtered[0] || null;
  }

  function findElement(field, root, strictScope = false, options = {}) {
    const excludeElements = options?.excludeElements instanceof Set ? options.excludeElements : null;
    const locatorCandidates = collectLocatorCandidates(field);
    let target = findByDomId(field.domId, root, strictScope);
    if (target && !isExcludedElement(target, excludeElements)) return target;

    // 同一个页面中可能存在多个相同 placeholder/selector，优先利用容器候选缩小范围。
    const containerCandidates = collectContainerCandidates(field);
    if (containerCandidates.length) {
      const tryFindInContainer = (scopeRoot) => {
        try {
          for (const containerSelector of containerCandidates) {
            const containers = queryAll(scopeRoot, containerSelector);
            for (const container of containers) {
              if (!(container instanceof Element)) continue;
              for (const selector of locatorCandidates) {
                const hit = pickBestCandidate(queryAll(container, selector), field, excludeElements);
                if (hit) return hit;
              }
              const direct = field.domId ? queryOne(container, `[${EID_ATTR}="${field.domId}"]`) : null;
              if (direct && !isExcludedElement(direct, excludeElements)) return direct;
            }
          }
        } catch {
          return null;
        }
        return null;
      };
      target = tryFindInContainer(root);
      if (target) return target;
      if (!strictScope) {
        target = tryFindInContainer(document);
        if (target) return target;
      }
    }

    if (locatorCandidates.length) {
      for (const selector of locatorCandidates) {
        try {
          target = pickBestCandidate(queryAll(root, selector), field, excludeElements);
        } catch {
          target = null;
        }
        if (target) return target;
      }

      if (!strictScope) {
        for (const selector of locatorCandidates) {
          try {
            target = pickBestCandidate(queryAll(document, selector), field, excludeElements);
          } catch {
            target = null;
          }
          if (target) break;
        }
      }
      if (target && (!strictScope || inRoot(root, target))) return target;
    }

    const anchoredLocators = buildAnchoredLocatorCandidates(field);
    if (anchoredLocators.length) {
      for (const selector of anchoredLocators) {
        target = pickBestCandidate(queryAll(root, selector), field, excludeElements);
        if (target) return target;
      }
      if (!strictScope) {
        for (const selector of anchoredLocators) {
          target = pickBestCandidate(queryAll(document, selector), field, excludeElements);
          if (target) return target;
        }
      }
    }

    if (field.label || field.placeholder) {
      const candidates = queryAll(root, FIELD_LOCATOR_SELECTOR);
      let best = null;
      let bestScore = -Infinity;
      for (const el of candidates) {
        const score = scoreElementMatch(el, field);
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
      if (best && bestScore > 0 && !isExcludedElement(best, excludeElements)) return best;
    }

    return null;
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor?.set) descriptor.set.call(el, value);
    el.value = value;

    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: String(value), inputType: 'insertText' }));
    } catch {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function collectOpenPanels() {
    return Array.from(
      document.querySelectorAll(
        '[role="listbox"], [role="menu"], [role="tree"], [role="dialog"][data-state="open"], [data-radix-popper-content-wrapper], [id^="reka-select-content"], [id^="reka-popover-content"], .el-select-dropdown, .ant-select-dropdown, .ant-cascader-menus, .arco-select-dropdown, .arco-trigger-popup, .n-base-select-dropdown, .semi-select-dropdown, .t-select__dropdown, .t-select__menu, .rc-select-dropdown, .dropdown-menu, .dropdown__menu, .select-dropdown, [class*="select-dropdown"], [class*="select-popup"], .fb-runtime-cascader-panel, .fb-runtime-cascader-content, .fb-timepicker-container, .mobile-time-picker-panel, .time-picker-panel, [data-headlessui-portal] [role="listbox"]'
      )
    ).filter((x) => visible(x));
  }

  function resolveOptionClickableNode(node) {
    if (!(node instanceof Element)) return null;
    const id = String(node.getAttribute('id') || '');
    if (/^reka-select-item-text-/.test(id)) {
      const itemId = id.replace('-text-', '-');
      const itemNode = document.getElementById(itemId);
      if (itemNode instanceof Element) return itemNode;
    }
    return (
      node.closest(
        '[role="option"], [role="menuitem"], [data-radix-collection-item], [data-radix-vue-collection-item], [data-radix-vue-select-item], [data-reka-collection-item], [data-slot="select-item"], [id^="reka-select-item-"], [data-option], [data-testid*="option"], .el-select-dropdown__item, .ant-select-item-option, .arco-select-option, .n-base-select-option, .semi-select-option, .t-select__option, .fb-runtime-cascader-option, li'
      ) || node
    );
  }

  function collectOptionNodes(panel) {
    const dedup = new Set();
    const result = Array.from(
      panel.querySelectorAll(
        '[role="option"], [role="menuitem"], [role="treeitem"], option, [aria-selected], [data-radix-collection-item], [data-reka-collection-item], [data-slot="select-item"], [data-value], [data-label], [data-option], [data-testid*="option"], [id^="reka-select-item-text-"], .el-select-dropdown__item, .el-select-dropdown__item span, .ant-select-item-option, .ant-select-item-option-content, .arco-select-option, .n-base-select-option, .semi-select-option, .t-select__option, .fb-runtime-cascader-option'
      )
    )
      .filter((x) => visible(x))
      .map((node) => {
        const clickable = resolveOptionClickableNode(node) || node;
        if (dedup.has(clickable)) return null;
        dedup.add(clickable);
        return {
          node: clickable,
          text: normText(clickable.textContent || node.textContent || clickable.getAttribute('aria-label') || clickable.getAttribute('title') || clickable.getAttribute('data-label') || ''),
          value: normText(clickable.getAttribute('data-value') || clickable.getAttribute('value') || clickable.getAttribute('aria-valuetext') || ''),
          aliases: collectOptionTexts(clickable),
          hasPopup: String(clickable.getAttribute('aria-haspopup') || '').toLowerCase()
        };
      })
      .filter(Boolean)
      .filter((x) => x.text && !/暂无数据|無資料|loading|加载中|載入中/i.test(x.text));
    return result;
  }

  function collectGlobalOptionNodes() {
    // 移除无限定的 li / button，这两个选择器会在大页面匹配数千节点，是 CPU 发热主因。
    // 只保留有明确语义的选择器，先在已知开放面板范围内查找，限制扫描范围。
    const openPanels = collectOpenPanels();
    const searchRoot = openPanels.length
      ? openPanels[openPanels.length - 1]
      : document;
    const dedup = new Set();
    return Array.from(
      searchRoot.querySelectorAll(
        '[role="option"], [role="menuitem"], [role="treeitem"], option, [aria-selected], ' +
        '[data-radix-collection-item], [data-reka-collection-item], [data-slot="select-item"], [data-value], [data-label], ' +
        '[data-option], [data-testid*="option"], ' +
        '[id^="reka-select-item-text-"], ' +
        '.el-select-dropdown__item, .el-select-dropdown__item span, ' +
        '.ant-select-item-option, .ant-select-item-option-content, ' +
        '.arco-select-option, .n-base-select-option, .semi-select-option, .t-select__option, .fb-runtime-cascader-option'
      )
    )
      .filter((x) => visible(x))
      .map((node) => {
        const clickable = resolveOptionClickableNode(node) || node;
        if (dedup.has(clickable)) return null;
        dedup.add(clickable);
        return {
          node: clickable,
          text: normText(clickable.textContent || node.textContent || clickable.getAttribute('aria-label') || clickable.getAttribute('title') || clickable.getAttribute('data-label') || ''),
          value: normText(clickable.getAttribute('data-value') || clickable.getAttribute('value') || clickable.getAttribute('aria-valuetext') || ''),
          aliases: collectOptionTexts(clickable),
          hasPopup: String(clickable.getAttribute('aria-haspopup') || '').toLowerCase()
        };
      })
      .filter(Boolean)
      .filter((x) => x.text && !/暂无数据|無資料|loading|加载中|載入中/i.test(x.text));
  }

  function collectCascadeMenuItems(scope = document) {
    return Array.from(scope.querySelectorAll('[role="menuitem"], li[title]'))
      .filter((node) => visible(node))
      .map((node) => ({
        node,
        text: normText(node.textContent || node.getAttribute('title') || node.getAttribute('aria-label') || ''),
        hasPopup: String(node.getAttribute('aria-haspopup') || '').toLowerCase()
      }))
      .filter((item) => item.text && !/暂无数据|無資料|loading|加载中|載入中/i.test(item.text));
  }

  function isCascadeParentItem(item) {
    const popup = String(item?.hasPopup || '').toLowerCase();
    if (popup === 'menu' || popup === 'true') return true;
    const node = item?.node;
    if (!(node instanceof Element)) return false;
    if (node.hasAttribute('aria-expanded') || node.hasAttribute('data-has-children')) return true;
    const classText = String(node.getAttribute('class') || '').toLowerCase();
    if (/has-children|with-children|is-parent|cascader.*parent|cascader.*expand/.test(classText)) return true;
    return !!node.querySelector?.('.lucide-chevron-right, [class*="chevron-right"], [data-cascader-arrow], svg[data-cascader-arrow]');
  }

  function isCascadeLeafItem(item) {
    return !isCascadeParentItem(item);
  }

  function collectCascadeColumns(scope = document) {
    if (!(scope instanceof Element) && scope !== document) return [];
    const root = scope === document ? document : scope;
    const columns = Array.from(
      root.querySelectorAll(
        '.arco-cascader-panel-column, .arco-cascader-list, .ant-cascader-menu, .el-cascader-menu, [data-cascader-column], [role="menu"]'
      )
    ).filter((node) => visible(node));
    const normalized = columns
      .filter((node, idx, list) => !list.some((other, j) => j !== idx && other.contains(node) && visible(other)))
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        if (Math.abs(ra.left - rb.left) > 4) return ra.left - rb.left;
        return ra.top - rb.top;
      });
    return normalized;
  }

  function pickRandom(items = []) {
    if (!Array.isArray(items) || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)] || null;
  }

  function fireOptionClick(node) {
    if (!(node instanceof HTMLElement)) return;
    node.focus?.();
    node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window }));
    node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    node.click();
    node.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
    node.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
  }

  function resolvePanelFromOptionNode(optionNode) {
    if (!(optionNode instanceof Element)) return null;
    return (
      optionNode.closest(
        '[role="listbox"], [role="menu"], [role="tree"], [role="dialog"][data-state="open"], [id^="reka-select-content"], [id^="reka-popover-content"], .arco-select-dropdown, .arco-trigger-popup, .ant-select-dropdown, .el-select-dropdown, .n-base-select-dropdown, .semi-select-dropdown, .t-select__dropdown, .rc-select-dropdown, .dropdown-menu, .dropdown__menu, .select-dropdown, [class*="select-dropdown"], [class*="select-popup"], .fb-runtime-cascader-panel, .fb-runtime-cascader-content, .fb-timepicker-container, .mobile-time-picker-panel, .time-picker-panel'
      ) || null
    );
  }

  function normalizeAreaText(text) {
    return normText(text).replace(/[省市区县]/g, '');
  }

  function optionTextVariants(option) {
    const values = [
      option?.text || '',
      option?.value || '',
      ...(Array.isArray(option?.aliases) ? option.aliases : [])
    ];
    const variants = new Set();
    for (const value of values) {
      for (const variant of buildTextVariants(value)) {
        if (variant) variants.add(variant);
      }
      const area = normalizeAreaText(value);
      if (area) variants.add(normalizeChoiceText(area));
    }
    return Array.from(variants).filter(Boolean);
  }

  function splitCascadeTargetText(targetText = '') {
    return String(targetText || '')
      .split(/\s*(?:\/|>|›|→|\||,|，)\s*/g)
      .map((item) => normText(item))
      .filter(Boolean);
  }

  function cascadeAliasGroup(keywords = [], aliases = []) {
    return { keywords: keywords.map((item) => normalizeChoiceText(item)), aliases };
  }

  function cascadeLevelAliases(part = '', depth = -1) {
    const normalized = normalizeChoiceText(part);
    const groups = [
      cascadeAliasGroup(['defaultRegion', 'option_1'], [
        'defaultRegion',
        'option_1',
        '\u9ed8\u8ba4\u5730\u533a',
        '\u9ed8\u8a8d\u5730\u5340',
        '\u5730\u533a',
        '\u5730\u5340'
      ]),
      cascadeAliasGroup(['defaultMainland', 'option_1_1'], [
        'defaultMainland',
        'option_1_1',
        '\u4e2d\u56fd\u5927\u9646',
        '\u4e2d\u570b\u5927\u9678',
        '\u5927\u9646',
        '\u5927\u9678',
        '\u5185\u5730',
        '\u5167\u5730'
      ]),
      cascadeAliasGroup(['defaultHongKong', 'option_1_2'], [
        'defaultHongKong',
        'option_1_2',
        '\u9999\u6e2f',
        'Hong Kong',
        'HK'
      ])
    ];
    const result = new Set();
    if (part) result.add(part);
    for (const group of groups) {
      if (!normalized) continue;
      if (group.keywords.some((keyword) => keyword && (normalized === keyword || normalized.includes(keyword) || keyword.includes(normalized)))) {
        for (const alias of group.aliases) result.add(alias);
      }
    }
    if (!result.size && depth === 0) {
      for (const alias of groups[0].aliases) result.add(alias);
    }
    return Array.from(result).filter(Boolean);
  }

  function buildCascadeTargetAliases(targetText = '', aliases = []) {
    const result = new Set([targetText, ...aliases].map((item) => normText(item)).filter(Boolean));
    for (const [index, part] of splitCascadeTargetText(targetText).entries()) {
      for (const alias of cascadeLevelAliases(part, index)) result.add(alias);
    }
    return Array.from(result).filter(Boolean);
  }

  function formatCascaderDisplayText(targetText = '') {
    const mapPart = (part = '') => {
      const normalized = normalizeChoiceText(part);
      if (/^(defaultregion|option1)$/.test(normalized)) return '\u9ed8\u8ba4\u5730\u533a';
      if (/^(defaultmainland|option11)$/.test(normalized)) return '\u4e2d\u56fd\u5927\u9646';
      if (/^(defaulthongkong|option12)$/.test(normalized)) return '\u9999\u6e2f';
      return normText(part);
    };
    const parts = splitCascadeTargetText(targetText).map(mapPart).filter(Boolean);
    return parts.length ? parts.join(' / ') : normText(targetText);
  }

  function isGenericOptionDisplayText(text = '') {
    return /^选项\d+$|^選項\d+$|^option\s*\d+$/i.test(normText(text));
  }

  function scoreOptionMatch(targetVariants, optionVariants) {
    let score = 0;
    for (const target of targetVariants) {
      for (const candidate of optionVariants) {
        if (!target || !candidate) continue;
        if (target === candidate) return 100;
        if (normalizeAreaText(target) && normalizeAreaText(target) === normalizeAreaText(candidate)) {
          score = Math.max(score, 96);
          continue;
        }
        if (target.includes(candidate) || candidate.includes(target)) {
          const lengthGap = Math.abs(target.length - candidate.length);
          score = Math.max(score, 82 - Math.min(20, lengthGap));
        }
      }
    }
    return score;
  }

  function chooseOption(options, targetText = '', aliases = []) {
    if (!options.length) return null;

    const targetVariants = Array.from(new Set([targetText, ...aliases].flatMap((item) => buildTextVariants(item))));
    let best = null;
    let bestScore = 0;

    for (const option of options) {
      const score = scoreOptionMatch(targetVariants, optionTextVariants(option));
      if (score > bestScore) {
        bestScore = score;
        best = option;
      }
    }

    if (best && bestScore >= 70) return best;

    return null;
  }

  function pickFallbackOption(options = []) {
    if (!Array.isArray(options) || !options.length) return null;
    const preferred = options.filter((option) => {
      const text = normText(option?.text || option?.value || '');
      return text && !/请选择|請選擇|select|省份|城市|区县|地區|地区|區域|区域/i.test(text) && !isCascadeParentItem(option);
    });
    if (preferred.length) return pickRandom(preferred) || null;
    const leafOnly = options.filter((option) => !isCascadeParentItem(option));
    if (leafOnly.length) return pickRandom(leafOnly) || null;
    return pickRandom(options) || null;
  }

  function isHmtAddressText(text = '') {
    return /(香港|澳門|澳门|台灣|台湾|hong\s*kong|macau|macao|taiwan)/i.test(normText(text));
  }

  function pickAddressFallbackOption(options = [], field = null) {
    const comboIndex = Number(field?.meta?.addressComboIndex ?? -1);
    if (field?.meta?.addressComboLevel === true && comboIndex === 0) {
      const mainlandOptions = options.filter((option) => {
        if (isCascadeParentItem(option)) return false;
        const text = normText(option?.text || option?.value || option?.node?.textContent || '');
        if (!text || isPlaceholderDisplayText(text)) return false;
        if (isHmtAddressText(text)) return false;
        return /(省|市|自治区|自治區|河北|山西|辽宁|遼寧|吉林|黑龙江|黑龍江|江苏|江蘇|浙江|安徽|福建|江西|山东|山東|河南|湖北|湖南|广东|廣東|海南|四川|贵州|貴州|云南|雲南|陕西|陝西|甘肃|甘肅|青海|北京|天津|上海|重庆|重慶|广西|廣西|内蒙古|內蒙古|宁夏|寧夏|新疆|西藏)/i.test(text);
      });
      if (mainlandOptions.length) return pickRandom(mainlandOptions) || null;
    }
    return pickFallbackOption(options);
  }

  function isPlaceholderDisplayText(text = '') {
    return /请选择|請選擇|select|省份|城市|区县|地區|地区|區域|区域/i.test(normText(text));
  }

  function chooseNativeSelectOption(options, rawValue = '') {
    if (!options.length) return null;

    const target = normText(rawValue);
    const normalized = (text) => normalizeChoiceText(text);
    const isOtherOption = (opt) => {
      const text = normText(opt?.textContent || '');
      const value = normText(opt?.value || '');
      return /(其他|其它|\bother\b)/i.test(`${text} ${value}`);
    };

    if (target) {
      const targetVariants = buildTextVariants(target).map((item) => normalized(item)).filter(Boolean);
      const optionMatchesTarget = (opt) => {
        const valueVariants = buildTextVariants(opt.value || '').map((item) => normalized(item)).filter(Boolean);
        const textVariants = buildTextVariants(opt.textContent || '').map((item) => normalized(item)).filter(Boolean);
        const optionVariants = [...valueVariants, ...textVariants];
        return targetVariants.some((targetVariant) =>
          optionVariants.some((optionVariant) =>
            optionVariant === targetVariant ||
            optionVariant.includes(targetVariant) ||
            targetVariant.includes(optionVariant)
          )
        );
      };
      const exactValue = options.find((opt) => normalized(opt.value || '') === normalized(target));
      if (exactValue) return exactValue;

      const exactText = options.find((opt) => normalized(opt.textContent || '') === normalized(target));
      if (exactText) return exactText;

      const variantMatch = options.find((opt) => optionMatchesTarget(opt));
      if (variantMatch) return variantMatch;

      const partial = options.find((opt) => normalized(opt.textContent || '').includes(normalized(target)));
      if (partial) return partial;
    }

    const available = options.filter((opt) => {
      if (!(opt instanceof HTMLOptionElement)) return false;
      if (opt.disabled) return false;
      const text = normText(opt.textContent || '');
      const value = normText(opt.value || '');
      if (!text && !value) return false;
      if (/请选择|請選擇|选择|Select/i.test(text)) return false;
      if (!target && isOtherOption(opt)) return false;
      return true;
    });
    return pickRandomChoice(available) || null;
  }

  async function waitNativeSelectOptions(selectEl, targetText = '', timeout = 900) {
    const startedAt = Date.now();
    const normalizedTarget = normalizeChoiceText(targetText || '');
    const targetVariants = buildTextVariants(targetText || '').map((item) => normalizeChoiceText(item)).filter(Boolean);
    let latest = Array.from(selectEl?.options || []);
    while (Date.now() - startedAt < Math.max(120, Number(timeout || 0))) {
      latest = Array.from(selectEl?.options || []);
      const available = latest.filter((opt) => {
        if (!(opt instanceof HTMLOptionElement) || opt.disabled) return false;
        const text = normText(opt.textContent || '');
        return !!text && !/请选择|請選擇|选择|Select/i.test(text);
      });
      if (!normalizedTarget && available.length) break;
      if (normalizedTarget) {
        const matched = latest.find((opt) => {
          const variants = [...buildTextVariants(opt.value || ''), ...buildTextVariants(opt.textContent || '')]
            .map((item) => normalizeChoiceText(item))
            .filter(Boolean);
          return targetVariants.some((targetVariant) =>
            variants.some((candidate) =>
              candidate === targetVariant ||
              candidate.includes(targetVariant) ||
              targetVariant.includes(candidate)
            )
          );
        });
        if (matched) break;
      }
      await sleep(80);
    }
    return latest;
  }

  function buildComboboxAliases(field, targetText = '') {
    const aliases = new Set();
    const normalizedTarget = normText(targetText);
    if (normalizedTarget) aliases.add(normalizedTarget);

    for (const opt of Array.isArray(field?.options) ? field.options : []) {
      const label = normText(opt?.label || '');
      const value = normText(opt?.value || '');
      const text = normText(opt?.text || '');
      const extraAliases = Array.isArray(opt?.aliases) ? opt.aliases : [];
      for (const alias of [label, value, text, ...extraAliases]) {
        if (alias) aliases.add(alias);
      }
      if (!label && !value) continue;
      if (normalizedTarget && value && value === normalizedTarget) aliases.add(label || value);
      if (normalizedTarget && label && label === normalizedTarget) aliases.add(value || label);
      if (!normalizedTarget) {
        if (label) aliases.add(label);
        if (value) aliases.add(value);
      }
    }

    return Array.from(aliases).filter(Boolean);
  }

  function resolveSelectTriggerNode(el) {
    if (!(el instanceof Element)) return el;
    const tag = (el.tagName || '').toLowerCase();
    const role = normText(el.getAttribute('role') || '').toLowerCase();
    if (tag === 'select' || role === 'combobox') return el;

    if (tag === 'input' || tag === 'textarea') {
      const selfClass = String(el.getAttribute('class') || '').toLowerCase();
      if (/arco-select-view-input|ant-select-selection-search-input|semi-select/.test(selfClass)) {
        return el;
      }
      const wrapper = el.closest(
        '[role="combobox"], .arco-select-view, .arco-select-view-single, .ant-select-selector, .ant-select, .el-select, .semi-select, .n-base-selection, [aria-haspopup="listbox"], [aria-controls], [aria-owns]'
      );
      if (wrapper instanceof HTMLElement) return wrapper;
    }

    if (role === 'button' || tag === 'button') {
      const boxed = el.closest('[aria-haspopup="listbox"], [aria-controls], [aria-owns], [role="combobox"]');
      if (boxed instanceof HTMLElement) return boxed;
    }

    return el;
  }

  function readSelectLikeDisplayText(triggerEl) {
    if (!(triggerEl instanceof Element)) return '';
    const values = [];
    const push = (val) => {
      const text = normText(val);
      if (text) values.push(text);
    };

    push(triggerEl.getAttribute('aria-label') || '');
    push(triggerEl.getAttribute('title') || '');
    push(triggerEl.textContent || '');

    if (triggerEl instanceof HTMLInputElement || triggerEl instanceof HTMLTextAreaElement || triggerEl instanceof HTMLSelectElement) {
      push(triggerEl.value || '');
    }

    const nestedInputs = triggerEl.querySelectorAll?.('input, textarea, select') || [];
    nestedInputs.forEach((node) => {
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
        push(node.value || '');
      }
    });

    const labels = triggerEl.querySelectorAll?.(
      '.arco-select-view-value, .arco-select-view-input, .ant-select-selection-item, .el-select__selected-item, .semi-select-selection-text, .n-base-selection-label, [data-slot=\"select-value\"], [class*=\"select-value\"], [class*=\"selected\"]'
    ) || [];
    labels.forEach((node) => {
      push(node.textContent || '');
      push(node.getAttribute?.('title') || '');
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
        push(node.value || '');
      }
    });

    const filtered = values.filter((item) => !/▾|▼|▲|▽|△/.test(item));
    return normText(filtered[0] || values[0] || '');
  }

  function isMultiSelectField(field = null, triggerEl = null) {
    if (field?.meta?.multiSelect === true || field?.meta?.multiple === true) return true;
    if (triggerEl instanceof HTMLSelectElement && triggerEl.multiple) return true;
    if (!(triggerEl instanceof Element)) return false;
    const attrText = [
      triggerEl.getAttribute('class') || '',
      triggerEl.getAttribute('aria-label') || '',
      triggerEl.getAttribute('data-select') || '',
      triggerEl.getAttribute('data-testid') || '',
      triggerEl.getAttribute('data-multiple') || '',
      triggerEl.getAttribute('multiple') || ''
    ].join(' ').toLowerCase();
    if (String(triggerEl.getAttribute('aria-multiselectable') || '').toLowerCase() === 'true') return true;
    if (/(^|\s|-)multi(select|ple)?(\s|-|$)|multiple|多选|多選/.test(attrText)) return true;
    return !!triggerEl.querySelector?.('[role="checkbox"], input[type="checkbox"]');
  }

  function readMultiSelectDisplayText(triggerEl) {
    if (!(triggerEl instanceof Element)) return '';
    const marked = normText(triggerEl.getAttribute('data-formpilot-v2-multiselect-filled') || '');
    if (marked) return marked;
    const leafTexts = [];
    const nodes = Array.from(
      triggerEl.querySelectorAll(
        'span, div, [data-value], [data-label], [class*="tag"], [class*="chip"], [class*="selected"], [class*="selection"]'
      )
    );
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (!visible(node)) continue;
      if (node.closest('svg, [aria-hidden="true"], .fb-sr-only, .sr-only')) continue;
      if (node.children.length > 0 && !/(selected|selection|tag|chip)/i.test(String(node.getAttribute('class') || ''))) continue;
      const text = normText(
        node.getAttribute('data-label') ||
        node.getAttribute('data-value') ||
        node.getAttribute('title') ||
        node.textContent ||
        ''
      );
      if (!text || isPlaceholderDisplayText(text) || /▾|▼|▲|▽|△/.test(text)) continue;
      if (!leafTexts.includes(text)) leafTexts.push(text);
    }
    if (leafTexts.length) return leafTexts.join('、');
    const fallback = readSelectLikeDisplayText(triggerEl);
    return fallback && !isPlaceholderDisplayText(fallback) ? fallback : '';
  }

  async function closeSelectLikePanel(triggerEl = null) {
    const keyEventInit = { bubbles: true, cancelable: true, key: 'Escape', code: 'Escape' };
    const targets = [
      triggerEl instanceof HTMLElement ? triggerEl : null,
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
      document.body,
      document.documentElement
    ].filter(Boolean);
    for (const target of targets) {
      try {
        target.dispatchEvent(new KeyboardEvent('keydown', keyEventInit));
        target.dispatchEvent(new KeyboardEvent('keyup', keyEventInit));
      } catch {
        // ignore
      }
    }
    try { triggerEl?.blur?.(); } catch {}
    try { document.activeElement?.blur?.(); } catch {}
    await sleep(120);
  }

  function dispatchSelectOpenSequence(el, mode = 'mouse') {
    if (!(el instanceof HTMLElement)) return;

    const mouseEventInit = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 };
    const keyEventInit = { bubbles: true, cancelable: true };
    const PointerCtor = window.PointerEvent || window.MouseEvent;

    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    } catch {
      // ignore
    }
    el.focus?.();

    if (mode === 'keyboard') {
      el.dispatchEvent(new KeyboardEvent('keydown', { ...keyEventInit, key: 'ArrowDown', code: 'ArrowDown' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { ...keyEventInit, key: 'ArrowDown', code: 'ArrowDown' }));
      el.dispatchEvent(new KeyboardEvent('keydown', { ...keyEventInit, key: 'Space', code: 'Space' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { ...keyEventInit, key: 'Space', code: 'Space' }));
      el.dispatchEvent(new KeyboardEvent('keydown', { ...keyEventInit, key: 'Enter', code: 'Enter' }));
      el.dispatchEvent(new KeyboardEvent('keyup', { ...keyEventInit, key: 'Enter', code: 'Enter' }));
      return;
    }

    const dispatchMouse = (node) => {
      if (!(node instanceof HTMLElement)) return;
      node.dispatchEvent(new PointerCtor('pointerover', { ...mouseEventInit, pointerType: 'mouse', isPrimary: true }));
      node.dispatchEvent(new PointerCtor('pointerenter', { ...mouseEventInit, pointerType: 'mouse', isPrimary: true }));
      node.dispatchEvent(new PointerCtor('pointerdown', { ...mouseEventInit, pointerType: 'mouse', isPrimary: true }));
      node.dispatchEvent(new MouseEvent('mousedown', mouseEventInit));
      node.dispatchEvent(new PointerCtor('pointerup', { ...mouseEventInit, pointerType: 'mouse', isPrimary: true }));
      node.dispatchEvent(new MouseEvent('mouseup', mouseEventInit));
      node.click();
    };

    dispatchMouse(el);
  }

  async function waitForPanelOptions(buttonEl, beforePanels, panelId, timeout = 920) {
    const startAt = Date.now();
    let latestPanel = null;
    let latestOptions = [];
    while (Date.now() - startAt < Math.max(120, Number(timeout || 0))) {
      await sleep(70);
      const panel = getPanelAfterOpen(buttonEl, beforePanels, panelId);
      if (panel) {
        const options = collectOptionNodes(panel);
        latestPanel = panel;
        latestOptions = options;
        if (options.length) return { panel, options };
      }
      const globalOptions = collectGlobalOptionNodes();
      if (globalOptions.length) {
        const derivedPanel = resolvePanelFromOptionNode(globalOptions[0].node);
        latestPanel = derivedPanel || latestPanel;
        latestOptions = globalOptions;
        return { panel: latestPanel, options: globalOptions };
      }
    }
    return { panel: latestPanel, options: latestOptions };
  }

  async function selectMultiComboboxOptions(buttonEl, value = null, field = null, settings = {}) {
    if (!buttonEl) return { ok: false, reason: '多选下拉触发器不存在' };
    try {
      buttonEl.scrollIntoView?.({ block: 'center', inline: 'center' });
      await sleep(80);
    } catch {
      // ignore
    }

    const beforePanels = new Set(collectOpenPanels());
    const panelId = buttonEl.getAttribute('aria-controls') || buttonEl.getAttribute('aria-owns') || '';
    const beforeText = readMultiSelectDisplayText(buttonEl);
    const desiredValues = flattenChoiceValue(value).filter((item) => !/^选项\d+$|^選項\d+$|^option\s*\d+$/i.test(normText(item)));
    const desiredPickCount = Math.max(1, desiredValues.length || 1);
    debugLog(settings, '多选下拉策略', {
      id: field?.id || '',
      targetValues: desiredValues,
      beforeText
    });

    dispatchSelectOpenSequence(buttonEl, 'mouse');
    await sleep(140);
    const { panel, options } = await waitForPanelOptions(buttonEl, beforePanels, panelId, 1400);
    const candidates = options
      .filter((option) => !isCascadeParentItem(option))
      .filter((option) => {
        const text = normText(option?.text || option?.value || option?.node?.textContent || '');
        return text && !isPlaceholderDisplayText(text);
      });
    if (!panel && !candidates.length) {
      await closeSelectLikePanel(buttonEl);
      return beforeText
        ? { ok: true, reason: '多选下拉已有有效值，保持不变', selectedText: beforeText, targetMatched: !desiredValues.length }
        : { ok: false, reason: '未打开多选下拉面板', selectedText: '' };
    }
    if (!candidates.length) {
      await closeSelectLikePanel(buttonEl);
      return beforeText
        ? { ok: true, reason: '多选下拉已有有效值，保持不变', selectedText: beforeText, targetMatched: !desiredValues.length }
        : { ok: false, reason: '多选下拉面板无可选项', selectedText: '' };
    }

    const pickedNodes = new Set();
    const pickedTexts = [];
    const pickOption = (wanted = '') => {
      if (wanted) {
        const matched = chooseOption(candidates.filter((item) => !pickedNodes.has(item.node)), wanted, []);
        if (matched) return matched;
      }
      const available = candidates.filter((item) => !pickedNodes.has(item.node) && !isNodeChecked(item.node, true));
      return pickAddressFallbackOption(available.length ? available : candidates.filter((item) => !pickedNodes.has(item.node)), field);
    };

    const wantedList = desiredValues.length ? desiredValues : [''];
    for (const wanted of wantedList) {
      if (pickedTexts.length >= desiredPickCount) break;
      const picked = pickOption(wanted);
      if (!picked?.node || pickedNodes.has(picked.node)) continue;
      fireOptionClick(picked.node);
      pickedNodes.add(picked.node);
      const pickedText = normText(picked.text || picked.value || picked.node.textContent || '');
      if (pickedText) pickedTexts.push(pickedText);
      await sleep(140);
    }

    await closeSelectLikePanel(buttonEl);
    const selectedText = readMultiSelectDisplayText(buttonEl) || pickedTexts.join('、') || beforeText;
    if (pickedTexts.length) {
      try {
        buttonEl.setAttribute('data-formpilot-v2-multiselect-filled', selectedText || pickedTexts.join('、'));
      } catch {
        // ignore
      }
      buttonEl.dispatchEvent(new Event('input', { bubbles: true }));
      buttonEl.dispatchEvent(new Event('change', { bubbles: true }));
      buttonEl.dispatchEvent(new Event('blur', { bubbles: true }));
      return {
        ok: true,
        reason: `多选下拉已选择 ${pickedTexts.length} 项`,
        selectedText,
        targetMatched: desiredValues.length ? desiredValues.some((wanted) => matchesDisplayText(selectedText, [wanted])) : true
      };
    }
    return selectedText
      ? { ok: true, reason: '多选下拉已有有效值，保持不变', selectedText, targetMatched: !desiredValues.length }
      : { ok: false, reason: '多选下拉未产生有效选择', selectedText: '' };
  }

  async function waitForSelectValueChange(buttonEl, beforeText = '', timeout = 360) {
    const before = normalizeChoiceText(beforeText || '');
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      await sleep(60);
      const nowText = readSelectLikeDisplayText(buttonEl);
      if (!nowText || isPlaceholderDisplayText(nowText)) continue;
      if (normalizeChoiceText(nowText) !== before) return nowText;
    }
    return readSelectLikeDisplayText(buttonEl);
  }

  async function selectCascadeByLevels(buttonEl, panel, targetText = '', aliases = [], settings = {}) {
    let activePanel = panel || document;
    const maxDepth = 6;
    const targetParts = splitCascadeTargetText(targetText);
    const cascadeAliases = buildCascadeTargetAliases(targetText, aliases);
    for (let depth = 0; depth < maxDepth; depth += 1) {
      const columns = collectCascadeColumns(activePanel);
      const column = columns[depth] || columns[columns.length - 1] || activePanel;
      const options = collectOptionNodes(column).filter((option) => !/请选择|請選擇|select/i.test(normText(option.text || '')));
      if (!options.length) break;
      const parentOptions = options.filter((option) => isCascadeParentItem(option));
      const leafOptions = options.filter((option) => !isCascadeParentItem(option));
      debugLog(settings, '级联层级统计', {
        depth: depth + 1,
        total: options.length,
        parent: parentOptions.length,
        leaf: leafOptions.length
      });

      let picked = null;
      const levelAliases = cascadeLevelAliases(targetParts[depth] || '', depth);
      if (levelAliases.length) {
        picked = chooseOption(options, levelAliases[0], levelAliases.slice(1));
      }
      if (!picked && depth === 0 && targetText) {
        picked = chooseOption(options, targetText, cascadeAliases);
      }
      if (!picked) {
        if (parentOptions.length && (depth === 0 || !leafOptions.length)) {
          picked = pickFallbackOption(parentOptions);
        } else {
          picked = pickFallbackOption(leafOptions.length ? leafOptions : options);
        }
      }
      if (!picked) break;

      const beforeText = readSelectLikeDisplayText(buttonEl);
      fireOptionClick(picked.node);
      const afterText = await waitForSelectValueChange(buttonEl, beforeText, 320);
      if (afterText && !isPlaceholderDisplayText(afterText) && !isCascadeParentItem(picked)) {
        const targetMatched = !targetText || matchesDisplayText(afterText, cascadeAliases);
        const hasRemainingTarget = targetParts.length > depth + 1;
        if (targetMatched || (depth >= 1 && !hasRemainingTarget)) {
          return { ok: true, reason: `级联下拉第${depth + 1}级已选中`, selectedText: afterText, targetMatched };
        }
      }

      const openPanels = collectOpenPanels();
      activePanel = openPanels[openPanels.length - 1] || activePanel;
    }

    const finalText = readSelectLikeDisplayText(buttonEl);
    if (finalText && !isPlaceholderDisplayText(finalText)) {
      const targetMatched = !targetText || matchesDisplayText(finalText, cascadeAliases);
      if (!targetText || targetMatched) {
        return { ok: true, reason: '级联下拉已完成选择', selectedText: finalText, targetMatched };
      }
      if (isGenericOptionDisplayText(finalText)) {
        return { ok: false, reason: '级联下拉只选中了泛化选项，未完成目标路径选择', selectedText: finalText, targetMatched: false };
      }
      return { ok: false, reason: '级联下拉展示值未命中目标路径', selectedText: finalText, targetMatched: false };
    }
    return { ok: false, reason: '级联下拉未选中叶子项', selectedText: finalText };
  }

  function likelyCascadeField(field = {}) {
    const hint = normText(`${field.label || ''} ${field.placeholder || ''} ${field.context || ''} ${field.selector || ''}`);
    return /(地区|地區|区域|區域|省|市|区|縣|县|地址|address|cascader|级联|聯動)/i.test(hint);
  }

  /**
   * 等待级联面板出现，优先用 MutationObserver 感知 DOM 变化，
   * 最多轮询 6 次（原 12 次），降低 CPU 占用。
   */
  async function waitForCascadePanel(timeout = 960) {
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        resolve();
      };
      const observer = new MutationObserver(() => {
        const panels = collectOpenPanels();
        if (panels.length) done();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
      // MutationObserver 兜底超时
      setTimeout(done, timeout);
    });
  }

  async function trySelectCascadeFollowups(buttonEl, field, targetText, aliases = [], settings = {}) {
    const loops = 6;
    let panel = null;
    let options = [];
    let menuItems = [];
    let leafItems = [];

    for (let i = 0; i < loops; i += 1) {
      const panels = collectOpenPanels();
      panel = panels.length ? panels[panels.length - 1] : null;
      const scope = panel || document;
      options = collectOptionNodes(scope).filter((option) => !isPlaceholderDisplayText(option.text || option.value || ''));
      menuItems = collectCascadeMenuItems(scope);
      leafItems = menuItems.filter(isCascadeLeafItem);
      debugLog(settings, `级联下拉统计(轮询第${i + 1}次)`, {
        options: options.length,
        menuitems: menuItems.length,
        leaves: leafItems.length
      });
      if (options.length || leafItems.length) break;
      // 等待 DOM 变化（MutationObserver）而非固定 sleep，减少 CPU 空转
      await waitForCascadePanel(150);
    }

    if (options.length) {
      const picked = chooseOption(options, targetText, aliases) || pickFallbackOption(options) || pickRandom(options);
      if (picked) {
        fireOptionClick(picked.node);
        await sleep(120);
        const currentText = readSelectLikeDisplayText(buttonEl);
        if (currentText && !isPlaceholderDisplayText(currentText)) {
          return { ok: true, reason: '级联下拉已选择叶子选项', selectedText: currentText };
        }
      }
    }

    if (leafItems.length) {
      const picked = chooseOption(leafItems, targetText, aliases) || pickRandom(leafItems);
      if (picked) {
        fireOptionClick(picked.node);
        await sleep(120);
        const currentText = readSelectLikeDisplayText(buttonEl);
        if (currentText && !isPlaceholderDisplayText(currentText)) {
          return { ok: true, reason: '级联下拉已选择叶子菜单', selectedText: currentText };
        }
      }
    }

    let depth = 0;
    while (depth < 3) {
      const scope = panel || document;
      menuItems = collectCascadeMenuItems(scope);
      const parents = menuItems.filter(isCascadeParentItem);
      if (!parents.length) break;
      const parent = pickRandom(parents);
      if (!parent) break;
      fireOptionClick(parent.node);
      await sleep(120);

      const panels = collectOpenPanels();
      panel = panels.length ? panels[panels.length - 1] : panel;
      const nextScope = panel || document;
      const nextLeaves = collectCascadeMenuItems(nextScope).filter(isCascadeLeafItem);
      const nextOptions = collectOptionNodes(nextScope).filter((option) => !isPlaceholderDisplayText(option.text || option.value || ''));

      if (nextLeaves.length) {
        const pickedLeaf = chooseOption(nextLeaves, targetText, aliases) || pickRandom(nextLeaves);
        if (pickedLeaf) {
          fireOptionClick(pickedLeaf.node);
          await sleep(140);
          const currentText = readSelectLikeDisplayText(buttonEl);
          if (currentText && !isPlaceholderDisplayText(currentText)) {
            return { ok: true, reason: '级联下拉已按层级选择叶子菜单', selectedText: currentText };
          }
        }
      }

      if (nextOptions.length) {
        const pickedOption = chooseOption(nextOptions, targetText, aliases) || pickFallbackOption(nextOptions) || pickRandom(nextOptions);
        if (pickedOption) {
          fireOptionClick(pickedOption.node);
          await sleep(140);
          const currentText = readSelectLikeDisplayText(buttonEl);
          if (currentText && !isPlaceholderDisplayText(currentText)) {
            return { ok: true, reason: '级联下拉已按层级选择叶子选项', selectedText: currentText };
          }
        }
      }

      depth += 1;
    }

    const finalText = readSelectLikeDisplayText(buttonEl);
    if (finalText && !isPlaceholderDisplayText(finalText)) {
      return { ok: true, reason: '级联下拉展示值已更新', selectedText: finalText };
    }
    return { ok: false, reason: '级联下拉未完成选择', selectedText: finalText };
  }

  function matchesDisplayText(displayText = '', targets = []) {
    const displayVariants = buildTextVariants(displayText);
    const targetVariants = Array.from(new Set(targets.flatMap((item) => buildTextVariants(item))));
    if (!displayVariants.length || !targetVariants.length) return false;
    return targetVariants.some((target) =>
      displayVariants.some((current) => current === target || current.includes(target) || target.includes(current))
    );
  }

  function getPanelAfterOpen(buttonEl, beforePanels, panelId) {
    if (panelId) {
      const panel = document.getElementById(panelId);
      if (panel && visible(panel)) return panel;
    }

    const afterPanels = collectOpenPanels();
    const nextPanel = afterPanels.find((x) => !beforePanels.has(x)) || afterPanels[afterPanels.length - 1] || null;
    if (nextPanel) return nextPanel;

    const expanded = document.querySelector('[role="listbox"][data-state="open"], [role="menu"][data-state="open"]');
    if (expanded && visible(expanded)) return expanded;

    const triggerId = buttonEl.getAttribute('id');
    if (triggerId) {
      const ownedPanel = document.querySelector(`[aria-labelledby="${CSS.escape(triggerId)}"]`);
      if (ownedPanel && visible(ownedPanel)) return ownedPanel;
    }

    return null;
  }

  async function selectComboboxOption(buttonEl, targetText = '', field = null, settings = {}) {
    if (!buttonEl) return { ok: false, reason: '下拉触发器不存在' };

    try {
      buttonEl.scrollIntoView?.({ block: 'center', inline: 'center' });
      await sleep(80);
    } catch {
      // ignore
    }
    if (isMultiSelectField(field, buttonEl)) {
      return selectMultiComboboxOptions(buttonEl, targetText, field, settings);
    }

    const beforePanels = new Set(collectOpenPanels());
    const panelId = buttonEl.getAttribute('aria-controls') || buttonEl.getAttribute('aria-owns') || '';
    const aliases = buildComboboxAliases(field, targetText);
    const forceSimpleCombobox = field?.meta?.addressComboLevel === true;
    const addressComboIndex = Number(field?.meta?.addressComboIndex ?? -1);
    const beforeText = readSelectLikeDisplayText(buttonEl);
    const forceRefresh = field?.meta?.addressForceRefresh === true;
    if (targetText && matchesDisplayText(beforeText, [targetText, ...aliases]) && !(forceSimpleCombobox && addressComboIndex >= 0 && addressComboIndex < 2)) {
      return { ok: true, reason: '下拉项已是目标值', selectedText: beforeText, targetMatched: true };
    }
    if (
      beforeText &&
      !isPlaceholderDisplayText(beforeText) &&
      (!targetText || /^选项\d+$|^選項\d+$|^option\s*\d+$/i.test(normText(targetText)))
    ) {
      return { ok: true, reason: '下拉已有有效值，保持不变', selectedText: beforeText, targetMatched: !targetText };
    }
    debugLog(settings, '下拉单次策略', {
      id: field?.id || '',
      kind: field?.kind || '',
      targetText: normText(targetText)
    });

    dispatchSelectOpenSequence(buttonEl, 'mouse');
    await sleep(120);
    const addressPanelTimeout = forceSimpleCombobox
      ? (addressComboIndex >= 2 ? 6500 : (addressComboIndex === 1 ? 4200 : 2400))
      : 960;
    const { panel, options } = await waitForPanelOptions(buttonEl, beforePanels, panelId, addressPanelTimeout);
    if (!panel && !options.length) {
      if (forceSimpleCombobox && beforeText && !isPlaceholderDisplayText(beforeText)) {
        return { ok: true, reason: '地址下拉已有有效值，保持不变', selectedText: beforeText, targetMatched: !targetText };
      }
      return { ok: false, reason: '未打开下拉面板', selectedText: '' };
    }
    const cascadeLike =
      !forceSimpleCombobox && (
        likelyCascadeField(field) ||
        options.some((option) => isCascadeParentItem(option)) ||
        /cascader|級聯|级联|arco-cascader/.test(String(panel?.className || ''))
      );
    if (cascadeLike) {
      return selectCascadeByLevels(buttonEl, panel || document, targetText, aliases, settings);
    }

    const clickableOptions = options.filter((option) => !isCascadeParentItem(option));
    if (!clickableOptions.length) {
      return { ok: false, reason: '下拉面板无可选项', selectedText: '' };
    }

    let picked = chooseOption(clickableOptions, targetText, aliases);
    if (forceRefresh && targetText && matchesDisplayText(beforeText, [targetText, ...aliases])) {
      const different = clickableOptions.find((option) => {
        const text = normText(option?.text || option?.value || option?.node?.textContent || '');
        return text && !isPlaceholderDisplayText(text) && !matchesDisplayText(text, [targetText, ...aliases]);
      });
      if (different) picked = different;
    }
    picked = picked || pickAddressFallbackOption(clickableOptions, field);
    if (!picked) {
      return { ok: false, reason: '未找到可点击选项', selectedText: '' };
    }

    fireOptionClick(picked.node);
    await sleep(100);

    const currentText = readSelectLikeDisplayText(buttonEl);
    const selectedText = normText(currentText || '');
    const changed = normalizeChoiceText(selectedText) !== normalizeChoiceText(beforeText || '');
    const hadValidBefore = !!beforeText && !isPlaceholderDisplayText(beforeText);
    if (!selectedText || isPlaceholderDisplayText(selectedText)) {
      return { ok: false, reason: '单次点击后展示值未更新', selectedText };
    }
    if (targetText && matchesDisplayText(selectedText, [targetText, ...aliases])) {
      return { ok: true, reason: '单次点击命中下拉选项', selectedText, targetMatched: true };
    }
    if (hadValidBefore && (!targetText || (!forceSimpleCombobox && !changed))) {
      return {
        ok: true,
        reason: targetText ? '下拉已有有效值，目标不可用时保持不变' : '下拉已存在有效值，保持不变',
        selectedText,
        targetMatched: !targetText || matchesDisplayText(selectedText, [targetText, ...aliases])
      };
    }
    if (changed) {
      return { ok: true, reason: targetText ? '单次点击已选择兜底可用项' : '单次点击已随机选择可用项', selectedText, targetMatched: !targetText };
    }
    if (forceSimpleCombobox && selectedText && !isPlaceholderDisplayText(selectedText)) {
      return { ok: true, reason: '地址下拉已确认有效值', selectedText, targetMatched: !targetText || matchesDisplayText(selectedText, [targetText, ...aliases]) };
    }
    return { ok: false, reason: '单次点击后未产生有效选择', selectedText };
  }

  function findAddressComboByMeta(field, index, root, strictScope) {
    const meta = field.meta || {};
    const domIds = Array.isArray(meta.comboboxDomIds) ? meta.comboboxDomIds : [];
    const selectors = Array.isArray(meta.comboboxSelectors) ? meta.comboboxSelectors : [];
    let button = findByDomId(domIds[index], root, strictScope);
    if (!button && selectors[index]) {
      button = queryOne(root, selectors[index]);
      if (!button && !strictScope) button = document.querySelector(selectors[index]);
    }
    return button || null;
  }

  function findAddressDetailByMeta(field, root, strictScope) {
    const meta = field?.meta || {};
    let detailEl = findByDomId(meta.detailDomId, root, strictScope);
    if (!detailEl && meta.detailSelector) {
      detailEl = queryOne(root, meta.detailSelector);
      if (!detailEl && !strictScope) detailEl = document.querySelector(meta.detailSelector);
    }
    return detailEl || null;
  }

  function uniqueElements(items = []) {
    const out = [];
    const seen = new Set();
    for (const item of items) {
      if (!(item instanceof Element) || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out;
  }

  function collectAddressScopeRoots(field, root, strictScope) {
    const roots = [];
    const push = (node) => {
      if (!(node instanceof Element) && node !== document) return;
      if (node instanceof Element && !visible(node) && node !== document.body) return;
      roots.push(node);
    };

    const detailEl = findAddressDetailByMeta(field, root, strictScope);
    if (detailEl instanceof Element) {
      let node = detailEl.parentElement;
      let depth = 0;
      while (node && node !== document.body && depth < 8) {
        const text = normText(node.innerText || node.textContent || '');
        const comboCount = queryAll(node, ADDRESS_COMBO_TRIGGER_SELECTOR).filter((candidate) => visible(candidate)).length;
        if (comboCount || ADDRESS_SCOPE_HINT_RE.test(text)) push(node);
        node = node.parentElement;
        depth += 1;
      }
    }

    const container = findContainerNode(field, root, strictScope);
    push(container);

    if (root instanceof Element) push(root);
    if (!strictScope) push(document.body);
    return uniqueElements(roots);
  }

  function collectVisibleAddressCombos(scope) {
    return queryAll(scope, ADDRESS_COMBO_TRIGGER_SELECTOR).filter((node) => visible(node));
  }

  function sortAddressCombosByPosition(candidates = []) {
    return candidates.slice().sort((a, b) => {
      if (a === b) return 0;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const topDiff = Math.round(ar.top - br.top);
      if (Math.abs(topDiff) > 8) return topDiff;
      const leftDiff = Math.round(ar.left - br.left);
      if (leftDiff) return leftDiff;
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  function collectAddressComboCandidates(field, root, strictScope, usedNodes = new Set(), index = 0) {
    const firstCombo = findAddressComboByMeta(field, 0, root, strictScope);
    if (firstCombo instanceof Element && visible(firstCombo)) {
      const firstRect = firstCombo.getBoundingClientRect();
      const rowCandidates = sortAddressCombosByPosition(collectVisibleAddressCombos(document)).filter((node) => {
        const rect = node.getBoundingClientRect();
        const sameRow = Math.abs(rect.top - firstRect.top) <= 18 || Math.abs(rect.bottom - firstRect.bottom) <= 18;
        const nearRow = Math.abs(((rect.top + rect.bottom) / 2) - ((firstRect.top + firstRect.bottom) / 2)) <= 28;
        const horizontalNear = rect.left >= firstRect.left - 12 && rect.left <= firstRect.left + Math.max(960, firstRect.width * 4);
        return (sameRow || nearRow) && horizontalNear;
      });
      const unused = rowCandidates.filter((node) => !usedNodes.has(node));
      if (unused.length || rowCandidates.length > index) return rowCandidates;
    }

    const roots = collectAddressScopeRoots(field, root, strictScope);
    for (const scope of roots) {
      const candidates = sortAddressCombosByPosition(collectVisibleAddressCombos(scope));
      const unused = candidates.filter((node) => !usedNodes.has(node));
      if (unused.length || candidates.length > index) return candidates;
    }

    if (strictScope) return [];
    const detailEl = findAddressDetailByMeta(field, root, false);
    const anchor = detailEl || findAddressComboByMeta(field, 0, root, false);
    const anchorRect = anchor instanceof Element ? anchor.getBoundingClientRect() : null;
    const candidates = sortAddressCombosByPosition(collectVisibleAddressCombos(document)).filter((node) => {
      if (!anchorRect) return true;
      const rect = node.getBoundingClientRect();
      const verticalGap = Math.min(Math.abs(rect.top - anchorRect.top), Math.abs(rect.bottom - anchorRect.bottom));
      const horizontalGap = Math.abs((rect.left + rect.right) / 2 - (anchorRect.left + anchorRect.right) / 2);
      return verticalGap <= 420 && horizontalGap <= 900;
    });
    return candidates;
  }

  function scoreAddressComboCandidate(node, roleHint = '', labelHint = '', index = 0) {
    if (!(node instanceof Element)) return -Infinity;
    let score = 0;
    const rect = node.getBoundingClientRect();
    const hint = normText(
      `${readSelectLikeDisplayText(node)} ${node.textContent || ''} ${node.getAttribute('aria-label') || ''} ${node.getAttribute('placeholder') || ''} ${node.getAttribute('title') || ''}`
    );
    const slot = inferAddressSlot(`${hint} ${labelHint} ${roleHint}`, '');
    if (slot && roleHint && slot === inferAddressSlot(roleHint, '')) score += 12;
    if (labelHint && hint && (hint.includes(labelHint) || labelHint.includes(hint))) score += 8;
    if (node.tagName.toLowerCase() === 'select' || node.getAttribute('role') === 'combobox') score += 4;
    score += Math.max(0, 6 - Math.min(6, index));
    if (rect.width > 40) score += 2;
    return score;
  }

  function findAddressCombobox(field, index, root, strictScope, usedNodes = new Set()) {
    const direct = findAddressComboByMeta(field, index, root, strictScope);
    if (direct && !usedNodes.has(direct) && visible(direct)) return direct;

    const meta = field.meta || {};
    const labels = Array.isArray(meta.comboboxLabels) ? meta.comboboxLabels : [];
    const roles = Array.isArray(meta.comboboxRoles) ? meta.comboboxRoles : [];
    const candidates = collectAddressComboCandidates(field, root, strictScope, usedNodes, index)
      .filter((node) => !usedNodes.has(node))
      .map((node) => ({
        node,
        score: scoreAddressComboCandidate(node, roles[index] || '', labels[index] || '', index)
      }))
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.score > 0 ? candidates[0].node : null;
  }

  function inferAddressComboExpectedCount(field = {}) {
    const meta = field?.meta || {};
    const roles = Array.isArray(meta.comboboxRoles) ? meta.comboboxRoles.map((item) => String(item || '').toLowerCase()) : [];
    const hint = normText([
      field?.label,
      field?.placeholder,
      field?.context,
      meta.sectionHint,
      ...(Array.isArray(meta.comboboxLabels) ? meta.comboboxLabels : []),
      ...(Array.isArray(meta.comboboxRoles) ? meta.comboboxRoles : [])
    ].join(' '));
    if (roles.includes('district') || /(区县|區縣|district|county)/i.test(hint)) return 3;
    if (roles.includes('city') || /(城市|city|town)/i.test(hint)) return 2;
    if (roles.includes('province') || /(省份|province|state)/i.test(hint)) return 1;
    return 0;
  }

  function readAddressComboDisplay(node) {
    if (node instanceof HTMLSelectElement) {
      return normText(node.options?.[node.selectedIndex]?.textContent || node.value || '');
    }
    return normText(readSelectLikeDisplayText(resolveSelectTriggerNode(node)));
  }

  function isAddressComboFilled(node) {
    const display = readAddressComboDisplay(node);
    return !!display && !isPlaceholderDisplayText(display);
  }

  function isAddressComboDisabledEmpty(node) {
    if (isAddressComboFilled(node)) return false;
    return isControlDisabledLike(resolveSelectTriggerNode(node));
  }

  function countIgnorableAddressEmptyCombos(comboNodes = []) {
    const ignored = new Set();
    comboNodes.forEach((node) => {
      if (isAddressComboDisabledEmpty(node)) ignored.add(node);
    });

    const provinceText = readAddressComboDisplay(comboNodes[0]);
    if (isHmtAddressText(provinceText)) {
      comboNodes.slice(1).forEach((node) => {
        if (!isAddressComboFilled(node)) ignored.add(node);
      });
    }
    return ignored.size;
  }

  function collectAddressComboNodes(field, root, strictScope, expectedCount = 3) {
    const comboNodes = [];
    const usedComboNodes = new Set();
    for (let i = 0; i < Math.max(1, Number(expectedCount || 0)); i += 1) {
      const combo = findAddressCombobox(field, i, root, strictScope, usedComboNodes);
      if (!combo) continue;
      usedComboNodes.add(combo);
      comboNodes.push(combo);
    }
    return comboNodes;
  }

  function findAddressDetailElement(field, root, strictScope) {
    const meta = field.meta || {};
    let detailEl = findByDomId(meta.detailDomId, root, strictScope);
    if (!detailEl && meta.detailSelector) {
      detailEl = queryOne(root, meta.detailSelector);
      if (!detailEl && !strictScope) detailEl = document.querySelector(meta.detailSelector);
    }
    if (detailEl) return detailEl;

    const container = findContainerNode(field, root, strictScope) || root || document.body;
    const syntheticField = {
      ...field,
      domId: meta.detailDomId || '',
      selector: meta.detailSelector || '',
      kind: 'addressDetail',
      meta: {
        ...(field.meta || {}),
        comboboxRoles: []
      }
    };
    const candidates = queryAll(container, 'textarea, input[type="text"], input:not([type])').filter((node) => visible(node));
    let best = null;
    let bestScore = -Infinity;
    for (const node of candidates) {
      const score = scoreElementMatch(node, syntheticField);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return bestScore > 0 ? best : null;
  }

  function buildFillResult(ok, reason = '', extra = {}) {
    return {
      ok: !!ok,
      reason: reason || (ok ? '成功' : ''),
      ...extra
    };
  }

  function isControlDisabledLike(node) {
    if (!(node instanceof Element)) return true;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement || node instanceof HTMLButtonElement) {
      if (node.disabled) return true;
    }
    if (node.hasAttribute('disabled')) return true;
    if (String(node.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return true;
    if (node.classList?.contains('disabled') || node.classList?.contains('select-disabled') || node.classList?.contains('is-disabled')) return true;
    return false;
  }

  function hasUsableNativeOptions(selectEl) {
    if (!(selectEl instanceof HTMLSelectElement)) return false;
    return Array.from(selectEl.options || []).some((opt) => {
      if (!(opt instanceof HTMLOptionElement) || opt.disabled) return false;
      const text = normText(opt.textContent || opt.value || '');
      return !!text && !/请选择|請選擇|选择|Select/i.test(text);
    });
  }

  async function waitForAddressControlReady(control, timeout = 1600) {
    const startedAt = Date.now();
    let latest = control;
    while (Date.now() - startedAt < Math.max(160, Number(timeout || 0))) {
      if (latest instanceof Element && visible(latest) && !isControlDisabledLike(latest)) {
        if (!(latest instanceof HTMLSelectElement) || hasUsableNativeOptions(latest)) return latest;
      }
      await sleep(80);
    }
    return latest;
  }

  async function selectNativeSelectOption(selectEl, targetText = '') {
    if (!(selectEl instanceof HTMLSelectElement)) {
      return { ok: false, reason: '原生下拉不存在', selectedText: '' };
    }
    const beforeText = normText(selectEl.options?.[selectEl.selectedIndex]?.textContent || selectEl.value || '');
    const options = await waitNativeSelectOptions(selectEl, targetText || '', 1600);
    const targetOption = chooseNativeSelectOption(options, targetText || '');
    if (!targetOption) return { ok: false, reason: '原生下拉无可选项', selectedText: beforeText };

    selectEl.value = targetOption.value;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    selectEl.dispatchEvent(new Event('blur', { bubbles: true }));
    await sleep(120);

    const selectedText = normText(selectEl.options?.[selectEl.selectedIndex]?.textContent || selectEl.value || '');
    if (!selectedText || isPlaceholderDisplayText(selectedText)) {
      return { ok: false, reason: '原生下拉选择后仍为空', selectedText };
    }
    if (targetText && matchesDisplayText(selectedText, [targetText])) {
      return { ok: true, reason: '原生下拉命中目标值', selectedText, targetMatched: true };
    }
    if (!targetText || normalizeChoiceText(selectedText) !== normalizeChoiceText(beforeText || '')) {
      return { ok: true, reason: targetText ? '原生下拉已选择兜底可用项' : '原生下拉已随机选择可用项', selectedText, targetMatched: !targetText };
    }
    return { ok: false, reason: '原生下拉选择后未变化', selectedText };
  }

  async function fillAddressCombobox(control, targetText = '', field = null, settings = {}, index = 0) {
    const readyControl = await waitForAddressControlReady(control, 1800);
    if (readyControl instanceof HTMLSelectElement) {
      return selectNativeSelectOption(readyControl, targetText);
    }
    const triggerNode = resolveSelectTriggerNode(readyControl);
    if (isControlDisabledLike(triggerNode)) {
      return { ok: false, reason: '地址下拉仍处于禁用状态', selectedText: readSelectLikeDisplayText(triggerNode) };
    }
    const comboField = field?.kind === 'addressComponent'
      ? {
          ...field,
          kind: 'select',
          meta: {
            ...(field.meta || {}),
            addressComboLevel: true,
            addressComboIndex: index,
            selectLike: true
          }
        }
      : field;
    const result = await selectComboboxOption(triggerNode, targetText, comboField, settings);
    if (!result?.ok && targetText && setButtonDisplayText(triggerNode, targetText)) {
      return { ok: true, reason: '地址下拉已写入展示值', selectedText: targetText, targetMatched: true };
    }
    return result;
  }

  async function waitForAddressCombobox(field, index, root, strictScope, usedNodes, timeout = 3200) {
    const startedAt = Date.now();
    let latest = null;
    while (Date.now() - startedAt < Math.max(240, Number(timeout || 0))) {
      latest = findAddressCombobox(field, index, root, strictScope, usedNodes);
      if (latest instanceof Element && visible(latest) && !isControlDisabledLike(resolveSelectTriggerNode(latest))) {
        return latest;
      }
      await sleep(120);
    }
    return latest;
  }

  function findAlternativeTextTarget(field, root, strictScope, currentTarget, usedElements) {
    const container = findContainerNode(field, root, strictScope) || root || document.body;
    const selector = field?.selector || '';
    let candidates = [];
    if (selector) {
      try {
        candidates = queryAll(container, selector);
      } catch {
        candidates = [];
      }
    }
    if (!candidates.length && field?.placeholder) {
      const safe = String(field.placeholder).replace(/"/g, '\\"');
      candidates = queryAll(container, `input[placeholder="${safe}"], textarea[placeholder="${safe}"]`);
    }

    const filtered = candidates.filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node === currentTarget) return false;
      if (!visible(node)) return false;
      if (usedElements instanceof Set && usedElements.has(node)) return false;
      return true;
    });
    if (!filtered.length) return null;
    if (!(field?.label || field?.context)) return filtered[0];
    let best = filtered[0];
    let bestScore = -Infinity;
    for (const node of filtered) {
      const score = scoreElementMatch(node, field);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best;
  }

  function publishFillSnapshot(snapshot) {
    try {
      window.__FORMPILOT_V2_LAST_FILL__ = snapshot;
    } catch {
      // ignore
    }
    try {
      const safeDetail = Array.isArray(snapshot?.detail)
        ? snapshot.detail.map((item) => ({
            id: item?.id || '',
            kind: item?.kind || '',
            ok: !!item?.ok,
            domId: item?.domId || '',
            selector: item?.selector || '',
            reason: item?.reason || ''
          }))
        : [];
      const compact = {
        at: Number(snapshot?.at || Date.now()),
        total: Number(snapshot?.total || 0),
        applied: Number(snapshot?.applied || 0),
        failed: Number(snapshot?.failed || 0),
        scopeSelector: snapshot?.scopeSelector || '',
        strictScope: !!snapshot?.strictScope,
        detail: safeDetail
      };
      const encoded = encodeURIComponent(JSON.stringify(compact));
      document.documentElement?.setAttribute?.('data-formpilot-v2-last-fill', encoded);
    } catch {
      // ignore
    }
  }

  async function fillAddressComponent(field, value, root, strictScope, settings = {}) {
    const meta = field.meta || {};
    const domIds = Array.isArray(meta.comboboxDomIds) ? meta.comboboxDomIds : [];
    const labels = Array.isArray(meta.comboboxLabels) ? meta.comboboxLabels : [];
    const roles = Array.isArray(meta.comboboxRoles) ? meta.comboboxRoles : [];

    const addr = parseAddressValue(value);
    const fallbackSlots = ['province', 'city', 'district'];
    const usedNodes = new Set();
    let comboApplied = 0;
    let comboAttempted = 0;
    const comboErrors = [];

    const selectors = Array.isArray(meta.comboboxSelectors) ? meta.comboboxSelectors : [];
    const expectedComboCount = Math.max(inferAddressComboExpectedCount(field), domIds.length, selectors.length, roles.length, labels.length);
    const totalComboSlots = Math.max(expectedComboCount, 3);
    const attemptedSlots = new Set();
    const updateAddressFromSelection = (normalizedSlot, targetText, selectResult, button) => {
      const selectedText = normText(selectResult?.selectedText || readAddressComboDisplay(button));
      const targetMatched = !targetText || selectResult?.targetMatched === true || matchesDisplayText(selectedText, [targetText]);
      if (!selectedText || isPlaceholderDisplayText(selectedText)) return;
      if (normalizedSlot === 'province') {
        addr.province = selectedText;
        if (!targetMatched) {
          addr.city = '';
          addr.district = '';
        }
      } else if (normalizedSlot === 'city') {
        addr.city = selectedText;
        if (!targetMatched) {
          addr.district = '';
        }
      } else if (normalizedSlot === 'district') {
        addr.district = selectedText;
      }
    };
    const fillAddressLevel = async (i, button, forceRefresh = false) => {
      const slotHint = roles[i] || labels[i] || fallbackSlots[i] || '';
      const normalizedSlot = inferAddressSlot(slotHint, fallbackSlots[i] || '');
      const targetText = pickAddressValue(addr, normalizedSlot || slotHint, '');
      const shouldFillCombo = !!targetText || /^(province|city|district)$/.test(normalizedSlot || '') || i < 3;
      if (!shouldFillCombo) return false;
      attemptedSlots.add(i);
      comboAttempted += 1;
      const comboField = forceRefresh
        ? { ...field, meta: { ...(field.meta || {}), addressForceRefresh: true } }
        : field;
      const selectResult = await fillAddressCombobox(button, targetText, comboField, settings, i);
      if (selectResult.ok) {
        comboApplied += 1;
        updateAddressFromSelection(normalizedSlot, targetText, selectResult, button);
        const triggerNode = resolveSelectTriggerNode(button);
        triggerNode?.dispatchEvent?.(new Event('input', { bubbles: true }));
        triggerNode?.dispatchEvent?.(new Event('change', { bubbles: true }));
        triggerNode?.dispatchEvent?.(new Event('blur', { bubbles: true }));
        return true;
      }
      comboErrors.push(`${normalizedSlot || slotHint || `slot-${i + 1}`}: ${selectResult.reason || '下拉选择失败'}`);
      return false;
    };
    for (let i = 0; i < totalComboSlots; i += 1) {
      const button = await waitForAddressCombobox(field, i, root, strictScope, usedNodes, i === 0 ? 1200 : (i === 1 ? 4200 : 6500));
      if (!button) continue;
      usedNodes.add(button);
      await fillAddressLevel(i, button);
      await sleep(i === 0 ? 900 : (i === 1 ? 1200 : 260));
    }

    for (let pass = 0; pass < 4; pass += 1) {
      await sleep(pass === 0 ? 700 : (pass === 1 ? 1200 : 1800));
      const requiredComboCount = Math.max(expectedComboCount, attemptedSlots.size);
      const currentCombos = collectAddressComboNodes(field, root, strictScope, Math.max(requiredComboCount, totalComboSlots));
      const selectedComboCount = currentCombos.filter(isAddressComboFilled).length;
      if (requiredComboCount > 0 && selectedComboCount >= requiredComboCount) break;

      const retryUsedNodes = new Set();
      const retryCombos = collectAddressComboNodes(field, root, strictScope, totalComboSlots);
      for (let i = 0; i < totalComboSlots; i += 1) {
        const button = await waitForAddressCombobox(field, i, root, strictScope, retryUsedNodes, i === 0 ? 700 : (i === 1 ? 4200 : 6500));
        if (!button) continue;
        retryUsedNodes.add(button);
        const laterMissing = retryCombos
          .slice(i + 1)
          .some((node) => node instanceof Element && !isAddressComboFilled(node) && !isAddressComboDisabledEmpty(node));
        if (isAddressComboFilled(button) && !laterMissing) continue;
        if (isControlDisabledLike(resolveSelectTriggerNode(button))) continue;
        await fillAddressLevel(i, button, laterMissing && i < 2);
        await sleep(i === 0 ? 900 : (i === 1 ? 1300 : 320));
      }
    }

    const detailEl = findAddressDetailElement(field, root, strictScope);
    let detailApplied = false;
    const detailText = addr.detail || addr.full || addr.street || `${addr.streetName || ''}${addr.streetNo || ''}` || '';
    if (detailEl) {
      if (detailEl.matches('input, textarea')) {
        setNativeValue(detailEl, detailText);
        detailApplied = verifyTextLikeValue(detailEl, detailText);
      } else {
        detailEl.textContent = detailText;
        detailEl.dispatchEvent(new Event('input', { bubbles: true }));
        detailApplied = verifyTextLikeValue(detailEl, detailText);
      }
    }

    const finalRequiredComboCount = Math.max(expectedComboCount, attemptedSlots.size);
    const finalComboNodes = collectAddressComboNodes(field, root, strictScope, Math.max(finalRequiredComboCount, totalComboSlots));
    const finalSelectedComboCount = finalComboNodes.filter(isAddressComboFilled).length;
    const finalDisabledEmptyCount = countIgnorableAddressEmptyCombos(finalComboNodes);
    const finalComboStates = finalComboNodes.map((node, index) => ({
      index,
      display: readAddressComboDisplay(node),
      disabled: isControlDisabledLike(resolveSelectTriggerNode(node)),
      filled: isAddressComboFilled(node)
    }));
    const finalComboDenominator = finalRequiredComboCount
      ? Math.max(0, finalRequiredComboCount - finalDisabledEmptyCount)
      : Math.max(0, finalComboNodes.length - finalDisabledEmptyCount) || comboAttempted;
    if (finalComboDenominator > 0) {
      if (finalSelectedComboCount >= finalComboDenominator) {
        return buildFillResult(true, detailApplied ? `地址下拉与详细信息已填充(${finalSelectedComboCount}/${finalComboDenominator})` : `地址下拉已填充(${finalSelectedComboCount}/${finalComboDenominator})`, { target: detailEl || null, comboStates: finalComboStates });
      }
      if (comboAttempted > 0 && (comboApplied > 0 || finalSelectedComboCount > 0)) {
        return buildFillResult(false, comboErrors[0] || `地址级联未完整填充(${finalSelectedComboCount}/${finalComboDenominator})`, { target: detailEl || null, comboStates: finalComboStates });
      }
    }

    if ((comboAttempted > 0 && comboApplied === comboAttempted) || (detailApplied && comboAttempted === 0)) {
      return buildFillResult(true, detailApplied ? `地址下拉与详细信息已填充(${comboApplied}/${comboAttempted})` : `地址下拉已填充(${comboApplied}/${comboAttempted})`, { target: detailEl || null });
    }
    if (comboAttempted > 0 && comboApplied > 0) {
      return buildFillResult(false, comboErrors[0] || `地址级联未完整填充(${comboApplied}/${comboAttempted})`, { target: detailEl || null });
    }

    if (comboAttempted === 0 && !detailEl) {
      return buildFillResult(false, '地址组件未定位到下拉或详细地址输入框');
    }
    if (!detailText) {
      return buildFillResult(false, '地址值为空，未执行填充');
    }
    const reason = comboErrors[0] || '地址组件交互失败';
    return buildFillResult(false, reason, { target: detailEl || null });
  }

  async function fillSegmentedField(field, value, root, strictScope) {
    const meta = field.meta || {};
    const domIds = Array.isArray(meta.segmentDomIds) ? meta.segmentDomIds : [];
    const selectors = Array.isArray(meta.segmentSelectors) ? meta.segmentSelectors : [];
    const labels = Array.isArray(meta.segmentLabels) ? meta.segmentLabels : [];
    const placeholders = Array.isArray(meta.segmentPlaceholders) ? meta.segmentPlaceholders : [];
    const roles = Array.isArray(meta.segmentRoles) ? meta.segmentRoles : [];
    const addr = parseAddressValue(value);
    const raw = normText(typeof value === 'string' ? value : addr.detail || addr.full || addr.street || '');
    const rawCompact = raw.replace(/[^0-9A-Za-z]/g, '');

    const nodes = [];
    for (let i = 0; i < Math.max(domIds.length, selectors.length); i += 1) {
      let node = findByDomId(domIds[i], root, strictScope);
      if (!node && selectors[i]) {
        try {
          node = root.querySelector(selectors[i]);
          if (!node && !strictScope) node = document.querySelector(selectors[i]);
        } catch {
          node = null;
        }
      }
      if (node) nodes.push(node);
    }

    const isNumericSegmentField =
      field.kind === 'companyId' ||
      field.kind === 'bankCard' ||
      field.kind === 'verification' ||
      field?.constraints?.numericLike === true;

    if (isNumericSegmentField) {
      const container = findContainerNode(field, root, strictScope) || root || document.body;
      const shortInputSelector = 'input[type="text"], input:not([type]), input[type="tel"], input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"]';
      const candidates = queryAll(container, shortInputSelector).filter((node) => {
        if (!(node instanceof HTMLInputElement) || node.disabled || !visible(node)) return false;
        const maxLength = Number(node.getAttribute('maxlength') || 0);
        const size = Number(node.getAttribute('size') || 0);
        const inputMode = String(node.getAttribute('inputmode') || '').toLowerCase();
        const classText = String(node.getAttribute('class') || '').toLowerCase();
        const shortLike =
          (maxLength > 0 && maxLength <= 4) ||
          (size > 0 && size <= 4) ||
          /numeric|decimal/.test(inputMode) ||
          /verification|code|brn|arco-input-size-mini|input-number|verification-code/.test(classText);
        return shortLike;
      });
      for (const node of candidates) {
        if (!nodes.includes(node)) nodes.push(node);
      }
      nodes.sort((a, b) => {
        if (a === b) return 0;
        const pos = a.compareDocumentPosition(b);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      });
    }

    if (!nodes.length) return buildFillResult(false, '分段输入控件未定位');

    let workingRaw = raw;
    let workingCompact = rawCompact;
    if (isNumericSegmentField) {
      workingCompact = String(rawCompact || '').replace(/\D/g, '');
      if (!workingCompact) {
        workingCompact = String(workingRaw || '').replace(/\D/g, '');
      }
      let expectedLength = 0;
      for (const node of nodes) {
        const maxLength = Number(node.getAttribute('maxlength') || 0);
        expectedLength += Math.max(1, maxLength > 0 ? maxLength : 1);
      }
      if (expectedLength > 0) {
        if (workingCompact.length > expectedLength) {
          workingCompact = workingCompact.slice(0, expectedLength);
        } else if (workingCompact.length < expectedLength) {
          const need = expectedLength - workingCompact.length;
          let suffix = '';
          for (let i = 0; i < need; i += 1) {
            suffix += String(Math.floor(Math.random() * 10));
          }
          workingCompact += suffix;
        }
      }
      workingRaw = workingCompact;
    }

    let cursor = 0;
    let applied = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const slotHint = roles[index] || labels[index] || placeholders[index] || '';
      const role = inferAddressSlot(slotHint, '');
      let nextValue = pickAddressValue(addr, role, '');

      if (!nextValue && role === 'streetName') nextValue = splitStreetValue(addr.street || '').streetName;
      if (!nextValue && role === 'streetNo') nextValue = splitStreetValue(addr.street || '').streetNo;
      if (!nextValue && role === 'street') nextValue = addr.street || `${addr.streetNo || ''}${addr.streetName || ''}` || '';
      if (!nextValue && role === 'roomFloorBuilding') nextValue = `${addr.building || ''}${addr.floor || ''}${addr.room || ''}` || addr.detail || '';
      if (!nextValue && role === 'building') nextValue = addr.building || '';
      if (!nextValue && role === 'floor') nextValue = addr.floor || '';
      if (!nextValue && role === 'room') nextValue = addr.room || '';
      if (!nextValue && role === 'detail') nextValue = addr.detail || addr.full || '';

      const tag = node.tagName.toLowerCase();
      const roleAttr = String(node.getAttribute('role') || '').toLowerCase();
      const classText = String(node.getAttribute('class') || '').toLowerCase();
      const readonlyLike = node.hasAttribute('readonly') || String(node.getAttribute('aria-readonly') || '').toLowerCase() === 'true';
      const wrapperClassText = String(
        node.closest(
          '.arco-select, .arco-select-view, .arco-select-view-single, .ant-select, .ant-select-selector, .semi-select, .el-select, .n-base-selection'
        )?.getAttribute('class') || ''
      ).toLowerCase();
      const hintLooksSelect = /(請選擇|请选择|選擇|选择|地區|地区|區域|区域|district|region|area|province|city|cascader|級聯|级联)/i.test(slotHint);
      const selectLikeTrigger =
        tag === 'select' ||
        roleAttr === 'combobox' ||
        roleAttr === 'listbox' ||
        node.getAttribute('aria-controls') ||
        node.getAttribute('aria-owns') ||
        node.getAttribute('aria-haspopup') === 'listbox' ||
        (tag === 'input' && readonlyLike && /select|dropdown|picker|cascader|arco-select|ant-select|semi-select|el-select|n-base-select/.test(classText)) ||
        /arco-select|ant-select|semi-select|el-select|n-base-selection/.test(wrapperClassText) ||
        (hintLooksSelect && (tag === 'input' || tag === 'span' || tag === 'div'));

      if (!nextValue && !selectLikeTrigger) {
        if (meta.addressSegment && /^(province|city|district)$/.test(role)) {
          continue;
        }
        const maxLength = Math.max(Number(node.getAttribute('maxlength') || 0), 1);
        const slice = workingCompact ? workingCompact.slice(cursor, cursor + maxLength) : workingRaw.slice(cursor, cursor + maxLength);
        cursor += slice.length;
        nextValue = slice;
      }

      if (selectLikeTrigger) {
        if (tag === 'select' && node instanceof HTMLSelectElement) {
          const options = await waitNativeSelectOptions(node, nextValue || '', 1200);
          const targetOption = chooseNativeSelectOption(options, nextValue || '');
          if (targetOption) {
            node.value = targetOption.value;
            node.dispatchEvent(new Event('change', { bubbles: true }));
            node.dispatchEvent(new Event('input', { bubbles: true }));
            node.dispatchEvent(new Event('blur', { bubbles: true }));
            applied += 1;
          }
          await sleep(180);
          continue;
        }
        const triggerNode = resolveSelectTriggerNode(node);
        const selectResult = await selectComboboxOption(triggerNode, nextValue || '', field);
        if (selectResult.ok) applied += 1;
        await sleep(30);
        continue;
      }

      if (!nextValue) continue;
      setNativeValue(node, nextValue);
      applied += 1;
      await sleep(30);
      if (cursor >= (workingCompact || workingRaw).length) break;
    }

    if (applied > 0) return buildFillResult(true, `分段输入已填充 ${applied} 段`, { target: nodes[0] || null });
    return buildFillResult(false, '分段输入未写入任何内容', { target: nodes[0] || null });
  }

  function getFieldWidget(field = {}) {
    return normText(field?.meta?.widget || field?.widget || '').toLowerCase();
  }

  function findWidgetContainer(field, root, strictScope) {
    return findContainerNode(field, root, strictScope) || findElement(field, root, strictScope) || root || document.body;
  }

  function collectWidgetOptionNodes(field, root, strictScope, fallbackSelector = '') {
    const nodes = [];
    const seen = new Set();
    const push = (node) => {
      if (!(node instanceof Element) || seen.has(node)) return;
      if (strictScope && root instanceof Element && !root.contains(node)) return;
      if (!visible(node)) return;
      seen.add(node);
      nodes.push(node);
    };

    for (const option of Array.isArray(field?.options) ? field.options : []) {
      const byDomId = findByDomId(option?.domId, root, strictScope);
      if (byDomId) push(byDomId);
      if (!byDomId && option?.selector) {
        try {
          const scoped = queryOne(root, option.selector);
          if (scoped) push(scoped);
          else if (!strictScope) push(queryOne(document, option.selector));
        } catch {
          // ignore invalid selectors
        }
      }
    }

    if (!nodes.length && fallbackSelector) {
      const container = findWidgetContainer(field, root, strictScope);
      for (const node of queryAll(container, fallbackSelector)) push(node);
    }
    return nodes;
  }

  function widgetNodeText(node) {
    if (!(node instanceof Element)) return '';
    return normText(
      node.textContent ||
      node.getAttribute('aria-label') ||
      node.getAttribute('title') ||
      node.getAttribute('value') ||
      node.getAttribute('data-value') ||
      ''
    );
  }

  function isWidgetNodeSelected(node) {
    if (!(node instanceof Element)) return false;
    const ariaChecked = String(node.getAttribute('aria-checked') || '').toLowerCase();
    const ariaPressed = String(node.getAttribute('aria-pressed') || '').toLowerCase();
    const ariaSelected = String(node.getAttribute('aria-selected') || '').toLowerCase();
    const dataState = String(node.getAttribute('data-state') || '').toLowerCase();
    if (ariaChecked === 'true' || ariaPressed === 'true' || ariaSelected === 'true') return true;
    if (['checked', 'selected', 'on', 'active'].includes(dataState)) return true;
    if (node.getAttribute('data-formpilot-v2-widget-filled')) return true;
    const classText = String(node.getAttribute('class') || '').toLowerCase();
    if (/(^|\s)(active|selected|checked|is-active|is-selected|is-checked)(\s|$)/.test(classText)) return true;
    if (/--active|--selected|--checked|rating-icon--active|nps.*active/.test(classText)) return true;
    const nested = node.querySelector('[aria-checked="true"], [aria-pressed="true"], [aria-selected="true"], [data-state="checked"], [data-state="selected"], [data-formpilot-v2-widget-filled]');
    return !!nested;
  }

  function markWidgetNodeSelected(node, widget = '', index = 1) {
    if (!(node instanceof HTMLElement)) return false;
    const isMulti = widget === 'ranking';
    if (!isMulti) {
      const container = node.closest('[data-field-key], .fb-form-fields > *, tr, [role="radiogroup"], [role="group"]') || node.parentElement;
      for (const peer of Array.from(container?.querySelectorAll?.('[aria-checked], [aria-pressed], [aria-selected], [data-state], [data-formpilot-v2-widget-filled]') || [])) {
        if (!(peer instanceof Element) || peer === node || !peer.contains(node)) {
          peer.removeAttribute?.('data-formpilot-v2-widget-filled');
          if (peer.getAttribute?.('aria-checked') === 'true') peer.setAttribute('aria-checked', 'false');
          if (peer.getAttribute?.('aria-pressed') === 'true') peer.setAttribute('aria-pressed', 'false');
          if (peer.getAttribute?.('aria-selected') === 'true') peer.setAttribute('aria-selected', 'false');
          if (['checked', 'selected', 'active'].includes(String(peer.getAttribute?.('data-state') || '').toLowerCase())) peer.setAttribute('data-state', 'unchecked');
        }
      }
    }
    node.setAttribute('data-formpilot-v2-widget-filled', String(index || 1));
    if (node.getAttribute('role') === 'radio') node.setAttribute('aria-checked', 'true');
    else node.setAttribute('aria-pressed', 'true');
    if (widget === 'ranking') {
      const indexNode = node.querySelector('.fb-runtime-ranking-index');
      if (indexNode) {
        indexNode.textContent = String(index);
        indexNode.setAttribute('data-formpilot-v2-widget-filled', String(index));
      }
    }
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function pickWidgetChoiceNode(nodes = [], value = null, preferLast = false) {
    const candidates = nodes.filter((node) => node instanceof Element && visible(node));
    if (!candidates.length) return null;
    const wanted = flattenChoiceValue(value).map((item) => normalizeChoiceText(item)).filter(Boolean);
    if (wanted.length) {
      const matched = candidates.find((node) => {
        const variants = buildTextVariants(widgetNodeText(node)).map((item) => normalizeChoiceText(item));
        return wanted.some((item) => variants.includes(item));
      });
      if (matched) return matched;
    }
    return preferLast ? candidates[candidates.length - 1] : (pickRandomChoice(candidates) || candidates[0]);
  }

  async function fillButtonChoiceWidgetField(field, value, root, strictScope, widget = '') {
    const fallbackSelector = widget === 'nps'
      ? '.nps-scale__score-btn'
      : widget === 'rating'
        ? '.rating-item'
        : '[role="radio"], button[role="radio"], .fb-ui-radio-group-item';
    const nodes = collectWidgetOptionNodes(field, root, strictScope, fallbackSelector);
    if (!nodes.length) return buildFillResult(false, '按钮式选项未定位');
    const target = pickWidgetChoiceNode(nodes, value, widget === 'rating' || widget === 'nps');
    if (!(target instanceof HTMLElement)) return buildFillResult(false, '按钮式选项不可点击');
    fireOptionClick(target);
    await sleep(120);
    if (!isWidgetNodeSelected(target)) markWidgetNodeSelected(target, widget || 'choice', nodes.indexOf(target) + 1);
    const ok = isWidgetNodeSelected(target);
    return buildFillResult(ok, ok ? '按钮式选项已选择' : '按钮式选项点击未生效', { target });
  }

  async function fillRankingField(field, value, root, strictScope) {
    const nodes = collectWidgetOptionNodes(field, root, strictScope, '.fb-runtime-ranking-item');
    if (!nodes.length) return buildFillResult(false, '排序选项未定位');
    const wanted = flattenChoiceValue(value).map((item) => normalizeChoiceText(item)).filter(Boolean);
    const remaining = nodes.slice();
    const ordered = [];
    for (const item of wanted) {
      const idx = remaining.findIndex((node) => buildTextVariants(widgetNodeText(node)).map((text) => normalizeChoiceText(text)).includes(item));
      if (idx >= 0) ordered.push(remaining.splice(idx, 1)[0]);
    }
    ordered.push(...remaining);
    let applied = 0;
    for (let i = 0; i < ordered.length; i += 1) {
      const node = ordered[i];
      if (!(node instanceof HTMLElement)) continue;
      fireOptionClick(node);
      await sleep(70);
      if (!isWidgetNodeSelected(node)) markWidgetNodeSelected(node, 'ranking', i + 1);
      if (isWidgetNodeSelected(node)) applied += 1;
    }
    return buildFillResult(applied > 0, applied > 0 ? `排序题已选择 ${applied} 项` : '排序题点击未生效', { target: ordered[0] || null });
  }

  function setButtonDisplayText(button, text = '') {
    if (!(button instanceof HTMLElement)) return false;
    const value = normText(text);
    if (!value) return false;
    const textNode = Array.from(button.querySelectorAll('span, div')).find((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (!visible(node)) return false;
      if (node.querySelector('svg')) return false;
      return normText(node.textContent || '') || node.hasAttribute('data-placeholder');
    }) || button;
    textNode.textContent = value;
    button.setAttribute('data-formpilot-v2-widget-filled', value);
    button.dispatchEvent(new Event('input', { bubbles: true }));
    button.dispatchEvent(new Event('change', { bubbles: true }));
    button.dispatchEvent(new Event('blur', { bubbles: true }));
    return normText(button.textContent || '').includes(value);
  }

  function parseDatePartsForWidget(value = '', collectType = 'ymd') {
    const raw = String(value || '').trim();
    const halfYearWindow = getHalfYearDateWindow();
    let date = parseDateForCollectType(raw, collectType, halfYearWindow.today) || new Date(halfYearWindow.today);
    date = clampDateToBounds(date, halfYearWindow.min, halfYearWindow.max) || new Date(halfYearWindow.today);
    if (collectType === 'md') {
      const mdMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})$/);
      if (mdMatch) {
        const reference = new Date(2000, Number(mdMatch[1]) - 1, Number(mdMatch[2]));
        if (reference.getMonth() === Number(mdMatch[1]) - 1 && reference.getDate() === Number(mdMatch[2])) {
          date = reference;
        }
      }
    }
    return {
      year: String(date.getFullYear()),
      month: String(date.getMonth() + 1),
      day: String(date.getDate())
    };
  }

  function birthdaySegmentMatches(trigger, role = '', targetText = '') {
    const display = readSelectLikeDisplayText(trigger);
    if (!display || isPlaceholderDisplayText(display)) return false;
    const numbers = display.match(/\d+/g) || [];
    if (!numbers.length) return false;
    const targetNumber = Number(targetText);
    if (!Number.isFinite(targetNumber)) return false;
    if (role === 'year') return numbers.some((value) => Number(value) === targetNumber && String(value).length >= 4);
    return numbers.some((value) => Number(value) === targetNumber);
  }

  async function fillBirthdayField(field, value, root, strictScope, settings = {}) {
    const container = findWidgetContainer(field, root, strictScope);
    const meta = field?.meta || {};
    const roles = Array.isArray(meta.segmentRoles) ? meta.segmentRoles : ['year', 'month', 'day'];
    const domIds = Array.isArray(meta.segmentDomIds) ? meta.segmentDomIds : [];
    const selectors = Array.isArray(meta.segmentSelectors) ? meta.segmentSelectors : [];
    const collectType = normalizeDateCollectType(field);
    const parts = parseDatePartsForWidget(value, collectType);
    const segments = [];
    const seenNodes = new Set();
    for (let i = 0; i < Math.max(roles.length, domIds.length, selectors.length); i += 1) {
      let node = findByDomId(domIds[i], root, strictScope);
      if (!node && selectors[i]) {
        try {
          node = queryOne(container, selectors[i]) || (!strictScope ? queryOne(document, selectors[i]) : null);
        } catch {
          node = null;
        }
      }
      if (node instanceof Element && !seenNodes.has(node)) {
        seenNodes.add(node);
        segments.push({ node, role: roles[i] || '' });
      }
    }
    if (!segments.length) {
      const fallbackNodes = queryAll(container, 'button[role="combobox"], [role="combobox"]')
        .filter((node) => node instanceof Element && visible(node) && !node.closest('.fb-runtime-control-clear'))
        .slice(0, roles.length || 3);
      fallbackNodes.forEach((node, index) => segments.push({ node, role: roles[index] || '' }));
    }
    if (!segments.length) return buildFillResult(false, '生日日期控件未定位');

    const calendarTypeNodes = [
      ...((Array.isArray(meta.calendarTypeDomIds) ? meta.calendarTypeDomIds : []).map((id) => findByDomId(id, root, strictScope)).filter(Boolean)),
      ...((Array.isArray(meta.calendarTypeSelectors) ? meta.calendarTypeSelectors : []).map((selector) => queryOne(container, selector)).filter(Boolean))
    ];
    const solar = calendarTypeNodes.find((node) => /公历|陽曆|阳历|solar|gregorian/i.test(widgetNodeText(node))) || calendarTypeNodes[0];
    if (solar instanceof HTMLElement && !isWidgetNodeSelected(solar)) {
      fireOptionClick(solar);
      await sleep(80);
      if (!isWidgetNodeSelected(solar)) {
        return buildFillResult(false, '生日控件未能切换到公历', { target: solar });
      }
    }

    let applied = 0;
    for (let i = 0; i < segments.length; i += 1) {
      const { node, role: segmentRole } = segments[i];
      const role = segmentRole || (i === 0 ? 'year' : (i === 1 ? 'month' : 'day'));
      const targetText = parts[role] || '';
      if (!targetText) continue;
      const trigger = resolveSelectTriggerNode(node);
      const result = await selectComboboxOption(trigger, targetText, { ...field, kind: 'select', meta: { ...(field.meta || {}), birthdaySegment: role, selectLike: true } }, settings);
      await sleep(80);
      if (result?.ok && birthdaySegmentMatches(trigger, role, targetText)) applied += 1;
      await sleep(100);
    }
    const expected = segments.filter(({ role }) => !!parts[role]).length;
    return buildFillResult(applied === expected && expected > 0, applied ? `生日已真实选择 ${applied}/${expected} 段` : '生日控件填充未生效', { target: segments[0]?.node || null });
  }

  async function fillCascaderField(field, value, root, strictScope, settings = {}) {
    const el = findElement(field, root, strictScope);
    if (!el) return buildFillResult(false, '级联控件未定位');
    const trigger = resolveSelectTriggerNode(el);
    const targetText = normText(value || '') || 'defaultRegion / defaultMainland';
    const result = await selectComboboxOption(trigger, targetText, field, settings);
    if (result?.ok) return buildFillResult(true, result.reason || '级联控件已选择', { target: trigger });
    if (/未打开下拉面板|面板未打开/.test(String(result?.reason || ''))) {
      const displayText = formatCascaderDisplayText(targetText);
      if (displayText && setButtonDisplayText(trigger, displayText)) {
        trigger.setAttribute('data-formpilot-v2-cascader-static-fallback', targetText);
        return buildFillResult(true, '级联控件静态兜底写入展示路径', { target: trigger });
      }
    }
    return buildFillResult(false, result?.reason || '级联控件选择失败', { target: trigger });
  }

  function getSettingsPool(settings = {}, path = '') {
    const pools = settings?.testDataLibrary?.pools || {};
    let node = pools;
    for (const part of String(path || '').split('.').filter(Boolean)) {
      node = node?.[part];
      if (node == null) return [];
    }
    return Array.isArray(node) ? node.map((item) => String(item || '').trim()).filter(Boolean) : [];
  }

  function pickSettingsPoolValue(settings = {}, path = '', fallback = '') {
    const pool = getSettingsPool(settings, path);
    return (pickRandomChoice(pool) || pool[0] || fallback || '').trim();
  }

  function inferPhoneRegionText(text = '') {
    const value = normText(text);
    if (/(^|[^\d])\+?852([^\d]|$)|香港|hong\s*kong|\bhk\b/i.test(value)) return 'hk';
    if (/(^|[^\d])\+?853([^\d]|$)|澳门|澳門|macau|macao|\bmo\b/i.test(value)) return 'mo';
    if (/(^|[^\d])\+?86([^\d]|$)|中国|中國|大陆|大陸|内地|內地|china|\bcn\b/i.test(value)) return 'cn';
    return '';
  }

  function inferIdDocumentRoleText(text = '') {
    const value = normText(text);
    if (/passport|护照|護照/i.test(value)) return 'passport';
    if (/hmtResident|港澳台|港澳臺|居民证|居民證|居住证|居住證|台胞|回乡|回鄉/i.test(value)) return 'hmtResident';
    if (/cnId|身份证|身份證|身份証|身分證|身分証|id\s*card|identity/i.test(value)) return 'cnId';
    return '';
  }

  function readCompositePrefixText(field, inputEl, root, strictScope) {
    const meta = field?.meta || {};
    const container = findContainerNode(field, root, strictScope) ||
      inputEl?.closest?.('.fb-runtime-input-control, .fb-runtime-control, .form-item, .form-field, [data-field-key]') ||
      root ||
      document.body;
    const triggers = queryAll(container, 'button[role="combobox"], [role="combobox"], button[aria-haspopup="listbox"], button[aria-controls]')
      .filter((node) => node instanceof Element && node !== inputEl && visible(node));
    const beforeInput = triggers.filter((node) => {
      if (!(inputEl instanceof Element)) return true;
      const pos = node.compareDocumentPosition(inputEl);
      return !!(pos & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    const trigger = beforeInput[beforeInput.length - 1] || triggers[0] || null;
    const liveText = trigger ? readSelectLikeDisplayText(trigger) : '';
    const metaText = Array.isArray(meta.prefixSelectedTexts) ? meta.prefixSelectedTexts.find(Boolean) : '';
    const metaRole = Array.isArray(meta.prefixSelectedRoles) ? meta.prefixSelectedRoles.find(Boolean) : '';
    return normText(`${liveText || metaText || ''} ${metaRole || ''}`);
  }

  function normalizePhoneForRegion(value = '', region = '', settings = {}) {
    if (!region) return String(value || '');
    let digits = String(value || '').replace(/\D/g, '');
    const fallback = {
      cn: pickSettingsPoolValue(settings, 'mobile.cn', '13800138000'),
      hk: pickSettingsPoolValue(settings, 'mobile.hk', '61234567'),
      mo: pickSettingsPoolValue(settings, 'mobile.mo', '66123456')
    };
    if (region === 'hk') {
      if (digits.startsWith('852') && digits.length > 8) digits = digits.slice(-8);
      if (!/^[569]\d{7}$/.test(digits)) digits = String(fallback.hk || '').replace(/\D/g, '').slice(-8);
      return digits;
    }
    if (region === 'mo') {
      if (digits.startsWith('853') && digits.length > 8) digits = digits.slice(-8);
      if (!/^6\d{7}$/.test(digits)) digits = String(fallback.mo || '').replace(/\D/g, '').slice(-8);
      return digits;
    }
    if (digits.startsWith('86') && digits.length > 11) digits = digits.slice(-11);
    if (!/^1\d{10}$/.test(digits)) digits = String(fallback.cn || '').replace(/\D/g, '').slice(-11);
    return digits;
  }

  function inferIdDocumentRoleFromValue(value = '') {
    const text = String(value || '').trim();
    if (/^[A-Z]{1,2}\d{7,8}$/i.test(text)) return 'passport';
    if (/^(81|82|83)\d{15}$/.test(text)) return 'hmtResident';
    if (/^\d{17}[\dXx]$/.test(text)) return 'cnId';
    return '';
  }

  function normalizeIdDocumentForRole(value = '', role = '', settings = {}) {
    if (!role) return String(value || '');
    const text = String(value || '').trim();
    const currentRole = inferIdDocumentRoleFromValue(text);
    if (currentRole === role) return text;
    if (role === 'passport') return pickSettingsPoolValue(settings, 'idDocument.passport', 'E12345678');
    if (role === 'hmtResident' || role === 'hmt') return pickSettingsPoolValue(settings, 'idDocument.hmtResident', '820000199201019876');
    return pickSettingsPoolValue(settings, 'idDocument.cnId', '110101199001011234');
  }

  function normalizeCompositeInputValue(field, value, inputEl, root, strictScope, settings = {}) {
    const kind = String(field?.kind || '');
    if (kind !== 'phone' && kind !== 'idcard') return String(value || '');
    const prefixText = readCompositePrefixText(field, inputEl, root, strictScope);
    const hasCompositePrefix = !!prefixText || field?.meta?.compositeInput === true;
    if (!hasCompositePrefix) return String(value || '');
    if (kind === 'phone') {
      const region = inferPhoneRegionText(prefixText) || inferPhoneRegionText(value);
      return normalizePhoneForRegion(value, region, settings);
    }
    const role = inferIdDocumentRoleText(prefixText) || inferIdDocumentRoleText(value);
    return normalizeIdDocumentForRole(value, role, settings);
  }

  function findChoiceGroupContainer(node, root) {
    if (!(node instanceof Element)) return root || document.body;
    return node.closest(
      '.arco-form-item, .ant-form-item, .el-form-item, fieldset, [role="group"], [role="radiogroup"], .arco-radio-group, .arco-checkbox-group, .ant-radio-group, .ant-checkbox-group, .el-radio-group, .el-checkbox-group, .form-item, .form-field, .fb-choice-options, .fb-runtime-input-field, .fb-form-field, .fb-form-item, .fb-form-fields > *'
    ) || root || document.body;
  }

  function normalizeChoiceGroupName(name = '') {
    return normText(String(name || '').replace(/\[\]$/g, ''));
  }

  function extractChoiceGroupHintFromField(field = {}) {
    const candidates = [
      field?.meta?.optionName,
      field?.meta?.groupName,
      field?.meta?.name,
      field?.name,
      field?.selector,
      field?.domId
    ];
    for (const value of candidates) {
      const text = normText(value || '');
      if (!text) continue;
      const m = text.match(/new_item_[\w-]+/i);
      if (m && m[0]) return normalizeChoiceGroupName(m[0]);
    }
    return '';
  }

  function filterChoiceInputsByGroup(inputs = [], anchorInput = null, groupHint = '') {
    const list = Array.isArray(inputs) ? inputs.filter((node) => node instanceof HTMLInputElement) : [];
    if (!list.length) return [];
    if (anchorInput instanceof HTMLInputElement) {
      const anchorName = normalizeChoiceGroupName(anchorInput.name || '');
      const anchorOptionName = normText(anchorInput.getAttribute('data-option_name') || '');
      return list.filter((input) => {
        const sameName = normalizeChoiceGroupName(input.name || '') === anchorName;
        const sameOptionName = normText(input.getAttribute('data-option_name') || '') === anchorOptionName;
        return sameName || sameOptionName;
      });
    }
    if (groupHint) {
      return list.filter((input) => {
        const inputName = normalizeChoiceGroupName(input.name || '');
        const optionName = normText(input.getAttribute('data-option_name') || '');
        return inputName === groupHint || optionName === groupHint;
      });
    }
    return list;
  }

  function buildChoiceGroupKey(field = {}, root = null, strictScope = false) {
    const parts = [
      field?.kind || '',
      field?.meta?.groupName || '',
      field?.meta?.optionName || '',
      field?.containerSelector || '',
      field?.meta?.containerSelector || '',
      field?.selector || '',
      field?.domId || '',
      field?.label || '',
      field?.placeholder || ''
    ];
    const target = findElement(field, root || document, strictScope);
    if (target instanceof Element) {
      const input = findNativeChoiceInput(target);
      if (input instanceof HTMLInputElement) {
        parts.push(input.id || '', normalizeChoiceGroupName(input.name || ''), input.getAttribute('data-option_name') || '');
      }
      const container = findChoiceGroupContainer(target, root || document.body);
      if (container instanceof Element) {
        parts.push(
          container.getAttribute(EID_ATTR) || '',
          container.id || '',
          container.getAttribute('name') || ''
        );
      }
    }
    const normalized = parts.map((item) => normText(item)).filter(Boolean).join('|');
    return normalized || '';
  }

  function fillChoiceCompanionInputs(node, root, strictScope, field = null) {
    if (!(node instanceof Element)) return 0;
    const optionHint = collectOptionTexts(node).join(' ');
    const fieldHint = `${field?.label || ''} ${field?.placeholder || ''} ${field?.context || ''}`;
    const hint = `${fieldHint} ${optionHint}`.trim();
    const optionNode = node.closest(
      'label, [role="radio"], [role="checkbox"], .arco-radio, .arco-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper, .el-radio, .el-checkbox'
    ) || node;
    const scopes = [
      optionNode,
      findChoiceGroupContainer(optionNode, root)
    ].filter(Boolean);
    const visited = new Set();
    let filled = 0;

    for (const scope of scopes) {
      const candidates = queryAll(scope, 'input, textarea').filter((el) => {
        if (!(el instanceof Element) || visited.has(el)) return false;
        visited.add(el);
        const type = String(el.getAttribute('type') || '').toLowerCase();
        if (['checkbox', 'radio', 'hidden', 'file'].includes(type)) return false;
        if (el.disabled) return false;
        if (!visible(el)) return false;
        if (strictScope && !inRoot(root, el)) return false;
        return true;
      });
      for (const el of candidates) {
        if (fillCompanionInputElement(el, hint, field?.constraints || {})) filled += 1;
      }
      if (filled > 0) break;
    }

    return filled;
  }

  function fillOtherChoiceCompanionInput(node, root, strictScope, field = null) {
    if (!(node instanceof Element)) return false;
    const container = findChoiceGroupContainer(node, root);
    const inputSelector = 'input[type="text"], input:not([type]), input[type="search"], textarea';
    let candidates = queryAll(container, inputSelector).filter((el) => visible(el) && !el.disabled);
    if (!candidates.length && !strictScope) {
      const parent = container.parentElement || root || document.body;
      candidates = queryAll(parent, inputSelector).filter((el) => visible(el) && !el.disabled);
    }
    const target = candidates.find((el) => !normText(el.value || '')) || candidates[0] || null;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return false;
    const text = normalizeByInputConstraint(
      target,
      '其他补充说明：由系统随机填充',
      '其他 说明',
      field?.constraints || {}
    );
    setNativeValue(target, text);
    return verifyTextLikeValue(target, text);
  }

  function resolveChoiceClickableNode(node) {
    if (!(node instanceof Element)) return null;
    return (
      node.closest(
        'label, .imgView, .labelDivView, [role="radio"], [role="checkbox"], .arco-radio, .arco-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper, .el-radio, .el-checkbox, .fb-runtime-control, .fb-checkbox-choice-option, .fb-radio-choice-option, .option, .option-item'
      ) || node
    );
  }

  function findNativeChoiceInput(node) {
    if (!(node instanceof Element)) return null;
    if (node.matches('input[type="checkbox"], input[type="radio"]')) return node;
    const nested = node.querySelector('input[type="checkbox"], input[type="radio"]');
    return nested instanceof HTMLInputElement ? nested : null;
  }

  function setNativeChecked(input, checked = true) {
    if (!(input instanceof HTMLInputElement)) return false;
    try {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
      descriptor?.set?.call(input, !!checked);
    } catch {
      // ignore
    }
    input.checked = !!checked;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.checked === !!checked;
  }

  function ensureChoiceInputChecked(node, isCheckbox = false) {
    const input = findNativeChoiceInput(node);
    if (!(input instanceof HTMLInputElement)) return false;
    if (input.checked) return true;
    input.focus?.();
    // 优先走用户态 click（兼容依赖点击事件的问卷引擎），失败再强制设值。
    input.click?.();
    if (input.checked) return true;
    if (!isCheckbox) {
      // 单选必须显式设 true，防止自定义组件未响应 click。
      return setNativeChecked(input, true);
    }
    return setNativeChecked(input, true);
  }

  function markAriaChoiceChecked(node, isCheckbox = false) {
    if (!(node instanceof Element)) return false;
    const stateNode = node.matches('[role="checkbox"], [role="radio"], [aria-checked], [data-state]')
      ? node
      : node.querySelector('[role="checkbox"], [role="radio"], [aria-checked], [data-state]');
    if (!(stateNode instanceof Element)) return false;

    if (!isCheckbox) {
      const group = stateNode.closest('[role="radiogroup"]') || stateNode.parentElement;
      for (const peer of Array.from(group?.querySelectorAll?.('[role="radio"], [aria-checked], [data-state]') || [])) {
        if (peer === stateNode || peer.contains(stateNode) || stateNode.contains(peer)) continue;
        if (String(peer.getAttribute('role') || '').toLowerCase() !== 'radio') continue;
        peer.setAttribute('aria-checked', 'false');
        if (peer.getAttribute('data-state') === 'checked') peer.setAttribute('data-state', 'unchecked');
      }
    }

    stateNode.setAttribute('aria-checked', 'true');
    stateNode.setAttribute('aria-selected', 'true');
    stateNode.setAttribute('data-state', 'checked');
    stateNode.setAttribute('data-formpilot-v2-choice-filled', '1');
    stateNode.dispatchEvent(new Event('input', { bubbles: true }));
    stateNode.dispatchEvent(new Event('change', { bubbles: true }));
    node.dispatchEvent?.(new Event('input', { bubbles: true }));
    node.dispatchEvent?.(new Event('change', { bubbles: true }));
    return isNodeChecked(node, isCheckbox) || isNodeChecked(stateNode, isCheckbox);
  }

  async function applyLegacyChoiceFallback(field, root, strictScope, isCheckbox = false) {
    const anchor = findElement(field, root, strictScope);
    const anchorInput = findNativeChoiceInput(anchor instanceof Element ? anchor : null);
    const container =
      (anchor instanceof Element && findChoiceGroupContainer(anchor, root)) ||
      findContainerNode(field, root, strictScope) ||
      root ||
      document.body;
    if (!(container instanceof Element)) return false;
    const selector = isCheckbox
      ? 'input[type="checkbox"].js_select_multi_input, input[type="checkbox"][data-option_name]'
      : 'input[type="radio"].js_select_single_input, input[type="radio"][data-option_name], input[type="radio"]';
    const allInputs = queryAll(container, selector)
      .filter((node) => node instanceof HTMLInputElement)
      .filter((input) => !input.disabled)
      .filter((input) => (strictScope ? inRoot(root, input) : true));
    const groupHint = extractChoiceGroupHintFromField(field);
    const scopedInputs = filterChoiceInputsByGroup(allInputs, anchorInput, groupHint);
    const candidates = scopedInputs.length ? scopedInputs : allInputs;
    if (!candidates.length) return false;
    const pickable = isCheckbox ? candidates.filter((input) => !input.checked) : candidates;
    const pickedInput = pickRandomChoice(pickable.length ? pickable : candidates);
    if (!(pickedInput instanceof HTMLInputElement)) return false;
    const clickNode = resolveChoiceClickableNode(pickedInput) || pickedInput;
    fireOptionClick(clickNode);
    await sleep(60);
    if (!ensureChoiceInputChecked(pickedInput, isCheckbox)) {
      if (!setNativeChecked(pickedInput, true)) return false;
    }
    await sleep(80);
    return !!pickedInput.checked;
  }

  async function fillChoiceField(field, root, strictScope, isCheckbox, value = null) {
    const options = Array.isArray(field.options) ? field.options : [];
    if (!options.length) {
      const anchor = findElement(field, root, strictScope);
      const container = (anchor && findChoiceGroupContainer(anchor, root)) || findContainerNode(field, root, strictScope);
      if (!(container instanceof Element)) {
        return buildFillResult(false, '选项组触发器未定位');
      }
      const anchorInput = findNativeChoiceInput(anchor instanceof Element ? anchor : null);
      const groupHint = extractChoiceGroupHintFromField(field);
      const selector = isCheckbox
        ? 'input[type="checkbox"], .js_select_multi_input'
        : 'input[type="radio"], .js_select_single_input';
      const candidates = queryAll(container, selector).filter((node) => {
        if (!(node instanceof Element)) return false;
        if (strictScope && !inRoot(root, node)) return false;
        const input = findNativeChoiceInput(node);
        if (!(input instanceof HTMLInputElement)) return false;
        if (input.disabled) return false;
        if (anchorInput instanceof HTMLInputElement) {
          const sameName = normalizeChoiceGroupName(input.name || '') === normalizeChoiceGroupName(anchorInput.name || '');
          const sameOptionName = normText(input.getAttribute('data-option_name') || '') === normText(anchorInput.getAttribute('data-option_name') || '');
          if (!sameName && !sameOptionName) return false;
        } else if (groupHint) {
          const inputName = normalizeChoiceGroupName(input.name || '');
          const optionName = normText(input.getAttribute('data-option_name') || '');
          if (inputName !== groupHint && optionName !== groupHint) return false;
        }
        return true;
      });
      const available = isCheckbox
        ? candidates.filter((node) => {
            const input = findNativeChoiceInput(node);
            return !(input instanceof HTMLInputElement) || !input.checked;
          })
        : candidates;
      const picked = pickRandomChoice(available.length ? available : candidates);
      if (picked) {
        const clickNode = resolveChoiceClickableNode(picked) || picked;
        fireOptionClick(clickNode);
        const ok = ensureChoiceInputChecked(clickNode, isCheckbox);
        return buildFillResult(ok, ok ? '选项组已随机点选 1 项（兜底）' : '选项组兜底点选失败', { target: clickNode });
      }
      const target = findElement(field, root, strictScope);
      if (!target) return buildFillResult(false, '选项组触发器未定位');
      target.click();
      return buildFillResult(true, '已点击选项组触发器', { target });
    }

    const desiredValues = flattenChoiceValue(value);
    const candidates = [];

    for (let i = 0; i < options.length; i += 1) {
      const opt = options[i];
      let node = findByDomId(opt.domId, root, strictScope);
      if (!node && opt.selector) {
        try {
          node = root.querySelector(opt.selector);
          if (!node && !strictScope) node = document.querySelector(opt.selector);
        } catch {
          node = null;
        }
      }
      if (!node) continue;

      const texts = Array.from(
        new Set([
          ...collectOptionTexts(node),
          normText(opt.label || ''),
          normText(opt.value || '')
        ])
      ).filter(Boolean);

      candidates.push({ node, texts });
    }

    if (!candidates.length) return buildFillResult(false, '选项节点未定位或不可点击');

    const selectedNodes = new Set();
    const failedNodes = new Set();
    const chosen = [];
    const nativeInputs = candidates
      .map((candidate) => findNativeChoiceInput(candidate.node))
      .filter((input) => input instanceof HTMLInputElement);
    const groupMax = nativeInputs
      .map((input) => Number.parseInt(input.getAttribute('data-max') || '', 10))
      .find((num) => Number.isFinite(num) && num > 0);
    const desiredPickCount = desiredValues.length ? desiredValues.length : 1;
    const maxPick = isCheckbox
      ? Math.max(1, Math.min(groupMax || desiredPickCount, candidates.length))
      : 1;

    const clickCandidate = async (candidate) => {
      if (!candidate?.node || selectedNodes.has(candidate.node) || failedNodes.has(candidate.node)) return false;
      const nativeInput = findNativeChoiceInput(candidate.node);
      if (isCheckbox && nativeInput instanceof HTMLInputElement && nativeInput.checked) {
        selectedNodes.add(candidate.node);
        return false;
      }
      const clickableNode = resolveChoiceClickableNode(candidate.node) || candidate.node;
      if (nativeInput instanceof HTMLInputElement && !nativeInput.checked) {
        fireOptionClick(clickableNode);
        await sleep(40);
      } else if (!(nativeInput instanceof HTMLInputElement)) {
        fireOptionClick(clickableNode);
        await sleep(40);
        if (!isNodeChecked(candidate.node, isCheckbox)) {
          const nestedAriaControl = clickableNode.querySelector?.('[role="radio"], [role="checkbox"]');
          if (nestedAriaControl instanceof HTMLElement && nestedAriaControl !== clickableNode) {
            fireOptionClick(nestedAriaControl);
            await sleep(60);
          }
        }
      }
      if (!isNodeChecked(candidate.node, isCheckbox)) ensureChoiceInputChecked(nativeInput || clickableNode, isCheckbox);
      if (!isNodeChecked(candidate.node, isCheckbox) && nativeInput instanceof HTMLInputElement) setNativeChecked(nativeInput, true);
      if (!isNodeChecked(candidate.node, isCheckbox) && !(nativeInput instanceof HTMLInputElement)) {
        markAriaChoiceChecked(candidate.node, isCheckbox) || markAriaChoiceChecked(clickableNode, isCheckbox);
      }
      if (!isNodeChecked(candidate.node, isCheckbox)) {
        failedNodes.add(candidate.node);
        return false;
      }
      selectedNodes.add(candidate.node);
      chosen.push(candidate.node);
      fillChoiceCompanionInputs(candidate.node, root, strictScope, field);
      const textJoined = normText((candidate.texts || []).join(' '));
      if (/其他|其它|\bother\b/i.test(textJoined)) {
        fillOtherChoiceCompanionInput(candidate.node, root, strictScope, field);
      }
      await sleep(80);
      return true;
    };

    const matchCandidate = (wanted) =>
      candidates.find((candidate) =>
        !selectedNodes.has(candidate.node) && matchesDisplayText(candidate.texts.join(' '), [wanted])
      ) || null;

    for (const wanted of desiredValues) {
      if (chosen.length >= maxPick) break;
      const matched = matchCandidate(wanted);
      if (matched) await clickCandidate(matched);
    }

    while (chosen.length < maxPick) {
      const remaining = candidates.filter((candidate) => !selectedNodes.has(candidate.node) && !failedNodes.has(candidate.node) && (!isCheckbox || !candidate.node.checked));
      const randomCandidate = pickRandomChoice(remaining);
      if (!randomCandidate) break;
      await clickCandidate(randomCandidate);
    }

    if (chosen.length > 0) {
      return buildFillResult(true, `已选择 ${chosen.length} 项`, { target: chosen[0] });
    }
    return buildFillResult(false, '选项节点未定位或不可点击', { target: candidates[0]?.node || null });
  }

  function normalizeTimeText(value = '') {
    const text = String(value || '').trim();
    const match = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
    if (match) {
      const hour = match[1].padStart(2, '0');
      const minute = match[2] || '00';
      const second = match[3] || '';
      return second ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
    }
    const compact = text.match(/\b([01]?\d|2[0-3])([0-5]\d)([0-5]\d)?\b/);
    if (compact) {
      const hour = compact[1].padStart(2, '0');
      const minute = compact[2] || '00';
      const second = compact[3] || '';
      return second ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
    }
    return '12:30';
  }

  function collectTimePickerPanels() {
    return Array.from(
      document.querySelectorAll(
        '.fb-timepicker-container, .mobile-time-picker-panel, .time-picker-panel, [data-timepicker-panel], [data-time-picker-panel]'
      )
    ).filter((node) => node instanceof Element && visible(node));
  }

  function timePartAliases(part = '', role = 'minute') {
    const padded = String(part || '').padStart(2, '0');
    const raw = String(Number(part || 0));
    if (role === 'hour') return [padded, raw, `${raw}\u65f6`, `${raw}\u6642`, `${raw}\u70b9`, `${raw}\u9ede`];
    if (role === 'second') return [padded, raw, `${raw}\u79d2`];
    return [padded, raw, `${raw}\u5206`];
  }

  function collectTimePartNodes(scope) {
    if (!(scope instanceof Element)) return [];
    return Array.from(
      scope.querySelectorAll(
        'button, [role="option"], [role="menuitem"], li, [data-value], [data-time-value], [class*="timepicker-item"], [class*="time-picker-item"]'
      )
    )
      .filter((node) => node instanceof HTMLElement && visible(node))
      .map((node) => ({
        node,
        text: normText(node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || ''),
        value: normText(node.getAttribute('data-value') || node.getAttribute('data-time-value') || node.getAttribute('value') || '')
      }))
      .filter((item) => item.text || item.value);
  }

  function chooseTimePartNode(nodes = [], aliases = []) {
    const wanted = aliases.flatMap((item) => buildTextVariants(item)).map((item) => normalizeChoiceText(item)).filter(Boolean);
    return nodes.find((item) => {
      const variants = [...buildTextVariants(item.text), ...buildTextVariants(item.value)]
        .map((value) => normalizeChoiceText(value))
        .filter(Boolean);
      return wanted.some((target) => variants.some((value) => value === target));
    }) || null;
  }

  async function tryFillTimePickerPanel(target, normalizedTime = '12:30') {
    const trigger = resolveSelectTriggerNode(target);
    const beforePanels = new Set(collectTimePickerPanels());
    dispatchSelectOpenSequence(trigger, 'mouse');
    let panel = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 900) {
      await sleep(80);
      const panels = collectTimePickerPanels();
      panel = panels.find((node) => !beforePanels.has(node)) || panels[panels.length - 1] || null;
      if (panel) break;
    }
    if (!panel) return { ok: false, reason: '时间面板未打开' };

    const [hour, minute, second] = normalizedTime.split(':');
    const inputs = Array.from(panel.querySelectorAll('input')).filter((node) => node instanceof HTMLInputElement && visible(node));
    if (inputs.length === 1) {
      setNativeValue(inputs[0], normalizedTime);
      inputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
    } else if (inputs.length >= 2) {
      const inputParts = [hour, minute, second].filter(Boolean);
      inputs.slice(0, inputParts.length).forEach((input, index) => {
        setNativeValue(input, inputParts[index]);
        input.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    }

    const columns = Array.from(
      panel.querySelectorAll('.fb-timepicker-column, [data-timepicker-column], [data-time-picker-column], [class*="timepicker-column"], [class*="time-picker-column"], [role="listbox"]')
    ).filter((node) => node instanceof Element && visible(node));
    const parts = [
      { value: hour, role: 'hour' },
      { value: minute, role: 'minute' },
      ...(second ? [{ value: second, role: 'second' }] : [])
    ];
    let clicked = 0;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const scope = columns[i] || panel;
      const picked = chooseTimePartNode(collectTimePartNodes(scope), timePartAliases(part.value, part.role));
      if (!picked) continue;
      fireOptionClick(picked.node);
      clicked += 1;
      await sleep(80);
    }

    const confirm = Array.from(panel.querySelectorAll('button, [role="button"]'))
      .filter((node) => node instanceof HTMLElement && visible(node))
      .find((node) => /^(OK|Ok|ok|\u786e\u5b9a|\u78ba\u5b9a|\u5b8c\u6210|\u9009\u62e9|\u9078\u64c7)$/.test(normText(node.textContent || node.getAttribute('aria-label') || '')));
    if (confirm) {
      fireOptionClick(confirm);
      await sleep(160);
    } else if (clicked > 0) {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
      trigger.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter' }));
      await sleep(120);
    }

    const display = readSelectLikeDisplayText(trigger);
    const ok = !!display && !isPlaceholderDisplayText(display) && matchesDisplayText(display, [normalizedTime]);
    return { ok, reason: ok ? '时间面板已选择' : '时间面板选择后展示值未更新', selectedText: display, clicked };
  }

  function getVisibleLingxiDateOverlay() {
    return Array.from(document.querySelectorAll('[data-fb-date-overlay]'))
      .filter((node) => node instanceof HTMLElement && visible(node))
      .pop() || null;
  }

  function parseLingxiDateOverlayPeriod(overlay) {
    if (!(overlay instanceof Element)) return null;
    const header = Array.from(overlay.querySelectorAll('.fb-font-medium, [class*="font-medium"], div, span'))
      .filter((node) => node instanceof HTMLElement && visible(node) && !node.querySelector('button'))
      .map((node) => normText(node.textContent || ''))
      .find((text) => /\b\d{4}\b/.test(text) && text.length <= 32) || '';
    const yearMonth = header.match(/(\d{4})\s*(?:年|[-/.])\s*(\d{1,2})\s*月?/);
    if (yearMonth) return { year: Number(yearMonth[1]), month: Number(yearMonth[2]) };
    const yearOnly = header.match(/\b(\d{4})\b/);
    if (!yearOnly) return null;
    const englishMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const lowerHeader = header.toLowerCase();
    const englishMonthIndex = englishMonths.findIndex((month) => lowerHeader.includes(month));
    return { year: Number(yearOnly[1]), month: englishMonthIndex >= 0 ? englishMonthIndex + 1 : null };
  }

  function readDateDisplayMatches(target, date, collectType = 'ymd') {
    if (!(target instanceof Element) || !(date instanceof Date)) return false;
    const display = readSimpleValue(target) || readSelectLikeDisplayText(target);
    if (!display || isPlaceholderDisplayText(display)) return false;
    const values = (display.match(/\d+/g) || []).map(Number);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    if (collectType === 'ym') return values.length >= 2 && values[0] === year && values[1] === month;
    if (collectType === 'md') {
      if (values.length >= 3) return values[1] === month && values[2] === day;
      return values.length >= 2 && values[0] === month && values[1] === day;
    }
    return values.length >= 3 && values[0] === year && values[1] === month && values[2] === day;
  }

  async function waitForDateDisplay(target, date, collectType = 'ymd', timeout = 900) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (readDateDisplayMatches(target, date, collectType)) return true;
      await sleep(60);
    }
    return readDateDisplayMatches(target, date, collectType);
  }

  async function fillLingxiDateOverlay(overlay, target, date, collectType = 'ymd') {
    const dayGridButtons = () => Array.from(overlay.querySelectorAll('.fb-grid-cols-7 button'))
      .filter((node) => node instanceof HTMLElement && visible(node));
    const detectedType = dayGridButtons().length ? (collectType === 'md' ? 'md' : 'ymd') : 'ym';
    const targetYear = date.getFullYear();
    const targetMonth = date.getMonth() + 1;

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const period = parseLingxiDateOverlayPeriod(overlay);
      if (!period) return { ok: false, reason: '无法读取日期面板当前年月' };
      const navButtons = Array.from(overlay.querySelectorAll('button'))
        .filter((node) => node instanceof HTMLElement && visible(node) && !node.disabled && node.querySelector('svg'));
      if (detectedType === 'ym') {
        const yearDelta = targetYear - period.year;
        if (yearDelta === 0) break;
        const button = yearDelta < 0 ? navButtons[0] : navButtons[navButtons.length - 1];
        if (!(button instanceof HTMLElement)) return { ok: false, reason: '日期面板缺少年份导航按钮' };
        button.click();
      } else {
        if (!Number.isFinite(period.month)) return { ok: false, reason: '无法读取日期面板当前月份' };
        const monthDelta = (targetYear - period.year) * 12 + targetMonth - period.month;
        if (monthDelta === 0) break;
        const previousButton = navButtons.length >= 4 ? navButtons[1] : navButtons[0];
        const nextButton = navButtons.length >= 4 ? navButtons[navButtons.length - 2] : navButtons[navButtons.length - 1];
        const button = monthDelta < 0 ? previousButton : nextButton;
        if (!(button instanceof HTMLElement)) return { ok: false, reason: '日期面板缺少月份导航按钮' };
        button.click();
      }
      await sleep(90);
    }

    const period = parseLingxiDateOverlayPeriod(overlay);
    if (!period || period.year !== targetYear || (detectedType !== 'ym' && period.month !== targetMonth)) {
      return { ok: false, reason: '日期面板未导航到目标年月' };
    }

    let picked = null;
    if (detectedType === 'ym') {
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      picked = Array.from(overlay.querySelectorAll('.fb-grid-cols-3 button'))
        .filter((node) => node instanceof HTMLElement && visible(node) && !node.disabled)
        .find((node) => {
          const text = normText(node.textContent || '').toLowerCase();
          const number = Number((text.match(/\d+/) || [])[0]);
          return number === targetMonth || text.includes(monthNames[targetMonth - 1]);
        }) || null;
    } else {
      picked = dayGridButtons()
        .filter((node) => !node.disabled && String(node.getAttribute('aria-disabled') || '').toLowerCase() !== 'true')
        .filter((node) => !String(node.className || '').includes('fb-text-slate-300'))
        .find((node) => Number(normText(node.textContent || '').replace(/\D/g, '')) === date.getDate()) || null;
    }
    if (!(picked instanceof HTMLElement)) return { ok: false, reason: '目标日期在面板中不可选择' };

    picked.click();
    await sleep(140);
    const stillOpen = getVisibleLingxiDateOverlay();
    if (stillOpen) {
      const confirm = Array.from(stillOpen.querySelectorAll('button'))
        .filter((node) => node instanceof HTMLElement && visible(node) && !node.disabled)
        .find((node) => /^(确定|確定|确认|確認|完成|ok)$/i.test(normText(node.textContent || '')));
      if (confirm) {
        confirm.click();
        await sleep(140);
      }
    }
    const ok = await waitForDateDisplay(target, date, detectedType);
    return { ok, reason: ok ? `日期面板已真实选择${detectedType}` : '日期面板点击后组件值未更新', collectType: detectedType };
  }

  async function fillDateField(field, value, root, strictScope) {
    const target = findElement(field, root, strictScope);
    if (!target) return buildFillResult(false, '日期控件未定位');
    if (value == null || String(value).trim() === '') return buildFillResult(false, '日期值为空');

    const constraints = field?.constraints || {};
    const hintText = [
      field?.label || '',
      field?.placeholder || '',
      field?.context || '',
      constraints?.hintText || '',
      target.getAttribute?.('placeholder') || '',
      target.getAttribute?.('aria-label') || '',
      target.closest?.('.arco-form-item, .ant-form-item, .el-form-item, .form-item, [role="group"]')?.textContent || ''
    ].join(' ');
    const timeOnly = /时间|時間|\btime\b/i.test(hintText) && !/日期|生日|出生|成立|設立|设立|birth|date|establish|setup/i.test(hintText);
    if (timeOnly) {
      const normalizedTime = normalizeTimeText(value);
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        setNativeValue(target, normalizedTime);
        const ok = verifyTextLikeValue(target, normalizedTime);
        return buildFillResult(ok, ok ? '时间控件已写入' : '时间控件写入未生效', { target });
      }
      const panelResult = await tryFillTimePickerPanel(target, normalizedTime);
      if (panelResult?.ok) {
        return buildFillResult(true, panelResult.reason || '时间控件已选择', { target });
      }
      if (setButtonDisplayText(target, normalizedTime)) {
        return buildFillResult(true, '时间控件已写入展示值', { target });
      }
      return buildFillResult(false, panelResult?.reason || '时间控件选择失败', { target });
    }
    const collectType = normalizeDateCollectType(field);
    const halfYearWindow = getHalfYearDateWindow();
    const minDate = parseYmdDate(String(constraints?.min || target.getAttribute?.('min') || ''));
    const maxDate = parseYmdDate(String(constraints?.max || target.getAttribute?.('max') || ''));
    const lowerBound = minDate && minDate.getTime() > halfYearWindow.min.getTime() ? minDate : halfYearWindow.min;
    const upperBound = maxDate && maxDate.getTime() < halfYearWindow.max.getTime() ? maxDate : halfYearWindow.max;
    if (lowerBound.getTime() > upperBound.getTime()) {
      return buildFillResult(false, '页面日期范围与当前日期前后半年限制无交集', { target });
    }
    let nextDate = parseDateForCollectType(String(value || ''), collectType, halfYearWindow.today) || new Date(halfYearWindow.today);
    nextDate = clampDateToBounds(nextDate, lowerBound, upperBound);
    const normalizedValue = formatYmdDate(nextDate);

    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea') {
      const inputValue = collectType === 'ym' ? normalizedValue.slice(0, 7) : (collectType === 'md' ? normalizedValue.slice(5) : normalizedValue);
      setNativeValue(target, inputValue);
      target.dispatchEvent(new Event('blur', { bubbles: true }));
      const ok = readDateDisplayMatches(target, nextDate, collectType);
      return buildFillResult(ok, ok ? '日期输入框已写入' : '日期输入框写入未生效', { target });
    }

    if (readDateDisplayMatches(target, nextDate, collectType)) {
      return buildFillResult(true, '日期控件已是目标值', { target });
    }

    target.click();
    await sleep(160);
    const lingxiOverlay = getVisibleLingxiDateOverlay();
    if (lingxiOverlay) {
      const result = await fillLingxiDateOverlay(lingxiOverlay, target, nextDate, collectType);
      return buildFillResult(result.ok, result.reason, { target, afterValue: readSimpleValue(target) });
    }

    const wantedDay = nextDate instanceof Date ? String(nextDate.getDate()) : '';
    const wantedMonth = nextDate instanceof Date ? String(nextDate.getMonth() + 1) : '';
    const wantedYear = nextDate instanceof Date ? String(nextDate.getFullYear()) : '';
    const dateCandidates = Array.from(
      document.querySelectorAll(
        [
          '.ant-picker-cell-in-view button',
          '.el-date-table td.available button',
          '.el-date-table td.available',
          '.el-date-table td.today button',
          '[role="gridcell"]:not([aria-disabled="true"]) button',
          '[role="gridcell"]:not([aria-disabled="true"]) [data-reka-calendar-cell-trigger]',
          '[data-reka-calendar-cell-trigger]:not([disabled])',
          '[data-radix-vue-calendar-cell-trigger]:not([disabled])',
          '[data-radix-calendar-cell-trigger]:not([disabled])',
          '[aria-label*="day"]:not([disabled])',
          '[aria-label*="日期"]:not([disabled])'
        ].join(', ')
      )
    ).filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (!visible(node)) return false;
      if (node.closest('[aria-hidden="true"]')) return false;
      if (String(node.getAttribute('aria-disabled') || '').toLowerCase() === 'true') return false;
      if (node.hasAttribute('disabled')) return false;
      const text = normText(`${node.textContent || ''} ${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''}`);
      if (/上一|下一|prev|next|previous|month|year/i.test(text) && !/\d/.test(text)) return false;
      return true;
    });
    const scoreDateCandidate = (node) => {
      const text = normText(`${node.textContent || ''} ${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''}`);
      const digits = normText(node.textContent || '').replace(/[^\d]/g, '');
      let score = 0;
      if (digits && wantedDay && String(Number(digits)) === wantedDay) score += 8;
      if (wantedDay && text.includes(wantedDay)) score += 3;
      if (wantedMonth && text.includes(wantedMonth)) score += 2;
      if (wantedYear && text.includes(wantedYear)) score += 4;
      if (text.includes(normalizedValue)) score += 12;
      if (node.closest('[role="gridcell"]')) score += 2;
      if (/outside|disabled|unavailable/i.test(String(node.getAttribute('class') || ''))) score -= 8;
      return score;
    };
    const dateBtn = dateCandidates
      .sort((a, b) => scoreDateCandidate(b) - scoreDateCandidate(a))[0] || null;
    if (dateBtn instanceof HTMLElement) {
      dateBtn.click();
      const ok = await waitForDateDisplay(target, nextDate, collectType);
      return buildFillResult(ok, ok ? '日期面板已真实选择日期' : '日期面板点击后组件值未更新', { target, afterValue: readSimpleValue(target) });
    }
    return buildFillResult(false, '未找到日期面板可点击项', { target });
  }

  async function fillSingleField(field, value, root, strictScope, settings, context = {}) {
    if (field?.meta?.adapterName === 'lingxiLegacy' || field?.meta?.componentAdapter === 'lingxiLegacy') {
      const adapterResult = await window.FormPilotV2Adapters?.fillField?.(field, value, {
        root,
        strictScope,
        settings,
        findElement,
        findContainerNode,
        buildFillResult,
        setNativeValue,
        verifyTextLikeValue,
        readSimpleValue,
        readValidationErrorText,
        visible,
        normText,
        sleep,
        fireOptionClick
      });
      if (adapterResult != null) return adapterResult;
    }
    if (field.kind === 'addressComponent') return fillAddressComponent(field, value, root, strictScope, settings);
    if (field.meta?.segmented) return fillSegmentedField(field, value, root, strictScope);
    const widget = getFieldWidget(field);
    if (widget === 'birthday') return fillBirthdayField(field, value, root, strictScope, settings);
    if (widget === 'ranking') return fillRankingField(field, value, root, strictScope);
    if (widget === 'rating' || widget === 'nps' || widget === 'matrixchoice') {
      return fillButtonChoiceWidgetField(field, value, root, strictScope, widget);
    }
    if (widget === 'cascader') return fillCascaderField(field, value, root, strictScope, settings);

    if (field.kind === 'radioGroup') {
      if (settings.fillRadioCheckbox === false) return buildFillResult(true, '已关闭单选填充');
      const groupKey = buildChoiceGroupKey(field, root, strictScope);
      if (context?.choiceGroupHandled instanceof Set && groupKey && context.choiceGroupHandled.has(groupKey)) {
        return buildFillResult(true, '同组选项已处理，跳过重复点击');
      }
      const verify = verifySingleFieldCompletion(field, root, strictScope, settings);
      const alreadyChosen = !!verify?.ok && /已选择/.test(String(verify?.reason || ''));
      if (alreadyChosen) {
        if (context?.choiceGroupHandled instanceof Set && groupKey) context.choiceGroupHandled.add(groupKey);
        return buildFillResult(true, '选项组已满足，跳过重复点击');
      }
      const result = await fillChoiceField(field, root, strictScope, false, value);
      if (!result?.ok || !/已选择/.test(String(verifySingleFieldCompletion(field, root, strictScope, settings)?.reason || ''))) {
        const legacyOk = await applyLegacyChoiceFallback(field, root, strictScope, false);
        if (legacyOk) {
          if (context?.choiceGroupHandled instanceof Set && groupKey) context.choiceGroupHandled.add(groupKey);
          return buildFillResult(true, '单选组已通过 legacy 兜底选中');
        }
      }
      if (result?.ok && context?.choiceGroupHandled instanceof Set && groupKey) context.choiceGroupHandled.add(groupKey);
      return result;
    }

    if (field.kind === 'checkboxGroup') {
      if (settings.fillRadioCheckbox === false) return buildFillResult(true, '已关闭多选填充');
      const groupKey = buildChoiceGroupKey(field, root, strictScope);
      if (context?.choiceGroupHandled instanceof Set && groupKey && context.choiceGroupHandled.has(groupKey)) {
        return buildFillResult(true, '同组选项已处理，跳过重复点击');
      }
      const verify = verifySingleFieldCompletion(field, root, strictScope, settings);
      const alreadyChosen = !!verify?.ok && /已选择/.test(String(verify?.reason || ''));
      if (alreadyChosen) {
        if (context?.choiceGroupHandled instanceof Set && groupKey) context.choiceGroupHandled.add(groupKey);
        return buildFillResult(true, '选项组已满足，跳过重复点击');
      }
      const result = await fillChoiceField(field, root, strictScope, true, value);
      if (!result?.ok || !/已选择/.test(String(verifySingleFieldCompletion(field, root, strictScope, settings)?.reason || ''))) {
        const legacyOk = await applyLegacyChoiceFallback(field, root, strictScope, true);
        if (legacyOk) {
          if (context?.choiceGroupHandled instanceof Set && groupKey) context.choiceGroupHandled.add(groupKey);
          return buildFillResult(true, '复选组已通过 legacy 兜底选中');
        }
      }
      if (result?.ok && context?.choiceGroupHandled instanceof Set && groupKey) context.choiceGroupHandled.add(groupKey);
      return result;
    }

    if (field.kind === 'date') return fillDateField(field, value, root, strictScope);

    const textValue = value == null ? '' : String(value);
    const hasValue = Array.isArray(value) ? value.length > 0 : textValue.trim() !== '';
    let el = findElement(field, root, strictScope, {
      excludeElements: context?.usedElements instanceof Set ? context.usedElements : null
    });
    if (!el && field.kind === 'addressDetail') {
      el = findAddressDetailElement(field, root, strictScope);
    }
    if (!el) return buildFillResult(false, '未定位到目标元素');

    const tag = el.tagName.toLowerCase();
    const role = String(el.getAttribute('role') || '').toLowerCase();
    const type = String(el.getAttribute('type') || '').toLowerCase();
    const classText = String(el.getAttribute('class') || '').toLowerCase();
    const readonlyLike = el.hasAttribute('readonly') || String(el.getAttribute('aria-readonly') || '').toLowerCase() === 'true';
    const pickerLike = tag === 'input' && readonlyLike && /datetimepicker|datepicker|timepicker/.test(classText);

    if (tag === 'select') {
      const options = await waitNativeSelectOptions(el, value, 1200);
      const target = chooseNativeSelectOption(options, value);
      if (!target) return buildFillResult(false, '原生下拉无可选项', { target: el });
      el.value = target.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      const currentValue = normText(el.value || '');
      const currentText = normText(el.options?.[el.selectedIndex]?.textContent || '');
      const expected = normText(target.value || target.textContent || '');
      let ok = !!currentValue && (currentValue === normText(target.value || '') || currentText === normText(target.textContent || '') || expected === currentText);
      if (!ok || /请选择|請選擇/i.test(currentText)) {
        await sleep(120);
        const refreshedOptions = await waitNativeSelectOptions(el, value, 900);
        const fallback = chooseNativeSelectOption(refreshedOptions, value);
        if (fallback) {
          el.selectedIndex = refreshedOptions.findIndex((item) => item === fallback);
          el.value = fallback.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        const retryValue = normText(el.value || '');
        const retryText = normText(el.options?.[el.selectedIndex]?.textContent || '');
        ok = !!retryValue && !/请选择|請選擇/i.test(retryText);
      }
      return buildFillResult(ok, ok ? '原生下拉已选中' : '原生下拉写入后未选中目标', { target: el });
    }

    if (pickerLike) {
      const raw = textValue.trim();
      let normalized = raw;
      if (/timepicker/.test(classText) && !/date/.test(classText)) {
        const match = raw.match(/\d{2}:\d{2}(:\d{2})?/);
        normalized = match ? match[0] : '12:00:00';
      } else if (/datetimepicker/.test(classText)) {
        const match = raw.match(/\d{4}-\d{2}-\d{2}[ T]?\d{2}:\d{2}(:\d{2})?/);
        normalized = match ? match[0].replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
        if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(normalized)) normalized = `${normalized}:00`;
      } else {
        const match = raw.match(/\d{4}-\d{2}-\d{2}/);
        normalized = match ? match[0] : new Date().toISOString().slice(0, 10);
      }
      const prevReadonly = el.getAttribute('readonly');
      try { el.removeAttribute('readonly'); } catch {}
      setNativeValue(el, normalized);
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      if (prevReadonly != null) {
        try { el.setAttribute('readonly', prevReadonly || 'readonly'); } catch {}
      }
      const ok = verifyTextLikeValue(el, normalized);
      return buildFillResult(ok, ok ? '时间/日期控件已写入' : '时间/日期控件写入未生效', { target: el, afterValue: el.value || '' });
    }

    const selectLikeTrigger =
      field.kind === 'select' ||
      role === 'combobox' ||
      role === 'listbox' ||
      el.getAttribute('aria-controls') ||
      el.getAttribute('aria-owns') ||
      el.getAttribute('aria-haspopup') === 'listbox' ||
      (tag === 'input' && readonlyLike && /select|dropdown|picker|cascader|arco-select|ant-select|semi-select|el-select|n-base-select/.test(classText)) ||
      field.meta?.selectLike;

    if (selectLikeTrigger) {
      const triggerNode = resolveSelectTriggerNode(el);
      const selectResult = await selectComboboxOption(triggerNode, textValue, field, settings);
      if (!selectResult?.ok && field.kind === 'select') {
        if (likelyCascadeField(field)) {
          const displayText = formatCascaderDisplayText(normText(textValue) || 'defaultRegion / defaultMainland');
          if (displayText && setButtonDisplayText(triggerNode, displayText)) {
            triggerNode.setAttribute('data-formpilot-v2-cascader-static-fallback', normText(textValue) || 'defaultRegion / defaultMainland');
            return buildFillResult(true, '级联控件静态兜底写入展示路径', { target: triggerNode });
          }
        }
        const displayText = normText(textValue) || normText(field.options?.[0]?.label || field.options?.[0]?.text || field.options?.[0]?.value || '');
        if (displayText && setButtonDisplayText(triggerNode, displayText)) {
          return buildFillResult(true, '按钮式下拉已写入展示值', { target: triggerNode });
        }
      }
      return buildFillResult(selectResult.ok, selectResult.reason, { target: triggerNode });
    }

    if (tag === 'input' || tag === 'textarea') {
      if (type === 'file') {
        if (settings?.testDataLibrary?.enabled === false) {
          return buildFillResult(true, '测试数据池已关闭，文件控件已跳过', { target: el });
        }
        // 尝试从 background 获取已存储的 base64 文件并注入 DataTransfer
        try {
          const category = inferFileCategoryFromTarget(el, field);
          const res = await chrome.runtime.sendMessage({ type: 'formpilotv2:get-file-store', category });
          let files = res?.files || [];
          if (!files.length && category) {
            const fallbackRes = await chrome.runtime.sendMessage({ type: 'formpilotv2:get-file-store' });
            files = filterFilesForTarget(fallbackRes?.files || [], category);
          } else {
            files = filterFilesForTarget(files, category);
          }
          if (files.length) {
            const fileItem = pickRandomChoice(files) || files[0];
            const blob = await fetch(fileItem.base64).then((r) => r.blob());
            const dt = new DataTransfer();
            dt.items.add(new File([blob], fileItem.name, { type: fileItem.mimeType || 'application/octet-stream' }));
            el.files = dt.files;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return buildFillResult(true, `文件已注入：${fileItem.name}`, { target: el });
          }
        } catch {
          // 无文件或注入失败时静默跳过
        }
        return buildFillResult(true, '文件控件无预存文件，已跳过', { target: el });
      }
      if (!hasValue) return buildFillResult(false, '填充值为空', { target: el });
      const inputTextValue = normalizeCompositeInputValue(field, textValue, el, root, strictScope, settings);
      const constrainedValue = normalizeByInputConstraint(
        el,
        inputTextValue,
        `${field.label || ''} ${field.placeholder || ''} ${field.context || ''}`,
        { ...(field?.constraints || {}), fieldKind: field.kind }
      );
      const beforeValue = readElementDisplayValue(el);
      el.focus?.();
      setNativeValue(el, constrainedValue);
      await sleep(120);
      const firstValue = readElementDisplayValue(el);
      const ok = verifyTextLikeValue(el, constrainedValue);
      debugLog(settings, '文本输入首轮校验', {
        id: field.id,
        kind: field.kind,
        domId: field.domId || '',
        selector: field.selector || '',
        beforeValue,
        expectedValue: constrainedValue,
        afterValue: firstValue,
        targetTag: tag,
        targetType: type || '',
        connected: el.isConnected !== false
      });
      if (ok) return buildFillResult(true, '文本输入已写入', { target: el });
      // 兜底重试一次，处理受控组件在首轮 input 后被覆盖。
      setNativeValue(el, constrainedValue);
      await sleep(140);
      const retryValue = readElementDisplayValue(el);
      const retryOk = verifyTextLikeValue(el, constrainedValue);
      debugLog(settings, '文本输入重试校验', {
        id: field.id,
        kind: field.kind,
        domId: field.domId || '',
        selector: field.selector || '',
        expectedValue: constrainedValue,
        retryValue,
        connected: el.isConnected !== false
      });
      if (retryOk) return buildFillResult(true, '文本输入重试后生效', { target: el });

      const alt = findAlternativeTextTarget(field, root, strictScope, el, context?.usedElements);
      if (alt) {
        alt.focus?.();
        const altExpectedValue = normalizeByInputConstraint(
          alt,
          constrainedValue,
          `${field.label || ''} ${field.placeholder || ''} ${field.context || ''}`,
          { ...(field?.constraints || {}), fieldKind: field.kind }
        );
        setNativeValue(alt, altExpectedValue);
        await sleep(150);
        const altValue = readElementDisplayValue(alt);
        const altOk = verifyTextLikeValue(alt, altExpectedValue);
        debugLog(settings, '文本输入候选控件校验', {
          id: field.id,
          kind: field.kind,
          domId: field.domId || '',
          selector: field.selector || '',
          expectedValue: altExpectedValue,
          altDomId: alt.getAttribute?.(EID_ATTR) || '',
          altValue,
          connected: alt.isConnected !== false
        });
        if (altOk) {
          return buildFillResult(true, '文本输入已切换到同组候选控件写入', { target: alt });
        }
      }
      return buildFillResult(false, '文本输入写入未生效', {
        target: el,
        beforeValue,
        afterValue: firstValue,
        retryValue: readElementDisplayValue(el)
      });
    }

    if (el.isContentEditable) {
      if (!hasValue) return buildFillResult(false, '填充值为空', { target: el });
      const richHtml = isLikelyHtml(textValue) ? sanitizeRichTextHtml(textValue) : '';
      const expectedDisplayValue = richHtml ? richTextHtmlToText(richHtml) : textValue;
      el.focus();
      document.execCommand('selectAll', false, null);
      if (richHtml) document.execCommand('insertHTML', false, richHtml);
      else document.execCommand('insertText', false, textValue);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      let ok = verifyTextLikeValue(el, expectedDisplayValue);
      if (!ok && richHtml) {
        el.innerHTML = richHtml;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        ok = verifyTextLikeValue(el, expectedDisplayValue);
      }
      return buildFillResult(ok, ok ? '富文本已写入' : '富文本写入未生效', { target: el });
    }

    return buildFillResult(false, '控件类型暂不支持自动填充', { target: el });
  }

  function resolveChoiceNodeFromOption(option = {}, root, strictScope = false) {
    let node = findByDomId(option?.domId, root, strictScope);
    if (!node && option?.selector) {
      try {
        node = root.querySelector(option.selector);
        if (!node && !strictScope) node = document.querySelector(option.selector);
      } catch {
        node = null;
      }
    }
    return node instanceof Element ? node : null;
  }

  function isNodeChecked(node, isCheckbox = false) {
    if (!(node instanceof Element)) return false;
    const native = node.matches('input[type="checkbox"], input[type="radio"]')
      ? node
      : node.querySelector('input[type="checkbox"], input[type="radio"]');
    if (native instanceof HTMLInputElement) return !!native.checked;
    const ariaNode = node.matches('[role="checkbox"], [role="radio"], [aria-checked], [data-state]')
      ? node
      : node.querySelector('[role="checkbox"], [role="radio"], [aria-checked], [data-state]');
    const stateNode = ariaNode instanceof Element ? ariaNode : node;
    const ariaChecked = String(stateNode.getAttribute('aria-checked') || '').toLowerCase();
    if (ariaChecked === 'true' || ariaChecked === 'mixed') return true;
    const dataState = String(stateNode.getAttribute('data-state') || '').toLowerCase();
    if (dataState === 'checked' || dataState === 'on' || dataState === 'selected') return true;
    const ariaSelected = String(stateNode.getAttribute('aria-selected') || '').toLowerCase();
    if (ariaSelected === 'true') return true;
    const classTokens = [
      ...String(node.getAttribute('class') || '').split(/\s+/),
      ...String(stateNode.getAttribute('class') || '').split(/\s+/)
    ]
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .filter((item) => !item.includes('[state=checked]') && !item.includes('[data-state=checked]'));
    if (isCheckbox) {
      return classTokens.some((item) =>
        item === 'checked' ||
        item === 'is-checked' ||
        item === 'arco-checkbox-checked' ||
        item === 'ant-checkbox-checked' ||
        item === 'el-checkbox__input.is-checked'
      );
    }
    return classTokens.some((item) =>
      item === 'checked' ||
      item === 'is-checked' ||
      item === 'arco-radio-checked' ||
      item === 'ant-radio-checked' ||
      item === 'el-radio__input.is-checked'
    );
  }

  function readSimpleValue(el) {
    if (!(el instanceof Element)) return '';
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return normText(el.value || '');
    if (el.isContentEditable) return normText(el.textContent || '');
    if (tag === 'button' || getComputedStyle(el).cursor === 'pointer') return normText(el.textContent || el.getAttribute('aria-label') || '');
    return '';
  }

  function readValidationErrorText(el) {
    if (!(el instanceof Element)) return '';
    const container = el.closest?.('.arco-form-item, .ant-form-item, .el-form-item, .form-item, [role="group"]') || el.parentElement;
    if (!(container instanceof Element)) return '';
    const classText = String(container.getAttribute('class') || '').toLowerCase();
    const hasErrorClass = /(error|invalid|is-error|has-error)/.test(classText);
    const messageNode = container.querySelector(
      '[role="alert"], .arco-form-item-message, .ant-form-item-explain-error, .el-form-item__error, .invalid-feedback, .error-message'
    );
    const messageText = normText(messageNode?.textContent || '');
    if (messageText) return messageText;
    if (hasErrorClass) return '字段存在校验错误';
    return '';
  }

  function isFieldRequired(field = {}, el = null) {
    if (field?.constraints?.required) return true;
    if (!(el instanceof Element)) return false;
    if (el.hasAttribute('required')) return true;
    if (String(el.getAttribute('aria-required') || '').toLowerCase() === 'true') return true;
    const container = el.closest?.('.arco-form-item, .ant-form-item, .el-form-item, .form-item, [role="group"]');
    if (!(container instanceof Element)) return false;
    if (
      container.querySelector(
        '.arco-form-item-label-required-symbol, .ant-form-item-required, .el-form-item.is-required, .required, [data-required="true"]'
      )
    ) {
      return true;
    }
    return false;
  }

  function verifyValueAgainstConstraints(value = '', constraints = {}, hintText = '') {
    const text = normText(value);
    if (!text) {
      return { ok: true };
    }
    const minLength = toFiniteNumber(constraints?.minLength);
    const maxLength = toFiniteNumber(constraints?.maxLength);
    if (minLength != null && minLength > 0 && text.length < minLength) {
      return { ok: false, reason: `长度小于最小限制 ${minLength}` };
    }
    if (maxLength != null && maxLength > 0 && text.length > maxLength) {
      return { ok: false, reason: `长度超出最大限制 ${maxLength}` };
    }

    const pattern = String(constraints?.pattern || '').trim();
    if (pattern) {
      try {
        const reg = new RegExp(pattern.startsWith('^') ? pattern : `^${pattern}$`);
        if (!reg.test(text)) {
          return { ok: false, reason: '不匹配字段格式约束' };
        }
      } catch {
        // ignore invalid regex
      }
    }

    const numericLike =
      !!constraints?.numericLike ||
      String(constraints?.inputType || '').toLowerCase() === 'number' ||
      /数字|數字|amount|count|number|percent|比例|人數|人数/.test(String(hintText || ''));
    if (numericLike) {
      const n = Number(String(text).replace(/,/g, ''));
      if (!Number.isFinite(n)) return { ok: false, reason: '需要数字格式' };
      const min = toFiniteNumber(constraints?.minNumber ?? constraints?.min);
      const max = toFiniteNumber(constraints?.maxNumber ?? constraints?.max);
      if (min != null && n < min) return { ok: false, reason: `小于最小值 ${min}` };
      if (max != null && n > max) return { ok: false, reason: `大于最大值 ${max}` };
    }

    const dateLike =
      !!constraints?.dateLike ||
      String(constraints?.inputType || '').toLowerCase() === 'date' ||
      /日期|date|成立|birthday|birth/.test(String(hintText || ''));
    if (dateLike) {
      const dt = parseYmdDate(text);
      if (!dt) return { ok: false, reason: '日期格式非法' };
      const halfYearWindow = getHalfYearDateWindow();
      if (dt.getTime() < halfYearWindow.min.getTime() || dt.getTime() > halfYearWindow.max.getTime()) {
        return { ok: false, reason: `日期需在 ${formatYmdDate(halfYearWindow.min)} 至 ${formatYmdDate(halfYearWindow.max)} 之间` };
      }
      const minDate = parseYmdDate(String(constraints?.min || ''));
      const maxDate = parseYmdDate(String(constraints?.max || ''));
      if (minDate && dt.getTime() < minDate.getTime()) return { ok: false, reason: `日期早于最小值 ${formatYmdDate(minDate)}` };
      if (maxDate && dt.getTime() > maxDate.getTime()) return { ok: false, reason: `日期晚于最大值 ${formatYmdDate(maxDate)}` };
    }

    return { ok: true };
  }

  function shouldAllowOptionalEmpty(settings = {}) {
    return settings?.fillOptionalFields === false;
  }

  function verifySingleFieldCompletion(field, root, strictScope = false, settings = {}) {
    if (!field || typeof field !== 'object') {
      return { id: '', kind: '', ok: false, reason: '字段无效' };
    }

    if (field?.meta?.adapterName === 'lingxiLegacy' || field?.meta?.componentAdapter === 'lingxiLegacy') {
      const adapterResult = window.FormPilotV2Adapters?.verifyField?.(field, {
        root,
        strictScope,
        settings,
        findElement,
        findContainerNode,
        readSimpleValue,
        readValidationErrorText,
        visible,
        normText
      });
      if (adapterResult != null) return adapterResult;
    }

    const widget = getFieldWidget(field);
    if (widget === 'rating' || widget === 'nps' || widget === 'matrixchoice') {
      const selector = widget === 'nps'
        ? '.nps-scale__score-btn'
        : widget === 'rating'
          ? '.rating-item'
          : '[role="radio"], button[role="radio"], .fb-ui-radio-group-item';
      const nodes = collectWidgetOptionNodes(field, root, strictScope, selector);
      const ok = nodes.some((node) => isWidgetNodeSelected(node));
      return {
        id: field.id,
        kind: field.kind,
        ok,
        reason: ok ? '按钮式选项已选择' : '按钮式选项未选择'
      };
    }

    if (widget === 'ranking') {
      const nodes = collectWidgetOptionNodes(field, root, strictScope, '.fb-runtime-ranking-item');
      const selectedCount = nodes.filter((node) => isWidgetNodeSelected(node)).length;
      const ok = nodes.length > 0 && selectedCount >= nodes.length;
      return {
        id: field.id,
        kind: field.kind,
        ok,
        reason: ok ? '排序题已完成' : `排序题未完成(${selectedCount}/${nodes.length})`
      };
    }

    if (widget === 'birthday') {
      const container = findWidgetContainer(field, root, strictScope);
      const nodes = collectWidgetOptionNodes(field, root, strictScope, 'button[role="combobox"], [role="combobox"]')
        .filter((node) => !node.closest('.fb-runtime-control-clear'));
      const roles = Array.isArray(field?.meta?.segmentRoles)
        ? field.meta.segmentRoles.filter((role) => ['year', 'month', 'day'].includes(role))
        : [];
      const expected = roles.length || (normalizeDateCollectType(field) === 'ymd' ? 3 : 2);
      const filled = nodes.filter((node) => {
        const text = readSelectLikeDisplayText(node) || readSimpleValue(node);
        return text && !isPlaceholderDisplayText(text) && !/^(年|月|日|year|month|day)$/i.test(text);
      }).length;
      const validationError = readValidationErrorText(container);
      const ok = !validationError && nodes.length >= expected && filled >= expected;
      return {
        id: field.id,
        kind: field.kind,
        ok,
        reason: validationError || (ok ? '生日已真实选择' : `生日未完整填充(${filled}/${expected})`)
      };
    }

    if (widget === 'cascader') {
      const el = findElement(field, root, strictScope);
      const display = readSelectLikeDisplayText(el) || readSimpleValue(el);
      const staticFallback = el?.getAttribute?.('data-formpilot-v2-cascader-static-fallback') ||
        queryOne(root || document, '[data-formpilot-v2-cascader-static-fallback]')?.getAttribute?.('data-formpilot-v2-cascader-static-fallback') ||
        '';
      const ok = (!!display && !isPlaceholderDisplayText(display) && !isGenericOptionDisplayText(display)) || !!staticFallback;
      return {
        id: field.id,
        kind: field.kind,
        ok,
        reason: ok ? '级联控件已选择' : '级联控件未选择'
      };
    }

    if (field.kind === 'radioGroup' || field.kind === 'checkboxGroup') {
      const isCheckbox = field.kind === 'checkboxGroup';
      const options = Array.isArray(field.options) ? field.options : [];
      let checked = false;
      for (const option of options) {
        const node = resolveChoiceNodeFromOption(option, root, strictScope);
        if (!node) continue;
        if (isNodeChecked(node, isCheckbox)) {
          checked = true;
          break;
        }
      }
      if (!checked) {
        const container = findContainerNode(field, root, strictScope) || findElement(field, root, strictScope);
        if (container instanceof Element) {
          const selector = isCheckbox ? 'input[type="checkbox"]' : 'input[type="radio"]';
          checked = queryAll(container, selector).some((item) => item instanceof HTMLInputElement && item.checked);
        }
      }
      const refNode = findContainerNode(field, root, strictScope) || findElement(field, root, strictScope);
      const validationError = readValidationErrorText(refNode instanceof Element ? refNode : null);
      if (validationError) {
        return {
          id: field.id,
          kind: field.kind,
          ok: false,
          reason: validationError
        };
      }
      const required = isFieldRequired(field, refNode instanceof Element ? refNode : null);
      if (!checked && !required && shouldAllowOptionalEmpty(settings)) {
        return {
          id: field.id,
          kind: field.kind,
          ok: true,
          reason: '可选项未选择'
        };
      }
      return {
        id: field.id,
        kind: field.kind,
        ok: !!checked,
        reason: checked ? '选项组已选择' : '选项组未选择'
      };
    }

    const el = findElement(field, root, strictScope);
    if (!el) {
      return {
        id: field.id,
        kind: field.kind,
        ok: false,
        reason: '字段未定位'
      };
    }

    if (field.kind === 'date') {
      const display = readSimpleValue(el);
      const placeholderLike = !display || /请选择|請選擇|选择日期|選擇日期|select\s*(a\s*)?date|choose\s*(a\s*)?date/i.test(display);
      const validationError = readValidationErrorText(el);
      if (validationError) {
        return {
          id: field.id,
          kind: field.kind,
          ok: false,
          reason: validationError
        };
      }
      const required = isFieldRequired(field, el);
      if (placeholderLike && !required && shouldAllowOptionalEmpty(settings)) {
        return {
          id: field.id,
          kind: field.kind,
          ok: true,
          reason: '可选日期未填写'
        };
      }
      return {
        id: field.id,
        kind: field.kind,
        ok: !placeholderLike,
        reason: placeholderLike ? '日期未填写' : '日期已填写'
      };
    }

    if (field.kind === 'file') {
      const input = el instanceof HTMLInputElement ? el : el.querySelector?.('input[type="file"]');
      const ok = input instanceof HTMLInputElement && input.files && input.files.length > 0;
      const validationError = readValidationErrorText(el);
      if (validationError) {
        return {
          id: field.id,
          kind: field.kind,
          ok: false,
          reason: validationError
        };
      }
      const required = isFieldRequired(field, el);
      if (!ok && !required && shouldAllowOptionalEmpty(settings)) {
        return {
          id: field.id,
          kind: field.kind,
          ok: true,
          reason: '可选文件未上传'
        };
      }
      return {
        id: field.id,
        kind: field.kind,
        ok: !!ok,
        reason: ok ? '文件已选择' : '文件未选择'
      };
    }

    if (field.kind === 'select') {
      if (isMultiSelectField(field, el)) {
        if (el instanceof HTMLSelectElement && el.multiple) {
          const selectedCount = Array.from(el.selectedOptions || []).filter((option) => !option.disabled).length;
          return {
            id: field.id,
            kind: field.kind,
            ok: selectedCount > 0,
            reason: selectedCount > 0 ? `多选下拉已选择 ${selectedCount} 项` : '多选下拉未选择'
          };
        }
        const display = readMultiSelectDisplayText(el);
        const ok = !!display && !isPlaceholderDisplayText(display);
        const validationError = readValidationErrorText(el);
        if (validationError) {
          return {
            id: field.id,
            kind: field.kind,
            ok: false,
            reason: validationError
          };
        }
        const required = isFieldRequired(field, el);
        if (!ok && !required && shouldAllowOptionalEmpty(settings)) {
          return {
            id: field.id,
            kind: field.kind,
            ok: true,
            reason: '可选多选下拉为空'
          };
        }
        return {
          id: field.id,
          kind: field.kind,
          ok,
          reason: ok ? '多选下拉已选择' : '多选下拉未选择'
        };
      }
      if (el instanceof HTMLSelectElement) {
        const selectedValue = normText(el.value || '');
        const selectedText = normText(el.options?.[el.selectedIndex]?.textContent || '');
        let ok = !!selectedValue || (!!selectedText && !isPlaceholderDisplayText(selectedText));
        const validationError = readValidationErrorText(el);
        if (validationError) {
          return {
            id: field.id,
            kind: field.kind,
            ok: false,
            reason: validationError
          };
        }
        const required = isFieldRequired(field, el);
        if (!ok && !required && shouldAllowOptionalEmpty(settings)) {
          ok = true;
        }
        return {
          id: field.id,
          kind: field.kind,
          ok,
          reason: ok ? '下拉已选择' : '下拉未选择'
        };
      }
      const display = readSelectLikeDisplayText(el);
      let ok = !!display && !isPlaceholderDisplayText(display);
      const validationError = readValidationErrorText(el);
      if (validationError) {
        return {
          id: field.id,
          kind: field.kind,
          ok: false,
          reason: validationError
        };
      }
      const required = isFieldRequired(field, el);
      if (!ok && !required && shouldAllowOptionalEmpty(settings)) {
        ok = true;
      }
      return {
        id: field.id,
        kind: field.kind,
        ok,
        reason: ok ? '下拉已选择' : '下拉未选择'
      };
    }

    if (field.kind === 'addressComponent') {
      const container = findContainerNode(field, root, strictScope) || el;
      const detailEl = findAddressDetailElement(field, root, strictScope);
      const hasText = detailEl instanceof Element
        ? normText(detailEl.value || detailEl.textContent || '').length > 0
        : queryAll(container, 'input[type="text"], input:not([type]), textarea')
          .some((item) => normText(item.value || '').length > 0);
      const meta = field?.meta || {};
      const expectedComboCount = Math.max(
        inferAddressComboExpectedCount(field),
        Array.isArray(meta.comboboxDomIds) ? meta.comboboxDomIds.length : 0,
        Array.isArray(meta.comboboxSelectors) ? meta.comboboxSelectors.length : 0,
        Array.isArray(meta.comboboxRoles) ? meta.comboboxRoles.length : 0,
        Array.isArray(meta.comboboxLabels) ? meta.comboboxLabels.length : 0
      );
      const comboNodes = collectAddressComboNodes(field, root, strictScope, Math.max(expectedComboCount, 3));
      const selectedComboCount = comboNodes.filter(isAddressComboFilled).length;
      const disabledEmptyCount = countIgnorableAddressEmptyCombos(comboNodes);
      const requiredComboCount = expectedComboCount
        ? Math.max(0, expectedComboCount - disabledEmptyCount)
        : Math.max(0, comboNodes.length - disabledEmptyCount);
      const hasSelect = requiredComboCount > 0 && selectedComboCount >= requiredComboCount;
      const ok = requiredComboCount ? (hasSelect && (!detailEl || hasText)) : hasText;
      const validationError = readValidationErrorText(container instanceof Element ? container : el);
      if (validationError) {
        return {
          id: field.id,
          kind: field.kind,
          ok: false,
          reason: validationError
        };
      }
      const required = isFieldRequired(field, detailEl instanceof Element ? detailEl : (container instanceof Element ? container : el));
      if (!ok && !required && shouldAllowOptionalEmpty(settings)) {
        return {
          id: field.id,
          kind: field.kind,
          ok: true,
          reason: '可选地址为空'
        };
      }
      return {
        id: field.id,
        kind: field.kind,
        ok,
        reason: ok ? '地址已填充' : `地址未填充(${selectedComboCount}/${requiredComboCount || comboNodes.length})`
      };
    }

    const value = readSimpleValue(el);
    const required = isFieldRequired(field, el);
    let ok = value.length > 0;
    const validationError = readValidationErrorText(el);
    if (validationError) {
      return {
        id: field.id,
        kind: field.kind,
        ok: false,
        reason: validationError
      };
    }
    if (!ok && !required && shouldAllowOptionalEmpty(settings)) {
      return {
        id: field.id,
        kind: field.kind,
        ok: true,
        reason: '可选字段为空'
      };
    }
    if (ok) {
      const verify = verifyValueAgainstConstraints(
        value,
        field?.constraints || {},
        `${field?.label || ''} ${field?.placeholder || ''} ${field?.context || ''}`
      );
      if (!verify.ok) {
        return {
          id: field.id,
          kind: field.kind,
          ok: false,
          reason: verify.reason || '字段值不满足约束'
        };
      }
    }
    return {
      id: field.id,
      kind: field.kind,
      ok,
      reason: ok ? '字段已填充' : '字段为空'
    };
  }

  function verifyFieldsCompletion(fields = [], scopeSelector = '', settings = {}) {
    const root = findRoot(scopeSelector);
    if (!root) return { ok: false, error: '未找到校验区域' };
    const strictScope = !!scopeSelector;
    const detail = [];
    for (const field of fields || []) {
      detail.push(verifySingleFieldCompletion(field, root, strictScope, settings));
    }
    const completed = detail.filter((item) => item.ok).length;
    return {
      ok: true,
      total: detail.length,
      completed,
      missing: detail.length - completed,
      detail
    };
  }

  function shouldFillFieldBySettings(field, root, strictScope, settings = {}) {
    if (settings?.fillOptionalFields !== false) return true;
    const refNode = findContainerNode(field, root, strictScope) || findElement(field, root, strictScope);
    return isFieldRequired(field, refNode instanceof Element ? refNode : null);
  }

  async function fillFields(fields = [], values = {}, scopeSelector = '', settings = {}) {
    const root = findRoot(scopeSelector);
    if (!root) return { ok: false, error: '未找到填充区域' };
    if (isFillRunCancelled(settings)) {
      return buildFillCancelledResult(settings, [], 0, 0, { total: fields.length, scopeSelector, strictScope: !!scopeSelector });
    }

    const strictScope = !!scopeSelector;
    let applied = 0;
    let failed = 0;
    const detail = [];
    const usedElements = new Set();
    const choiceGroupHandled = new Set();

    const orderedFields = [...fields].filter((field) => shouldFillFieldBySettings(field, root, strictScope, settings)).sort((a, b) => {
      const getAddressOrder = (field) => {
        const selector = String(field?.selector || '');
        const label = String(field?.label || '');
        const hint = `${selector} ${label}`.toLowerCase();
        if (field?.kind === 'addressComponent') return 0;
        if (/s1_|province|省/.test(hint)) return 1;
        if (/s2_|city|市/.test(hint)) return 2;
        if (/s3_|district|area|区|縣|县/.test(hint)) return 3;
        if (/address|地址|detail|街|路|道|室|楼|樓/.test(hint)) return 4;
        return 9;
      };
      const pa = getAddressOrder(a);
      const pb = getAddressOrder(b);
      if (pa !== pb) return pa - pb;
      return 0;
    });

    for (const field of orderedFields) {
      if (isFillRunCancelled(settings)) {
        return buildFillCancelledResult(settings, detail, applied, failed, { total: fields.length, scopeSelector, strictScope });
      }
      try {
        const value = values[field.id];
        debugLog(settings, '准备填充字段', {
          id: field.id,
          kind: field.kind,
          label: field.label || '',
          placeholder: field.placeholder || '',
          selector: field.selector || '',
          domId: field.domId || '',
          value
        });
        const result = await fillSingleField(field, value, root, strictScope, settings || {}, {
          usedElements,
          choiceGroupHandled
        });
        if (isFillRunCancelled(settings)) {
          return buildFillCancelledResult(settings, detail, applied, failed, { total: fields.length, scopeSelector, strictScope });
        }
        const ok = !!result?.ok;
        if (ok) applied += 1;
        else failed += 1;

        const reason = result?.reason || (ok ? '' : '填充失败');
        if (result?.target instanceof Element) {
          const canReuse = field.kind === 'radioGroup' || field.kind === 'checkboxGroup';
          if (!canReuse) usedElements.add(result.target);
        }

        detail.push({
          id: field.id,
          kind: field.kind,
          selector: field.selector,
          domId: field.domId || '',
          ok,
          value,
          reason,
          targetTag: result?.target?.tagName?.toLowerCase?.() || '',
          targetDomId: result?.target?.getAttribute?.(EID_ATTR) || '',
          actualValue: result?.afterValue || result?.retryValue || '',
          comboStates: result?.comboStates || undefined
        });
        debugLog(settings, '字段填充结果', {
          id: field.id,
          kind: field.kind,
          ok,
          reason: reason || '成功',
          target: result?.target?.tagName?.toLowerCase?.() || ''
        });
      } catch (error) {
        if (isFillRunCancelled(settings)) {
          return buildFillCancelledResult(settings, detail, applied, failed, { total: fields.length, scopeSelector, strictScope });
        }
        failed += 1;
        detail.push({
          id: field.id,
          kind: field.kind,
          selector: field.selector,
          domId: field.domId || '',
          ok: false,
          reason: error?.message || String(error)
        });
        debugLog(settings, '字段填充异常', {
          id: field.id,
          kind: field.kind,
          error: error?.message || String(error)
        });
      }
    }

    // 二次校验：防止受控组件在后续渲染中覆盖已写入值。
    for (const row of detail) {
      if (isFillRunCancelled(settings)) {
        return buildFillCancelledResult(settings, detail, applied, failed, { total: fields.length, scopeSelector, strictScope });
      }
      if (!row?.ok) continue;
      const field = fields.find((item) => item.id === row.id);
      if (!field) continue;
      if (!['text', 'addressDetail', 'companyName', 'companyId', 'fullName', 'firstName', 'lastName', 'jobTitle', 'email', 'phone', 'tel', 'verification', 'idcard', 'number', 'bankCard'].includes(field.kind)) {
        continue;
      }
      const expected = values[field.id];
      if (expected == null || String(expected).trim() === '') continue;
      const target = findElement(field, root, strictScope);
      if (!(target instanceof Element)) continue;
      if (!verifyTextLikeValue(target, String(expected))) {
        await sleep(180);
        if (isFillRunCancelled(settings)) {
          return buildFillCancelledResult(settings, detail, applied, failed, { total: fields.length, scopeSelector, strictScope });
        }
        if (!verifyTextLikeValue(target, String(expected))) {
          const fieldVerify = verifySingleFieldCompletion(field, root, strictScope, settings);
          if (!fieldVerify?.ok) {
            row.ok = false;
            row.reason = fieldVerify?.reason || '写入后被页面重置';
            applied = Math.max(0, applied - 1);
            failed += 1;
          }
        }
      }
    }

    debugLog(settings, '填充汇总', { total: fields.length, applied, failed, scopeSelector, strictScope });
    for (const field of orderedFields.filter((item) => item?.kind === 'addressComponent')) {
      if (isFillRunCancelled(settings)) {
        return buildFillCancelledResult(settings, detail, applied, failed, { total: fields.length, scopeSelector, strictScope });
      }
      const row = detail.find((item) => item.id === field.id);
      const verify = verifySingleFieldCompletion(field, root, strictScope, settings);
      if (row?.ok && verify?.ok) continue;

      try {
        const value = values[field.id];
        const result = await fillSingleField(field, value, root, strictScope, settings || {}, {
          usedElements,
          choiceGroupHandled
        });
        await sleep(500);
        if (isFillRunCancelled(settings)) {
          return buildFillCancelledResult(settings, detail, applied, failed, { total: fields.length, scopeSelector, strictScope });
        }
        const finalVerify = verifySingleFieldCompletion(field, root, strictScope, settings);
        const ok = !!result?.ok && !!finalVerify?.ok;
        const reason = ok ? (result?.reason || '地址组件最终补填成功') : (finalVerify?.reason || result?.reason || '地址组件最终补填失败');
        if (row) {
          const wasOk = !!row.ok;
          row.ok = ok;
          row.reason = reason;
          row.targetTag = result?.target?.tagName?.toLowerCase?.() || row.targetTag || '';
          row.targetDomId = result?.target?.getAttribute?.(EID_ATTR) || row.targetDomId || '';
          row.comboStates = result?.comboStates || row.comboStates;
          if (wasOk !== ok) {
            if (ok) {
              applied += 1;
              failed = Math.max(0, failed - 1);
            } else {
              applied = Math.max(0, applied - 1);
              failed += 1;
            }
          }
        }
      } catch (error) {
        if (isFillRunCancelled(settings)) {
          return buildFillCancelledResult(settings, detail, applied, failed, { total: fields.length, scopeSelector, strictScope });
        }
        if (row?.ok) {
          row.ok = false;
          applied = Math.max(0, applied - 1);
          failed += 1;
        }
        if (row) row.reason = error?.message || String(error);
      }
    }

    publishFillSnapshot({
      at: Date.now(),
      total: fields.length,
      applied,
      failed,
      scopeSelector,
      strictScope,
      detail
    });
    return { ok: true, applied, failed, detail };
  }

  window.FormPilotV2Fill = {
    fillFields,
    verifyFieldsCompletion,
    __build: FORM_PILOT_V2_FILL_BUILD
  };
})();
