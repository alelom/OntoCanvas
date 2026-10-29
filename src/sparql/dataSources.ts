/**
 * The data added to the open ontology (#205): files or URLs whose triples are queried together with the ontology and never
 * saved. Each source has a store of its own, so one can be removed without touching the others or the ontology's store.
 *
 * Size tiers are by size in bytes, the cheap predictor (about 17 bytes and 1.2 KB of heap per triple for this shape of data):
 * up to 2 MB (some 100k triples) loads, up to 10 MB (some 500k) asks first, above is refused.
 */
import type { Store } from 'n3';
import { parseIntoStoreInSlices, type SlicedParseOptions } from '../rdf/parseIntoStore';

export const DATA_LOAD_LIMIT_BYTES = 2 * 1024 * 1024;
export const DATA_REFUSE_LIMIT_BYTES = 10 * 1024 * 1024;

export type SizeTier = 'load' | 'confirm' | 'refuse';

const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function classifyDataSize(bytes: number): { tier: SizeTier; message?: string } {
  if (bytes > DATA_REFUSE_LIMIT_BYTES) {
    return {
      tier: 'refuse',
      message: `This file is ${megabytes(bytes)}, too large to load in the browser: the limit is ${megabytes(DATA_REFUSE_LIMIT_BYTES)} (about 500,000 triples).`,
    };
  }
  if (bytes > DATA_LOAD_LIMIT_BYTES) {
    return {
      tier: 'confirm',
      message: `This file is ${megabytes(bytes)}: loading it is slow and memory heavy (about 1 GB of memory per 800,000 triples), and queries over it should be selective. Load it?`,
    };
  }
  return { tier: 'load' };
}

export interface DataSource {
  id: number;
  name: string;
  store: Store;
  triples: number;
  bytes: number;
}

export interface AddDataOptions extends SlicedParseOptions {
  /** The size of the file when it is known before the text is (a download's Content-Length); defaults to the text's length. */
  byteLength?: number;
  /** Asked for a source in the middle band; false cancels. Defaults to going ahead. */
  confirm?: (message: string) => Promise<boolean>;
}

/** A file as the browser gives it: enough of the File interface to read it later. */
export interface DataFile {
  name: string;
  size: number;
  text(): Promise<string>;
}

export interface AddUrlOptions extends AddDataOptions {
  fetch?: typeof fetch;
}

export interface DataSources {
  list(): DataSource[];
  /** The stores queries run over together with the ontology's. */
  stores(): Store[];
  addText(name: string, content: string, options?: AddDataOptions): Promise<DataSource>;
  /** The size of a file is known before it is read: a file above the limit is refused unread, a large one is asked about first. */
  addFile(file: DataFile, options?: AddDataOptions): Promise<DataSource>;
  /** Downloads a URL (http or https). The Content-Length, when the server gives one, is checked before the body is read. */
  addUrl(url: string, options?: AddUrlOptions): Promise<DataSource>;
  remove(id: number): void;
  clear(): void;
  onChange(listener: () => void): void;
}

/** Types a server gives to any text or file (raw.githubusercontent.com says text/plain for a .ttl): no information about the format. */
const GENERIC_CONTENT_TYPE = /^(text\/plain|application\/octet-stream|binary\/octet-stream)?$/i;

const nameOfUrl = (url: string): string => {
  const path = new URL(url).pathname;
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || new URL(url).host;
};

export function createDataSources(): DataSources {
  let sources: DataSource[] = [];
  let nextId = 1;
  const listeners: Array<() => void> = [];
  const changed = () => listeners.forEach((listener) => listener());

  const self: DataSources = {
    list: () => [...sources],
    stores: () => sources.map((s) => s.store),
    async addText(name, content, options = {}) {
      const bytes = options.byteLength ?? content.length;
      const { tier, message } = classifyDataSize(bytes);
      if (tier === 'refuse') throw new Error(message);
      if (tier === 'confirm' && options.confirm && !(await options.confirm(message!))) throw new Error('Cancelled');
      const { store } = await parseIntoStoreInSlices(content, options);
      const source: DataSource = { id: nextId++, name, store, triples: store.size, bytes };
      sources = [...sources, source];
      changed();
      return source;
    },
    async addFile(file, options = {}) {
      const { tier, message } = classifyDataSize(file.size);
      if (tier === 'refuse') throw new Error(message);
      if (tier === 'confirm' && options.confirm && !(await options.confirm(message!))) throw new Error('Cancelled');
      const text = await file.text();
      // Already asked: the size is the file's, not the text's.
      return self.addText(file.name, text, { ...options, path: options.path ?? file.name, byteLength: file.size, confirm: undefined });
    },
    async addUrl(url, options = {}) {
      if (!/^https?:\/\//i.test(url)) throw new Error('Only http and https addresses can be added.');
      let response: Response;
      try {
        response = await (options.fetch ?? fetch)(url, { signal: options.signal });
      } catch (error) {
        if (options.signal?.aborted) throw new Error('Cancelled');
        throw new Error(`The address could not be fetched: the address may be wrong, or the server does not allow this page to read it (CORS). ${error instanceof Error ? error.message : ''}`.trim());
      }
      if (!response.ok) throw new Error(`The server answered ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`);
      const announced = Number(response.headers.get('content-length'));
      if (Number.isFinite(announced) && announced > 0) {
        const { tier, message } = classifyDataSize(announced);
        if (tier === 'refuse') {
          void response.body?.cancel();
          throw new Error(message);
        }
      }
      const text = await response.text();
      // The size to judge by is the larger of the two: Content-Length is that of the body as sent (compressed, in a browser) and a
      // lower bound, while the text is what is decoded and held in memory (Turtle is commonly five to ten times its gzip).
      // The end of the address tells the format when the server's type is a generic one, as the main loader does.
      const announcedType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
      const contentType = GENERIC_CONTENT_TYPE.test(announcedType) ? undefined : announcedType;
      return self.addText(nameOfUrl(url), text, { ...options, path: options.path ?? url, contentType: options.contentType ?? contentType, byteLength: Math.max(announced > 0 ? announced : 0, text.length) });
    },
    remove(id) {
      const next = sources.filter((s) => s.id !== id);
      if (next.length === sources.length) return;
      sources = next;
      changed();
    },
    clear() {
      if (!sources.length) return;
      sources = [];
      changed();
    },
    onChange: (listener) => void listeners.push(listener),
  };
  return self;
}
