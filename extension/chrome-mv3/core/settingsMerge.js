// Apply only fields edited since this form was loaded. Arrays are complete field values.
export function mergeSettingsChanges(current, baseline, draft) {
  const result = { ...current };
  for (const [key, value] of Object.entries(draft)) {
    if (JSON.stringify(value) === JSON.stringify(baseline?.[key])) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeSettingsChanges(current?.[key] || {}, baseline?.[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
