# E2E tests

Playwright drives the built app in Chromium. The tests are grouped into **areas**, one per feature, so a change runs
only the tests that cover it.

## Running them

No server needs to be started: the global setup (`globalSetup.ts`) builds the app, serves it on `http://localhost:5173/`
and stops it when the run is over. A server that already answers on that port (a developer's `npm run dev`) is used as it
is, and then the tests run against the dev server, not a build.

```bash
npm run test:e2e:affected            # the areas your changes touch, against origin/main (and your uncommitted files)
npm run test:e2e:area -- search      # one or more areas, comma separated: search,embed
npm run test:e2e:areas               # list the areas and how many tests each has
npm run test:e2e:full                # the whole suite (also: npm run test:e2e)
npx vitest run -c vitest.e2e.config.ts tests/e2e/embedMode.e2e.test.ts   # one file
```

- **The build is reused** when no source is newer than the last build the setup made (`dist/.e2e-build.json`), so a small
  run starts in seconds instead of after a 40 to 50 s build. `EDITOR_E2E_REBUILD=1` forces a build. A `dist/` that
  the setup did not build is never trusted.
- **Two runs cannot overlap** on one machine: the tests use port 5173.
- **Pull requests run only the selected areas**, and when they pass (with the unit tests they select) the pull request can
  merge. **The whole suite runs after the merge**, on `main`; green releases and deploys, red opens an issue
  automatically. See `.github/workflows/test.yml` and `main-verify.yml`.
- `npm run test:e2e:flake` measures how flaky the suite is.

## The areas

`areas.json` lists, for each area, its test files (`tests`) and the source modules that implement it (`sources`).

- A changed file selects the areas that list it. A file in `everything`, or one that no area lists and `ignore` does not
  cover, selects **every** area: a missing entry costs time and never skips a test.
- **Adding an E2E test:** put its name (without `.e2e.test.ts`) in exactly one area. A unit test fails if a test file is in no
  area or in two, if a listed path no longer exists, or if the README's table of areas is out of date
  (`node scripts/e2eSelect.mjs --readme` prints the table to paste).
- **Adding or moving a source module:** list it under the area whose tests exercise it. If you do not, a change to it runs
  everything, which is safe.

## Writing a test

- Open a page with `launchBrowser()` from `browser.ts` (it blocks the real network), load an ontology with the helpers in
  `testHelpers.ts` (`openEditorWithTtl`, `loadTestFile`), and wait with `waitForAppReady` or on a condition. There are no
  fixed sleeps: wait for the outcome you expect.
- Reach the app through `window.__EDITOR_TEST__` (`src/e2e/editorTestHook.ts`).
- Timeouts are at most 5 s, 10 s at the very most. A test that needs more has a deeper problem.
- Prefer a unit test when the logic can be called directly; E2E is for what only the page can show.
