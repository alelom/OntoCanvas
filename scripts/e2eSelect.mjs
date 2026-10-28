/**
 * Selects which E2E tests to run (#174, #175).
 *
 *   node scripts/e2eSelect.mjs --list                       the areas and their tests
 *   node scripts/e2eSelect.mjs --area search,embed --run    run those areas
 *   node scripts/e2eSelect.mjs --changed --run              run what the changes against origin/main touch
 *   node scripts/e2eSelect.mjs --changed --json             print the selection (for CI)
 *   node scripts/e2eSelect.mjs --all --json                 every area (for CI)
 *   node scripts/e2eSelect.mjs --changed --summary          the selection explained, as Markdown (the job summary in CI)
 *
 * The map is tests/e2e/areas.json. A changed file selects the areas that list it, and the areas of the modules that
 * import it (a change to a shared module reaches the areas whose code uses it, however the map lists it). The shared hub
 * modules in `everything` are not followed: a change to one of those selects every area, and a change below one does not
 * go through it, since the whole suite runs after the merge. A file nothing places selects every area. The full suite is
 * `npm run test:e2e`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, posix } from 'node:path';

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

export const matchesAny = (file, patterns) => patterns.some((p) => matchesPattern(file, p));

/** The area that owns the test file `tests/e2e/<name>.e2e.test.ts`, or undefined. */
export function areaOfTest(name, config) {
  return Object.keys(config.areas).find((a) => config.areas[a].tests.includes(name));
}

// `from '...'` (import and re-export), `import('...')` and `import '...'`. A match inside a comment only adds an edge, which can
// select an area too many, never one too few.
const IMPORT_SPECIFIER = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s*['"]([^'"]+)['"]/g;

function sourceFiles(dir, root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, root);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [normalise(path.slice(root.length + 1))] : [];
  });
}

/**
 * Who imports whom under src/, read from the source with no dependency (the selection job in CI installs nothing).
 * @returns {(file: string) => string[]} the modules that import `file`, directly
 */
export function buildImporterGraph(root = ROOT) {
  const files = sourceFiles(join(root, 'src'), root);
  const known = new Set(files);
  const importers = new Map();
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(IMPORT_SPECIFIER)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec.startsWith('.')) continue;
      const base = posix.normalize(posix.join(posix.dirname(file), spec));
      const target = [`${base}.ts`, `${base}/index.ts`, base].find((c) => known.has(c));
      if (!target || target === file) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
    }
  }
  return (file) => [...(importers.get(normalise(file)) ?? [])];
}

/**
 * What a set of changed files selects.
 * @param {string[]} changedFiles
 * @param {object} config tests/e2e/areas.json
 * @param {(file: string) => string[]} [importersOf] who imports a module; without it only the map decides
 * @returns {{ all: boolean, areas: string[], reasons: Record<string, string[]>, ignored: string[], unplaced: string[] }}
 *   `reasons` says, per area (or `*` for everything), which files selected it.
 */
export function selectAreas(changedFiles, config, importersOf = () => []) {
  const reasons = {};
  const add = (key, file) => (reasons[key] ??= []).push(file);
  const ignored = [];
  const unplaced = [];
  let all = false;

  /** The areas of `file`, and of every module that imports it through other modules (the hubs in `everything` aside). */
  function ownersThroughImports(file) {
    const found = new Map(); // area -> the file that selected it
    const seen = new Set([file]);
    const queue = [file];
    while (queue.length) {
      const current = queue.shift();
      for (const area of Object.keys(config.areas)) {
        if (!found.has(area) && matchesAny(current, config.areas[area].sources)) found.set(area, current);
      }
      for (const importer of importersOf(current)) {
        if (seen.has(importer) || matchesAny(importer, config.everything)) continue;
        seen.add(importer);
        queue.push(importer);
      }
    }
    return found;
  }

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
    const owners = ownersThroughImports(file);
    if (owners.size) {
      for (const [area, via] of owners) add(area, via === file ? file : `${file} (imported by ${via})`);
      continue;
    }
    if (matchesAny(file, config.ignore)) { ignored.push(file); continue; }
    all = true;
    unplaced.push(file);
    add('*', file);
  }
  const areas = all ? Object.keys(config.areas) : Object.keys(config.areas).filter((a) => reasons[a]);
  return { all, areas, reasons, ignored, unplaced };
}

/**
 * The selection explained, as Markdown for the job summary of a run (#189): every area, whether it runs, and why. When
 * everything is selected, which file did it, and whether that is a shared hub or a file no area places.
 * @param {{ all: boolean, areas: string[], reasons: Record<string, string[]>, ignored: string[], unplaced: string[] }} selection
 */
