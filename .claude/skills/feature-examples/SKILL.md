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

The editor link works once the PR is merged to `main`; during review, use the branch links of step 4.

## 4. Add "Try it" to the PR body

Add a section like the one in PR #69 or #74:

```markdown
## Try it

Run `npm run dev` (port 5173), then click a link to load the raw TTL from this branch:

| Example | What to look for | Open on localhost |
|---|---|---|
| [restriction-kinds.ttl](https://github.com/alelom/OntoCanvas/blob/<branch>/examples/restrictions/restriction-kinds.ttl) | `∀ hasFloor`, `⟲ knows`, … | [open](http://localhost:5173/?onto=<url-encoded raw URL>) |
```

The raw URL is `https://raw.githubusercontent.com/alelom/OntoCanvas/<branch>/<path>`. It must be
URL-encoded inside `?onto=`. Generate the links rather than writing them by hand:

```js
const raw = (path) => `https://raw.githubusercontent.com/alelom/OntoCanvas/${branch}/${path}`;
const open = (path) => `http://localhost:5173/?onto=${encodeURIComponent(raw(path))}`;
```

Push the branch **before** sharing the links. Raw links point at the branch, so they work during review and
stop working once the branch is deleted after merge. The README index is the lasting reference.

## 5. Check before handing over

- Every raw URL returns HTTP 200: `curl -s -o /dev/null -w "%{http_code}" <raw URL>`.
- Each example opens in the running dev server and shows what its comment promises. Take a screenshot.
- The examples test passes.
