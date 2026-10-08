/**
 * Unit tests for finding the local sibling file of an external ontology (src/lib/localFileOpener.ts).
 *
 * Moved from tests/e2e/localFileOpening.e2e.test.ts: the E2E flow needs a FileSystemFileHandle with a
 * `getParent()` method, which a browser cannot provide to a test (files opened through the file input have
 * no handle at all), so the matching logic is tested here with a fake directory instead. The E2E file keeps
 * the part a browser can run: a `?localFile=` tab loading the stored content.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findMatchingLocalFile } from '../../src/lib/localFileOpener';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IMPORTED_DIR = join(__dirname, '../fixtures/imported-ontology');

/** A fake file handle whose parent directory holds `files` (name → content). */
function fakeHandleInDirectory(files: Record<string, string>, withGetParent = true): FileSystemFileHandle {
  const directory = {
    async getFileHandle(name: string) {
      if (!(name in files)) throw new DOMException('Not found', 'NotFoundError');
      return { name, kind: 'file', getFile: async () => ({ text: async () => files[name] }) };
    },
  };
  const handle: Record<string, unknown> = { name: 'current.ttl', kind: 'file' };
  if (withGetParent) handle.getParent = async () => directory;
  return handle as unknown as FileSystemFileHandle;
}

const fixture = (name: string) => readFileSync(join(IMPORTED_DIR, name), 'utf-8');

describe('findMatchingLocalFile', () => {
  it('finds the sibling file whose ontology IRI is the external ontology URL', async () => {
    // object-props-child-child.ttl imports <http://example.org/object-extended>, defined in object-props-child.ttl.
    const handle = fakeHandleInDirectory({
      'object-props-child-child.ttl': fixture('object-props-child-child.ttl'),
      'object-props-child.ttl': fixture('object-props-child.ttl'),
      'object-props-parent.ttl': fixture('object-props-parent.ttl'),
    });

    const match = await findMatchingLocalFile(handle, 'object-props-child-child.ttl', 'http://example.org/object-extended');

    expect(match).not.toBeNull();
    expect(match!.fileName).toBe('object-props-child.ttl');
    expect(match!.pathHint).toBe('object-props-child.ttl');
    expect(match!.content).toBe(fixture('object-props-child.ttl'));
  });

  it('matches the external URL with a trailing # or /', async () => {
    const handle = fakeHandleInDirectory({ 'object-props-child.ttl': fixture('object-props-child.ttl') });

    for (const url of ['http://example.org/object-extended#', 'http://example.org/object-extended/']) {
      const match = await findMatchingLocalFile(handle, 'object-props-child-child.ttl', url);
      expect(match?.fileName).toBe('object-props-child.ttl');
    }
  });

  it('does not return a sibling whose ontology IRI is a different ontology', async () => {
    // object-props-parent.ttl defines <http://example.org/object-base>, not object-extended.
    const handle = fakeHandleInDirectory({ 'object-props-child.ttl': fixture('object-props-parent.ttl') });

    const match = await findMatchingLocalFile(handle, 'object-props-child-child.ttl', 'http://example.org/object-extended');

    expect(match).toBeNull();
  });

  it('returns null when the file handle cannot reach its directory (no getParent)', async () => {
    const handle = fakeHandleInDirectory({ 'object-props-child.ttl': fixture('object-props-child.ttl') }, false);

    const match = await findMatchingLocalFile(handle, 'object-props-child-child.ttl', 'http://example.org/object-extended');

    expect(match).toBeNull();
  });
});
