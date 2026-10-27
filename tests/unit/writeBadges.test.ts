/**
 * The two README badge files written from the results of the verification of main (#174, #175).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { badge, buildBadges } from '../../scripts/writeBadges.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('badge', () => {
  it('shows passing in green, failing in red, and anything else as unknown in grey', () => {
    expect(badge('x', 'success')).toEqual({ schemaVersion: 1, label: 'x', message: 'passing', color: 'brightgreen' });
    expect(badge('x', 'failure')).toEqual({ schemaVersion: 1, label: 'x', message: 'failing', color: 'red' });
    expect(badge('x', 'cancelled')).toMatchObject({ message: 'unknown', color: 'lightgrey' });
    expect(badge('x', undefined)).toMatchObject({ message: 'unknown', color: 'lightgrey' });
  });
});

describe('buildBadges', () => {
  const ok = (name: string) => ({ name, label: name, status: 'success' });

  it('writes exactly two files: the unit suite and the E2E suite', () => {
    const files = buildBadges([ok('unit'), ok('e2e-search'), ok('e2e-embed')], ['search', 'embed']);
    expect(Object.keys(files).sort()).toEqual(['e2e.json', 'unit.json']);
    expect(files['unit.json']).toMatchObject({ label: 'unit tests', message: 'passing', color: 'brightgreen' });
    expect(files['e2e.json']).toMatchObject({ label: 'E2E tests', message: 'passing', color: 'brightgreen' });
  });

  it('turns the E2E badge red and counts the failing areas', () => {
    const files = buildBadges([ok('unit'), ok('e2e-search'), { name: 'e2e-embed', label: '', status: 'failure' }], ['search', 'embed']);
    expect(files['e2e.json']).toMatchObject({ message: '1 of 2 areas failing', color: 'red' });
  });

  it('counts an area with no result as unknown, so a skipped job never reads as passing', () => {
    const files = buildBadges([ok('unit'), ok('e2e-search')], ['search', 'embed']);
    expect(files['e2e.json']).toMatchObject({ message: '1 of 2 areas unknown', color: 'lightgrey' });
  });

  it('prefers failing over unknown when both occur', () => {
    const files = buildBadges([{ name: 'e2e-search', label: '', status: 'failure' }], ['search', 'embed']);
    expect(files['e2e.json']).toMatchObject({ message: '1 of 2 areas failing', color: 'red' });
  });

  it('shows the unit suite as red when it failed, and unknown when it has no result', () => {
    expect(buildBadges([{ name: 'unit', label: '', status: 'failure' }], ['search'])['unit.json']).toMatchObject({ message: 'failing', color: 'red' });
    expect(buildBadges([], ['search'])['unit.json']).toMatchObject({ message: 'unknown' });
  });
});

describe('the command line', () => {
  it('reads the results directory and writes the two files, counting every real area', () => {
    const dir = mkdtempSync(join(tmpdir(), 'badges-'));
    try {
      const results = join(dir, 'results');
      mkdirSync(results);
      writeFileSync(join(results, 'unit.json'), JSON.stringify({ name: 'unit', label: 'unit tests', status: 'success' }));
      writeFileSync(join(results, 'e2e-search.json'), JSON.stringify({ name: 'e2e-search', label: 'E2E search', status: 'failure' }));
      const out = join(dir, 'out');

      const r = spawnSync('node', ['scripts/writeBadges.mjs', results, out], { cwd: ROOT, encoding: 'utf8' });

      expect(r.status).toBe(0);
      expect(readdirSync(out).sort()).toEqual(['e2e.json', 'unit.json']);
      expect(JSON.parse(readFileSync(join(out, 'unit.json'), 'utf8'))).toMatchObject({ message: 'passing' });
      expect(JSON.parse(readFileSync(join(out, 'e2e.json'), 'utf8'))).toMatchObject({ message: '1 of 14 areas failing', color: 'red' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks for both directories', () => {
    expect(spawnSync('node', ['scripts/writeBadges.mjs'], { cwd: ROOT, encoding: 'utf8' }).status).toBe(2);
  });
});
