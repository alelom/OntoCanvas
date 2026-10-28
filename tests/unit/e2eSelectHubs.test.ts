/**
 * The hubs that used to select every area, made precise (#190): a file that holds only types, and package.json (what a
 * change to it can reach depends on what changed in it). The general selection is in e2eSelect.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { buildPackageImporters, loadConfig, packageJsonChange, selectAreas, selectionSummary } from '../../scripts/e2eSelect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const sample = {
  everything: ['src/main.ts', 'src/state/'],
  typeOnly: ['src/types.ts'],
  packageFiles: ['package.json', 'package-lock.json'],
  ignore: ['**/*.md', 'tests/unit/'],
  areas: {
    search: { description: '', tests: ['searchScope'], sources: ['src/ui/search.ts', 'src/types.ts'] },
    sparql: { description: '', tests: ['sparqlQuery'], sources: ['src/sparql/', 'src/ui/editor.ts'] },
    saving: { description: '', tests: ['saveChanges'], sources: ['src/rdf/'] },
  },
};

describe('a file that holds only types (#190)', () => {
  const importers = (file: string) => (file === 'src/types.ts' ? ['src/ui/search.ts', 'src/rdf/serialize.ts', 'src/main.ts'] : []);

  it('selects no area, however many modules import it: only the type check can break on it, and the unit tests job runs that', () => {
    const s = selectAreas(['src/types.ts'], sample, importers);

    expect(s).toMatchObject({ all: false, areas: [], ignored: ['src/types.ts'] });
  });

  it('still selects the areas of the other files changed with it', () => {
    expect(selectAreas(['src/types.ts', 'src/ui/search.ts'], sample, importers).areas).toEqual(['search']);
  });
});

describe('packageJsonChange: what a change to package.json can reach', () => {
  const base = { name: 'x', version: '1.0.0', scripts: { build: 'vite build', typecheck: 'tsc' }, dependencies: { n3: '^1.0.0' }, devDependencies: { vitest: '^4.0.0' } };
  const change = (patch: Record<string, unknown>) => packageJsonChange(base, { ...base, ...patch });

  it('reaches nothing when the version is all that changed (a release)', () => {
    expect(change({ version: '1.1.0' })).toMatchObject({ affects: 'nothing' });
    expect(packageJsonChange(base, base)).toMatchObject({ affects: 'nothing' });
  });

  it('reaches nothing for a script that is not how the E2E tests are built or run', () => {
    expect(change({ scripts: { ...base.scripts, 'check:names': 'node a.mjs' } })).toMatchObject({ affects: 'nothing' });
    expect(change({ scripts: { ...base.scripts, typecheck: 'tsc --noEmit' } })).toMatchObject({ affects: 'nothing' });
  });

  it('reaches everything for a script that builds or runs the E2E tests', () => {
    for (const name of ['build', 'preview', 'dev', 'test:e2e', 'test:e2e:area']) {
      const scripts = { ...base.scripts, [name]: 'changed' };
      expect(change({ scripts }), name).toMatchObject({ affects: 'everything' });
    }
  });

  it('reaches everything for the pre and post hooks npm runs around those scripts, and for the install hooks (#191 review)', () => {
    for (const name of ['prebuild', 'postbuild', 'pretest:e2e:area', 'posttest:e2e', 'predev', 'preinstall', 'install', 'postinstall', 'prepare', 'prepublishOnly']) {
      const scripts = { ...base.scripts, [name]: 'changed' };
      expect(change({ scripts }), name).toMatchObject({ affects: 'everything' });
    }
  });

  it('still reaches nothing for a hook of a script that is not one of those (pretypecheck)', () => {
    expect(change({ scripts: { ...base.scripts, pretypecheck: 'echo' } })).toMatchObject({ affects: 'nothing' });
  });

  it('names the packages of a changed dependency: added, removed or with another version', () => {
    expect(change({ dependencies: { ...base.dependencies, '@codemirror/view': '^6.0.0' } })).toMatchObject({ affects: 'packages', packages: ['@codemirror/view'] });
    expect(change({ dependencies: { n3: '^2.0.0' } })).toMatchObject({ affects: 'packages', packages: ['n3'] });
    expect(change({ dependencies: {} })).toMatchObject({ affects: 'packages', packages: ['n3'] });
  });

  it('reaches everything for a change to a dev dependency (the test tools themselves) or to any other field', () => {
    expect(change({ devDependencies: { vitest: '^5.0.0' } })).toMatchObject({ affects: 'everything' });
    expect(change({ engines: { node: '>=20' } })).toMatchObject({ affects: 'everything' });
  });

  it('reaches everything when a tool change comes with a dependency change, and says what it was', () => {
    const c = change({ dependencies: { n3: '^2.0.0' }, devDependencies: { vitest: '^5.0.0' } });

    expect(c.affects).toBe('everything');
    expect(c.note).toContain('devDependencies');
  });
});

