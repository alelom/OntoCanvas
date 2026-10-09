/**
 * Unit tests for finding the local file of an external ontology (src/lib/localFileOpener.ts), and for
 * getting the folder to look in (src/lib/ontologyDirectory.ts, #103).
 *
 * Moved from tests/e2e/localFileOpening.e2e.test.ts. The folder used to come only from
 * FileSystemFileHandle.getParent(), which Chromium doesn't implement, so the lookup never ran (#103). The
 * folder is now asked for once with showDirectoryPicker(); here both are faked.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findMatchingLocalFile } from '../../src/lib/localFileOpener';
import { getOrRequestOntologyDirectory, forgetOntologyDirectory } from '../../src/lib/ontologyDirectory';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IMPORTED_DIR = join(__dirname, '../fixtures/imported-ontology');

/** A fake directory holding `files` (name → content), listable like a real directory handle. */
function fakeDirectory(files: Record<string, string>): FileSystemDirectoryHandle {
  const fileHandle = (name: string) => ({ name, kind: 'file', getFile: async () => ({ text: async () => files[name] }) });
  return {
    kind: 'directory',
    async getFileHandle(name: string) {
      if (!(name in files)) throw new DOMException('Not found', 'NotFoundError');
      return fileHandle(name);
    },
    async *values() {
      for (const name of Object.keys(files)) yield fileHandle(name);
    },
  } as unknown as FileSystemDirectoryHandle;
}

const fixture = (name: string) => readFileSync(join(IMPORTED_DIR, name), 'utf-8');

describe('findMatchingLocalFile', () => {
  it('finds the file whose ontology IRI is the external ontology URL', async () => {
    // object-props-child-child.ttl imports <http://example.org/object-extended>, defined in object-props-child.ttl.
    const dir = fakeDirectory({
      'object-props-child-child.ttl': fixture('object-props-child-child.ttl'),
      'object-props-child.ttl': fixture('object-props-child.ttl'),
      'object-props-parent.ttl': fixture('object-props-parent.ttl'),
    });

    const match = await findMatchingLocalFile(dir, 'object-props-child-child.ttl', 'http://example.org/object-extended');

    expect(match).not.toBeNull();
    expect(match!.fileName).toBe('object-props-child.ttl');
    expect(match!.pathHint).toBe('object-props-child.ttl');
    expect(match!.content).toBe(fixture('object-props-child.ttl'));
  });

  it('finds it under any name, by reading the folder (#103)', async () => {
    const dir = fakeDirectory({ 'notes.txt': 'not an ontology', 'extended-terms.ttl': fixture('object-props-child.ttl') });

    const match = await findMatchingLocalFile(dir, 'object-props-child-child.ttl', 'http://example.org/object-extended');

    expect(match?.fileName).toBe('extended-terms.ttl');
  });

  it('matches the external URL with a trailing # or /', async () => {
    const dir = fakeDirectory({ 'object-props-child.ttl': fixture('object-props-child.ttl') });

    for (const url of ['http://example.org/object-extended#', 'http://example.org/object-extended/']) {
      const match = await findMatchingLocalFile(dir, 'object-props-child-child.ttl', url);
      expect(match?.fileName).toBe('object-props-child.ttl');
    }
  });

  it('does not read files that merely end in an RDF extension without its dot', async () => {
    // "extended-termsttl" and "notesjson" end in "ttl"/"json" but have no extension; they are not RDF files.
    const dir = fakeDirectory({
      'extended-termsttl': fixture('object-props-child.ttl'),
      'notesjson': fixture('object-props-child.ttl'),
    });

    const match = await findMatchingLocalFile(dir, 'object-props-child-child.ttl', 'http://example.org/object-extended');

    expect(match).toBeNull();
  });

  it('does not strip a character before the extension when deriving likely names', async () => {
    // The open file "object-propsXttl" has no extension, so its whole name is the base. With the unescaped dot
    // the base became "object-props" and "object-props.ttl" was guessed; the folder scan must be what finds it.
    const dir = fakeDirectory({ 'object-props.ttl': fixture('object-props-child.ttl') });
    const asked: string[] = [];
    const original = dir.getFileHandle.bind(dir);
    dir.getFileHandle = (async (name: string, o?: FileSystemGetFileOptions) => {
      asked.push(name);
      return original(name, o);
    }) as typeof dir.getFileHandle;

    const match = await findMatchingLocalFile(dir, 'object-propsXttl', 'http://example.org/object-extended');

    expect(match?.fileName).toBe('object-props.ttl');
    expect(asked).not.toContain('object-props.ttl');
  });

  it('does not return a file whose ontology IRI is a different ontology', async () => {
    // object-props-parent.ttl defines <http://example.org/object-base>, not object-extended.
    const dir = fakeDirectory({ 'object-props-child.ttl': fixture('object-props-parent.ttl') });

    const match = await findMatchingLocalFile(dir, 'object-props-child-child.ttl', 'http://example.org/object-extended');

    expect(match).toBeNull();
  });
});

describe('getOrRequestOntologyDirectory (#103)', () => {
  const picked = fakeDirectory({});
  let pickerCalls = 0;
  const g = globalThis as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> };

  beforeEach(() => {
    forgetOntologyDirectory();
    pickerCalls = 0;
    g.showDirectoryPicker = async () => {
      pickerCalls++;
      return picked;
    };
  });
  afterEach(() => {
    delete g.showDirectoryPicker;
    forgetOntologyDirectory();
  });

  it('asks for the folder once, then remembers it', async () => {
    expect(await getOrRequestOntologyDirectory(null)).toBe(picked);
    expect(await getOrRequestOntologyDirectory(null)).toBe(picked);
    expect(pickerCalls).toBe(1);
  });

  it('asks again after another ontology is opened', async () => {
    await getOrRequestOntologyDirectory(null);
    forgetOntologyDirectory();
    await getOrRequestOntologyDirectory(null);
    expect(pickerCalls).toBe(2);
  });

  it("uses the file's own folder without asking, where the browser provides it", async () => {
    const parent = fakeDirectory({});
    const handle = { kind: 'file', getParent: async () => parent } as unknown as FileSystemFileHandle;
    expect(await getOrRequestOntologyDirectory(handle)).toBe(parent);
    expect(pickerCalls).toBe(0);
  });

  it('returns null when the user cancels, without remembering it', async () => {
    g.showDirectoryPicker = async () => {
      pickerCalls++;
      throw new DOMException('The user aborted a request.', 'AbortError');
    };
    expect(await getOrRequestOntologyDirectory(null)).toBeNull();
    expect(await getOrRequestOntologyDirectory(null)).toBeNull();
    expect(pickerCalls).toBe(2);
  });

  it('returns null without a picker (browsers other than Chromium)', async () => {
    delete g.showDirectoryPicker;
    expect(await getOrRequestOntologyDirectory(null)).toBeNull();
  });
});
