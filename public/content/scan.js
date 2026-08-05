(function initFormPilotV2Scan() {
  const FORM_PILOT_V2_SCAN_BUILD = '2026-03-28-01';
  if (window.FormPilotV2Scan?.__build === FORM_PILOT_V2_SCAN_BUILD) return;

  const EID_ATTR = 'data-formpilot-v2-eid';
  let seq = 1;

  function normText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  const ID_DOCUMENT_HINT_RE = /(身份证|身份證|身份証|身分證|身分証|证件|證件|護照|护照|id\s*card|idcard|identity\s*(document|card)|identification|passport|document\s*(number|no\.?))/i;
  const BANK_CARD_HINT_RE = /(银行卡|銀行卡|银行卡号|銀行卡號|银行账号|銀行賬號|银行账户|銀行賬戶|储蓄卡|儲蓄卡|借记卡|借記卡|debit\s*card|bank\s*(card|account|acct)|card\s*(number|no\.?))/i;

  function isBankCardHintText(text = '') {
    const hint = String(text || '');
    return BANK_CARD_HINT_RE.test(hint) && !ID_DOCUMENT_HINT_RE.test(hint);
  }

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    // 过滤 HTML hidden 属性
    if (el.hidden) return false;
    // 过滤 aria-hidden="true" 的元素及其祖先（Tab 组件常用此方式隐藏非激活面板）
    if (el.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function extractLabelCandidate(node) {
    if (!node || !(node instanceof Element)) return '';
    const text = normText(node.textContent || '')
      .replace(/[*：:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    if (text.length > 60) return '';
    if (/请输入|請輸入|请选择|請選擇|上传|上傳|删除|刪除|提交|保存|确定|確認/.test(text)) return '';
    return text;
  }

  function pushReason(bucket, text) {
    const normalized = normText(text);
    if (!normalized) return;
    if (!bucket.includes(normalized)) bucket.push(normalized);
  }

  const SELECT_PANEL_SELECTOR = [
    '[role="listbox"]',
    '[role="menu"]',
    '[role="tree"]',
    '[data-radix-popper-content-wrapper]',
    '[id^="reka-select-content"]',
    '.el-select-dropdown',
    '.ant-select-dropdown',
    '.ant-cascader-menus',
    '.arco-select-dropdown',
    '.n-base-select-dropdown',
    '.semi-select-dropdown',
    '.t-select__dropdown',
    '.t-select__menu',
    '.rc-select-dropdown',
    '.dropdown-menu',
    '.dropdown__menu',
    '.select-dropdown',
    '[data-headlessui-portal] [role="listbox"]'
  ].join(', ');

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

  const EDITOR_CONTROL_TEXT_RE = /^(加粗|粗体|斜体|下划线|删除线|字号|字体|字体大小|颜色|背景|对齐|缩进|列表|项目符号|编号|插入|链接|图片|表格|代码|预览|全屏|源码|html|撤销|重做|清除格式|清空|format|toolbar|editor|rich\s*text|wysiwyg)$/i;
  const EDITOR_CONTROL_HINT_RE = /(加粗|粗体|斜体|下划线|删除线|字号|字体|字体大小|颜色|背景|对齐|缩进|列表|项目符号|编号|插入|链接|图片|表格|代码|预览|全屏|源码|html|撤销|重做|清除格式|清空|format|toolbar|editor|rich\s*text|wysiwyg)/i;
  const FIELD_ACTION_HINT_RE = /(提交|保存|确定|確認|确认|取消|删除|刪除|重置|重設|新增|添加|上传|上傳|提交表单|submit|save|confirm|cancel|delete|remove|reset|add|upload)/i;
  const ADDRESS_HINT_RE = /(地址|通訊地址|通讯地址|住址|联系地址|联络地址|address|street|road|road\s*no|street\s*no|street\s*name|building|block|tower|suite|unit|room|floor|室|樓|楼|大廈|大厦|街號|街号|街名|门牌|門牌|门号|門號|province|city|district|region|area|state|county|postcode|zip)/i;
  const ADDRESS_HIERARCHY_HINT_RE = /(省份|省.{0,8}城市|城市.{0,8}(区县|區縣|地区|地區|区域|區域)|province.{0,16}city|city.{0,16}(district|region|area|county)|district|region|area|区县|區縣|地區|地区|區域|区域)/i;
  const ADDRESS_SECTION_HINT_RE = /(通訊地址\([中英]\)|通讯地址\([中英]\)|address\((cn|en)\)|中英|中文|英文|cn|en)/i;
  const ADDRESS_COMBO_SELECTOR = [
    'select',
    'button[role="combobox"]',
    '[role="combobox"]',
    'button[aria-haspopup="listbox"]',
    '[aria-haspopup="listbox"][role="button"]',
    'button[aria-controls]',
    '[aria-controls][role="button"]',
    'button[aria-owns]',
    '[aria-owns][role="button"]'
  ].join(', ');

  function isEditorToolbarElement(el, hintText = '') {
    if (!el || !(el instanceof Element)) return false;
    if (el.closest(EDITOR_TOOLBAR_SELECTOR)) return true;
    if (el.closest('[contenteditable="true"] [role="toolbar"], [contenteditable="true"] .toolbar')) return true;

    const tag = (el.tagName || '').toLowerCase();
    const role = getAttrText(el, 'role').toLowerCase();
    const text = normText(hintText || `${getAttrText(el, 'aria-label')} ${getAttrText(el, 'title')} ${el.textContent || ''}`);
    const classText = `${getAttrText(el, 'class')} ${getAttrText(el, 'data-testid')} ${getAttrText(el, 'data-action')}`.toLowerCase();
    if (EDITOR_CONTROL_TEXT_RE.test(text) || EDITOR_CONTROL_HINT_RE.test(classText)) return true;
    if ((tag === 'button' || role === 'button' || tag === 'div' || tag === 'span') && /toolbar|editor|rich\s*text|wysiwyg/.test(classText + ' ' + text)) return true;
    return false;
  }

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

  function inferAddressSectionVariant(text) {
    const hint = normText(text);
    if (!hint) return '';
    if (/(英文|英語|english|\(英\)|（英）|_en|en\b)/i.test(hint)) return 'en';
    if (/(中文|简体|繁體|繁体|中文地址|\(中\)|（中）|_cn|cn\b)/i.test(hint)) return 'zh';
    return '';
  }

  function scoreAddressSectionRoot(candidate, detailEl, sectionHint = '') {
    if (!(candidate instanceof Element) || !(detailEl instanceof Element)) return -Infinity;
    const comboCount = candidate.querySelectorAll(ADDRESS_COMBO_SELECTOR).length;
    const detailCount = candidate.querySelectorAll('textarea, input[type="text"], input:not([type])').length;
    if (comboCount < 2 || detailCount < 1) return -Infinity;

    const candidateText = normText(candidate.innerText).slice(0, 240);
    const detailText = `${getLabelText(detailEl)} ${getAttrText(detailEl, 'placeholder')} ${nearestText(detailEl)}`;
    let score = comboCount * 4 + detailCount * 2;

    if (candidate.contains(detailEl)) score += 8;
    if (candidateText && detailText && candidateText.includes(detailText.slice(0, 32))) score += 6;
    if (candidateText && ADDRESS_HINT_RE.test(candidateText)) score += 6;
    if (sectionHint) {
      if (candidateText.includes(sectionHint)) score += 8;
      if (inferAddressSectionVariant(candidateText) && inferAddressSectionVariant(candidateText) === inferAddressSectionVariant(sectionHint)) score += 4;
    }

    const rect = candidate.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) score += Math.max(0, 6 - Math.min(6, Math.floor(rect.height / 140)));
    return score;
  }

  function findAddressSectionRoot(detailEl, container, sectionHint = '') {
    const roots = [];
    let node = detailEl?.parentElement || null;
    while (node && node !== document.body && roots.length < 8) {
      roots.push(node);
      node = node.parentElement;
    }

    const candidates = [container, ...roots].filter((item, index, list) => item && list.indexOf(item) === index);
    let best = container;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      const score = scoreAddressSectionRoot(candidate, detailEl, sectionHint);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    return best || container || detailEl.parentElement || document.body;
  }

  function inferSegmentRole(el, groupContext = '', index = 0, total = 0) {
    const label = getLabelText(el);
    const placeholder = normText(el.getAttribute('placeholder'));
    const aria = getAttrText(el, 'aria-label');
    const title = getAttrText(el, 'title');
    const context = `${label} ${placeholder} ${aria} ${title} ${groupContext}`;
    const slot = inferAddressSlot(context);
    if (slot) return slot;

    const shortCapacity = Number(el.getAttribute('maxlength') || 0) > 0 && Number(el.getAttribute('maxlength') || 0) <= 4;
    const size = Number(el.getAttribute('size') || 0);
    if (shortCapacity || (size > 0 && size <= 4)) {
      if (index === 0 && total >= 3) return 'streetName';
      if (index === total - 1) return 'streetNo';
    }

    return '';
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

  function getAttrText(el, attr) {
    return normText(el?.getAttribute?.(attr) || '');
  }

  function getReferencedElement(el, attrNames = []) {
    if (!el || !(el instanceof Element)) return null;
    for (const attrName of attrNames) {
      const raw = getAttrText(el, attrName);
      if (!raw) continue;
      const ids = raw.split(/[\s,]+/).filter(Boolean);
      for (const id of ids) {
        const node = document.getElementById(id);
        if (node) return node;
      }
    }
    return null;
  }

  function collectOptionAliases(node) {
    const values = [
      node?.textContent || '',
      getAttrText(node, 'aria-label'),
      getAttrText(node, 'title'),
      getAttrText(node, 'data-label'),
      getAttrText(node, 'data-value'),
      getAttrText(node, 'value')
    ];
    if (node?.dataset) {
      values.push(node.dataset.label || '', node.dataset.value || '', node.dataset.text || '', node.dataset.title || '');
    }

    const unique = [];
    for (const item of values) {
      const normalized = normText(item);
      if (!normalized) continue;
      if (!unique.includes(normalized)) unique.push(normalized);
    }
    return unique;
  }

  function getSelectPanelCandidates(el) {
    const refs = [getReferencedElement(el, ['aria-controls', 'aria-owns'])].filter(Boolean);
    const container = findContainer(el);
    if (container) {
      refs.push(...Array.from(container.querySelectorAll(SELECT_PANEL_SELECTOR)));
    }

    refs.push(...Array.from(document.querySelectorAll(SELECT_PANEL_SELECTOR)));

    return refs.filter((node, index, list) => node && list.indexOf(node) === index);
  }

  function resolveSelectTrigger(el) {
    if (!el || !(el instanceof Element)) {
      return { selectLike: false, reason: '' };
    }

    const tag = (el.tagName || '').toLowerCase();
    const role = getAttrText(el, 'role').toLowerCase();
    const hasPopup = getAttrText(el, 'aria-haspopup').toLowerCase();
    const text = `${getLabelText(el)} ${getAttrText(el, 'aria-label')} ${getAttrText(el, 'placeholder')} ${nearestText(el)}`.trim();
    const hintText = `${text} ${getAttrText(el, 'class')} ${getAttrText(el, 'data-testid')} ${getAttrText(el, 'data-select')} ${getAttrText(el, 'data-dropdown')} ${getAttrText(el, 'data-cascader')} ${getAttrText(el, 'data-picker')}`;
    const hint = hintText.toLowerCase();
    const actionText = FIELD_ACTION_HINT_RE.test(hintText);

    if (isEditorToolbarElement(el, hintText)) {
      return { selectLike: false, reason: '' };
    }

    if (tag === 'select') {
      return { selectLike: true, reason: '原生 select 元素' };
    }

    // Arco/Ant 等组件常见形态：readonly input 作为下拉触发器，
    // 真实可点击节点在父级容器，不应被当作普通文本框。
    if (tag === 'input') {
      const readonlyLike =
        el.hasAttribute('readonly') ||
        getAttrText(el, 'aria-readonly').toLowerCase() === 'true' ||
        getAttrText(el, 'readonly') !== '';
      const selfClass = getAttrText(el, 'class').toLowerCase();
      const parentClass = getAttrText(el.parentElement, 'class').toLowerCase();
      const wrapperClass = getAttrText(el.closest('[class*="select"], [role="combobox"], [aria-haspopup], [aria-controls], [aria-owns]'), 'class').toLowerCase();
      const selectClassHint = `${selfClass} ${parentClass} ${wrapperClass}`;
      const chooseHint = `${getAttrText(el, 'placeholder')} ${getLabelText(el)} ${nearestText(el)}`;
      if (readonlyLike && (/select|dropdown|picker|cascader|arco-select|ant-select|semi-select|el-select|n-base-select/.test(selectClassHint) || /(请选|請選|选择|選擇|select)/i.test(chooseHint))) {
        return { selectLike: true, reason: 'readonly 输入框具备下拉触发器特征' };
      }
    }

    const panelRefs = getSelectPanelCandidates(el).filter((node) => {
      const panelRole = getAttrText(node, 'role').toLowerCase();
      return panelRole === 'listbox' || panelRole === 'menu' || panelRole === 'tree';
    });

    if (role === 'combobox' || role === 'listbox') {
      return { selectLike: true, reason: `语义角色 ${role}` };
    }

    if (hasPopup === 'listbox') {
      return { selectLike: true, reason: 'aria-haspopup=listbox' };
    }

    if (panelRefs.length && (getAttrText(el, 'aria-controls') || getAttrText(el, 'aria-owns'))) {
      return { selectLike: true, reason: 'aria-controls/aria-owns 指向列表面板' };
    }

    if ((tag === 'button' || role === 'button' || tag === 'div' || tag === 'span') && /select|dropdown|picker|cascader|choice|option|options/.test(hint) && !actionText) {
      const strongSignal =
        /select|dropdown|picker|cascader/.test(getAttrText(el, 'class').toLowerCase()) ||
        getAttrText(el, 'aria-label') ||
        getAttrText(el, 'placeholder') ||
        getAttrText(el, 'aria-controls') ||
        getAttrText(el, 'aria-owns') ||
        getAttrText(el, 'aria-haspopup') ||
        getAttrText(el, 'data-select') ||
        getAttrText(el, 'data-dropdown') ||
        getAttrText(el, 'data-cascader') ||
        getAttrText(el, 'data-picker');
      if (strongSignal) {
        return { selectLike: true, reason: '按钮/容器具备下拉语义' };
      }
    }

    if ((getAttrText(el, 'aria-expanded') || getAttrText(el, 'aria-disabled')) && /select|dropdown|picker|cascader/.test(hint) && !actionText) {
      return { selectLike: true, reason: '展开态属性与下拉语义一致' };
    }

    return { selectLike: false, reason: '' };
  }

  function getTextInputGroup(el) {
    const container = findContainer(el);
    if (!container) return [];
    return Array.from(
      container.querySelectorAll('input[type="text"], input:not([type]), input[type="tel"], input[inputmode="numeric"], input[type="search"]')
    ).filter((node) => visible(node) && !node.disabled);
  }

  function looksLikeSegmentInput(el, peers = []) {
    if (!el || !(el instanceof Element)) return false;
    if (peers.length < 3) return false;

    const maxLength = Number(el.getAttribute('maxlength') || 0);
    const size = Number(el.getAttribute('size') || 0);
    const placeholder = normText(el.getAttribute('placeholder'));
    const rect = el.getBoundingClientRect();
    const shortCapacity = (maxLength > 0 && maxLength <= 4) || (size > 0 && size <= 4);
    const narrowWidth = rect.width > 0 && rect.width <= 96;
    const peersShort = peers.filter((node) => {
      const peerMax = Number(node.getAttribute('maxlength') || 0);
      const peerSize = Number(node.getAttribute('size') || 0);
      const peerRect = node.getBoundingClientRect();
      return (peerMax > 0 && peerMax <= 4) || (peerSize > 0 && peerSize <= 4) || (peerRect.width > 0 && peerRect.width <= 96);
    }).length;

    if (shortCapacity) return true;
    if (narrowWidth && peersShort >= Math.max(2, peers.length - 1) && !placeholder) return true;
    return false;
  }

  function isAddressDetailInput(el, label = '', placeholder = '', context = '') {
    if (!(el instanceof Element)) return false;
    const tag = (el.tagName || '').toLowerCase();
    const type = String(el.getAttribute('type') || '').toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') return false;
    if (tag === 'input' && type && !['text', 'search', 'tel'].includes(type)) return false;
    const hint = `${label} ${placeholder} ${context} ${getAttrText(el, 'aria-label')} ${getAttrText(el, 'title')}`;
    return ADDRESS_HINT_RE.test(hint);
  }

  function buildFieldEvidence({ score, reasons, source }) {
    return {
      score,
      reason: reasons[0] || '',
      reasons,
      source
    };
  }

  function inferBaseScore(kind, label, placeholder, context) {
    let score = 0.62;
    if (label) score += 0.12;
    if (placeholder) score += 0.05;
    if (context) score += 0.05;
    if (kind !== 'text') score += 0.08;
    return Math.max(0.18, Math.min(0.98, score));
  }

  function toFiniteNumber(input) {
    if (input == null) return null;
    if (typeof input === 'string' && input.trim() === '') return null;
    const n = Number(input);
    return Number.isFinite(n) ? n : null;
  }

  function oneYearRuleFromHint(hintText = '') {
    return /(一週年|一周年|滿足一週年|满一周年|滿一週年|超过一年|超過一年|一年或以上|滿一年|满一年|營運超過一年|运营超过一年|成立.{0,6}(一年|周年))/i.test(
      String(hintText || '')
    );
  }

  function inferRequiredFromContext(container, hintText = '') {
    const hint = String(hintText || '');
    if (/(必填|required|必須|必须|不得为空|不可为空)/i.test(hint)) return true;
    if (!(container instanceof Element)) return false;
    if (container.querySelector('[required], [aria-required="true"]')) return true;
    if (
      container.querySelector(
        '.arco-form-item-label-required-symbol, .ant-form-item-required, .el-form-item.is-required, .required, [data-required="true"]'
      )
    ) {
      return true;
    }
    const labelText = normText(
      container.querySelector('label, .arco-form-item-label, .ant-form-item-label, .el-form-item__label')?.textContent || ''
    );
    if (/^\*/.test(labelText) || /[*＊]/.test(labelText)) return true;
    return false;
  }

  function compactConstraint(constraint = {}) {
    const next = {};
    for (const [key, value] of Object.entries(constraint || {})) {
      if (value == null) continue;
      if (typeof value === 'string' && !value.trim()) continue;
      if (Array.isArray(value) && !value.length) continue;
      next[key] = value;
    }
    return next;
  }

  function buildElementConstraint(el, hintText = '') {
    if (!(el instanceof Element)) return {};
    const tag = (el.tagName || '').toLowerCase();
    const type = normText(el.getAttribute('type')).toLowerCase();
    const role = normText(el.getAttribute('role')).toLowerCase();
    const inputMode = normText(el.getAttribute('inputmode')).toLowerCase();
    const pattern = normText(el.getAttribute('pattern'));
    const min = normText(el.getAttribute('min'));
    const max = normText(el.getAttribute('max'));
    const minLength = toFiniteNumber(el.getAttribute('minlength'));
    const maxLength = toFiniteNumber(el.getAttribute('maxlength'));
    const step = normText(el.getAttribute('step'));
    const ariaMin = toFiniteNumber(el.getAttribute('aria-valuemin'));
    const ariaMax = toFiniteNumber(el.getAttribute('aria-valuemax'));
    const numericLike =
      type === 'number' ||
      type === 'range' ||
      role === 'spinbutton' ||
      inputMode === 'numeric' ||
      inputMode === 'decimal' ||
      inputMode === 'tel' ||
      !!pattern && /\\d|\[0-9]/.test(pattern);
    const dateLike = type === 'date' || /日期|date|时间|time|成立/.test(String(hintText || ''));
    const required =
      el.hasAttribute('required') ||
      String(el.getAttribute('aria-required') || '').toLowerCase() === 'true';

    return compactConstraint({
      inputTag: tag,
      inputType: type || tag,
      role: role || undefined,
      inputMode: inputMode || undefined,
      pattern: pattern || undefined,
      min: min || undefined,
      max: max || undefined,
      minNumber: ariaMin != null ? ariaMin : undefined,
      maxNumber: ariaMax != null ? ariaMax : undefined,
      minLength: minLength != null ? minLength : undefined,
      maxLength: maxLength != null ? maxLength : undefined,
      step: step || undefined,
      required: required || undefined,
      numericLike: numericLike || undefined,
      dateLike: dateLike || undefined,
      multiple: (tag === 'select' && el.multiple) || undefined,
      accept: normText(el.getAttribute('accept')) || undefined
    });
  }

  function mergeConstraints(list = []) {
    const merged = {
      enumOptions: []
    };
    for (const item of list) {
      const c = item || {};
      if (c.required) merged.required = true;
      if (c.numericLike) merged.numericLike = true;
      if (c.dateLike) merged.dateLike = true;
      if (c.multiple) merged.multiple = true;
      if (c.segmented) merged.segmented = true;
      if (c.oneYearRequired) merged.oneYearRequired = true;
      if (c.olderThanDays != null) {
        const n = toFiniteNumber(c.olderThanDays);
        if (n != null) merged.olderThanDays = Math.max(toFiniteNumber(merged.olderThanDays) || 0, n);
      }
      if (!merged.inputType && c.inputType) merged.inputType = c.inputType;
      if (!merged.inputTag && c.inputTag) merged.inputTag = c.inputTag;
      if (!merged.inputMode && c.inputMode) merged.inputMode = c.inputMode;
      if (!merged.role && c.role) merged.role = c.role;
      if (!merged.pattern && c.pattern) merged.pattern = c.pattern;
      if (!merged.step && c.step) merged.step = c.step;
      if (!merged.accept && c.accept) merged.accept = c.accept;
      if (!merged.min && c.min) merged.min = c.min;
      if (!merged.max && c.max) merged.max = c.max;
      if (c.minNumber != null) {
        const current = toFiniteNumber(merged.minNumber);
        const incoming = toFiniteNumber(c.minNumber);
        if (incoming != null) merged.minNumber = current == null ? incoming : Math.max(current, incoming);
      }
      if (c.maxNumber != null) {
        const current = toFiniteNumber(merged.maxNumber);
        const incoming = toFiniteNumber(c.maxNumber);
        if (incoming != null) merged.maxNumber = current == null ? incoming : Math.min(current, incoming);
      }
      if (c.minLength != null) {
        const current = toFiniteNumber(merged.minLength);
        const incoming = toFiniteNumber(c.minLength);
        if (incoming != null) merged.minLength = current == null ? incoming : Math.max(current, incoming);
      }
      if (c.maxLength != null) {
        const current = toFiniteNumber(merged.maxLength);
        const incoming = toFiniteNumber(c.maxLength);
        if (incoming != null) merged.maxLength = current == null ? incoming : Math.min(current, incoming);
      }
      if (Array.isArray(c.enumOptions)) {
        for (const option of c.enumOptions) {
          const text = normText(option);
          if (!text) continue;
          if (!merged.enumOptions.includes(text)) merged.enumOptions.push(text);
        }
      }
    }
    return compactConstraint(merged);
  }

  function buildFieldConstraintsFromElements(elements = [], hintText = '', overrides = {}) {
    const baseList = [];
    for (const el of elements) {
      if (!(el instanceof Element)) continue;
      baseList.push(buildElementConstraint(el, hintText));
    }
    const oneYearRequired = oneYearRuleFromHint(hintText) || !!overrides.oneYearRequired;
    baseList.push(
      compactConstraint({
        ...overrides,
        oneYearRequired: oneYearRequired || undefined,
        olderThanDays: oneYearRequired ? Math.max(366, Number(overrides.olderThanDays || 366)) : overrides.olderThanDays
      })
    );
    return mergeConstraints(baseList);
  }

  function ensureDomId(el) {
    if (!el || !(el instanceof Element)) return '';
    let id = el.getAttribute(EID_ATTR);
    if (id) return id;
    id = `fp2_${Date.now().toString(36)}_${seq++}`;
    el.setAttribute(EID_ATTR, id);
    return id;
  }

  const FIELD_CONTAINER_SELECTOR = [
    'li[id]',
    '.control-group',
    '.controls',
    '[data-formpilot-field]',
    '[data-field]',
    '.form-field',
    '.form-item',
    '.el-form-item',
    '.ant-form-item',
    '.van-field',
    '.ivu-form-item',
    '.fb-form-field',
    '.fb-form-item',
    '.fb-runtime-input-field',
    '.fb-form-fields > *',
    '.arco-form-item',
    '.arco-form-item-wrapper-col',
    'fieldset',
    '[role="group"]',
    '[role="radiogroup"]'
  ].join(', ');

  function hasFieldLikeDescendants(node) {
    if (!(node instanceof Element)) return false;
    return !!node.querySelector(
      'input, textarea, select, button[role="combobox"], [role="combobox"], [role="radiogroup"], [role="radio"], [role="checkbox"], [aria-haspopup="listbox"], .fb-runtime-cascader-trigger, .fb-runtime-ranking-item, .rating-item, .nps-scale__score-btn, [contenteditable="true"]'
    );
  }

  function hasFieldLikeLabel(node) {
    if (!(node instanceof Element)) return false;
    return !!node.querySelector('label, .label, .field-label, .form-label, .fb-field-label, .fb-runtime-field-heading, .arco-form-item-label');
  }

  function findNearestStableWrapper(el) {
    let node = el?.parentElement || null;
    let fallback = null;
    let depth = 0;
    while (node && node !== document.body && depth < 8) {
      const id = normText(node.getAttribute('id'));
      const stamp = normText(node.getAttribute('data-formpilot-stamp'));
      const fieldLike = hasFieldLikeDescendants(node);
      if ((id || stamp) && fieldLike) {
        if (!fallback) fallback = node;
        if (hasFieldLikeLabel(node) || /^(address|contact|company|office|district|area|region|mobile|email|phone|verify|captcha|brn|name)/i.test(id)) {
          return node;
        }
      }
      node = node.parentElement;
      depth += 1;
    }
    return fallback;
  }

  function findContainer(el) {
    if (!(el instanceof Element)) return null;
    const direct = el.closest(FIELD_CONTAINER_SELECTOR);
    if (direct) return direct;

    const stableWrapper = findNearestStableWrapper(el);
    if (stableWrapper) return stableWrapper;

    return el.parentElement;
  }

  function nearestText(el) {
    const container = findContainer(el);
    return container ? normText(container.innerText).slice(0, 220) : '';
  }

  function getLabelText(el) {
    if (!el) return '';

    const aria = normText(el.getAttribute('aria-label'));
    if (aria) return aria;

    const labelledBy = normText(el.getAttribute('aria-labelledby'));
    if (labelledBy) {
      const node = document.getElementById(labelledBy);
      const text = normText(node?.textContent || '');
      if (text) return text;
    }

    if (el.id) {
      const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      const text = normText(forLabel?.textContent || '');
      if (text) return text;
    }

    const parentLabel = el.closest('label');
    if (parentLabel) {
      const text = normText(parentLabel.textContent || '');
      if (text) return text;
    }

    const container = findContainer(el);
    if (container) {
      const labelNode = container.querySelector('label, .label, .field-label, .form-label, .fb-field-label, .fb-runtime-field-heading');
      const text = normText(labelNode?.textContent || '');
      if (text) return text;

      const row = el.closest('tr');
      if (row && row.children.length >= 2) {
        for (const cell of Array.from(row.children)) {
          if (cell.contains(el)) break;
          const rowText = extractLabelCandidate(cell);
          if (rowText) return rowText;
        }
      }

      let prev = el.parentElement;
      while (prev && prev !== container) {
        let sib = prev.previousElementSibling;
        while (sib) {
          const prevText = extractLabelCandidate(sib);
          if (prevText) return prevText;
          sib = sib.previousElementSibling;
        }
        prev = prev.parentElement;
      }

      const directChildren = Array.from(container.children || []);
      for (const child of directChildren) {
        if (child.contains(el)) continue;
        const childText = extractLabelCandidate(child);
        if (childText) return childText;
      }
    }

    return '';
  }

  function buildSelector(el) {
    if (!el || !(el instanceof Element)) return '';

    if (el.id && !/^\d+$/.test(el.id)) return `#${CSS.escape(el.id)}`;

    const attrs = ['data-formpilot-stamp', 'name', 'data-testid', 'data-field', 'data-name', 'placeholder', 'aria-label'];
    for (const attr of attrs) {
      const value = normText(el.getAttribute(attr));
      if (!value) continue;
      const safe = value.replace(/"/g, '\\"');
      return `${el.tagName.toLowerCase()}[${attr}="${safe}"]`;
    }

    const path = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body && path.length < 8) {
      const tag = node.tagName.toLowerCase();
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter((x) => x.tagName === node.tagName)
        : [];
      const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : '';
      path.unshift(`${tag}${nth}`);
      node = node.parentElement;
    }
    return path.join(' > ');
  }

  function buildScopedSelector(el, container = null) {
    if (!el || !(el instanceof Element)) return '';
    const base = buildSelector(el);
    if (!base) return '';

    const explicitContainer = container instanceof Element ? container : findContainer(el);
    if (!explicitContainer || explicitContainer === el) return base;

    const containerId = normText(explicitContainer.getAttribute('id'));
    if (containerId && !/^\d+$/.test(containerId)) {
      const safeId = CSS.escape(containerId);
      const candidate = `${explicitContainer.tagName.toLowerCase()}#${safeId} ${base}`;
      try {
        const hits = document.querySelectorAll(candidate);
        if (hits.length === 1 || (hits.length > 1 && Array.from(hits).includes(el))) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }

    const stamp = normText(explicitContainer.getAttribute('data-formpilot-stamp'));
    if (stamp) {
      const safeStamp = stamp.replace(/"/g, '\\"');
      const candidate = `${explicitContainer.tagName.toLowerCase()}[data-formpilot-stamp="${safeStamp}"] ${base}`;
      try {
        const hits = document.querySelectorAll(candidate);
        if (hits.length === 1 || (hits.length > 1 && Array.from(hits).includes(el))) {
          return candidate;
        }
      } catch {
        // ignore
      }
    }

    return base;
  }

  function uniqueNonEmpty(list = []) {
    const result = [];
    const seen = new Set();
    for (const item of list || []) {
      const text = normText(item);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
    }
    return result;
  }

  function buildLocatorCandidates(el, container = null) {
    if (!(el instanceof Element)) return [];
    const tag = el.tagName.toLowerCase();
    const candidates = [];
    if (el.id && !/^\d+$/.test(el.id)) {
      candidates.push(`#${CSS.escape(el.id)}`);
      candidates.push(`${tag}#${CSS.escape(el.id)}`);
    }
    const attrs = ['data-formpilot-stamp', 'name', 'data-testid', 'data-field', 'data-name', 'aria-label', 'placeholder'];
    for (const attr of attrs) {
      const value = normText(el.getAttribute(attr));
      if (!value) continue;
      const safe = value.replace(/"/g, '\\"');
      candidates.push(`${tag}[${attr}="${safe}"]`);
    }
    const role = normText(el.getAttribute('role')).toLowerCase();
    if (role) candidates.push(`${tag}[role="${role}"]`);
    const scoped = buildScopedSelector(el, container);
    const base = buildSelector(el);
    if (scoped) candidates.push(scoped);
    if (base) candidates.push(base);
    return uniqueNonEmpty(candidates);
  }

  function buildContainerLocatorCandidates(container) {
    if (!(container instanceof Element)) return [];
    const tag = container.tagName.toLowerCase();
    const candidates = [];
    if (container.id && !/^\d+$/.test(container.id)) {
      candidates.push(`#${CSS.escape(container.id)}`);
      candidates.push(`${tag}#${CSS.escape(container.id)}`);
    }
    const attrs = ['data-formpilot-stamp', 'data-testid', 'data-field', 'data-name', 'aria-label'];
    for (const attr of attrs) {
      const value = normText(container.getAttribute(attr));
      if (!value) continue;
      const safe = value.replace(/"/g, '\\"');
      candidates.push(`${tag}[${attr}="${safe}"]`);
    }
    const base = buildSelector(container);
    if (base) candidates.push(base);
    return uniqueNonEmpty(candidates);
  }

  function computeLocatorStability(locatorCandidates = [], containerCandidates = []) {
    let score = 0.35;
    const merged = [...(locatorCandidates || []), ...(containerCandidates || [])];
    if (merged.some((item) => /^#/.test(item) || /#/.test(item))) score += 0.35;
    if (merged.some((item) => /data-testid|data-formpilot-stamp|name=|aria-label=/.test(item))) score += 0.2;
    if (merged.some((item) => /:nth-of-type\(/.test(item))) score -= 0.18;
    if (merged.some((item) => />/.test(item))) score -= 0.08;
    return Math.max(0.1, Math.min(0.98, Number(score.toFixed(2))));
  }

  function buildFieldFingerprint(fieldLike = {}) {
    return [
      normText(fieldLike.selector || '').toLowerCase(),
      normText(fieldLike.containerSelector || '').toLowerCase(),
      normText(fieldLike.label || '').toLowerCase(),
      normText(fieldLike.placeholder || '').toLowerCase()
    ].join('|');
  }

  function resolveFieldLocatorElement(el, selectLike = false) {
    if (!(el instanceof Element)) return el;
    if (!selectLike) return el;

    const preferred = el.closest(
      '[data-formpilot-stamp], [role="combobox"], .arco-select-view, .arco-select, .ant-select, .el-select, .semi-select, .n-base-selection, [aria-haspopup="listbox"], [aria-controls], [aria-owns]'
    );
    return preferred instanceof Element ? preferred : el;
  }

  function collectSelectOptions(el) {
    if (!el) return [];

    if ((el.tagName || '').toLowerCase() === 'select') {
      return Array.from(el.options || [])
        .map((opt, index) => ({
          index,
          value: normText(opt.value || ''),
          label: normText(opt.textContent || ''),
          text: normText(opt.textContent || ''),
          aliases: collectOptionAliases(opt)
        }))
        .filter((opt) => opt.label);
    }

    const trigger = resolveSelectTrigger(el);
    if (!trigger.selectLike) return [];

    const panels = getSelectPanelCandidates(el);
    const panel = panels.find((node) => visible(node)) || panels[0] || null;
    if (!panel) return [];

    return Array.from(
      panel.querySelectorAll(
        '[role="option"], [role="menuitem"], [role="treeitem"], option, [aria-selected], [data-radix-collection-item], [data-slot="select-item"], [data-value], [data-label], [data-option], [data-testid*="option"], li, button, .el-select-dropdown__item, .el-select-dropdown__item span, .ant-select-item-option, .ant-select-item-option-content, .arco-select-option, .n-base-select-option, .semi-select-option, .t-select__option'
      )
    )
      .filter((node) => visible(node))
      .map((node, index) => {
        const label = normText(node.textContent || node.getAttribute('aria-label') || node.getAttribute('title') || node.getAttribute('data-label') || '');
        const value = normText(node.getAttribute('data-value') || node.getAttribute('value') || node.getAttribute('aria-valuetext') || '');
        return {
          index,
          value,
          label,
          text: label,
          domId: ensureDomId(node),
          selector: buildSelector(node),
          aliases: collectOptionAliases(node)
        };
      })
      .filter((opt) => opt.label && !/暂无数据|無資料|loading|加载中|載入中/i.test(opt.label));
  }

  function classifyField(el, label, placeholder, context) {
    const tag = (el.tagName || '').toLowerCase();
    const type = String(el.getAttribute('type') || '').toLowerCase();
    const role = String(el.getAttribute('role') || '').toLowerCase();
    const inputmode = String(el.getAttribute('inputmode') || '').toLowerCase();
    const pattern = String(el.getAttribute('pattern') || '').trim();
    const directHint = `${label} ${placeholder}`;
    const contextHint = `${context}`;
    const classHint = `${getAttrText(el, 'class')} ${getAttrText(el.parentElement, 'class')}`.toLowerCase();
    const shortLabel = normText(label);
    const shortPlaceholder = normText(placeholder);
    const readonlyLike =
      el.hasAttribute('readonly') ||
      getAttrText(el, 'aria-readonly').toLowerCase() === 'true' ||
      getAttrText(el, 'readonly') !== '';

    if (shortLabel === '姓' || shortPlaceholder === '姓' || shortLabel === '姓氏' || shortPlaceholder === '姓氏') return 'lastName';
    if (shortLabel === '名' || shortPlaceholder === '名' || shortLabel === '名字' || shortPlaceholder === '名字') return 'firstName';
    if (isBankCardHintText(`${directHint} ${contextHint}`)) return 'bankCard';
    if (
      type === 'tel' &&
      !/手机|手機|手机号|手機號|mobile|cell/i.test(`${directHint} ${contextHint}`) &&
      !/(统一社会信用代码|統一社會信用代碼|社会信用代码|社會信用代碼|信用代码|信用代碼|统一信用代码|統一信用代碼|納税人識別號|纳税人识别号|商業登記|商业登记|unified social credit|social credit code|taxpayer identification|tax id|brn|business registration|company registration|registration number|證照編號|证照编号)/i.test(`${directHint} ${contextHint}`)
    ) return 'tel';

    if (/(公司|企業|企业|機構|机构|組織|组织|單位|单位|雇主|政府|government|organization|organisation|company|entity|agency|employer|corp|corporation).*(名稱|名称|name)|cert.*name|company\s*name|organization\s*name|organisation\s*name|legal\s*entity\s*name|enterprise\s*name/i.test(directHint)) return 'companyName';
    if (/(统一社会信用代码|統一社會信用代碼|社会信用代码|社會信用代碼|信用代码|信用代碼|统一信用代码|統一信用代碼|納税人識別號|纳税人识别号|商業登記(?:證)?號(?:碼)?|商业登记(?:证)?号(?:码)?|商業登記|商业登记|商業登記證|商业登记证|unified social credit(?: code| identifier)?|social credit code|taxpayer identification(?: number)?|tax id|brn|business registration(?: number| no\.?| #)?|registration number|company registration(?: number| no\.?)|證照編號|证照编号)/i.test(directHint)) return 'companyId';
    if (/(驗證碼|验证码|驗證碼|verify code|verification code)/i.test(directHint)) return 'verification';
    if (/(職位|职位|職稱|职称|職業|职业|工種|工种|occupation|profession|job\s*title|position|title)/i.test(directHint)) return 'jobTitle';
    if (/(姓氏|姓\(中\)|姓\(英\)|姓（中）|姓（英）|last name|family name|surname)/i.test(directHint)) return 'lastName';
    if (/(名字|名\(中\)|名\(英\)|名（中）|名（英）|first name|given name|forename)/i.test(directHint)) return 'firstName';
    if (type === 'file') return 'file';
    if (type === 'radio' || role === 'radiogroup' || role === 'radio') return 'radioGroup';
    if (type === 'checkbox' || role === 'checkbox') return 'checkboxGroup';
    if (tag === 'input' && readonlyLike && /(请选|請選|选择|選擇|select)/i.test(placeholder) && /select|dropdown|picker|cascader|arco-select|ant-select|semi-select|el-select|n-base-select/.test(classHint)) return 'select';
    if (tag === 'select' || role === 'combobox') return 'select';
    if (
      type === 'number' ||
      role === 'spinbutton' ||
      inputmode === 'numeric' ||
      inputmode === 'decimal' ||
      (pattern && (/\\d|\[0-9]/.test(pattern) && !/[a-z]/i.test(pattern.replace(/\\d/g, '')))) ||
      el.hasAttribute('aria-valuemin') ||
      el.hasAttribute('aria-valuemax') ||
      /input-number|number-input|arco-input-number|ant-input-number/.test(classHint)
    ) return 'number';
    if (type === 'date' || /日期|時間|时间|生日|出生日期|出生日期|birth\s*date|date\s*of\s*birth|\bdob\b|date|time/.test(directHint)) return 'date';
    if (/邮箱|郵箱|電郵|电子邮件|電子郵件|电邮|e-?mail|mail\s*address/i.test(directHint)) return 'email';
    if (/身份证|身份證|身份証|身分證|身分証|证件|證件|護照|护照|id\s*card|idcard|identity\s*(document|card)|identification|passport|document\s*(number|no\.?)/i.test(directHint)) return 'idcard';
    if (/固定电话|固定電話|住宅電話|办公电话|辦公電話|固話|固话|landline|telephone|tel/i.test(directHint)) return 'tel';
    if (/电话|電話|手机|手機|手机号|手機號|手提電話|流動電話|移动电话|聯絡電話|联络电话|聯繫電話|联系电话|mobile|phone|contact\s*(number|phone)|phone\s*number/i.test(directHint)) return 'phone';
    if (/姓名|中文姓名|英文姓名|全名|申請人|申请人|聯絡人|联系人|name|full\s*name|contact\s*person|applicant/i.test(directHint)) return 'fullName';
    if (/地址|通訊地址|通讯地址|聯絡地址|联系地址|住址|居住地址|郵寄地址|邮寄地址|省份|城市|区县|區縣|地區|地区|区域|區域|address|mailing\s*address|residential\s*address|home\s*address|contact\s*address|street|road|district|region|area|city|state|province|街號|街号|街名|门牌|門牌|楼|樓|building|tower|block|flat|unit|room|室|floor|层|層/i.test(directHint)) return 'addressDetail';
    if (/邮箱|郵箱|電郵|电子邮件|電子郵件|电邮|e-?mail|mail\s*address/i.test(contextHint)) return 'email';
    if (/身份证|身份證|身份証|身分證|身分証|证件|證件|護照|护照|id\s*card|idcard|identity\s*(document|card)|identification|passport|document\s*(number|no\.?)/i.test(contextHint)) return 'idcard';
    if (/日期|時間|时间|生日|出生日期|出生日期|birth\s*date|date\s*of\s*birth|\bdob\b|date|time/.test(contextHint)) return 'date';
    if (isBankCardHintText(contextHint)) return 'bankCard';
    if (/(公司|企業|企业|機構|机构|組織|组织|單位|单位|雇主|政府|government|organization|organisation|company|entity|agency|employer|corp|corporation).*(名稱|名称|name)|cert.*name|company\s*name|organization\s*name|organisation\s*name|legal\s*entity\s*name|enterprise\s*name/i.test(contextHint)) return 'companyName';
    if (/(统一社会信用代码|統一社會信用代碼|社会信用代码|社會信用代碼|信用代码|信用代碼|统一信用代码|統一信用代碼|納税人識別號|纳税人识别号|商業登記(?:證)?號(?:碼)?|商业登记(?:证)?号(?:码)?|商業登記|商业登记|商業登記證|商业登记证|unified social credit(?: code| identifier)?|social credit code|taxpayer identification(?: number)?|tax id|brn|business registration(?: number| no\.?| #)?|registration number|company registration(?: number| no\.?)|證照編號|证照编号)/i.test(contextHint)) return 'companyId';
    if (/(驗證碼|验证码|verify code|verification code)/i.test(contextHint)) return 'verification';
    if (/(職位|职位|職稱|职称|職業|职业|工種|工种|occupation|profession|job\s*title|position|title)/i.test(contextHint)) return 'jobTitle';
    if (/(姓氏|姓\(中\)|姓\(英\)|姓（中）|姓（英）|last name|family name|surname)/i.test(contextHint)) return 'lastName';
    if (/(名字|名\(中\)|名\(英\)|名（中）|名（英）|first name|given name|forename)/i.test(contextHint)) return 'firstName';
    if (/固定电话|固定電話|住宅電話|办公电话|辦公電話|固話|固话|landline|telephone|tel/i.test(contextHint)) return 'tel';
    if (/电话|電話|手机|手機|手机号|手機號|手提電話|流動電話|移动电话|聯絡電話|联络电话|聯繫電話|联系电话|mobile|phone|contact\s*(number|phone)|phone\s*number/i.test(contextHint)) return 'phone';
    if (/姓名|中文姓名|英文姓名|全名|申請人|申请人|聯絡人|联系人|name|full\s*name|contact\s*person|applicant/i.test(contextHint)) return 'fullName';
    if (/地址|通訊地址|通讯地址|聯絡地址|联系地址|住址|居住地址|郵寄地址|邮寄地址|省份|城市|区县|區縣|地區|地区|区域|區域|address|mailing\s*address|residential\s*address|home\s*address|contact\s*address|street|road|district|region|area|city|state|province|街號|街号|街名|门牌|門牌|楼|樓|building|tower|block|flat|unit|room|室|floor|层|層/i.test(contextHint)) return 'addressDetail';
    return 'text';
  }

  function autoDetectRoot() {
    const activeTabPanel = findActiveTabPanel();
    if (activeTabPanel) return activeTabPanel;

    const candidates = Array.from(
      document.querySelectorAll('form, [role="form"], main, section, .form, .form-wrapper, .page-content, .content')
    ).filter((x) => visible(x));

    if (!candidates.length) return document.body;

    let best = document.body;
    let bestScore = -Infinity;

    for (const root of candidates) {
      // 必须用 visible() 过滤，否则 aria-hidden 隐藏的 Tab 面板字段仍会被计入
      const fillables = Array.from(
        root.querySelectorAll(
          'input, textarea, select, button[role="combobox"], [role="radiogroup"], input[type="radio"], input[type="checkbox"]'
        )
      ).filter(visible).length;
      if (!fillables) continue;

      const text = normText(root.innerText).slice(0, 1800);
      let score = fillables * 3;
      if (/提交|保存|注册|送出|確認|confirm|提交表单/i.test(text)) score += 8;
      if (/设置默认地区|按钮颜色|字体大小|上传头图|样式设置|显示标签|显示副标题/i.test(text)) score -= 20;
      if (score > bestScore) {
        bestScore = score;
        best = root;
      }
    }

    return best;
  }

  function findActiveTabPanel() {
    const activeTriggers = Array.from(
      document.querySelectorAll(
        '[role="tab"][aria-selected="true"], [role="tab"].active, [aria-selected="true"][aria-controls], button.active[data-tab], [data-state="active"][role="tab"], .tabs .active, .tab-list .active'
      )
    ).filter(visible);

    const panelSelectors = [
      '.arco-tabs-content .arco-tabs-content-item-active',
      '.ant-tabs-tabpane-active',
      '[role="tabpanel"].active',
      '[role="tabpanel"][data-state="active"]',
      '[role="tabpanel"][aria-hidden="false"]',
      '[data-tab-panel].active',
      '[data-tab-panel][data-state="active"]',
      '.tab-panel.active',
      '.tab-pane.active',
      '.tabs-panel.active',
      '.tabpanel.active'
    ].join(', ');

    const panelCandidates = [];
    const seen = new Set();

    const pushPanel = (panel, priority = 0) => {
      if (!(panel instanceof Element) || !visible(panel)) return;
      if (seen.has(panel)) return;
      seen.add(panel);
      const fillables = Array.from(
        panel.querySelectorAll(
          'input:not([type="hidden"]), textarea, select, button[role="combobox"], [role="combobox"], [aria-haspopup="listbox"], [contenteditable="true"]'
        )
      ).filter(visible).length;
      if (!fillables) return;
      const activeLike = panel.matches(
        '.arco-tabs-content .arco-tabs-content-item-active, .ant-tabs-tabpane-active, [role="tabpanel"].active, [role="tabpanel"][data-state="active"], [role="tabpanel"][aria-hidden="false"], [data-tab-panel].active, [data-tab-panel][data-state="active"], .tab-panel.active, .tab-pane.active, .tabs-panel.active, .tabpanel.active'
      ) ? 12 : 0;
      panelCandidates.push({ panel, score: fillables * 3 + priority + activeLike });
    };

    const globalPanels = Array.from(document.querySelectorAll(panelSelectors)).filter(visible);
    for (const panel of globalPanels) {
      pushPanel(panel, 18);
    }

    for (const trigger of activeTriggers) {
      const controls = [
        normText(trigger.getAttribute('aria-controls')),
        normText(trigger.getAttribute('aria-owns')),
        normText(trigger.getAttribute('data-controls')),
        normText(trigger.getAttribute('href')).replace(/^#/, '')
      ].filter(Boolean);
      for (const id of controls) {
        const panel = document.getElementById(id);
        if (panel) pushPanel(panel, 20);
      }

      const tabList = trigger.closest('[role="tablist"], .tabs, .tab-list, .tab-nav, .nav-tabs, [data-tabs]');
      if (tabList) {
        const siblingPanels = Array.from(tabList.parentElement?.querySelectorAll?.('[role="tabpanel"], [data-tab-panel], .tab-panel, .tab-content, .tab-pane, .panel, .tabpanel') || []);
        siblingPanels.forEach((panel) => {
          if (!panel.contains(trigger)) pushPanel(panel, panel.classList.contains('active') ? 12 : 0);
        });
      }
    }

    if (!panelCandidates.length) return null;
    panelCandidates.sort((a, b) => b.score - a.score);
    return panelCandidates[0]?.panel || null;
  }

  function resolveChoiceOptionNode(node) {
    if (!(node instanceof Element)) return null;
    const wrapped = node.closest(
      'label, [role="radio"], [role="checkbox"], .arco-radio, .arco-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper, .el-radio, .el-checkbox'
    );
    return wrapped || node;
  }

  function isChoiceNodeVisible(node) {
    const resolved = resolveChoiceOptionNode(node);
    if (!(resolved instanceof Element)) return false;
    if (resolved.closest('[aria-hidden="true"]')) return false;
    if (visible(resolved)) return true;
    return resolved !== node && visible(node);
  }

  function collectOptionsFromGroup(groupEl, typeHint) {
    const rawNodes = Array.from(
      groupEl.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [aria-checked], button, label, .option, .el-radio, .el-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper, .arco-radio, .arco-checkbox'
      )
    ).filter((node) => isChoiceNodeVisible(node));

    const options = [];
    const seen = new Set();
    for (const node of rawNodes) {
      const optionNode = resolveChoiceOptionNode(node) || node;
      const t = normText(
        optionNode.textContent ||
        optionNode.getAttribute('aria-label') ||
        node.getAttribute('aria-label') ||
        node.getAttribute('value') ||
        ''
      );
      if (!t || /^上传$|^刪除$|^删除$/.test(t)) continue;
      const domId = ensureDomId(optionNode);
      const key = `${domId}|${t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        index: options.length,
        domId,
        selector: buildSelector(optionNode),
        label: t,
        value: normText(node.getAttribute('value') || '')
      });
      if (options.length >= 10) break;
    }

    if (!options.length && (typeHint === 'radioGroup' || typeHint === 'checkboxGroup')) {
      const fallbacks = Array.from(groupEl.querySelectorAll('input[type="radio"], input[type="checkbox"]')).filter(
        (node) => isChoiceNodeVisible(node)
      );
      for (const node of fallbacks) {
        const optionNode = resolveChoiceOptionNode(node) || node;
        options.push({
          index: options.length,
          domId: ensureDomId(optionNode),
          selector: buildSelector(optionNode),
          label: getLabelText(optionNode) || getLabelText(node) || `选项${options.length + 1}`,
          value: normText(node.getAttribute('value') || '')
        });
      }
    }

    return options;
  }

  const CUSTOM_RENDERER_ROOT_SELECTOR = [
    'form-renderer',
    '.fb-form-fields',
    '.fb-runtime-input-field',
    '.fb-choice-options',
    '.fb-runtime-field-heading'
  ].join(', ');

  const CUSTOM_RENDERER_CONTROL_SELECTOR = [
    'input:not([type="hidden"])',
    'textarea',
    'select',
    'button',
    '[role="combobox"]',
    '[role="radiogroup"]',
    '[role="radio"]',
    '[role="checkbox"]',
    '[aria-haspopup="listbox"]',
    '.fb-runtime-cascader-trigger',
    '.fb-runtime-ranking-item',
    '.rating-item',
    '.nps-scale__score-btn',
    '[contenteditable="true"]'
  ].join(', ');

  const CUSTOM_RENDERER_HEADING_SELECTOR = [
    '.fb-runtime-field-heading',
    '.fb-field-label',
    '.fb-form-field-label',
    '.fb-label',
    '.field-label',
    '.form-label',
    '[data-field-title]',
    '[data-field-label]'
  ].join(', ');

  function hasCustomFormRenderer(root) {
    if (!(root instanceof Element)) return false;
    return root.matches(CUSTOM_RENDERER_ROOT_SELECTOR) || !!root.querySelector(CUSTOM_RENDERER_ROOT_SELECTOR);
  }

  function customRendererRowFor(node, root) {
    if (!(node instanceof Element)) return null;
    let current = node;
    while (current && current !== document.body && current !== root?.parentElement) {
      if (current.parentElement?.classList?.contains('fb-form-fields')) return current;
      if (current.classList?.contains('fb-runtime-input-field')) return current;
      current = current.parentElement;
    }
    return node;
  }

  function hasCustomRendererControl(row) {
    if (!(row instanceof Element)) return false;
    return !!Array.from(row.querySelectorAll(CUSTOM_RENDERER_CONTROL_SELECTOR)).find((node) => {
      if (!(node instanceof Element)) return false;
      if (node.closest('#formpilot-v2-fab-root')) return false;
      const tag = (node.tagName || '').toLowerCase();
      const type = String(node.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden') return false;
      if (tag === 'input' && type === 'file') return true;
      return visible(node) || isChoiceNodeVisible(node);
    });
  }

  function findCustomRendererRows(root) {
    const rows = [];
    const seen = new Set();
    const pushRow = (row) => {
      if (!(row instanceof Element)) return;
      if (seen.has(row)) return;
      if (row.closest('#formpilot-v2-fab-root')) return;
      if (!visible(row)) return;
      if (!hasCustomRendererControl(row)) return;
      seen.add(row);
      rows.push(row);
    };

    const fieldLists = [];
    if (root.matches?.('.fb-form-fields')) fieldLists.push(root);
    fieldLists.push(...Array.from(root.querySelectorAll('.fb-form-fields')));
    for (const list of fieldLists) {
      for (const child of Array.from(list.children || [])) {
        const nestedFieldRows = Array.from(child.querySelectorAll('[data-field-key]'))
          .filter((node) => node instanceof Element && node !== child && hasCustomRendererControl(node));
        if (nestedFieldRows.length) {
          nestedFieldRows.forEach(pushRow);
        } else {
          pushRow(child);
        }
      }
    }

    if (!rows.length) {
      const controls = Array.from(root.querySelectorAll('.fb-runtime-input-field, .fb-choice-options, [role="radiogroup"], [role="checkbox"]'));
      for (const control of controls) pushRow(customRendererRowFor(control, root));
    }

    return rows;
  }

  function sanitizeCustomRendererLabel(text = '') {
    let value = normText(text)
      .replace(/^[*＊\s]+|[*＊\s]+$/g, '')
      .replace(/\b(required|optional)\b/gi, ' ')
      .replace(/(必填|必須|必须|選填|选填|可選|可选)/g, ' ')
      .replace(/[：:]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    value = value.replace(/^(題目|题目|question)\s*[:：]?\s*/i, '').trim();
    if (!value) return '';
    if (/^(请输入|請輸入|请选择|請選擇|选择|選擇|select|choose|上传|上傳|删除|刪除|提交|保存|确定|確認)$/i.test(value)) return '';
    if (value.length > 90) return '';
    return value;
  }

  function extractCustomRendererLabel(row) {
    if (!(row instanceof Element)) return '';

    const headings = Array.from(row.querySelectorAll(CUSTOM_RENDERER_HEADING_SELECTOR)).filter(visible);
    for (const heading of headings) {
      const text = sanitizeCustomRendererLabel(heading.textContent || '');
      if (text) return text;
    }

    const labelled = row.querySelector('[aria-labelledby]');
    if (labelled instanceof Element) {
      const ref = getReferencedElement(labelled, ['aria-labelledby']);
      const text = sanitizeCustomRendererLabel(ref?.textContent || '');
      if (text) return text;
    }

    const firstControl = Array.from(row.querySelectorAll(CUSTOM_RENDERER_CONTROL_SELECTOR)).find((node) => visible(node) || isChoiceNodeVisible(node));
    if (firstControl instanceof Element) {
      let branch = firstControl;
      while (branch.parentElement && branch.parentElement !== row) branch = branch.parentElement;
      let sibling = branch.previousElementSibling;
      while (sibling) {
        const text = sanitizeCustomRendererLabel(sibling.textContent || '');
        if (text) return text;
        sibling = sibling.previousElementSibling;
      }
    }

    for (const child of Array.from(row.children || [])) {
      if (child.querySelector?.(CUSTOM_RENDERER_CONTROL_SELECTOR)) continue;
      const text = sanitizeCustomRendererLabel(child.textContent || '');
      if (text) return text;
    }

    return '';
  }

  function getCustomRendererPlaceholder(el) {
    if (!(el instanceof Element)) return '';
    const attrs = [
      el.getAttribute('placeholder'),
      el.getAttribute('aria-placeholder'),
      el.getAttribute('data-placeholder'),
      el.getAttribute('title'),
      el.getAttribute('aria-label')
    ];
    for (const item of attrs) {
      const text = normText(item || '');
      if (text) return text;
    }
    const text = normText(el.textContent || '');
    if (/^(请输入|請輸入|请选择|請選擇|选择|選擇|select|choose)/i.test(text)) return text;
    return '';
  }

  function isCustomRendererTextInput(el) {
    if (!(el instanceof Element)) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea' || el.matches('[contenteditable="true"]')) return true;
    if (tag !== 'input') return false;
    const type = String(el.getAttribute('type') || 'text').toLowerCase();
    return !['hidden', 'radio', 'checkbox', 'file', 'button', 'submit', 'reset'].includes(type);
  }

  function isCustomRendererSelectTrigger(el) {
    if (!(el instanceof Element)) return false;
    if (!visible(el) || el.disabled) return false;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'select') return true;
    const role = getAttrText(el, 'role').toLowerCase();
    if (role === 'radio' || role === 'checkbox' || role === 'radiogroup') return false;
    return resolveSelectTrigger(el).selectLike;
  }

  function isMultiSelectTrigger(el) {
    if (!(el instanceof Element)) return false;
    const attrText = [
      getAttrText(el, 'class'),
      getAttrText(el, 'aria-label'),
      getAttrText(el, 'data-select'),
      getAttrText(el, 'data-testid'),
      getAttrText(el, 'data-multiple'),
      getAttrText(el, 'multiple')
    ].join(' ').toLowerCase();
    if (el instanceof HTMLSelectElement && el.multiple) return true;
    if (getAttrText(el, 'aria-multiselectable').toLowerCase() === 'true') return true;
    if (/(^|\s|-)multi(select|ple)?(\s|-|$)|multiple|多选|多選/.test(attrText)) return true;
    if (el.querySelector?.('[role="checkbox"], input[type="checkbox"]')) return true;
    return false;
  }

  function isCustomRendererDateTrigger(el, label = '') {
    if (!(el instanceof Element)) return false;
    if (!visible(el) || el.disabled) return false;
    const tag = (el.tagName || '').toLowerCase();
    const type = String(el.getAttribute('type') || '').toLowerCase();
    const role = getAttrText(el, 'role').toLowerCase();
    if (role === 'combobox' || role === 'radio' || role === 'checkbox') return false;
    if (tag === 'input' && type === 'date') return true;
    if (tag !== 'button' && role !== 'button') return false;
    const hint = `${label} ${getCustomRendererPlaceholder(el)} ${el.textContent || ''} ${getAttrText(el, 'class')}`;
    if (FIELD_ACTION_HINT_RE.test(hint) && !/(日期|時間|时间|生日|出生|date|birth|dob)/i.test(hint)) return false;
    return /(日期|時間|时间|生日|出生|date|birth\s*date|date\s*of\s*birth|\bdob\b)/i.test(hint);
  }

  function isCustomRendererSignatureLike(row, label = '') {
    const hint = `${label} ${normText(row?.innerText || '')}`;
    return /(签名|簽名|签署|簽署|手写签名|手寫簽名|signature|sign\s*here|e-sign)/i.test(hint);
  }

  function getCustomRendererFieldKey(row) {
    if (!(row instanceof Element)) return '';
    return normText(row.getAttribute('data-field-key') || row.closest('[data-field-key]')?.getAttribute('data-field-key') || '');
  }

  function getCustomRendererRowHint(row, label = '') {
    if (!(row instanceof Element)) return label || '';
    return normText([
      getCustomRendererFieldKey(row),
      label,
      row.getAttribute('class') || '',
      row.innerText || ''
    ].join(' '));
  }

  function getVisibleWidgetNodes(row, selector) {
    if (!(row instanceof Element)) return [];
    return Array.from(row.querySelectorAll(selector)).filter((node) => node instanceof Element && visible(node));
  }

  function buildWidgetOptions(nodes = [], fallbackPrefix = 'Option', fallbackLabels = []) {
    const options = [];
    const seen = new Set();
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (!(node instanceof Element)) continue;
      const rawText = normText(
        fallbackLabels[i] ||
        node.textContent ||
        node.getAttribute('aria-label') ||
        node.getAttribute('title') ||
        node.getAttribute('value') ||
        node.getAttribute('data-value') ||
        ''
      );
      const label = rawText || `${fallbackPrefix}${i + 1}`;
      const domId = ensureDomId(node);
      const key = `${domId}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        index: options.length,
        domId,
        selector: buildSelector(node),
        label,
        value: normText(node.getAttribute('value') || node.getAttribute('data-value') || label)
      });
    }
    return options;
  }

  function inferCompositeInputKind(row, label = '', input = null) {
    if (!(row instanceof Element)) return '';
    const key = getCustomRendererFieldKey(row).toLowerCase();
    const hint = `${key} ${label || ''} ${getCustomRendererPlaceholder(input)} ${row.innerText || ''} ${row.getAttribute('class') || ''}`;
    if (
      row.querySelector('.fb-runtime-id-card-doc-type-inner, [class*="id-card-doc-type"]') ||
      /(^|[_-])id(card|document)?([_-]|$)|identity|passport|证件|證件|身份证|身份證|身分證/.test(hint)
    ) {
      return 'idcard';
    }
    if (
      row.querySelector('.fb-runtime-mobile-area-code-trigger, [class*="mobile-area-code"]') ||
      /(^|[_-])mobile([_-]|$)|phone|tel|手机|手機|手机号|手機號|电话|電話/.test(hint)
    ) {
      return 'phone';
    }
    return '';
  }

  function inferCompositePrefixRole(kind = '', text = '') {
    const hint = normText(text);
    if (kind === 'phone') {
      if (/(^|[^\d])\+?852([^\d]|$)|香港|hong\s*kong|\bhk\b/i.test(hint)) return 'hk';
      if (/(^|[^\d])\+?853([^\d]|$)|澳門|澳门|macau|macao|\bmo\b/i.test(hint)) return 'mo';
      if (/(^|[^\d])\+?86([^\d]|$)|中國|中国|內地|内地|大陆|大陸|china|\bcn\b/i.test(hint)) return 'cn';
      return '';
    }
    if (kind === 'idcard') {
      if (/护照|護照|passport/i.test(hint)) return 'passport';
      if (/港澳台|港澳臺|居民证|居民證|居住证|居住證|台胞|回乡|回鄉|hmt/i.test(hint)) return 'hmtResident';
      if (/身份证|身份證|身份証|身分證|身分証|id\s*card|identity/i.test(hint)) return 'cnId';
      return '';
    }
    return '';
  }

  function defaultCompositePrefixOptions(kind = '') {
    if (kind === 'phone') {
      return [
        { index: 0, value: '+86', label: '+86', text: '+86', role: 'cn' },
        { index: 1, value: '+852', label: '+852', text: '+852', role: 'hk' },
        { index: 2, value: '+853', label: '+853', text: '+853', role: 'mo' }
      ];
    }
    if (kind === 'idcard') {
      return [
        { index: 0, value: '身份证', label: '身份证', text: '身份证', role: 'cnId' },
        { index: 1, value: '护照', label: '护照', text: '护照', role: 'passport' },
        { index: 2, value: '港澳台居民居住证', label: '港澳台居民居住证', text: '港澳台居民居住证', role: 'hmtResident' }
      ];
    }
    return [];
  }

  function buildCompositePrefixMeta(kind = '', selectTriggers = []) {
    const triggers = (selectTriggers || [])
      .filter((node) => node instanceof Element)
      .map((node) => resolveFieldLocatorElement(node, true));
    const readPrefixText = (node) => normText(
      node?.textContent ||
      node?.getAttribute?.('aria-label') ||
      node?.getAttribute?.('title') ||
      node?.getAttribute?.('value') ||
      ''
    );
    const selectedTexts = triggers.map((node) => readPrefixText(node)).filter(Boolean);
    const options = [];
    const seen = new Set();
    for (const node of triggers) {
      const collected = collectSelectOptions(node);
      for (const opt of collected) {
        const label = normText(opt.label || opt.text || opt.value || '');
        if (!label) continue;
        const key = normalizeChoiceText(label);
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({
          ...opt,
          role: inferCompositePrefixRole(kind, `${label} ${opt.value || ''}`)
        });
      }
    }
    const defaults = defaultCompositePrefixOptions(kind);
    for (const opt of defaults) {
      const key = normalizeChoiceText(opt.label || opt.value || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      options.push(opt);
    }
    return {
      prefixSelectedTexts: selectedTexts,
      prefixSelectedRoles: selectedTexts.map((text) => inferCompositePrefixRole(kind, text)).filter(Boolean),
      prefixSelectOptions: options
    };
  }

  function isBirthdayRendererRow(row, label = '') {
    if (!(row instanceof Element)) return false;
    const hint = getCustomRendererRowHint(row, label);
    return !!row.querySelector('.fb-birthday-calendar-option') || /birthday|birth\s*date|\bdob\b|生日|出生|出生日期/.test(hint);
  }

  function buildBirthdayMeta(row) {
    const combos = getVisibleWidgetNodes(row, 'button[role="combobox"], [role="combobox"]').filter((node) => {
      if (node.closest('.fb-runtime-control-clear')) return false;
      return true;
    }).slice(0, 3);
    const roles = ['year', 'month', 'day'];
    const calendarTypeNodes = getVisibleWidgetNodes(row, '.fb-birthday-calendar-option');
    return {
      widget: 'birthday',
      birthdayComposite: true,
      selectLike: false,
      componentGroup: true,
      segmentDomIds: combos.map((node) => ensureDomId(resolveFieldLocatorElement(node, true))),
      segmentSelectors: combos.map((node) => buildSelector(resolveFieldLocatorElement(node, true))),
      segmentRoles: combos.map((_, index) => roles[index] || `slot${index + 1}`),
      calendarTypeDomIds: calendarTypeNodes.map((node) => ensureDomId(node)),
      calendarTypeSelectors: calendarTypeNodes.map((node) => buildSelector(node))
    };
  }

  function collectMatrixColumnLabels(table) {
    if (!(table instanceof Element)) return [];
    const headers = Array.from(table.querySelectorAll('thead tr th')).slice(1);
    return headers.map((node, index) => sanitizeCustomRendererLabel(node.textContent || '') || `Option${index + 1}`);
  }

  function buildMatrixChoiceFields(row, label = '') {
    const table = row.querySelector('.matrix-table-outer table');
    if (!(table instanceof Element)) return [];
    const columnLabels = collectMatrixColumnLabels(table);
    const bodyRows = Array.from(table.querySelectorAll('tbody tr')).filter((node) => node instanceof Element && visible(node));
    const fields = [];
    for (let rowIndex = 0; rowIndex < bodyRows.length; rowIndex += 1) {
      const matrixRow = bodyRows[rowIndex];
      const buttons = getVisibleWidgetNodes(matrixRow, '[role="radio"], button[role="radio"], .fb-ui-radio-group-item');
      if (buttons.length < 2) continue;
      const rowLabel = sanitizeCustomRendererLabel(matrixRow.querySelector('th')?.textContent || '') || `Row${rowIndex + 1}`;
      fields.push(buildCustomRendererField({
        row: matrixRow,
        locatorEl: buttons[0],
        kind: 'radioGroup',
        label: [label, rowLabel].filter(Boolean).join(' - '),
        options: buildWidgetOptions(buttons, 'Option', columnLabels),
        extraMeta: {
          widget: 'matrixChoice',
          matrixChoice: true,
          matrixRowLabel: rowLabel,
          parentFieldKey: getCustomRendererFieldKey(row),
          componentGroup: true,
          questionLike: true
        }
      }));
    }
    return fields;
  }

  function markCustomRendererNodes(skipNodes, row) {
    if (!(skipNodes instanceof Set) || !(row instanceof Element)) return;
    skipNodes.add(row);
    for (const node of Array.from(row.querySelectorAll(CUSTOM_RENDERER_CONTROL_SELECTOR))) {
      skipNodes.add(node);
      const optionNode = resolveChoiceOptionNode(node);
      if (optionNode) skipNodes.add(optionNode);
    }
  }

  function buildCustomRendererField({ row, locatorEl, kind, label, placeholder = '', options = [], extraMeta = {} }) {
    const fieldContainer = row || findContainer(locatorEl) || locatorEl;
    const context = normText(fieldContainer?.innerText || '').slice(0, 260);
    const hint = `${label || ''} ${placeholder || ''} ${context}`;
    const locatorCandidates = buildLocatorCandidates(locatorEl, fieldContainer);
    const containerCandidates = buildContainerLocatorCandidates(fieldContainer);
    const selector = locatorCandidates[0] || buildScopedSelector(locatorEl, fieldContainer) || buildSelector(locatorEl);
    const containerSelector = buildSelector(fieldContainer);
    const fingerprint = buildFieldFingerprint({
      selector,
      containerSelector,
      label,
      placeholder
    });
    const locatorStability = computeLocatorStability(locatorCandidates, containerCandidates);
    const enumOptions = options.map((item) => item.label || item.value).filter(Boolean);
    const constraints = buildFieldConstraintsFromElements(
      [locatorEl, fieldContainer],
      hint,
      {
        type: kind,
        required: inferRequiredFromContext(fieldContainer, hint),
        enumOptions,
        dateLike: kind === 'date' || undefined,
        inputType: kind === 'date' ? 'date' : undefined,
        questionLike: ['radioGroup', 'checkboxGroup'].includes(kind) || undefined
      }
    );
    const reasons = ['自定义表单渲染器适配层命中'];
    if (label) pushReason(reasons, '命中渲染器题干');
    if (options.length) pushReason(reasons, `候选项 ${options.length} 个`);
    if (kind === 'date') pushReason(reasons, '命中自定义日期按钮');

    return {
      id: `fb_${kind}_${Math.random().toString(36).slice(2, 8)}`,
      kind,
      domId: ensureDomId(locatorEl),
      selector,
      label,
      placeholder,
      context,
      confidence: 0.92,
      ...buildFieldEvidence({
        score: 0.92,
        reasons,
        source: 'scan:custom-renderer'
      }),
      containerSelector,
      fingerprint,
      constraints,
      options,
      meta: {
        fieldFingerprint: fingerprint,
        locatorStability,
        locatorCandidates,
        stableSelector: locatorCandidates[0] || '',
        containerLocatorCandidates: containerCandidates,
        stableContainerSelector: containerCandidates[0] || containerSelector || '',
        customRendererAdapter: 'fb-form-renderer',
        selectLike: kind === 'select',
        ...extraMeta
      }
    };
  }

  function detectCustomFormRendererFields(root, skipNodes) {
    if (!hasCustomFormRenderer(root)) return [];
    const fields = [];
    const rows = findCustomRendererRows(root);

    for (const row of rows) {
      if (!(row instanceof Element) || skipNodes.has(row)) continue;
      const label = extractCustomRendererLabel(row);
      if (isCustomRendererSignatureLike(row, label)) {
        markCustomRendererNodes(skipNodes, row);
        continue;
      }

      const matrixChoiceFields = buildMatrixChoiceFields(row, label);
      if (matrixChoiceFields.length) {
        markCustomRendererNodes(skipNodes, row);
        fields.push(...matrixChoiceFields);
        continue;
      }

      const rankingItems = getVisibleWidgetNodes(row, '.fb-runtime-ranking-item');
      if (rankingItems.length >= 2) {
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: rankingItems[0],
          kind: 'checkboxGroup',
          label,
          options: buildWidgetOptions(rankingItems, 'Option'),
          extraMeta: { widget: 'ranking', ranking: true, componentGroup: true, questionLike: true }
        }));
        continue;
      }

      const npsButtons = getVisibleWidgetNodes(row, '.nps-scale__score-btn');
      if (npsButtons.length >= 2) {
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: npsButtons[Math.max(0, npsButtons.length - 1)],
          kind: 'radioGroup',
          label,
          options: buildWidgetOptions(npsButtons, 'Score'),
          extraMeta: { widget: 'nps', scale: 'nps', scaleMax: npsButtons.length, componentGroup: true, questionLike: true }
        }));
        continue;
      }

      const ratingButtons = getVisibleWidgetNodes(row, '.rating-item');
      if (ratingButtons.length >= 2) {
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: ratingButtons[Math.max(0, ratingButtons.length - 1)],
          kind: 'radioGroup',
          label,
          options: buildWidgetOptions(ratingButtons, 'Score'),
          extraMeta: { widget: 'rating', scale: 'rating', scaleMax: ratingButtons.length, componentGroup: true, questionLike: true }
        }));
        continue;
      }

      const birthdayCombos = getVisibleWidgetNodes(row, 'button[role="combobox"], [role="combobox"]');
      if (isBirthdayRendererRow(row, label) && birthdayCombos.length >= 2) {
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: birthdayCombos[0],
          kind: 'date',
          label,
          placeholder: getCustomRendererPlaceholder(birthdayCombos[0]),
          extraMeta: buildBirthdayMeta(row)
        }));
        continue;
      }

      const radioGroup = Array.from(row.querySelectorAll('[role="radiogroup"]')).find(visible);
      if (radioGroup instanceof Element) {
        const options = collectOptionsFromGroup(radioGroup, 'radioGroup');
        if (options.length) {
          markCustomRendererNodes(skipNodes, row);
          fields.push(buildCustomRendererField({
            row,
            locatorEl: radioGroup,
            kind: 'radioGroup',
            label,
            options,
            extraMeta: { componentGroup: true, questionLike: true }
          }));
          continue;
        }
      }

      const checkboxControls = Array.from(row.querySelectorAll('input[type="checkbox"], [role="checkbox"]')).filter((node) => {
        if (!(node instanceof Element)) return false;
        if (node.disabled) return false;
        return isChoiceNodeVisible(node) || visible(node);
      });
      if (checkboxControls.length) {
        const checkboxGroup = row.querySelector('.fb-choice-options') || row;
        const options = collectOptionsFromGroup(checkboxGroup, 'checkboxGroup');
        if (options.length) {
          markCustomRendererNodes(skipNodes, row);
          fields.push(buildCustomRendererField({
            row,
            locatorEl: checkboxGroup,
            kind: 'checkboxGroup',
            label,
            options,
            extraMeta: { componentGroup: true, questionLike: true }
          }));
          continue;
        }
      }

      const addressHint = normText(`${label} ${row.innerText || ''}`);
      const addressSelectTriggers = Array.from(row.querySelectorAll('select, button[role="combobox"], [role="combobox"], [aria-haspopup="listbox"], [aria-controls], [aria-owns]'))
        .filter((node) => isCustomRendererSelectTrigger(node) && !isCustomRendererDateTrigger(node, label));
      const addressDetailInput = Array.from(row.querySelectorAll('input, textarea'))
        .filter((node) => isCustomRendererTextInput(node) && !node.disabled && visible(node))
        .find((node) => {
          const hint = `${label} ${getCustomRendererPlaceholder(node)} ${node.getAttribute('aria-label') || ''} ${addressHint}`;
          return ADDRESS_HINT_RE.test(hint);
        });
      if (
        ADDRESS_HINT_RE.test(addressHint) &&
        (addressSelectTriggers.length >= 2 || (addressSelectTriggers.length >= 1 && addressDetailInput instanceof Element && ADDRESS_HIERARCHY_HINT_RE.test(addressHint)))
      ) {
        const comboMeta = addressSelectTriggers.slice(0, 3).map((node, index) => {
          const comboHint = `${getLabelText(node)} ${getAttrText(node, 'aria-label')} ${getAttrText(node, 'placeholder')} ${getAttrText(node, 'title')} ${nearestText(node)}`;
          return {
            domId: ensureDomId(resolveFieldLocatorElement(node, true)),
            selector: buildSelector(resolveFieldLocatorElement(node, true)),
            label: getLabelText(node) || getCustomRendererPlaceholder(node),
            role: inferAddressSlot(comboHint, index === 0 ? 'province' : (index === 1 ? 'city' : 'district'))
          };
        });
        const sectionHintMatch = addressHint.match(ADDRESS_SECTION_HINT_RE);
        const sectionHint = sectionHintMatch ? sectionHintMatch[0] : '';
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: resolveFieldLocatorElement(addressSelectTriggers[0], true),
          kind: 'addressComponent',
          label: label || sectionHint || '地址',
          placeholder: addressDetailInput instanceof Element ? getCustomRendererPlaceholder(addressDetailInput) : '',
          options: [],
          extraMeta: {
            customRendererAddress: true,
            selectLike: false,
            componentGroup: true,
            comboboxDomIds: comboMeta.map((item) => item.domId),
            comboboxSelectors: comboMeta.map((item) => item.selector),
            comboboxLabels: comboMeta.map((item) => item.label),
            comboboxRoles: comboMeta.map((item) => item.role),
            detailDomId: addressDetailInput instanceof Element ? ensureDomId(addressDetailInput) : '',
            detailSelector: addressDetailInput instanceof Element ? buildSelector(addressDetailInput) : '',
            sectionHint,
            sectionVariant: inferAddressSectionVariant(sectionHint || label || addressHint)
          }
        }));
        continue;
      }

      const selectTriggers = Array.from(row.querySelectorAll('select, button[role="combobox"], [role="combobox"], [aria-haspopup="listbox"], [aria-controls], [aria-owns]'))
        .filter((node) => isCustomRendererSelectTrigger(node) && !isCustomRendererDateTrigger(node, label));
      const compositeTextInputs = Array.from(row.querySelectorAll('input, textarea, [contenteditable="true"]'))
        .filter((node) => isCustomRendererTextInput(node) && !node.disabled && visible(node));
      const hasCompositePrefix = selectTriggers.length > 0 || !!row.querySelector('.fb-runtime-mobile-area-code-trigger, .fb-runtime-id-card-doc-type-inner, [class*="mobile-area-code"], [class*="id-card-doc-type"]');
      const compositeKind = hasCompositePrefix && compositeTextInputs.length ? inferCompositeInputKind(row, label, compositeTextInputs[0]) : '';
      if (compositeKind) {
        const input = compositeTextInputs[0];
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: input,
          kind: compositeKind,
          label,
          placeholder: getCustomRendererPlaceholder(input),
          extraMeta: {
            compositeInput: true,
            prefixSelectDomIds: selectTriggers.map((node) => ensureDomId(resolveFieldLocatorElement(node, true))),
            prefixSelectSelectors: selectTriggers.map((node) => buildSelector(resolveFieldLocatorElement(node, true))),
            ...buildCompositePrefixMeta(compositeKind, selectTriggers)
          }
        }));
        continue;
      }

      const cascaderTrigger = Array.from(row.querySelectorAll('.fb-runtime-cascader-trigger, [data-cascader], [class*="cascader"]'))
        .find((node) => node instanceof Element && visible(node) && !isCustomRendererDateTrigger(node, label));
      if (cascaderTrigger instanceof Element) {
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: resolveFieldLocatorElement(cascaderTrigger, true),
          kind: 'select',
          label,
          placeholder: getCustomRendererPlaceholder(cascaderTrigger),
          options: collectSelectOptions(cascaderTrigger),
          extraMeta: { widget: 'cascader', cascader: true, selectLike: true }
        }));
        continue;
      }

      if (selectTriggers.length) {
        const trigger = selectTriggers[0];
        const multiSelect = isMultiSelectTrigger(trigger);
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: resolveFieldLocatorElement(trigger, true),
          kind: 'select',
          label,
          placeholder: getCustomRendererPlaceholder(trigger),
          options: collectSelectOptions(trigger),
          extraMeta: {
            selectLike: true,
            multiSelect,
            selectTriggerReason: resolveSelectTrigger(trigger).reason || '自定义渲染器下拉触发器'
          }
        }));
        continue;
      }

      const dateTriggers = Array.from(row.querySelectorAll('input[type="date"], button, [role="button"]'))
        .filter((node) => isCustomRendererDateTrigger(node, label));
      if (dateTriggers.length) {
        const trigger = dateTriggers[0];
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: trigger,
          kind: 'date',
          label,
          placeholder: getCustomRendererPlaceholder(trigger),
          extraMeta: { customDateButton: (trigger.tagName || '').toLowerCase() === 'button' }
        }));
        continue;
      }

      const textInputs = Array.from(row.querySelectorAll('input, textarea, [contenteditable="true"]'))
        .filter((node) => isCustomRendererTextInput(node) && !node.disabled && visible(node));
      if (textInputs.length) {
        markCustomRendererNodes(skipNodes, row);
        for (const input of textInputs) {
          const placeholder = getCustomRendererPlaceholder(input);
          fields.push(buildCustomRendererField({
            row,
            locatorEl: input,
            kind: classifyField(input, label, placeholder, normText(row.innerText || '').slice(0, 220)),
            label,
            placeholder
          }));
        }
        continue;
      }

      const fileInput = row.querySelector('input[type="file"]');
      if (fileInput instanceof Element) {
        markCustomRendererNodes(skipNodes, row);
        fields.push(buildCustomRendererField({
          row,
          locatorEl: fileInput,
          kind: 'file',
          label,
          placeholder: getCustomRendererPlaceholder(fileInput)
        }));
      }
    }

    return fields;
  }

  function collectAddressSelectContainers(root) {
    const containers = [];
    const seen = new Set();
    const push = (node) => {
      if (!(node instanceof Element) || seen.has(node) || !visible(node)) return;
      seen.add(node);
      containers.push(node);
    };
    for (const node of Array.from(root.querySelectorAll(FIELD_CONTAINER_SELECTOR))) push(node);
    return containers;
  }

  function detectAddressSelectComposite(root, skipNodes) {
    const fields = [];
    const containers = collectAddressSelectContainers(root);

    for (const container of containers) {
      if (skipNodes.has(container) || isEditorToolbarElement(container)) continue;
      const context = normText(container.innerText || '').slice(0, 260);
      const combos = Array.from(container.querySelectorAll(ADDRESS_COMBO_SELECTOR))
        .filter((node) => {
          if (!(node instanceof Element)) return false;
          if (skipNodes.has(node) || !visible(node) || isEditorToolbarElement(node)) return false;
          if (isCustomRendererDateTrigger(node, context)) return false;
          return resolveSelectTrigger(node).selectLike;
        })
        .sort((a, b) => {
          if (a === b) return 0;
          const pos = a.compareDocumentPosition(b);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        })
        .slice(0, 3);
      if (!combos.length) continue;
      const label = getLabelText(combos[0]) || extractLabelCandidate(container) || '';
      const hint = `${label} ${context} ${getAttrText(container, 'id')} ${getAttrText(container, 'class')}`;
      if (!ADDRESS_HINT_RE.test(hint)) continue;

      const detailEl = Array.from(container.querySelectorAll('textarea, input[type="text"], input:not([type])'))
        .filter((node) => !skipNodes.has(node) && visible(node) && !isEditorToolbarElement(node))
        .find((node) => isAddressDetailInput(node, label, normText(node.getAttribute('placeholder')), context));
      if (combos.length < 2 && !(combos.length >= 1 && detailEl instanceof Element && ADDRESS_HIERARCHY_HINT_RE.test(hint))) continue;
      const placeholder = detailEl instanceof Element ? normText(detailEl.getAttribute('placeholder')) : '';
      const sectionHintMatch = hint.match(ADDRESS_SECTION_HINT_RE);
      const sectionHint = sectionHintMatch ? sectionHintMatch[0] : '';
      const comboMeta = combos.map((node, index) => {
        const comboHint = `${getLabelText(node)} ${getAttrText(node, 'aria-label')} ${getAttrText(node, 'placeholder')} ${getAttrText(node, 'title')} ${nearestText(node)}`;
        return {
          domId: ensureDomId(node),
          selector: buildSelector(node),
          label: getLabelText(node),
          role: inferAddressSlot(comboHint, index === 0 ? 'province' : (index === 1 ? 'city' : 'district'))
        };
      });
      const selector = buildLocatorCandidates(combos[0], container)[0] || buildSelector(combos[0]);
      const containerSelector = buildSelector(container);
      const fingerprint = buildFieldFingerprint({
        selector,
        containerSelector,
        label: label || sectionHint || '地址',
        placeholder
      });
      const locatorCandidates = buildLocatorCandidates(combos[0], container);
      const containerCandidates = buildContainerLocatorCandidates(container);

      for (const node of combos) skipNodes.add(node);
      if (detailEl instanceof Element) skipNodes.add(detailEl);
      skipNodes.add(container);

      fields.push({
        id: `addr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'addressComponent',
        domId: ensureDomId(combos[0]),
        selector,
        label: label || sectionHint || '地址',
        placeholder,
        context,
        confidence: 0.93,
        ...buildFieldEvidence({
          score: 0.93,
          reasons: ['地址组件包含级联下拉'],
          source: 'scan:address-select-composite'
        }),
        containerSelector,
        fingerprint,
        widget: 'address-cascader',
        constraints: buildFieldConstraintsFromElements(
          [detailEl, ...combos, container],
          hint,
          {
            type: 'addressComponent',
            required: inferRequiredFromContext(container, hint)
          }
        ),
        options: [],
        meta: {
          fieldFingerprint: fingerprint,
          locatorStability: computeLocatorStability(locatorCandidates, containerCandidates),
          locatorCandidates,
          stableSelector: locatorCandidates[0] || '',
          containerLocatorCandidates: containerCandidates,
          stableContainerSelector: containerCandidates[0] || containerSelector || '',
          comboboxDomIds: comboMeta.map((item) => item.domId),
          comboboxSelectors: comboMeta.map((item) => item.selector),
          comboboxLabels: comboMeta.map((item) => item.label),
          comboboxRoles: comboMeta.map((item) => item.role),
          detailDomId: detailEl instanceof Element ? ensureDomId(detailEl) : '',
          detailSelector: detailEl instanceof Element ? buildSelector(detailEl) : '',
          sectionHint,
          sectionVariant: inferAddressSectionVariant(sectionHint || label || context)
        }
      });
    }

    return fields;
  }

  function detectAddressComposite(root, skipNodes) {
    const fields = [];
    const detailCandidates = Array.from(root.querySelectorAll('textarea, input[type="text"], input:not([type])')).filter(visible);

    for (const detailEl of detailCandidates) {
      if (skipNodes.has(detailEl) || isEditorToolbarElement(detailEl)) continue;
      const label = getLabelText(detailEl);
      const placeholder = normText(detailEl.getAttribute('placeholder'));
      const context = nearestText(detailEl);
      const hint = `${label} ${placeholder} ${context}`;
      if (!ADDRESS_HINT_RE.test(hint)) continue;

      const container = findContainer(detailEl);
      if (!container) continue;

      const sectionText = [label, placeholder, context].filter(Boolean).join(' ');
      // 地址组件必须限定在当前题目容器内，避免把别的题目的省市区下拉误拼进来。
      const sectionRoot = container;
      const comboCandidates = Array.from(sectionRoot.querySelectorAll(ADDRESS_COMBO_SELECTOR)).filter(
        (node) => visible(node) && !skipNodes.has(node) && !isEditorToolbarElement(node)
      );
      if (!comboCandidates.length) continue;

      const detailRect = detailEl.getBoundingClientRect();
      const combos = comboCandidates
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const comboHint = `${getLabelText(node)} ${getAttrText(node, 'aria-label')} ${getAttrText(node, 'placeholder')} ${getAttrText(node, 'title')} ${nearestText(node)}`;
          const role = inferAddressSlot(comboHint, '');
          const cy = rect.top + rect.height / 2;
          const cx = rect.left + rect.width / 2;
          const dy = Math.abs(cy - detailRect.top);
          const dx = Math.abs(cx - detailRect.left);
          const widthPenalty = rect.width < 30 ? 120 : 0;
          const rolePenalty = role ? 0 : 36;
          const sectionPenalty = sectionRoot && sectionRoot !== container && !sectionRoot.contains(node) ? 30 : 0;
          return { node, score: dy + dx * 0.35 + widthPenalty + rolePenalty + sectionPenalty, role };
        })
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map((item) => item.node)
        .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      if (combos.length < 2 && !ADDRESS_HIERARCHY_HINT_RE.test(sectionText)) continue;

      combos.forEach((node) => skipNodes.add(node));
      skipNodes.add(detailEl);
      const reasons = ['地址组件包含级联下拉与详细地址'];
      if (label) pushReason(reasons, '命中地址标签');
      if (placeholder) pushReason(reasons, '详细地址存在占位提示');
      if (sectionText) pushReason(reasons, '包含地址区块上下文');

      const sectionHintMatch = sectionText.match(ADDRESS_SECTION_HINT_RE);
      const sectionHint = sectionHintMatch ? sectionHintMatch[0] : '';
      const comboMeta = combos.map((node, index) => {
        const comboHint = `${getLabelText(node)} ${getAttrText(node, 'aria-label')} ${getAttrText(node, 'placeholder')} ${getAttrText(node, 'title')} ${nearestText(node)}`;
        return {
          domId: ensureDomId(node),
          selector: buildSelector(node),
          label: getLabelText(node),
          role: inferAddressSlot(comboHint, index === 0 ? 'province' : (index === 1 ? 'city' : 'district'))
        };
      });
      const addressConstraintHint = `${label} ${placeholder} ${context} ${sectionHint}`;
      const addressConstraints = buildFieldConstraintsFromElements(
        [detailEl, ...combos],
        addressConstraintHint,
        {
          type: 'addressComponent',
          required: inferRequiredFromContext(sectionRoot || container, addressConstraintHint)
        }
      );
      const addressContainerSelector = buildSelector(sectionRoot || container);
      const addressLocatorCandidates = buildLocatorCandidates(combos[0], sectionRoot || container);
      const addressContainerCandidates = buildContainerLocatorCandidates(sectionRoot || container);
      const addressSelector = addressLocatorCandidates[0] || buildSelector(combos[0]);
      const addressFingerprint = buildFieldFingerprint({
        selector: addressSelector,
        containerSelector: addressContainerSelector,
        label: label || sectionHint || '地址',
        placeholder
      });
      const addressLocatorStability = computeLocatorStability(addressLocatorCandidates, addressContainerCandidates);

      fields.push({
        id: `addr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'addressComponent',
        domId: ensureDomId(combos[0]),
        selector: addressSelector,
        label: label || sectionHint || '地址',
        placeholder,
        context,
        confidence: 0.95,
        ...buildFieldEvidence({
          score: 0.95,
          reasons,
          source: 'scan:address-composite'
        }),
        containerSelector: addressContainerSelector,
        fingerprint: addressFingerprint,
        widget: 'address-cascader',
        constraints: addressConstraints,
        options: [],
        meta: {
          fieldFingerprint: addressFingerprint,
          locatorStability: addressLocatorStability,
          locatorCandidates: addressLocatorCandidates,
          stableSelector: addressLocatorCandidates[0] || '',
          containerLocatorCandidates: addressContainerCandidates,
          stableContainerSelector: addressContainerCandidates[0] || addressContainerSelector || '',
          comboboxDomIds: comboMeta.map((item) => item.domId),
          comboboxSelectors: comboMeta.map((item) => item.selector),
          comboboxLabels: comboMeta.map((item) => item.label),
          comboboxRoles: comboMeta.map((item) => item.role),
          detailDomId: ensureDomId(detailEl),
          detailSelector: buildSelector(detailEl),
          sectionHint,
          sectionVariant: inferAddressSectionVariant(sectionHint)
        }
      });
    }

    return fields;
  }

  function detectSegmentedTextFields(root, skipNodes) {
    const fields = [];
    const groups = Array.from(
      root.querySelectorAll(
        '.form-item, .form-field, .el-form-item, .ant-form-item, .arco-form-item, .arco-form-item-wrapper-col, .fb-form-field, .fb-form-item, fieldset, [role="group"]'
      )
    ).filter(visible);

    for (const group of groups) {
      if (skipNodes.has(group) || isEditorToolbarElement(group)) continue;
      const context = nearestText(group);
      const semanticSource = `${context} ${normText(group.getAttribute('id') || '')} ${normText(group.getAttribute('class') || '')}`;
      const inputs = Array.from(
        group.querySelectorAll('input[type="text"], input:not([type]), input[type="tel"], input[type="number"], input[inputmode="numeric"], input[inputmode="decimal"]')
      ).filter(visible);
      if (inputs.length < 3) continue;
      const segmentLikeCount = inputs.filter((node) => looksLikeSegmentInput(node, inputs)).length;
      const hasSemanticContext = /(商業登記|商业登记|商業登記證|商业登记证|brn|business registration|registration number|unified social credit|social credit code|taxpayer identification|tax id|驗證碼|验证码|verify code|verification code)/i.test(semanticSource) || isBankCardHintText(semanticSource);
      const segmentInfos = inputs.map((node, index) => {
        const label = getLabelText(node);
        const placeholder = normText(node.getAttribute('placeholder'));
        const role = inferSegmentRole(node, context, index, inputs.length);
        return {
          node,
          label,
          placeholder,
          role,
          short: looksLikeSegmentInput(node, inputs)
        };
      });
      const roleCount = segmentInfos.filter((item) => item.role).length;
      const addressRoleCount = segmentInfos.filter((item) => /province|city|district|street|streetNo|streetName|building|floor|room|detail|roomFloorBuilding/.test(item.role)).length;
      const hasAddressSegment = /地址|address|街|路|號|号|室|樓|楼|大廈|大厦/i.test(context) || addressRoleCount > 0;
      const finalAddressSegment = !hasSemanticContext && hasAddressSegment;
      if (!hasSemanticContext && !finalAddressSegment && segmentLikeCount < Math.max(3, inputs.length - 1)) continue;

      inputs.forEach((node) => skipNodes.add(node));
      const kind = hasSemanticContext
        ? (isBankCardHintText(semanticSource) ? 'bankCard' : (/(驗證碼|验证码|verify code|verification code)/i.test(context) ? 'verification' : 'companyId'))
        : (finalAddressSegment ? 'addressDetail' : 'text');
      const label = getLabelText(inputs[0]) || context;
      const reasons = [
        hasSemanticContext ? '上下文命中注册号/验证码语义' : '同容器内存在多个短输入格子'
      ];
      if (finalAddressSegment) pushReason(reasons, '分段输入包含地址语义');
      if (roleCount) pushReason(reasons, `识别到 ${roleCount} 个分段角色`);
      pushReason(reasons, `合并 ${inputs.length} 个分段输入`);
      const segmentedConstraintHint = `${label} ${context}`;
      const segmentedConstraints = buildFieldConstraintsFromElements(
        inputs,
        segmentedConstraintHint,
        {
          type: kind,
          segmented: true,
          required: inferRequiredFromContext(group, segmentedConstraintHint),
          numericLike: kind === 'companyId' || kind === 'verification' || kind === 'bankCard' ? true : undefined
        }
      );
      const segmentedContainerSelector = buildSelector(group);
      const segmentedLocatorCandidates = buildLocatorCandidates(inputs[0], group);
      const segmentedContainerCandidates = buildContainerLocatorCandidates(group);
      const segmentedSelector = segmentedLocatorCandidates[0] || buildSelector(inputs[0]);
      const segmentedFingerprint = buildFieldFingerprint({
        selector: segmentedSelector,
        containerSelector: segmentedContainerSelector,
        label,
        placeholder: normText(inputs[0].getAttribute('placeholder'))
      });
      const segmentedLocatorStability = computeLocatorStability(segmentedLocatorCandidates, segmentedContainerCandidates);

      fields.push({
        id: `${kind}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        domId: ensureDomId(inputs[0]),
        selector: segmentedSelector,
        label,
        placeholder: normText(inputs[0].getAttribute('placeholder')),
        context,
        confidence: hasSemanticContext ? 0.96 : (hasAddressSegment ? 0.82 : 0.48),
        ...buildFieldEvidence({
          score: hasSemanticContext ? 0.96 : (hasAddressSegment ? 0.82 : 0.48),
          reasons,
          source: 'scan:segmented-group'
        }),
        containerSelector: segmentedContainerSelector,
        fingerprint: segmentedFingerprint,
        constraints: segmentedConstraints,
        options: [],
        meta: {
          fieldFingerprint: segmentedFingerprint,
          locatorStability: segmentedLocatorStability,
          locatorCandidates: segmentedLocatorCandidates,
          stableSelector: segmentedLocatorCandidates[0] || '',
          containerLocatorCandidates: segmentedContainerCandidates,
          stableContainerSelector: segmentedContainerCandidates[0] || segmentedContainerSelector || '',
          segmented: true,
          segmentLikeCount,
          addressSegment: finalAddressSegment,
          segmentRoles: segmentInfos.map((item) => item.role || ''),
          segmentLabels: segmentInfos.map((item) => item.label || ''),
          segmentPlaceholders: segmentInfos.map((item) => item.placeholder || ''),
          segmentDomIds: inputs.map((node) => ensureDomId(node)),
          segmentSelectors: inputs.map((node) => buildSelector(node))
        }
      });
    }

    return fields;
  }

  function detectNativeChoiceFields(root, skipNodes, type) {
    const selector = type === 'radioGroup' ? 'input[type="radio"]' : 'input[type="checkbox"]';
    const nodes = Array.from(root.querySelectorAll(selector)).filter((node) => {
      if (!(node instanceof Element)) return false;
      if (skipNodes.has(node) || node.disabled) return false;
      if (node.closest('#formpilot-v2-fab-root')) return false;
      if (node.closest('[aria-hidden="true"]')) return false;
      return isChoiceNodeVisible(node);
    });
    const grouped = new Map();

    for (const node of nodes) {
      const optionNode = resolveChoiceOptionNode(node) || node;
      const key = node.name || buildSelector(findContainer(optionNode)) || ensureDomId(optionNode);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(node);
    }

    const fields = [];
    for (const [key, list] of grouped.entries()) {
      if (!list.length) continue;
      const first = list[0];
      const firstOptionNode = resolveChoiceOptionNode(first) || first;
      const explicitGroupNode = firstOptionNode.closest(
        '.arco-radio-group, .arco-checkbox-group, .ant-radio-group, .ant-checkbox-group, .el-radio-group, .el-checkbox-group, [role="radiogroup"], [role="group"]'
      );
      const nativeContainer = findContainer(firstOptionNode) || root;
      const groupNode = explicitGroupNode || nativeContainer || firstOptionNode;
      const label = getLabelText(nativeContainer) || getLabelText(groupNode) || getLabelText(firstOptionNode);
      const placeholder = normText(first.getAttribute('placeholder') || firstOptionNode.getAttribute('placeholder'));
      const context = nearestText(groupNode) || nearestText(firstOptionNode);
      const options = list.map((node, idx) => ({
        index: idx,
        domId: ensureDomId(resolveChoiceOptionNode(node) || node),
        selector: buildSelector(resolveChoiceOptionNode(node) || node),
        label: getLabelText(resolveChoiceOptionNode(node) || node) || normText(node.value || '') || `选项${idx + 1}`,
        value: normText(node.value || '')
      }));
      const reasons = [`原生${type === 'radioGroup' ? '单选' : '多选'}组，共 ${options.length} 项`];
      if (label) pushReason(reasons, '存在选项组标签');
      const groupConstraintHint = `${label} ${placeholder} ${context}`;
      const groupConstraints = buildFieldConstraintsFromElements(
        [groupNode, ...list],
        groupConstraintHint,
        {
          type,
          required: inferRequiredFromContext(findContainer(groupNode) || groupNode, groupConstraintHint),
          enumOptions: options.map((item) => item.label || item.value).filter(Boolean),
          questionLike: /可選多項|可选多项|可複選|可复选|是否|題|题/.test(context)
        }
      );
      const nativeContainerSelector = buildSelector(nativeContainer);
      const nativeLocatorBase = explicitGroupNode || nativeContainer || groupNode;
      const nativeLocatorCandidates = explicitGroupNode
        ? buildLocatorCandidates(explicitGroupNode, nativeContainer)
        : buildContainerLocatorCandidates(nativeContainer);
      const nativeContainerCandidates = buildContainerLocatorCandidates(nativeContainer);
      const nativeSelector = nativeLocatorCandidates[0] || buildSelector(nativeLocatorBase);
      const nativeFingerprint = buildFieldFingerprint({
        selector: nativeSelector,
        containerSelector: nativeContainerSelector,
        label,
        placeholder
      });
      const nativeLocatorStability = computeLocatorStability(nativeLocatorCandidates, nativeContainerCandidates);

      fields.push({
        id: `${type}_${Math.random().toString(36).slice(2, 8)}`,
        kind: type,
        domId: ensureDomId(nativeLocatorBase),
        selector: nativeSelector,
        label,
        placeholder,
        context,
        confidence: 0.9,
        ...buildFieldEvidence({
          score: 0.9,
          reasons,
          source: `scan:${type}`
        }),
        containerSelector: nativeContainerSelector,
        fingerprint: nativeFingerprint,
        constraints: groupConstraints,
        options,
        meta: {
          fieldFingerprint: nativeFingerprint,
          locatorStability: nativeLocatorStability,
          locatorCandidates: nativeLocatorCandidates,
          stableSelector: nativeLocatorCandidates[0] || '',
          containerLocatorCandidates: nativeContainerCandidates,
          stableContainerSelector: nativeContainerCandidates[0] || nativeContainerSelector || '',
          groupKey: key,
          componentGroup: !!explicitGroupNode,
          questionLike: /可選多項|可选多项|可複選|可复选|是否|題|题/.test(context)
        }
      });
    }

    return fields;
  }

  function detectClassBasedChoiceGroups(root, skipNodes) {
    const groups = Array.from(
      root.querySelectorAll(
        '.arco-radio-group, .arco-checkbox-group, .ant-radio-group, .ant-checkbox-group, .el-radio-group, .el-checkbox-group'
      )
    ).filter((node) => visible(node) && !skipNodes.has(node) && !isEditorToolbarElement(node));

    const fields = [];
    for (const group of groups) {
      const classText = normText(group.getAttribute('class') || '').toLowerCase();
      const kind = /checkbox/.test(classText) ? 'checkboxGroup' : (/radio/.test(classText) ? 'radioGroup' : '');
      if (!kind) continue;
      const options = collectOptionsFromGroup(group, kind);
      if (!options.length) continue;
      const context = nearestText(group);
      if (/设置默认地区|字體大小|按钮颜色/.test(context)) continue;
      const reasons = [`组件${kind === 'radioGroup' ? '单选' : '多选'}组，共 ${options.length} 项`];
      const label = getLabelText(group);
      if (label) pushReason(reasons, '命中题干标签');
      const classGroupHint = `${label} ${context}`;
      const classGroupConstraints = buildFieldConstraintsFromElements(
        [group],
        classGroupHint,
        {
          type: kind,
          required: inferRequiredFromContext(findContainer(group) || group, classGroupHint),
          enumOptions: options.map((item) => item.label || item.value).filter(Boolean),
          questionLike: /可選多項|可选多项|可複選|可复选|是否|題|题/.test(context)
        }
      );
      const classContainer = findContainer(group) || root;
      const classContainerSelector = buildSelector(classContainer);
      const classLocatorCandidates = buildLocatorCandidates(group, classContainer);
      const classContainerCandidates = buildContainerLocatorCandidates(classContainer);
      const classSelector = classLocatorCandidates[0] || buildSelector(group);
      const classFingerprint = buildFieldFingerprint({
        selector: classSelector,
        containerSelector: classContainerSelector,
        label,
        placeholder: ''
      });
      const classLocatorStability = computeLocatorStability(classLocatorCandidates, classContainerCandidates);
      fields.push({
        id: `${kind}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        domId: ensureDomId(group),
        selector: classSelector,
        label,
        placeholder: '',
        context,
        confidence: 0.9,
        ...buildFieldEvidence({
          score: 0.9,
          reasons,
          source: 'scan:class-group'
        }),
        containerSelector: classContainerSelector,
        fingerprint: classFingerprint,
        constraints: classGroupConstraints,
        options,
        meta: {
          fieldFingerprint: classFingerprint,
          locatorStability: classLocatorStability,
          locatorCandidates: classLocatorCandidates,
          stableSelector: classLocatorCandidates[0] || '',
          containerLocatorCandidates: classContainerCandidates,
          stableContainerSelector: classContainerCandidates[0] || classContainerSelector || '',
          componentGroup: true,
          questionLike: /可選多項|可选多项|可複選|可复选|是否|題|题/.test(context)
        }
      });
    }
    return fields;
  }

  function detectRoleBasedGroups(root, skipNodes) {
    const fields = [];
    const groups = Array.from(root.querySelectorAll('[role="radiogroup"], [role="group"]')).filter(visible);

    for (const group of groups) {
      if (skipNodes.has(group) || isEditorToolbarElement(group)) continue;
      const context = nearestText(group);
      if (/设置默认地区|字體大小|按钮颜色|显示标题/.test(context)) continue;

      const maybeRadio = group.getAttribute('role') === 'radiogroup' || /单选|單選|radio/i.test(context);
      const maybeCheck =
        /多选|多選|多项|多項|可选多项|可選多項|checkbox/i.test(context) ||
        !!group.querySelector('[role="checkbox"], input[type="checkbox"]');
      const kind = maybeRadio ? 'radioGroup' : (maybeCheck ? 'checkboxGroup' : '');
      if (!kind) continue;

      const options = collectOptionsFromGroup(group, kind);
      if (!options.length) continue;

      options.forEach((opt) => {
        const node = document.querySelector(`[${EID_ATTR}="${opt.domId}"]`);
        if (node) skipNodes.add(node);
      });
      const roleGroupHint = `${getLabelText(group)} ${context}`;
      const roleGroupConstraints = buildFieldConstraintsFromElements(
        [group],
        roleGroupHint,
        {
          type: kind,
          required: inferRequiredFromContext(findContainer(group) || group, roleGroupHint),
          enumOptions: options.map((item) => item.label || item.value).filter(Boolean)
        }
      );
      const roleContainer = findContainer(group) || root;
      const roleContainerSelector = buildSelector(roleContainer);
      const roleLocatorCandidates = buildLocatorCandidates(group, roleContainer);
      const roleContainerCandidates = buildContainerLocatorCandidates(roleContainer);
      const roleSelector = roleLocatorCandidates[0] || buildSelector(group);
      const roleFingerprint = buildFieldFingerprint({
        selector: roleSelector,
        containerSelector: roleContainerSelector,
        label: getLabelText(group),
        placeholder: ''
      });
      const roleLocatorStability = computeLocatorStability(roleLocatorCandidates, roleContainerCandidates);

      fields.push({
        id: `${kind}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        domId: ensureDomId(group),
        selector: roleSelector,
        label: getLabelText(group),
        placeholder: '',
        context,
        confidence: 0.82,
        ...buildFieldEvidence({
          score: 0.82,
          reasons: [`角色组选项 ${options.length} 项`],
          source: 'scan:role-group'
        }),
        containerSelector: roleContainerSelector,
        fingerprint: roleFingerprint,
        constraints: roleGroupConstraints,
        options,
        meta: {
          fieldFingerprint: roleFingerprint,
          locatorStability: roleLocatorStability,
          locatorCandidates: roleLocatorCandidates,
          stableSelector: roleLocatorCandidates[0] || '',
          containerLocatorCandidates: roleContainerCandidates,
          stableContainerSelector: roleContainerCandidates[0] || roleContainerSelector || ''
        }
      });
    }

    return fields;
  }

  function detectBasicFields(root, skipNodes) {
    const fields = [];
    const candidates = Array.from(
      root.querySelectorAll(
        'input, textarea, select, button, [role="button"], [role="combobox"], [aria-haspopup], [aria-controls], [aria-owns], [data-select], [data-dropdown], [data-cascader], [data-picker], [contenteditable="true"]'
      )
    );

    for (const el of candidates) {
      let skippedAddressDetailInput = false;
      if (skipNodes.has(el)) {
        const skipLabel = getLabelText(el);
        const skipPlaceholder = normText(el.getAttribute('placeholder'));
        const skipContext = nearestText(el);
        skippedAddressDetailInput = isAddressDetailInput(el, skipLabel, skipPlaceholder, skipContext);
        if (!skippedAddressDetailInput) continue;
      }
      if (el.closest('#formpilot-v2-fab-root')) continue;
      if (el.disabled) continue;
      if (isEditorToolbarElement(el)) continue;

      const tag = (el.tagName || '').toLowerCase();
      const type = String(el.getAttribute('type') || '').toLowerCase();
      const selectTrigger = resolveSelectTrigger(el);
      const isFileInput = tag === 'input' && type === 'file';
      const classText = getAttrText(el, 'class').toLowerCase();
      const readonlyLike =
        el.hasAttribute('readonly') ||
        getAttrText(el, 'aria-readonly').toLowerCase() === 'true' ||
        getAttrText(el, 'readonly') !== '';
      const pickerLike = tag === 'input' && readonlyLike && /datetimepicker|datepicker|timepicker/.test(classText);

      if (!isFileInput && !visible(el)) continue;

      if (type === 'hidden' || type === 'radio' || type === 'checkbox') continue;
      if (tag === 'button' && !selectTrigger.selectLike && el.getAttribute('role') !== 'combobox') continue;
      if (!selectTrigger.selectLike && tag === 'div' && !el.matches('[contenteditable="true"]') && !el.hasAttribute('aria-label') && !el.hasAttribute('placeholder') && !el.hasAttribute('aria-controls') && !el.hasAttribute('aria-haspopup') && !el.hasAttribute('data-select') && !el.hasAttribute('data-dropdown') && !el.hasAttribute('data-cascader') && !el.hasAttribute('data-picker')) {
        continue;
      }

      const label = getLabelText(el);
      const placeholder = normText(el.getAttribute('placeholder'));
      const context = nearestText(el);
      if (/设置默认地区/.test(context)) continue;
      const peers = getTextInputGroup(el);
      const addressDetailInput = skippedAddressDetailInput || isAddressDetailInput(el, label, placeholder, context);
      const segmentCandidate = (tag === 'input') && !addressDetailInput && looksLikeSegmentInput(el, peers);
      if (segmentCandidate) continue;

      let kind = classifyField(el, label, placeholder, context);
      if (selectTrigger.selectLike && !pickerLike) kind = 'select';
      const options = kind === 'select' ? collectSelectOptions(el) : [];
      const reasons = [];
      if (label) pushReason(reasons, '命中标签文本');
      if (placeholder) pushReason(reasons, '命中占位提示');
      if (context) pushReason(reasons, '容器上下文可用');
      if (isFileInput) {
        pushReason(reasons, visible(el) ? '命中文件输入控件' : '命中隐藏文件输入控件');
        const accept = normText(el.getAttribute('accept'));
        if (accept) pushReason(reasons, `文件类型限制：${accept}`);
      }
      if (selectTrigger.selectLike) pushReason(reasons, selectTrigger.reason || '识别为下拉触发器');
      if (options.length) pushReason(reasons, `候选项 ${options.length} 个`);
      if (kind === 'select' && selectTrigger.selectLike && !options.length) pushReason(reasons, '下拉触发器已识别，候选项待展开');
      if (!reasons.length) pushReason(reasons, '基础扫描兜底命中');
      const fieldContainer = findContainer(el) || root;
      const locatorEl = resolveFieldLocatorElement(el, selectTrigger.selectLike);
      const basicConstraintHint = `${label} ${placeholder} ${context}`;
      const basicConstraints = buildFieldConstraintsFromElements(
        [el, locatorEl, fieldContainer],
        basicConstraintHint,
        {
          type: kind,
          required: inferRequiredFromContext(fieldContainer, basicConstraintHint),
          enumOptions: kind === 'select'
            ? options.map((item) => item.label || item.value).filter(Boolean)
            : []
        }
      );
      const basicContainerSelector = buildSelector(fieldContainer);
      const basicLocatorCandidates = buildLocatorCandidates(locatorEl, fieldContainer);
      const basicContainerCandidates = buildContainerLocatorCandidates(fieldContainer);
      const basicSelector = basicLocatorCandidates[0] || buildScopedSelector(locatorEl, fieldContainer);
      const basicFingerprint = buildFieldFingerprint({
        selector: basicSelector,
        containerSelector: basicContainerSelector,
        label,
        placeholder
      });
      const basicLocatorStability = computeLocatorStability(basicLocatorCandidates, basicContainerCandidates);
      fields.push({
        id: `f_${fields.length}_${Math.random().toString(36).slice(2, 8)}`,
        kind,
        domId: ensureDomId(locatorEl),
        selector: basicSelector,
        label,
        placeholder,
        context,
        confidence: inferBaseScore(kind, label, placeholder, context),
        ...buildFieldEvidence({
          score: inferBaseScore(kind, label, placeholder, context),
          reasons,
          source: 'scan:basic'
        }),
        containerSelector: basicContainerSelector,
        fingerprint: basicFingerprint,
        constraints: basicConstraints,
        options,
        meta: {
          fieldFingerprint: basicFingerprint,
          locatorStability: basicLocatorStability,
          locatorCandidates: basicLocatorCandidates,
          stableSelector: basicLocatorCandidates[0] || '',
          containerLocatorCandidates: basicContainerCandidates,
          stableContainerSelector: basicContainerCandidates[0] || basicContainerSelector || '',
          inputDomId: ensureDomId(el),
          locatorDomId: ensureDomId(locatorEl),
          selectLike: selectTrigger.selectLike,
          selectTriggerReason: selectTrigger.reason || '',
          segmentCandidate,
          peerInputCount: peers.length
        }
      });
    }

    return fields;
  }

  function dedupeFields(fields) {
    const out = [];
    const seen = new Set();
    for (const field of fields) {
      const key = `${field.kind}|${field.domId || ''}|${field.selector || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(field);
    }
    return out;
  }

  function detectFields(scopeSelector = '') {
    const scopedRoot = scopeSelector ? document.querySelector(scopeSelector) : null;
    const root = scopedRoot || findActiveTabPanel() || autoDetectRoot();
    if (!root) return { ok: false, error: '未找到可识别区域' };
    const choiceRoot = root.closest('form') || root;

    const skipNodes = new Set();
    const rootSelector = scopedRoot ? scopeSelector : buildSelector(root);

    const customRendererFields = detectCustomFormRendererFields(root, skipNodes);
    const addressFields = detectAddressComposite(root, skipNodes);
    const addressSelectFields = detectAddressSelectComposite(root, skipNodes);
    const segmentedFields = detectSegmentedTextFields(root, skipNodes);
    const radioFields = detectNativeChoiceFields(choiceRoot, skipNodes, 'radioGroup');
    const checkboxFields = detectNativeChoiceFields(choiceRoot, skipNodes, 'checkboxGroup');
    const classChoiceFields = detectClassBasedChoiceGroups(choiceRoot, skipNodes);
    const roleFields = detectRoleBasedGroups(choiceRoot, skipNodes);
    const basicFields = detectBasicFields(root, skipNodes);

    const fields = dedupeFields([
      ...customRendererFields,
      ...addressFields,
      ...addressSelectFields,
      ...segmentedFields,
      ...radioFields,
      ...checkboxFields,
      ...classChoiceFields,
      ...roleFields,
      ...basicFields
    ]);

    return {
      ok: true,
      rootSelector,
      fields,
      summary: {
        total: fields.length,
        customRenderer: customRendererFields.length
      }
    };
  }

  window.FormPilotV2Utils = {
    ...(window.FormPilotV2Utils || {}),
    EID_ATTR,
    normText,
    visible,
    ensureDomId,
    findContainer,
    buildSelector,
    getLabelText,
    autoDetectRoot
  };

  window.FormPilotV2Scan = {
    detectFields,
    autoDetectRoot,
    __build: FORM_PILOT_V2_SCAN_BUILD
  };
})();