describe('selectAreas with a change to package.json', () => {
  const importers = (pkg: string) =>
    ({ '@codemirror/view': ['src/ui/editor.ts'], n3: ['src/main.ts'], comunica: ['src/sparql/run.ts', 'src/rdf/store.ts'] } as Record<string, string[]>)[pkg] ?? [];
  const packages = (affects: string, names: string[] = [], note = '') => ({ change: { affects, packages: names, note }, importersOfPackage: importers });
  const select = (files: string[], p: ReturnType<typeof packages> | null) => selectAreas(files, sample, () => [], p);

  it('selects the areas of the modules that import the changed package', () => {
    const s = select(['package.json', 'package-lock.json'], packages('packages', ['@codemirror/view']));

    expect(s).toMatchObject({ all: false, areas: ['sparql'] });
    expect(s.reasons.sparql[0]).toContain('@codemirror/view');
  });

  it('selects the areas of every module that imports it', () => {
    expect(select(['package.json'], packages('packages', ['comunica'])).areas).toEqual(['sparql', 'saving']);
  });

  it('selects every area when a hub imports the package, and says which', () => {
    const s = select(['package.json'], packages('packages', ['n3']));

    expect(s.all).toBe(true);
    expect(s.notes['package.json']).toContain('src/main.ts');
  });

  it('selects every area when no module under src imports the package, since nothing says what it reaches', () => {
    const s = select(['package.json'], packages('packages', ['left-pad']));

    expect(s.all).toBe(true);
    expect(s.notes['package.json']).toContain('left-pad');
  });

  it('selects nothing for a change that reaches nothing, and lists the file as covered by no E2E test', () => {
    expect(select(['package.json'], packages('nothing'))).toMatchObject({ all: false, areas: [], ignored: ['package.json'] });
  });

  it('selects every area for a change to the tools, with the reason', () => {
    const s = select(['package.json'], packages('everything', [], 'devDependencies: vitest'));

    expect(s.all).toBe(true);
    expect(s.notes['package.json']).toBe('devDependencies: vitest');
  });

  it('selects every area for the lock file alone: the versions behind the dependencies changed', () => {
    const s = select(['package-lock.json'], packages('nothing'));

    expect(s.all).toBe(true);
    expect(s.notes['package-lock.json']).toMatch(/without package\.json/);
  });

  it('lets the lock file follow package.json when both changed', () => {
    expect(select(['package.json', 'package-lock.json'], packages('nothing'))).toMatchObject({ all: false, areas: [] });
  });

  it('selects every area when it cannot tell what changed in package.json', () => {
    expect(select(['package.json'], null).all).toBe(true);
  });
});

describe('selectionSummary says why a package change selected what it did', () => {
  it('quotes the note of the file', () => {
    const change = { affects: 'everything', packages: [], note: 'devDependencies: vitest' };
    const s = selectAreas(['package.json'], sample, () => [], { change, importersOfPackage: () => [] });

    expect(selectionSummary(s, sample)).toContain('`package.json`: devDependencies: vitest');
  });
});

describe('buildPackageImporters, on the real source tree', () => {
  const importersOf = buildPackageImporters(ROOT);

  it('finds the modules that import a package, by static and dynamic import', () => {
    expect(importersOf('@comunica/query-sparql-rdfjs-lite')).toContain('src/sparql/runQuery.ts');
    expect(importersOf('@codemirror/view')).toContain('src/ui/sidePanel/codeMirrorEditor.ts');
    expect(importersOf('n3')).toContain('src/ontology/buildGraph.ts');
  });

  it('knows a package by its name', () => {
    expect(importersOf('@traqula/parser-sparql-1-2')).toContain('src/sparql/runQuery.ts');
  });

  it('finds nothing for a package nobody imports', () => {
    expect(importersOf('left-pad')).toEqual([]);
  });
});

describe('the real area map (#190)', () => {
  const config = loadConfig();

  it('lists the package files, which are no longer hubs of their own', () => {
    expect(config.packageFiles).toEqual(['package.json', 'package-lock.json']);
    expect(config.everything).not.toContain('package.json');
    expect(config.everything).not.toContain('package-lock.json');
  });

  it('holds only types in every file it calls type-only, so the type check really is all that can break on it', () => {
    expect(config.typeOnly).toContain('src/types.ts');
    for (const file of config.typeOnly as string[]) {
      const source = ts.createSourceFile(file, readFileSync(join(ROOT, file), 'utf-8'), ts.ScriptTarget.Latest, true);
      const runtime = source.statements
        .filter((s) => {
          if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) return false;
          if (ts.isImportDeclaration(s)) return !s.importClause?.isTypeOnly;
          if (ts.isExportDeclaration(s)) return !s.isTypeOnly;
          return true;
        })
        .map((s) => `${ts.SyntaxKind[s.kind]}: ${s.getText(source).slice(0, 60)}`);
      expect(runtime, file).toEqual([]);
    }
  });
});
