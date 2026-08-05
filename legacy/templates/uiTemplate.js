import { saveTemplate } from './templateStore.js';

export async function saveUiTemplate({ name, fields, scopeSelector }) {
  return saveTemplate('ui', {
    name,
    fields,
    scopeSelector,
    type: 'ui'
  });
}
