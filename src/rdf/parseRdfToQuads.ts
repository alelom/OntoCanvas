/**
 * Parse RDF content (Turtle, RDF/XML, JSON-LD, etc.) to RDF/JS quads using rdf-parse.
 * Format is detected from path (URL or filename) or contentType.
 */
import { rdfParser } from 'rdf-parse';
import { stringToStream } from './stringToStream';
import type { Quad } from '@rdfjs/types';

export interface ParseRdfOptions {
  /** URL or file path for format detection (e.g. .ttl, .owl, .rdf, .jsonld) */
  path?: string;
  /** MIME type (e.g. text/turtle, application/rdf+xml, application/ld+json) */
  contentType?: string;
  /** Base IRI for resolving relative URIs */
  baseIRI?: string;
}

/**
 * Parse RDF string to an array of RDF/JS quads.
 * Uses path and/or contentType so rdf-parse can select the correct parser.
 *
 * @throws Error with a clear message if parsing fails
 */
export async function parseRdfToQuads(
  content: string,
  options: ParseRdfOptions = {}
): Promise<Quad[]> {
  const { path, contentType, baseIRI } = options;
  const stream = stringToStream(content);

  const parseOptions: { path?: string; contentType?: string; baseIRI?: string } = {};
  if (path) parseOptions.path = path;
  if (contentType) parseOptions.contentType = contentType;
  if (baseIRI) parseOptions.baseIRI = baseIRI;

  const quadStream = rdfParser.parse(stream, parseOptions);
  const quads: Quad[] = [];

  return new Promise((resolve, reject) => {
    quadStream.on('data', (quad: Quad) => quads.push(quad));
    quadStream.on('error', (err: Error) => {
      reject(new Error(`Failed to parse RDF: ${err.message}`));
    });
    quadStream.on('end', () => resolve(quads));
  });
}
