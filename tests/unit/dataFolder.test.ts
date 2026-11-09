/**
 * A local folder of data (#226, #227): its files listed from a file input, a picked handle or a dropped entry, sorted into data,
 * images and the rest, with hidden and partial files skipped and a skipped file never opened.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  folderFromDroppedEntry,
  folderFromHandle,
  folderFromInput,
  folderSummary,
  FolderTooLargeError,
  isDataFileName,
  isImageFileName,
  isSkippedPath,
  MAX_FOLDER_FILES,
  type DirectoryHandleLike,
  type DroppedEntryLike,
  type FileHandleLike,
} from '../../src/sparql/dataFolder';

const file = (name: string, relativePath?: string): File => {
  const f = new File(['x'], name);
  if (relativePath) Object.defineProperty(f, 'webkitRelativePath', { value: relativePath });
  return f;
};

/** A tree as nested objects: a string is a file, an object a folder. */
type Tree = { [name: string]: Tree | string };
/** A file, or a folder, the browser lists but cannot open (on Windows, a path longer than 260 characters). */
const UNREADABLE = '!unreadable';
const UNREADABLE_DIR = '!unreadable-dir';

function handleOf(name: string, tree: Tree, opened: string[] = []): DirectoryHandleLike {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const [child, value] of Object.entries(tree)) {
        if (value === UNREADABLE_DIR) {
          // A folder the browser cannot list, as one whose path is too long on Windows.
          yield { kind: 'directory', name: child, values: async function* () { throw new DOMException('gone', 'NotFoundError'); } } as DirectoryHandleLike;
        } else if (typeof value === 'string') {
          const getFile = value === UNREADABLE ? () => Promise.reject(new DOMException('gone', 'NotFoundError')) : async () => (opened.push(child), file(child));
          const handle: FileHandleLike = { kind: 'file', name: child, getFile };
          yield handle;
        } else {
          yield handleOf(child, value, opened);
        }
      }
    },
  };
}

/** A dropped folder whose reader gives two entries at a time, as browsers give them in batches. */
function entryOf(name: string, tree: Tree): DroppedEntryLike {
  const children = Object.entries(tree).map(([child, value]): DroppedEntryLike =>
    value === UNREADABLE ? { name: child, isFile: true, isDirectory: false, file: (_ok, fail) => fail?.(new DOMException('gone', 'NotFoundError')) }
    : typeof value === 'string' ? { name: child, isFile: true, isDirectory: false, file: (ok) => ok(file(child)) }
    : entryOf(child, value as Tree)
  );
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader() {
      let at = 0;
      return { readEntries: (ok) => ok(children.slice(at, (at += 2))) };
    },
  };
}

const RUN: Tree = {
  'part-0010.nq.gz': '',
  'part-0002.nq.gz': '',
  'run.ttl': '',
  'README.md': '',
  'manifest.json': '',
  '~$notes.docx': '',
  'part-0003.nq.gz.partial': '',
  '.hidden.ttl': '',
  images: { 'page-1': { 'titleblock.png': '', 'crop.JPG': '' } },
  '.git': { 'config.ttl': '' },
  node_modules: { 'x.ttl': '' },
};

describe('which files are data, images, or skipped', () => {
  it('takes the RDF extensions, compressed or not, and not .json', () => {
    expect(['a.ttl', 'b.nq.gz', 'c.TRIG', 'd.jsonld', 'e.owl', 'f.nt'].every(isDataFileName)).toBe(true);
    expect(['manifest.json', 'archive.gz', 'notes.txt', 'ttl'].some(isDataFileName)).toBe(false);
  });

  it('takes the image extensions, whatever their case', () => {
    expect(['a.png', 'b.JPG', 'c.jpeg', 'd.svg', 'e.webp', 'f.gif'].every(isImageFileName)).toBe(true);
    expect(isImageFileName('a.tif')).toBe(false);
  });

  it('skips hidden paths, Office lock files and downloads in progress', () => {
    expect(['.hidden.ttl', 'sub/.git/x.ttl', '~$notes.docx', 'part-1.nq.gz.partial', 'a.ttl.crdownload'].every(isSkippedPath)).toBe(true);
    expect(isSkippedPath('run.part03.trig')).toBe(false);
  });

  it("skips what is in a project's node_modules, as the picker and a drop do: the folder input (Firefox, Safari) too (#240 review)", () => {
    expect(isSkippedPath('node_modules/pkg/vocab.ttl')).toBe(true);
    expect(isSkippedPath('sub/node_modules/a.jsonld')).toBe(true);
    expect(isSkippedPath('node_modules.ttl')).toBe(false);
  });
});

