/**
 * Global setup for unit tests. Polyfills browser globals required by some dependencies
 * (e.g. rdf-parse → undici expects File).
 */
import { ensureLocalStorage } from './storageShim';

if (typeof globalThis.File === 'undefined') {
  (globalThis as unknown as { File: unknown }).File = class File {
    constructor(
      public readonly bits: BlobPart[],
      public readonly name: string,
      _options?: { type?: string; lastModified?: number }
    ) {}
  };
}

// A jsdom test needs a working localStorage; on a recent Node the global one shadows jsdom's and is undefined (#175).
if (typeof document !== 'undefined') {
  ensureLocalStorage(globalThis);
}
