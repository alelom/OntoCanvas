---
name: pr-ready
description: Use when opening an OntoCanvas pull request or deciding whether it is a draft or ready for review - at the first push of a branch, when the implementation reaches its end, or while the type-check and the unit suite run. Says when to open a draft, when to open it ready directly, and when to run `gh pr ready`.
---

# Draft or ready: when to open and when to mark an OntoCanvas PR

CI runs nothing on a draft (`test.yml`: the type-check, the unit tests, the E2E areas and `Ready to merge` are skipped; only
the public-repo hygiene check runs). A ready PR runs them on every push. So the PR is a draft while the work is unfinished, and
ready as soon as the local checks say it is done. The two local checks that decide it are:

- `npm run typecheck`
- the **full** unit suite, `npx vitest run` (not only the files the change touches)

## The rule

| Where the work is | What to do |
|---|---|
| First push of a branch, implementation not finished | `gh pr create --draft`. The body starts with `Closes #<issue>` and lists what is still to do. |
| Implementation reached its end, the checks are **still running** | Do not wait for them to open the PR: if there is none yet, open it as a **draft** now (`gh pr create --draft`). Run the checks in the background while you write the body. |
| Implementation reached its end, the checks **passed** and there is **no PR yet** | Open it **ready** directly: `gh pr create` without `--draft`. Don't open a draft only to mark it ready a minute later. |
| The checks passed and the PR is a **draft** | `gh pr ready <N>` at once. Don't wait for anything else. |
| A check failed | Keep the PR a draft (or open one). Fix it and run both checks again. |
| Another round of work on a ready PR | `gh pr ready --undo <N>` first. Mark it ready again when the checks pass. |

"Implementation reached its end" means the code and its unit tests are written: the feature or fix does what the issue asks.
Work that is still to come on the same PR does not keep it a draft once the two checks pass. For example, an E2E test, the
example ontology, its "Try it" links (see the `feature-examples` skill), or the screenshot check. List that work in the body
under a heading such as "Still to do on this PR", and tick it off as it lands. Batch those pushes: every push to a ready PR
runs CI again.

Before handing a user-visible PR over, its body has the "Try it" table with an "Open on localhost" link on every row, so the
user can test it with one click per check (the `feature-examples` skill, step 4). Don't hand it over without them.

## How

```bash
# when the implementation reaches its end: start both checks, then write the PR body meanwhile
npm run typecheck            # in the background
npx vitest run               # in the background, the whole suite
git push -u origin HEAD
gh pr create --draft --title "<conventional title>" --body-file <body.md>   # no --draft if both already passed
# both green:
gh pr ready <N>
```

- Report what the run showed, with its counts ("270 files, 2612 tests passed"), in the PR body's verification section. Never
  give counts from memory or from an earlier run.
- A failure in a file the change does not touch is still a failure: find out whether it is a known load flake (run that file
  alone; see the `e2e-testing` skill for E2E) before you call it unrelated, and say so in the body.
- Don't mark a PR ready "to see what CI says": the local run is the check. The E2E areas the change selects run in CI on the
  ready PR, and the whole E2E suite runs on `main` after the merge.
- "Re-run all jobs" on a run that started while the PR was a draft skips the jobs again (the re-run reuses the draft event). Mark
  the PR ready, or push, for a fresh run.
