import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import jsQR from 'jsqr';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

const rootDir = path.resolve('.');
const outputDir = path.join(rootDir, '.output', 'chrome-mv3');
const secondaryOutputDir = path.join(rootDir, '.output', 'chrome-mv3 - out');
const chromePath = process.env.FILLFORM_BROWSER_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const qrText = 'FILLFORM_QR_REGRESSION';
const barcodeText = 'CODE128TEST123';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function configureLocalWriterWasm() {
  const wasmBytes = fs.readFileSync(path.join(
    rootDir,
    'node_modules',
    'zxing-wasm',
    'dist',
    'writer',
    'zxing_writer.wasm'
  ));
  prepareZXingModule({
    overrides: {
      instantiateWasm(imports, successCallback) {
        WebAssembly.instantiate(wasmBytes, imports).then(({ instance }) => successCallback(instance));
        return {};
      }
    }
  });
}

function symbolToRgba(symbol, scale = 8, quietModules = 4) {
  const width = (symbol.width + quietModules * 2) * scale;
  const height = (symbol.height + quietModules * 2) * scale;
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(255);
  for (let y = 0; y < symbol.height; y += 1) {
    for (let x = 0; x < symbol.width; x += 1) {
      const value = symbol.data[y * symbol.width + x];
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = (x + quietModules) * scale + dx;
          const py = (y + quietModules) * scale + dy;
          const offset = (py * width + px) * 4;
          rgba[offset] = value;
          rgba[offset + 1] = value;
          rgba[offset + 2] = value;
          rgba[offset + 3] = 255;
        }
      }
    }
  }
  return { data: rgba, width, height };
}

function findBuiltWorker(directory) {
  const outputRoot = path.resolve(directory);
  const offscreenHtmlPath = path.join(outputRoot, 'barcode-offscreen.html');
  assert(
    fs.existsSync(offscreenHtmlPath),
    `Built barcode offscreen page is missing: ${offscreenHtmlPath}`
  );

  const offscreenHtml = fs.readFileSync(offscreenHtmlPath, 'utf8');
  const moduleScriptMatch = offscreenHtml.match(
    /<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["'][^>]*>/i
  );
  assert(
    moduleScriptMatch?.[1],
    `Built barcode offscreen page has no active module chunk: ${offscreenHtmlPath}`
  );

  const extensionOrigin = 'https://fillform-extension.invalid';
  const chunkUrl = new URL(moduleScriptMatch[1], `${extensionOrigin}/`);
  assert(
    chunkUrl.origin === extensionOrigin,
    `Built barcode offscreen page references a non-local module chunk: ${moduleScriptMatch[1]}`
  );
  const chunkRelativePath = decodeURIComponent(chunkUrl.pathname).replace(/^\/+/, '');
  const chunkPath = path.resolve(outputRoot, chunkRelativePath);
  assert(
    chunkPath.startsWith(`${outputRoot}${path.sep}`) && fs.existsSync(chunkPath),
    `Active barcode offscreen chunk is missing: ${chunkPath}`
  );

  const chunkSource = fs.readFileSync(chunkPath, 'utf8');
  const workerUrlMatch = chunkSource.match(
    /\bnew\s+Worker\s*\(\s*(["'`])([^"'`]*barcodeZxingWorker-[^"'`]*\.js)\1/
  );
  assert(
    workerUrlMatch?.[2],
    `Active barcode offscreen chunk has no barcode Worker URL: ${chunkPath}`
  );

  const workerUrl = new URL(workerUrlMatch[2], `${extensionOrigin}/`);
  assert(
    workerUrl.origin === extensionOrigin,
    `Active barcode offscreen chunk references a non-local Worker: ${workerUrlMatch[2]}`
  );
  const workerRelativePath = decodeURIComponent(workerUrl.pathname).replace(/^\/+/, '');
  const workerPath = path.resolve(outputRoot, workerRelativePath);
  assert(
    workerPath.startsWith(`${outputRoot}${path.sep}`) && fs.existsSync(workerPath),
    `Active barcode Worker asset is missing: ${workerPath}`
  );
  assert(
    path.dirname(workerPath) === path.join(outputRoot, 'assets'),
    `Active barcode Worker is outside the expected assets directory: ${workerPath}`
  );
  return path.basename(workerPath);
}

function mimeType(filePath) {
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  return 'application/octet-stream';
}

function buildTestPage(code128Symbol, workerName) {
  const serializedSymbol = JSON.stringify({
    width: code128Symbol.width,
    height: code128Symbol.height,
    data: Array.from(code128Symbol.data)
  });
  return `<!doctype html>
<html>
<body>
  <script>
    async function barcodePngDataUrl() {
      const symbol = ${serializedSymbol};
      const canvas = document.createElement('canvas');
      canvas.width = symbol.width;
      canvas.height = symbol.height;
      const context = canvas.getContext('2d');
      const image = context.createImageData(symbol.width, symbol.height);
      for (let index = 0; index < symbol.data.length; index += 1) {
        const offset = index * 4;
        const value = symbol.data[index];
        image.data[offset] = value;
        image.data[offset + 1] = value;
        image.data[offset + 2] = value;
        image.data[offset + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png');
    }

    function runWorker(dataUrl) {
      return new Promise((resolve, reject) => {
        const worker = new Worker('/assets/${workerName}');
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error('worker response timeout'));
        }, 15000);
        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          resolve(event.data);
        };
        worker.onerror = (event) => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(event.message || 'worker load failed'));
        };
        worker.postMessage({
          id: 'browser-regression',
          image: { dataUrl },
          options: {
            formats: ['Code128'],
            maxNumberOfSymbols: 8,
            tryHarder: true,
            tryRotate: true,
            tryInvert: true,
            returnErrors: false
          }
        });
      });
    }

    window.runBarcodeRegression = async () => runWorker(await barcodePngDataUrl());
    window.runInvalidImageRegression = async () => runWorker('data:image/png;base64,broken');
  </script>
</body>
</html>`;
}

class CdpClient {
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  close() {
    this.socket.close();
  }
}

async function waitFor(callback, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await callback();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}: ${lastError?.message || ''}`);
}

