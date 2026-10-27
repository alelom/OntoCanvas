/**
 * Which unit tests a change selects (#175): the selection logic, and the integrity of tests/unitSelect.json.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, selectUnit } from '../../scripts/unitSelect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const config = {
  full: ['package.json', 'tests/fixtures/'],
  ignore: ['**/*.md', 'docs/'],
  alwaysRun: ['tests/unit/scan.test.ts'],
  reads: { 'README.md': ['tests/unit/readme.test.ts'], 'scripts/': ['tests/unit/scripts.test.ts'] },
};

describe('selectUnit', () => {
  it('hands the changed sources and tests to the import graph, and adds the tests that scan the repository', () => {
    const s = selectUnit(['src/a.ts', 'tests/unit/b.test.ts'], config);
    expect(s.full).toBe(false);
    expect(s.files).toEqual(['src/a.ts', 'tests/unit/b.test.ts', 'tests/unit/scan.test.ts']);
  });

  it('runs everything for a file the tests read from disk or that changes how they run', () => {
    expect(selectUnit(['tests/fixtures/x.ttl', 'src/a.ts'], config)).toMatchObject({ full: true, files: [] });
    expect(selectUnit(['package.json'], config).full).toBe(true);
  });

  it('adds the tests that read a path directly, besides the graph selection', () => {
    expect(selectUnit(['scripts/e2eSelect.mjs'], config).files).toEqual(['scripts/e2eSelect.mjs', 'tests/unit/scan.test.ts', 'tests/unit/scripts.test.ts']);
  });

  it('adds the reading test even when the file itself is ignored (a README)', () => {
    const s = selectUnit(['README.md'], config);
    expect(s.files).toEqual(['tests/unit/readme.test.ts', 'tests/unit/scan.test.ts']);
    expect(s.why.ignored).toEqual(['README.md']);
  });

  it('selects nothing for files no unit test depends on', () => {
    expect(selectUnit(['docs/a.md', 'notes.md'], config)).toMatchObject({ full: false, files: [] });
  });

  it('selects nothing for no changes', () => {
    expect(selectUnit([], config)).toMatchObject({ full: false, files: [] });
  });

  it('accepts Windows paths', () => {
    expect(selectUnit(['tests\\fixtures\\x.ttl'], config).full).toBe(true);
  });

  it('lists a changed file once even when two rules name it', () => {
    const s = selectUnit(['tests/unit/readme.test.ts', 'README.md'], config);
    expect(s.files.filter((f) => f === 'tests/unit/readme.test.ts')).toHaveLength(1);
  });
});

describe('tests/unitSelect.json', () => {
  const real = loadConfig();

  it('names unit tests that exist', () => {
    const tests = [...real.alwaysRun, ...Object.values(real.reads as Record<string, string[]>).flat()].filter((t) => t !== 'tests/unit/workflows.test.ts');
    const missing = tests.filter((t) => !existsSync(join(ROOT, t)));
    expect(missing).toEqual([]);
  });

  it('names paths that exist, so a rename cannot leave an entry that matches nothing', () => {
    const paths = [...real.full, ...Object.keys(real.reads), ...real.ignore.filter((p: string) => !p.includes('*'))];
    const missing = [...new Set(paths)].filter((p) => !existsSync(join(ROOT, p)));
    expect(missing).toEqual([]);
  });
});

describe('the command line', () => {
  it('asks for --changed', () => {
    expect(spawnSync('node', ['scripts/unitSelect.mjs'], { cwd: ROOT, encoding: 'utf8' }).status).toBe(2);
  });

  it('prints the selection as JSON for CI', () => {
    const r = spawnSync('node', ['scripts/unitSelect.mjs', '--changed', '--base', 'HEAD', '--no-worktree', '--json'], { cwd: ROOT, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ full: false, files: [] });
  });
});
