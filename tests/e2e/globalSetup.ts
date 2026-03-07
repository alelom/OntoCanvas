/**
 * E2E global setup: ensure dev server is running at EDITOR_URL before any e2e tests.
 * If the server is not responding, start it automatically and wait until it is ready.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const EDITOR_URL = process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const PID_FILE = join(process.cwd(), '.e2e-dev-server-pid');
const POLL_MS = 500;
const STARTUP_TIMEOUT_MS = 10000; // dev server startup; max 10s per project rule

async function isServerUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  if (await isServerUp(EDITOR_URL)) {
    return;
  }
  const root = process.cwd();
  const isWindows = process.platform === 'win32';
  const child = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    shell: isWindows,
  });
  child.unref();
  const pid = child.pid;
  if (pid != null) {
    writeFileSync(PID_FILE, String(pid), 'utf8');
  }
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (await isServerUp(EDITOR_URL)) {
      return;
    }
  }
  if (pid != null && existsSync(PID_FILE)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
    try {
      unlinkSync(PID_FILE);
    } catch {
      // ignore
    }
  }
  throw new Error(`E2E globalSetup: dev server did not become ready at ${EDITOR_URL} within ${STARTUP_TIMEOUT_MS / 1000}s`);
}
