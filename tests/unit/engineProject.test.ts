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
const projects = (config.test?.projects ?? []) as { test?: { name?: string; include?: string[]; fileParallelism?: boolean; isolate?: boolean; sequence?: { groupOrder?: number } } }[];
const engine = projects.find((p) => p.test?.name === 'engine')!.test!;

describe('the engine project', () => {
  it('runs its files one after the other and shares the module context, so the engine is built once', () => {
    expect(engine.fileParallelism).toBe(false);
    expect(engine.isolate).toBe(false);
  });

  it('runs before the other unit tests', () => {
    expect(engine.sequence?.groupOrder).toBe(0);
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
