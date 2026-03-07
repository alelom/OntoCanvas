/**
 * Global setup for unit tests. Polyfills browser globals required by some dependencies
 * (e.g. rdf-parse → undici expects File).
 */
if (typeof globalThis.File === 'undefined') {
  (globalThis as unknown as { File: unknown }).File = class File {
    constructor(
      public readonly bits: BlobPart[],
      public readonly name: string,
      _options?: { type?: string; lastModified?: number }
    ) {}
  };
}
