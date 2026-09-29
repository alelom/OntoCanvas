# CI scripts

## `check-internal-names.mjs` — public-repo hygiene guard

Fails the build if a tracked text file contains an internal-only name/pattern. Purpose: keep
internal infrastructure detail out of this **public** repository — private package feeds, internal
issue trackers, company email domains, client/project names, private hostnames and IP addresses.

### Run locally

```bash
npm run check:internal-names
```

Exit code `0` = clean, `1` = one or more matches (each printed as `file:line:col "match" (/pattern/i)`).

### Where patterns come from

| Source | What goes here |
|---|---|
| `scripts/ci/internal-names.config.json` (`patterns`) | **Generic, non-identifying** patterns only — safe to be world-readable (RFC1918 IPs, `*.internal`/`.corp`/`.lan` hosts, generic private-feed/tracker host shapes). |
| `INTERNAL_NAME_PATTERNS` env / CI secret | **Organisation-specific literals** — company email domain, internal feed/tracker org names, client names. Never committed. Separate multiple patterns with newlines or `;`. Each is a case-insensitive JS regex. |

Legitimate public references that must not trip the guard go in the config's `allow` list (e.g. the
public ADIRO ontology URLs). A line matching any `allow` pattern is skipped.

### CI

Runs on every pull request as the **Public-repo hygiene** job in `.github/workflows/test.yml`, with
`INTERNAL_NAME_PATTERNS` injected from the repository secret of the same name. The guard still works
without the secret (it falls back to the committed generic patterns).

### Configuring the secret

Repo → Settings → Secrets and variables → Actions → new secret `INTERNAL_NAME_PATTERNS`, e.g.:

```
[a-z0-9._%+-]+@<company-domain>\.com
\b<INTERNAL-FEED-ORG>\b
pkgs\.dev\.azure\.com
```

> Note: this guard prevents **new** leaks. Content already in git history is not removed by ignoring or
> deleting files — a history rewrite is a separate, heavier operation and is never fully reliable once
> published.
