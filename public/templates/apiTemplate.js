import { saveTemplate } from './templateStore.js';

export async function saveApiTemplate({ name, endpoint, method, headers, body }) {
  return saveTemplate('api', {
    name,
    endpoint,
    method,
    headers,
    body,
    type: 'api'
  });
}
