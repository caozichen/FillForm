import assert from 'node:assert/strict';
import { mergeSettingsChanges } from '../public/core/settingsMerge.js';
import { applyApiChanges, ENDPOINTS_KEY } from '../public/core/templatePersistence.js';
import { STORAGE_KEYS } from '../public/core/types.js';

const baseline = { provider: 'heuristic', openai: { model: 'old', apiKey: '' }, visiblePanelTabs: ['ui'], testDataLibrary: { enabled: true, pools: { email: ['old'] } } };
const latest = { ...baseline, provider: 'openai', openai: { model: 'new', apiKey: '' }, visiblePanelTabs: ['ui', 'crypto'], testDataLibrary: { enabled: true, pools: { email: ['new'] } }, externalField: 42 };
const draft = structuredClone(baseline);
draft.openai.apiKey = 'fixture-key';
draft.testDataLibrary.enabled = false;
assert.deepEqual(mergeSettingsChanges(latest, baseline, draft), {
  ...latest, openai: { model: 'new', apiKey: 'fixture-key' }, testDataLibrary: { enabled: false, pools: { email: ['new'] } }
});
draft.visiblePanelTabs = ['qr'];
assert.deepEqual(mergeSettingsChanges(latest, baseline, draft).visiblePanelTabs, ['qr']);
assert.equal(latest.openai.apiKey, '', 'merging does not mutate the latest settings');

let storage = {
  [ENDPOINTS_KEY]: [{ id: 'external-endpoint' }],
  [STORAGE_KEYS.TEMPLATES]: { ui: [{ id: 'page-template' }], api: [{ id: 'external-template', steps: [{ endpointId: 'external-endpoint' }, { endpointId: 'keep-endpoint' }] }] }
};
const writes = [];
const previousChrome = globalThis.chrome;
globalThis.chrome = { storage: { local: {
  async get() { return structuredClone(storage); },
  async set(values) { writes.push(values); storage = { ...storage, ...structuredClone(values) }; }
} } };
try {
  await applyApiChanges({ endpoints: [{ id: 'local-endpoint' }] });
  assert.deepEqual(storage[STORAGE_KEYS.TEMPLATES].api.map((item) => item.id), ['external-template']);
  assert.deepEqual(Object.keys(writes.at(-1)), [ENDPOINTS_KEY], 'saving an endpoint does not rewrite templates');
  await applyApiChanges({ templates: [{ id: 'local-template' }] });
  assert.deepEqual(storage[STORAGE_KEYS.TEMPLATES].api.map((item) => item.id), ['local-template', 'external-template']);
  await applyApiChanges({ removedTemplateIds: ['local-template'] });
  assert.deepEqual(storage[STORAGE_KEYS.TEMPLATES].api.map((item) => item.id), ['external-template']);
  await applyApiChanges({ removedEndpointIds: ['external-endpoint'] });
  assert.deepEqual(storage[ENDPOINTS_KEY].map((item) => item.id), ['local-endpoint']);
  assert.deepEqual(storage[STORAGE_KEYS.TEMPLATES].api[0].steps, [{ endpointId: 'keep-endpoint' }]);
  assert.deepEqual(storage[STORAGE_KEYS.TEMPLATES].ui, [{ id: 'page-template' }]);
  globalThis.chrome.storage.local.set = async () => { throw new Error('fixture write failure'); };
  await assert.rejects(applyApiChanges({ templates: [{ id: 'failed-template' }] }), /fixture write failure/);
  assert.equal(storage[STORAGE_KEYS.TEMPLATES].api.some((item) => item.id === 'failed-template'), false);
  console.log('PASS settings field merges; template additions, deletions, references and write failures');
} finally {
  if (previousChrome === undefined) delete globalThis.chrome;
  else globalThis.chrome = previousChrome;
}
