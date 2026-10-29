/**
 * Reads RDF text into a new N3 store in slices (#205): the parser is fed a slice of the text at a time and the event loop
 * gets a turn between slices, so a file of hundreds of thousands of triples does not freeze the page. Parsing the whole text
 * as one chunk cannot be paused, since the parser works through a chunk in one go.
 *
 * For data added to an ontology (never saved). Any format rdf-parse reads; its stream parsers take a slice that cuts
 * through a token.
 */
import { rdfParser } from 'rdf-parse';
import type { ParseOptions } from 'rdf-parse';
import { Readable } from 'readable-stream';
import { Store } from 'n3';
import type { Quad } from '@rdfjs/types';
import type { ParseRdfOptions } from './parseRdfToQuads';

/** About 64 KB of text, some 4,000 triples: a slice parses in a few tens of milliseconds. */
export const DEFAULT_SLICE_CHARS = 64 * 1024;

export interface SlicedParseOptions extends ParseRdfOptions {
  sliceChars?: number;
  /** Called after each slice with the number of triples read so far. */
  onProgress?: (triples: number) => void;
  /** Stops the read: the promise rejects with `Cancelled`. */
  signal?: AbortSignal;
  /** Gives the event loop a turn between slices. Defaults to a zero timeout (a macrotask, so rendering gets its turn). */
  yieldToEventLoop?: () => Promise<void>;
}

/** rdf-parse's message for a format it cannot tell is a template that was never filled in; say what is wrong and what to do. */
function describeParseError(error: Error): string {
  if (/none of the configured parsers|no valid extension could be detected/i.test(error.message)) {
    return 'The format of this file could not be told from its name or its content type. Use a name that ends in .ttl, .rdf, .owl, .jsonld, .nt or .trig.';
  }
  return `Failed to parse RDF: ${error.message}`;
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function parseIntoStoreInSlices(
  content: string,
  options: SlicedParseOptions = {}
): Promise<{ store: Store; prefixes: Record<string, string> }> {
  const { path, contentType, baseIRI, signal } = options;
  const sliceChars = options.sliceChars ?? DEFAULT_SLICE_CHARS;
  const yieldToEventLoop = options.yieldToEventLoop ?? defaultYield;
  const store = new Store();
  const prefixes: Record<string, string> = {};

  const parseOptions: { path?: string; contentType?: string; baseIRI?: string } = {};
  if (path) parseOptions.path = path;
  if (contentType) parseOptions.contentType = contentType;
  if (baseIRI) parseOptions.baseIRI = baseIRI;

  // Counted here: the store's own size is recomputed after every added quad, which costs more as the store grows (500k
  // triples took 20 s instead of 3 s when it was asked for after each slice).
  let read = 0;
  let reportedAt = 0;
  async function* slices(): AsyncGenerator<string> {
    for (let at = 0; at < content.length; at += sliceChars) {
      if (signal?.aborted) return;
      yield content.slice(at, at + sliceChars);
      options.onProgress?.(read);
      await yieldToEventLoop();
    }
    reportedAt = read;
  }

  const input = Readable.from(slices());
  let quadStream: ReturnType<typeof rdfParser.parse>;
  try {
    quadStream = rdfParser.parse(input as never, parseOptions as ParseOptions);
  } catch (error) {
    // Thrown at once, before any stream exists, when neither the name nor the content type says what the format is.
    input.destroy();
    throw new Error(describeParseError(error instanceof Error ? error : new Error(String(error))));
  }

  return new Promise((resolve, reject) => {
    const cancel = () => {
      quadStream.destroy();
      input.destroy();
      reject(new Error('Cancelled'));
    };
    if (signal?.aborted) return cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    quadStream.on('data', (quad: Quad) => {
      store.addQuad(quad as never);
      read++;
    });
    quadStream.on('prefix', (prefix: string, iri: { value: string } | string) => {
      prefixes[prefix] = typeof iri === 'string' ? iri : iri.value;
    });
    quadStream.on('error', (error: Error) => reject(new Error(describeParseError(error))));
    quadStream.on('end', () => {
      if (signal?.aborted) return reject(new Error('Cancelled'));
      if (read !== reportedAt) options.onProgress?.(read);
      resolve({ store, prefixes });
    });
  });
}
