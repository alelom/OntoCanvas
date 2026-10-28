/**
 * The vocabulary constants and the two small pure helpers that every part of the ontology code needs (reading the store,
 * editing it, saving it). Moved out of src/parser.ts unchanged (#193, step 1).
 */

export const XSD = 'http://www.w3.org/2001/XMLSchema#';
export const XSD_BOOLEAN = XSD + 'boolean';
export const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';

export const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export const OWL = 'http://www.w3.org/2002/07/owl#';
export const OWL_THING_URI = OWL + 'Thing';
export const OWL_ON_DATA_RANGE = OWL + 'onDataRange';

export const BASE_IRI = 'http://example.org/aec-drawing-ontology#';
export const HAS_CARDINALITY_PROP = BASE_IRI + 'hasCardinality';

/**
 * Return the namespace of a URI: everything up to and including the last '#' (or '/'),
 * or null when the URI has no separator (so a caller can fall back to a default base).
 */
export function namespaceFromUri(uri: string): string | null {
  if (uri.includes('#')) return uri.slice(0, uri.lastIndexOf('#') + 1);
  if (uri.includes('/')) return uri.slice(0, uri.lastIndexOf('/') + 1);
  return null;
}

export function isBlankNode(term: { termType: string }): boolean {
  return term.termType === 'BlankNode';
}
