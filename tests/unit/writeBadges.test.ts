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
  const result = (name: string, status: string) => ({ name, label: name, status });

  it('writes exactly two files: the whole unit suite and the whole E2E suite', () => {
    const files = buildBadges([result('unit', 'success'), result('e2e', 'success')]);
    expect(Object.keys(files).sort()).toEqual(['e2e.json', 'unit.json']);
    expect(files['unit.json']).toEqual({ schemaVersion: 1, label: 'unit tests', message: 'passing', color: 'brightgreen' });
    expect(files['e2e.json']).toEqual({ schemaVersion: 1, label: 'E2E tests', message: 'passing', color: 'brightgreen' });
  });

  it('shows each suite on its own: one red does not colour the other', () => {
    const files = buildBadges([result('unit', 'success'), result('e2e', 'failure')]);
    expect(files['unit.json']).toMatchObject({ message: 'passing' });
    expect(files['e2e.json']).toMatchObject({ message: 'failing', color: 'red' });
  });

  it('shows a suite with no result as unknown, so a skipped job never reads as passing', () => {
    const files = buildBadges([result('unit', 'success')]);
    expect(files['e2e.json']).toMatchObject({ message: 'unknown', color: 'lightgrey' });
    expect(buildBadges([])['unit.json']).toMatchObject({ message: 'unknown' });
  });

  it('shows a cancelled job as unknown, not as failing', () => {
    expect(buildBadges([result('unit', 'cancelled')])['unit.json']).toMatchObject({ message: 'unknown' });
  });
});

describe('the command line', () => {
  it('reads the results directory and writes the two files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'badges-'));
    try {
      const results = join(dir, 'results');
      mkdirSync(results);
      writeFileSync(join(results, 'unit.json'), JSON.stringify({ name: 'unit', label: 'unit tests', status: 'success' }));
      writeFileSync(join(results, 'e2e.json'), JSON.stringify({ name: 'e2e', label: 'E2E tests', status: 'failure' }));
      const out = join(dir, 'out');

      const r = spawnSync('node', ['scripts/writeBadges.mjs', results, out], { cwd: ROOT, encoding: 'utf8' });

      expect(r.status).toBe(0);
      expect(readdirSync(out).sort()).toEqual(['e2e.json', 'unit.json']);
      expect(JSON.parse(readFileSync(join(out, 'unit.json'), 'utf8'))).toMatchObject({ message: 'passing' });
      expect(JSON.parse(readFileSync(join(out, 'e2e.json'), 'utf8'))).toMatchObject({ message: 'failing', color: 'red' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks for both directories', () => {
    expect(spawnSync('node', ['scripts/writeBadges.mjs'], { cwd: ROOT, encoding: 'utf8' }).status).toBe(2);
  });
});
