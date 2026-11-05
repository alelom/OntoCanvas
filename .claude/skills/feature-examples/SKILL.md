---
name: feature-examples
description: Use when preparing or opening a PR in OntoCanvas that adds a user-visible feature or fixes an important user-visible bug. Add small example ontologies (TTL) under examples/, pin them with a unit test, index them in examples/README.md, and put a "Try it" table in the PR body whose links open each example on a local dev server (http://localhost:5173/?onto=<raw URL>). Skip it for minor fixes, refactors, test-only, CI or docs changes.
---

# Example ontologies for feature PRs

OntoCanvas keeps a growing collection of example ontologies in [`examples/`](../../../examples/). Each one
shows a feature working, so reviewers can check a PR in their own browser with one click, and the
collection can later become a documentation page. **Every PR that adds a user-visible feature, or fixes an
important user-visible bug, adds to it.**

## When it applies

| Applies | Doesn't apply |
|---|---|
| New rendering, editing, parsing or display behaviour a user can see | Minor fixes (a typo, a small style tweak, an obvious one-liner) |
| An important bug fix that changes what the graph shows or what saving writes | Refactors, test-only changes, CI, dependency bumps, docs |

When in doubt, add one example. It costs a few minutes and the PR is easier to review.

## 1. Write the example

- **Where:** `examples/<area>/<name>.ttl`, where `<area>` is the feature family (`class-expressions/`,
  `restrictions/`, …). Reuse an existing area when the feature belongs there.
- **Size:** small and self-contained. Use one file per concept, plus an optional combined file that shows
  related concepts side by side.
- **Namespace:** `http://example.org/examples/<name>#`, with an `owl:Ontology` that has an `rdfs:label`.
  Use generic names only; this is a public repository (see the `tools:public-repo-hygiene` skill if it is
  available).
- **Header comment:** what the file demonstrates, the issue number, and **what the user should see**:
  expected labels, marks, modal text. The comment doubles as the description on the future docs page.
  Example:

  ```turtle
  # One OWL restriction of each kind (issue #63). Expected edge labels:
  #   Room → Wall         "∃∀ hasPart [1..*]"
  #   Building → Floor    "∀ hasFloor"
  ```

### An example that needs a second file (an import)

When the feature reads another ontology (`owl:imports`), ship the pair side by side in the same folder and write the
child's import as a **relative IRI** (`owl:imports <parent.ttl>`). It resolves against wherever the child was opened
from, so the same example works from a branch, `main`, localhost or any server, with no URL to fix after merge. Declare
the namespace prefix with the parent's real absolute namespace, so the prefix matches. It needs the child opened **by
URL** (a file from disk has no base to resolve against); say so in the header. Pin it with a unit test that resolves the
import against a made-up base URL, and an E2E test that serves both files from routes (no network).

## 2. Pin it with a unit test

Add assertions to a `tests/unit/*Examples.test.ts` file. Use an existing one (`classExpressionExamples`,
`restrictionExamples`) or add one per area. Parse the file with `parseRdfToGraph` and assert what the
header comment promises: labels, groups, counts. That way the comment can't silently go stale.

## 3. Index it

Add a row to [`examples/README.md`](../../../examples/README.md): file, what it shows, issue/PR, source. The
README is the durable index. The file name links to the deployed editor opening the file from `main`, so a
click shows the example; the **TTL** column links to the file itself (repo-relative):

```js
const open = (path) => `https://alelom.github.io/OntoCanvas/?onto=${encodeURIComponent(
  `https://raw.githubusercontent.com/alelom/OntoCanvas/main/examples/${path}`)}`;
// | [name.ttl](${open('area/name.ttl')}) | What it shows | #N | [TTL](area/name.ttl) |
```

The editor link works once the PR is merged to `main`; during review, use the PR links of step 4 (never the branch name: it stops working when the branch is deleted).

## 4. Add "Try it" to the PR body

Add a section like the one in PR #218 or #213:

```markdown
## Try it

Run `npm run dev` (port 5173), then click a link to load the example:

| Example | What to look for | Open on localhost |
|---|---|---|
| [restriction-kinds.ttl](https://raw.githubusercontent.com/alelom/OntoCanvas/refs/pull/<N>/head/examples/restrictions/restriction-kinds.ttl) | `∀ hasFloor`, `⟲ knows`, … | [open](http://localhost:5173/?onto=<url-encoded raw URL>) |
```

**Address the files by the PR's own ref, `refs/pull/<N>/head`, never by the branch name and never by `main`.**

- A branch name stops working when the branch is deleted on merge: every "open" link in the description then fails with
  "Failed to fetch ontology" (this happened to the PRs up to #215, and their descriptions had to be rewritten).
- `main` does not have the file until the PR is merged.
- `refs/pull/<N>/head` works while the PR is open, after it is merged and after its branch is deleted (GitHub keeps it),
  always points at the PR's latest commit (nothing to refresh after another push), and has the PR number in it.
- GitHub's rendered `blob/` pages do **not** accept it (404), so the example's link is its raw address (plain text, which is
  what a TTL file is anyway). A rendered page of a file that is not an example (a `.ts`, a `.md`) uses the head commit instead:
  `https://github.com/alelom/OntoCanvas/blob/<full sha>/<path>`.

The PR number is only known once the PR exists: open the PR first, as a draft with the first commits (`gh pr create --draft`; see the `pr-ready` skill for when it becomes ready), then put the links in
(`gh pr edit <N> --body-file …`). The raw address must be URL-encoded inside `?onto=`. Generate the links rather than writing
them by hand:

```js
const pr = 218; // the number of the PR, once it exists
const raw = (path) => `https://raw.githubusercontent.com/alelom/OntoCanvas/refs/pull/${pr}/head/${path}`;
const open = (path) => `http://localhost:5173/?onto=${encodeURIComponent(raw(path))}`;
```

Don't write a closing word before an issue number in the PR body prose ("closed #102", "resolved #102", "fixes #102"): GitHub reads it as a closing keyword and will close that issue on merge. Check what it registered: `gh pr view <n> --json closingIssuesReferences`.

Push the branch **before** sharing the links: the PR ref follows the branch while the PR is open. The README index (the `main`
links of step 3) is the lasting reference once the PR is merged.

## 5. Check before handing over

- Every address in the PR body answers HTTP 200, the raw example links and the ones inside `?onto=` (decoded) alike:
  `curl -s -o /dev/null -w "%{http_code}" -L <raw URL>`. A link that is right today and wrong after the merge is the failure to
  look for: the PR ref is the form that stays right, so a branch name in the body is a defect.
- Each example opens in the running dev server and shows what its comment promises. Take a screenshot.
- The examples test passes.
- After the merge, open one link from the description: it must still load.

If a description of an earlier PR has a dead example link (a branch name), rewrite it the same way: replace the branch name in
the raw address with `refs/pull/<N>/head`, in the encoded form inside `?onto=` too, and check the new address answers 200.
