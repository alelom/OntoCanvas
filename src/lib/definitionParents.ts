import { DataFactory, type Store } from 'n3';
import { readRdfList, type RdfTerm } from '../rdf/classExpressions';
import { extractLocalName } from '../utils/localName';

const OWL = 'http://www.w3.org/2002/07/owl#';

/** A class and a named class its definition makes it a kind of (#160). */
export interface DefinitionParent {
  cls: string;
  parent: string;
}

/**
 * The named classes each drawn class is defined as a kind of, by `owl:equivalentClass` (#160): the class itself
 * when the definition is a named class, or the named operands of an `owl:intersectionOf`. A class equivalent to
 * an intersection is a subclass of each operand (CheeseyPizza ≡ Pizza ⊓ ∃hasTopping.CheeseTopping is a Pizza).
 * Classes inside restrictions, unions and complements say nothing about what the class is a kind of, and are
 * not read. `nodeIds` are the drawn nodes: a local class by its local name, an imported one by its URI.
 */
export function definitionParents(store: Store, nodeIds: Set<string>): DefinitionParent[] {
  const idOf = (uri: string): string | null => {
    const local = extractLocalName(uri);
    if (nodeIds.has(local)) return local;
    return nodeIds.has(uri) ? uri : null;
  };
  const found = new Map<string, DefinitionParent>();
  for (const q of store.getQuads(null, DataFactory.namedNode(OWL + 'equivalentClass'), null, null)) {
    if (q.subject.termType !== 'NamedNode') continue;
    const cls = idOf(q.subject.value);
    if (!cls) continue;
    const named: string[] = [];
    if (q.object.termType === 'NamedNode') named.push(q.object.value);
    else if (q.object.termType === 'BlankNode') {
      for (const list of store.getQuads(q.object, DataFactory.namedNode(OWL + 'intersectionOf'), null, null)) {
        for (const item of readRdfList(store, list.object as RdfTerm)) {
          if (item.termType === 'NamedNode' && item.value) named.push(item.value);
        }
      }
    }
    for (const uri of named) {
      const parent = idOf(uri);
      if (parent && parent !== cls) found.set(`${cls}\u0000${parent}`, { cls, parent });
    }
  }
  return [...found.values()].sort((a, b) => (a.cls === b.cls ? (a.parent < b.parent ? -1 : 1) : a.cls < b.cls ? -1 : 1));
}
