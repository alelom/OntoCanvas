import { DataFactory, Store } from 'n3';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

const EXAMPLE_IMAGE_LOCAL = 'exampleImage';

function normalizeBaseIri(baseIri: string): string {
  return baseIri.endsWith('#') ? baseIri : baseIri + '#';
}

function getExampleImagePredicateUri(baseIri: string): string {
  return normalizeBaseIri(baseIri) + EXAMPLE_IMAGE_LOCAL;
}

function extractLocalName(uri: string): string {
  if (uri.includes('#')) return uri.split('#').pop()!;
  if (uri.includes('/')) return uri.split('/').pop()!;
  return uri;
}

function findClassSubjectByLocalName(store: Store, classLocalName: string): { value: string } | null {
  const classQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), null);
  for (const q of classQuads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const uri = (q.subject as { value: string }).value;
    if (extractLocalName(uri) === classLocalName) return q.subject as { value: string };
  }
  return null;
}

/**
 * Ensure the exampleImage owl:AnnotationProperty exists in the store.
 * Idempotent.
 */
export function ensureExampleImageAnnotationProperty(store: Store, baseIri: string): void {
  const propUri = getExampleImagePredicateUri(baseIri);
  const apNode = DataFactory.namedNode(propUri);
  const existing = store.getQuads(apNode, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), null);
  if (existing.length > 0) return;
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(apNode, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), graph);
  store.addQuad(apNode, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal('example image', 'en'), graph);
  store.addQuad(
    apNode,
    DataFactory.namedNode(RDFS + 'comment'),
    DataFactory.literal('Links a class or concept to an example image illustrating it.', 'en'),
    graph
  );
}

/**
 * Get all exampleImage (NamedNode) object URIs for a class.
 */
export function getExampleImageUrisForClass(store: Store, classLocalName: string, baseIri: string): string[] {
  const subject = findClassSubjectByLocalName(store, classLocalName);
  if (!subject) return [];
  const predUri = getExampleImagePredicateUri(baseIri);
  const pred = DataFactory.namedNode(predUri);
  const quads = store.getQuads(subject, pred, null, null);
  const uris: string[] = [];
  for (const q of quads) {
    if (q.object.termType === 'NamedNode') uris.push((q.object as { value: string }).value);
  }
  return uris;
}

/**
 * Set the exampleImage URIs for a class. Replaces any existing.
 * Ensures the annotation property exists before adding.
 */
export function setExampleImageUrisForClass(
  store: Store,
  classLocalName: string,
  uris: string[],
  baseIri: string
): boolean {
  const subject = findClassSubjectByLocalName(store, classLocalName);
  if (!subject) return false;
  ensureExampleImageAnnotationProperty(store, baseIri);
  const predUri = getExampleImagePredicateUri(baseIri);
  const pred = DataFactory.namedNode(predUri);
  const subjectNode = DataFactory.namedNode(subject.value);
  const existing = store.getQuads(subjectNode, pred, null, null);
  const graph = existing[0]?.graph ?? store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existing) store.removeQuad(q);
  for (const uri of uris) {
    if (uri != null && uri.trim() !== '') {
      store.addQuad(subjectNode, pred, DataFactory.namedNode(uri.trim()), graph);
    }
  }
  return true;
}
