(function initFormPilotV2NativeAdapter() {
  const BUILD = '2026-07-09-02';
  const existing = window.FormPilotV2Adapters;
  if (existing?.__build === BUILD && existing.registry?.native) return;

  const registry = existing?.registry || {};
  const unique = (items = []) => {
    const out = [];
    const seen = new Set();
    for (const item of items || []) {
      const value = String(item || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  };

  const adapters = existing || {
    __build: BUILD,
    registry,
    register(name, adapter = {}) {
      const key = String(name || '').trim();
      if (!key) return;
      registry[key] = {
        ...(registry[key] || {}),
        ...adapter,
        selectors: {
          ...(registry[key]?.selectors || {}),
          ...(adapter.selectors || {})
        }
      };
    },
    selectorList(names = [], key = '', fallback = []) {
      const adapterNames = Array.isArray(names) ? names : [names];
      const fromAdapters = [];
      for (const name of adapterNames) {
        const selectors = registry[name]?.selectors?.[key];
        if (Array.isArray(selectors)) fromAdapters.push(...selectors);
      }
      return unique([...fromAdapters, ...(Array.isArray(fallback) ? fallback : [])]);
    },
    selectorString(names = [], key = '', fallback = []) {
      return this.selectorList(names, key, fallback).join(', ');
    },
    adapterList(names = []) {
      const adapterNames = Array.isArray(names) && names.length ? names : Object.keys(registry);
      return adapterNames
        .map((name) => ({ name, adapter: registry[name] }))
        .filter((item) => item.adapter && typeof item.adapter === 'object');
    },
    detectFields(names = [], root, context = {}) {
      const fields = [];
      for (const { name, adapter } of this.adapterList(names)) {
        if (typeof adapter.detectFields !== 'function') continue;
        try {
          const result = adapter.detectFields(root, { ...context, adapterName: name });
          if (Array.isArray(result)) fields.push(...result.filter(Boolean));
        } catch (error) {
          try {
            console.warn('[FormPilotV2Adapters] detectFields failed', name, error);
          } catch {
            // ignore
          }
        }
      }
      return fields;
    },
    async fillField(field, value, context = {}) {
      const name = String(
        field?.meta?.adapterName ||
        field?.meta?.componentAdapter ||
        field?.meta?.frameworkAdapter ||
        ''
      ).trim();
      const candidates = name ? [{ name, adapter: registry[name] }] : this.adapterList();
      for (const item of candidates) {
        const adapter = item.adapter;
        if (typeof adapter?.fillField !== 'function') continue;
        try {
          const result = await adapter.fillField(field, value, { ...context, adapterName: item.name });
          if (result != null) return result;
        } catch (error) {
          try {
            console.warn('[FormPilotV2Adapters] fillField failed', item.name, error);
          } catch {
            // ignore
          }
          return context?.buildFillResult
            ? context.buildFillResult(false, `adapter fill failed: ${error?.message || error || item.name}`)
            : { ok: false, reason: `adapter fill failed: ${error?.message || error || item.name}` };
        }
      }
      return null;
    },
    verifyField(field, context = {}) {
      const name = String(
        field?.meta?.adapterName ||
        field?.meta?.componentAdapter ||
        field?.meta?.frameworkAdapter ||
        ''
      ).trim();
      const candidates = name ? [{ name, adapter: registry[name] }] : this.adapterList();
      for (const item of candidates) {
        const adapter = item.adapter;
        if (typeof adapter?.verifyField !== 'function') continue;
        try {
          const result = adapter.verifyField(field, { ...context, adapterName: item.name });
          if (result != null) return result;
        } catch (error) {
          try {
            console.warn('[FormPilotV2Adapters] verifyField failed', item.name, error);
          } catch {
            // ignore
          }
          return {
            id: field?.id || '',
            kind: field?.kind || '',
            ok: false,
            reason: `adapter verify failed: ${error?.message || error || item.name}`
          };
        }
      }
      return null;
    }
  };

  adapters.register = adapters.register || function register(name, adapter = {}) {
    const key = String(name || '').trim();
    if (!key) return;
    registry[key] = {
      ...(registry[key] || {}),
      ...adapter,
      selectors: {
        ...(registry[key]?.selectors || {}),
        ...(adapter.selectors || {})
      }
    };
  };
  adapters.selectorList = adapters.selectorList || function selectorList(names = [], key = '', fallback = []) {
    const adapterNames = Array.isArray(names) ? names : [names];
    const fromAdapters = [];
    for (const name of adapterNames) {
      const selectors = registry[name]?.selectors?.[key];
      if (Array.isArray(selectors)) fromAdapters.push(...selectors);
    }
    return unique([...fromAdapters, ...(Array.isArray(fallback) ? fallback : [])]);
  };
  adapters.selectorString = adapters.selectorString || function selectorString(names = [], key = '', fallback = []) {
    return this.selectorList(names, key, fallback).join(', ');
  };
  adapters.adapterList = adapters.adapterList || function adapterList(names = []) {
    const adapterNames = Array.isArray(names) && names.length ? names : Object.keys(registry);
    return adapterNames
      .map((name) => ({ name, adapter: registry[name] }))
      .filter((item) => item.adapter && typeof item.adapter === 'object');
  };
  adapters.detectFields = adapters.detectFields || function detectFields(names = [], root, context = {}) {
    const fields = [];
    for (const { name, adapter } of this.adapterList(names)) {
      if (typeof adapter.detectFields !== 'function') continue;
      try {
        const result = adapter.detectFields(root, { ...context, adapterName: name });
        if (Array.isArray(result)) fields.push(...result.filter(Boolean));
      } catch (error) {
        try {
          console.warn('[FormPilotV2Adapters] detectFields failed', name, error);
        } catch {
          // ignore
        }
      }
    }
    return fields;
  };
  adapters.fillField = adapters.fillField || async function fillField(field, value, context = {}) {
    const name = String(
      field?.meta?.adapterName ||
      field?.meta?.componentAdapter ||
      field?.meta?.frameworkAdapter ||
      ''
    ).trim();
    const candidates = name ? [{ name, adapter: registry[name] }] : this.adapterList();
    for (const item of candidates) {
      const adapter = item.adapter;
      if (typeof adapter?.fillField !== 'function') continue;
      try {
        const result = await adapter.fillField(field, value, { ...context, adapterName: item.name });
        if (result != null) return result;
      } catch (error) {
        try {
          console.warn('[FormPilotV2Adapters] fillField failed', item.name, error);
        } catch {
          // ignore
        }
        return context?.buildFillResult
          ? context.buildFillResult(false, `adapter fill failed: ${error?.message || error || item.name}`)
          : { ok: false, reason: `adapter fill failed: ${error?.message || error || item.name}` };
      }
    }
    return null;
  };
  adapters.verifyField = adapters.verifyField || function verifyField(field, context = {}) {
    const name = String(
      field?.meta?.adapterName ||
      field?.meta?.componentAdapter ||
      field?.meta?.frameworkAdapter ||
      ''
    ).trim();
    const candidates = name ? [{ name, adapter: registry[name] }] : this.adapterList();
    for (const item of candidates) {
      const adapter = item.adapter;
      if (typeof adapter?.verifyField !== 'function') continue;
      try {
        const result = adapter.verifyField(field, { ...context, adapterName: item.name });
        if (result != null) return result;
      } catch (error) {
        try {
          console.warn('[FormPilotV2Adapters] verifyField failed', item.name, error);
        } catch {
          // ignore
        }
        return {
          id: field?.id || '',
          kind: field?.kind || '',
          ok: false,
          reason: `adapter verify failed: ${error?.message || error || item.name}`
        };
      }
    }
    return null;
  };

  adapters.__build = BUILD;
  adapters.registry = registry;
  window.FormPilotV2Adapters = adapters;

  adapters.register('native', {
    selectors: {
      fieldControls: [
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
      ],
      fieldContainers: [
        'li[id]',
        '.control-group',
        '.controls',
        '[data-formpilot-field]',
        '[data-field]',
        '.form-field',
        '.form-item',
        'fieldset',
        '[role="group"]',
        '[role="radiogroup"]'
      ],
      segmentedGroups: [
        '.form-item',
        '.form-field',
        'fieldset',
        '[role="group"]'
      ],
      fieldLabels: [
        'label',
        '.label',
        '.field-label',
        '.form-label'
      ],
      selectPanels: [
        '[role="listbox"]',
        '[role="menu"]',
        '[role="tree"]',
        '[data-radix-popper-content-wrapper]',
        '[id^="reka-select-content"]',
        '.dropdown-menu',
        '.dropdown__menu',
        '.select-dropdown',
        '[data-headlessui-portal] [role="listbox"]'
      ],
      selectOptions: [
        '[role="option"]',
        '[role="menuitem"]',
        '[role="treeitem"]',
        'option',
        '[aria-selected]',
        '[data-radix-collection-item]',
        '[data-slot="select-item"]',
        '[data-value]',
        '[data-label]',
        '[data-option]',
        '[data-testid*="option"]'
      ],
      selectOptionClickables: [
        '[role="option"]',
        '[role="menuitem"]',
        '[data-radix-collection-item]',
        '[data-radix-vue-collection-item]',
        '[data-radix-vue-select-item]',
        '[data-reka-collection-item]',
        '[data-slot="select-item"]',
        '[id^="reka-select-item-"]',
        '[data-option]',
        '[data-testid*="option"]',
        'li'
      ],
      selectTriggerContainers: [
        '[data-formpilot-stamp]',
        '[role="combobox"]',
        '[aria-haspopup="listbox"]',
        '[aria-controls]',
        '[aria-owns]'
      ],
      addressComboTriggers: [
        'select',
        'button[role="combobox"]',
        '[role="combobox"]',
        'button[aria-haspopup="listbox"]',
        '[aria-haspopup="listbox"][role="button"]',
        'button[aria-controls]',
        '[aria-controls][role="button"]',
        'button[aria-owns]',
        '[aria-owns][role="button"]'
      ],
      choiceGroups: [
        '[role="radiogroup"]',
        '[role="group"]'
      ],
      choiceGroupContainers: [
        'fieldset',
        '[role="group"]',
        '[role="radiogroup"]',
        '.form-item',
        '.form-field'
      ],
      choiceOptions: [
        'input[type="radio"]',
        'input[type="checkbox"]',
        '[role="radio"]',
        '[role="checkbox"]',
        '[aria-checked]',
        'button',
        'label',
        '.option',
        '.option-item'
      ],
      choiceClickables: [
        'label',
        '[role="radio"]',
        '[role="checkbox"]',
        '.option',
        '.option-item'
      ],
      cascaderColumns: [
        '[data-cascader-column]',
        '[role="menu"]'
      ],
      dateCells: [
        '[role="gridcell"]:not([aria-disabled="true"]) button',
        '[role="gridcell"]:not([aria-disabled="true"]) [data-reka-calendar-cell-trigger]',
        '[data-reka-calendar-cell-trigger]:not([disabled])',
        '[data-radix-vue-calendar-cell-trigger]:not([disabled])',
        '[data-radix-calendar-cell-trigger]:not([disabled])',
        '[aria-label*="day"]:not([disabled])',
        '[aria-label*="日期"]:not([disabled])'
      ],
      displayValues: [
        '[data-slot="select-value"]',
        '[class*="select-value"]',
        '[class*="selected"]'
      ],
      errorMessages: [
        '[role="alert"]',
        '.invalid-feedback',
        '.error-message'
      ],
      requiredMarkers: [
        '.required',
        '[data-required="true"]'
      ],
      timePickerPanels: [
        '[data-timepicker-panel]',
        '[data-time-picker-panel]'
      ]
    }
  });
})();
