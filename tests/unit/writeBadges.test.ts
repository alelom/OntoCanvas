/**
 * The README badge files written from the nightly results (#174, #175).
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
  const ok = (name: string, label = name) => ({ name, label, status: 'success' });

  it('writes one file for the unit tests, one per area and an overall E2E one', () => {
    const files = buildBadges([ok('unit'), ok('e2e-search'), ok('e2e-embed')], ['search', 'embed']);
    expect(Object.keys(files).sort()).toEqual(['e2e-embed.json', 'e2e-search.json', 'e2e.json', 'unit.json']);
    expect(files['e2e.json']).toMatchObject({ message: 'passing', color: 'brightgreen' });
    expect(files['e2e-search.json']).toMatchObject({ label: 'E2E search', message: 'passing' });
  });

  it('counts the failing areas in the overall badge, and turns it red', () => {
    const files = buildBadges([ok('unit'), ok('e2e-search'), { name: 'e2e-embed', label: '', status: 'failure' }], ['search', 'embed']);
    expect(files['e2e-embed.json']).toMatchObject({ message: 'failing', color: 'red' });
    expect(files['e2e.json']).toMatchObject({ message: '1 of 2 failing', color: 'red' });
  });

  it('shows an area with no result as unknown, so a skipped job never reads as passing', () => {
    const files = buildBadges([ok('unit'), ok('e2e-search')], ['search', 'embed']);
    expect(files['e2e-embed.json']).toMatchObject({ message: 'unknown', color: 'lightgrey' });
    expect(files['e2e.json']).toMatchObject({ message: '1 of 2 unknown', color: 'lightgrey' });
  });

  it('shows the unit tests as unknown when they have no result', () => {
    expect(buildBadges([], ['search'])['unit.json']).toMatchObject({ message: 'unknown' });
  });
});

describe('the command line', () => {
  it('reads the results directory and writes the badge files for every real area', () => {
    const dir = mkdtempSync(join(tmpdir(), 'badges-'));
    try {
      const results = join(dir, 'results');
      mkdirSync(results);
      writeFileSync(join(results, 'unit.json'), JSON.stringify({ name: 'unit', label: 'unit tests', status: 'success' }));
      writeFileSync(join(results, 'e2e-search.json'), JSON.stringify({ name: 'e2e-search', label: 'E2E search', status: 'failure' }));
      const out = join(dir, 'out');

      const r = spawnSync('node', ['scripts/writeBadges.mjs', results, out], { cwd: ROOT, encoding: 'utf8' });

      expect(r.status).toBe(0);
      const files = readdirSync(out);
      expect(files).toContain('unit.json');
      expect(files).toContain('e2e.json');
      expect(files.filter((f) => f.startsWith('e2e-')).length).toBe(14);
      expect(JSON.parse(readFileSync(join(out, 'e2e-search.json'), 'utf8'))).toMatchObject({ message: 'failing' });
      expect(JSON.parse(readFileSync(join(out, 'e2e-embed.json'), 'utf8'))).toMatchObject({ message: 'unknown' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks for both directories', () => {
    expect(spawnSync('node', ['scripts/writeBadges.mjs'], { cwd: ROOT, encoding: 'utf8' }).status).toBe(2);
  });
});
