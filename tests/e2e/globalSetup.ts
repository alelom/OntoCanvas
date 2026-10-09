/**
 * E2E global setup: ensure a server is running at EDITOR_URL before any e2e tests.
 *
 * A server that already answers is used as it is (a developer's `npm run dev`). Otherwise one is
 * started here and stopped when the run is over, and by default it serves the production build, not Vite's dev server:
 * every test opens its own page, and with up to 8 browsers at once the dev server's hundreds of unbundled
 * module requests per page load made loads take about 2.5 s (worst 2.9 s) where the bundle takes about 1.0 s
 * (worst 1.6 s); page loads timing out was the commonest flake (#116). The bundle is built fresh each time, so it
 * can't be stale. EDITOR_E2E_SERVER=dev starts the dev server instead (then warmed up, to pre-populate Vite's
 * module cache and avoid cold-start timeouts in the tests' beforeAll hooks).
 */
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const EDITOR_URL = process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const POLL_MS = 500;
const STARTUP_TIMEOUT_MS = 10000; // server startup; max 10s per project rule
// Building the bundle is a one-off step before any test runs, not a test or a wait: it takes about 15 s.
const BUILD_TIMEOUT_MS = 120000;
const SERVER_KIND = process.env.EDITOR_E2E_SERVER === 'dev' ? 'dev' : 'preview';
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

/** Kill `pid` and everything it started. The recorded process is the `npm` that started the server, which has the
 * server as a child: killing only the parent leaves the server running (on Windows always). */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM'); // started detached, so it leads its own process group
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

/**
 * Vitest runs the function a global setup returns when the run is over (it has no separate teardown option), so
 * the server this started is stopped here. Nothing is returned when a server was already running: that one is
 * not ours to stop.
 */
export default async function globalSetup(): Promise<(() => void) | void> {
  if (await isServerUp(EDITOR_URL)) {
    // Server was already running (e.g., a manual start).
    // Assume it is already warm; no warmup needed.
    return;
  }
  const root = process.cwd();
  const isWindows = process.platform === 'win32';
  const npm = isWindows ? 'npm.cmd' : 'npm';
  if (SERVER_KIND === 'preview') {
    // Always build: serving an old bundle would test code that is no longer there.
    const build = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'ignore', shell: isWindows, timeout: BUILD_TIMEOUT_MS });
    if (build.status !== 0) {
      throw new Error(`E2E globalSetup: "npm run build" failed (exit ${build.status}); the tests need the built app`);
    }
  }
  const port = new URL(EDITOR_URL).port || '80';
  const serverArgs = SERVER_KIND === 'dev' ? ['run', 'dev'] : ['run', 'preview', '--', '--port', port, '--strictPort'];
  const child = spawn(npm, serverArgs, {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    shell: isWindows,
  });
  child.unref();
  const pid = child.pid;
  const stop = (): void => {
    if (pid != null) killTree(pid);
  };
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    if (await isServerUp(EDITOR_URL)) {
      // A dev server was just started — warm it up so test beforeAll hooks don't hit cold-start timeouts.
      if (SERVER_KIND === 'dev') await warmupServer(EDITOR_URL);
      return stop;
    }
  }
  stop();
  throw new Error(`E2E globalSetup: the ${SERVER_KIND} server did not become ready at ${EDITOR_URL} within ${STARTUP_TIMEOUT_MS / 1000}s`);
}
