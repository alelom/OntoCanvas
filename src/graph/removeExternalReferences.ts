/**
 * Remove from the store all references to an external class (e.g. when user "deletes" an external node).
 * Removes object property domain/range pointing to the class and restrictions (someValuesFrom/onClass) that use it.
 */

import { DataFactory, type Store } from 'n3';
import type { Quad } from 'n3';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

function isBlankNode(term: { termType: string }): boolean {
  return term.termType === 'BlankNode';
}

/**
 * Returns the quads that would be removed by removeExternalClassReferencesFromStore, without removing them.
 * Used to capture state for undo.
 */
export function getQuadsRemovedForExternalClass(store: Store, externalClassUri: string): Quad[] {
  const externalNode = DataFactory.namedNode(externalClassUri);
  const RDFS_DOMAIN = RDFS + 'domain';
  const RDFS_RANGE = RDFS + 'range';
  const OWL_SOME_VALUES_FROM = OWL + 'someValuesFrom';
  const OWL_ON_CLASS = OWL + 'onClass';
  const RDFS_SUBCLASS_OF = RDFS + 'subClassOf';

  const out: Quad[] = [];
  const domainQuads = store.getQuads(null, DataFactory.namedNode(RDFS_DOMAIN), externalNode, null);
  const rangeQuads = store.getQuads(null, DataFactory.namedNode(RDFS_RANGE), externalNode, null);
  out.push(...domainQuads, ...rangeQuads);

  const subClassQuads = store.getQuads(null, DataFactory.namedNode(RDFS_SUBCLASS_OF), null, null);
  for (const q of subClassQuads) {
    if (!isBlankNode(q.object)) continue;
    const restrictionBlank = q.object;
    const someValuesFrom = store.getQuads(restrictionBlank as any, DataFactory.namedNode(OWL_SOME_VALUES_FROM), null, null)[0];
    const onClass = store.getQuads(restrictionBlank as any, DataFactory.namedNode(OWL_ON_CLASS), null, null)[0];
    const targetQuad = someValuesFrom ?? onClass;
    if (!targetQuad || targetQuad.object.termType !== 'NamedNode') continue;
    if ((targetQuad.object as { value: string }).value !== externalClassUri) continue;
    out.push(q);
  }
  return out;
}

/**
 * Restore quads that were previously removed (e.g. on undo).
 */
export function restoreQuadsToStore(store: Store, quads: Quad[]): void {
  for (const q of quads) {
    store.addQuad(q.subject, q.predicate, q.object, q.graph);
  }
}

/**
 * Remove all references to the given external class URI from the store.
 * - Removes rdfs:domain and rdfs:range quads that have the external class as object.
 * - Removes subClassOf triples where the object is a restriction blank node that
 *   has owl:someValuesFrom or owl:onClass pointing to the external class.
 */
export function removeExternalClassReferencesFromStore(store: Store, externalClassUri: string): void {
  const externalNode = DataFactory.namedNode(externalClassUri);
  const RDFS_DOMAIN = RDFS + 'domain';
  const RDFS_RANGE = RDFS + 'range';
  const OWL_SOME_VALUES_FROM = OWL + 'someValuesFrom';
  const OWL_ON_CLASS = OWL + 'onClass';
  const RDFS_SUBCLASS_OF = RDFS + 'subClassOf';

  const domainQuads = store.getQuads(null, DataFactory.namedNode(RDFS_DOMAIN), externalNode, null);
  const rangeQuads = store.getQuads(null, DataFactory.namedNode(RDFS_RANGE), externalNode, null);
  for (const q of domainQuads) {
    store.removeQuad(q);
  }
  for (const q of rangeQuads) {
    store.removeQuad(q);
  }

  const subClassQuads = store.getQuads(null, DataFactory.namedNode(RDFS_SUBCLASS_OF), null, null);
  for (const q of subClassQuads) {
    if (!isBlankNode(q.object)) continue;
    const restrictionBlank = q.object;
    const someValuesFrom = store.getQuads(restrictionBlank as any, DataFactory.namedNode(OWL_SOME_VALUES_FROM), null, null)[0];
    const onClass = store.getQuads(restrictionBlank as any, DataFactory.namedNode(OWL_ON_CLASS), null, null)[0];
    const targetQuad = someValuesFrom ?? onClass;
    if (!targetQuad || targetQuad.object.termType !== 'NamedNode') continue;
    if ((targetQuad.object as { value: string }).value !== externalClassUri) continue;
    store.removeQuad(q);
  }
}
