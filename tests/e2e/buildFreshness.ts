/**
 * Is the bundle in dist/ still the one the sources would build? (#174, #175)
 *
 * The E2E global setup used to build on every run (about 40 to 50 s), even for one test file. It now builds only when
 * a build input is newer than the last build the setup itself made. A dist/ that the setup did not build (by hand,
 * or with other VITE_* variables, such as another base path) carries no stamp and is never trusted.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What a build reads: these directories (recursively) and files. */
export const BUILD_INPUTS = {
  dirs: ['src', 'public'],
  files: ['index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'],
};

export const STAMP_FILE = join('dist', '.e2e-build.json');

function newestIn(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestIn(path));
    else newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest;
}

/** The modification time of the newest build input, in ms; 0 when there is none. */
export function newestInputTime(root: string): number {
  let newest = 0;
  for (const dir of BUILD_INPUTS.dirs) if (existsSync(join(root, dir))) newest = Math.max(newest, newestIn(join(root, dir)));
  for (const file of BUILD_INPUTS.files) if (existsSync(join(root, file))) newest = Math.max(newest, statSync(join(root, file)).mtimeMs);
  return newest;
}

/** Record that the setup built dist/ starting at `startedAt` (before it read any input). */
export function writeStamp(root: string, startedAt: number): void {
  writeFileSync(join(root, STAMP_FILE), JSON.stringify({ builtAt: startedAt }));
}

export function isDistFresh(root: string): { fresh: boolean; reason: string } {
  if (!existsSync(join(root, 'dist', 'index.html'))) return { fresh: false, reason: 'there is no build' };
  const stampPath = join(root, STAMP_FILE);
  if (!existsSync(stampPath)) return { fresh: false, reason: 'dist/ was not built by this setup' };
  let builtAt: unknown;
  try {
    builtAt = (JSON.parse(readFileSync(stampPath, 'utf8')) as { builtAt?: unknown }).builtAt;
  } catch {
    return { fresh: false, reason: 'the build stamp is unreadable' };
  }
  if (typeof builtAt !== 'number') return { fresh: false, reason: 'the build stamp has no time' };
  const newest = newestInputTime(root);
  if (newest > builtAt) return { fresh: false, reason: 'a source is newer than the build' };
  return { fresh: true, reason: 'no source is newer than the build' };
}
