import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from 'chrome-launcher';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../public/core/types.js';

// Runs the real settings page with isolated, persistent chrome.storage stubs.
// OPTIONS_PAGE can point to another options.html to check a pre-fix build.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = pathToFileURL(process.env.OPTIONS_PAGE || path.join(rootDir, 'public/options.html')).href;
const settingsKey = STORAGE_KEYS.SETTINGS;
const seedSettings = {
  ...DEFAULT_SETTINGS,
  debugLogs: false,
  visiblePanelTabs: ['ui', 'qr', 'crypto'],
  decryptConfig: {
    selectedProjectIds: ['persistence-test'],
    projects: [{ id: 'persistence-test', name: 'Persistence test', salt: 'fixture-only', minLength: 8 }],
  },
};

function installChromeStub(seed) {
  const storageKey = '__fillform_options_regression__';
  if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(seed));
  const read = () => JSON.parse(localStorage.getItem(storageKey));
  window.__optionsLoadId = crypto.randomUUID();
  window.__storageWrites = 0;
  Object.assign(window.chrome ||= {}, {
    storage: {
      local: {
        async get(keys) {
          const data = read();
          if (keys == null) return data;
          if (typeof keys === 'string') return { [keys]: data[keys] };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map((key) => [key, data[key]]));
          return { ...keys, ...Object.fromEntries(Object.keys(keys).filter((key) => key in data).map((key) => [key, data[key]])) };
        },
        async set(values) {
          localStorage.setItem(storageKey, JSON.stringify({ ...read(), ...values }));
          window.__storageWrites += 1;
        },
        async remove(keys) {
          const data = read();
          for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
          localStorage.setItem(storageKey, JSON.stringify(data));
        },
      },
    },
    runtime: {
      async sendMessage() { return { ok: true, buckets: [], tabId: 0 }; },
      getURL(value) { return new URL(value, location.href).href; },
    },
    tabs: { async query() { return []; }, async create() { return {}; } },
  });
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('CDP socket closed'));
      }
      this.pending.clear();
    });
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
    });
    return this;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
  }
}

async function waitFor(cdp, expression, label) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await cdp.evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function pageReady(cdp, previousLoadId = '') {
  await waitFor(cdp, `window.__optionsLoadId && window.__optionsLoadId !== ${JSON.stringify(previousLoadId)}
    && document.readyState === 'complete'
    && document.querySelector('input[name="decryptProjectEnabled"][value="persistence-test"]')`, 'settings to load');
  assert.equal(await cdp.evaluate(`document.getElementById('saveStatus').classList.contains('error')`), false, 'settings initialization failed');
}

async function reload(cdp) {
  const loadId = await cdp.evaluate('window.__optionsLoadId');
  await cdp.send('Page.reload', { ignoreCache: true });
  await pageReady(cdp, loadId);
}

const cryptoInput = `document.querySelector('input[name="visibleTabs"][value="crypto"]')`;
const storedSettings = `(await chrome.storage.local.get(${JSON.stringify(settingsKey)}))[${JSON.stringify(settingsKey)}]`;

async function assertCryptoState(cdp, enabled, label) {
  const state = await cdp.evaluate(`(async () => ({
    checked: ${cryptoInput}.checked,
    sectionVisible: !document.getElementById('decryptSection').hidden,
    navVisible: !document.getElementById('decryptSectionNav').hidden,
    stored: (${storedSettings}).visiblePanelTabs.includes('crypto'),
    projectChecked: document.querySelector('input[name="decryptProjectEnabled"][value="persistence-test"]').checked,
  }))()`);
  assert.deepEqual(state, {
    checked: enabled, sectionVisible: enabled, navVisible: enabled, stored: enabled, projectChecked: true,
  }, label);
}

async function save(cdp, buttonId) {
  const writes = await cdp.evaluate('window.__storageWrites');
  await cdp.evaluate(`document.getElementById(${JSON.stringify(buttonId)}).click()`);
  await waitFor(cdp, `window.__storageWrites > ${writes}`, `${buttonId} to persist settings`);
}

async function checkSettings(cdp) {
  // Seed represents a previously password-verified, saved enablement; no real password is read or guessed.
  await assertCryptoState(cdp, true, 'previously saved crypto must restore its checkbox, config and navigation');
  await save(cdp, 'tabControlSaveBtn');
  await reload(cdp);
  await assertCryptoState(cdp, true, 'crypto must remain enabled after saving tabs and refreshing');
  console.log('PASS saved crypto survives settings-page refresh');

  await cdp.evaluate(`document.getElementById('debugLogs').click()`);
  await save(cdp, 'saveBtn');
  await reload(cdp);
  await assertCryptoState(cdp, true, 'saving unrelated settings must preserve crypto');
  assert.equal(await cdp.evaluate(`(async () => (${storedSettings}).debugLogs)()`), true, 'unrelated setting was not saved');
  console.log('PASS saving other settings preserves crypto and decrypt-project selection');

  await cdp.evaluate(`${cryptoInput}.click()`);
  await save(cdp, 'tabControlSaveBtn');
  await reload(cdp);
  await assertCryptoState(cdp, false, 'explicitly disabled crypto must stay disabled after refresh');
  console.log('PASS disabling, saving and refreshing keeps crypto disabled');

  await cdp.evaluate(`${cryptoInput}.click()`);
  assert.equal(await cdp.evaluate(`document.getElementById('tabPasswordModal').hidden`), false, 're-enabling must request a password');
  await assertCryptoState(cdp, false, 'requesting a password must not enable crypto');
  await cdp.evaluate(`document.getElementById('tabPasswordInput').value = 'regression-invalid-password'; document.getElementById('tabPasswordConfirmBtn').click()`);
  assert.equal(await cdp.evaluate(`document.getElementById('tabPasswordError').hidden`), false, 'wrong password must show an error');
  await assertCryptoState(cdp, false, 'wrong password must not enable crypto');
  await cdp.evaluate(`document.getElementById('tabPasswordCancelBtn').click()`);
  assert.equal(await cdp.evaluate(`document.getElementById('tabPasswordModal').hidden`), true, 'cancel must close the password dialog');
  await save(cdp, 'saveBtn');
  await reload(cdp);
  await assertCryptoState(cdp, false, 'cancelled or failed password validation must not persist enablement');
  console.log('PASS re-enabling requires a password; wrong password and cancel remain disabled');
}

async function runBrowserChecks(check = checkSettings) {
  assert.equal(typeof WebSocket, 'function', 'This check requires Node.js 22+ with the global WebSocket API');
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fillform-options-persistence-'));
  let chrome;
  let cdp;
  try {
    await fs.mkdir(path.join(tempDir, 'chrome-profile'));
    chrome = await launch({
      userDataDir: path.join(tempDir, 'chrome-profile'),
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files'],
    });
    const response = await fetch(`http://127.0.0.1:${chrome.port}/json/new?about:blank`, { method: 'PUT' });
    assert.equal(response.ok, true, 'Unable to create isolated Chrome tab');
    const target = await response.json();
    cdp = await new CdpClient(target.webSocketDebuggerUrl).connect();
    await cdp.send('Page.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${installChromeStub})(${JSON.stringify({ [settingsKey]: seedSettings })})`,
    });
    await cdp.send('Page.navigate', { url: pageUrl });
    await pageReady(cdp);
    await check(cdp);
  } finally {
    cdp?.socket.close();
    if (chrome) await chrome.kill();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export { runBrowserChecks, waitFor, reload, save, storedSettings, settingsKey, pageUrl };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBrowserChecks().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
