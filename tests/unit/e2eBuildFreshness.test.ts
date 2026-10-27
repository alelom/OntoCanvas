/**
 * When the E2E global setup may reuse dist/ instead of building (#174, #175).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDistFresh, newestInputTime, writeStamp } from '../e2e/buildFreshness';

let root: string;
const touch = (rel: string, mtimeMs: number, content = 'x') => {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  utimesSync(path, mtimeMs / 1000, mtimeMs / 1000);
};
const T = 1_700_000_000_000;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'e2e-fresh-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('newestInputTime', () => {
  it('is the newest modification time among the build inputs, in nested directories too', () => {
    touch('src/a.ts', T);
    touch('src/deep/er/b.ts', T + 5000);
    touch('index.html', T + 2000);
    touch('public/logo.png', T + 1000);
    expect(newestInputTime(root)).toBe(T + 5000);
  });

  it('counts the root files a build reads, and ignores everything else', () => {
    touch('src/a.ts', T);
    touch('package-lock.json', T + 9000);
    touch('README.md', T + 99000);
    touch('tests/unit/x.test.ts', T + 99000);
    touch('dist/old.js', T + 99000);
    expect(newestInputTime(root)).toBe(T + 9000);
  });

  it('is 0 when there are no inputs', () => {
    expect(newestInputTime(root)).toBe(0);
  });
});

describe('isDistFresh', () => {
  const build = (builtAt: number) => {
    touch('dist/index.html', builtAt);
    writeStamp(root, builtAt);
  };

  it('says there is no build before one exists', () => {
    touch('src/a.ts', T);
    expect(isDistFresh(root)).toEqual({ fresh: false, reason: 'there is no build' });
  });

  it('trusts a build made after the newest source', () => {
    touch('src/a.ts', T);
    build(T + 1000);
    expect(isDistFresh(root).fresh).toBe(true);
  });

  it('does not trust a build when a source is newer, in src or at the root', () => {
    touch('src/a.ts', T);
    build(T + 1000);
    touch('src/a.ts', T + 2000);
    expect(isDistFresh(root)).toEqual({ fresh: false, reason: 'a source is newer than the build' });

    build(T + 3000);
    expect(isDistFresh(root).fresh).toBe(true);
    touch('package.json', T + 4000);
    expect(isDistFresh(root).fresh).toBe(false);
  });

  it('never trusts a dist/ the setup did not build, whatever its time', () => {
    touch('src/a.ts', T);
    touch('dist/index.html', T + 99999);
    expect(isDistFresh(root)).toEqual({ fresh: false, reason: 'dist/ was not built by this setup' });
  });

  it('does not trust an unreadable or timeless stamp', () => {
    touch('src/a.ts', T);
    touch('dist/index.html', T + 1000);
    writeFileSync(join(root, 'dist', '.e2e-build.json'), 'not json');
    expect(isDistFresh(root).fresh).toBe(false);
    writeFileSync(join(root, 'dist', '.e2e-build.json'), '{}');
    expect(isDistFresh(root).fresh).toBe(false);
  });
});
