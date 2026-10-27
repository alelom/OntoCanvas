/**
 * Which E2E tests a change selects (#174, #175): the selection logic, and the integrity of the real area map.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { areaOfTest, badgeMarkdown, buildImporterGraph, loadConfig, matchesPattern, matchesAny, readmeTable, selectAreas, testFilesFor } from '../../scripts/e2eSelect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const sample = {
  everything: ['src/main.ts', 'src/state/'],
  ignore: ['**/*.md', 'docs/', 'tests/unit/'],
  areas: {
    search: { description: '', tests: ['searchOutline', 'searchScope'], sources: ['src/ui/search.ts', 'src/lib/shared.ts'] },
    embed: { description: '', tests: ['embedMode'], sources: ['src/utils/embedMode.ts', 'src/lib/shared.ts'] },
    saving: { description: '', tests: ['saveChanges'], sources: ['src/rdf/'] },
  },
};

describe('matchesPattern', () => {
  it('matches a directory prefix, an exact path and a glob', () => {
    expect(matchesPattern('src/rdf/restrictions.ts', 'src/rdf/')).toBe(true);
    expect(matchesPattern('src/rdfs/x.ts', 'src/rdf/')).toBe(false);
    expect(matchesPattern('src/main.ts', 'src/main.ts')).toBe(true);
    expect(matchesPattern('src/main.tsx', 'src/main.ts')).toBe(false);
    expect(matchesPattern('README.md', '**/*.md')).toBe(true);
    expect(matchesPattern('docs/a/b.md', '**/*.md')).toBe(true);
    expect(matchesPattern('src/a.ts', '**/*.md')).toBe(false);
  });

  it('accepts a Windows path', () => {
    expect(matchesPattern('src\\rdf\\x.ts', 'src/rdf/')).toBe(true);
  });
});

describe('selectAreas', () => {
  it('selects only the area that lists a changed module', () => {
    const s = selectAreas(['src/ui/search.ts'], sample);
    expect(s).toMatchObject({ all: false, areas: ['search'] });
    expect(s.reasons.search).toEqual(['src/ui/search.ts']);
  });

  it('selects every area that lists a shared module', () => {
    expect(selectAreas(['src/lib/shared.ts'], sample).areas).toEqual(['search', 'embed']);
  });

  it('selects an area by a directory it lists', () => {
    expect(selectAreas(['src/rdf/anything.ts'], sample).areas).toEqual(['saving']);
  });

  it('selects every area for a file in the everything list', () => {
    const s = selectAreas(['src/main.ts'], sample);
    expect(s.all).toBe(true);
    expect(s.areas).toEqual(['search', 'embed', 'saving']);
    expect(s.reasons['*']).toEqual(['src/main.ts']);
    expect(selectAreas(['src/state/appState.ts'], sample).all).toBe(true);
  });

  it('selects every area for a file nothing places, so a missing entry never skips a test', () => {
    const s = selectAreas(['src/brand-new.ts'], sample);
    expect(s.all).toBe(true);
    expect(s.unplaced).toEqual(['src/brand-new.ts']);
  });

  it('ignores files that no E2E test covers', () => {
    const s = selectAreas(['README.md', 'docs/notes.txt', 'tests/unit/a.test.ts'], sample);
    expect(s).toMatchObject({ all: false, areas: [] });
    expect(s.ignored).toHaveLength(3);
  });

  it('selects the area of a changed E2E test, and every area for one that is in no area', () => {
    expect(selectAreas(['tests/e2e/embedMode.e2e.test.ts'], sample).areas).toEqual(['embed']);
    const unknown = selectAreas(['tests/e2e/forgotten.e2e.test.ts'], sample);
    expect(unknown.all).toBe(true);
    expect(unknown.unplaced).toEqual(['tests/e2e/forgotten.e2e.test.ts']);
  });

  it('combines several changes, and lets an ignored file add nothing', () => {
    const s = selectAreas(['src/ui/search.ts', 'src/rdf/a.ts', 'README.md'], sample);
    expect(s.areas).toEqual(['search', 'saving']);
    expect(s.ignored).toEqual(['README.md']);
  });

  it('selects nothing for no changes', () => {
    expect(selectAreas([], sample)).toMatchObject({ all: false, areas: [] });
  });
});

