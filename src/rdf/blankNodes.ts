/**
 * Removing an anonymous (blank-node) structure from the store completely: a restriction, a datatype
 * restriction with its facet list, an RDF list, … Removing only the triple that pointed at it would
 * leave the blank node's own triples behind, unreferenced, to be written out as stray statements.
 */
import type { Store } from 'n3';
import type { RdfTerm } from './classExpressions';

/** Remove a blank node's triples, then any blank node that leaves unreferenced (nested lists, facets…). */
export function removeBlankNodeClosure(store: Store, node: RdfTerm): void {
  if (node.termType !== 'BlankNode') return;
  for (const q of store.getQuads(node as never, null, null, null)) {
    store.removeQuad(q);
    const obj = q.object as RdfTerm;
    if (obj.termType === 'BlankNode' && store.getQuads(null, null, obj as never, null).length === 0) removeBlankNodeClosure(store, obj);
  }
}
