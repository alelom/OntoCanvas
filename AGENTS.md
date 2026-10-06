# AGENTS.md — OntoCanvas

Cross-agent guidance for **any** AI coding assistant (Claude Code, GitHub Copilot, Cursor,
and others) working in this repository. It is deliberately tool-neutral. Tool-specific
entry files point here:

- `CLAUDE.md` — Claude Code (also carries the detailed architecture/testing notes).
- `.cursor/rules/*.mdc` — Cursor.

**One home per fact.** This file owns the **contribution workflow**. The **architecture,
save pipeline, and testing conventions** live in [CLAUDE.md](CLAUDE.md) and
[.cursor/rules/](.cursor/rules/) — read them before touching code; don't duplicate them here.

## What this project is

**OntoCanvas** is a browser-only, static ontology editor/visualizer, deployed to **GitHub
Pages**. It loads any RDF format and saves Turtle. There is **no backend and no proxy** —
users can never run an extra service, so never propose solutions that require one.

## Contribution workflow (issue-first)

OntoCanvas is a **personal open-source project on GitHub** ([alelom/OntoCanvas](https://github.com/alelom/OntoCanvas)).

- **Issues and planning live on GitHub. There is no YouTrack, Jira, or other tracker** —
  do not reference one, and do not look for an internal issue ID. If you have seen a
  YouTrack-style workflow in another repository, it does **not** apply here.
- **Issue-first: every substantive change maps to a GitHub issue before code is written.**
  1. Find the existing issue the work belongs to, or
  2. If none exists, **search first** (`gh issue list --search "<terms>"`) to avoid
     duplicates, then **open one** describing the problem/goal before starting.
  3. Trivial, self-evident fixes (typo, obvious one-liner) can skip the issue — when in
     doubt, open one.
- **Branch** off `main`: `fix/<slug>`, `feat/<slug>`, or `chore/<slug>`.
- **Conventional Commits are required** — releases are automated by `semantic-release`,
  which derives the next version from commit messages. Use `fix:`, `feat:`,
  `chore:`, `test:`, `docs:`, etc. Do **not** hand-edit the version in `package.json`.
- **Open a PR that closes its issue.** Put a closing keyword on its **own line** in the PR
  **body** — `Closes #123` (one keyword, one issue, one line). A list after a single
  keyword (`Closes #1, #2`) only closes the first.
- **Feature PRs ship example ontologies.** A PR that adds a user-visible feature or fixes an
  important user-visible bug adds a small TTL under `examples/`, pins it with a unit test,
  indexes it in `examples/README.md`, and puts a "Try it" table of
  `http://localhost:5173/?onto=<raw URL>` links in the PR body. Not needed for minor fixes,
  refactors or test/CI/docs changes. Full procedure:
  [`.claude/skills/feature-examples/SKILL.md`](.claude/skills/feature-examples/SKILL.md).
- **Public repository.** Everything committed or written in an issue/PR is world-readable
  and permanent. Keep out internal tool names, client/project names, infrastructure detail,
  and internal ticket content.

## Core working rules (summary — see CLAUDE.md / .cursor for the full text)

- **Test-first, always.** Reproduce a bug with a failing test before fixing it; every fix
  or feature ships with tests. Prefer **unit tests** over E2E; reserve E2E for genuine
  UI/rendering/workflow behavior.
- **Run the tests and confirm they pass** after every change (`npm run test`, plus
  `npm run test:e2e` when UI is involved). Note: `npm run build` does **not** run `tsc`, so
  it won't catch type errors — check types deliberately.
- **Verify visual/editor changes by actually running the app** (screenshot or browser),
  not only via tests.
- **Keep `src/main.ts` thin** (it is already ~9,300 lines). Put new logic in dedicated
  modules (`src/lib`, `src/ui`, `src/graph`, `src/rdf`, `src/workflows`, `src/utils`);
  pure, side-effect-free logic goes in its own file so it can be unit-tested directly.
- **E2E-only helpers go in dedicated files**, never inside implementation files.
- **Use `debugLog` / `debugWarn` / `debugError`** from `src/utils/debug.ts` — never raw
  `console.log`.
- **Timeouts ≤5s normally, 10s absolute max.** A test needing >10s signals a deeper bug,
  not a timeout to raise.

## Commands

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # vite build → dist/  (no tsc typecheck)
npm run test         # vitest run (unit)
npm run test:e2e     # Playwright-driven E2E
```
