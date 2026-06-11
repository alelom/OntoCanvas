/**
 * E2E global setup: ensure dev server is running at EDITOR_URL before any e2e tests.
 * If the server is not responding, start it automatically and wait until it is ready.
 * After starting, perform a Playwright warmup to pre-populate Vite's module cache,
 * preventing cold-start timeouts in individual test beforeAll hooks.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const EDITOR_URL = process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const PID_FILE = join(process.cwd(), '.e2e-dev-server-pid');
const POLL_MS = 500;
const STARTUP_TIMEOUT_MS = 10000; // dev server startup; max 10s per project rule
const WARMUP_TIMEOUT_MS = 8000;   // Vite module cache warmup via headless browser

async function isServerUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Load the editor page once in a headless browser to warm Vite's TypeScript module
 * transformation cache. Without this, the first test to do page.goto on a freshly
 * started server will time out because Vite transforms all modules on the first request.
 */
async function warmupServer(url: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: WARMUP_TIMEOUT_MS });
  } catch {
    // Non-fatal: tests will still run; the first test's beforeAll may be slower.
  } finally {
    await page.close();
    await browser.close();
  }
}

export default async function globalSetup(): Promise<void> {
  if (await isServerUp(EDITOR_URL)) {
    // Server was already running (e.g., from a previous run or manual start).
    // Assume it is already warm; no warmup needed.
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
      // Server just started — warm it up so test beforeAll hooks don't hit cold-start timeouts.
      await warmupServer(EDITOR_URL);
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
