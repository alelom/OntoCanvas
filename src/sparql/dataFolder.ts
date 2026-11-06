/**
 * A local folder of data (#226, #227): the files under it, by their path inside the folder, from any of the three ways a browser
 * gives a folder:
 * - the folder picker, `showDirectoryPicker()` (Chrome and Edge): a handle, which can be kept and reopened on a later visit;
 * - a file input with `webkitdirectory` (every browser): the files, each with its path from the folder's name;
 * - a folder dropped on the page, `webkitGetAsEntry()` (every browser).
 *
 * The RDF files (compressed too, #223) are the data, the images are kept for previews (#228), and the rest is skipped and counted.
 * Hidden files and folders, Office lock files and downloads in progress are skipped whatever their extension. Only the list is
 * read here: a skipped file is never opened, so a cloud-synced file that is online only is not downloaded for nothing.
 */

/** A file of the folder: its path inside the folder, with `/` and without the folder's own name. */
export interface FolderFile {
  path: string;
  file: File;
}

export interface FolderContents {
  /** The folder's name. */
  name: string;
  /** The RDF files, by path in natural order (`part-2` before `part-10`). */
  data: FolderFile[];
  /** The image files, by path. */
  images: FolderFile[];
  /** How many other files there are: not data, not images, or hidden. */
  skipped: number;
  /**
   * The files, and the folders (ending in `/`), the browser listed but could not open: on Windows, those whose full path is longer
   * than 260 characters. Left out, so the rest of the folder is still added.
   */
  unreadable: string[];
}

export const DATA_EXTENSIONS = ['.ttl', '.turtle', '.nt', '.nq', '.trig', '.jsonld', '.rdf', '.owl', '.n3'];
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];

/** Above this many files the folder is not one dataset (a home folder, a whole drive): it is refused while it is listed. */
export const MAX_FOLDER_FILES = 20_000;

export class FolderTooLargeError extends Error {
  constructor(readonly folderName: string) {
    super(`${folderName} holds more than ${MAX_FOLDER_FILES.toLocaleString('en')} files: it does not look like one dataset. Open the folder of one run or dataset instead.`);
    this.name = 'FolderTooLargeError';
  }
}

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
};

/** An RDF file by its name, compressed or not: `part-0001.nq.gz`, `run.ttl`. A `.json` is not taken (a manifest, a config). */
export const isDataFileName = (path: string): boolean => DATA_EXTENSIONS.includes(extensionOf(baseName(path).replace(/\.gz$/i, '')));

export const isImageFileName = (path: string): boolean => IMAGE_EXTENSIONS.includes(extensionOf(baseName(path)));

/** Hidden (a part starting with a dot), an Office lock file (`~$…`), or a download in progress. */
export function isSkippedPath(path: string): boolean {
  const name = baseName(path);
  return path.split('/').some((part) => part.startsWith('.')) || name.startsWith('~$') || /\.(partial|crdownload|part|download|tmp)$/i.test(name);
}

/** A folder not worth going into: hidden, or a project's installed packages. */
const isSkippedFolder = (name: string): boolean => name.startsWith('.') || name === 'node_modules';

const naturally = new Intl.Collator(undefined, { numeric: true });
const byPath = (a: FolderFile, b: FolderFile): number => naturally.compare(a.path, b.path);

/** Sorts the files as they are listed, opening only those that are kept. */
function createCollector(name: string, signal?: AbortSignal, onCount?: (files: number) => void) {
  const contents: FolderContents = { name, data: [], images: [], skipped: 0, unreadable: [] };
  let seen = 0;
  /** The file, or null when the browser cannot open it (a DOMException: on Windows, a path too long). */
  const open = async (path: string, file: () => Promise<File> | File): Promise<File | null> => {
    try {
      return await file();
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      contents.unreadable.push(path);
      return null;
    }
  };
  return {
    /** `file` is called only for a file that is kept. */
    async add(path: string, file: () => Promise<File> | File): Promise<void> {
      if (signal?.aborted) throw new Error('Cancelled');
      if (++seen > MAX_FOLDER_FILES) throw new FolderTooLargeError(name);
      onCount?.(seen);
      if (isSkippedPath(path)) contents.skipped++;
      else if (isDataFileName(path) || isImageFileName(path)) {
        const opened = await open(path, file);
        if (opened) (isDataFileName(path) ? contents.data : contents.images).push({ path, file: opened });
      } else contents.skipped++;
    },
    /** Lists a subfolder with `walk`; one the browser cannot list is counted, and the rest of the folder still is. */
    async folder(path: string, walk: () => Promise<void>): Promise<void> {
      try {
        await walk();
      } catch (error) {
        if (!(error instanceof DOMException)) throw error;
        contents.unreadable.push(path);
      }
    },
    done(): FolderContents {
      contents.data.sort(byPath);
      contents.images.sort(byPath);
      return contents;
    },
  };
}