describe('folderFromHandle (the folder picker)', () => {
  it('sorts the files into data in natural order, images and the rest, without going into hidden folders or node_modules', async () => {
    const contents = await folderFromHandle(handleOf('run-0001', RUN));

    expect(contents.name).toBe('run-0001');
    expect(contents.data.map((f) => f.path)).toEqual(['part-0002.nq.gz', 'part-0010.nq.gz', 'run.ttl']);
    expect(contents.images.map((f) => f.path)).toEqual(['images/page-1/crop.JPG', 'images/page-1/titleblock.png']);
    // README, manifest, the lock file, the partial download and the hidden file.
    expect(contents.skipped).toBe(5);
  });

  it('opens only the files it keeps: a skipped one, perhaps online only in a synced folder, is never read', async () => {
    const opened: string[] = [];
    await folderFromHandle(handleOf('run-0001', RUN, opened));

    expect(opened.sort()).toEqual(['crop.JPG', 'part-0002.nq.gz', 'part-0010.nq.gz', 'run.ttl', 'titleblock.png']);
  });

  it('counts a file or a folder it cannot open, and lists the rest (#240: a crop whose path is too long failed the whole folder)', async () => {
    const contents = await folderFromHandle(handleOf('run', { 'part-0001.nq.gz': '', images: { a: { 'titleblock.png': UNREADABLE }, b: UNREADABLE_DIR } }));

    expect(contents.data.map((f) => f.path)).toEqual(['part-0001.nq.gz']);
    expect(contents.images).toEqual([]);
    expect(contents.unreadable).toEqual(['images/a/titleblock.png', 'images/b/']);
  });

  it('counts the files as it lists them, and stops on Cancel', async () => {
    const counts: number[] = [];
    await folderFromHandle(handleOf('f', { 'a.ttl': '', 'b.ttl': '' }), { onCount: (n) => counts.push(n) });
    expect(counts).toEqual([1, 2]);

    const controller = new AbortController();
    controller.abort();
    await expect(folderFromHandle(handleOf('f', { 'a.ttl': '' }), { signal: controller.signal })).rejects.toThrow('Cancelled');
  });

  it(`refuses a folder of more than ${MAX_FOLDER_FILES.toLocaleString('en')} files while it lists it`, async () => {
    const many: Tree = Object.fromEntries(Array.from({ length: MAX_FOLDER_FILES + 1 }, (_, i) => [`f${i}.txt`, '']));
    const onCount = vi.fn();

    await expect(folderFromHandle(handleOf('home', many), { onCount })).rejects.toBeInstanceOf(FolderTooLargeError);
    expect(onCount).toHaveBeenCalledTimes(MAX_FOLDER_FILES);
  });
});

describe('folderFromDroppedEntry (a folder dropped on the page)', () => {
  it('reads every batch of the reader, and sorts the files the same way', async () => {
    const contents = await folderFromDroppedEntry(entryOf('run-0001', RUN));

    expect(contents.data.map((f) => f.path)).toEqual(['part-0002.nq.gz', 'part-0010.nq.gz', 'run.ttl']);
    expect(contents.images.map((f) => f.path)).toEqual(['images/page-1/crop.JPG', 'images/page-1/titleblock.png']);
    expect(contents.skipped).toBe(5);
  });

  it('counts a file it cannot open, and lists the rest', async () => {
    const contents = await folderFromDroppedEntry(entryOf('run', { 'a.ttl': '', images: { 'titleblock.png': UNREADABLE } }));

    expect(contents.data.map((f) => f.path)).toEqual(['a.ttl']);
    expect(contents.unreadable).toEqual(['images/titleblock.png']);
  });
});

describe('folderFromInput (<input webkitdirectory>)', () => {
  it("takes the folder's name from the paths, and the paths without it", async () => {
    const contents = await folderFromInput([
      file('part-0001.nq.gz', 'run-0001/part-0001.nq.gz'),
      file('titleblock.png', 'run-0001/images/page-1/titleblock.png'),
      file('README.md', 'run-0001/README.md'),
      file('x.ttl', 'run-0001/.git/x.ttl'),
    ]);

    expect(contents).toMatchObject({ name: 'run-0001', skipped: 2 });
    expect(contents!.data.map((f) => f.path)).toEqual(['part-0001.nq.gz']);
    expect(contents!.images.map((f) => f.path)).toEqual(['images/page-1/titleblock.png']);
  });

  it('gives nothing for no files (an empty folder, or the dialog cancelled)', async () => {
    expect(await folderFromInput([])).toBeNull();
  });
});

describe('folderSummary', () => {
  it('says what was added, kept and skipped, leaving out what is none', () => {
    const contents = { name: 'run-0001', data: [], images: [{}, {}], skipped: 1, unreadable: [] } as never;
    expect(folderSummary(contents, 3)).toBe('Added 3 data files from run-0001; 2 images kept for previews; 1 other file skipped.');
    expect(folderSummary({ name: 'f', data: [], images: [], skipped: 0, unreadable: [] }, 1)).toBe('Added 1 data file from f.');
  });
});
