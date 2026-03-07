/**
 * Creates a Node.js Readable stream from a string.
 * Used to feed rdf-parse which expects a stream input.
 * Uses readable-stream for browser compatibility.
 */
import { Readable } from 'readable-stream';

export function stringToStream(str: string): Readable {
  return Readable.from([str]);
}
