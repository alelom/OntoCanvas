/**
 * Reading anonymous OWL class expressions (owl:unionOf / owl:intersectionOf / owl:complementOf /
 * owl:oneOf) used as a property's rdfs:domain or rdfs:range. The parser uses this both to flatten an
 * expression into the classes its relationship edges are drawn against, and to surface the expression
 * itself as a ClassExpressionGroup that the overlay renders. See issues #59 (union), #60
 * (intersection), #61 (complement) and #62 (enumeration).
 */
import { DataFactory, type Store } from 'n3';
import type { ClassExpressionGroup, ClassExpressionOperator } from '../types';
import { extractLocalName } from '../utils/localName';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

export type RdfTerm = { termType: string; value?: string };

/** Walk an RDF collection (rdf:first/rdf:rest) starting at listHead, returning its member terms in order. */
export function readRdfList(store: Store, listHead: RdfTerm): RdfTerm[] {
  const items: RdfTerm[] = [];
  const seen = new Set<string>();
  let current = listHead;
  while (current.termType === 'BlankNode' && current.value && !seen.has(current.value)) {
    seen.add(current.value);
    const firstQuad = store.getQuads(current as never, DataFactory.namedNode(RDF + 'first'), null, null)[0];
    const restQuad = store.getQuads(current as never, DataFactory.namedNode(RDF + 'rest'), null, null)[0];
    if (firstQuad) items.push(firstQuad.object as RdfTerm);
    if (!restQuad) break;
    current = restQuad.object as RdfTerm;
  }
  return items;
}

/** An anonymous class expression read from the store. */
interface ClassExpression {
  operator: ClassExpressionOperator;
  /** URIs of the classes the expression is drawn against (operands, or the types of a oneOf's individuals). */
  classUris: string[];
  /** oneOf only: the enumerated individuals (local names) or literal values. */
  values?: string[];
}

const LIST_OPERATORS: Array<[ClassExpressionOperator, string]> = [
  ['union', OWL + 'unionOf'],
  ['intersection', OWL + 'intersectionOf'],
];

/** Named rdf:types of an individual, excluding OWL/RDF(S) vocabulary such as owl:NamedIndividual. */
function individualTypeUris(store: Store, individual: RdfTerm): string[] {
  return store
    .getQuads(individual as never, DataFactory.namedNode(RDF + 'type'), null, null)
    .map((q) => q.object)
    .filter((o) => o.termType === 'NamedNode' && ![OWL, RDF, RDFS].some((ns) => o.value.startsWith(ns)))
    .map((o) => o.value);
}

/** Read the class expression a blank node denotes, or null if it isn't one of the handled constructors.
 * Only named operands are kept (nested anonymous operands are not drawn). */
function readClassExpression(store: Store, node: RdfTerm): ClassExpression | null {
  if (node.termType !== 'BlankNode' || !node.value) return null;
  const objectOf = (pred: string) => store.getQuads(node as never, DataFactory.namedNode(pred), null, null)[0]?.object as RdfTerm | undefined;
  for (const [operator, pred] of LIST_OPERATORS) {
    const list = objectOf(pred);
    if (!list) continue;
    const classUris = readRdfList(store, list)
      .filter((t) => t.termType === 'NamedNode' && t.value)
      .map((t) => t.value!);
    return { operator, classUris };
  }
  const complemented = objectOf(OWL + 'complementOf');
  if (complemented) {
    return { operator: 'complement', classUris: complemented.termType === 'NamedNode' && complemented.value ? [complemented.value] : [] };
  }
  const enumeration = objectOf(OWL + 'oneOf');
  if (enumeration) {
    const items = readRdfList(store, enumeration).filter((t) => t.value != null);
    const classUris: string[] = [];
    for (const item of items) {
      if (item.termType !== 'NamedNode') continue;
      for (const uri of individualTypeUris(store, item)) if (!classUris.includes(uri)) classUris.push(uri);
    }
    const values = items.map((t) => (t.termType === 'NamedNode' ? extractLocalName(t.value!) : t.value!));
    return { operator: 'oneOf', classUris, values };
  }
  return null;
}

