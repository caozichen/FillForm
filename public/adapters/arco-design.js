(function initFormPilotV2ArcoDesignAdapter() {
  const adapters = window.FormPilotV2Adapters;
  if (!adapters?.register) return;

  const FRAMEWORK = 'arcoDesign';
  const FORM_ITEM_SELECTOR = '.arco-form-item, .arco-form-item-wrapper-col, .form-item, .form-field, [role="group"]';
  const LABEL_SELECTOR = '.arco-form-item-label, label, .field-label, .form-label';

  const COMPONENT_SPECS = [
    {
      widget: 'transfer',
      kind: 'checkboxGroup',
      selector: '.arco-transfer',
      confidence: 0.92,
      componentGroup: true,
      questionLike: true
    },
    {
      widget: 'upload',
      kind: 'file',
      selector: '.arco-upload, .arco-upload-drag',
      rootSelector: '.arco-upload',
      locatorSelector: 'input[type="file"]',
      confidence: 0.88
    },
    {
      widget: 'rangePicker',
      kind: 'date',
      selector: '.arco-picker-range',
      confidence: 0.9,
      range: true,
      dateLike: true
    },
    {
      widget: 'datePicker',
      kind: 'date',
      selector: '.arco-picker, .arco-time-picker',
      locatorSelector: 'input:not([type="hidden"]), textarea',
      confidence: 0.88,
      dateLike: true,
      reject(node) {
        return matches(node, '.arco-picker-range');
      }
    },
    {
      widget: 'inputNumber',
      kind: 'number',
      selector: '.arco-input-number',
      locatorSelector: 'input:not([type="hidden"])',
      confidence: 0.88,
      numericLike: true
    },
    {
      widget: 'verificationCode',
      kind: 'verification',
      selector: '.arco-verification-code',
      locatorSelector: 'input:not([type="hidden"])',
      confidence: 0.88,
      numericLike: true
    },
    {
      widget: 'switch',
      kind: 'checkboxGroup',
      selector: '.arco-switch',
      confidence: 0.9,
      componentGroup: true,
      questionLike: true
    },
    {
      widget: 'slider',
      kind: 'number',
      selector: '.arco-slider',
      confidence: 0.86,
      numericLike: true
    },
    {
      widget: 'rate',
      kind: 'number',
      selector: '.arco-rate',
      confidence: 0.86,
      numericLike: true
    },
    {
      widget: 'colorPicker',
      kind: 'text',
      selector: '.arco-color-picker',
      confidence: 0.82
    },
    {
      widget: 'treeSelect',
      kind: 'select',
      selector: '.arco-tree-select',
      confidence: 0.86,
      selectLike: true
    },
    {
      widget: 'cascader',
      kind: 'select',
      selector: '.arco-cascader',
      confidence: 0.86,
      selectLike: true
    },
    {
      widget: 'autoComplete',
      kind: 'text',
      selector: '.arco-auto-complete',
      locatorSelector: 'input:not([type="hidden"])',
      confidence: 0.78
    },
    {
      widget: 'mention',
      kind: 'text',
      selector: '.arco-mention',
      locatorSelector: 'input:not([type="hidden"]), textarea',
      confidence: 0.78
    }
  ];

  function norm(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function matches(node, selector) {
    if (!(node instanceof Element) || !selector) return false;
    try {
      return node.matches(selector);
    } catch {
      return false;
    }
  }

  function queryAll(root, selector) {
    if (!root || !selector) return [];
    try {
      const result = [];
      if (root instanceof Element && matches(root, selector)) result.push(root);
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
    if (ctx.visible) return ctx.visible(node);
    if (node.hidden || node.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isSkipped(node, ctx = {}) {
    if (!(node instanceof Element)) return true;
    if (node.closest('#formpilot-v2-fab-root')) return true;
    if (ctx.isEditorToolbarElement?.(node)) return true;
    const skipNodes = ctx.skipNodes;
    if (!(skipNodes instanceof Set)) return false;
    let current = node;
    while (current && current instanceof Element) {
      if (skipNodes.has(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function markSkipped(node, ctx = {}) {
    const skipNodes = ctx.skipNodes;
    if (!(skipNodes instanceof Set) || !(node instanceof Element)) return;
    skipNodes.add(node);
    for (const child of queryAll(node, 'input, textarea, select, button, [role], [aria-checked], [aria-haspopup], [aria-controls], [aria-owns]')) {
      skipNodes.add(child);
    }
  }

  function resolveComponentRoot(node, spec) {
    if (!(node instanceof Element)) return null;
    if (spec.rootSelector) {
      const root = node.closest(spec.rootSelector);
      if (root instanceof Element) return root;
    }
    return node;
  }

  function resolveLocator(component, spec) {
    if (!(component instanceof Element)) return null;
    if (spec.range || spec.widget === 'switch' || spec.widget === 'slider' || spec.widget === 'rate' || spec.widget === 'colorPicker' || spec.widget === 'transfer') {
      return component;
    }
    if (spec.locatorSelector) {
      const explicit = queryOne(component, spec.locatorSelector);
      if (explicit instanceof Element) return explicit;
    }
    if (spec.selectLike) {
      const trigger = queryOne(component, '.arco-select-view, [role="combobox"], [aria-haspopup="listbox"], [aria-controls], [aria-owns], input:not([type="hidden"])');
      if (trigger instanceof Element) return component;
    }
    return component;
  }

  function findContainer(component, locator, ctx = {}) {
    const direct = component?.closest?.(FORM_ITEM_SELECTOR);
    if (direct instanceof Element) return direct;
    return ctx.findContainer?.(locator) || ctx.findContainer?.(component) || component || locator;
  }

  function extractPlaceholder(component, locator) {
    const candidates = [
      locator?.getAttribute?.('placeholder'),
      locator?.getAttribute?.('aria-placeholder'),
      locator?.getAttribute?.('title'),
      locator?.getAttribute?.('aria-label'),
      component?.getAttribute?.('placeholder'),
      component?.getAttribute?.('title'),
      queryOne(component, 'input[placeholder], textarea[placeholder]')?.getAttribute?.('placeholder')
    ];
    return candidates.map(norm).find(Boolean) || '';
  }

  function extractLabel(component, locator, container, ctx = {}) {
    const direct = ctx.getLabelText?.(locator) || ctx.getLabelText?.(component);
    if (direct) return direct;
    const labelNode = queryOne(container, LABEL_SELECTOR);
    const label = norm(labelNode?.textContent || '');
    if (label) return label.replace(/^[* ]+|[* ]+$/g, '').trim();
    return '';
  }

  function collectTextOptions(nodes, ctx = {}) {
    const out = [];
    const seen = new Set();
    for (const node of nodes || []) {
      if (!(node instanceof Element) || !isVisible(node, ctx)) continue;
      const text = norm(
        node.getAttribute('aria-label') ||
        node.getAttribute('title') ||
        node.getAttribute('data-label') ||
        node.getAttribute('data-value') ||
        node.textContent ||
        ''
      );
      if (!text || /loading|暂无数据|無資料/i.test(text) || seen.has(text)) continue;
      seen.add(text);
      out.push({
        index: out.length,
        label: text,
        value: norm(node.getAttribute('value') || node.getAttribute('data-value') || text),
        domId: ctx.ensureDomId?.(node) || '',
        selector: ctx.buildSelector?.(node) || ''
      });
      if (out.length >= 12) break;
    }
    return out;
  }

  function collectOptions(component, spec, locator, ctx = {}) {
    if (spec.widget === 'switch') {
      return [
        { index: 0, label: 'on', value: 'true', domId: ctx.ensureDomId?.(component) || '', selector: ctx.buildSelector?.(component) || '' },
        { index: 1, label: 'off', value: 'false', domId: ctx.ensureDomId?.(component) || '', selector: ctx.buildSelector?.(component) || '' }
      ];
    }
    if (spec.widget === 'transfer') {
      return collectTextOptions(queryAll(component, '.arco-transfer-view-item, .arco-transfer-list-item, .arco-checkbox'), ctx);
    }
    if (spec.selectLike && ctx.collectSelectOptions) {
      return ctx.collectSelectOptions(locator).slice(0, 12);
    }
    return [];
  }

  function buildField(component, spec, ctx = {}) {
    const locator = resolveLocator(component, spec);
    if (!(locator instanceof Element)) return null;
    const container = findContainer(component, locator, ctx);
    const label = extractLabel(component, locator, container, ctx);
    const placeholder = extractPlaceholder(component, locator);
    const context = norm(container?.innerText || component.innerText || '').slice(0, 260);
    const hint = `${label} ${placeholder} ${context}`;
    const locatorEl = spec.selectLike && ctx.resolveFieldLocatorElement
      ? ctx.resolveFieldLocatorElement(locator, true)
      : locator;
    const locatorCandidates = ctx.buildLocatorCandidates?.(locatorEl, container) || [];
    const containerCandidates = ctx.buildContainerLocatorCandidates?.(container) || [];
    const selector = locatorCandidates[0] || ctx.buildScopedSelector?.(locatorEl, container) || ctx.buildSelector?.(locatorEl) || '';
    const containerSelector = ctx.buildSelector?.(container) || '';
    const fingerprint = ctx.buildFieldFingerprint?.({
      selector,
      containerSelector,
      label,
      placeholder
    }) || `${spec.widget}|${selector}|${label}|${placeholder}`;
    const options = collectOptions(component, spec, locator, ctx);
    const constraints = ctx.buildFieldConstraintsFromElements?.(
      [locatorEl, component, container],
      hint,
      {
        type: spec.kind,
        required: ctx.inferRequiredFromContext?.(container, hint),
        enumOptions: options.map((item) => item.label || item.value).filter(Boolean),
        numericLike: spec.numericLike || undefined,
        dateLike: spec.dateLike || undefined,
        inputType: spec.dateLike ? 'date' : undefined,
        multiple: spec.widget === 'transfer' || undefined,
        questionLike: spec.questionLike || undefined
      }
    ) || {};
    const reasons = [`Arco Design ${spec.widget} adapter matched`];
    if (label) reasons.push('label detected');
    if (options.length) reasons.push(`options: ${options.length}`);
    const score = spec.confidence || 0.82;
    const evidence = ctx.buildFieldEvidence?.({
      score,
      reasons,
      source: 'scan:adapter:arco-design'
    }) || {
      score,
      reason: reasons[0],
      reasons,
      source: 'scan:adapter:arco-design'
    };

    return {
      id: `arco_${spec.widget}_${Math.random().toString(36).slice(2, 8)}`,
      kind: spec.kind,
      domId: ctx.ensureDomId?.(locatorEl) || '',
      selector,
      label,
      placeholder,
      context,
      confidence: score,
      ...evidence,
      containerSelector,
      fingerprint,
      constraints,
      options,
      meta: {
        fieldFingerprint: fingerprint,
        locatorStability: ctx.computeLocatorStability?.(locatorCandidates, containerCandidates) || 0.5,
        locatorCandidates,
        stableSelector: locatorCandidates[0] || '',
        containerLocatorCandidates: containerCandidates,
        stableContainerSelector: containerCandidates[0] || containerSelector || '',
        adapterName: FRAMEWORK,
        componentAdapter: FRAMEWORK,
        adapterWidget: spec.widget,
        widget: spec.widget,
        componentGroup: spec.componentGroup || !['inputNumber', 'verificationCode'].includes(spec.widget),
        questionLike: spec.questionLike || undefined,
        selectLike: spec.selectLike || false,
        multiple: spec.widget === 'transfer' || undefined,
        range: spec.range || undefined,
        fillStrategy: fillStrategyForWidget(spec.widget),
        componentSelector: spec.selector
      }
    };
  }

  function fillStrategyForWidget(widget) {
    if (widget === 'switch') return 'click-state';
    if (widget === 'slider') return 'range-or-pointer';
    if (widget === 'rate') return 'click-rate-item';
    if (widget === 'colorPicker') return 'panel-input-or-static';
    if (widget === 'transfer') return 'select-and-move';
    if (widget === 'rangePicker') return 'write-two-inputs';
    if (widget === 'datePicker') return 'write-input-or-panel';
    if (widget === 'verificationCode') return 'write-segment-inputs';
    return 'native-fallback';
  }

  function detectFields(root, ctx = {}) {
    if (!(root instanceof Element) && root !== document) return [];
    const fields = [];
    const seen = new Set();
    for (const spec of COMPONENT_SPECS) {
      for (const hit of queryAll(root, spec.selector)) {
        const component = resolveComponentRoot(hit, spec);
        if (!(component instanceof Element) || seen.has(component)) continue;
        if (spec.reject?.(component)) continue;
        if (isSkipped(component, ctx)) continue;
        if (!isVisible(component, ctx) && spec.widget !== 'upload') continue;
        const field = buildField(component, spec, ctx);
        if (!field) continue;
        fields.push(field);
        seen.add(component);
        markSkipped(component, ctx);
      }
    }
    return fields;
  }

  function resolveRuntimeComponent(field, ctx = {}, fallbackSelector = '') {
    const root = ctx.root || document;
    const strictScope = !!ctx.strictScope;
    const selector = fallbackSelector || field?.meta?.componentSelector || '';
    const found = ctx.findElement?.(field, root, strictScope);
    const container = ctx.findContainerNode?.(field, root, strictScope);
    for (const base of [found, container, root, document]) {
      if (!(base instanceof Element) && base !== document) continue;
      if (selector) {
        if (base instanceof Element) {
          if (matches(base, selector)) return base;
          const closest = base.closest?.(selector);
          if (closest instanceof Element) return closest;
        }
        const nested = queryOne(base, selector);
        if (nested instanceof Element) return nested;
      } else if (base instanceof Element) {
        return base;
      }
    }
    return found instanceof Element ? found : null;
  }

  function dispatchBasicEvents(node) {
    if (!(node instanceof Element)) return;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
    node.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function clickNode(node, ctx = {}) {
    if (!(node instanceof Element)) return false;
    try {
      node.scrollIntoView?.({ block: 'center', inline: 'center' });
    } catch {
      // ignore
    }
    if (ctx.fireOptionClick) ctx.fireOptionClick(node);
    else node.click?.();
    return true;
  }

  function boolFromValue(value, fallback = true) {
    if (typeof value === 'boolean') return value;
    const text = norm(Array.isArray(value) ? value[0] : value).toLowerCase();
    if (!text) return fallback;
    if (/^(false|0|no|off|unchecked|close|closed|disable|disabled)$/i.test(text) || /否|不|关|關|禁用/.test(text)) return false;
    return true;
  }

  function isSwitchChecked(node) {
    if (!(node instanceof Element)) return false;
    const input = queryOne(node, 'input[type="checkbox"]');
    if (input instanceof HTMLInputElement && input.checked) return true;
    if (String(node.getAttribute('aria-checked') || '').toLowerCase() === 'true') return true;
    if (node.classList.contains('arco-switch-checked')) return true;
    return !!queryOne(node, '.arco-switch-checked, input[type="checkbox"]:checked');
  }

  async function fillSwitch(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.arco-switch');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Arco switch not found');
    const desired = boolFromValue(value, true);
    if (isSwitchChecked(node) !== desired) {
      clickNode(node, ctx);
      await ctx.sleep?.(120);
    }
    if (isSwitchChecked(node) !== desired) {
      const input = queryOne(node, 'input[type="checkbox"]');
      if (input instanceof HTMLInputElement) {
        input.checked = desired;
        dispatchBasicEvents(input);
      }
      node.setAttribute('aria-checked', desired ? 'true' : 'false');
      node.setAttribute('data-formpilot-v2-switch-filled', desired ? 'true' : 'false');
      dispatchBasicEvents(node);
    }
    return ctx.buildFillResult(isSwitchChecked(node) === desired || node.hasAttribute('data-formpilot-v2-switch-filled'), 'Arco switch filled', { target: node });
  }

  function numericTarget(value, field = {}, fallback = 1) {
    const raw = Array.isArray(value) ? value[0] : value;
    const match = String(raw ?? '').match(/-?\d+(\.\d+)?/);
    let n = match ? Number(match[0]) : fallback;
    const min = Number(field?.constraints?.minNumber ?? field?.constraints?.min ?? 0);
    const max = Number(field?.constraints?.maxNumber ?? field?.constraints?.max ?? (fallback > 5 ? 100 : 5));
    if (Number.isFinite(min)) n = Math.max(min, n);
    if (Number.isFinite(max)) n = Math.min(max, n);
    return Number.isFinite(n) ? n : fallback;
  }

  function setInputValue(input, value, ctx = {}) {
    if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false;
    const previousReadonly = input.getAttribute('readonly');
    try {
      input.removeAttribute('readonly');
    } catch {
      // ignore
    }
    if (ctx.setNativeValue) ctx.setNativeValue(input, String(value));
    else {
      input.value = String(value);
      dispatchBasicEvents(input);
    }
    if (previousReadonly != null) {
      try {
        input.setAttribute('readonly', previousReadonly || 'readonly');
      } catch {
        // ignore
      }
    }
    return String(input.value || '') === String(value) || ctx.verifyTextLikeValue?.(input, String(value));
  }

  function dispatchPointerClick(node, ratio) {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = rect.left + rect.width * Math.max(0, Math.min(1, ratio));
    const y = rect.top + rect.height / 2;
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      try {
        const event = type.startsWith('pointer') && typeof PointerEvent === 'function'
          ? new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse' })
          : new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
        node.dispatchEvent(event);
      } catch {
        // ignore
      }
    }
    return true;
  }

  async function fillSlider(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.arco-slider');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Arco slider not found');
    const min = Number(field?.constraints?.minNumber ?? field?.constraints?.min ?? node.getAttribute('aria-valuemin') ?? 0);
    const max = Number(field?.constraints?.maxNumber ?? field?.constraints?.max ?? node.getAttribute('aria-valuemax') ?? 100);
    const target = numericTarget(value, field, Number.isFinite(max) ? max : 100);
    const ratio = Number.isFinite(max - min) && max !== min ? (target - min) / (max - min) : 0.5;
    const range = queryOne(node, 'input[type="range"]');
    if (range instanceof HTMLInputElement && setInputValue(range, target, ctx)) {
      return ctx.buildFillResult(true, 'Arco slider range input filled', { target: range });
    }
    const rail = queryOne(node, '.arco-slider-road, .arco-slider-track, .arco-slider-bar') || node;
    dispatchPointerClick(rail, ratio);
    await ctx.sleep?.(120);
    const handle = queryOne(node, '[role="slider"], .arco-slider-btn');
    if (handle instanceof Element) {
      handle.setAttribute('aria-valuenow', String(target));
      dispatchBasicEvents(handle);
    }
    node.setAttribute('data-formpilot-v2-slider-filled', String(target));
    dispatchBasicEvents(node);
    return ctx.buildFillResult(true, 'Arco slider filled by pointer fallback', { target: node, value: target });
  }

  async function fillRate(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.arco-rate');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Arco rate not found');
    const items = queryAll(node, '.arco-rate-character, .arco-rate-item').filter((item) => isVisible(item, ctx));
    if (!items.length) return ctx.buildFillResult(false, 'Arco rate has no items', { target: node });
    const target = Math.max(1, Math.min(items.length, Math.round(numericTarget(value, field, items.length))));
    const item = items[target - 1] || items[items.length - 1];
    clickNode(item, ctx);
    await ctx.sleep?.(120);
    node.setAttribute('data-formpilot-v2-rate-filled', String(target));
    dispatchBasicEvents(node);
    return ctx.buildFillResult(true, 'Arco rate filled', { target: item, value: target });
  }

  function normalizeColor(value) {
    const text = norm(Array.isArray(value) ? value[0] : value);
    const hex = text.match(/#?[0-9a-f]{6}\b/i);
    if (hex) return hex[0].startsWith('#') ? hex[0] : `#${hex[0]}`;
    const rgb = text.match(/rgba?\([^)]+\)/i);
    if (rgb) return rgb[0];
    return '#165DFF';
  }

  async function fillColorPicker(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.arco-color-picker');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Arco color picker not found');
    const color = normalizeColor(value);
    const embeddedInput = queryOne(node, 'input:not([type="hidden"])');
    if (embeddedInput instanceof HTMLInputElement && setInputValue(embeddedInput, color, ctx)) {
      return ctx.buildFillResult(true, 'Arco color input filled', { target: embeddedInput });
    }
    clickNode(node, ctx);
    await ctx.sleep?.(160);
    const panel = queryAll(document, '.arco-color-picker-panel, .arco-trigger-popup').filter((item) => isVisible(item, ctx)).pop();
    const panelInput = panel ? queryOne(panel, 'input:not([type="hidden"])') : null;
    if (panelInput instanceof HTMLInputElement) {
      setInputValue(panelInput, color, ctx);
      const confirm = queryAll(panel, 'button, .arco-btn').find((btn) => isVisible(btn, ctx) && /ok|confirm|确定|確定/i.test(norm(btn.textContent || btn.getAttribute('aria-label') || '')));
      if (confirm) clickNode(confirm, ctx);
      await ctx.sleep?.(80);
    }
    node.setAttribute('data-formpilot-v2-color-filled', color);
    dispatchBasicEvents(node);
    return ctx.buildFillResult(true, 'Arco color picker filled by input/static fallback', { target: node, value: color });
  }

  function dateText(value, offsetDays = 0) {
    let raw = value;
    if (Array.isArray(value)) raw = value[offsetDays] || value[0];
    else if (value && typeof value === 'object') raw = offsetDays > 0 ? (value.end || value.value || value.start) : (value.start || value.value || value.end);
    const match = String(raw ?? '').match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
    const base = match ? new Date(match[0].replace(/[/.]/g, '-')) : new Date();
    if (!Number.isNaN(base.getTime()) && !Array.isArray(value) && !(value && typeof value === 'object' && offsetDays > 0 && value.end)) {
      base.setDate(base.getDate() + offsetDays);
    }
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const d = String(base.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function timeText(value) {
    const match = String(Array.isArray(value) ? value[0] : value ?? '').match(/\d{1,2}:\d{2}(:\d{2})?/);
    return match ? match[0] : '12:00:00';
  }

  async function fillPicker(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.arco-picker, .arco-time-picker, .arco-picker-range');
    if (!(node instanceof Element)) return null;
    const inputs = queryAll(node, 'input:not([type="hidden"]), textarea').filter((item) => item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement);
    if (!inputs.length) return null;
    const hint = `${field?.label || ''} ${field?.placeholder || ''} ${field?.context || ''} ${node.className || ''}`;
    const timeOnly = /time|时间|時間/i.test(hint) && !/date|日期|生日|birth/i.test(hint);
    const values = inputs.length >= 2
      ? [timeOnly ? timeText(value) : dateText(value, 0), timeOnly ? timeText(value) : dateText(value, 1)]
      : [timeOnly ? timeText(value) : dateText(value, 0)];
    let applied = 0;
    for (let i = 0; i < inputs.length; i += 1) {
      if (setInputValue(inputs[i], values[Math.min(i, values.length - 1)], ctx)) applied += 1;
    }
    await ctx.sleep?.(80);
    return ctx.buildFillResult(applied > 0, `Arco picker filled ${applied} input(s)`, { target: inputs[0] || node });
  }

  async function fillNumberInput(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.arco-input-number');
    if (!(node instanceof Element)) return null;
    const input = queryOne(node, 'input:not([type="hidden"])');
    if (!(input instanceof HTMLInputElement)) return null;
    const target = numericTarget(value, field, 1);
    const ok = setInputValue(input, target, ctx);
    return ctx.buildFillResult(ok, ok ? 'Arco input-number filled' : 'Arco input-number did not update', { target: input });
  }

  async function fillVerificationCode(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.arco-verification-code');
    if (!(node instanceof Element)) return null;
    const inputs = queryAll(node, 'input:not([type="hidden"])').filter((input) => input instanceof HTMLInputElement && !input.disabled);
    if (!inputs.length) return null;
    const digits = norm(value || '').replace(/\D/g, '') || String(Math.floor(100000 + Math.random() * 900000));
    let applied = 0;
    for (let i = 0; i < inputs.length; i += 1) {
      if (setInputValue(inputs[i], digits[i] || String((i + 1) % 10), ctx)) applied += 1;
    }
    node.setAttribute('data-formpilot-v2-verification-filled', digits.slice(0, inputs.length));
    dispatchBasicEvents(node);
    return ctx.buildFillResult(applied > 0, `Arco verification code filled ${applied} input(s)`, { target: inputs[0] || node });
  }

  function optionMatchesValue(node, value) {
    const wanted = norm(Array.isArray(value) ? value.join(' ') : value).toLowerCase();
    if (!wanted) return false;
    const text = norm(node?.textContent || node?.getAttribute?.('aria-label') || node?.getAttribute?.('title') || '').toLowerCase();
    return text && (text === wanted || text.includes(wanted) || wanted.includes(text));
  }

  async function fillTransfer(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.arco-transfer');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Arco transfer not found');
    const panels = queryAll(node, '.arco-transfer-view, .arco-transfer-list').filter((item) => isVisible(item, ctx));
    const sourcePanel = panels[0] || node;
    const items = queryAll(sourcePanel, '.arco-transfer-view-item, .arco-transfer-list-item, .arco-checkbox').filter((item) => isVisible(item, ctx) && !/disabled|arco-checkbox-disabled/.test(String(item.className || '')));
    if (!items.length) return ctx.buildFillResult(false, 'Arco transfer has no source item', { target: node });
    const picked = items.find((item) => optionMatchesValue(item, value)) || items[0];
    clickNode(picked, ctx);
    await ctx.sleep?.(120);
    const buttons = queryAll(node, '.arco-transfer-operations button, .arco-btn, button').filter((btn) => isVisible(btn, ctx) && !btn.disabled && String(btn.getAttribute('aria-disabled') || '').toLowerCase() !== 'true');
    const moveButton = buttons.find((btn) => /right|next|to-right|>|→|›|移入|添加/i.test(norm(`${btn.textContent || ''} ${btn.getAttribute('class') || ''} ${btn.getAttribute('aria-label') || ''}`))) || buttons[0] || null;
    if (!(moveButton instanceof Element)) {
      return ctx.buildFillResult(false, 'Arco transfer move button not available', { target: picked });
    }
    clickNode(moveButton, ctx);
    await ctx.sleep?.(160);
    node.setAttribute('data-formpilot-v2-transfer-filled', norm(picked.textContent || 'selected'));
    dispatchBasicEvents(node);
    return ctx.buildFillResult(true, 'Arco transfer item moved', { target: node });
  }

  async function fillField(field, value, ctx = {}) {
    if (field?.meta?.adapterName !== FRAMEWORK && field?.meta?.componentAdapter !== FRAMEWORK) return null;
    const widget = norm(field?.meta?.adapterWidget || field?.meta?.widget || '').toLowerCase();
    if (widget === 'switch') return fillSwitch(field, value, ctx);
    if (widget === 'slider') return fillSlider(field, value, ctx);
    if (widget === 'rate') return fillRate(field, value, ctx);
    if (widget === 'colorpicker') return fillColorPicker(field, value, ctx);
    if (widget === 'rangepicker' || widget === 'datepicker') return fillPicker(field, value, ctx);
    if (widget === 'inputnumber') return fillNumberInput(field, value, ctx);
    if (widget === 'verificationcode') return fillVerificationCode(field, value, ctx);
    if (widget === 'transfer') return fillTransfer(field, value, ctx);
    return null;
  }

  function verifyField(field, ctx = {}) {
    if (field?.meta?.adapterName !== FRAMEWORK && field?.meta?.componentAdapter !== FRAMEWORK) return null;
    const widget = norm(field?.meta?.adapterWidget || field?.meta?.widget || '').toLowerCase();
    if (widget === 'switch') {
      const node = resolveRuntimeComponent(field, ctx, '.arco-switch');
      const ok = node instanceof Element && (isSwitchChecked(node) || node.hasAttribute('data-formpilot-v2-switch-filled'));
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Arco switch filled' : 'Arco switch not filled' };
    }
    if (widget === 'slider') {
      const node = resolveRuntimeComponent(field, ctx, '.arco-slider');
      const ok = node instanceof Element && !!(node.getAttribute('data-formpilot-v2-slider-filled') || queryOne(node, 'input[type="range"]')?.value || queryOne(node, '[aria-valuenow]')?.getAttribute('aria-valuenow'));
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Arco slider filled' : 'Arco slider not filled' };
    }
    if (widget === 'rate') {
      const node = resolveRuntimeComponent(field, ctx, '.arco-rate');
      const ok = node instanceof Element && !!(node.getAttribute('data-formpilot-v2-rate-filled') || queryOne(node, '.arco-rate-character-full, .arco-rate-character-half, [aria-checked="true"]'));
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Arco rate filled' : 'Arco rate not filled' };
    }
    if (widget === 'colorpicker') {
      const node = resolveRuntimeComponent(field, ctx, '.arco-color-picker');
      const ok = node instanceof Element && !!node.getAttribute('data-formpilot-v2-color-filled');
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Arco color filled' : 'Arco color not filled' };
    }
    if (widget === 'transfer') {
      const node = resolveRuntimeComponent(field, ctx, '.arco-transfer');
      const ok = node instanceof Element && !!node.getAttribute('data-formpilot-v2-transfer-filled');
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Arco transfer filled' : 'Arco transfer not filled' };
    }
    if (widget === 'verificationcode') {
      const node = resolveRuntimeComponent(field, ctx, '.arco-verification-code');
      const ok = node instanceof Element && !!node.getAttribute('data-formpilot-v2-verification-filled');
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Arco verification code filled' : 'Arco verification code not filled' };
    }
    if (widget === 'rangepicker' || widget === 'datepicker' || widget === 'inputnumber') {
      const node = resolveRuntimeComponent(field, ctx, widget === 'inputnumber' ? '.arco-input-number' : '.arco-picker, .arco-time-picker, .arco-picker-range');
      const inputs = queryAll(node, 'input:not([type="hidden"]), textarea').filter((item) => item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement);
      const ok = inputs.some((input) => norm(input.value || ''));
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Arco input filled' : 'Arco input empty' };
    }
    return null;
  }

  adapters.register(FRAMEWORK, {
    selectors: {
      fieldControls: [
        '.arco-select',
        '.arco-select-view',
        '.arco-tree-select',
        '.arco-cascader',
        '.arco-picker',
        '.arco-picker-range',
        '.arco-time-picker',
        '.arco-input-number',
        '.arco-verification-code',
        '.arco-switch',
        '.arco-slider',
        '.arco-rate',
        '.arco-color-picker',
        '.arco-transfer',
        '.arco-upload',
        '.arco-auto-complete',
        '.arco-mention',
        '.arco-radio-group',
        '.arco-checkbox-group'
      ],
      fieldContainers: [
        '.arco-form-item',
        '.arco-form-item-wrapper-col'
      ],
      segmentedGroups: [
        '.arco-form-item',
        '.arco-form-item-wrapper-col'
      ],
      fieldLabels: [
        '.arco-form-item-label'
      ],
      selectPanels: [
        '.arco-select-dropdown',
        '.arco-cascader-popup',
        '.arco-tree-select-popup',
        '.arco-trigger-popup',
        '.arco-auto-complete-popup'
      ],
      selectOptions: [
        '.arco-select-option',
        '.arco-cascader-option',
        '.arco-tree-node-title',
        '.arco-tree-node',
        '.arco-auto-complete-option'
      ],
      selectOptionClickables: [
        '.arco-select-option',
        '.arco-cascader-option',
        '.arco-tree-node-title',
        '.arco-tree-node',
        '.arco-auto-complete-option'
      ],
      selectTriggerContainers: [
        '.arco-select-view',
        '.arco-select',
        '.arco-tree-select',
        '.arco-cascader'
      ],
      choiceGroups: [
        '.arco-radio-group',
        '.arco-checkbox-group'
      ],
      choiceGroupContainers: [
        '.arco-form-item',
        '.arco-radio-group',
        '.arco-checkbox-group'
      ],
      choiceOptions: [
        '.arco-radio',
        '.arco-checkbox'
      ],
      choiceClickables: [
        '.arco-radio',
        '.arco-checkbox'
      ],
      cascaderColumns: [
        '.arco-cascader-panel-column',
        '.arco-cascader-list'
      ],
      dateCells: [
        '.arco-picker-cell:not(.arco-picker-cell-disabled) .arco-picker-date',
        '.arco-picker-cell:not(.arco-picker-cell-disabled)'
      ],
      displayValues: [
        '.arco-select-view-value',
        '.arco-select-view-input',
        '.arco-picker-input input',
        '.arco-color-picker-preview'
      ],
      errorMessages: [
        '.arco-form-item-message'
      ],
      requiredMarkers: [
        '.arco-form-item-label-required-symbol'
      ]
    },
    detectFields,
    fillField,
    verifyField
  });
})();
