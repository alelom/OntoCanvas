# CLAUDE.md

Guidance for working in this repository. These rules are distilled from `.cursor/rules/` (which remain the source of truth) plus verified facts about the codebase.

## What this project is

**OntoCanvas** — an interactive, browser-only ontology editor and visualizer (`package.json` name: `ontology-editor`). It loads any RDF format and lets users edit a class/relationship graph visually, then save as Turtle.

- **Static web app**, deployed to **GitHub Pages**. Users can **never** run an extra service (proxy, backend, etc.). **Do not propose solutions that require a server.**
- **Tech stack:** Vite (build) · TypeScript · `rdf-parse` (multi-format parsing) · N3.js (in-memory store) · `rdflib` (serialization fallback) · `vis-network` (graph rendering).
- Python (`uv`) is used only for the Cursor-recovery / inspection scripts under `scripts/`, not the app.

## Commands

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # vite build → dist/  (NOTE: no tsc typecheck in build)
npm run test         # vitest run (unit)
npm run test:watch   # vitest watch
npm run test:e2e     # vitest run -c vitest.e2e.config.ts (Playwright-driven)
```

> `npm run build` does **not** run `tsc`, so type errors do not fail the build. Don't rely on the build to catch type mistakes — check types deliberately.

## Architecture: the save pipeline (the hard part)

**Input can be any RDF format; output is always Turtle.** How the Turtle is produced depends on how the file was loaded:

- **Turtle loaded (`.ttl`) → minimal-diff, formatting-preserving save.** A custom serializer ([src/rdf/sourcePreservation.ts](src/rdf/sourcePreservation.ts)) keeps a source cache of the original file and rewrites only the lines an edit touches. Comments, blank lines, `#### … ####` dividers, property order, typed literals, `rdf:type` notation, and multi-line `rdfs:subClassOf` lists are preserved byte-for-byte where untouched. Pinned by [tests/unit/customSerializerTests/](tests/unit/customSerializerTests/).
- **Any other format / no source cache → `rdflib` standard serialization.** Valid Turtle, but original formatting/comments are not preserved.

The old N3-Writer "serialize-then-fix" approach was abandoned as architecturally fragile (see [.cursor/notes/cache-reconstruction-findings.md](.cursor/notes/cache-reconstruction-findings.md)). Don't reintroduce it.

## Working rules (non-negotiable)

1. **Keep `main.ts` thin.** [src/main.ts](src/main.ts) is ~9,300 lines and already too long. Put new logic in dedicated modules (`src/lib`, `src/ui`, `src/graph`, `src/workflows`, `src/rdf`, `src/utils`). When you touch code in `main.ts`, move logic *out* where reasonable. Pure, side-effect-free logic should live in its own file so it can be unit-tested directly.
2. **Every fix or feature gets a test — write it first.** Reproduce a bug with a failing test before fixing it, to lock in the regression guard.
3. **Prefer unit tests over E2E.** If logic can be tested with a direct function call (e.g. `parseRdfToGraph(content, opts)` + store queries), do that. Reserve E2E for genuine UI/rendering/workflow behavior. See [.cursor/rules/testing-priority.mdc](.cursor/rules/testing-priority.mdc).
4. **Run tests after every change and confirm they pass** (`npm run test`, and `npm run test:e2e` when UI is involved).
5. **Verify visual/editor changes by actually running the app** — screenshot or browser MCP, not just tests.
6. **Timeouts: ≤5s normally, 10s absolute max.** A test that needs >10s is almost never a timeout-tuning problem — it's a deeper bug, or it needs a full page refresh between E2E tests. **Never raise timeouts to make a test pass.**
7. **E2E-only helpers go in dedicated files**, never inside implementation files. If you find test-only code in an implementation file, move it out. The editor's test hook lives in [src/e2e/editorTestHook.ts](src/e2e/editorTestHook.ts) (exposed as `window.__EDITOR_TEST__`).
8. **Use `debugLog` / `debugWarn` / `debugError`** from [src/utils/debug.ts](src/utils/debug.ts) for diagnostics — never raw `console.log`. Debug output is opt-in (localhost, `?debug`, or `localStorage`).
9. **No no-op code.** Remove redundant code that doesn't change behavior.
10. **Early-return edge cases** before main logic (e.g. local-vs-external property prefix handling — return early for local properties so fallback logic can't mis-add a prefix).

## Testing conventions

- **Unit:** load fixtures with `readFileSync`, call parser/logic functions directly, assert on the returned data or store quads. Setup in [tests/unitSetup.ts](tests/unitSetup.ts). Good example: [tests/unit/labellableRootColor.test.ts](tests/unit/labellableRootColor.test.ts).
- **E2E:** [tests/e2e/testHelpers.ts](tests/e2e/testHelpers.ts) provides `loadTestFile`, `waitForGraphRender`, etc.; dev server is managed by `tests/e2e/globalSetup.ts`. Access app state through `window.__EDITOR_TEST__`. Be defensive about modal state (check visibility before clicking), launch browsers headless.
- **Fixtures** live in [tests/fixtures/](tests/fixtures/).

## Conventions

- Save is **Turtle-only**; loading supports any `rdf-parse` format.
- `BASE_IRI` (`http://example.org/aec-drawing-ontology#`) is a default base used for **newly created** terms. **Do not assume a loaded ontology uses it** — resolve a term's real URI from the store (see `getDataPropertyUriFromStore` in [src/parser.ts](src/parser.ts)) rather than concatenating `BASE_IRI + name`.
- Versioning/releases are automated via `semantic-release`; don't hand-edit the version in `package.json`.