/** The files of an `<input webkitdirectory>`: each one's `webkitRelativePath` starts with the folder's name. */
export async function folderFromInput(files: File[]): Promise<FolderContents | null> {
  if (!files.length) return null;
  const relative = (file: File) => file.webkitRelativePath || file.name;
  const name = relative(files[0]).split('/')[0];
  const collector = createCollector(name);
  for (const file of files) await collector.add(relative(file).split('/').slice(1).join('/') || file.name, () => file);
  return collector.done();
}

/** Enough of `FileSystemDirectoryHandle` to list it. */
export interface DirectoryHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirectoryHandleLike | FileHandleLike>;
}
export interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

export interface ListOptions {
  signal?: AbortSignal;
  /** Called with how many files are listed so far: listing a cloud-synced folder can take a while. */
  onCount?: (files: number) => void;
}

/** A folder picked or dropped, not listed yet: listed when it is added, so the listing has the progress and Cancel. Null: nothing. */
export type FolderLister = (options: ListOptions) => Promise<FolderContents | null>;

/** A folder picked with `showDirectoryPicker()`, or dropped and given as a handle. */
export async function folderFromHandle(handle: DirectoryHandleLike, options: ListOptions = {}): Promise<FolderContents> {
  const collector = createCollector(handle.name, options.signal, options.onCount);
  const walk = async (dir: DirectoryHandleLike, prefix: string): Promise<void> => {
    for await (const entry of dir.values()) {
      if (entry.kind === 'directory') {
        const path = `${prefix}${entry.name}/`;
        if (!isSkippedFolder(entry.name)) await collector.folder(path, () => walk(entry, path));
      } else {
        await collector.add(`${prefix}${entry.name}`, () => entry.getFile());
      }
    }
  };
  await walk(handle, '');
  return collector.done();
}

/** Enough of the `FileSystemEntry` of a dropped folder (`webkitGetAsEntry()`) to list it. */
export interface DroppedEntryLike {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  file?(success: (file: File) => void, failure?: (error: unknown) => void): void;
  createReader?(): { readEntries(success: (entries: DroppedEntryLike[]) => void, failure?: (error: unknown) => void): void };
}

/** A folder dropped on the page. Its reader gives the entries a batch at a time, until an empty batch. */
export async function folderFromDroppedEntry(entry: DroppedEntryLike, options: ListOptions = {}): Promise<FolderContents> {
  const collector = createCollector(entry.name, options.signal, options.onCount);
  const fileOf = (e: DroppedEntryLike) => new Promise<File>((resolve, reject) => e.file!(resolve, reject));
  const walk = async (dir: DroppedEntryLike, prefix: string): Promise<void> => {
    const reader = dir.createReader!();
    for (;;) {
      const batch = await new Promise<DroppedEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) return;
      for (const child of batch) {
        if (child.isDirectory) {
          const path = `${prefix}${child.name}/`;
          if (!isSkippedFolder(child.name)) await collector.folder(path, () => walk(child, path));
        } else if (child.isFile) {
          await collector.add(`${prefix}${child.name}`, () => fileOf(child));
        }
      }
    }
  };
  await walk(entry, '');
  return collector.done();
}

/**
 * "3 data files", "1 image", "12 other files skipped": what was found, said once the folder is added; with the images its data names
 * that it does not hold, and what the browser could not open.
 */
export function folderSummary(contents: FolderContents, added: number, missingImages = 0): string {
  const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
  const parts = [`Added ${plural(added, 'data file', 'data files')} from ${contents.name}`];
  if (contents.images.length) parts.push(`${plural(contents.images.length, 'image', 'images')} kept for previews`);
  if (contents.skipped) parts.push(`${plural(contents.skipped, 'other file', 'other files')} skipped`);
  if (missingImages) parts.push(`${plural(missingImages, "image its data names isn't", "images its data names aren't")} in the folder`);
  if (contents.unreadable.length) parts.push(`${plural(contents.unreadable.length, 'file or folder', 'files or folders')} couldn't be opened`);
  return `${parts.join('; ')}.`;
}