describe('selectAreas follows the import graph (the areas of the modules that import a changed file)', () => {
  // vocab is listed under `saving`; search and embed code import it; main.ts, a hub in `everything`, imports everything.
  const importers: Record<string, string[]> = {
    'src/rdf/vocab.ts': ['src/ui/search.ts', 'src/utils/embedMode.ts', 'src/main.ts'],
    'src/lib/deep.ts': ['src/lib/mid.ts'],
    'src/lib/mid.ts': ['src/ui/search.ts', 'src/main.ts'],
    'src/lib/onlyHub.ts': ['src/main.ts'],
    'src/lib/loopA.ts': ['src/lib/loopB.ts'],
    'src/lib/loopB.ts': ['src/lib/loopA.ts', 'src/utils/embedMode.ts'],
  };
  const of = (file: string) => importers[file] ?? [];

  it('selects the areas of the modules that import a listed file, besides the areas that list it', () => {
    expect(selectAreas(['src/rdf/vocab.ts'], sample, of).areas).toEqual(['search', 'embed', 'saving']);
  });

  it('does not let a hub in the everything list turn that into every area', () => {
    const s = selectAreas(['src/rdf/vocab.ts'], sample, of);
    expect(s.all).toBe(false);
    expect(s.reasons['*']).toBeUndefined();
  });

  it('finds an importer through a chain of importers', () => {
    expect(selectAreas(['src/lib/deep.ts'], sample, of).areas).toEqual(['search']);
  });

  it('places a file that no area lists by the areas of its importers instead of selecting everything', () => {
    const s = selectAreas(['src/lib/deep.ts'], sample, of);
    expect(s).toMatchObject({ all: false, unplaced: [] });
  });

  it('still selects every area for a file that nothing but a hub imports, since nothing places it', () => {
    const s = selectAreas(['src/lib/onlyHub.ts'], sample, of);
    expect(s).toMatchObject({ all: true, unplaced: ['src/lib/onlyHub.ts'] });
  });

  it('copes with an import cycle', () => {
    expect(selectAreas(['src/lib/loopA.ts'], sample, of).areas).toEqual(['embed']);
  });

  it('says through which module an area was selected', () => {
    expect(selectAreas(['src/rdf/vocab.ts'], sample, of).reasons.embed).toEqual(['src/rdf/vocab.ts (imported by src/utils/embedMode.ts)']);
  });

  it('is what selection used to be when nothing is imported', () => {
    expect(selectAreas(['src/rdf/vocab.ts'], sample).areas).toEqual(['saving']);
  });
});

describe('the import graph of the real source tree', () => {
  const config = loadConfig();
  const importers = buildImporterGraph(ROOT);
  const isHub = (f: string) => matchesAny(f, config.everything);

  it.each([
    ['src/rdf/reservedVocabulary.ts', ['external-refs', 'imports']],
    ['src/rdf/propertyNamespace.ts', ['external-refs']],
    ['src/lib/termUri.ts', ['nodes', 'shell']],
  ])('%s selects the areas of the code that imports it', (file, expected) => {
    const s = selectAreas([file], config, importers);
    expect(s.areas).toEqual(expect.arrayContaining(expected));
    expect(s.all).toBe(false);
  });

  it('finds the importers of a module the way the code writes them', () => {
    expect(importers('src/lib/termUri.ts')).toContain('src/ui/selectionInfo.ts');
  });

  it('selects, for every module, at least the areas of the modules that import it (hubs and tests aside)', () => {
    const problems: string[] = [];
    for (const file of readdirRecursive(join(ROOT, 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      if (isHub(file)) continue;
      const selected = selectAreas([file], config, importers);
      if (selected.all) continue;
      for (const importer of importers(file).filter((i) => !isHub(i))) {
        const own = Object.keys(config.areas).filter((a) => matchesAny(importer, config.areas[a].sources));
        const missing = own.filter((a) => !selected.areas.includes(a));
        if (missing.length) problems.push(`${file} does not select ${missing.join(', ')}, which ${importer} belongs to`);
      }
    }
    expect(problems).toEqual([]);
  });
});

function readdirRecursive(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? readdirRecursive(p) : [p.slice(ROOT.length + 1).replace(/\\/g, '/')];
  });
}

describe('testFilesFor', () => {
  it('lists the test files of the areas, as repo paths', () => {
    expect(testFilesFor(['embed', 'saving'], sample)).toEqual(['tests/e2e/embedMode.e2e.test.ts', 'tests/e2e/saveChanges.e2e.test.ts']);
  });
});

