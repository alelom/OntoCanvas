/**
 * Remove from the store all references to an external class (e.g. when user "deletes" an external node).
 * Removes object property domain/range pointing to the class and the restrictions drawn as edges to it.
 */

import { DataFactory, type Store } from 'n3';
import type { Quad } from 'n3';
import { readObjectRestriction } from '../rdf/restrictions';
import type { RdfTerm } from '../rdf/classExpressions';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/** The rdfs:subClassOf links to restrictions whose edge points to the class (any kind the graph draws, as
 * read by readObjectRestriction, so deleting the external node removes every edge that would redraw it).
 * An unqualified cardinality is drawn to the property's range, which the domain/range removal already drops. */
function restrictionLinksTo(store: Store, externalClassUri: string): Quad[] {
  return store
    .getQuads(null, DataFactory.namedNode(RDFS + 'subClassOf'), null, null)
    .filter((q) => {
      if (q.object.termType !== 'BlankNode') return false;
      const r = readObjectRestriction(store, q.object as RdfTerm, q.subject.value);
      return r?.kind !== 'unqualified' && r?.targetUri === externalClassUri;
    });
}

/**
 * Returns the quads that removeExternalClassReferencesFromStore removes, without removing them.
 */
export function getQuadsRemovedForExternalClass(store: Store, externalClassUri: string): Quad[] {
  const externalNode = DataFactory.namedNode(externalClassUri);
  return [
    ...store.getQuads(null, DataFactory.namedNode(RDFS + 'domain'), externalNode, null),
    ...store.getQuads(null, DataFactory.namedNode(RDFS + 'range'), externalNode, null),
    ...restrictionLinksTo(store, externalClassUri),
  ];
}

/**
 * Remove all references to the given external class URI from the store.
 * - Removes rdfs:domain and rdfs:range quads that have the external class as object.
 * - Removes subClassOf triples whose object is a restriction drawn as an edge to the external class.
 */
export function removeExternalClassReferencesFromStore(store: Store, externalClassUri: string): void {
  for (const q of getQuadsRemovedForExternalClass(store, externalClassUri)) store.removeQuad(q);
}
