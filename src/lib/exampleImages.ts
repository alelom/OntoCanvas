/**
 * The example images of a term (#142), from ADIRO's `exampleImage` annotation property
 * (https://w3id.org/adiro/aec_drawing_metadata#exampleImage). This is support for that one property, as ADIRO defines
 * it: it is read only when the opened ontology declares it as an annotation property or imports the ADIRO module that
 * defines it. A property of another IRI, even one named `exampleImage`, is not read. Pure: reads the store, touches no
 * DOM.
 */
import { DataFactory, type Store } from 'n3';
import { hasValidImageExtension, resolveImageUrl } from './exampleImageUrlValidation';

export const ADIRO_EXAMPLE_IMAGE = 'https://w3id.org/adiro/aec_drawing_metadata#exampleImage';
/** The ADIRO module defining it, imported by its IRI, a version IRI (`…/5.0.0`) or its file (`….ttl`). */
const ADIRO_METADATA_IMPORT = /^https:\/\/w3id\.org\/adiro\/aec_drawing_metadata(\.ttl|\/\d+\.\d+\.\d+)?$/;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';

/** True when the ontology declares ADIRO's exampleImage as an annotation property, or imports the module defining it. */
export function adiroExampleImageAvailable(store: Store): boolean {
  const n = DataFactory.namedNode;
  if (store.countQuads(n(ADIRO_EXAMPLE_IMAGE), n(RDF_TYPE), n(OWL + 'AnnotationProperty'), null) > 0) return true;
  return store.getQuads(null, n(OWL + 'imports'), null, null).some((q) => ADIRO_METADATA_IMPORT.test(q.object.value));
}

/** A literal value is kept when it looks like an image address (older files wrote them as text). */
function looksLikeImageAddress(value: string): boolean {
  return /^https?:\/\//.test(value) || hasValidImageExtension(value);
}

/**
 * Display order: ADIRO names its images `<LocalName>_NN.<ext>`, `_01` first, so a natural sort (numbers compared as
 * numbers) gives the intended order; RDF itself keeps none. Duplicates are dropped.
 */
export function sortExampleImages(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * The example images of the term `subjectUri`, unresolved (relative values stay relative), in display order; none when
 * the property is not available in this ontology.
 */
export function exampleImagesOf(store: Store, subjectUri: string): string[] {
  if (!adiroExampleImageAvailable(store)) return [];
  const values: string[] = [];
  for (const q of store.getQuads(DataFactory.namedNode(subjectUri), DataFactory.namedNode(ADIRO_EXAMPLE_IMAGE), null, null)) {
    if (q.object.termType === 'NamedNode') values.push(q.object.value);
    else if (q.object.termType === 'Literal' && looksLikeImageAddress(q.object.value)) values.push(q.object.value);
  }
  return sortExampleImages(values);
}

/**
 * Absolute addresses to show: a relative value is resolved against the address the ontology was opened from. One that
 * cannot be resolved (a file opened from disk) is kept as it is, and shows as "Image not available".
 */
export function resolveExampleImages(values: readonly string[], ontologyLocation: string | null): string[] {
  return values.map((v) => resolveImageUrl(v, ontologyLocation) ?? v);
}
