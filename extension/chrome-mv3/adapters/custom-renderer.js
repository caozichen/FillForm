(function initFormPilotV2CustomRendererAdapter() {
  const adapters = window.FormPilotV2Adapters;
  if (!adapters?.register) return;

  adapters.register('customRenderer', {
    selectors: {
      fieldControls: [
        '.fb-runtime-cascader-trigger',
        '.fb-runtime-ranking-item',
        '.rating-item',
        '.nps-scale__score-btn',
        '[contenteditable="true"]'
      ],
      fieldContainers: [
        '.fb-form-field',
        '.fb-form-item',
        '.fb-runtime-input-field',
        '.fb-form-fields > *'
      ],
      segmentedGroups: [
        '.fb-form-field',
        '.fb-form-item'
      ],
      fieldLabels: [
        '.fb-field-label',
        '.fb-runtime-field-heading',
        '.fb-form-field-label',
        '.fb-label',
        '[data-field-title]',
        '[data-field-label]'
      ],
      selectPanels: [
        '.fb-runtime-cascader-panel',
        '.fb-runtime-cascader-content'
      ],
      selectOptions: [
        '.fb-runtime-cascader-option'
      ],
      selectOptionClickables: [
        '.fb-runtime-cascader-option'
      ],
      choiceGroupContainers: [
        '.fb-choice-options',
        '.fb-runtime-input-field',
        '.fb-form-field',
        '.fb-form-item',
        '.fb-form-fields > *'
      ],
      choiceClickables: [
        '.fb-runtime-control',
        '.fb-checkbox-choice-option',
        '.fb-radio-choice-option'
      ],
      timePickerPanels: [
        '.fb-timepicker-container',
        '.mobile-time-picker-panel',
        '.time-picker-panel'
      ]
    }
  });
})();
