/**
 * The structure of the GitHub workflows (#174, #175). Most of this cannot run anywhere but on GitHub, so these checks catch
 * the mistakes that would otherwise show up only there: a job that reads another job's result without depending on it,
 * a Playwright job on a runner it cannot install on, a script that does not exist, a gate that no longer gates.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(ROOT, '.github', 'workflows');

interface Job { needs?: string | string[]; if?: string; 'runs-on'?: string; steps?: { run?: string; uses?: string; if?: string }[]; [k: string]: unknown }
interface Workflow { name: string; on: Record<string, unknown>; jobs: Record<string, Job> }

const files = readdirSync(DIR).filter((f) => f.endsWith('.yml'));
const workflows = Object.fromEntries(files.map((f) => [f, parse(readFileSync(join(DIR, f), 'utf8')) as Workflow]));
const needsOf = (job: Job): string[] => (job.needs === undefined ? [] : Array.isArray(job.needs) ? job.needs : [job.needs]);
const runs = (job: Job): string => (job.steps ?? []).map((s) => s.run ?? '').join('\n');

describe('every workflow', () => {
  it.each(files)('%s: each job it depends on exists', (file) => {
    const wf = workflows[file];
    const missing = Object.entries(wf.jobs).flatMap(([id, job]) => needsOf(job).filter((n) => !wf.jobs[n]).map((n) => `${id} needs ${n}`));
    expect(missing).toEqual([]);
  });

  it.each(files)('%s: a job that reads needs.<job> lists that job in its needs', (file) => {
    const wf = workflows[file];
    const undeclared = Object.entries(wf.jobs).flatMap(([id, job]) => {
      const used = [...JSON.stringify(job).matchAll(/needs\.([\w-]+)\./g)].map((m) => m[1]);
      return [...new Set(used)].filter((u) => !needsOf(job).includes(u)).map((u) => `${id} reads needs.${u} without needing it`);
    });
    expect(undeclared).toEqual([]);
  });

  it.each(files)('%s: a job that installs Playwright runs on ubuntu-24.04 (ubuntu-latest is 26.04, where Chromium cannot be installed)', (file) => {
    const wf = workflows[file];
    const wrong = Object.entries(wf.jobs).filter(([, j]) => /playwright install/.test(runs(j)) && j['runs-on'] !== 'ubuntu-24.04').map(([id]) => id);
    expect(wrong).toEqual([]);
  });

  it.each(files)('%s: the scripts it runs exist', (file) => {
    const wf = workflows[file];
    const scripts = Object.values(wf.jobs).flatMap((j) => [...runs(j).matchAll(/node (scripts\/[\w./-]+\.mjs)/g)].map((m) => m[1]));
    expect([...new Set(scripts)].filter((s) => !existsSync(join(ROOT, s)))).toEqual([]);
  });

  it.each(files)('%s: the workflows it reacts to exist', (file) => {
    const wf = workflows[file];
    const triggered = ((wf.on.workflow_run as { workflows?: string[] } | undefined)?.workflows ?? []);
    const names = Object.values(workflows).map((w) => w.name);
    expect(triggered.filter((t) => !names.includes(t))).toEqual([]);
  });
});

describe('the pull request checks (test.yml)', () => {
  const wf = workflows['test.yml'];

  it('has one check, "Ready to merge", that waits for every other job and runs even when one failed', () => {
    const gate = wf.jobs['ready-to-merge'];
    expect(gate.name).toBe('Ready to merge');
    expect(gate.if).toBe('always()');
    expect(needsOf(gate).sort()).toEqual(Object.keys(wf.jobs).filter((j) => j !== 'ready-to-merge').sort());
  });

  it('fails the gate for a failed or cancelled job, and lets a skipped one pass', () => {
    const script = runs(wf.jobs['ready-to-merge']);
    expect(script).toMatch(/failure/);
    expect(script).toMatch(/cancelled/);
    expect(script).not.toMatch(/skipped/);
  });

  it('runs only the unit tests and the E2E areas the change touches on a pull request', () => {
    expect(runs(wf.jobs['unit-tests'])).toContain('test:affected');
    expect(runs(wf.jobs['e2e-select'])).toContain('--changed');
  });
});

describe('the verification of main (main-verify.yml)', () => {
  const wf = workflows['main-verify.yml'];

  it('runs on a push to main, every night and on demand', () => {
    expect(Object.keys(wf.on).sort()).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect((wf.on.push as { branches: string[] }).branches).toEqual(['main']);
  });

  it('runs the whole unit suite once and the whole E2E suite once, never the affected subset', () => {
    expect(runs(wf.jobs.unit)).toMatch(/npm test\b/);
    expect(runs(wf.jobs.e2e)).toContain('test:e2e:full');
    expect(Object.values(wf.jobs).map(runs).join('\n')).not.toMatch(/test:affected|test:e2e:affected|test:e2e:area|--changed/);
  });

  it('is one job per suite, not one per area or per test group', () => {
    expect(Object.keys(wf.jobs).sort()).toEqual(['e2e', 'publish', 'report', 'still-current', 'unit']);
    expect(Object.values(wf.jobs).some((j) => j.strategy !== undefined)).toBe(false);
  });

  it('says in the issue that deployment is blocked', () => {
    expect(readFileSync(join(ROOT, 'scripts/ci/reportMainFailure.mjs'), 'utf8')).toContain('deployment stays blocked');
  });

  it('opens an issue when a job failed, and cancels itself when main has moved on', () => {
    expect(runs(wf.jobs.report)).toContain('scripts/ci/reportMainFailure.mjs');
    expect(wf.jobs.report.if).toMatch(/failure/);
    expect(runs(wf.jobs['still-current'])).toContain('gh run cancel');
  });

  it('does not let a badge problem stop a release', () => {
    expect(wf.jobs.publish['continue-on-error']).toBe(true);
  });
});

describe('the release and the deployment', () => {
  it('release waits for a green verification of main, and only a push releases', () => {
    const release = workflows['release.yml'];
    expect(release.on.push).toBeUndefined();
    expect((release.on.workflow_run as { workflows: string[] }).workflows).toEqual(['Main verification']);
    expect(release.jobs.release.if).toMatch(/conclusion == 'success'/);
    expect(release.jobs.release.if).toMatch(/event == 'push'/);
  });

  it('release pushes with the deploy key, because the ruleset on main would block the workflow token\'s push', () => {
    const checkout = (workflows['release.yml'].jobs.release.steps ?? []).find((s) => s.uses?.startsWith('actions/checkout')) as { with?: Record<string, string> } | undefined;
    expect(checkout?.with?.['ssh-key']).toBe('${{ secrets.RELEASE_DEPLOY_KEY }}');
  });

  it('release checks that the commit it releases is the verified one', () => {
    expect(JSON.stringify(workflows['release.yml'].jobs.release)).toContain('github.event.workflow_run.head_sha');
    expect(runs(workflows['release.yml'].jobs.release)).toContain('gh run cancel');
  });

  it('deploy follows the release, so a red main is never deployed', () => {
    const deploy = workflows['deploy.yml'];
    expect((deploy.on.workflow_run as { workflows: string[] }).workflows).toEqual(['Release']);
    expect(deploy.jobs.deploy.if).toMatch(/conclusion == 'success'/);
  });
});
