/**
 * Selects which unit tests to run for a change (#175).
 *
 *   node scripts/unitSelect.mjs --changed --run              the tests that import what changed against origin/main
 *   node scripts/unitSelect.mjs --changed --json             print the selection (for CI)
 *   node scripts/unitSelect.mjs --changed --base <ref>       against another base
 *
 * Unit tests, unlike the E2E tests, have an import graph, so Vitest's `related` selects the tests that import a changed
 * file, with no map to keep. tests/unitSelect.json covers what the graph cannot see: a test reading a file from disk.
 * The whole suite is `npm test`, and it always runs on main after a merge.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { changedFiles, matchesPattern } from './e2eSelect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const norm = (f) => f.replace(/\\/g, '/').replace(/^\.\//, '');
const matchesAny = (file, patterns) => patterns.some((p) => matchesPattern(file, p));

export function loadConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'tests', 'unitSelect.json'), 'utf8'));
}

/**
 * What a set of changed files selects.
 * @returns {{ full: boolean, files: string[], why: Record<string, string[]> }}
 *   `files`: the files to hand to `vitest related` (changed sources and tests, plus the tests that read the repo);
 *   `why`: `*` for a full run, else the changed files that selected nothing because they are ignored.
 */
export function selectUnit(changed, config) {
  const files = new Set();
  const why = { '*': [], ignored: [] };
  let full = false;

  for (const raw of changed) {
    const f = norm(raw);
    if (matchesAny(f, config.full)) { full = true; why['*'].push(f); continue; }
    for (const [pattern, tests] of Object.entries(config.reads)) if (matchesPattern(f, pattern)) tests.forEach((t) => files.add(t));
    if (matchesAny(f, config.ignore)) { why.ignored.push(f); continue; }
    files.add(f);
  }
  if (!full && files.size > 0) config.alwaysRun.forEach((t) => files.add(t));
  return { full, files: full ? [] : [...files].sort(), why };
}

function runVitest(args) {
  const r = spawnSync('npx', ['vitest', ...args], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status ?? 1;
}

function main(argv) {
  const flag = (n) => argv.includes(n);
  const value = (n) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };
  if (!flag('--changed') && !value('--base')) {
    console.error('Use --changed [--base <ref>] [--no-worktree]; add --run to run, --json to print for CI. The whole suite is `npm test`.');
    return 2;
  }
  const config = loadConfig();
  const selection = selectUnit(changedFiles(value('--base') ?? 'origin/main', { includeWorkingTree: !flag('--no-worktree') }), config);

  if (flag('--json')) { console.log(JSON.stringify({ full: selection.full, files: selection.files })); return 0; }
  if (selection.full) {
    console.log(`Every unit test: ${selection.why['*'].slice(0, 4).join(', ')}${selection.why['*'].length > 4 ? ', ...' : ''}`);
    return flag('--run') ? runVitest(['run']) : 0;
  }
  if (!selection.files.length) { console.log('No unit test depends on these changes; nothing to run.'); return 0; }
  console.log(`Unit tests that import or read: ${selection.files.length} file(s)`);
  for (const f of selection.files.slice(0, 12)) console.log(`  ${f}`);
  if (selection.files.length > 12) console.log(`  ... and ${selection.files.length - 12} more`);
  return flag('--run') ? runVitest(['related', '--run', '--passWithNoTests', ...selection.files]) : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
