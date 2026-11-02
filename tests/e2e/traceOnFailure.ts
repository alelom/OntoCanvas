/**
 * A Playwright trace of each E2E test that fails, for the tests that ask for it (#209): the screen at each step, the DOM and
 * the actions, to open with `npx playwright show-trace <file>`. Nothing is kept for a test that passes. The traces go to
 * test-results/e2e-traces, which the E2E workflow uploads when a job fails.
 */
import { beforeEach, afterEach } from 'vitest';
import type { BrowserContext } from 'playwright';

export const TRACE_DIR = 'test-results/e2e-traces';

/** Call once inside a describe; `context` gives the browser context the tests of the describe run in (it may not exist yet when this is called). */
export function traceOnFailure(context: () => BrowserContext): void {
  const started = new WeakSet<BrowserContext>();

  beforeEach(async () => {
    const ctx = context();
    if (!started.has(ctx)) {
      await ctx.tracing.start({ screenshots: true, snapshots: true });
      started.add(ctx);
    }
    await ctx.tracing.startChunk();
  });

  afterEach(async ({ task }) => {
    const ctx = context();
    if (task.result?.state === 'fail') {
      const name = `${task.file.name.split('/').pop()}-${task.name}`.replace(/[^a-z0-9.]+/gi, '-').slice(0, 120);
      await ctx.tracing.stopChunk({ path: `${TRACE_DIR}/${name}.zip` });
    } else {
      await ctx.tracing.stopChunk();
    }
  });
}
