/**
 * Which class a local name stands for (#164).
 *
 * A class is drawn and edited under its local name, and a local name stands for one class. When two classes share it
 * (this ontology's :Party and an external stub std:Party it subclasses), the ontology's own class has it, whatever
 * order they are declared in; the other one is drawn by the external expansion under its full IRI, as an imported
 * class of the same name already is (lib:Book next to :Book). Every place that turns a class into a node, or a node
 * back into a class IRI (to draw, edit, save), follows this one ranking, so what is drawn under `Party` is what an
 * edit to `Party` changes:
 *
 *   1. a class in the ontology's own namespace: its IRI followed by `#` or `/`;
 *   2. any other class that is not a stub;
 *   3. a stub: a class whose rdfs:isDefinedBy names another ontology.
 *
 * File order decides only within a rank. A class matches a node only when the node is that IRI, never by local name
 * alone: matching by name turned `:Party rdfs:subClassOf std:Party` into the cycle Party → Party, and the ontology
 * could not be opened.
 */
import { DataFactory, type Store } from 'n3';
import { extractLocalName } from '../utils/localName';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const OWL_ONTOLOGY = 'http://www.w3.org/2002/07/owl#Ontology';
const RDFS_IS_DEFINED_BY = 'http://www.w3.org/2000/01/rdf-schema#isDefinedBy';

/** The two forms of the ontology's own namespace (its IRI followed by `#` or `/`); none when it declares no ontology. */
export function ownNamespaces(store: Store): string[] {
  const ontology = store
    .getQuads(null, DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_ONTOLOGY), null)
    .find((q) => q.subject.termType === 'NamedNode');
  if (!ontology) return [];
  const iri = ontology.subject.value.replace(/[#/]$/, '');
  return [`${iri}#`, `${iri}/`];
}

function rank(store: Store, uri: string, own: string[]): number {
  if (own.some((ns) => uri.startsWith(ns))) return 0;
  const ontologyIri = own[0]?.slice(0, -1);
  const definedElsewhere = store
    .getQuads(DataFactory.namedNode(uri), DataFactory.namedNode(RDFS_IS_DEFINED_BY), null, null)
    .some((q) => q.object.value !== ontologyIri && !own.some((ns) => q.object.value.startsWith(ns)));
  return definedElsewhere ? 2 : 1;
}

function classIris(store: Store): string[] {
  return [
    ...new Set(
      store
        .getQuads(null, DataFactory.namedNode(RDF_TYPE), DataFactory.namedNode(OWL_CLASS), null)
        .filter((q) => q.subject.termType === 'NamedNode')
        .map((q) => q.subject.value)
    ),
  ];
}

/** `uris` in ranking order (stable: file order within a rank). */
function byRank(store: Store, uris: string[]): string[] {
  if (uris.length < 2) return uris;
  const own = ownNamespaces(store);
  const ranks = new Map(uris.map((u) => [u, rank(store, u, own)]));
  return uris.map((u, i) => ({ u, i })).sort((a, b) => ranks.get(a.u)! - ranks.get(b.u)! || a.i - b.i).map((x) => x.u);
}

/** Every named owl:Class, once, in the order it claims its local name (see the module comment). */
export function rankedClassUris(store: Store): string[] {
  return byRank(store, classIris(store));
}

/**
 * The IRI of the class that the local name `name` stands for, or null when no owl:Class has it. Only the classes with
 * that name are ranked (almost always one), so a lookup costs a pass over the class IRIs, like the lookup it replaces;
 * a caller that resolves many names still loops once per name, so resolve once and reuse the IRI.
 */
export function classUriForName(store: Store, name: string): string | null {
  return byRank(store, classIris(store).filter((u) => extractLocalName(u) === name))[0] ?? null;
}

/** True when the node named after `uri`'s local name is that class (`classUriByName`: node id → class IRI). */
export function isNodeOf(classUriByName: ReadonlyMap<string, string>, uri: string): boolean {
  return classUriByName.get(extractLocalName(uri)) === uri;
}
