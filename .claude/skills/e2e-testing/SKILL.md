---
name: e2e-testing
description: Use when writing, changing or debugging OntoCanvas E2E tests (tests/e2e, Playwright through Vitest), or when E2E tests are flaky, slow, time out on page.goto, or fail only in a full run. Covers how browsers are launched (network isolation), what to wait for, how the test server is started and stopped, and how to measure flakiness before and after a fix.
---

# E2E tests in OntoCanvas

The E2E suite is Playwright driven from Vitest (`npm run test:e2e`). Up to 8 test files run at once, each with its own
browser, against one server. Flakiness here is almost always **load, the network, or a wait for the wrong thing**, not
a bug in one test. These are the rules that came out of fixing it (#116).

## Launch browsers with `launchBrowser()`, never `chromium.launch()`

`tests/e2e/browser.ts` returns Chromium whose every context aborts all requests to anywhere but the dev server. Fixtures
`owl:imports` real URLs (w3id.org, purl.org, …) and the app reads imports in the background, so a test with the network
open depended on other people's servers: slow or unreachable on a laptop, reachable on CI, and landing at an unpredictable
moment (a redraw between selecting a node and deleting it broke `deleteUndoRelationshipCount` on CI only).

- A test that needs a URL to answer registers **its own route** (`page.route` / `context.route`, or
  `serveOntologies(page, dir, extra)` for ontology files). A route registered later takes precedence over the default
  block, which is why the block is installed when the context is created, not by each test afterwards.
- Don't call a "block external requests" helper in a test: it was removed, because registered late it **overrides the
  test's own earlier routes**.
- `tests/e2e/networkIsolation.e2e.test.ts` pins this. If a new way of creating contexts is added, cover it there.

## Wait for an outcome, never for time, and never swallow a wait

- `waitForAppReady(page)` is the "a test may act now" signal: an ontology is loaded, no dialog covers the page, the view
  has settled **and the declarations of the imports have been read** (they are read in the background and may redraw,
  which clears the selection). After a load, call it; don't sleep.
- A helper that waits for text and does `.catch(() => undefined)` hides a wrong expectation and **costs the whole timeout
  on every run** (four tests took 6 s instead of 1.5 s because they waited for `hasProperty` while the menu says
  `has property`). Let the wait fail, with a message that shows the actual text. A test that only wants to look at a menu
  reads it without waiting.
- Timeouts: 5 s normally, 10 s absolute maximum, and **never raise one to make a test pass**. A test over 5 s *alone* is
  a bug (find the wait it is burning); a page load that times out only in a full run means too much load, so reduce the
  load rather than the strictness.

## The server

`tests/e2e/globalSetup.ts` uses a server that already answers on 5173 (e.g. your `npm run dev`). Otherwise it **builds
the production bundle and serves it** (`vite preview`), because with 8 browsers loading at once the dev server's hundreds
of unbundled module requests per page made a load take about 2.5 s (worst 2.9) against about 1.0 s (worst 1.6): page
loads timing out was the commonest flake. `EDITOR_E2E_SERVER=dev` starts the dev server instead.

- **The tests run against the built app**, so page code must not `import('/src/…')`: that path exists only on Vite's dev server
  (a test that did failed with "Failed to fetch dynamically imported module"). Reach app code through the test hook
  (`window.__EDITOR_TEST__`, `src/e2e/editorTestHook.ts`, which is in the bundle). Values a test needs from `src/` in the
  *Node* side of the test (`import { X } from '../../src/…'`) are fine.
- **Vitest has no `globalTeardown` option** (that is Jest's). A global setup *returns* its teardown function. The old
  teardown file never ran, so servers lingered. A server left on 5173 is silently reused by the next run, with whatever
  build it had: if a run behaves strangely, check what is listening on 5173 first.
- On Windows, killing the recorded `npm` process leaves the server child running: kill the tree (`taskkill /T /F`).
- Don't pipe a test run into `head`: closing the pipe kills Vitest before it runs the teardown.
- Editing `src/` or `tests/` while a run is going changes what that run tests (the dev server reloads pages, Vitest
  re-reads files for the next run).

## Measure flakiness; don't guess

`npm run test:e2e:flake -- 8 --out report.json` runs the whole suite N times and reports, per test, how often it failed
and how long it took, plus how many runs were fully clean. A test that fails in some runs and passes in others is flaky;
one that passes alone and fails in the full run is a load problem. Take a baseline **before** changing anything, change
one thing, measure again on an otherwise idle machine, and compare. A single clean run proves nothing: the suite was
clean 3 runs in a row before it failed 3 in a row, with the same code.

The numbers that mattered: baseline 4 of 8 runs clean; the failures were mostly `page.goto: Timeout 5000ms exceeded`.
