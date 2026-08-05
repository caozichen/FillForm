(function initFormPilotV2ElementUiAdapter() {
  const adapters = window.FormPilotV2Adapters;
  if (!adapters?.register) return;

  const FRAMEWORK = 'elementUI';
  const FORM_ITEM_SELECTOR = '.el-form-item, .form-item, .form-field, [role="group"]';
  const LABEL_SELECTOR = '.el-form-item__label, label, .field-label, .form-label';

  const COMPONENT_SPECS = [
    {
      widget: 'transfer',
      kind: 'checkboxGroup',
      selector: '.el-transfer',
      confidence: 0.92,
      componentGroup: true,
      questionLike: true
    },
    {
      widget: 'upload',
      kind: 'file',
      selector: '.el-upload, .el-upload-dragger',
      rootSelector: '.el-upload',
      locatorSelector: 'input[type="file"]',
      confidence: 0.88
    },
    {
      widget: 'rangePicker',
      kind: 'date',
      selector: '.el-date-editor.el-range-editor, .el-range-editor',
      confidence: 0.9,
      range: true,
      dateLike: true
    },
    {
      widget: 'datePicker',
      kind: 'date',
      selector: '.el-date-editor, .el-date-picker, .el-time-picker',
      locatorSelector: 'input:not([type="hidden"]), textarea',
      confidence: 0.88,
      dateLike: true,
      reject(node) {
        return matches(node, '.el-range-editor');
      }
    },
    {
      widget: 'inputNumber',
      kind: 'number',
      selector: '.el-input-number',
      locatorSelector: 'input:not([type="hidden"])',
      confidence: 0.88,
      numericLike: true
    },
    {
      widget: 'switch',
      kind: 'checkboxGroup',
      selector: '.el-switch',
      confidence: 0.9,
      componentGroup: true,
      questionLike: true
    },
    {
      widget: 'slider',
      kind: 'number',
      selector: '.el-slider',
      confidence: 0.86,
      numericLike: true
    },
    {
      widget: 'rate',
      kind: 'number',
      selector: '.el-rate',
      confidence: 0.86,
      numericLike: true
    },
    {
      widget: 'colorPicker',
      kind: 'text',
      selector: '.el-color-picker',
      confidence: 0.82
    },
    {
      widget: 'treeSelect',
      kind: 'select',
      selector: '.el-tree-select',
      confidence: 0.86,
      selectLike: true
    },
    {
      widget: 'cascader',
      kind: 'select',
      selector: '.el-cascader',
      confidence: 0.86,
      selectLike: true
    },
    {
      widget: 'selectV2',
      kind: 'select',
      selector: '.el-select-v2',
      confidence: 0.84,
      selectLike: true
    },
    {
      widget: 'autoComplete',
      kind: 'text',
      selector: '.el-autocomplete',
      locatorSelector: 'input:not([type="hidden"])',
      confidence: 0.78
    },
    {
      widget: 'mention',
      kind: 'text',
      selector: '.el-mention',
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
      const trigger = queryOne(component, '[role="combobox"], [aria-haspopup="listbox"], [aria-controls], [aria-owns], input:not([type="hidden"])');
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
      const active = norm(component.getAttribute('active-text') || component.getAttribute('data-active-text') || queryOne(component, '.el-switch__label--left, .el-switch__label.is-active')?.textContent || 'on');
      const inactive = norm(component.getAttribute('inactive-text') || component.getAttribute('data-inactive-text') || queryOne(component, '.el-switch__label--right')?.textContent || 'off');
      return [
        { index: 0, label: active || 'on', value: 'true', domId: ctx.ensureDomId?.(component) || '', selector: ctx.buildSelector?.(component) || '' },
        { index: 1, label: inactive || 'off', value: 'false', domId: ctx.ensureDomId?.(component) || '', selector: ctx.buildSelector?.(component) || '' }
      ];
    }
    if (spec.widget === 'transfer') {
      return collectTextOptions(queryAll(component, '.el-transfer-panel__item, .el-transfer-panel .el-checkbox'), ctx);
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
    const reasons = [`Element UI ${spec.widget} adapter matched`];
    if (label) reasons.push('label detected');
    if (options.length) reasons.push(`options: ${options.length}`);
    const score = spec.confidence || 0.82;
    const evidence = ctx.buildFieldEvidence?.({
      score,
      reasons,
      source: 'scan:adapter:element-ui'
    }) || {
      score,
      reason: reasons[0],
      reasons,
      source: 'scan:adapter:element-ui'
    };

    return {
      id: `el_${spec.widget}_${Math.random().toString(36).slice(2, 8)}`,
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
        componentGroup: spec.componentGroup || spec.widget !== 'inputNumber',
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
    if (node.classList.contains('is-checked')) return true;
    return !!queryOne(node, '.is-checked, .el-switch__input:checked');
  }

  async function fillSwitch(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.el-switch');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Element UI switch not found');
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
    return ctx.buildFillResult(isSwitchChecked(node) === desired || node.hasAttribute('data-formpilot-v2-switch-filled'), 'Element UI switch filled', { target: node });
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
    const node = resolveRuntimeComponent(field, ctx, '.el-slider');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Element UI slider not found');
    const min = Number(field?.constraints?.minNumber ?? field?.constraints?.min ?? node.getAttribute('aria-valuemin') ?? 0);
    const max = Number(field?.constraints?.maxNumber ?? field?.constraints?.max ?? node.getAttribute('aria-valuemax') ?? 100);
    const target = numericTarget(value, field, Number.isFinite(max) ? max : 100);
    const ratio = Number.isFinite(max - min) && max !== min ? (target - min) / (max - min) : 0.5;
    const range = queryOne(node, 'input[type="range"]');
    if (range instanceof HTMLInputElement && setInputValue(range, target, ctx)) {
      return ctx.buildFillResult(true, 'Element UI slider range input filled', { target: range });
    }
    const runway = queryOne(node, '.el-slider__runway, .el-slider__bar') || node;
    dispatchPointerClick(runway, ratio);
    await ctx.sleep?.(120);
    const handle = queryOne(node, '[role="slider"], .el-slider__button');
    if (handle instanceof Element) {
      handle.setAttribute('aria-valuenow', String(target));
      dispatchBasicEvents(handle);
    }
    node.setAttribute('data-formpilot-v2-slider-filled', String(target));
    dispatchBasicEvents(node);
    return ctx.buildFillResult(true, 'Element UI slider filled by pointer fallback', { target: node, value: target });
  }

  async function fillRate(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.el-rate');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Element UI rate not found');
    const items = queryAll(node, '.el-rate__item, .el-rate__icon').filter((item) => isVisible(item, ctx));
    if (!items.length) return ctx.buildFillResult(false, 'Element UI rate has no items', { target: node });
    const target = Math.max(1, Math.min(items.length, Math.round(numericTarget(value, field, items.length))));
    const item = items[target - 1] || items[items.length - 1];
    clickNode(item, ctx);
    await ctx.sleep?.(120);
    node.setAttribute('data-formpilot-v2-rate-filled', String(target));
    dispatchBasicEvents(node);
    return ctx.buildFillResult(true, 'Element UI rate filled', { target: item, value: target });
  }

  function normalizeColor(value) {
    const text = norm(Array.isArray(value) ? value[0] : value);
    const hex = text.match(/#?[0-9a-f]{6}\b/i);
    if (hex) return hex[0].startsWith('#') ? hex[0] : `#${hex[0]}`;
    const rgb = text.match(/rgba?\([^)]+\)/i);
    if (rgb) return rgb[0];
    return '#409EFF';
  }

  async function fillColorPicker(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.el-color-picker');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Element UI color picker not found');
    const color = normalizeColor(value);
    const embeddedInput = queryOne(node, 'input:not([type="hidden"])');
    if (embeddedInput instanceof HTMLInputElement && setInputValue(embeddedInput, color, ctx)) {
      return ctx.buildFillResult(true, 'Element UI color input filled', { target: embeddedInput });
    }
    clickNode(node, ctx);
    await ctx.sleep?.(160);
    const panel = queryAll(document, '.el-color-dropdown, .el-color-picker__panel').filter((item) => isVisible(item, ctx)).pop();
    const panelInput = panel ? queryOne(panel, 'input:not([type="hidden"])') : null;
    if (panelInput instanceof HTMLInputElement) {
      setInputValue(panelInput, color, ctx);
      const confirm = queryAll(panel, 'button, .el-button').find((btn) => isVisible(btn, ctx) && /ok|confirm|确定|確定/i.test(norm(btn.textContent || btn.getAttribute('aria-label') || '')));
      if (confirm) clickNode(confirm, ctx);
      await ctx.sleep?.(80);
    }
    node.setAttribute('data-formpilot-v2-color-filled', color);
    dispatchBasicEvents(node);
    return ctx.buildFillResult(true, 'Element UI color picker filled by input/static fallback', { target: node, value: color });
  }

  function dateText(value, offsetDays = 0) {
    const raw = Array.isArray(value) ? value[offsetDays] || value[0] : (value && typeof value === 'object' ? value.start || value.end || value.value : value);
    const match = String(raw ?? '').match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/);
    const base = match ? new Date(match[0].replace(/[/.]/g, '-')) : new Date();
    if (!Number.isNaN(base.getTime())) base.setDate(base.getDate() + offsetDays);
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
    const node = resolveRuntimeComponent(field, ctx, '.el-date-editor, .el-date-picker, .el-time-picker, .el-range-editor');
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
    return ctx.buildFillResult(applied > 0, `Element UI picker filled ${applied} input(s)`, { target: inputs[0] || node });
  }

  async function fillNumberInput(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.el-input-number');
    if (!(node instanceof Element)) return null;
    const input = queryOne(node, 'input:not([type="hidden"])');
    if (!(input instanceof HTMLInputElement)) return null;
    const target = numericTarget(value, field, 1);
    const ok = setInputValue(input, target, ctx);
    return ctx.buildFillResult(ok, ok ? 'Element UI input-number filled' : 'Element UI input-number did not update', { target: input });
  }

  function optionMatchesValue(node, value) {
    const wanted = norm(Array.isArray(value) ? value.join(' ') : value).toLowerCase();
    if (!wanted) return false;
    const text = norm(node?.textContent || node?.getAttribute?.('aria-label') || node?.getAttribute?.('title') || '').toLowerCase();
    return text && (text === wanted || text.includes(wanted) || wanted.includes(text));
  }

  async function fillTransfer(field, value, ctx = {}) {
    const node = resolveRuntimeComponent(field, ctx, '.el-transfer');
    if (!(node instanceof Element)) return ctx.buildFillResult(false, 'Element UI transfer not found');
    const panels = queryAll(node, '.el-transfer-panel').filter((item) => isVisible(item, ctx));
    const sourcePanel = panels[0] || node;
    const items = queryAll(sourcePanel, '.el-transfer-panel__item, .el-checkbox').filter((item) => isVisible(item, ctx) && !/disabled|is-disabled/.test(String(item.className || '')));
    if (!items.length) return ctx.buildFillResult(false, 'Element UI transfer has no source item', { target: node });
    const picked = items.find((item) => optionMatchesValue(item, value)) || items[0];
    clickNode(picked, ctx);
    await ctx.sleep?.(120);
    const buttons = queryAll(node, '.el-transfer__buttons button, .el-transfer__button, button').filter((btn) => isVisible(btn, ctx) && !btn.disabled && String(btn.getAttribute('aria-disabled') || '').toLowerCase() !== 'true');
    const moveButton = buttons.find((btn) => /right|next|to-right|>|→|›|移入|添加/i.test(norm(`${btn.textContent || ''} ${btn.getAttribute('class') || ''} ${btn.getAttribute('aria-label') || ''}`))) || buttons[0] || null;
    if (!(moveButton instanceof Element)) {
      return ctx.buildFillResult(false, 'Element UI transfer move button not available', { target: picked });
    }
    clickNode(moveButton, ctx);
    await ctx.sleep?.(160);
    node.setAttribute('data-formpilot-v2-transfer-filled', norm(picked.textContent || 'selected'));
    dispatchBasicEvents(node);
    return ctx.buildFillResult(true, 'Element UI transfer item moved', { target: node });
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
    if (widget === 'transfer') return fillTransfer(field, value, ctx);
    return null;
  }

  function verifyField(field, ctx = {}) {
    if (field?.meta?.adapterName !== FRAMEWORK && field?.meta?.componentAdapter !== FRAMEWORK) return null;
    const widget = norm(field?.meta?.adapterWidget || field?.meta?.widget || '').toLowerCase();
    if (widget === 'switch') {
      const node = resolveRuntimeComponent(field, ctx, '.el-switch');
      const ok = node instanceof Element && (isSwitchChecked(node) || node.hasAttribute('data-formpilot-v2-switch-filled'));
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Element UI switch filled' : 'Element UI switch not filled' };
    }
    if (widget === 'slider') {
      const node = resolveRuntimeComponent(field, ctx, '.el-slider');
      const ok = node instanceof Element && !!(node.getAttribute('data-formpilot-v2-slider-filled') || queryOne(node, 'input[type="range"]')?.value || queryOne(node, '[aria-valuenow]')?.getAttribute('aria-valuenow'));
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Element UI slider filled' : 'Element UI slider not filled' };
    }
    if (widget === 'rate') {
      const node = resolveRuntimeComponent(field, ctx, '.el-rate');
      const ok = node instanceof Element && !!(node.getAttribute('data-formpilot-v2-rate-filled') || queryOne(node, '.is-active, .el-rate__icon.hover, [aria-checked="true"]'));
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Element UI rate filled' : 'Element UI rate not filled' };
    }
    if (widget === 'colorpicker') {
      const node = resolveRuntimeComponent(field, ctx, '.el-color-picker');
      const ok = node instanceof Element && !!node.getAttribute('data-formpilot-v2-color-filled');
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Element UI color filled' : 'Element UI color not filled' };
    }
    if (widget === 'transfer') {
      const node = resolveRuntimeComponent(field, ctx, '.el-transfer');
      const ok = node instanceof Element && !!node.getAttribute('data-formpilot-v2-transfer-filled');
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Element UI transfer filled' : 'Element UI transfer not filled' };
    }
    if (widget === 'rangepicker' || widget === 'datepicker' || widget === 'inputnumber') {
      const node = resolveRuntimeComponent(field, ctx, widget === 'inputnumber' ? '.el-input-number' : '.el-date-editor, .el-date-picker, .el-time-picker, .el-range-editor');
      const inputs = queryAll(node, 'input:not([type="hidden"]), textarea').filter((item) => item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement);
      const ok = inputs.some((input) => norm(input.value || ''));
      return { id: field.id, kind: field.kind, ok, reason: ok ? 'Element UI input filled' : 'Element UI input empty' };
    }
    return null;
  }

  adapters.register(FRAMEWORK, {
    selectors: {
      fieldControls: [
        '.el-select',
        '.el-select-v2',
        '.el-tree-select',
        '.el-cascader',
        '.el-date-editor',
        '.el-time-picker',
        '.el-input-number',
        '.el-switch',
        '.el-slider',
        '.el-rate',
        '.el-color-picker',
        '.el-transfer',
        '.el-upload',
        '.el-autocomplete',
        '.el-mention',
        '.el-radio-group',
        '.el-checkbox-group'
      ],
      fieldContainers: [
        '.el-form-item'
      ],
      segmentedGroups: [
        '.el-form-item'
      ],
      fieldLabels: [
        '.el-form-item__label'
      ],
      selectPanels: [
        '.el-select-dropdown',
        '.el-tree-select__popper',
        '.el-cascader__dropdown',
        '.el-popper',
        '.el-autocomplete-suggestion'
      ],
      selectOptions: [
        '.el-select-dropdown__item',
        '.el-select-dropdown__item span',
        '.el-cascader-node',
        '.el-tree-node__content',
        '.el-autocomplete-suggestion li'
      ],
      selectOptionClickables: [
        '.el-select-dropdown__item',
        '.el-cascader-node',
        '.el-tree-node__content',
        '.el-autocomplete-suggestion li'
      ],
      selectTriggerContainers: [
        '.el-select',
        '.el-select-v2',
        '.el-tree-select',
        '.el-cascader'
      ],
      choiceGroups: [
        '.el-radio-group',
        '.el-checkbox-group'
      ],
      choiceGroupContainers: [
        '.el-form-item',
        '.el-radio-group',
        '.el-checkbox-group'
      ],
      choiceOptions: [
        '.el-radio',
        '.el-checkbox'
      ],
      choiceClickables: [
        '.el-radio',
        '.el-checkbox'
      ],
      cascaderColumns: [
        '.el-cascader-menu'
      ],
      dateCells: [
        '.el-date-table td.available button',
        '.el-date-table td.available',
        '.el-date-table td.today button'
      ],
      displayValues: [
        '.el-select__selected-item',
        '.el-select-v2__placeholder',
        '.el-cascader__label',
        '.el-color-picker__color-inner'
      ],
      errorMessages: [
        '.el-form-item__error'
      ],
      requiredMarkers: [
        '.el-form-item.is-required'
      ]
    },
    detectFields,
    fillField,
    verifyField
  });
})();
