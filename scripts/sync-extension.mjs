import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const sourceDir = path.join(rootDir, '.output', 'chrome-mv3');
const targetDir = path.join(rootDir, 'extension', 'chrome-mv3');

await fs.access(path.join(sourceDir, 'manifest.json'));
await fs.mkdir(path.dirname(targetDir), { recursive: true });
await fs.rm(targetDir, { recursive: true, force: true });
await fs.cp(sourceDir, targetDir, { recursive: true });

console.log(`Synced unpacked extension to ${path.relative(rootDir, targetDir)}`);
