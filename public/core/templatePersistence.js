import { STORAGE_KEYS } from './types.js';

export const ENDPOINTS_KEY = 'formpilot_api_endpoints';

function updateList(current, updates, removedIds) {
  const removed = new Set(removedIds);
  const replacements = new Map(updates.map((item) => [item.id, item]));
  const existing = new Set(current.map((item) => item.id));
  return [
    ...updates.filter((item) => !existing.has(item.id) && !removed.has(item.id)),
    ...current.filter((item) => !removed.has(item.id)).map((item) => replacements.get(item.id) || item)
  ];
}

export async function applyApiChanges({ endpoints = [], templates = [], removedEndpointIds = [], removedTemplateIds = [] } = {}) {
  const data = await chrome.storage.local.get([ENDPOINTS_KEY, STORAGE_KEYS.TEMPLATES]);
  const store = data[STORAGE_KEYS.TEMPLATES] || { ui: [], api: [] };
  const nextEndpoints = updateList(data[ENDPOINTS_KEY] || [], endpoints, removedEndpointIds);
  let nextTemplates = updateList(store.api || [], templates, removedTemplateIds);
  if (removedEndpointIds.length) {
    const removed = new Set(removedEndpointIds);
    nextTemplates = nextTemplates.map((template) => ({
      ...template,
      steps: (template.steps || []).filter((step) => !removed.has(step.endpointId))
    }));
  }
  const changes = {};
  if (endpoints.length || removedEndpointIds.length) changes[ENDPOINTS_KEY] = nextEndpoints;
  if (templates.length || removedTemplateIds.length || removedEndpointIds.length) {
    changes[STORAGE_KEYS.TEMPLATES] = { ...store, api: nextTemplates };
  }
  if (Object.keys(changes).length) await chrome.storage.local.set(changes);
  return { endpoints: nextEndpoints, templates: nextTemplates };
}