describe('the real area map (tests/e2e/areas.json)', () => {
  const config = loadConfig();
  const e2eFiles = readdirRecursive(join(ROOT, 'tests/e2e')).map((f) => f.slice('tests/e2e/'.length)).filter((f) => f.endsWith('.e2e.test.ts'));

  it('keeps every E2E test file directly in tests/e2e, the only place the selection looks', () => {
    expect(e2eFiles.filter((f) => f.includes('/'))).toEqual([]);
  });

  const testFiles = e2eFiles.map((f) => f.replace(/\.e2e\.test\.ts$/, ''));

  it('puts every E2E test file in exactly one area', () => {
    const owners = new Map<string, string[]>();
    for (const [area, a] of Object.entries(config.areas) as [string, { tests: string[] }][]) for (const t of a.tests) owners.set(t, [...(owners.get(t) ?? []), area]);
    const unowned = testFiles.filter((t) => !owners.has(t));
    const duplicated = [...owners].filter(([, areas]) => areas.length > 1).map(([t, areas]) => `${t}: ${areas.join(', ')}`);
    expect({ unowned, duplicated }).toEqual({ unowned: [], duplicated: [] });
  });

  it('lists no test file that does not exist', () => {
    const missing = Object.values(config.areas as Record<string, { tests: string[] }>).flatMap((a) => a.tests).filter((t) => !testFiles.includes(t));
    expect(missing).toEqual([]);
  });

  it('lists only source paths that exist, so a rename cannot leave a stale entry that selects nothing', () => {
    const paths = [
      ...(config.everything as string[]),
      ...Object.values(config.areas as Record<string, { sources: string[] }>).flatMap((a) => a.sources),
    ];
    const missing = [...new Set(paths)].filter((p) => !existsSync(join(ROOT, p)));
    expect(missing).toEqual([]);
  });

  it('gives every area a description and at least one test and one source', () => {
    for (const [name, a] of Object.entries(config.areas) as [string, { description: string; tests: string[]; sources: string[] }][]) {
      expect(a.description, name).not.toBe('');
      expect(a.tests.length, name).toBeGreaterThan(0);
      expect(a.sources.length, name).toBeGreaterThan(0);
    }
  });

  it('finds the owner of a test by name', () => {
    expect(areaOfTest('searchScope', config)).toBe('search');
    expect(areaOfTest('nope', config)).toBeUndefined();
  });
});

describe('the command line', () => {
  const run = (...args: string[]) => spawnSync('node', ['scripts/e2eSelect.mjs', ...args], { cwd: ROOT, encoding: 'utf8' });

  it('prints the selection of an area as JSON, for CI', () => {
    const r = run('--area', 'search,embed', '--json');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      all: false,
      areas: ['search', 'embed'],
      tests: [
        'tests/e2e/searchOutline.e2e.test.ts',
        'tests/e2e/searchScope.e2e.test.ts',
        'tests/e2e/searchSuggestions.e2e.test.ts',
        'tests/e2e/embedIframe.e2e.test.ts',
        'tests/e2e/embedMode.e2e.test.ts',
      ],
      ignored: [],
    });
  });

  it('prints every area and every test with --all, for the manual full run', () => {
    const r = run('--all', '--json');
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.all).toBe(true);
    expect(out.areas).toEqual(Object.keys(loadConfig().areas));
    expect(out.tests).toHaveLength(Object.values(loadConfig().areas as Record<string, { tests: string[] }>).reduce((n, a) => n + a.tests.length, 0));
  });

  it('refuses an unknown area and names the known ones', () => {
    const r = run('--area', 'nope');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Unknown area: nope/);
    expect(r.stderr).toMatch(/search/);
  });
});

describe('the README', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8').replace(/\r\n/g, '\n');

  it('shows the table of areas that the map generates, so a new area cannot be left out of it', () => {
    const block = /<!-- e2e-areas:start[^>]*-->\n([\s\S]*?)\n<!-- e2e-areas:end -->/.exec(readme);
    expect(block, 'the markers are missing from README.md').not.toBeNull();
    expect(block![1]).toBe(readmeTable(loadConfig()));
  });

  it('has a badge for the unit tests and one for the E2E tests overall', () => {
    expect(readme).toContain(badgeMarkdown('unit.json', 'Unit tests'));
    expect(readme).toContain(badgeMarkdown('e2e.json', 'E2E tests'));
  });
});
