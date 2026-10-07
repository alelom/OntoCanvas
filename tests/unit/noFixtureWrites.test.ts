import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function testFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'fixtures' ? [] : testFiles(p);
    return /\.ts$/.test(e.name) ? [p] : [];
  });
}

/** Paths a file writes to that point into tests/fixtures: a fixtures path passed straight to a write
 * call, or stored in a variable that is. */
function fixtureWrites(source: string): string[] {
  const fixtureVars = new Set([...source.matchAll(/(\w+)\s*=\s*[^;\n]*['"`][^'"`]*fixtures\//g)].map((m) => m[1]));
  return [...source.matchAll(/(?:writeFileSync|appendFileSync)\(\s*([^,]+),/g)]
    .map((m) => m[1].trim())
    .filter((arg) => fixtureVars.has(arg) || /fixtures\//.test(arg));
}

/** Test runs must not modify tracked files: fixtures are inputs, output goes to a temp dir (#88). */
describe('tests never write into tests/fixtures', () => {
  it('finds a write through a fixtures path variable', () => {
    expect(fixtureWrites("const out = join(__dirname, '../fixtures/x.ttl');\nwriteFileSync(out, s, 'utf-8');")).toEqual(['out']);
    expect(fixtureWrites("const out = join(tmpdir(), 'x.ttl');\nwriteFileSync(out, s, 'utf-8');")).toEqual([]);
  });

  it('no test file does', () => {
    const offenders = [join(ROOT, 'tests'), join(ROOT, 'src')]
      .flatMap(testFiles)
      .filter((f) => /\.test\.ts$|[\\/]tests[\\/]/.test(f) && f !== fileURLToPath(import.meta.url)) // not its own samples
      .flatMap((f) => fixtureWrites(readFileSync(f, 'utf-8')).map((w) => `${relative(ROOT, f)}: ${w}`));
    expect(offenders).toEqual([]);
  });
});
