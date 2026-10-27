#!/usr/bin/env node
/**
 * Selects which E2E tests to run (#174, #175).
 *
 *   node scripts/e2eSelect.mjs --list                       the areas and their tests
 *   node scripts/e2eSelect.mjs --area search,embed --run    run those areas
 *   node scripts/e2eSelect.mjs --changed --run              run what the changes against origin/main touch
 *   node scripts/e2eSelect.mjs --changed --json             print the selection (for CI)
 *
 * The map is tests/e2e/areas.json. A changed file selects the areas that list it; a file the map does not place
 * selects every area, so a wrong or missing entry costs time, never a missed test. The full suite is
 * `npm run test:e2e`.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'tests', 'e2e', 'areas.json');
const TEST_RE = /^tests\/e2e\/([^/]+)\.e2e\.test\.ts$/;

export function loadConfig(path = CONFIG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const normalise = (file) => file.replace(/\\/g, '/').replace(/^\.\//, '');

/** A path pattern: `dir/` is a directory prefix, `**\/*.md` a glob, anything else an exact path. */
export function matchesPattern(file, pattern) {
  const f = normalise(file);
  if (pattern.endsWith('/')) return f.startsWith(pattern);
  if (pattern.includes('*')) {
    const re = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\//g, '\u0000')
      .replace(/\*/g, '[^/]*')
      .replace(/\u0000/g, '(?:.*/)?');
    return new RegExp(`^${re}$`).test(f);
  }
  return f === pattern;
}

const matchesAny = (file, patterns) => patterns.some((p) => matchesPattern(file, p));

/** The area that owns the test file `tests/e2e/<name>.e2e.test.ts`, or undefined. */
export function areaOfTest(name, config) {
  return Object.keys(config.areas).find((a) => config.areas[a].tests.includes(name));
}

/**
 * What a set of changed files selects.
 * @returns {{ all: boolean, areas: string[], reasons: Record<string, string[]>, ignored: string[], unplaced: string[] }}
 *   `reasons` says, per area (or `*` for everything), which files selected it.
 */
export function selectAreas(changedFiles, config) {
  const reasons = {};
  const add = (key, file) => (reasons[key] ??= []).push(file);
  const ignored = [];
  const unplaced = [];
  let all = false;

  for (const raw of changedFiles) {
    const file = normalise(raw);
    const testMatch = TEST_RE.exec(file);
    if (testMatch) {
      const owner = areaOfTest(testMatch[1], config);
      if (owner) add(owner, file);
      else { all = true; unplaced.push(file); add('*', file); }
      continue;
    }
    if (matchesAny(file, config.everything)) { all = true; add('*', file); continue; }
    const owners = Object.keys(config.areas).filter((a) => matchesAny(file, config.areas[a].sources));
    if (owners.length) { for (const a of owners) add(a, file); continue; }
    if (matchesAny(file, config.ignore)) { ignored.push(file); continue; }
    all = true;
    unplaced.push(file);
    add('*', file);
  }
  const areas = all ? Object.keys(config.areas) : Object.keys(config.areas).filter((a) => reasons[a]);
  return { all, areas, reasons, ignored, unplaced };
}

/** The test files of the given areas, as repo-relative paths. */
export function testFilesFor(areaNames, config) {
  return areaNames.flatMap((a) => config.areas[a].tests.map((t) => `tests/e2e/${t}.e2e.test.ts`));
}

// ---- command line

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : null;
}

/** Files changed since `base` (three-dot: the branch's own changes), plus uncommitted and untracked ones. */
export function changedFiles(base, { includeWorkingTree = true } = {}) {
  const committed = git(['diff', '--name-only', `${base}...HEAD`]);
  if (committed === null) throw new Error(`cannot diff against ${base}: is it fetched? (git fetch origin main)`);
  const extra = includeWorkingTree ? [...(git(['diff', '--name-only', 'HEAD']) ?? []), ...(git(['ls-files', '--others', '--exclude-standard']) ?? [])] : [];
  return [...new Set([...committed, ...extra])];
}

function describe(selection, config) {
  const lines = [];
  if (selection.all) lines.push('Every area: ' + (selection.reasons['*'] ?? []).slice(0, 6).join(', ') + ((selection.reasons['*'] ?? []).length > 6 ? ', ...' : ''));
  for (const a of selection.areas) {
    const why = selection.reasons[a];
    lines.push(`  ${a.padEnd(15)} ${config.areas[a].tests.length} tests${why ? '  <- ' + why.slice(0, 4).join(', ') + (why.length > 4 ? ', ...' : '') : ''}`);
  }
  if (selection.ignored.length) lines.push(`Ignored (no E2E test covers them): ${selection.ignored.length} file(s)`);
  return lines.join('\n');
}

function runVitest(files) {
  const args = ['vitest', 'run', '-c', 'vitest.e2e.config.ts', ...files];
  const r = spawnSync('npx', args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  return r.status ?? 1;
}

function main(argv) {
  const config = loadConfig();
  const flag = (name) => argv.includes(name);
  const value = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null; };

  if (flag('--list')) {
    for (const [name, a] of Object.entries(config.areas)) console.log(`${name.padEnd(15)} ${String(a.tests.length).padStart(2)} tests  ${a.description}`);
    console.log(`\n${Object.values(config.areas).reduce((n, a) => n + a.tests.length, 0)} tests in ${Object.keys(config.areas).length} areas`);
    return 0;
  }

  let selection;
  if (value('--area')) {
    const names = value('--area').split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = names.filter((n) => !config.areas[n]);
    if (unknown.length) { console.error(`Unknown area: ${unknown.join(', ')}. Known: ${Object.keys(config.areas).join(', ')}`); return 2; }
    selection = { all: false, areas: names, reasons: {}, ignored: [], unplaced: [] };
  } else if (flag('--changed') || value('--base')) {
    const base = value('--base') ?? 'origin/main';
    selection = selectAreas(changedFiles(base, { includeWorkingTree: !flag('--no-worktree') }), config);
  } else {
    console.error('Use --list, --area <a,b>, or --changed [--base <ref>]; add --run to run, --json to print for CI.');
    return 2;
  }

  const files = testFilesFor(selection.areas, config);
  if (flag('--json')) {
    console.log(JSON.stringify({ all: selection.all, areas: selection.areas, tests: files, ignored: selection.ignored }));
    return 0;
  }
  console.log(describe(selection, config));
  if (!selection.areas.length) { console.log('No E2E area is affected by these changes; nothing to run.'); return 0; }
  console.log(`\n${files.length} test file(s) in ${selection.areas.length} area(s)${selection.all ? ' (everything)' : ''}.`);
  return flag('--run') ? runVitest(selection.all ? [] : files) : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