/**
 * Resolve an rdfs:domain (or rdfs:range) object to the class URIs it is drawn against: a NamedNode is
 * itself; an anonymous union / intersection / complement flattens to its named operands, and an
 * enumeration to its individuals' classes. The expression itself is surfaced separately by
 * extractClassExpressionGroups so the flattening is never shown without its mark.
 */
export function resolveExpressionClassUris(store: Store, obj: RdfTerm): string[] {
  if (obj.termType === 'NamedNode' && obj.value) return [obj.value];
  return readClassExpression(store, obj)?.classUris ?? [];
}

/** Local names of the in-graph classes a domain/range side resolves to (all its rdfs:domain/range triples). */
function sideClasses(store: Store, subj: RdfTerm, side: 'domain' | 'range', seenClasses: Set<string>): string[] {
  const names: string[] = [];
  for (const q of store.getQuads(subj as never, DataFactory.namedNode(RDFS + side), null, null)) {
    for (const uri of resolveExpressionClassUris(store, q.object as RdfTerm)) {
      const name = extractLocalName(uri);
      if (seenClasses.has(name) && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** Whether an expression has enough on the graph to be worth a mark. */
function isDrawable(
  operator: ClassExpressionOperator,
  members: string[],
  values: string[] | undefined,
  anchorAvailable: boolean,
): boolean {
  switch (operator) {
    case 'union':
    case 'intersection':
      return members.length >= 2; // a one-operand union/intersection isn't worth grouping
    case 'complement':
      return members.length === 1;
    case 'oneOf':
      return (values?.length ?? 0) > 0 && (members.length > 0 || anchorAvailable);
  }
}

/**
 * Find the anonymous class expressions used as a property's rdfs:domain OR rdfs:range and surface them
 * as groups to render. Only members that are classes in the graph are kept, so e.g. a data property's
 * union of datatypes is naturally ignored. An enumeration of literals (a data range) or of individuals
 * with no class on the graph has no members; it is anchored on the opposite end instead (the
 * counterpart classes for an object property, the domain classes' stubs for a data property).
 */
export function extractClassExpressionGroups(store: Store, seenClasses: Set<string>): ClassExpressionGroup[] {
  const groups: ClassExpressionGroup[] = [];
  const kinds: Array<['object' | 'data', string]> = [
    ['object', OWL + 'ObjectProperty'],
    ['data', OWL + 'DatatypeProperty'],
  ];
  const sides: Array<{ exprSide: 'domain' | 'range'; otherSide: 'domain' | 'range' }> = [
    { exprSide: 'domain', otherSide: 'range' },
    { exprSide: 'range', otherSide: 'domain' },
  ];
  for (const [propertyKind, typeUri] of kinds) {
    for (const q of store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(typeUri), null)) {
      const subj = q.subject;
      if (subj.termType !== 'NamedNode') continue;
      const propUri = subj.value;
      for (const { exprSide, otherSide } of sides) {
        const sideQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + exprSide), null, null)[0];
        if (!sideQuad) continue;
        const expr = readClassExpression(store, sideQuad.object as RdfTerm);
        if (!expr) continue;
        const members: string[] = [];
        for (const uri of expr.classUris) {
          const name = extractLocalName(uri);
          if (seenClasses.has(name) && !members.includes(name)) members.push(name);
        }
        // The classes on the other end (edge targets), resolved through an expression there too. A data
        // property's stubs hang off its domain classes, so for a range expression these carry the mark.
        const counterparts = sideClasses(store, subj, otherSide, seenClasses);
        const stubOwners = exprSide === 'domain' ? members : counterparts;
        const anchorAvailable = propertyKind === 'data' ? stubOwners.length > 0 : counterparts.length > 0;
        if (!isDrawable(expr.operator, members, expr.values, anchorAvailable)) continue;
        groups.push({
          operator: expr.operator,
          members,
          ...(expr.values ? { values: expr.values } : {}),
          propertyName: extractLocalName(propUri),
          propertyUri: propUri,
          counterparts,
          position: exprSide,
          propertyKind,
        });
      }
    }
  }
  return groups;
}
