/**
 * The base IRI of the main ontology and the namespace of its classes. Moved out of readOntology.ts (#198).
 */
import { OWL, RDF } from './vocab';
import { DataFactory, Store } from 'n3';
import { extractLocalName } from '../utils/localName';
import { rankedClassUris } from '../graph/classNodeIds';

/** Return the main ontology IRI with trailing # for prefix matching, or null if not found. */
export function getMainOntologyBase(store: Store): string | null {
  const ontQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Ontology'), null);
  if (ontQuads.length === 0 || ontQuads[0].subject.termType !== 'NamedNode') return null;
  const uri = (ontQuads[0].subject as { value: string }).value;
  return uri.endsWith('#') ? uri : uri + '#';
}

/**
 * Return the namespace (base IRI with trailing #) used for class URIs in this store.
 * Used for exampleImage so the predicate lives in the same namespace as classes (e.g. :exampleImage not :Ontology#exampleImage).
 */
export function getClassNamespace(store: Store): string | null {
  // The ontology's own classes first (#164): a stub of an external class declared first must not make new terms land in
  // the external namespace
  for (const uri of rankedClassUris(store)) {
    const localName = extractLocalName(uri);
    if (!localName) continue;
    if (uri.includes('#')) return uri.slice(0, uri.lastIndexOf('#') + 1);
    if (uri.includes('/')) return uri.slice(0, uri.lastIndexOf('/') + 1);
    return null;
  }
  return null;
}
