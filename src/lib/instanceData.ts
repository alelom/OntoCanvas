/**
 * Instance data (an A-box) in a store: the individuals of a file. The graph draws classes, so these are not drawn (#181);
 * the bottom bar says so, and the query tab starts with a query for them.
 */
import type { Store, Quad } from 'n3';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDF_FIRST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first';
const RDF_REST = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest';
const OWL_ONE_OF = 'http://www.w3.org/2002/07/owl#oneOf';
const OWL_NAMED_INDIVIDUAL = 'http://www.w3.org/2002/07/owl#NamedIndividual';
/** A type from one of these vocabularies describes the ontology itself (a class, a property, a restriction), not an individual. */
const SCHEMA_NAMESPACES = ['http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'http://www.w3.org/2000/01/rdf-schema#', 'http://www.w3.org/2002/07/owl#'];

const isSchemaType = (iri: string): boolean => iri !== OWL_NAMED_INDIVIDUAL && SCHEMA_NAMESPACES.some((ns) => iri.startsWith(ns));

/** The members of every owl:oneOf list: the graph shows them in the class expression, so they are not instance data. */
function oneOfMembers(store: Store): Set<string> {
  const members = new Set<string>();
  for (const quad of store.getQuads(null, OWL_ONE_OF, null, null)) {
    let node: Quad['object'] | null = quad.object;
    const seen = new Set<string>();
    while (node && node.termType !== 'NamedNode' && !seen.has(node.value)) {
      seen.add(node.value);
      for (const first of store.getQuads(node, RDF_FIRST, null, null)) members.add(first.object.value);
      node = store.getQuads(node, RDF_REST, null, null)[0]?.object ?? null;
    }
  }
  return members;
}

/** The named individuals: subjects typed with owl:NamedIndividual or with a class outside the RDF, RDFS and OWL vocabularies. */
export function individualsOf(store: Store): Set<string> {
  const individuals = new Set<string>();
  for (const quad of store.getQuads(null, RDF_TYPE, null, null)) {
    if (quad.subject.termType !== 'NamedNode' || quad.object.termType !== 'NamedNode') continue;
    if (!isSchemaType(quad.object.value)) individuals.add(quad.subject.value);
  }
  for (const member of oneOfMembers(store)) individuals.delete(member);
  return individuals;
}