async function runBrowserWorkerTest(code128Symbol, workerName) {
  const page = buildTestPage(code128Symbol, workerName);
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(page);
      return;
    }
    const relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
    const filePath = path.resolve(outputDir, relativePath);
    if (!filePath.startsWith(`${outputDir}${path.sep}`) || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': mimeType(filePath) });
    fs.createReadStream(filePath).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const port = server.address().port;
  const pageUrl = `http://127.0.0.1:${port}/`;
  const debugPort = 9700 + Math.floor(Math.random() * 200);
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fillform-barcode-regression-'));
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    pageUrl
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeStderr = '';
  chrome.stderr.on('data', (chunk) => { chromeStderr += String(chunk); });

  let client = null;
  try {
    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`).catch(() => null);
      return response?.ok;
    }, 15000, 'Chrome DevTools');
    const pageTarget = await waitFor(async () => {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      return targets.find((target) => target.type === 'page'
        && target.url === pageUrl
        && target.webSocketDebuggerUrl);
    }, 10000, 'barcode regression page');
    client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.send('Runtime.enable');
    await waitFor(async () => {
      const evaluation = await client.send('Runtime.evaluate', {
        expression: 'typeof window.runBarcodeRegression === "function"',
        returnByValue: true
      });
      return evaluation.result?.value === true;
    }, 10000, 'barcode regression script');

    const barcodeEvaluation = await client.send('Runtime.evaluate', {
      expression: 'window.runBarcodeRegression()',
      awaitPromise: true,
      returnByValue: true
    });
    if (barcodeEvaluation.exceptionDetails) {
      throw new Error(barcodeEvaluation.exceptionDetails.exception?.description || 'Barcode evaluation failed');
    }
    const barcodePayload = barcodeEvaluation.result?.value;
    assert(barcodePayload?.ok === true, `Barcode worker failed: ${JSON.stringify(barcodePayload)}`);
    assert(
      barcodePayload.results?.some((result) => result.text === barcodeText && result.format === 'Code128'),
      `Code128 result missing: ${JSON.stringify(barcodePayload)}`
    );

    const invalidEvaluation = await client.send('Runtime.evaluate', {
      expression: 'window.runInvalidImageRegression()',
      awaitPromise: true,
      returnByValue: true
    });
    const invalidPayload = invalidEvaluation.result?.value;
    assert(invalidPayload?.ok === false, `Invalid image unexpectedly succeeded: ${JSON.stringify(invalidPayload)}`);
    assert(invalidPayload.code && invalidPayload.error, `Invalid image error is incomplete: ${JSON.stringify(invalidPayload)}`);
    return { barcodePayload, invalidPayload };
  } catch (error) {
    error.message += `\nChrome stderr: ${chromeStderr.slice(-2000)}`;
    throw error;
  } finally {
    client?.close();
    chrome.kill();
    server.close();
    if (chrome.exitCode === null) {
      await Promise.race([
        new Promise((resolve) => chrome.once('exit', resolve)),
        delay(3000)
      ]);
    }
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function main() {
  assert(fs.existsSync(chromePath), `Chrome not found: ${chromePath}`);
  configureLocalWriterWasm();

  const qr = await writeBarcode(qrText, { format: 'QRCode' });
  const qrImage = symbolToRgba(qr.symbol);
  const qrResult = jsQR(qrImage.data, qrImage.width, qrImage.height, { inversionAttempts: 'attemptBoth' });
  assert(qrResult?.data === qrText, `jsQR regression failed: ${qrResult?.data || 'no result'}`);

  const code128 = await writeBarcode(barcodeText, {
    format: 'Code128',
    scale: 3,
    withQuietZones: true
  });
  const workerName = findBuiltWorker(outputDir);
  const secondaryWorkerName = findBuiltWorker(secondaryOutputDir);
  assert(
    secondaryWorkerName === workerName,
    `Primary and secondary outputs reference different workers: ${workerName} != ${secondaryWorkerName}`
  );
  const secondaryWorkerPath = path.join(secondaryOutputDir, 'assets', secondaryWorkerName);
  assert(
    fs.readFileSync(path.join(outputDir, 'assets', workerName)).equals(fs.readFileSync(secondaryWorkerPath)),
    'Primary and secondary worker assets differ'
  );

  const browserResult = await runBrowserWorkerTest(code128.symbol, workerName);
  console.log(JSON.stringify({
    ok: true,
    qr: { text: qrResult.data, engine: 'jsQR' },
    barcode: {
      text: browserResult.barcodePayload.results[0].text,
      format: browserResult.barcodePayload.results[0].format,
      worker: workerName
    },
    invalidImage: {
      code: browserResult.invalidPayload.code,
      error: browserResult.invalidPayload.error
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exitCode = 1;
});
