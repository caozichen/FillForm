import fs from 'node:fs/promises';
import net from 'node:net';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from 'chrome-launcher';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cliArgs = process.argv.slice(2);
const targetUrl = cliArgs.find((arg) => !arg.startsWith('--')) || 'http://uat.form-building.lingxi.tech/renderer/?id=qdrOAl';
const shouldFill = cliArgs.includes('--fill');
const onlyKindArg = cliArgs.find((arg) => arg.startsWith('--only-kind='));
const onlyKind = onlyKindArg ? onlyKindArg.slice('--only-kind='.length).trim() : '';
const fillOptionalFields = !cliArgs.includes('--required-only') && !cliArgs.includes('--fill-optional=false');
const outDir = path.join(rootDir, 'outputs', 'recognition-check');
const scanScriptPath = path.join(rootDir, '.output', 'chrome-mv3', 'content', 'scan.js');
const fillScriptPath = path.join(rootDir, '.output', 'chrome-mv3', 'content', 'fill.js');
const detectEnginePath = path.join(rootDir, '.output', 'chrome-mv3', 'core', 'detectEngine.js');
const dataEnginePath = path.join(rootDir, '.output', 'chrome-mv3', 'core', 'dataEngine.js');
const typesPath = path.join(rootDir, '.output', 'chrome-mv3', 'core', 'types.js');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class MiniCdpSocket {
  constructor(wsUrl) {
    this.wsUrl = new URL(wsUrl);
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.nextId = 1;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const port = Number(this.wsUrl.port || 80);
      const host = this.wsUrl.hostname;
      const requestPath = `${this.wsUrl.pathname}${this.wsUrl.search || ''}`;
      const socket = net.createConnection({ host, port }, () => {
        socket.write([
          `GET ${requestPath} HTTP/1.1`,
          `Host: ${host}:${port}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${key}`,
          'Sec-WebSocket-Version: 13',
          '\r\n'
        ].join('\r\n'));
      });
      this.socket = socket;

      let handshake = Buffer.alloc(0);
      let settled = false;
      const onDataBefore = (chunk) => {
        handshake = Buffer.concat([handshake, chunk]);
        const idx = handshake.indexOf('\r\n\r\n');
        if (idx < 0) return;
        const header = handshake.slice(0, idx).toString('utf8');
        if (!/^HTTP\/1\.1 101/i.test(header)) {
          settled = true;
          reject(new Error(`WebSocket handshake failed: ${header.split('\r\n')[0]}`));
          socket.destroy();
          return;
        }
        settled = true;
        socket.off('data', onDataBefore);
        socket.on('data', (data) => this.#onData(data));
        const rest = handshake.slice(idx + 4);
        if (rest.length) this.#onData(rest);
        resolve(this);
      };

      socket.on('data', onDataBefore);
      socket.on('error', (error) => {
        if (!settled) reject(error);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      });
      socket.on('close', () => {
        const error = new Error('CDP socket closed');
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
      });
      setTimeout(() => {
        if (!settled) reject(new Error('WebSocket handshake timeout'));
      }, 10000);
    });
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timeout`));
      }, timeoutMs);
      this.pending.set(id, { method, resolve, reject, timer });
      this.socket.write(this.#encodeFrame(payload));
    });
  }

  close() {
    try {
      this.socket?.end();
    } catch {
      // ignore
    }
  }

  #encodeFrame(text) {
    const payload = Buffer.from(text, 'utf8');
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    header[0] = 0x81;
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) {
      masked[i] = payload[i] ^ mask[i % 4];
    }
    return Buffer.concat([header, mask, masked]);
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const opcode = b0 & 0x0f;
      const masked = !!(b1 & 0x80);
      let length = b1 & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const bigLength = this.buffer.readBigUInt64BE(offset);
        if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error('CDP frame too large');
        }
        length = Number(bigLength);
        offset += 8;
      }

      let mask = null;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + length) return;

      let payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);
      if (masked) {
        const unmasked = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i += 1) {
          unmasked[i] = payload[i] ^ mask[i % 4];
        }
        payload = unmasked;
      }

      if (opcode === 0x8) return;
      if (opcode === 0x9) {
        this.socket.write(Buffer.from([0x8a, 0x00]));
        continue;
      }
      if (opcode !== 0x1 && opcode !== 0x2) continue;
      this.#handleMessage(payload.toString('utf8'));
    }
  }

  #handleMessage(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (!message.id || !this.pending.has(message.id)) return;
    const pending = this.pending.get(message.id);
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`${pending.method}: ${message.error.message || JSON.stringify(message.error)}`));
    } else {
      pending.resolve(message.result);
    }
  }
}

async function evaluate(cdp, expression, timeoutMs = 30000) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function collectPageState(cdp) {
  return evaluate(cdp, `(() => {
    const norm = (text) => String(text || '').replace(/\\s+/g, ' ').trim();
    const visible = (el) => {
      if (!el || !(el instanceof Element)) return false;
      if (el.hidden || el.closest('[aria-hidden="true"]')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const labelFor = (el) => {
      if (!(el instanceof Element)) return '';
      const labels = el.labels ? Array.from(el.labels).map((x) => norm(x.textContent)).filter(Boolean) : [];
      if (labels.length) return labels.join(' / ');
      const id = el.getAttribute('id');
      if (id) {
        const explicit = document.querySelector('label[for="' + CSS.escape(id) + '"]');
        if (explicit) return norm(explicit.textContent);
      }
      const closestLabel = el.closest('label');
      if (closestLabel) return norm(closestLabel.textContent).slice(0, 120);
      const container = el.closest('.fb-form-field, .fb-form-item, .form-item, .form-field, .arco-form-item, .ant-form-item, .el-form-item, [role="group"], fieldset');
      if (container) {
        const candidate = container.querySelector('.fb-form-label, .label, label, legend, .arco-form-item-label, .ant-form-item-label, .el-form-item__label');
        if (candidate) return norm(candidate.textContent).slice(0, 120);
      }
      return '';
    };
    const controlSelector = [
      'input',
      'textarea',
      'select',
      'button[role="combobox"]',
      '[role="combobox"]',
      '[role="radio"]',
      '[role="checkbox"]',
      '[contenteditable="true"]'
    ].join(',');
    const controls = Array.from(document.querySelectorAll(controlSelector))
      .filter((el) => !el.closest('#formpilot-v2-fab-root'))
      .filter((el) => {
        const tag = el.tagName.toLowerCase();
        const type = String(el.getAttribute('type') || '').toLowerCase();
        if (type === 'hidden' || type === 'submit' || type === 'reset' || type === 'button') return false;
        if (tag === 'button' && el.getAttribute('role') !== 'combobox') return false;
        return visible(el);
      })
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        return {
          index,
          tag: el.tagName.toLowerCase(),
          type: String(el.getAttribute('type') || '').toLowerCase(),
          role: String(el.getAttribute('role') || '').toLowerCase(),
          eid: el.getAttribute('data-formpilot-v2-eid') || '',
          id: el.getAttribute('id') || '',
          name: el.getAttribute('name') || '',
          placeholder: el.getAttribute('placeholder') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          text: norm(el.textContent || '').slice(0, 120),
          label: labelFor(el),
          value: 'value' in el ? String(el.value || '') : '',
          checked: 'checked' in el ? !!el.checked : false,
          rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }
        };
      });
    const rows = Array.from(document.querySelectorAll('.fb-form-field, .fb-form-item, .form-item, .form-field, .arco-form-item, .ant-form-item, .el-form-item, fieldset, [role="group"]'))
      .filter(visible)
      .map((el, index) => ({
        index,
        tag: el.tagName.toLowerCase(),
        className: String(el.className || '').slice(0, 160),
        text: norm(el.textContent || '').slice(0, 220),
        controls: Array.from(el.querySelectorAll(controlSelector)).filter(visible).length
      }))
      .filter((row) => row.controls > 0)
      .slice(0, 200);
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      bodyText: norm(document.body?.innerText || '').slice(0, 3000),
      controlCount: controls.length,
      controls,
      rows
    };
  })()`);
}

function buildCoveredDomIdSet(fields) {
  const covered = new Set();
  const add = (value) => {
    const text = String(value || '').trim();
    if (text) covered.add(text);
  };
  for (const field of fields || []) {
    add(field.domId);
    add(field.meta?.detailDomId);
    for (const item of field.meta?.comboboxDomIds || []) add(item);
    for (const item of field.meta?.segmentDomIds || []) add(item);
    for (const option of field.options || []) add(option.domId);
  }
  return covered;
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.join(outDir, 'chrome-profile'), { recursive: true });
  const chrome = await launch({
    userDataDir: path.join(outDir, 'chrome-profile'),
    chromeFlags: [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--disable-crash-reporter',
      '--window-size=1440,1800'
    ]
  });

  let cdp;
  try {
    const newTargetResp = await fetch(`http://127.0.0.1:${chrome.port}/json/new?${encodeURIComponent(targetUrl)}`, {
      method: 'PUT'
    });
    const target = await newTargetResp.json();
    cdp = await new MiniCdpSocket(target.webSocketDebuggerUrl).connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1800,
      deviceScaleFactor: 1,
      mobile: false
    });

    let state = null;
    for (let i = 0; i < 45; i += 1) {
      state = await collectPageState(cdp);
      if (state.url.startsWith('chrome-error://')) break;
      if (state.readyState === 'complete' && state.controlCount > 0) break;
      await sleep(1000);
    }

    if (!state || state.url.startsWith('chrome-error://')) {
      const result = {
        ok: false,
        error: 'page-load-failed',
        targetUrl,
        pageState: state
      };
      await fs.writeFile(path.join(outDir, 'qdrOAl-recognition.json'), JSON.stringify(result, null, 2), 'utf8');
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const scanScript = await fs.readFile(scanScriptPath, 'utf8');
    await cdp.send('Runtime.evaluate', {
      expression: `${scanScript}\n//# sourceURL=formpilot-scan.js`,
      awaitPromise: true,
      returnByValue: false
    }, 30000);

    const rawScan = await evaluate(cdp, `(() => {
      if (!window.FormPilotV2Scan?.detectFields) return { ok: false, error: 'scan module missing' };
      return window.FormPilotV2Scan.detectFields('');
    })()`, 30000);
    const postScanState = await collectPageState(cdp);

    const { detectEngineNormalize, prepareFieldsForFill } = await import(pathToFileURL(detectEnginePath).href);
    const normalizedFields = rawScan?.ok ? detectEngineNormalize(rawScan.fields || []) : [];
    const fillPlan = prepareFieldsForFill(normalizedFields);
    const coveredDomIds = buildCoveredDomIdSet(normalizedFields);
    const uncoveredControls = postScanState.controls.filter((control) => {
      if (!control.eid) return true;
      if (coveredDomIds.has(control.eid)) return false;
      const type = `${control.type} ${control.role}`;
      if (/radio|checkbox/.test(type)) {
        return !normalizedFields.some((field) =>
          (field.kind === 'radioGroup' || field.kind === 'checkboxGroup') &&
          (field.options || []).some((option) => option.domId === control.eid)
        );
      }
      return true;
    });

    let screenshotPath = '';
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, 30000);
      screenshotPath = path.join(outDir, 'qdrOAl-page.png');
      await fs.writeFile(screenshotPath, Buffer.from(shot.data, 'base64'));
    } catch {
      screenshotPath = '';
    }

    let fillCheck = null;
    if (shouldFill) {
      const fillScript = await fs.readFile(fillScriptPath, 'utf8');
      await cdp.send('Runtime.evaluate', {
        expression: `${fillScript}\n//# sourceURL=formpilot-fill.js`,
        awaitPromise: true,
        returnByValue: false
      }, 30000);
      const { generateValues } = await import(pathToFileURL(dataEnginePath).href);
      const { DEFAULT_SETTINGS } = await import(pathToFileURL(typesPath).href);
      const settings = {
        ...DEFAULT_SETTINGS,
        fillOptionalFields,
        debugLogs: false
      };
      const fieldsForFill = (fillPlan.fields || normalizedFields).filter((field) => !onlyKind || field.kind === onlyKind);
      const values = generateValues(fieldsForFill, settings);
      const fillResult = await evaluate(cdp, `window.FormPilotV2Fill.fillFields(${
        JSON.stringify(fieldsForFill)
      }, ${
        JSON.stringify(values)
      }, '', ${
        JSON.stringify(settings)
      })`, 120000);
      await sleep(800);
      const verifyResult = await evaluate(cdp, `window.FormPilotV2Fill.verifyFieldsCompletion(${
        JSON.stringify(fieldsForFill)
      }, '', ${
        JSON.stringify(settings)
      })`, 30000);
      const filledPageState = await collectPageState(cdp);
      fillCheck = {
        values,
        fillResult,
        verifyResult,
        onlyKind,
        fillOptionalFields,
        remainingEmptyControls: filledPageState.controls
          .filter((control) => !control.value && !control.checked && !/radio|checkbox/.test(`${control.type} ${control.role}`))
          .map((control) => ({
            tag: control.tag,
            type: control.type,
            role: control.role,
            placeholder: control.placeholder,
            label: control.label,
            rect: control.rect
          }))
      };
    }

    const result = {
      ok: true,
      targetUrl,
      loadedUrl: postScanState.url,
      title: postScanState.title,
      visibleControlCount: postScanState.controlCount,
      visibleRows: postScanState.rows,
      rawScanSummary: rawScan?.summary || null,
      rawFieldCount: rawScan?.fields?.length || 0,
      normalizedFieldCount: normalizedFields.length,
      fillPlanSummary: fillPlan.summary,
      byKind: normalizedFields.reduce((acc, field) => {
        acc[field.kind] = (acc[field.kind] || 0) + 1;
        return acc;
      }, {}),
      fields: normalizedFields.map((field) => ({
        id: field.id,
        kind: field.kind,
        label: field.label,
        placeholder: field.placeholder,
        context: field.context,
        selector: field.selector,
        domId: field.domId,
        score: field.score,
        lowConfidence: field.lowConfidence,
        options: (field.options || []).map((option) => option.label || option.value).filter(Boolean),
        constraints: field.constraints || {},
        meta: {
          segmented: !!field.meta?.segmented,
          selectLike: !!field.meta?.selectLike,
          componentGroup: !!field.meta?.componentGroup,
          sectionVariant: field.meta?.sectionVariant || '',
          comboboxDomIds: field.meta?.comboboxDomIds || [],
          segmentDomIds: field.meta?.segmentDomIds || [],
          detailDomId: field.meta?.detailDomId || ''
        }
      })),
      uncoveredControlCount: uncoveredControls.length,
      uncoveredControls,
      droppedFields: (fillPlan.dropped || []).map((field) => ({
        id: field.id,
        kind: field.kind,
        label: field.label,
        placeholder: field.placeholder,
        selector: field.selector,
        score: field.score,
        reason: field.reason || (field.reasons || [])[0] || ''
      })),
      fillCheck,
      screenshotPath
    };

    await fs.writeFile(path.join(outDir, 'qdrOAl-recognition.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({
      ok: result.ok,
      loadedUrl: result.loadedUrl,
      visibleControlCount: result.visibleControlCount,
      rawFieldCount: result.rawFieldCount,
      normalizedFieldCount: result.normalizedFieldCount,
      fillPlanSummary: result.fillPlanSummary,
      byKind: result.byKind,
      uncoveredControlCount: result.uncoveredControlCount,
      droppedCount: result.droppedFields.length,
      fillCheck: fillCheck ? {
        applied: fillCheck.fillResult?.applied || 0,
        failed: fillCheck.fillResult?.failed || 0,
        verifiedCompleted: fillCheck.verifyResult?.completed || 0,
        verifiedMissing: fillCheck.verifyResult?.missing || 0,
        remainingEmptyControls: fillCheck.remainingEmptyControls.length
      } : null,
      screenshotPath: result.screenshotPath,
      jsonPath: path.join(outDir, 'qdrOAl-recognition.json')
    }, null, 2));
  } finally {
    try {
      cdp?.close();
    } catch {
      // ignore
    }
    try {
      await chrome.kill();
    } catch {
      // Chrome may keep profile files locked briefly on Windows; the result file is already written.
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
    stack: String(error?.stack || '').slice(0, 2000)
  }, null, 2));
  process.exitCode = 1;
});
