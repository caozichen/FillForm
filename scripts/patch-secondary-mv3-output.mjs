import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve('.');
const sourceDir = path.join(rootDir, '.output', 'chrome-mv3');
const targetDir = path.join(rootDir, '.output', 'chrome-mv3 - out');
const clientImport = 'import"./barcode-offscreen-client.js";';
const bridgeMarker = 'FormPilotBarcodeOffscreenDecode';
const patchedTimeoutFunction = 'async function ro(e,t){return no(e,t,8000)}';
const originalTimeoutFunction = 'async function ro(e,t){return no(e,t,ja)}';
const workerFactoryReplacement = 'function Gr(){throw Error(`条码识别 Worker 只能在 offscreen 页面中启动`)}';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeRelativePath(relativePath) {
  const normalized = path.posix.normalize(
    String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '')
  );
  assert(
    normalized && normalized !== '.' && normalized !== '..'
      && !normalized.startsWith('../') && !path.posix.isAbsolute(normalized),
    `Invalid generated support path: ${relativePath}`
  );
  return normalized;
}

function filePath(baseDir, relativePath) {
  return path.join(baseDir, ...normalizeRelativePath(relativePath).split('/'));
}

function copyRelative(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const source = filePath(sourceDir, normalized);
  const target = filePath(targetDir, normalized);
  assert(fs.existsSync(source), `Missing generated support file: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function resolveLocalReference(importerPath, reference, allowBareRelative = false) {
  const value = String(reference || '').trim().replaceAll('\\', '/');
  if (!value || value.startsWith('#') || value.startsWith('//')
    || /^[a-z][a-z\d+.-]*:/i.test(value)) return null;

  const cleanPath = value.split(/[?#]/, 1)[0];
  if (!cleanPath) return null;
  if (cleanPath.startsWith('/')) return normalizeRelativePath(cleanPath);
  if (cleanPath.startsWith('./') || cleanPath.startsWith('../')) {
    return normalizeRelativePath(path.posix.join(path.posix.dirname(importerPath), cleanPath));
  }
  if (/^(?:chunks|assets)\//.test(cleanPath)) return normalizeRelativePath(cleanPath);
  if (allowBareRelative) {
    return normalizeRelativePath(path.posix.join(path.posix.dirname(importerPath), cleanPath));
  }
  return null;
}

function collectReferencedFiles(text, importerPath) {
  const references = new Set();
  const add = (reference, allowBareRelative = false) => {
    const resolved = resolveLocalReference(importerPath, reference, allowBareRelative);
    if (resolved) references.add(resolved);
  };

  for (const match of text.matchAll(/["'`](\/?(?:chunks|assets)\/[^"'`]+)["'`]/g)) {
    add(match[1]);
  }
  for (const match of text.matchAll(/\bfrom\s*["'`]([^"'`]+)["'`]/g)) {
    add(match[1]);
  }
  for (const match of text.matchAll(/\bimport\s*(?:\(\s*)?["'`]([^"'`]+)["'`]/g)) {
    add(match[1]);
  }

  const extension = path.posix.extname(importerPath).toLowerCase();
  if (extension === '.html' || extension === '.htm') {
    for (const match of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
      add(match[1], true);
    }
  }
  if (extension === '.css') {
    for (const match of text.matchAll(/\burl\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
      add(match[1], true);
    }
  }
  return [...references];
}

function isTextDependency(relativePath) {
  return ['.css', '.htm', '.html', '.js', '.json', '.mjs'].includes(
    path.posix.extname(relativePath).toLowerCase()
  );
}

function copyDependencyClosure(entryPaths) {
  const queue = entryPaths.map(normalizeRelativePath);
  const visited = new Set();

  for (let index = 0; index < queue.length; index += 1) {
    const relativePath = normalizeRelativePath(queue[index]);
    if (visited.has(relativePath)) continue;
    const source = filePath(sourceDir, relativePath);
    assert(fs.existsSync(source), `Missing generated support file: ${relativePath}`);

    copyRelative(relativePath);
    visited.add(relativePath);
    if (!isTextDependency(relativePath)) continue;

    const fileText = fs.readFileSync(source, 'utf8');
    for (const dependency of collectReferencedFiles(fileText, relativePath)) {
      if (!visited.has(dependency)) queue.push(dependency);
    }
  }
  return [...visited];
}

function verifyCopiedDependencies(relativePaths) {
  for (const relativePath of relativePaths) {
    const source = filePath(sourceDir, relativePath);
    const target = filePath(targetDir, relativePath);
    assert(fs.existsSync(target), `Secondary output is missing dependency: ${relativePath}`);
    assert(
      fs.readFileSync(source).equals(fs.readFileSync(target)),
      `Secondary dependency differs from generated source: ${relativePath}`
    );
  }
}

assert(fs.existsSync(sourceDir), `Missing source output: ${sourceDir}`);
assert(fs.existsSync(targetDir), `Missing secondary output: ${targetDir}`);

const copiedFiles = copyDependencyClosure([
  'barcode-offscreen.html',
  'barcode-offscreen-client.js'
]);
verifyCopiedDependencies(copiedFiles);

const manifestPath = path.join(targetDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
if (!manifest.permissions.includes('offscreen')) manifest.permissions.push('offscreen');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const backgroundPath = path.join(targetDir, 'background.js');
let background = fs.readFileSync(backgroundPath, 'utf8');
let backgroundPatched = false;

if (!background.startsWith(clientImport)) {
  const existingImport = background.indexOf(clientImport);
  if (existingImport >= 0) {
    background = `${background.slice(0, existingImport)}${background.slice(existingImport + clientImport.length)}`;
  }
  background = `${clientImport}${background}`;
  backgroundPatched = true;
}

if (!background.includes(bridgeMarker)) {
  const start = background.indexOf('function no(');
  const end = background.indexOf('async function ro(', start);
  assert(start >= 0 && end > start, 'Could not locate the secondary ZXing Worker function');
  const oldFunction = background.slice(start, end);
  assert(oldFunction.includes('new Gr'), 'Secondary ZXing Worker function no longer matches the expected snapshot');
  assert(oldFunction.includes('BARCODE_WASM_TIMEOUT'), 'Secondary timeout handling marker is missing');

  const replacement = 'async function no(e,t,n){if(typeof globalThis.FormPilotBarcodeOffscreenDecode!=`function`)throw Z(`条码识别离屏服务未加载，请重新加载扩展后重试。`,`BARCODE_OFFSCREEN_UNAVAILABLE`);try{return await globalThis.FormPilotBarcodeOffscreenDecode(e,t,n)}catch(e){throw Z(La(e),e?.code||`BARCODE_WORKER_DECODE_FAILED`,e)}}';
  background = `${background.slice(0, start)}${replacement}${background.slice(end)}`;
  backgroundPatched = true;
}

if (!background.includes(patchedTimeoutFunction)) {
  assert(background.includes(originalTimeoutFunction), 'Could not locate the secondary ZXing timeout function');
  background = background.replace(
    originalTimeoutFunction,
    patchedTimeoutFunction
  );
  backgroundPatched = true;
}

const workerFactoryPattern = /function Gr\(e\)\{return new Worker\((`\/assets\/barcodeZxingWorker-[^`]+\.js`),\{name:e\?\.name\}\)\}/;
if (workerFactoryPattern.test(background)) {
  background = background.replace(workerFactoryPattern, workerFactoryReplacement);
  backgroundPatched = true;
}

if (backgroundPatched) {
  fs.writeFileSync(backgroundPath, background, 'utf8');
}

const verifiedBackground = fs.readFileSync(backgroundPath, 'utf8');
const verifiedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert(verifiedBackground.startsWith(clientImport), 'Secondary background is missing the offscreen client import');
assert(verifiedBackground.includes(bridgeMarker), 'Secondary background is missing the offscreen decode bridge');
assert(verifiedBackground.includes(patchedTimeoutFunction), 'Secondary background has the wrong ZXing timeout');
assert(!verifiedBackground.includes('new Worker(`/assets/barcodeZxingWorker-'), 'Secondary background still starts a nested Worker');
assert(verifiedManifest.permissions.includes('offscreen'), 'Secondary manifest is missing the offscreen permission');
verifyCopiedDependencies(copiedFiles);

console.log(JSON.stringify({
  ok: true,
  targetDir,
  copiedFiles,
  backgroundPatched,
  offscreenPermission: true
}, null, 2));
