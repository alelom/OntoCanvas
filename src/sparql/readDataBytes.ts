/**
 * Reads the bytes of a data file or a download as text (#223). Gzip is told by its first two bytes (1f 8b), not by the name: a
 * server may have decompressed a `.gz` already (Content-Encoding), and a file may be compressed under any name. It is
 * decompressed in the browser with `DecompressionStream`. The bytes are counted as they come, decompressed, and the read stops
 * at a limit: memory follows the data, and a compressed size says little about it.
 *
 * The format of a compressed file is told from its name without `.gz` (`part-0001.nq.gz` is N-Quads).
 */

/**
 * How many times its compressed size a gzip of RDF is taken to be before it is read: for the question asked about a large file
 * only. Turtle compresses some five to ten times and N-Quads twenty or more (23 for examples/datasets/run-parts), so this asks
 * early rather than late; the read itself stops at the limit, whatever the ratio turns out to be.
 */
export const GZIP_ESTIMATE_RATIO = 20;

const GZ = /\.gz$/i;
const GZ_BEFORE_QUERY = /\.gz(?=[?#]|$)/i;

export const isGzipName = (name: string): boolean => GZ.test(name);

/** The name (or address) of the data inside a gzip: the same without `.gz`, before any query or fragment. */
export const nameWithoutGz = (name: string): string => name.replace(GZ_BEFORE_QUERY, '');

/** The size of the data in a file before it is read: a compressed file's estimated from its size, a plain file's its size. */
export const estimateDataBytes = (file: { name: string; size: number }): number =>
  isGzipName(file.name) ? file.size * GZIP_ESTIMATE_RATIO : file.size;

/** The data passed the limit while it was read: nothing of it is kept. */
export class DataTooLargeError extends Error {
  constructor(
    readonly limitBytes: number,
    readonly compressed: boolean
  ) {
    super(`The data passes the limit of ${limitBytes} bytes.`);
    this.name = 'DataTooLargeError';
  }
}

export interface ReadAsTextOptions {
  /** The most bytes of data (decompressed) to read; one more stops the read with a DataTooLargeError. */
  limitBytes: number;
  signal?: AbortSignal;
}

export interface ReadText {
  text: string;
  /** The bytes of data read, decompressed. */
  bytes: number;
  compressed: boolean;
}

export const NO_DECOMPRESSION_MESSAGE =
  'This browser cannot decompress gzip data. Decompress the file first (with 7-Zip, or gunzip), and add the result.';

/** Reads until there are at least two bytes, or the end: enough to tell gzip by its first bytes. */
async function readHead(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array | null> {
  let head: Uint8Array | null = null;
  while (!head || head.length < 2) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!head) head = value;
    else {
      const joined: Uint8Array = new Uint8Array(head.length + value.length);
      joined.set(head);
      joined.set(value, head.length);
      head = joined;
    }
  }
  return head;
}

export async function readAsText(stream: ReadableStream<Uint8Array>, { limitBytes, signal }: ReadAsTextOptions): Promise<ReadText> {
  if (signal?.aborted) {
    void stream.cancel().catch(() => {});
    throw new Error('Cancelled');
  }
  const source = stream.getReader();
  const head = await readHead(source);
  if (!head) return { text: '', bytes: 0, compressed: false };
  const compressed = head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b;

  // The bytes again from the start, the head included.
  let bytes: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
    start: (controller) => controller.enqueue(head),
    async pull(controller) {
      const { done, value } = await source.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => source.cancel(reason),
  });
  if (compressed) {
    if (typeof DecompressionStream === 'undefined') {
      void bytes.cancel().catch(() => {});
      throw new Error(NO_DECOMPRESSION_MESSAGE);
    }
    bytes = bytes.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  }

  const reader = bytes.getReader();
  const decoder = new TextDecoder('utf-8');
  const parts: string[] = [];
  let read = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new Error('Cancelled');
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (!compressed) throw error;
        throw new Error(`The file could not be decompressed: it is not valid gzip data. ${error instanceof Error ? error.message : ''}`.trim());
      }
      if (chunk.done) break;
      read += chunk.value.length;
      if (read > limitBytes) throw new DataTooLargeError(limitBytes, compressed);
      parts.push(decoder.decode(chunk.value, { stream: true }));
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  }
  parts.push(decoder.decode());
  return { text: parts.join(''), bytes: read, compressed };
}
