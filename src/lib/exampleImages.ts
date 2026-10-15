/**
 * The images of a term shown in its hover tooltip (#142, #143). Pure: reads the store, touches no DOM.
 *
 * Read from, in this order (one list, duplicates dropped):
 * 1. ADIRO's `exampleImage` (https://w3id.org/adiro/aec_drawing_metadata#exampleImage), only when the ontology
 *    declares it as an annotation property or imports the ADIRO module that defines it (#142);
 * 2. `foaf:depiction`, the standard for an image of a term (OBO ontologies use it on classes);
 * 3. `schema:image` (https and http), whose value is a URL or an image node with `schema:contentUrl`.
 * The standard ones are read whenever used: their IRIs mean one thing. A property declared `rdfs:subPropertyOf` one of
 * these, directly or not, counts as that one. Another property, even one named `exampleImage`, is not read.
 */
import { DataFactory, type Store, type Term } from 'n3';
import { hasValidImageExtension, resolveImageUrl } from './exampleImageUrlValidation';

export const ADIRO_EXAMPLE_IMAGE = 'https://w3id.org/adiro/aec_drawing_metadata#exampleImage';
export const FOAF_DEPICTION = 'http://xmlns.com/foaf/0.1/depiction';
const SCHEMA_IMAGE = ['https://schema.org/image', 'http://schema.org/image'];
const SCHEMA_CONTENT_URL = ['https://schema.org/contentUrl', 'http://schema.org/contentUrl'];
/** The ADIRO module defining it, imported by its IRI, a version IRI (`…/5.0.0`) or its file (`….ttl`). */
const ADIRO_METADATA_IMPORT = /^https:\/\/w3id\.org\/adiro\/aec_drawing_metadata(\.ttl|\/\d+\.\d+\.\d+)?$/;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_SUBPROPERTY_OF = 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf';
const OWL = 'http://www.w3.org/2002/07/owl#';
const n = DataFactory.namedNode;

/** True when the ontology declares ADIRO's exampleImage as an annotation property, or imports the module defining it. */
export function adiroExampleImageAvailable(store: Store): boolean {
  if (store.countQuads(n(ADIRO_EXAMPLE_IMAGE), n(RDF_TYPE), n(OWL + 'AnnotationProperty'), null) > 0) return true;
  return store.getQuads(null, n(OWL + 'imports'), null, null).some((q) => ADIRO_METADATA_IMPORT.test(q.object.value));
}

/** `roots` and every property declared a subproperty of one of them, directly or not. */
function withSubproperties(store: Store, roots: readonly string[]): string[] {
  const found = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const q of store.getQuads(null, n(RDFS_SUBPROPERTY_OF), n(parent), null)) {
      if (q.subject.termType === 'NamedNode' && !found.has(q.subject.value)) {
        found.add(q.subject.value);
        queue.push(q.subject.value);
      }
    }
  }
  return [...found];
}

/** The image properties of this ontology, in display order: one group per supported property, with its subproperties. */
function imagePropertyGroups(store: Store): string[][] {
  // A subproperty of ADIRO's exampleImage (e.g. ADIRO's own link to foaf:depiction) is read like the standard ones.
  const adiro = adiroExampleImageAvailable(store) ? [ADIRO_EXAMPLE_IMAGE] : [];
  return [
    withSubproperties(store, [...adiro, ...store.getSubjects(n(RDFS_SUBPROPERTY_OF), n(ADIRO_EXAMPLE_IMAGE), null).map((s) => s.value)]),
    withSubproperties(store, [FOAF_DEPICTION]),
    withSubproperties(store, SCHEMA_IMAGE),
  ];
}

/** A literal value is kept when it looks like an image address (older files wrote them as text). */
function looksLikeImageAddress(value: string): boolean {
  return /^https?:\/\//.test(value) || hasValidImageExtension(value);
}

/** The image addresses of one value: an image node with `schema:contentUrl` gives those; an IRI is the image itself. */
function addressesOf(store: Store, value: Term): string[] {
  if (value.termType === 'Literal') return looksLikeImageAddress(value.value) ? [value.value] : [];
  if (value.termType !== 'NamedNode' && value.termType !== 'BlankNode') return [];
  const content = SCHEMA_CONTENT_URL.flatMap((p) => store.getObjects(value, n(p), null)).map((o) => o.value);
  if (content.length > 0) return content;
  return value.termType === 'NamedNode' ? [value.value] : [];
}

/**
 * Display order within one property: ADIRO names its images `<LocalName>_NN.<ext>`, `_01` first, so a natural sort
 * (numbers compared as numbers) gives the intended order; RDF itself keeps none. Duplicates are dropped.
 */
export function sortExampleImages(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** The images of the term `subjectUri`, unresolved (relative values stay relative), in display order. */
export function exampleImagesOf(store: Store, subjectUri: string): string[] {
  const subject = n(subjectUri);
  const ordered = imagePropertyGroups(store).flatMap((group) =>
    sortExampleImages(group.flatMap((p) => store.getObjects(subject, n(p), null).flatMap((o) => addressesOf(store, o))))
  );
  return [...new Set(ordered)];
}

/**
 * Absolute addresses to show: a relative value is resolved against the address the ontology was opened from. One that
 * cannot be resolved (a file opened from disk) is kept as it is, and shows as "Image not available".
 */
export function resolveExampleImages(values: readonly string[], ontologyLocation: string | null): string[] {
  return values.map((v) => resolveImageUrl(v, ontologyLocation) ?? v);
}
