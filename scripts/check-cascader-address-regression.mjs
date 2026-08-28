import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from 'chrome-launcher';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const fixturePath = path.join(scriptDir, 'fixtures', 'custom-renderer-cascader-address.html');
const fillScriptPath = path.join(rootDir, 'public', 'content', 'fill.js');
const scanScriptPath = path.join(rootDir, 'public', 'content', 'scan.js');
const fixtureUrl = pathToFileURL(fixturePath).href;

const settings = {
  debugLogs: false,
  fillOptionalFields: true,
  fillRadioCheckbox: true,
};

const cascaderField = {
  id: 'multi-cascader',
  kind: 'select',
  domId: 'cascader-trigger',
  selector: '#cascader-trigger',
  containerSelector: '#cascader-case',
  label: '三层多选 Cascader',
  placeholder: '请选择地区',
  context: '华东区 江苏省 南京市',
  confidence: 0.92,
  score: 0.92,
  options: [],
  meta: {
    widget: 'cascader',
    cascader: true,
    selectLike: true,
    multiSelect: true,
    multiple: true,
    componentGroup: true,
  },
};

const singleCascaderField = {
  ...cascaderField,
  id: 'single-cascader',
  meta: {
    ...cascaderField.meta,
    multiSelect: false,
    multiple: false,
  },
};

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
      typeof window.__FORMPILOT_CASCADER_FIXTURE__?.reset === 'function'
    `);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Cascader fixture did not become ready');
}

async function resetFixture(cdp) {
  await evaluate(cdp, 'window.__FORMPILOT_CASCADER_FIXTURE__.reset()');
}

async function snapshotFixture(cdp) {
  return evaluate(cdp, 'window.__FORMPILOT_CASCADER_FIXTURE__.snapshot()');
}

async function fill(cdp, field, value, timeoutMs = 90000) {
  return evaluate(
    cdp,
    `window.FormPilotV2Fill.fillFields(${JSON.stringify([field])}, ${JSON.stringify({ [field.id]: value })}, '#fixture-root', ${JSON.stringify(settings)})`,
    timeoutMs,
  );
}

async function scanFixtureFields(cdp) {
  const result = await evaluate(cdp, `window.FormPilotV2Scan.detectFields('#fixture-root')`);
  assert.equal(result?.ok, true, `scan failed: ${JSON.stringify(result)}`);
  return result.fields || [];
}

async function checkCascaderScan(cdp) {
  await resetFixture(cdp);
  const fields = await scanFixtureFields(cdp);
  const cascader = fields.find((field) => field?.meta?.widget === 'cascader');
  assert.ok(cascader, `scan did not return the Cascader field: ${JSON.stringify(fields)}`);
  assert.equal(cascader.kind, 'select', 'scan changed the Cascader field kind');
  assert.equal(cascader.meta?.multiSelect, true, 'classic multi Cascader was scanned as single-select');
  const address = fields.find((field) => field?.kind === 'addressComponent');
  assert.ok(address, `scan did not keep the address as one composite field: ${JSON.stringify(fields)}`);
  assert.deepEqual(address.meta?.comboboxRoles, ['province', 'city', 'district'], 'scan lost address level roles');
}

function assertSuccessfulFill(name, fillResult, snapshot) {
  assert.equal(fillResult?.ok, true, `${name}: fillFields did not return ok: ${JSON.stringify(fillResult)}`);
  assert.equal(fillResult?.failed, 0, `${name}: plugin reported a failed field: ${JSON.stringify({ fillResult, snapshot })}`);
  assert.equal(fillResult?.applied, 1, `${name}: expected exactly one applied field: ${JSON.stringify(fillResult)}`);
}

function assertOnlyTargetEvents(name, events, allowedLabels) {
  const labels = events.map((event) => event.label);
  for (const label of labels) {
    assert.ok(allowedLabels.includes(label), `${name}: switched to an unrelated branch ${label}: ${JSON.stringify(events)}`);
  }
  for (const label of allowedLabels) {
    assert.ok(labels.includes(label), `${name}: did not select ${label}: ${JSON.stringify(events)}`);
  }
}

async function checkMultiCascader(cdp) {
  await resetFixture(cdp);
  const fillResult = await fill(cdp, cascaderField, '华东区 / 江苏省 / 南京市');
  const snapshot = await snapshotFixture(cdp);
  assertSuccessfulFill('multi-cascader', fillResult, snapshot);
  assert.deepEqual(snapshot.cascader.modelValue, ['nanjing'], 'multi-cascader: modelValue must contain the selected leaf value');
  assert.deepEqual(
    snapshot.cascader.selectedPaths.map((path) => path.map((item) => item.label)),
    [['华东区', '江苏省', '南京市']],
    'multi-cascader: the real selected path was not committed',
  );
  assert.deepEqual(snapshot.submission.cascader, ['nanjing'], 'multi-cascader: submission payload did not receive the leaf value');
  assertOnlyTargetEvents('multi-cascader', snapshot.cascader.events, ['华东区', '江苏省', '南京市']);
  const staticFallback = await evaluate(cdp, `document.getElementById('cascader-trigger')?.getAttribute('data-formpilot-v2-cascader-static-fallback') || ''`);
  assert.equal(staticFallback, '', 'multi-cascader: a static display fallback was mistaken for a model update');

  const repeatedFillResult = await fill(cdp, cascaderField, '华东区 / 江苏省 / 南京市');
  const repeatedSnapshot = await snapshotFixture(cdp);
  assertSuccessfulFill('multi-cascader-repeat', repeatedFillResult, repeatedSnapshot);
  assert.deepEqual(
    repeatedSnapshot.cascader.modelValue,
    ['nanjing'],
    'multi-cascader-repeat: filling the same path again toggled the selected leaf off',
  );
  assert.deepEqual(
    repeatedSnapshot.submission.cascader,
    ['nanjing'],
    'multi-cascader-repeat: repeated fill corrupted the submission payload',
  );
}

async function checkMultiCascaderPaths(cdp) {
  await resetFixture(cdp);
  const fillResult = await fill(cdp, cascaderField, [
    '华东区 / 江苏省 / 南京市',
    '华南区 / 广东省 / 深圳市',
  ]);
  const snapshot = await snapshotFixture(cdp);
  assertSuccessfulFill('multi-cascader-paths', fillResult, snapshot);
  assert.deepEqual(
    snapshot.cascader.modelValue,
    ['nanjing', 'shenzhen'],
    'multi-cascader-paths: both leaf values must be committed exactly once',
  );
  assert.deepEqual(
    snapshot.cascader.selectedPaths.map((selectedPath) => selectedPath.map((item) => item.label)),
    [
      ['华东区', '江苏省', '南京市'],
      ['华南区', '广东省', '深圳市'],
    ],
    'multi-cascader-paths: one of the requested paths was lost or replaced',
  );
  assert.deepEqual(
    snapshot.submission.cascader,
    ['nanjing', 'shenzhen'],
    'multi-cascader-paths: submission payload did not receive both leaves',
  );
  assertOnlyTargetEvents(
    'multi-cascader-paths',
    snapshot.cascader.events,
    ['华东区', '江苏省', '南京市', '华南区', '广东省', '深圳市'],
  );
}

async function checkGeneratedCascader(cdp) {
  await resetFixture(cdp);
  await evaluate(cdp, 'window.__FORMPILOT_CASCADER_FIXTURE__.setDefaultTree(true)');
  const before = await evaluate(cdp, `({
    text: document.getElementById('cascader-trigger')?.textContent?.trim() || '',
    placeholder: document.querySelector('#cascader-trigger [data-placeholder]')?.textContent?.trim() || '',
  })`);
  assert.equal(before.text, '请选择地区', 'generated-cascader: fixture did not expose the custom placeholder text');
  assert.equal(before.placeholder, '请选择地区', 'generated-cascader: initial display was not marked as a placeholder');
  const fillResult = await fill(cdp, cascaderField, 'defaultRegion / defaultMainland');
  const snapshot = await snapshotFixture(cdp);
  assertSuccessfulFill('generated-cascader', fillResult, snapshot);
  assert.deepEqual(snapshot.cascader.modelValue, ['option_1_1'], 'generated-cascader: default Mainland target was not selected');
  assert.deepEqual(snapshot.submission.cascader, ['option_1_1'], 'generated-cascader: submission did not receive Mainland');
  assert.deepEqual(
    snapshot.cascader.selectedPaths.map((selectedPath) => selectedPath.map((item) => item.label)),
    [['默认地区', '中国大陆']],
    'generated-cascader: placeholder was mistaken for a selected path instead of committing Mainland',
  );
  assertOnlyTargetEvents('generated-cascader', snapshot.cascader.events, ['默认地区', '中国大陆']);
}

async function checkSingleCascaderArrayPath(cdp) {
  await resetFixture(cdp);
  await evaluate(cdp, 'window.__FORMPILOT_CASCADER_FIXTURE__.setMultiple(false)');
  const fillResult = await fill(cdp, singleCascaderField, ['华东区', '江苏省', '南京市']);
  const snapshot = await snapshotFixture(cdp);
  assertSuccessfulFill('single-cascader-array-path', fillResult, snapshot);
  assert.deepEqual(snapshot.cascader.modelValue, ['east', 'jiangsu', 'nanjing'], 'single-cascader-array-path: full path modelValue was not committed');
  assert.deepEqual(snapshot.submission.cascader, ['east', 'jiangsu', 'nanjing'], 'single-cascader-array-path: submission lost path segments');
}

async function checkMobileMultiCascader(cdp) {
  await resetFixture(cdp);
  await evaluate(cdp, 'window.__FORMPILOT_CASCADER_FIXTURE__.setMobile(true)');
  const fillResult = await fill(cdp, cascaderField, '华东区 / 江苏省 / 南京市');
  const snapshot = await snapshotFixture(cdp);
  assertSuccessfulFill('mobile-multi-cascader', fillResult, snapshot);
  assert.deepEqual(snapshot.cascader.modelValue, ['nanjing'], 'mobile-multi-cascader: leaf modelValue was not committed');
  assert.deepEqual(snapshot.submission.cascader, ['nanjing'], 'mobile-multi-cascader: submission payload was not committed');
  assertOnlyTargetEvents('mobile-multi-cascader', snapshot.cascader.events, ['华东区', '江苏省', '南京市']);
}

async function checkAddressPath(cdp, name, value, expectedRegion = value) {
  await resetFixture(cdp);
  const fields = await scanFixtureFields(cdp);
  const scannedAddressField = fields.find((field) => field?.kind === 'addressComponent');
  assert.ok(scannedAddressField, `${name}: address component was not scanned`);
  const fillValue = value && typeof value === 'object' ? { ...value, detail: value.detail || '' } : value;
  const fillResult = await fill(cdp, scannedAddressField, fillValue);
  const snapshot = await snapshotFixture(cdp);
  assertSuccessfulFill(name, fillResult, snapshot);
  assert.deepEqual(
    snapshot.address.modelValue.region,
    expectedRegion,
    `${name}: address model contains the wrong branch: ${JSON.stringify({ events: snapshot.address.events, fillResult })}`,
  );
  assert.deepEqual(
    snapshot.submission.address.region,
    expectedRegion,
    `${name}: submission payload contains the wrong branch: ${JSON.stringify(snapshot.address.events)}`,
  );

  const expectedByRole = {
    province: expectedRegion.province,
    city: expectedRegion.city,
    district: expectedRegion.district,
  };
  for (const [role, expected] of Object.entries(expectedByRole)) {
    const events = snapshot.address.events.filter((event) => event.role === role);
    assert.ok(events.length > 0, `${name}: ${role} never updated the model`);
    assert.ok(
      events.every((event) => event.label === expected),
      `${name}: ${role} switched away from ${expected}: ${JSON.stringify(events)}`,
    );
  }
}

async function checkMissingAddressTarget(cdp) {
  await resetFixture(cdp);
  const fields = await scanFixtureFields(cdp);
  const scannedAddressField = fields.find((field) => field?.kind === 'addressComponent');
  assert.ok(scannedAddressField, 'missing-address: address component was not scanned');
  const fillResult = await fill(cdp, scannedAddressField, {
    province: '重庆市',
    city: '市辖区',
    district: '不存在区',
    detail: '',
  });
  const snapshot = await snapshotFixture(cdp);
  assert.equal(fillResult?.failed, 1, `missing-address: plugin reported success: ${JSON.stringify({ fillResult, snapshot })}`);
  assert.equal(snapshot.address.modelValue.region.province, '重庆市', 'missing-address: retry changed the target province');
  assert.equal(snapshot.address.modelValue.region.city, '市辖区', 'missing-address: retry changed the target city branch');
  assert.equal(snapshot.address.modelValue.region.district, '', 'missing-address: retry selected an unrelated district');
  const districtDisplay = await evaluate(cdp, `({
    text: document.querySelector('#address-district [data-slot="select-value"]')?.textContent?.trim() || '',
    value: document.getElementById('address-district')?.getAttribute('data-value') || '',
    placeholder: document.querySelector('#address-district [data-placeholder]')?.textContent?.trim() || '',
  })`);
  assert.deepEqual(
    districtDisplay,
    { text: '區縣', value: '', placeholder: '區縣' },
    'missing-address: the traditional district placeholder was mistaken for a selected value',
  );
  assert.ok(
    snapshot.address.events.every((event) => event.label === '重庆市' || event.label === '市辖区'),
    `missing-address: retry clicked an unrelated option: ${JSON.stringify(snapshot.address.events)}`,
  );
}

async function checkHmtAddressLegalLevels(cdp, region) {
  await resetFixture(cdp);
  const fields = await scanFixtureFields(cdp);
  const scannedAddressField = fields.find((field) => field?.kind === 'addressComponent');
  const name = `hmt-address-${region}`;
  assert.ok(scannedAddressField, `${name}: address component was not scanned`);

  const fillResult = await fill(cdp, scannedAddressField, {
    province: region,
    city: '',
    district: '',
    detail: '',
  });
  const snapshot = await snapshotFixture(cdp);
  assertSuccessfulFill(name, fillResult, snapshot);
  assert.deepEqual(
    snapshot.address.modelValue.region,
    { province: region, city: '', district: '' },
    `${name}: plugin filled a level that does not exist in this region tree`,
  );
  assert.deepEqual(
    snapshot.submission.address.region,
    { province: region, city: '', district: '' },
    `${name}: submission payload contains a fabricated lower address level`,
  );
  assert.ok(snapshot.address.events.length > 0, `${name}: province was never selected through the real control`);
  assert.ok(
    snapshot.address.events.every((event) => event.role === 'province' && event.label === region),
    `${name}: filling a legal one-level region interacted with unrelated address levels: ${JSON.stringify(snapshot.address.events)}`,
  );

  const lowerLevelDisplays = await evaluate(cdp, `['city', 'district'].map((role) => ({
    role,
    text: document.querySelector('#address-' + role + ' [data-slot="select-value"]')?.textContent?.trim() || '',
    value: document.getElementById('address-' + role)?.getAttribute('data-value') || '',
    placeholder: document.querySelector('#address-' + role + ' [data-placeholder]')?.textContent?.trim() || '',
  }))`);
  assert.deepEqual(
    lowerLevelDisplays,
    [
      { role: 'city', text: '城市', value: '', placeholder: '城市' },
      { role: 'district', text: '區縣', value: '', placeholder: '區縣' },
    ],
    `${name}: an empty lower-level placeholder was counted or rendered as a selected value`,
  );
}

async function checkDisabledTargetlessAddressTail(cdp) {
  await resetFixture(cdp);
  await evaluate(cdp, 'window.__FORMPILOT_CASCADER_FIXTURE__.setDisableDistrict(true)');
  const fields = await scanFixtureFields(cdp);
  const scannedAddressField = fields.find((field) => field?.kind === 'addressComponent');
  assert.ok(scannedAddressField, 'disabled-tail: address component was not scanned');

  const fillResult = await fill(cdp, scannedAddressField, {
    province: '广东省',
    city: '深圳市',
    district: '',
    detail: '',
  });
  const snapshot = await snapshotFixture(cdp);
  assertSuccessfulFill('disabled-tail', fillResult, snapshot);
  assert.deepEqual(
    snapshot.address.modelValue.region,
    { province: '广东省', city: '深圳市', district: '' },
    'disabled-tail: plugin fabricated a district value',
  );
  assert.deepEqual(
    snapshot.submission.address.region,
    { province: '广东省', city: '深圳市', district: '' },
    'disabled-tail: submission changed the legal two-level address',
  );
  const districtState = await evaluate(cdp, `({
    disabled: document.getElementById('address-district')?.disabled === true,
    text: document.querySelector('#address-district [data-slot="select-value"]')?.textContent?.trim() || '',
    value: document.getElementById('address-district')?.getAttribute('data-value') || '',
  })`);
  assert.deepEqual(
    districtState,
    { disabled: true, text: '區縣', value: '' },
    'disabled-tail: the disabled empty district was mutated or treated as a value',
  );
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fillform-cascader-regression-'));
  const chromeProfileDir = path.join(tempDir, 'chrome-profile');
  await fs.mkdir(chromeProfileDir, { recursive: true });
  let chrome;
  let cdp;
  const cases = [];
  const caseFilter = String(process.env.FILLFORM_CASE_FILTER || process.argv.slice(2).join(' ')).trim().toLowerCase();
  const runCase = async (name, callback) => {
    if (caseFilter && !name.toLowerCase().includes(caseFilter)) return;
    const startedAt = Date.now();
    try {
      await callback();
      cases.push({ name, ok: true, durationMs: Date.now() - startedAt });
      console.log(`PASS ${name}`);
    } catch (error) {
      cases.push({ name, ok: false, durationMs: Date.now() - startedAt, error: error?.message || String(error) });
      console.error(`FAIL ${name}: ${error?.message || String(error)}`);
    }
  };

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

    const [fillScript, scanScript] = await Promise.all([
      fs.readFile(fillScriptPath, 'utf8'),
      fs.readFile(scanScriptPath, 'utf8'),
    ]);
    await cdp.send('Runtime.evaluate', {
      expression: `${scanScript}\n//# sourceURL=formpilot-cascader-address-scan.js`,
      awaitPromise: true,
      returnByValue: false,
    }, 30000);
    await cdp.send('Runtime.evaluate', {
      expression: `${fillScript}\n//# sourceURL=formpilot-cascader-address-fill.js`,
      awaitPromise: true,
      returnByValue: false,
    }, 30000);
    const fillReady = await evaluate(cdp, `typeof window.FormPilotV2Fill?.fillFields === 'function'`);
    assert.equal(fillReady, true, 'public/content/fill.js did not initialize in the fixture');

    await runCase('classic multi cascader scan keeps multiSelect', () => checkCascaderScan(cdp));
    await runCase('three-level multi cascader commits modelValue', () => checkMultiCascader(cdp));
    await runCase('multi cascader commits two requested paths', () => checkMultiCascaderPaths(cdp));
    await runCase('single cascader accepts native array path', () => checkSingleCascaderArrayPath(cdp));
    await runCase('custom cascader placeholder still selects Mainland', () => checkGeneratedCascader(cdp));
    await runCase('mobile multi cascader commits one leaf', () => checkMobileMultiCascader(cdp));
    await runCase('Shanghai municipality stays on province branch', () => checkAddressPath(cdp, 'shanghai-municipality', {
      province: '上海市',
      city: '市辖区',
      district: '浦东新区',
    }));
    await runCase('Chongqing municipal-district branch', () => checkAddressPath(cdp, 'chongqing-municipal-district', {
      province: '重庆市',
      city: '市辖区',
      district: '渝中区',
    }));
    await runCase('Chongqing county branch', () => checkAddressPath(cdp, 'chongqing-county', {
      province: '重庆市',
      city: '县',
      district: '城口县',
    }));
    await runCase('generated Shanghai city maps to municipality branch', () => checkAddressPath(
      cdp,
      'generated-shanghai-municipality',
      { province: '上海市', city: '上海市', district: '徐汇区' },
      { province: '上海市', city: '市辖区', district: '徐汇区' },
    ));
    await runCase('municipality string keeps district target', () => checkAddressPath(
      cdp,
      'parsed-chongqing-municipality',
      '重庆市渝中区解放碑街道',
      { province: '重庆市', city: '市辖区', district: '渝中区' },
    ));
    await runCase('Hong Kong succeeds with legal address levels', () => checkHmtAddressLegalLevels(cdp, '香港'));
    await runCase('Macao succeeds with legal address levels', () => checkHmtAddressLegalLevels(cdp, '澳门'));
    await runCase('Taiwan succeeds with legal address levels', () => checkHmtAddressLegalLevels(cdp, '台湾'));
    await runCase('targetless disabled address tail remains valid', () => checkDisabledTargetlessAddressTail(cdp));
    await runCase('missing district never changes province branch', () => checkMissingAddressTarget(cdp));

    const failures = cases.filter((item) => !item.ok);
    console.log(JSON.stringify({
      ok: failures.length === 0,
      fixture: path.relative(rootDir, fixturePath),
      implementation: path.relative(rootDir, fillScriptPath),
      cases,
    }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    cdp?.close();
    try {
      await chrome?.kill();
    } catch {
      // The test result is already available if Chrome exits first.
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
    stack: String(error?.stack || '').slice(0, 3000),
  }, null, 2));
  process.exitCode = 1;
});
