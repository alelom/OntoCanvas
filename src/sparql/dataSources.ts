/**
 * The data added to the open ontology (#205): files or URLs whose triples are queried together with the ontology and never
 * saved. Each source has a store of its own, so one can be removed without touching the others or the ontology's store.
 *
 * Size tiers are by size in bytes, the cheap predictor (about 17 bytes and 1.2 KB of heap per triple for this shape of data):
 * up to 2 MB (some 100k triples) loads, up to 10 MB (some 500k) asks first, above is refused.
 */
import type { Store } from 'n3';
import { parseIntoStoreInSlices, type SlicedParseOptions } from '../rdf/parseIntoStore';
import { filterGraphs, listGraphs, type DataGraph } from './dataGraphs';
import { DataTooLargeError, isGzipName, GZIP_ESTIMATE_RATIO, nameWithoutGz, readAsText } from './readDataBytes';

export const DATA_LOAD_LIMIT_BYTES = 2 * 1024 * 1024;
export const DATA_REFUSE_LIMIT_BYTES = 10 * 1024 * 1024;

export type SizeTier = 'load' | 'confirm' | 'refuse';

export const megabytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** What to do about data too large for the browser (#223). Decompressing it first does not help: the limit is on the data. */
export const TOO_LARGE_ADVICE = 'Load fewer files (one part, one batch), or use a tool with a database for the whole dataset.';

const SLOW = 'loading it is slow and memory heavy (about 1 GB of memory per 800,000 triples), and queries over it should be selective';

/** `subject` says what is measured, with its size: "This file is 5.0 MB" by default, or a selection of files (#222). */
export function classifyDataSize(bytes: number, subject = `This file is ${megabytes(bytes)}`): { tier: SizeTier; message?: string } {
  if (bytes > DATA_REFUSE_LIMIT_BYTES) {
    return {
      tier: 'refuse',
      message: `${subject}, too large to load in the browser: the limit is ${megabytes(DATA_REFUSE_LIMIT_BYTES)} (about 500,000 triples). ${TOO_LARGE_ADVICE}`,
    };
  }
  if (bytes > DATA_LOAD_LIMIT_BYTES) return { tier: 'confirm', message: `${subject}: ${SLOW}. Load it?` };
  return { tier: 'load' };
}

/**
 * The question asked before reading compressed data whose estimate is large (#223). Never a refusal: the estimate may be well
 * above the data, and the read stops at the limit if the data passes it.
 */
export function compressedDataQuestion(subject: string, limitBytes = DATA_REFUSE_LIMIT_BYTES): string {
  return `${subject} (an estimate): ${SLOW}, and the read stops if the data passes ${megabytes(limitBytes)}. Load it?`;
}

/** Why data read in part was not added: it passed the limit (#223). */
export function tooLargeWhileReading(name: string, error: DataTooLargeError): string {
  const what = error.compressed ? 'of data once decompressed' : 'of data';
  return `${name} holds more than ${megabytes(error.limitBytes)} ${what}, too large to load in the browser. ${TOO_LARGE_ADVICE}`;
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
  /**
   * The most bytes of data (decompressed) a file or a download may hold; defaults to the refuse limit. A selection of files
   * passes what is left of the limit after the files before (#222).
   */
  limitBytes?: number;
}

/** A file as the browser gives it: enough of the File interface to read it later. */
export interface DataFile {
  name: string;
  size: number;
  text(): Promise<string>;
  /** Its bytes, for a compressed file (#223); without it, the file is read as text. */
  stream?(): ReadableStream<Uint8Array>;
}

export interface AddUrlOptions extends AddDataOptions {
  fetch?: typeof fetch;
}

export interface DataSources {
  list(): DataSource[];
  /** The stores queries run over together with the ontology's: every graph. */
  stores(): Store[];
  /** The stores without the hidden graphs (#224): what the Individuals tab and the graph show. */
  visibleStores(): Store[];
  /** The named graphs of the data, across the sources (#224). `labelStores`: where else a graph's label may be stated. */
  graphs(labelStores?: Store[]): DataGraph[];
  isGraphHidden(key: string): boolean;
  setGraphHidden(key: string, hidden: boolean): void;
  addText(name: string, content: string, options?: AddDataOptions): Promise<DataSource>;
  /** The size of a file is known before it is read: a file above the limit is refused unread, a large one is asked about first. */
  addFile(file: DataFile, options?: AddDataOptions): Promise<DataSource>;
  /** Downloads a URL (http or https). The Content-Length, when the server gives one, is checked before the body is read. */
  addUrl(url: string, options?: AddUrlOptions): Promise<DataSource>;
  remove(id: number): void;
  clear(): void;
  onChange(listener: () => void): void;
}

/**
 * Types a server gives to any text or file (raw.githubusercontent.com says text/plain for a .ttl), or to any gzip (#223): no
 * information about the format of the data.
 */
const GENERIC_CONTENT_TYPE = /^(text\/plain|application\/octet-stream|binary\/octet-stream|application\/(x-)?gzip)?$/i;

const nameOfUrl = (url: string): string => {
  const path = new URL(url).pathname;
  return decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)) || new URL(url).host;
};

