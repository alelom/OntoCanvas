/**
 * E2E global setup: start a server of its own for the run, and stop it when the run is over (#183).
 *
 * It is never a server that was already running: a developer's `npm run dev` on 5173 may serve another branch or a
 * state from before an install, and tests that reused it tested that instead of the code in the working tree. The
 * server gets a free port of its own (EDITOR_E2E_PORT asks for one), and the address is passed to the tests through
 * EDITOR_E2E_URL, set here before the workers start (see editorUrl.ts).
 *
 * By default it serves the production build, not Vite's dev server:
 * every test opens its own page, and with up to 8 browsers at once the dev server's hundreds of unbundled
 * module requests per page load made loads take about 2.5 s (worst 2.9 s) where the bundle takes about 1.0 s
 * (worst 1.6 s); page loads timing out was the commonest flake (#116). The bundle is built when a source is newer
 * than the last build this setup made (a run of one area then starts in seconds, not after a 40 s build), and
 * EDITOR_E2E_REBUILD=1 forces a build; see buildFreshness.ts. EDITOR_E2E_SERVER=dev starts the dev server instead (then warmed up, to pre-populate Vite's
 * module cache and avoid cold-start timeouts in the tests' beforeAll hooks).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { chromium } from 'playwright';
import { isDistFresh, writeStamp } from './buildFreshness';

const POLL_MS = 500;
const STARTUP_TIMEOUT_MS = 10000; // server startup; max 10s per project rule
// Building the bundle is a one-off step before any test runs, not a test or a wait: it takes 15 to 50 s.
const BUILD_TIMEOUT_MS = 120000;
const SERVER_KIND = process.env.EDITOR_E2E_SERVER === 'dev' ? 'dev' : 'preview';
const WARMUP_TIMEOUT_MS = 8000;   // Vite module cache warmup via headless browser

/** A port nothing is listening on, taken from the system. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, 'localhost', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

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
 * the server this started is stopped here.
 */
export default async function globalSetup(): Promise<() => void> {
  const requested = process.env.EDITOR_E2E_PORT;
  const port = requested ? Number(requested) : await freePort();
  const editorUrl = `http://localhost:${port}/`;
  if (requested && (await isServerUp(editorUrl))) {
    throw new Error(`E2E globalSetup: something already answers on port ${port} (EDITOR_E2E_PORT). The E2E tests start a server of their own and never reuse one; stop it or ask for another port.`);
  }
  process.env.EDITOR_E2E_URL = editorUrl;

  const root = process.cwd();
  const isWindows = process.platform === 'win32';
  const npm = isWindows ? 'npm.cmd' : 'npm';
  if (SERVER_KIND === 'preview') {
    // Build unless the bundle is current: serving an old bundle would test code that is no longer there.
    const { fresh, reason } = process.env.EDITOR_E2E_REBUILD ? { fresh: false, reason: 'EDITOR_E2E_REBUILD is set' } : isDistFresh(root);
    if (fresh) {
      console.log(`E2E globalSetup: reusing dist/ (${reason}); set EDITOR_E2E_REBUILD=1 to build anyway`);
    } else {
      console.log(`E2E globalSetup: building (${reason})`);
      const startedAt = Date.now(); // before the build reads any source, so an edit during it is not missed
      const build = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'ignore', shell: isWindows, timeout: BUILD_TIMEOUT_MS });
      if (build.status !== 0) {
        throw new Error(`E2E globalSetup: "npm run build" failed (exit ${build.status}); the tests need the built app`);
      }
      writeStamp(root, startedAt);
    }
  }
  const serverArgs = SERVER_KIND === 'dev' ? ['run', 'dev', '--', '--port', String(port), '--strictPort'] : ['run', 'preview', '--', '--port', String(port), '--strictPort'];
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
    if (await isServerUp(editorUrl)) {
      // A dev server was just started: warm it up so test beforeAll hooks don't hit cold-start timeouts.
      if (SERVER_KIND === 'dev') await warmupServer(editorUrl);
      return stop;
    }
  }
  stop();
  throw new Error(`E2E globalSetup: the ${SERVER_KIND} server did not become ready at ${editorUrl} within ${STARTUP_TIMEOUT_MS / 1000}s`);
}
