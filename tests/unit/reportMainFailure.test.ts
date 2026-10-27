/**
 * The issue raised when the post-merge verification of main fails (#174, #175).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, failedResults, LABEL } from '../../scripts/ci/reportMainFailure.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const base = { sha: '0123456789abcdef', runUrl: 'https://github.com/o/r/actions/runs/1', event: 'push' };

describe('buildReport', () => {
  it('names what failed in the title, with the short commit', () => {
    const { title } = buildReport({ ...base, failed: [{ label: 'E2E relationships', status: 'failure' }] });
    expect(title).toBe('Main is red: E2E relationships failed at 0123456');
  });

  it('lists up to three jobs by name, and counts more', () => {
    const f = (l: string) => ({ label: l, status: 'failure' });
    expect(buildReport({ ...base, failed: [f('a'), f('b'), f('c')] }).title).toContain('a, b, c failed');
    expect(buildReport({ ...base, failed: [f('a'), f('b'), f('c'), f('d')] }).title).toContain('4 jobs failed');
  });

  it('says the commit was not released or deployed, and links the run, the pull request and the author', () => {
    const { body } = buildReport({
      ...base,
      failed: [{ label: 'unit tests', status: 'failure' }],
      pr: { number: 42, title: 'feat: a thing' },
      author: 'someone',
    });
    expect(body).toContain('not released or deployed');
    expect(body).toContain('#42, feat: a thing');
    expect(body).toContain('@someone');
    expect(body).toContain(base.runUrl);
    expect(body).toContain('- unit tests: failure');
    expect(body).toContain('a push to main');
  });

  it('still makes a useful issue when no job recorded a result (an install or build failure)', () => {
    const { title, body } = buildReport({ ...base, failed: [] });
    expect(title).toBe('Main is red: the verification failed at 0123456');
    expect(body).toMatch(/before it could record a result/);
  });

  it('describes a nightly or manual run', () => {
    expect(buildReport({ ...base, event: 'schedule', failed: [] }).body).toContain('the nightly run');
    expect(buildReport({ ...base, event: 'workflow_dispatch', failed: [] }).body).toContain('a manual run');
  });

  it('leaves out the pull request and author lines when there are none (a direct push)', () => {
    const { body } = buildReport({ ...base, failed: [] });
    expect(body).not.toContain('Merged by');
    expect(body).not.toContain('@');
  });
});

describe('failedResults', () => {
  it('keeps everything that is not a success, a cancelled job included', () => {
    const r = [{ label: 'a', status: 'success' }, { label: 'b', status: 'failure' }, { label: 'c', status: 'cancelled' }];
    expect(failedResults(r).map((x) => x.label)).toEqual(['b', 'c']);
  });
});

describe('the command line', () => {
  it('prints the issue it would raise, without calling GitHub, with --dry-run', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-'));
    try {
      writeFileSync(join(dir, 'e2e-search.json'), JSON.stringify({ name: 'e2e-search', label: 'E2E search', status: 'failure' }));
      writeFileSync(join(dir, 'unit.json'), JSON.stringify({ name: 'unit', label: 'unit tests', status: 'success' }));

      const r = spawnSync('node', ['scripts/ci/reportMainFailure.mjs', dir, '--dry-run'], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, SHA: 'abcdef0123456789', RUN_URL: 'https://example.org/run', EVENT: 'schedule' },
      });

      expect(r.status).toBe(0);
      const out = JSON.parse(r.stdout);
      expect(out.title).toBe('Main is red: E2E search failed at abcdef0');
      expect(out.body).toContain('the nightly run');
      expect(out.body).not.toContain('unit tests: success');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks for a results directory, and for the commit and run', () => {
    expect(spawnSync('node', ['scripts/ci/reportMainFailure.mjs'], { cwd: ROOT, encoding: 'utf8' }).status).toBe(2);
    const dir = mkdtempSync(join(tmpdir(), 'report-'));
    try {
      const env = { ...process.env };
      delete env.SHA;
      expect(spawnSync('node', ['scripts/ci/reportMainFailure.mjs', dir, '--dry-run'], { cwd: ROOT, encoding: 'utf8', env }).status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses the label the issue is deduplicated by', () => {
    expect(LABEL).toBe('main-red');
  });
});
