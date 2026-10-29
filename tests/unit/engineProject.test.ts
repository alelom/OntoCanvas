/**
 * The `engine` group of the unit tests (vitest.config.ts): the files that build the real SPARQL engine run first, one after
 * the other in one module context, so the engine (a singleton in src/sparql/runQuery.ts) is built once and not by two
 * workers at the same time, which took longer than the 10 s hook limit on a busy machine (#192).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../vitest.config';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const projects = (config.test?.projects ?? []) as { test?: { name?: string; include?: string[]; setupFiles?: string[]; fileParallelism?: boolean; isolate?: boolean; sequence?: { groupOrder?: number } } }[];
const engine = projects.find((p) => p.test?.name === 'engine')!.test!;

describe('the engine project', () => {
  it('runs its files one after the other and shares the module context, so the engine is built once', () => {
    expect(engine.fileParallelism).toBe(false);
    expect(engine.isolate).toBe(false);
  });

  // A hook is under a 10 s limit; a setup file is not. Building the engine takes about a second on a warm machine and 46 s was
  // measured on a cold one, so it is built in the setup, and no test file warms it up in a hook (#192).
  it('builds the engine and loads rdf-parse in a setup file, which is not under the limit of a hook', () => {
    expect(engine.setupFiles).toContain('tests/engineSetup.ts');
    const setup = readFileSync(join(ROOT, 'tests/engineSetup.ts'), 'utf-8');
    expect(setup).toContain('runQuery(');
    expect(setup).toContain('parseRdfToGraph(');
  });

  it('leaves the warm-up out of the hooks of the test files: a hook that builds the engine is what timed out', () => {
    for (const file of engine.include ?? []) {
      const text = readFileSync(join(ROOT, file), 'utf-8');
      expect(text, file).not.toMatch(/beforeAll\(async \(\) => \{\s*await runQuery\(\[new Store\(\)\]/);
      expect(text, file).not.toContain("await runQuery([store], 'ASK { ?s ?p ?o }');");
    }
  });

  it('runs before the other unit tests', () => {
    expect(engine.sequence?.groupOrder).toBe(0);
  });

  it('has its setup file in the `full` list of unitSelect.json, since no test imports it and an edit would select nothing', () => {
    const select = JSON.parse(readFileSync(join(ROOT, 'tests/unitSelect.json'), 'utf-8')) as { full: string[] };
    const setupFiles = (engine as { setupFiles?: string[] }).setupFiles ?? [];
    expect(setupFiles).toContain('tests/engineSetup.ts');
    for (const file of setupFiles) expect(select.full).toContain(file);
  });

  it('lists every test that calls the real engine, so a new one cannot be left to build it beside the others', () => {
    const files = readdirSync(join(ROOT, 'tests/unit')).filter((f) => f.endsWith('.test.ts'));
    // A value import of runQuery (not `import type`) that does not replace the engine with a mock.
    const callsTheRealEngine = files.filter((f) => {
      const text = readFileSync(join(ROOT, 'tests/unit', f), 'utf-8');
      const importsRunQuery = /^import (?!type)[^;]*from '(\.\.\/)+src\/sparql\/runQuery';/m.test(text);
      const mocksTheEngine = /vi\.(do)?[mM]ock\(/.test(text);
      return importsRunQuery && !mocksTheEngine;
    });
    const listed = (engine.include ?? []).map((p) => p.replace('tests/unit/', ''));
    expect(callsTheRealEngine.sort()).toEqual(listed.sort());
  });
});
