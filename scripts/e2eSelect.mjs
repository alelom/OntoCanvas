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
 * A script that builds the app or runs the E2E tests, with the pre and post hooks npm runs around it, or that npm runs on install:
 * changing it changes how they run, so it reaches every area.
 */
const E2E_SCRIPT = /^((pre|post)?(build|preview|dev|test:e2e(:.*)?)|preinstall|install|postinstall|prepare|prepublish|prepublishOnly)$/;

/**
 * What a change to package.json can reach (#190), from the file before and after.
 *  - nothing: only the version (a release) or a script that is not how the E2E tests are built or run;
 *  - packages: only `dependencies` changed (added, removed or another version); the areas are those of the modules that import them;
 *  - everything: a dev dependency (the test tools themselves), a script that builds or runs the E2E tests, or any other field.
 * @returns {{ affects: 'nothing' | 'packages' | 'everything', packages: string[], note: string }}
 */
export function packageJsonChange(oldPkg, newPkg) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const changedKeys = (a = {}, b = {}) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k])).sort();
  const reasons = [];
  const packages = [];

  for (const key of new Set([...Object.keys(oldPkg), ...Object.keys(newPkg)])) {
    if (same(oldPkg[key], newPkg[key]) || key === 'version') continue;
    if (key === 'scripts') {
      const tools = changedKeys(oldPkg.scripts, newPkg.scripts).filter((name) => E2E_SCRIPT.test(name));
      if (tools.length) reasons.push(`scripts: ${tools.join(', ')}`);
    } else if (key === 'dependencies') {
      packages.push(...changedKeys(oldPkg.dependencies, newPkg.dependencies));
    } else if (key === 'devDependencies') {
      reasons.push(`devDependencies: ${changedKeys(oldPkg.devDependencies, newPkg.devDependencies).join(', ')}`);
    } else {
      reasons.push(key);
    }
  }
  if (reasons.length) return { affects: 'everything', packages, note: reasons.join('; ') };
  if (packages.length) return { affects: 'packages', packages, note: `dependencies: ${packages.join(', ')}` };
  return { affects: 'nothing', packages: [], note: '' };
}

/** The package a bare import specifier names: `@scope/name` or `name`, whatever subpath follows. */
const packageOf = (specifier) => (specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);

/**
 * Which modules under src/ import which npm package, read from the source like buildImporterGraph.
 * @returns {(name: string) => string[]} the modules that import the package, by static or dynamic import
 */
export function buildPackageImporters(root = ROOT) {
  const importers = new Map();
  for (const file of sourceFiles(join(root, 'src'), root)) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(IMPORT_SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) continue;
      const name = packageOf(specifier);
      if (!importers.has(name)) importers.set(name, new Set());
      importers.get(name).add(file);
    }
  }
  return (name) => [...(importers.get(name) ?? [])];
}

/**
 * What a set of changed files selects.
 * @param {string[]} changedFiles
 * @param {object} config tests/e2e/areas.json
 * @param {(file: string) => string[]} [importersOf] who imports a module; without it only the map decides
 * @param {{ change: { affects: string, packages: string[], note: string }, importersOfPackage: (name: string) => string[] } | null} [packages]
 *   what changed in package.json (packageJsonChange) and who imports each package; without it a change to a package file selects every area
 * @returns {{ all: boolean, areas: string[], reasons: Record<string, string[]>, notes: Record<string, string>, ignored: string[], unplaced: string[] }}
 *   `reasons` says, per area (or `*` for everything), which files selected it; `notes` explains a file that selected everything.
 */
export function selectAreas(changedFiles, config, importersOf = () => [], packages = null) {
  const reasons = {};
  const notes = {};
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

  const packageFiles = [];
  for (const raw of changedFiles) {
    const file = normalise(raw);
    // A file that holds only types cannot change what runs: the type check (in the unit tests job) is what can break on it.
    if (matchesAny(file, config.typeOnly ?? [])) { ignored.push(file); continue; }
    if (matchesAny(file, config.packageFiles ?? [])) { packageFiles.push(file); continue; }
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
  if (packageFiles.length) {
    const everything = (file, note) => { all = true; add('*', file); notes[file] = note; };
    const packageJson = packageFiles.find((f) => f.endsWith('package.json'));
    if (!packages) {
      for (const file of packageFiles) everything(file, 'what changed in it was not compared');
    } else if (!packageJson) {
      // The lock file alone: the versions behind the dependencies changed, and nothing says which code they reach.
      for (const file of packageFiles) everything(file, 'changed without package.json: the versions of the dependencies behind it changed');
    } else if (packages.change.affects === 'everything') {
      everything(packageJson, packages.change.note);
    } else if (packages.change.affects === 'nothing') {
      ignored.push(packageJson);
    } else {
      for (const name of packages.change.packages) {
        const importing = packages.importersOfPackage(name);
        if (!importing.length) { everything(packageJson, `${name} is imported by no module under src/`); continue; }
        for (const importer of importing) {
          if (matchesAny(importer, config.everything)) { everything(packageJson, `${name} is imported by ${importer}, a shared hub`); continue; }
          const owners = ownersThroughImports(importer);
          if (!owners.size) { everything(packageJson, `${name} is imported by ${importer}, which no area places`); continue; }
          for (const [area] of owners) add(area, `${packageJson} (${name}, imported by ${importer})`);
        }
      }
    }
  }
  const areas = all ? Object.keys(config.areas) : Object.keys(config.areas).filter((a) => reasons[a]);
  return { all, areas, reasons, notes, ignored, unplaced };
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
        const why =
          selection.notes?.[file] ??
          (matchesAny(file, config.everything)
            ? 'a shared hub (listed under `everything` in tests/e2e/areas.json: a change to it can reach any area)'
            : 'not placed in any area (add it to an area in tests/e2e/areas.json)');
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

/** A file as it was at `ref`, or null. */
function gitShow(ref, path) {
  const r = spawnSync('git', ['show', `${ref}:${path}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/**
 * What a change to package.json reaches, for selectAreas: null when no package file changed. package.json is compared with
 * its version at `base`; if it cannot be compared (not there before, not valid JSON) the change counts as reaching everything.
 */
export function packagesOf(changed, base, config) {
  if (!changed.some((f) => matchesAny(f, config.packageFiles ?? []))) return null;
  let change;
  try {
    const before = gitShow(base, 'package.json');
    change = before === null
      ? { affects: 'everything', packages: [], note: 'package.json could not be compared with the base' }
      : packageJsonChange(JSON.parse(before), JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')));
  } catch {
    change = { affects: 'everything', packages: [], note: 'package.json could not be compared with the base' };
  }
  return { change, importersOfPackage: buildPackageImporters(ROOT) };
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
    const changed = changedFiles(base, { includeWorkingTree: !flag('--no-worktree') });
    selection = selectAreas(changed, config, buildImporterGraph(ROOT), packagesOf(changed, base, config));
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
