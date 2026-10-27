#!/usr/bin/env node
/**
 * Raises (or updates) the GitHub issue for a failed "Main verification" run (#174, #175).
 *
 *   node scripts/ci/reportMainFailure.mjs <results-dir> [--dry-run]
 *
 * Environment: GH_TOKEN, GITHUB_REPOSITORY, SHA (the commit that failed), RUN_URL, EVENT (push, schedule or
 * workflow_dispatch). <results-dir> holds the `{ name, label, status }` files the verification jobs recorded.
 *
 * One open issue labelled `main-red` at a time: a later failure is added to it as a comment, not as a duplicate.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const LABEL = 'main-red';

const EVENT_TEXT = { push: 'a push to main', schedule: 'the nightly run', workflow_dispatch: 'a manual run, or the one the auto-merge starts' };

/**
 * @param {{ sha: string, runUrl: string, event: string, failed: {label: string, status: string}[], pr?: {number: number, title: string} | null, author?: string | null }} input
 * @returns {{ title: string, body: string }}
 */
export function buildReport({ sha, runUrl, event, failed, pr = null, author = null }) {
  const short = sha.slice(0, 7);
  const names = failed.map((f) => f.label);
  const what = names.length === 0 ? 'the verification' : names.length <= 3 ? names.join(', ') : `${names.length} jobs`;
  const title = `Main is red: ${what} failed at ${short}`;
  const lines = [
    'The post-merge verification of `main` failed, so this commit was **not released or deployed**.',
    '',
    `- Commit: \`${short}\`${author ? ` by @${author}` : ''}`,
    ...(pr ? [`- Merged by: #${pr.number}, ${pr.title}`] : []),
    `- Trigger: ${EVENT_TEXT[event] ?? event}`,
    `- Run: ${runUrl}`,
    '',
    '## What failed',
    '',
    ...(failed.length
      ? failed.map((f) => `- ${f.label}: ${f.status}`)
      : ['- A job failed before it could record a result (for example the install or the build). Open the run to see which.']),
    '',
    '## What to do',
    '',
    'Fix `main` or revert the change. The next push to `main` is verified again, and released and deployed when it is green. ' +
      'The area names are the ones in `tests/e2e/areas.json`; `npm run test:e2e:area -- <area>` runs one locally.',
    '',
    'This issue was opened automatically by the "Main verification" workflow.',
  ];
  return { title, body: lines.join('\n') };
}

/** The results that are not a success. */
export function failedResults(results) {
  return results.filter((r) => r.status !== 'success');
}

function gh(args, input) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}

function main(argv) {
  const [dir] = argv.filter((a) => !a.startsWith('--'));
  const dryRun = argv.includes('--dry-run');
  if (!dir) { console.error('usage: reportMainFailure.mjs <results-dir> [--dry-run]'); return 2; }
  const { GITHUB_REPOSITORY: repo, SHA: sha, RUN_URL: runUrl, EVENT: event = 'push' } = process.env;
  if (!sha || !runUrl || (!repo && !dryRun)) { console.error('SHA, RUN_URL and GITHUB_REPOSITORY must be set'); return 2; }

  const results = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  const failed = failedResults(results);

  let pr = null;
  let author = null;
  if (!dryRun) {
    try {
      const pulls = JSON.parse(gh(['api', `repos/${repo}/commits/${sha}/pulls`]));
      if (pulls[0]) pr = { number: pulls[0].number, title: pulls[0].title };
      author = JSON.parse(gh(['api', `repos/${repo}/commits/${sha}`])).author?.login ?? null;
    } catch (error) {
      console.warn(`Could not look up the pull request or author: ${error.message}`);
    }
  }
  const { title, body } = buildReport({ sha, runUrl, event, failed, pr, author });
  if (dryRun) { console.log(JSON.stringify({ title, body }, null, 2)); return 0; }

  const open = JSON.parse(gh(['issue', 'list', '--repo', repo, '--label', LABEL, '--state', 'open', '--json', 'number', '--limit', '1']));
  if (open[0]) {
    gh(['issue', 'comment', String(open[0].number), '--repo', repo, '--body-file', '-'], `Still red: ${title}\n\n${body}`);
    console.log(`Commented on #${open[0].number}`);
    return 0;
  }
  try {
    gh(['label', 'create', LABEL, '--repo', repo, '--color', 'B60205', '--description', 'The post-merge verification of main failed']);
  } catch {
    // the label already exists
  }
  console.log(gh(['issue', 'create', '--repo', repo, '--title', title, '--label', LABEL, '--body-file', '-'], body).trim());
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
