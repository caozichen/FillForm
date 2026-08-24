(function initFormPilotV2LingxiLegacyAdapter() {
  const adapters = window.FormPilotV2Adapters;
  if (!adapters?.register) return;

  const ADAPTER = 'lingxiLegacy';
  const FORM_SELECTOR = 'form#lingxi_form';
  const ROW_SELECTOR = 'li[id^="li_"]';
  const LEGACY_MARKER_SELECTOR = [
    '.js_select_input',
    '.js_select_multi_input',
    'input.datepicker',
    'input.datetimepicker',
    '.uploader-file-container',
    '.handwritten-signature-container',
    '.lisort .sortnum',
    '[id^="get_address"]'
  ].join(', ');

  function norm(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value || ''));
    return String(value || '').replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
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

  function queryOne(root, selector) {
    return queryAll(root, selector)[0] || null;
  }

  function isVisible(node, ctx = {}) {
    if (!(node instanceof Element)) return false;
    if (typeof ctx.visible === 'function') return ctx.visible(node);
    if (node.hidden || node.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function resolveLegacyForm(root) {
    if (root instanceof Element && root.matches(FORM_SELECTOR)) return root;
    const closest = root instanceof Element ? root.closest(FORM_SELECTOR) : null;
    if (closest instanceof HTMLFormElement) return closest;
    return queryOne(root || document, FORM_SELECTOR);
  }

  function isLegacyForm(form) {
    if (!(form instanceof HTMLFormElement)) return false;
    return !!form.querySelector(`${ROW_SELECTOR} .control-group`) && !!form.querySelector(LEGACY_MARKER_SELECTOR);
  }

  function rowIsInScope(row, root, form) {
    if (!(row instanceof Element)) return false;
    if (!(root instanceof Element) || root === form) return true;
    return root === row || root.contains(row) || row.contains(root);
  }

  function cleanLabel(row) {
    const label = queryOne(row, ':scope > .control-group > .control-label, .control-group > .control-label');
    if (!(label instanceof Element)) return '';
    const clone = label.cloneNode(true);
    queryAll(clone, '.pull-right, .errorTip, .number_tip_title, script, style').forEach((node) => node.remove());
    return norm(clone.textContent || '')
      .replace(/^[*＊\s]+|[*＊\s]+$/g, '')
      .replace(/\b(required|optional)\b/gi, '')
      .replace(/(必填|必須|必须|選填|选填)/g, '')
      .replace(/[:：]+$/g, '')
      .trim();
  }

  function rowContext(row) {
    if (!(row instanceof Element)) return '';
    const clone = row.cloneNode(true);
    queryAll(clone, 'script, style, option, .errorTip, .number_tip_title').forEach((node) => node.remove());
    return norm(clone.textContent || '').slice(0, 260);
  }

  function isRequired(row, controls = []) {
    if (!(row instanceof Element)) return false;
    if (/[*＊]|必填|required/i.test(queryOne(row, '.control-label')?.textContent || '')) return true;
    return controls.some((node) => {
      if (!(node instanceof Element)) return false;
      return node.hasAttribute('required') ||
        String(node.getAttribute('aria-required') || '').toLowerCase() === 'true' ||
        String(node.getAttribute('require') || '').toLowerCase() === 'true' ||
        String(node.getAttribute('data-require') || '') === '1';
    });
  }

  function controlName(node) {
    return norm(node?.getAttribute?.('name') || '').replace(/\[\]$/, '');
  }

  function fieldKeyForRow(row, locator) {
    const rowId = norm(row?.id || '').replace(/^li_/, '');
    return rowId || controlName(locator) || norm(locator?.id || '') || `field_${Math.random().toString(36).slice(2, 8)}`;
  }

  function optionLabel(input) {
    if (!(input instanceof HTMLInputElement)) return '';
    const label = input.closest('label') || (input.id ? document.querySelector(`label[for="${cssEscape(input.id)}"]`) : null);
    if (!(label instanceof Element)) return norm(input.value || '');
    const clone = label.cloneNode(true);
    queryAll(clone, 'input, script, style, img, .errorTip').forEach((node) => node.remove());
    let text = norm(clone.textContent || '');
    const pieces = text.split(',').map(norm).filter(Boolean);
    if (pieces.length > 1 && pieces.every((piece) => piece === pieces[0])) text = pieces[0];
    return text || norm(input.value || '');
  }

  function buildOptions(nodes, ctx = {}) {
    return nodes.map((input, index) => {
      const clickable = input.closest('label') || input;
      return {
        index,
        label: optionLabel(input),
        value: norm(input.value || ''),
        domId: ctx.ensureDomId?.(input) || '',
        selector: ctx.buildSelector?.(input) || '',
        clickableDomId: ctx.ensureDomId?.(clickable) || '',
        clickableSelector: ctx.buildSelector?.(clickable) || ''
      };
    });
  }

  function dateCollectType(input, label = '') {
    const explicitMode = norm([
      input?.getAttribute?.('data-collect-mode'),
      input?.getAttribute?.('collect-mode'),
      input?.getAttribute?.('data-collect-type'),
      input?.getAttribute?.('collect-type'),
      input?.getAttribute?.('data-mode'),
      input?.getAttribute?.('name'),
      input?.getAttribute?.('id'),
      input?.getAttribute?.('class')
    ].filter(Boolean).join(' ')).toLowerCase();
    if (/(^|[^a-z0-9])ymd($|[^a-z0-9])|year[_ -]?month[_ -]?day/.test(explicitMode)) return 'ymd';
    if (/(^|[^a-z0-9])md($|[^a-z0-9])|month[_ -]?day/.test(explicitMode)) return 'md';
    if (/(^|[^a-z0-9])ym($|[^a-z0-9])|year[_ -]?month/.test(explicitMode)) return 'ym';

    const formatHint = norm([
      input?.getAttribute?.('placeholder'),
      input?.getAttribute?.('data-format'),
      input?.getAttribute?.('data-date-format'),
      input?.getAttribute?.('date-format'),
      input?.getAttribute?.('format')
    ].filter(Boolean).join(' ')).toLowerCase();
    if (/y{2,4}[-/.]m{1,2}[-/.]d{1,2}/i.test(formatHint)) return 'ymd';
    if (/m{1,2}[-/.]d{1,2}/i.test(formatHint) && !/y{2,4}/i.test(formatHint)) return 'md';
    if (/y{2,4}[-/.]m{1,2}/i.test(formatHint) && !/d{1,2}/i.test(formatHint)) return 'ym';

    const semanticHint = norm(`${label} ${input?.getAttribute?.('placeholder') || ''}`)
      .replace(/日期/g, ' ')
      .toLowerCase();
    if (/年月日|year\s*month\s*day/i.test(semanticHint)) return 'ymd';
    if (/月日|month\s*day/i.test(semanticHint) && !/年|year/i.test(semanticHint)) return 'md';
    if (/年月|year\s*month/i.test(semanticHint) && !/日|day/i.test(semanticHint)) return 'ym';
    return 'ymd';
  }

  function classifySimple(control, label, context) {
    const id = norm(control?.id || '').toLowerCase();
    const name = controlName(control).toLowerCase();
    const type = norm(control?.getAttribute?.('type') || '').toLowerCase();
    const hint = `${label} ${context} ${id} ${name}`;
    if (type === 'number') return 'number';
    if (id === 'email' || name === 'email' || /邮箱|郵箱|电邮|電郵|e-?mail/i.test(hint)) return 'email';
    if (id === 'mobile' || name === 'mobile' || /手机|手機|手机号|手機號|mobile|cellphone/i.test(hint)) return 'phone';
    if (id === 'name' || name === 'name' || /姓名|全名|full\s*name/i.test(hint)) return 'fullName';
    return 'text';
  }

  function specForRow(row, ctx = {}) {
    const label = cleanLabel(row);
    const context = rowContext(row);
    const rankingNodes = queryAll(row, '.lisort .sortnum, span.sortnum');
    if (rankingNodes.length) {
      const fieldName = controlName(queryOne(row, 'input[name$="_sequence"]')).replace(/_sequence$/, '') || norm(rankingNodes[0].getAttribute('data-name'));
      const options = rankingNodes.map((node, index) => ({
        index,
        label: norm(node.getAttribute('data-option_name') || queryOne(node.closest('.lisort'), '.label-div')?.textContent || `Option ${index + 1}`),
        value: norm(node.getAttribute('data-option_id') || ''),
        domId: ctx.ensureDomId?.(node) || '',
        selector: ctx.buildSelector?.(node) || ''
      }));
      return {
        widget: 'ranking',
        kind: 'checkboxGroup',
        locator: rankingNodes[0],
        controls: [...rankingNodes, ...queryAll(row, 'input[type="hidden"]')],
        fieldName,
        options,
        required: isRequired(row, rankingNodes),
        constraints: { minSelections: options.length, maxSelections: options.length, multiple: true, questionLike: true }
      };
    }

    const signature = queryOne(row, '.handwritten-signature-container');
    const signatureValue = queryOne(row, 'input[type="hidden"][id$="_image"]');
    if (signature instanceof Element && signatureValue instanceof HTMLInputElement) {
      return {
        widget: 'signature',
        kind: 'text',
        locator: signature,
        controls: [signature, signatureValue, ...queryAll(row, 'input[type="hidden"][id$="_map_id"]')],
        fieldName: controlName(signatureValue),
        required: isRequired(row, [signatureValue]),
        constraints: { questionLike: true }
      };
    }

    const upload = queryOne(row, '.uploader-file-container');
    const fileInput = queryOne(row, 'input[type="file"]');
    if (upload instanceof Element && fileInput instanceof HTMLInputElement) {
      const valueInput = queryOne(row, 'input.uploader-file-input[type="hidden"]');
      const fieldName = controlName(valueInput) || fieldKeyForRow(row, fileInput);
      const minCount = Number(queryOne(row, `#${cssEscape(fieldName)}_file_min_count`)?.value || 0);
      const maxCount = Number(queryOne(row, `#${cssEscape(fieldName)}_file_max_count`)?.value || 0);
      const sizeMb = Number(queryOne(row, `#${cssEscape(fieldName)}_file_single_size_limit`)?.value || 0);
      return {
        widget: 'upload',
        kind: 'file',
        locator: fileInput,
        controls: queryAll(row, 'input'),
        fieldName,
        required: isRequired(row, [valueInput, queryOne(row, `#${cssEscape(fieldName)}_map_id`)]),
        constraints: {
          accept: norm(fileInput.accept || ''),
          minFiles: minCount || undefined,
          maxFiles: maxCount || 1,
          maxFileSizeBytes: sizeMb > 0 ? sizeMb * 1024 * 1024 : undefined
        }
      };
    }

    const geoInput = queryOne(row, 'input[id^="address_geo"]');
    const geoButton = queryOne(row, 'a[id^="get_address"]');
    if (geoInput instanceof HTMLInputElement && geoButton instanceof Element) {
      return {
        widget: 'addressGeo',
        kind: 'addressDetail',
        locator: geoInput,
        controls: [geoButton, ...queryAll(row, 'input')],
        fieldName: controlName(geoInput),
        required: isRequired(row, [geoInput]),
        constraints: { addressLike: true, geolocation: true }
      };
    }

    const province = queryOne(row, 'select[id^="s1_"][data-type="address"], select[name="address_widget_province"]');
    if (province instanceof HTMLSelectElement) {
      const fieldName = norm(province.id || '').replace(/^s1_/, '') || controlName(queryOne(row, 'input.widget_address')) || 'address';
      const selects = queryAll(row, 'select[data-type="address"], select[name^="address_widget_"]');
      const detail = queryOne(row, 'input.widget_address, textarea.widget_address, input[name="address"]');
      return {
        widget: 'address',
        kind: 'addressComponent',
        locator: province,
        controls: [...selects, ...(detail ? [detail] : [])],
        fieldName,
        required: isRequired(row, [...selects, detail].filter(Boolean)),
        constraints: { addressLike: true, componentCount: selects.length, hasDetail: !!detail },
        meta: {
          comboboxDomIds: selects.map((node) => ctx.ensureDomId?.(node) || '').filter(Boolean),
          comboboxSelectors: selects.map((node) => ctx.buildSelector?.(node) || '').filter(Boolean),
          comboboxRoles: ['province', 'city', 'district'].slice(0, selects.length),
          detailDomId: detail instanceof Element ? (ctx.ensureDomId?.(detail) || '') : '',
          detailSelector: detail instanceof Element ? (ctx.buildSelector?.(detail) || '') : ''
        }
      };
    }

    const choiceInputs = queryAll(row, 'input[type="radio"], input[type="checkbox"].js_select_multi_input')
      .filter((node) => node instanceof HTMLInputElement && !node.disabled);
    if (choiceInputs.length) {
      const checkbox = choiceInputs[0].type === 'checkbox';
      const min = checkbox ? Number(choiceInputs[0].getAttribute('data-min') || 0) : 1;
      const max = checkbox ? Number(choiceInputs[0].getAttribute('data-max') || 0) : 1;
      return {
        widget: checkbox ? 'checkbox' : 'radio',
        kind: checkbox ? 'checkboxGroup' : 'radioGroup',
        locator: choiceInputs[0],
        controls: choiceInputs,
        fieldName: controlName(choiceInputs[0]),
        options: buildOptions(choiceInputs, ctx),
        required: isRequired(row, choiceInputs),
        constraints: {
          minSelections: checkbox ? (min || undefined) : 1,
          maxSelections: checkbox ? (max || undefined) : 1,
          multiple: checkbox || undefined,
          questionLike: true
        }
      };
    }

    const dateInput = queryOne(row, 'input.datepicker');
    if (dateInput instanceof HTMLInputElement) {
      const collectType = dateCollectType(dateInput, label);
      return {
        widget: 'date',
        kind: 'date',
        locator: dateInput,
        controls: [dateInput],
        fieldName: controlName(dateInput),
        required: isRequired(row, [dateInput]),
        constraints: { dateLike: true, inputType: 'date', dateCollectType: collectType }
      };
    }

    const dateTimeInput = queryOne(row, 'input.datetimepicker');
    if (dateTimeInput instanceof HTMLInputElement) {
      return {
        widget: 'datetime',
        kind: 'date',
        locator: dateTimeInput,
        controls: [dateTimeInput],
        fieldName: controlName(dateTimeInput),
        required: isRequired(row, [dateTimeInput]),
        constraints: { dateLike: true, inputType: 'datetime-local', timeOnly: true }
      };
    }

    const simple = queryOne(row, 'textarea, input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]), select');
    if (!(simple instanceof Element)) return null;
    const kind = classifySimple(simple, label, context);
    return {
      widget: simple.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'input',
      kind,
      locator: simple,
      controls: [simple],
      fieldName: controlName(simple),
      required: isRequired(row, [simple]),
      constraints: {
        type: kind,
        inputType: norm(simple.getAttribute('type') || simple.tagName).toLowerCase(),
        numericLike: kind === 'number' || undefined,
        min: norm(simple.getAttribute('min') || '') || undefined,
        max: norm(simple.getAttribute('max') || '') || undefined,
        minLength: Number(simple.getAttribute('minlength') || 0) || undefined,
        maxLength: Number(simple.getAttribute('maxlength') || 0) || undefined
      }
    };
  }

  function markSkipped(spec, row, ctx = {}) {
    if (!(ctx.skipNodes instanceof Set)) return;
    ctx.skipNodes.add(row);
    for (const node of spec.controls || []) {
      if (node instanceof Element) ctx.skipNodes.add(node);
    }
    for (const node of queryAll(row, 'input, textarea, select, button, a, [role], .sortnum, .web-uploader-container')) {
      ctx.skipNodes.add(node);
    }
  }

  function buildField(row, spec, ctx = {}) {
    const locator = spec.locator;
    if (!(locator instanceof Element)) return null;
    const label = cleanLabel(row);
    const context = rowContext(row);
    const placeholder = norm(locator.getAttribute('placeholder') || locator.getAttribute('aria-label') || '');
    const locatorCandidates = ctx.buildLocatorCandidates?.(locator, row) || [];
    const containerCandidates = ctx.buildContainerLocatorCandidates?.(row) || [];
    const selector = locatorCandidates[0] || ctx.buildScopedSelector?.(locator, row) || ctx.buildSelector?.(locator) || '';
    const containerSelector = ctx.buildSelector?.(row) || '';
    const fingerprint = ctx.buildFieldFingerprint?.({ selector, containerSelector, label, placeholder }) ||
      `${ADAPTER}|${row.id || spec.fieldName}|${spec.widget}|${label}`;
    const detectedConstraints = ctx.buildFieldConstraintsFromElements?.(
      spec.controls || [locator],
      `${label} ${placeholder} ${context}`,
      { type: spec.kind, required: spec.required || undefined, ...(spec.constraints || {}) }
    ) || { type: spec.kind, required: spec.required || undefined, ...(spec.constraints || {}) };
    const constraints = {
      ...detectedConstraints,
      ...(spec.constraints || {}),
      type: spec.kind,
      required: spec.required || detectedConstraints.required || undefined
    };
    const reasons = [`LingXi legacy ${spec.widget} matched`];
    if (label) reasons.push('legacy control label found');
    if (spec.options?.length) reasons.push(`${spec.options.length} options found`);
    const evidence = ctx.buildFieldEvidence?.({ score: 0.97, reasons, source: 'scan:adapter:lingxi-legacy' }) || {
      score: 0.97,
      reason: reasons[0],
      reasons,
      source: 'scan:adapter:lingxi-legacy'
    };
    const key = fieldKeyForRow(row, locator).replace(/[^a-zA-Z0-9_-]/g, '_');

    return {
      id: `lxlegacy_${key}_${spec.widget}`,
      kind: spec.kind,
      domId: ctx.ensureDomId?.(locator) || '',
      selector,
      label,
      placeholder,
      context,
      confidence: 0.97,
      ...evidence,
      containerSelector,
      fingerprint,
      constraints,
      options: spec.options || [],
      meta: {
        fieldFingerprint: fingerprint,
        locatorStability: ctx.computeLocatorStability?.(locatorCandidates, containerCandidates) || 0.92,
        locatorCandidates,
        stableSelector: locatorCandidates[0] || selector,
        containerLocatorCandidates: containerCandidates,
        stableContainerSelector: containerCandidates[0] || containerSelector,
        adapterName: ADAPTER,
        componentAdapter: ADAPTER,
        adapterWidget: spec.widget,
        widget: spec.widget,
        legacyLingxi: true,
        rowId: row.id || '',
        fieldName: spec.fieldName || fieldKeyForRow(row, locator),
        componentGroup: ['radio', 'checkbox', 'ranking', 'address', 'addressGeo', 'upload', 'signature'].includes(spec.widget),
        questionLike: true,
        multiple: spec.widget === 'checkbox' || spec.widget === 'ranking' || undefined,
        minSelections: spec.constraints?.minSelections,
        maxSelections: spec.constraints?.maxSelections,
        dateCollectType: spec.constraints?.dateCollectType,
        timeOnly: spec.constraints?.timeOnly || undefined,
        ...(spec.meta || {})
      }
    };
  }

  function detectFields(root, ctx = {}) {
    const form = resolveLegacyForm(root);
    if (!isLegacyForm(form)) return [];
    const fields = [];
    for (const row of queryAll(form, ROW_SELECTOR)) {
      if (!rowIsInScope(row, root, form) || !isVisible(row, ctx)) continue;
      if (ctx.skipNodes instanceof Set && ctx.skipNodes.has(row)) continue;
      const spec = specForRow(row, ctx);
      if (!spec) continue;
      const field = buildField(row, spec, ctx);
      if (!field) continue;
      fields.push(field);
      markSkipped(spec, row, ctx);
    }
    return fields;
  }

  function resolveRow(field, ctx = {}) {
    const root = ctx.root || document;
    const rowId = norm(field?.meta?.rowId || '');
    if (rowId) {
      const selector = `#${cssEscape(rowId)}`;
      const scoped = queryOne(root, selector);
      if (scoped instanceof Element) return scoped;
      if (!ctx.strictScope) {
        const global = queryOne(document, selector);
        if (global instanceof Element) return global;
      }
    }
    const found = ctx.findElement?.(field, root, !!ctx.strictScope);
    return found?.closest?.(ROW_SELECTOR) || ctx.findContainerNode?.(field, root, !!ctx.strictScope) || null;
  }

  function dispatchValueEvents(node) {
    if (!(node instanceof Element)) return;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    node.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function setControlValue(node, value, ctx = {}) {
    if (!(node instanceof HTMLInputElement) && !(node instanceof HTMLTextAreaElement)) return false;
    const text = String(value ?? '');
    if (typeof ctx.setNativeValue === 'function') ctx.setNativeValue(node, text);
    else {
      const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(node, text);
      else node.value = text;
      dispatchValueEvents(node);
    }
    return String(node.value || '') === text || ctx.verifyTextLikeValue?.(node, text) === true;
  }

  function flattenValue(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap(flattenValue);
    if (typeof value === 'object') {
      return flattenValue([value.value, value.label, value.text, value.name, value.values]);
    }
    return String(value).split(/[>、,，;；|]/).map(norm).filter(Boolean);
  }

  function comparable(value) {
    return norm(value).replace(/\s+/g, '').replace(/[()（）【】\[\]{}<>《》"'“”‘’、，,。.:：;；/_-]/g, '').toLowerCase();
  }

  function optionMatches(input, wanted) {
    const haystack = [optionLabel(input), input.value, input.id].map(comparable).filter(Boolean);
    const needle = comparable(wanted);
    return !!needle && haystack.some((item) => item === needle || item.includes(needle) || needle.includes(item));
  }

  function setChecked(input, checked) {
    if (!(input instanceof HTMLInputElement)) return false;
    if (input.checked === checked) return true;
    if (checked) input.click?.();
    else input.click?.();
    if (input.checked !== checked) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
      if (setter) setter.call(input, checked);
      else input.checked = checked;
      dispatchValueEvents(input);
    }
    input.closest('label')?.classList.toggle('active', checked);
    return input.checked === checked;
  }

  async function fillChoice(field, value, ctx = {}, checkbox = false) {
    const row = resolveRow(field, ctx);
    if (!(row instanceof Element)) return ctx.buildFillResult(false, 'LingXi legacy choice row not found');
    if (ctx.settings?.fillRadioCheckbox === false) return ctx.buildFillResult(true, 'Radio/checkbox filling disabled');
    const type = checkbox ? 'checkbox' : 'radio';
    const inputs = queryAll(row, `input[type="${type}"]`).filter((node) => node instanceof HTMLInputElement && !node.disabled);
    if (!inputs.length) return ctx.buildFillResult(false, 'LingXi legacy choice inputs not found', { target: row });
    const wanted = flattenValue(value);
    const min = checkbox ? Math.max(1, Number(field?.meta?.minSelections || field?.constraints?.minSelections || 1)) : 1;
    const configuredMax = checkbox ? Number(field?.meta?.maxSelections || field?.constraints?.maxSelections || inputs.length) : 1;
    const max = Math.max(min, Math.min(inputs.length, configuredMax || inputs.length));
    const ordered = [];
    for (const item of wanted) {
      const match = inputs.find((input) => !ordered.includes(input) && optionMatches(input, item));
      if (match) ordered.push(match);
    }
    for (const input of inputs) {
      if (!ordered.includes(input)) ordered.push(input);
    }
    const targetCount = checkbox ? Math.min(max, Math.max(min, wanted.length || 1)) : 1;
    const targets = ordered.slice(0, targetCount);

    if (!checkbox) {
      setChecked(targets[0], true);
    } else {
      for (const input of inputs) {
        if (input.checked && !targets.includes(input) && inputs.filter((item) => item.checked).length >= targetCount) setChecked(input, false);
      }
      for (const input of targets) setChecked(input, true);
    }
    await ctx.sleep?.(80);
    const selected = inputs.filter((input) => input.checked);
    const ok = checkbox ? selected.length >= min && selected.length <= max : selected.length === 1;
    return ctx.buildFillResult(ok, ok ? `LingXi legacy choice selected ${selected.length}` : 'LingXi legacy choice selection failed', { target: selected[0] || inputs[0] });
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function shiftMonths(date, amount) {
    const base = startOfDay(date);
    const day = base.getDate();
    const next = new Date(base.getFullYear(), base.getMonth() + amount, 1);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    return next;
  }

  function parseDate(value, fallback = new Date()) {
    const text = String(value ?? '');
    const full = text.match(/(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/);
    if (full) {
      const date = new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3] || 1));
      if (!Number.isNaN(date.getTime())) return date;
    }
    const md = text.match(/(?:^|\D)(\d{1,2})[-/.月](\d{1,2})(?:日|\D|$)/);
    if (md) {
      const date = new Date(fallback.getFullYear(), Number(md[1]) - 1, Number(md[2]));
      if (!Number.isNaN(date.getTime())) return date;
    }
    return startOfDay(fallback);
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function normalizeLegacyDate(value, field, datetime = false) {
    const now = new Date();
    const min = shiftMonths(now, -6);
    const max = shiftMonths(now, 6);
    let date = parseDate(value, now);
    if (date.getTime() < min.getTime()) date = min;
    if (date.getTime() > max.getTime()) date = max;
    const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    if (datetime) {
      const match = String(value ?? '').match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/);
      const time = match ? `${pad(match[1])}:${match[2]}:${match[3] || '00'}` : `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      return `${ymd} ${time}`;
    }
    const collectType = norm(field?.meta?.dateCollectType || field?.constraints?.dateCollectType || 'ymd').toLowerCase();
    if (collectType === 'ym') return ymd.slice(0, 7);
    if (collectType === 'md') return ymd.slice(5);
    return ymd;
  }

  async function fillDate(field, value, ctx = {}, datetime = false) {
    const row = resolveRow(field, ctx);
    const input = queryOne(row, datetime ? 'input.datetimepicker' : 'input.datepicker');
    if (!(input instanceof HTMLInputElement)) return ctx.buildFillResult(false, 'LingXi legacy date input not found');
    const normalized = normalizeLegacyDate(value, field, datetime);
    const readonly = input.getAttribute('readonly');
    input.removeAttribute('readonly');
    const ok = setControlValue(input, normalized, ctx);
    if (readonly != null) input.setAttribute('readonly', readonly || 'readonly');
    await ctx.sleep?.(60);
    return ctx.buildFillResult(ok && norm(input.value), ok ? 'LingXi legacy date/time value written' : 'LingXi legacy date/time write failed', { target: input, afterValue: input.value || '' });
  }

  function normalizeAddressValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        province: norm(value.province || value.state || ''),
        city: norm(value.city || ''),
        district: norm(value.district || value.area || value.county || ''),
        detail: norm(value.detail || value.street || value.full || value.address || '')
      };
    }
    const text = norm(Array.isArray(value) ? value.join(' ') : value);
    return { province: '', city: '', district: '', detail: text };
  }

  function normalizeArea(value) {
    return comparable(value).replace(/(特别行政区|自治州|自治区|省|市|区|县|地區|地区)$/g, '');
  }

  function chooseSelectOption(select, wanted = '') {
    if (!(select instanceof HTMLSelectElement)) return null;
    const available = Array.from(select.options).filter((option) => option.value && !option.disabled && !/请选择|請選擇/.test(option.textContent || ''));
    if (!available.length) return null;
    const target = normalizeArea(wanted);
    return available.find((option) => {
      const text = normalizeArea(`${option.value} ${option.textContent || ''}`);
      return target && (text.includes(target) || target.includes(text));
    }) || available[0];
  }

  async function waitForOptions(select, ctx = {}, timeout = 1400) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const options = Array.from(select?.options || []).filter((option) => option.value && !option.disabled);
      if (options.length) return options;
      await ctx.sleep?.(70);
    }
    return [];
  }

  async function applySelect(select, wanted, ctx = {}) {
    if (!(select instanceof HTMLSelectElement)) return false;
    await waitForOptions(select, ctx);
    const option = chooseSelectOption(select, wanted);
    if (!option) return false;
    select.value = option.value;
    dispatchValueEvents(select);
    await ctx.sleep?.(120);
    return !!select.value;
  }

  async function fillAddress(field, value, ctx = {}) {
    const row = resolveRow(field, ctx);
    if (!(row instanceof Element)) return ctx.buildFillResult(false, 'LingXi legacy address row not found');
    const selects = queryAll(row, 'select[data-type="address"], select[name^="address_widget_"]').filter((node) => node instanceof HTMLSelectElement);
    const detail = queryOne(row, 'input.widget_address, textarea.widget_address, input[name="address"]');
    if (!selects.length) return ctx.buildFillResult(false, 'LingXi legacy address selectors not found', { target: row });
    const address = normalizeAddressValue(value);
    const selected = [];
    if (await applySelect(selects[0], address.province || address.detail, ctx)) selected.push(selects[0]);
    if (selects[1]) {
      await waitForOptions(selects[1], ctx, 1800);
      if (await applySelect(selects[1], address.city || address.detail, ctx)) selected.push(selects[1]);
    }
    if (selects[2]) {
      await waitForOptions(selects[2], ctx, 1800);
      if (await applySelect(selects[2], address.district || address.detail, ctx)) selected.push(selects[2]);
    }
    const detailValue = address.detail || '中山路88号1号楼8层801室';
    const detailOk = detail instanceof HTMLInputElement || detail instanceof HTMLTextAreaElement
      ? setControlValue(detail, detailValue, ctx)
      : true;
    const activeSelects = selects.filter((select, index) => index === 0 || isVisible(select, ctx) || Array.from(select.options).some((option) => option.value));
    const ok = activeSelects.every((select) => !!select.value) && detailOk;
    return ctx.buildFillResult(ok, ok ? `LingXi legacy address selected ${selected.length} levels` : 'LingXi legacy address incomplete', { target: detail || selects[0] });
  }

  const GEO_POINTS = [
    [/北京/, 116.4074, 39.9042],
    [/上海/, 121.4737, 31.2304],
    [/广州|廣州|广东|廣東/, 113.2644, 23.1291],
    [/深圳/, 114.0579, 22.5431],
    [/成都|四川/, 104.0665, 30.5723],
    [/杭州|浙江/, 120.1551, 30.2741],
    [/南京|江苏|江蘇/, 118.7969, 32.0603],
    [/香港/, 114.1694, 22.3193]
  ];

  function geoPointFor(value) {
    const text = norm(value);
    const matched = GEO_POINTS.find(([pattern]) => pattern.test(text));
    return matched ? { lng: matched[1], lat: matched[2] } : { lng: 116.4074, lat: 39.9042 };
  }

  async function fillAddressGeo(field, value, ctx = {}) {
    const row = resolveRow(field, ctx);
    if (!(row instanceof Element)) return ctx.buildFillResult(false, 'LingXi legacy geolocation row not found');
    const fieldName = norm(field?.meta?.fieldName || '');
    const input = queryOne(row, `input[name="${cssEscape(fieldName)}"]`) || queryOne(row, 'input[id^="address_geo"]');
    const lngInput = queryOne(row, `input[name="${cssEscape(fieldName)}_lng"]`) || queryOne(row, 'input[name$="_lng"]');
    const latInput = queryOne(row, `input[name="${cssEscape(fieldName)}_lat"]`) || queryOne(row, 'input[name$="_lat"]');
    if (!(input instanceof HTMLInputElement) || !(lngInput instanceof HTMLInputElement) || !(latInput instanceof HTMLInputElement)) {
      return ctx.buildFillResult(false, 'LingXi legacy geolocation inputs not found', { target: row });
    }
    const address = norm(value) || '北京市东城区东长安街1号';
    const point = geoPointFor(address);
    setControlValue(input, address, ctx);
    setControlValue(lngInput, String(point.lng), ctx);
    setControlValue(latInput, String(point.lat), ctx);
    const suffix = fieldName;
    const container = queryOne(row, `#address_geo_container${cssEscape(suffix)}`);
    if (container instanceof HTMLElement) container.hidden = false;
    const button = queryOne(row, `#get_address${cssEscape(suffix)}`) || queryOne(row, 'a[id^="get_address"]');
    if (button instanceof HTMLElement) button.style.display = 'none';
    const lngText = queryOne(row, `#lng${cssEscape(suffix)}`);
    const latText = queryOne(row, `#lat${cssEscape(suffix)}`);
    if (lngText) lngText.textContent = String(point.lng);
    if (latText) latText.textContent = String(point.lat);
    await ctx.sleep?.(60);
    const ok = norm(input.value) && Number.isFinite(Number(lngInput.value)) && Number.isFinite(Number(latInput.value));
    return ctx.buildFillResult(!!ok, ok ? 'LingXi legacy geolocation values written' : 'LingXi legacy geolocation write failed', { target: input, afterValue: input.value || '' });
  }

  async function getStoredFile(field, ctx = {}) {
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) return null;
      const response = await chrome.runtime.sendMessage({ type: 'formpilotv2:get-file-store' });
      const limit = Number(field?.constraints?.maxFileSizeBytes || 0);
      const files = Array.isArray(response?.files) ? response.files : [];
      const usable = files.filter((item) => item?.base64 && (!limit || Number(item.size || 0) <= limit));
      if (!usable.length) return null;
      const item = usable[Math.floor(Math.random() * usable.length)] || usable[0];
      const blob = await fetch(item.base64).then((responseItem) => responseItem.blob());
      return new File([blob], item.name || 'formpilot-test-file', { type: item.mimeType || blob.type || 'application/octet-stream' });
    } catch {
      return null;
    }
  }

  async function fillUpload(field, ctx = {}) {
    const row = resolveRow(field, ctx);
    const input = queryOne(row, 'input[type="file"]');
    if (!(row instanceof Element) || !(input instanceof HTMLInputElement)) {
      return ctx.buildFillResult(false, 'LingXi legacy WebUploader input not found', { target: row });
    }
    let file = await getStoredFile(field, ctx);
    if (!(file instanceof File)) {
      const content = `FillForm legacy LingXi upload test\n${new Date().toISOString()}\n`;
      file = new File([content], `fillform-test-${Date.now()}.txt`, { type: 'text/plain' });
    }

    // The legacy uploader requests its short-lived Qiniu token from this click handler.
    const uploadContainer = queryOne(row, '.uploader-file-container');
    if (uploadContainer instanceof HTMLElement) {
      uploadContainer.click();
      await ctx.sleep?.(250);
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const fieldName = norm(field?.meta?.fieldName || '');
    const started = Date.now();
    while (Date.now() - started < 18000) {
      const uploaded = queryAll(row, `input[name="${cssEscape(fieldName)}[]"]`).filter((node) => norm(node.value || ''));
      const valueInput = queryOne(row, `#${cssEscape(fieldName)}.uploader-file-input`);
      const fileItems = queryAll(row, '.uploader-list .file-item').filter((node) => !/error|failed/i.test(String(node.className || '')));
      if (uploaded.length || norm(valueInput?.value || '') || fileItems.some((node) => /success|complete/i.test(String(node.className || '')))) {
        return ctx.buildFillResult(true, `LingXi legacy file uploaded: ${file.name}`, { target: input });
      }
      await ctx.sleep?.(180);
    }
    const uploadState = norm(queryOne(row, '.uploader-list')?.innerText || '') ||
      queryAll(row, '.uploader-list [class]').map((node) => norm(node.className || '')).filter(Boolean).join(', ');
    const detail = uploadState ? ` (${uploadState.slice(0, 180)})` : '';
    return ctx.buildFillResult(false, `LingXi legacy file upload did not complete: ${file.name}${detail}`, { target: input });
  }

  function orderRankingNodes(nodes, value) {
    const wanted = flattenValue(value);
    const ordered = [];
    for (const item of wanted) {
      const match = nodes.find((node) => {
        if (ordered.includes(node)) return false;
        return [node.getAttribute('data-option_name'), node.getAttribute('data-option_id'), node.id].some((candidate) => {
          const source = comparable(candidate);
          const target = comparable(item);
          return target && (source === target || source.includes(target) || target.includes(source));
        });
      });
      if (match) ordered.push(match);
    }
    for (const node of nodes) if (!ordered.includes(node)) ordered.push(node);
    return ordered;
  }

  async function fillRanking(field, value, ctx = {}) {
    const row = resolveRow(field, ctx);
    if (!(row instanceof Element)) return ctx.buildFillResult(false, 'LingXi legacy ranking row not found');
    const nodes = queryAll(row, '.lisort .sortnum, span.sortnum').filter((node) => node instanceof HTMLElement);
    if (!nodes.length) return ctx.buildFillResult(false, 'LingXi legacy ranking options not found', { target: row });
    for (const node of nodes.filter((item) => item.classList.contains('sortnum-sel'))) {
      node.click?.();
      await ctx.sleep?.(20);
    }
    const ordered = orderRankingNodes(nodes, value);
    for (const node of ordered) {
      node.click?.();
      await ctx.sleep?.(30);
    }
    const fieldName = norm(field?.meta?.fieldName || nodes[0].getAttribute('data-name') || '');
    const sequence = queryOne(row, `input[name="${cssEscape(fieldName)}_sequence"]`);
    const display = queryOne(row, `input[name="${cssEscape(fieldName)}_sequence_display"]`);
    const complete = nodes.every((node) => node.classList.contains('sortnum-sel'));
    if (!complete || !norm(sequence?.value || '')) {
      ordered.forEach((node, index) => {
        node.classList.add('sortnum-sel');
        node.textContent = String(index + 1);
      });
      if (sequence instanceof HTMLInputElement) setControlValue(sequence, ordered.map((node) => node.getAttribute('data-option_id')).filter(Boolean).join('>'), ctx);
      if (display instanceof HTMLInputElement) setControlValue(display, ordered.map((node) => node.getAttribute('data-option_name')).filter(Boolean).join('>'), ctx);
    }
    const ok = nodes.every((node) => node.classList.contains('sortnum-sel')) && !!norm(sequence?.value || '');
    return ctx.buildFillResult(ok, ok ? `LingXi legacy ranking completed ${nodes.length} options` : 'LingXi legacy ranking fill failed', { target: ordered[0] || nodes[0] });
  }

  function signatureSeed(value, settings = {}) {
    const names = settings?.testDataLibrary?.pools?.chineseName;
    if (Array.isArray(names) && names.length) return norm(names[0]);
    return norm(Array.isArray(value) ? value[0] : value) || 'FillForm';
  }

  function drawSignature(canvas, seed = '') {
    if (!canvas || canvas.nodeType !== 1 || String(canvas.tagName || '').toLowerCase() !== 'canvas') return false;
    const context = canvas.getContext('2d');
    if (!context || !canvas.width || !canvas.height) return false;
    let hash = 7;
    for (const char of String(seed || 'FillForm')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const jitter = (index, range) => (((hash >>> (index % 24)) & 15) / 15 - 0.5) * range;
    context.save();
    context.strokeStyle = '#111111';
    context.lineWidth = Math.max(3, canvas.width / 230);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const paths = [
      [[0.12, 0.58], [0.20, 0.28], [0.25, 0.65], [0.34, 0.32], [0.41, 0.61], [0.50, 0.27], [0.60, 0.56], [0.72, 0.35]],
      [[0.17, 0.70], [0.30, 0.66], [0.44, 0.72], [0.58, 0.64], [0.76, 0.69]],
      [[0.45, 0.48], [0.55, 0.42], [0.65, 0.50], [0.78, 0.45]]
    ];
    paths.forEach((points, pathIndex) => {
      context.beginPath();
      points.forEach(([x, y], index) => {
        const px = (x + jitter(index + pathIndex * 3, 0.025)) * canvas.width;
        const py = (y + jitter(index + pathIndex * 5, 0.035)) * canvas.height;
        if (index === 0) context.moveTo(px, py);
        else context.quadraticCurveTo(px - canvas.width * 0.025, py + jitter(index + 9, canvas.height * 0.015), px, py);
      });
      context.stroke();
    });
    context.restore();
    return true;
  }

  async function fillSignature(field, value, ctx = {}) {
    const row = resolveRow(field, ctx);
    if (!(row instanceof Element)) return ctx.buildFillResult(false, 'LingXi legacy signature row not found');
    const hidden = queryOne(row, 'input[type="hidden"][id$="_image"]');
    if (hidden instanceof HTMLInputElement && norm(hidden.value)) {
      return ctx.buildFillResult(true, 'LingXi legacy signature already present', { target: hidden });
    }
    const trigger = queryOne(row, '.handwritten-signature-container');
    if (!(trigger instanceof HTMLElement)) return ctx.buildFillResult(false, 'LingXi legacy signature trigger not found', { target: row });
    trigger.click?.();

    let frame = null;
    const frameStarted = Date.now();
    while (Date.now() - frameStarted < 5000) {
      frame = queryOne(document, 'iframe#draw-iframe');
      try {
        if (frame instanceof HTMLIFrameElement && frame.contentDocument?.querySelector('#canvasBox')) break;
      } catch {
        frame = null;
      }
      await ctx.sleep?.(100);
    }
    if (!(frame instanceof HTMLIFrameElement)) return ctx.buildFillResult(false, 'LingXi legacy signature iframe did not open', { target: trigger });

    let frameDocument = null;
    try {
      frameDocument = frame.contentDocument;
    } catch {
      return ctx.buildFillResult(false, 'LingXi legacy signature iframe is not same-origin', { target: trigger });
    }
    const canvas = frameDocument?.querySelector('#canvasBox');
    if (!canvas || canvas.nodeType !== 1 || String(canvas.tagName || '').toLowerCase() !== 'canvas' || !drawSignature(canvas, signatureSeed(value, ctx.settings))) {
      return ctx.buildFillResult(false, 'LingXi legacy signature canvas unavailable', { target: trigger });
    }
    try {
      canvas.dispatchEvent(new frame.contentWindow.Event('click', { bubbles: true }));
    } catch {
      canvas.dispatchEvent(new Event('click', { bubbles: true }));
    }
    await ctx.sleep?.(150);
    const finishButton = Array.from(frameDocument.querySelectorAll('button')).find((button) => /完\s*成|finish|done/i.test(norm(button.textContent || '')));
    if (!finishButton || finishButton.nodeType !== 1 || String(finishButton.tagName || '').toLowerCase() !== 'button') {
      return ctx.buildFillResult(false, 'LingXi legacy signature finish button not found', { target: trigger });
    }
    const buttonStarted = Date.now();
    while (finishButton.disabled && Date.now() - buttonStarted < 1600) await ctx.sleep?.(80);
    finishButton.click();

    const uploadStarted = Date.now();
    while (Date.now() - uploadStarted < 18000) {
      if (hidden instanceof HTMLInputElement && norm(hidden.value)) {
        return ctx.buildFillResult(true, 'LingXi legacy signature uploaded', { target: hidden, afterValue: hidden.value });
      }
      await ctx.sleep?.(180);
    }
    return ctx.buildFillResult(false, 'LingXi legacy signature upload did not complete', { target: trigger });
  }

  async function fillSimple(field, value, ctx = {}, widget = 'input') {
    const row = resolveRow(field, ctx);
    const selector = widget === 'textarea'
      ? 'textarea'
      : 'input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"])';
    const input = queryOne(row, selector);
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) {
      return ctx.buildFillResult(false, 'LingXi legacy text input not found', { target: row });
    }
    if (value == null || String(value).trim() === '') return ctx.buildFillResult(false, 'LingXi legacy value is empty', { target: input });
    const ok = setControlValue(input, String(value), ctx);
    return ctx.buildFillResult(ok, ok ? 'LingXi legacy text value written' : 'LingXi legacy text write failed', { target: input, afterValue: input.value || '' });
  }

  async function fillField(field, value, ctx = {}) {
    if (field?.meta?.adapterName !== ADAPTER && field?.meta?.componentAdapter !== ADAPTER) return null;
    const widget = norm(field?.meta?.adapterWidget || field?.meta?.widget || '').toLowerCase();
    if (widget === 'radio') return fillChoice(field, value, ctx, false);
    if (widget === 'checkbox') return fillChoice(field, value, ctx, true);
    if (widget === 'date') return fillDate(field, value, ctx, false);
    if (widget === 'datetime') return fillDate(field, value, ctx, true);
    if (widget === 'address') return fillAddress(field, value, ctx);
    if (widget === 'addressgeo') return fillAddressGeo(field, value, ctx);
    if (widget === 'upload') return fillUpload(field, ctx);
    if (widget === 'signature') return fillSignature(field, value, ctx);
    if (widget === 'ranking') return fillRanking(field, value, ctx);
    if (widget === 'textarea') return fillSimple(field, value, ctx, 'textarea');
    if (widget === 'input') return fillSimple(field, value, ctx, 'input');
    return null;
  }

  function visibleErrorText(row) {
    if (!(row instanceof Element)) return '';
    const error = queryAll(row, '.errorTip, .text-error, .help-error, [class*="error"]')
      .find((node) => isVisible(node) && norm(node.textContent || '') && !/最多上传|最少上传/.test(norm(node.textContent || '')));
    return norm(error?.textContent || '');
  }

  function optionalEmptyAllowed(field, ctx = {}) {
    return ctx.settings?.fillOptionalFields === false && !field?.constraints?.required;
  }

  function verifyField(field, ctx = {}) {
    if (field?.meta?.adapterName !== ADAPTER && field?.meta?.componentAdapter !== ADAPTER) return null;
    const row = resolveRow(field, ctx);
    if (!(row instanceof Element)) return { id: field.id, kind: field.kind, ok: false, reason: 'LingXi legacy row not found' };
    const error = visibleErrorText(row);
    if (error) return { id: field.id, kind: field.kind, ok: false, reason: error };
    const widget = norm(field?.meta?.adapterWidget || field?.meta?.widget || '').toLowerCase();
    let ok = false;
    let reason = '';

    if (widget === 'radio' || widget === 'checkbox') {
      const inputs = queryAll(row, widget === 'radio' ? 'input[type="radio"]' : 'input[type="checkbox"]');
      const count = inputs.filter((input) => input.checked).length;
      const min = widget === 'radio' ? 1 : Math.max(1, Number(field?.meta?.minSelections || field?.constraints?.minSelections || 1));
      const max = widget === 'radio' ? 1 : Math.max(min, Number(field?.meta?.maxSelections || field?.constraints?.maxSelections || inputs.length));
      ok = count >= min && count <= max;
      reason = ok ? `LingXi legacy choice completed (${count})` : `LingXi legacy choice incomplete (${count}/${min})`;
    } else if (widget === 'address') {
      const selects = queryAll(row, 'select[data-type="address"], select[name^="address_widget_"]').filter((node) => node instanceof HTMLSelectElement);
      const detail = queryOne(row, 'input.widget_address, textarea.widget_address, input[name="address"]');
      const active = selects.filter((select, index) => index === 0 || isVisible(select) || Array.from(select.options).some((option) => option.value));
      ok = active.length > 0 && active.every((select) => !!norm(select.value)) && (!(detail instanceof Element) || !!norm(detail.value || ''));
      reason = ok ? 'LingXi legacy address completed' : 'LingXi legacy address incomplete';
    } else if (widget === 'addressgeo') {
      const fieldName = norm(field?.meta?.fieldName || '');
      const input = queryOne(row, `input[name="${cssEscape(fieldName)}"]`) || queryOne(row, 'input[id^="address_geo"]');
      const lng = queryOne(row, `input[name="${cssEscape(fieldName)}_lng"]`) || queryOne(row, 'input[name$="_lng"]');
      const lat = queryOne(row, `input[name="${cssEscape(fieldName)}_lat"]`) || queryOne(row, 'input[name$="_lat"]');
      ok = !!norm(input?.value || '') && Number.isFinite(Number(lng?.value)) && Number.isFinite(Number(lat?.value)) && !!norm(lng?.value || '') && !!norm(lat?.value || '');
      reason = ok ? 'LingXi legacy geolocation completed' : 'LingXi legacy geolocation incomplete';
    } else if (widget === 'upload') {
      const fieldName = norm(field?.meta?.fieldName || '');
      const uploaded = queryAll(row, `input[name="${cssEscape(fieldName)}[]"]`).filter((node) => norm(node.value || ''));
      const valueInput = queryOne(row, `#${cssEscape(fieldName)}.uploader-file-input`);
      ok = uploaded.length > 0 || !!norm(valueInput?.value || '');
      reason = ok ? 'LingXi legacy file uploaded' : 'LingXi legacy file not uploaded';
    } else if (widget === 'signature') {
      const hidden = queryOne(row, 'input[type="hidden"][id$="_image"]');
      ok = !!norm(hidden?.value || '');
      reason = ok ? 'LingXi legacy signature completed' : 'LingXi legacy signature missing';
    } else if (widget === 'ranking') {
      const nodes = queryAll(row, '.lisort .sortnum, span.sortnum');
      const fieldName = norm(field?.meta?.fieldName || nodes[0]?.getAttribute?.('data-name') || '');
      const sequence = queryOne(row, `input[name="${cssEscape(fieldName)}_sequence"]`);
      const sequenceCount = norm(sequence?.value || '').split('>').filter(Boolean).length;
      ok = nodes.length > 0 && nodes.every((node) => node.classList.contains('sortnum-sel')) && sequenceCount === nodes.length;
      reason = ok ? 'LingXi legacy ranking completed' : `LingXi legacy ranking incomplete (${sequenceCount}/${nodes.length})`;
    } else {
      const input = queryOne(row, widget === 'textarea' ? 'textarea' : 'input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"])');
      ok = !!norm(input?.value || '');
      reason = ok ? 'LingXi legacy field completed' : 'LingXi legacy field empty';
    }

    if (!ok && optionalEmptyAllowed(field, ctx)) return { id: field.id, kind: field.kind, ok: true, reason: 'Optional LingXi legacy field skipped' };
    return { id: field.id, kind: field.kind, ok, reason };
  }

  adapters.register(ADAPTER, {
    selectors: {
      fieldControls: [
        `${FORM_SELECTOR} .js_select_input`,
        `${FORM_SELECTOR} .js_select_multi_input`,
        `${FORM_SELECTOR} input.datepicker`,
        `${FORM_SELECTOR} input.datetimepicker`,
        `${FORM_SELECTOR} .uploader-file-container`,
        `${FORM_SELECTOR} .handwritten-signature-container`,
        `${FORM_SELECTOR} .lisort .sortnum`,
        `${FORM_SELECTOR} [id^="get_address"]`
      ],
      fieldContainers: [`${FORM_SELECTOR} ${ROW_SELECTOR}`],
      segmentedGroups: [`${FORM_SELECTOR} ${ROW_SELECTOR}`],
      fieldLabels: [`${FORM_SELECTOR} .control-label`],
      choiceGroupContainers: [`${FORM_SELECTOR} ${ROW_SELECTOR} .controls`],
      choiceClickables: [`${FORM_SELECTOR} label.radio`, `${FORM_SELECTOR} label.checkbox`]
    },
    detectFields,
    fillField,
    verifyField
  });
})();