export function createDataSources(): DataSources {
  let sources: DataSource[] = [];
  let nextId = 1;
  const listeners: Array<() => void> = [];
  const changed = () => listeners.forEach((listener) => listener());
  /** The keys of the hidden graphs (#224). */
  let hidden = new Set<string>();
  /** A hidden graph that no source holds any more is forgotten, so a later source with it is shown. */
  const forgetGoneGraphs = () => {
    const held = new Set(listGraphs(sources.map((s) => s.store)).map((g) => g.key));
    hidden = new Set([...hidden].filter((key) => held.has(key)));
  };

  const self: DataSources = {
    list: () => [...sources],
    stores: () => sources.map((s) => s.store),
    visibleStores: () => sources.map((s) => filterGraphs(s.store, hidden)),
    graphs: (labelStores = []) => listGraphs(sources.map((s) => s.store), labelStores),
    isGraphHidden: (key) => hidden.has(key),
    setGraphHidden(key, hide) {
      if (hidden.has(key) === hide) return;
      hidden = new Set(hidden);
      if (hide) hidden.add(key);
      else hidden.delete(key);
      changed();
    },
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
      const limitBytes = options.limitBytes ?? DATA_REFUSE_LIMIT_BYTES;
      const compressed = isGzipName(file.name);
      // Above the limit even compressed, or a plain file above what is left of a selection's limit: refused unread.
      if (file.size > DATA_REFUSE_LIMIT_BYTES) throw new Error(classifyDataSize(file.size).message);
      if (!compressed && file.size > limitBytes) throw new Error(tooLargeWhileReading(file.name, new DataTooLargeError(limitBytes, false)));
      const estimate = compressed ? file.size * GZIP_ESTIMATE_RATIO : file.size;
      if (estimate > DATA_LOAD_LIMIT_BYTES && options.confirm) {
        const message = compressed
          ? compressedDataQuestion(`This compressed file is ${megabytes(file.size)}, some ${megabytes(estimate)} of data once decompressed`, limitBytes)
          : classifyDataSize(file.size).message!;
        if (!(await options.confirm(message))) throw new Error('Cancelled');
      }
      let text: string;
      let bytes = file.size;
      if (file.stream) {
        try {
          ({ text, bytes } = await readAsText(file.stream(), { limitBytes, signal: options.signal }));
        } catch (error) {
          throw error instanceof DataTooLargeError ? new Error(tooLargeWhileReading(file.name, error)) : error;
        }
      } else {
        text = await file.text();
      }
      // Already asked: the size is that of the data read. The format is told from the name without .gz.
      return self.addText(file.name, text, { ...options, path: nameWithoutGz(options.path ?? file.name), byteLength: bytes, confirm: undefined });
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
      // A .gz address is decompressed here when the server sent it as it is, or by the browser when the server said
      // Content-Encoding: gzip; its first bytes tell which (#223).
      let text: string;
      let bytes: number;
      if (response.body) {
        try {
          ({ text, bytes } = await readAsText(response.body, { limitBytes: options.limitBytes ?? DATA_REFUSE_LIMIT_BYTES, signal: options.signal }));
        } catch (error) {
          if (error instanceof DataTooLargeError) throw new Error(tooLargeWhileReading(nameOfUrl(url), error));
          if (options.signal?.aborted) throw new Error('Cancelled');
          throw error;
        }
      } else {
        text = await response.text();
        bytes = text.length;
      }
      // The size to judge by is the larger of the two: Content-Length is that of the body as sent (compressed, in a browser) and a
      // lower bound, while the text is what is decoded and held in memory (Turtle is commonly five to ten times its gzip).
      // The end of the address tells the format when the server's type is a generic one, as the main loader does.
      const announcedType = (response.headers.get('content-type') ?? '').split(';')[0].trim();
      const contentType = GENERIC_CONTENT_TYPE.test(announcedType) ? undefined : announcedType;
      return self.addText(nameOfUrl(url), text, {
        ...options,
        path: nameWithoutGz(options.path ?? url),
        contentType: options.contentType ?? contentType,
        byteLength: Math.max(announced > 0 ? announced : 0, bytes),
      });
    },
    remove(id) {
      const next = sources.filter((s) => s.id !== id);
      if (next.length === sources.length) return;
      sources = next;
      forgetGoneGraphs();
      changed();
    },
    clear() {
      if (!sources.length) return;
      sources = [];
      hidden = new Set();
      changed();
    },
    onChange: (listener) => void listeners.push(listener),
  };
  return self;
}
