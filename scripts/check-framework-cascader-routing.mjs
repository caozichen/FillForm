import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from 'chrome-launcher';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const fixturePath = path.join(scriptDir, 'fixtures', 'framework-cascader-routing.html');
const fillScriptPath = path.join(rootDir, 'public', 'content', 'fill.js');
const fixtureUrl = pathToFileURL(fixturePath).href;

const settings = {
  debugLogs: false,
  fillOptionalFields: true,
  fillRadioCheckbox: true,
};

const cases = [
  {
    name: 'Arco Design adapterName cascader uses click navigation',
    fixtureKey: 'arco',
    field: {
      id: 'arco-framework-cascader',
      kind: 'select',
      domId: 'arco-trigger',
      selector: '#arco-trigger',
      containerSelector: '#arco-case',
      label: 'Arco 三级级联',
      placeholder: '请选择',
      confidence: 0.9,
      score: 0.9,
      options: [],
      meta: {
        widget: 'cascader',
        adapterName: 'arcoDesign',
        cascader: true,
        selectLike: true,
        componentGroup: true,
      },
    },
    value: '华东区 / 江苏省 / 南京市',
    expectedLabels: ['华东区', '江苏省', '南京市'],
    expectedLeaf: 'nanjing',
  },
  {
    name: 'Element UI componentAdapter cascader uses click navigation',
    fixtureKey: 'element',
    field: {
      id: 'element-framework-cascader',
      kind: 'select',
      domId: 'element-trigger',
      selector: '#element-trigger',
      containerSelector: '#element-case',
      label: 'Element UI 三级级联',
      placeholder: '请选择',
      confidence: 0.9,
      score: 0.9,
      options: [],
      meta: {
        widget: 'cascader',
        componentAdapter: 'elementUI',
        cascader: true,
        selectLike: true,
        componentGroup: true,
      },
    },
    value: '产品中心 / 企业服务 / 专业版',
    expectedLabels: ['产品中心', '企业服务', '专业版'],
    expectedLeaf: 'professional',
  },
];

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('This regression check requires Node.js 22+ with the global WebSocket API.');
    }
    const socket = new WebSocket(this.webSocketUrl);
    this.socket = socket;
    socket.addEventListener('message', (event) => this.handleMessage(event.data));
    socket.addEventListener('close', () => this.rejectPending(new Error('CDP socket closed')));
    socket.addEventListener('error', () => this.rejectPending(new Error('CDP socket error')));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connection timeout')), 10000);
      socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Unable to connect to the Chrome DevTools Protocol'));
      }, { once: true });
    });
    return this;
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8'));
    } catch {
      return;
    }
    if (!message.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`${pending.method}: ${message.error.message || JSON.stringify(message.error)}`));
      return;
    }
    pending.resolve(message.result);
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Chrome shutdown also closes the socket.
    }
  }
}

async function evaluate(cdp, expression, timeoutMs = 30000) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Runtime.evaluate failed';
    throw new Error(detail);
  }
  return result.result?.value;
}

async function waitForFixture(cdp) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(cdp, `
      document.readyState === 'complete' &&
      typeof window.__FORMPILOT_FRAMEWORK_CASCADER_FIXTURE__?.reset === 'function'
    `);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Framework Cascader fixture did not become ready');
}

async function checkCase(cdp, testCase) {
  await evaluate(cdp, 'window.__FORMPILOT_FRAMEWORK_CASCADER_FIXTURE__.reset()');
  const fillResult = await evaluate(
    cdp,
    `window.FormPilotV2Fill.fillFields(${JSON.stringify([testCase.field])}, ${JSON.stringify({
      [testCase.field.id]: testCase.value,
    })}, '#fixture-root', ${JSON.stringify(settings)})`,
    30000,
  );
  const snapshot = await evaluate(cdp, 'window.__FORMPILOT_FRAMEWORK_CASCADER_FIXTURE__.snapshot()');
  const state = snapshot[testCase.fixtureKey];

  assert.equal(fillResult?.ok, true, `${testCase.name}: fillFields failed: ${JSON.stringify(fillResult)}`);
  assert.equal(fillResult?.applied, 1, `${testCase.name}: expected one applied field: ${JSON.stringify(fillResult)}`);
  assert.equal(fillResult?.failed, 0, `${testCase.name}: plugin reported a failed field: ${JSON.stringify(fillResult)}`);
  assert.deepEqual(
    state.selectedPath.map((item) => item.label),
    testCase.expectedLabels,
    `${testCase.name}: the requested leaf path was not committed`,
  );
  assert.equal(state.modelValue, testCase.expectedLeaf, `${testCase.name}: modelValue did not receive the real leaf value`);
  assert.equal(state.submissionValue, testCase.expectedLeaf, `${testCase.name}: submission did not receive the real leaf value`);

  const clickEvents = state.events.filter((event) => event.action === 'click');
  assert.deepEqual(
    clickEvents.map((event) => event.label),
    testCase.expectedLabels,
    `${testCase.name}: navigation did not click every requested path node exactly once`,
  );
  assert.equal(clickEvents.filter((event) => event.parent).length, 2, `${testCase.name}: both parent levels must expand via click`);
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fillform-framework-cascader-'));
  const chromeProfileDir = path.join(tempDir, 'chrome-profile');
  await fs.mkdir(chromeProfileDir, { recursive: true });
  let chrome;
  let cdp;

  try {
    chrome = await launch({
      userDataDir: chromeProfileDir,
      chromeFlags: [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-default-browser-check',
        '--allow-file-access-from-files',
        '--window-size=1280,900',
      ],
    });

    const targetResponse = await fetch(`http://127.0.0.1:${chrome.port}/json/new?${encodeURIComponent(fixtureUrl)}`, {
      method: 'PUT',
    });
    assert.equal(targetResponse.ok, true, `Unable to create Chrome target: ${targetResponse.status}`);
    const target = await targetResponse.json();
    cdp = await new CdpClient(target.webSocketDebuggerUrl).connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await waitForFixture(cdp);

    const fillScript = await fs.readFile(fillScriptPath, 'utf8');
    await cdp.send('Runtime.evaluate', {
      expression: `${fillScript}\n//# sourceURL=formpilot-framework-cascader-fill.js`,
      awaitPromise: true,
      returnByValue: false,
    }, 30000);
    const fillReady = await evaluate(cdp, `typeof window.FormPilotV2Fill?.fillFields === 'function'`);
    assert.equal(fillReady, true, 'public/content/fill.js did not initialize in the fixture');

    for (const testCase of cases) {
      await checkCase(cdp, testCase);
      console.log(`PASS ${testCase.name}`);
    }
    console.log(`framework cascader routing regression passed: ${cases.length} cases`);
  } finally {
    cdp?.close();
    if (chrome) await chrome.kill();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
