/**
 * Parse RDF content (Turtle, RDF/XML, JSON-LD, etc.) to RDF/JS quads.
 * 
 * NOTE: Currently uses rdf-parse (which uses N3 internally) for parsing.
 * rdflib.js parsing API has compatibility issues with our use case, so we keep rdf-parse
 * for parsing and use rdflib only for serialization (Phase 2).
 * 
 * Format is detected from path (URL or filename) or contentType.
 */
import { rdfParser } from 'rdf-parse';
import type { ParseOptions } from 'rdf-parse';
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
 * Uses rdf-parse with path and/or contentType for format detection.
 *
 * @throws Error with a clear message if parsing fails
 */
export async function parseRdfToQuads(
  content: string,
  options: ParseRdfOptions = {}
): Promise<Quad[]> {
  return (await parseRdfToQuadsWithPrefixes(content, options)).quads;
}

/** The quads of a file, and the prefixes the parser reported while reading it (prefix → namespace, `''` for the default). */
export interface ParsedQuads {
  quads: Quad[];
  prefixes: Record<string, string>;
}

/**
 * Like parseRdfToQuads, with the prefixes the parser itself used. Turtle reports its `@prefix`/`PREFIX` declarations, with a
 * relative namespace already resolved against `@base` (or `baseIRI`), so they agree with the quads; a later declaration of a
 * prefix wins. This version of rdf-parse reports none for RDF/XML (`xmlns`) or JSON-LD (`@context`).
 */
export async function parseRdfToQuadsWithPrefixes(
  content: string,
  options: ParseRdfOptions = {}
): Promise<ParsedQuads> {
  const { path, contentType, baseIRI } = options;
  const stream = stringToStream(content);

  const parseOptions: { path?: string; contentType?: string; baseIRI?: string } = {};
  if (path) parseOptions.path = path;
  if (contentType) parseOptions.contentType = contentType;
  if (baseIRI) parseOptions.baseIRI = baseIRI;

  // parseOptions always contains a `path` or `contentType` at runtime (the caller
  // supplies at least one for format detection), matching the ParseOptions union.
  const quadStream = rdfParser.parse(stream, parseOptions as ParseOptions);
  const quads: Quad[] = [];
  const prefixes: Record<string, string> = {};

  return new Promise((resolve, reject) => {
    quadStream.on('data', (quad: Quad) => quads.push(quad));
    quadStream.on('prefix', (prefix: string, iri: { value: string } | string) => {
      prefixes[prefix] = typeof iri === 'string' ? iri : iri.value;
    });
    quadStream.on('error', (err: Error) => {
      reject(new Error(`Failed to parse RDF: ${err.message}`));
    });
    quadStream.on('end', () => resolve({ quads, prefixes }));
  });
}
