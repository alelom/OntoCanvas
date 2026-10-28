# E2E tests

Playwright drives the built app in Chromium. The tests are grouped into **areas**, one per feature, so a change runs
only the tests that cover it.

## Running them

No server needs to be started: the global setup (`globalSetup.ts`) builds the app, serves it on a free port of its own and
stops it when the run is over. It never reuses a server that is already running, so a developer's `npm run dev` (on 5173 or
any port) is left alone and is not what the tests drive. The address reaches the tests through `EDITOR_E2E_URL`, set by the
setup and read in one place, `editorUrl.ts` (`EDITOR_URL`, `EDITOR_ORIGIN`); a test never spells a port (a unit test checks
it). `EDITOR_E2E_PORT` asks for a given port, and fails if something already answers on it.

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
- **Two runs can overlap** on one machine: each starts its own server on its own port (they share `dist/`, so a build by one while the other runs can disturb it).
- **Pull requests run only the selected areas**, and when they pass (with the unit tests they select) the pull request can
  merge. **The whole suite runs after the merge**, on `main`; green releases and deploys, red opens an issue
  automatically. See `.github/workflows/test.yml` and `main-verify.yml`.
- `npm run test:e2e:flake` measures how flaky the suite is.

## The areas

`areas.json` lists, for each area, its test files (`tests`) and the source modules that implement it (`sources`).

- A changed file selects the areas that list it **and the areas of the modules that import it** (read from the source, through
  chains of imports), so a shared module reaches the areas whose code uses it however it is listed. The shared hub modules in
  `everything` are not followed: a change to one of them selects **every** area, and a change below one does not go through it,
  since the whole suite runs after the merge. A file that no area lists, that nothing but a hub imports, and that `ignore` does not
  cover, selects every area.
- **Two hubs are precise instead (#190).** `typeOnly` files (`src/types.ts`) hold only types, so only the type check can break on
  them and they select nothing; a unit test checks that they hold no runtime code. `package.json` is compared with its version
  on the base: a new dependency selects the areas of the modules that import it, a change to the version or to a script that is
  not how the E2E tests are built or run selects nothing, and a dev dependency, a script like `build` or `test:e2e:*`, or any
  other field selects every area. The lock file follows `package.json`, and selects every area when it changed alone.
- **See why an area ran:** on a pull request, "Select E2E areas" writes a summary (every area, run or skipped, and the files that
  selected it; for "every area", which file did it), and every area is a check, a skipped one shown as skipped (#189).
  `node scripts/e2eSelect.mjs --changed --summary` prints the same locally.
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
