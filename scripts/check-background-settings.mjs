import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../legacy/core/types.js';

const settingsKey = STORAGE_KEYS.SETTINGS;
const storage = {};
let onMessage;
let onInstalled;
const originalChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  writable: true,
  value: {
    storage: {
      local: {
        async get(key) {
          return { [key]: structuredClone(storage[key]) };
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        }
      }
    },
    runtime: {
      onMessage: { addListener(listener) { onMessage = listener; } },
      onInstalled: { addListener(listener) { onInstalled = listener; } }
    },
    tabs: {
      onUpdated: { addListener() {} },
      onActivated: { addListener() {} },
      onRemoved: { addListener() {} }
    }
  }
});

async function sendMessage(message) {
  const response = await new Promise((resolve) => {
    assert.equal(onMessage(message, {}, resolve), true);
  });
  assert.equal(response.ok, true, response.error);
  return response.settings;
}

try {
  await import('../legacy/background.js');
  assert.equal(typeof onMessage, 'function');
  assert.equal(typeof onInstalled, 'function');

  const cases = [
    { name: 'enabled crypto survives', raw: ['ui', 'qr', 'crypto'], expected: ['ui', 'qr', 'crypto'] },
    { name: 'crypto can be the only tab', raw: ['crypto'], expected: ['crypto'] },
    { name: 'missing tabs use defaults', raw: undefined, expected: DEFAULT_SETTINGS.visiblePanelTabs },
    { name: 'empty tabs use defaults', raw: [], expected: DEFAULT_SETTINGS.visiblePanelTabs },
    { name: 'invalid tabs use defaults', raw: ['unknown'], expected: DEFAULT_SETTINGS.visiblePanelTabs },
    { name: 'non-array tabs use defaults', raw: 'crypto', expected: DEFAULT_SETTINGS.visiblePanelTabs },
    { name: 'invalid tabs and duplicates are removed', raw: ['crypto', 'unknown', 'ui', 'crypto', 'api', 'ui'], expected: ['crypto', 'ui', 'api'] }
  ];

  const decryptConfig = {
    selectedProjectIds: ['test-project'],
    projects: [{ id: 'test-project', name: 'Regression project', salt: 'test-salt', minLength: '8' }]
  };

  for (const test of cases) {
    const saved = {
      visiblePanelTabs: test.raw,
      provider: 'openai',
      floatingEnabled: false,
      decryptConfig,
      openai: { model: 'regression-model', reasoningEffort: 'high' }
    };
    const assertSettings = (settings, operation) => {
      const label = `${test.name}: ${operation}`;
      assert.deepEqual(settings.visiblePanelTabs, test.expected, label);
      assert.deepEqual(settings.decryptConfig, decryptConfig, `${label}: project configuration`);
      assert.equal(settings.provider, 'openai', `${label}: provider`);
      assert.equal(settings.floatingEnabled, false, `${label}: floating panel`);
      assert.equal(settings.openai.model, 'regression-model', `${label}: model`);
      assert.equal(settings.openai.reasoningEffort, 'high', `${label}: reasoning effort`);
    };

    storage[settingsKey] = structuredClone(saved);
    assertSettings(await sendMessage({ type: 'formpilotv2:get-settings' }), 'get-settings after page reload');
    assert.deepEqual(storage[settingsKey], saved, `${test.name}: reading does not mutate storage`);

    delete storage[settingsKey];
    assertSettings(await sendMessage({ type: 'formpilotv2:set-settings', settings: saved }), 'set-settings response');
    assertSettings(storage[settingsKey], 'set-settings storage');
    assertSettings(await sendMessage({ type: 'formpilotv2:get-settings' }), 'get-settings after saving');

    storage[settingsKey] = structuredClone(saved);
    await onInstalled();
    assertSettings(storage[settingsKey], 'extension initialization');
  }

  delete storage[settingsKey];
  assert.deepEqual(
    (await sendMessage({ type: 'formpilotv2:get-settings' })).visiblePanelTabs,
    DEFAULT_SETTINGS.visiblePanelTabs,
    'fresh installation keeps optional tabs disabled'
  );

  console.log(`Background settings checks passed (${cases.length} persistence cases)`);
} finally {
  if (originalChrome) Object.defineProperty(globalThis, 'chrome', originalChrome);
  else delete globalThis.chrome;
}
