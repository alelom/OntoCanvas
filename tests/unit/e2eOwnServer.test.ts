/**
 * The E2E tests drive a server of their own, on a port globalSetup picks (#183). A test that spells the port of a
 * developer's `npm run dev` would drive that server instead: it may serve another branch, or a state from before an
 * install. The address comes from tests/e2e/editorUrl.ts, and from nowhere else.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const E2E_DIR = join(dirname(fileURLToPath(import.meta.url)), '../e2e');
// Comments in these two explain why the port is not 5173.
const EXPLAINS_THE_PORT = new Set(['editorUrl.ts', 'globalSetup.ts']);

describe('the E2E tests do not know a port', () => {
  const files = readdirSync(E2E_DIR).filter((f) => f.endsWith('.ts') && !EXPLAINS_THE_PORT.has(f));

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(60);
  });

  it.each(files)('%s does not spell the dev server\'s address', (file) => {
    const text = readFileSync(join(E2E_DIR, file), 'utf-8');
    expect(text).not.toMatch(/(localhost|127\.0\.0\.1|\[::1\]):5173/);
  });

  it('globalSetup never reuses a server that is already running', () => {
    const text = readFileSync(join(E2E_DIR, 'globalSetup.ts'), 'utf-8');
    expect(text).not.toMatch(/Server was already running|already running \(/i);
    expect(text).toContain('freePort');
    expect(text).toContain('--strictPort');
  });
});