export function selectionSummary(selection, config) {
  const names = Object.keys(config.areas);
  const lines = [`### E2E areas: ${selection.areas.length} of ${names.length} areas run`, ''];

  if (selection.all) {
    const triggers = selection.reasons['*'] ?? [];
    if (!triggers.length) {
      lines.push('Every area runs: the whole suite was asked for.');
    } else {
      lines.push('Every area runs because of:');
      for (const file of triggers) {
        const why = matchesAny(file, config.everything)
          ? 'a shared hub (listed under `everything` in tests/e2e/areas.json: a change to it can reach any area)'
          : 'not placed in any area (add it to an area in tests/e2e/areas.json)';
        lines.push(`- \`${file}\`: ${why}`);
      }
    }
    lines.push('');
  }

  lines.push('| Area | | Tests | Why |', '|---|---|---|---|');
  for (const name of names) {
    const runs = selection.areas.includes(name);
    const why = (selection.reasons[name] ?? []).map((f) => `\`${f}\``).join(', ');
    const reason = runs ? why || (selection.all ? 'every area runs' : 'asked for') : 'no changed file touches it';
    lines.push(`| \`${name}\` | ${runs ? 'run' : 'skipped'} | ${config.areas[name].tests.length} | ${reason} |`);
  }

  if (selection.ignored.length) {
    const n = selection.ignored.length;
    lines.push('', `${n} changed file${n === 1 ? ' is' : 's are'} covered by no E2E test (docs, unit tests, workflows).`);
  }
  return lines.join('\n');
}

/** The test files of the given areas, as repo-relative paths. */
export function testFilesFor(areaNames, config) {
  return areaNames.flatMap((a) => config.areas[a].tests.map((t) => `tests/e2e/${t}.e2e.test.ts`));
}

/** The README badges show the state of main, from the full unit and E2E suites run after each merge (main-verify.yml). */
export const BADGE_BASE = 'https://img.shields.io/endpoint?url=' + encodeURIComponent('https://raw.githubusercontent.com/alelom/OntoCanvas/badges/');
export const BADGES_WORKFLOW = 'https://github.com/alelom/OntoCanvas/actions/workflows/main-verify.yml';
export const badgeMarkdown = (file, alt) => `[![${alt}](${BADGE_BASE}${encodeURIComponent(file)})](${BADGES_WORKFLOW})`;

/** The README's table of E2E areas. */
export function readmeTable(config) {
  const rows = Object.entries(config.areas).map(([name, a]) => `| \`${name}\` | ${a.description} | ${a.tests.length} |`);
  return ['| Area | Covers | Tests |', '|---|---|---|', ...rows].join('\n');
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

  if (flag('--readme')) {
    console.log(readmeTable(config));
    return 0;
  }

  if (flag('--list')) {
    for (const [name, a] of Object.entries(config.areas)) console.log(`${name.padEnd(15)} ${String(a.tests.length).padStart(2)} tests  ${a.description}`);
    console.log(`\n${Object.values(config.areas).reduce((n, a) => n + a.tests.length, 0)} tests in ${Object.keys(config.areas).length} areas`);
    return 0;
  }

  let selection;
  if (flag('--all')) {
    selection = { all: true, areas: Object.keys(config.areas), reasons: {}, ignored: [], unplaced: [] };
  } else if (value('--area')) {
    const names = value('--area').split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = names.filter((n) => !config.areas[n]);
    if (unknown.length) { console.error(`Unknown area: ${unknown.join(', ')}. Known: ${Object.keys(config.areas).join(', ')}`); return 2; }
    selection = { all: false, areas: names, reasons: {}, ignored: [], unplaced: [] };
  } else if (flag('--changed') || value('--base')) {
    const base = value('--base') ?? 'origin/main';
    selection = selectAreas(changedFiles(base, { includeWorkingTree: !flag('--no-worktree') }), config, buildImporterGraph(ROOT));
  } else {
    console.error('Use --list, --all, --area <a,b>, or --changed [--base <ref>]; add --run to run, --json to print for CI, --summary for Markdown.');
    return 2;
  }

  const files = testFilesFor(selection.areas, config);
  if (flag('--json')) {
    const skipped = Object.keys(config.areas).filter((a) => !selection.areas.includes(a));
    console.log(JSON.stringify({ all: selection.all, areas: selection.areas, skipped, reasons: selection.reasons, tests: files, ignored: selection.ignored }));
    return 0;
  }
  if (flag('--summary')) {
    console.log(selectionSummary(selection, config));
    return 0;
  }
  console.log(describe(selection, config));
  if (!selection.areas.length) { console.log('No E2E area is affected by these changes; nothing to run.'); return 0; }
  console.log(`\n${files.length} test file(s) in ${selection.areas.length} area(s)${selection.all ? ' (everything)' : ''}.`);
  return flag('--run') ? runVitest(selection.all ? [] : files) : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
