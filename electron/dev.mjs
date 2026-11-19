/**
 * Starts the Vite dev server (if not already up on 127.0.0.1:5317) and opens the Electron desktop window
 * pointed at http://127.0.0.1:5317/play/. Closes Vite when the window exits.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV_URL = 'http://127.0.0.1:5317/play/';
const require = createRequire(import.meta.url);

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

let viteProc = null;
if (!(await probe(DEV_URL))) {
  const viteBin = path.join(ROOT, 'node_modules/vite/bin/vite.js');
  viteProc = spawn(process.execPath, [viteBin], { cwd: ROOT, stdio: 'inherit' });
  const deadline = Date.now() + 30_000;
  while (!(await probe(DEV_URL))) {
    if (Date.now() > deadline) {
      viteProc.kill('SIGTERM');
      console.error('Timed out waiting for Vite dev server on', DEV_URL);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

const electronBin = require('electron');
const appProc = spawn(electronBin, ['.'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, KP_DEV_URL: DEV_URL },
});

const cleanup = () => {
  if (viteProc && !viteProc.killed) viteProc.kill('SIGTERM');
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

appProc.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
