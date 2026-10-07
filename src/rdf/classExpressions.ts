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
const XSD = 'http://www.w3.org/2001/XMLSchema#';

export type RdfTerm = { termType: string; value?: string; language?: string; datatype?: { value: string } };

/** A literal as shown in the tooltip / modal: plain strings bare, otherwise in Turtle form so values
 * differing only by language or datatype stay distinguishable — `"hello"@en`, `"1"^^xsd:integer`. */
export function literalDisplay(term: RdfTerm): string {
  const value = term.value ?? '';
  if (term.language) return `"${value}"@${term.language}`;
  const datatype = term.datatype?.value;
  if (!datatype || datatype === XSD + 'string' || datatype === RDF + 'langString') return value;
  return `"${value}"^^${datatype.startsWith(XSD) ? `xsd:${datatype.slice(XSD.length)}` : `<${datatype}>`}`;
}

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
  /** URIs of the classes the expression is drawn against: its named operands, collected through nested
   * unions / intersections / complements / enumerations (restriction operands contribute none), or the
   * types of a oneOf's individuals. */
  classUris: string[];
  /** oneOf only: the enumerated individuals (local names) or literal values. */
  values?: string[];
  /** The whole expression in description-logic notation, e.g. `¬(Agent ∪ OnlineAccount)`. */
  formula: string;
  /** Whether any operand is itself anonymous (a nested expression or a restriction). */
  nested: boolean;
}

const LIST_OPERATORS: Array<[ClassExpressionOperator, string, string]> = [
  ['union', OWL + 'unionOf', ' ∪ '],
  ['intersection', OWL + 'intersectionOf', ' ∩ '],
];

/** Named rdf:types of an individual, excluding OWL/RDF(S) vocabulary such as owl:NamedIndividual. */
export function individualTypeUris(store: Store, individual: RdfTerm): string[] {
  return store
    .getQuads(individual as never, DataFactory.namedNode(RDF + 'type'), null, null)
    .map((q) => q.object)
    .filter((o) => o.termType === 'NamedNode' && ![OWL, RDF, RDFS].some((ns) => o.value.startsWith(ns)))
    .map((o) => o.value);
}

/** Whether a term is the boolean true (`true`, `"true"^^xsd:boolean` or `"1"^^xsd:boolean`), as owl:hasSelf
 * must be: `owl:hasSelf false` is valid RDF that does not make a self restriction. */
export function isTrueLiteral(term: RdfTerm | undefined): boolean {
  return term?.termType === 'Literal' && (term.value === 'true' || term.value === '1');
}

const objectOfNode = (store: Store, node: RdfTerm, pred: string) =>
  store.getQuads(node as never, DataFactory.namedNode(pred), null, null)[0]?.object as RdfTerm | undefined;

/** Whether a formula has a binary ∪ / ∩ at its top level (outside any parentheses). */
function isCompound(formula: string): boolean {
  let depth = 0;
  for (let i = 0; i < formula.length; i++) {
    const c = formula[i];
    if (c === '(' || c === '{') depth++;
    else if (c === ')' || c === '}') depth--;
    else if (depth === 0 && (c === '∪' || c === '∩') && formula[i - 1] === ' ') return true;
  }
  return false;
}

/** Wrap a compound formula in parentheses, for use as an operand. */
const asOperand = (formula: string) => (isCompound(formula) ? `(${formula})` : formula);

/** A restriction in DL notation: ∃p.C, ∀p.C, ∃p.{a}, ∃p.Self, ≥n p.C / ≤n p / =n p.C; null if not one. */
function restrictionFormula(store: Store, node: RdfTerm, seen: Set<string>): string | null {
  const property = objectOfNode(store, node, OWL + 'onProperty');
  if (!property?.value) return null;
  const p = extractLocalName(property.value);
  const filler = (pred: string) => {
    const t = objectOfNode(store, node, OWL + pred);
    return t ? asOperand(termFormula(store, t, seen)) : null;
  };
  const some = filler('someValuesFrom');
  if (some) return `∃${p}.${some}`;
  const all = filler('allValuesFrom');
  if (all) return `∀${p}.${all}`;
  const value = objectOfNode(store, node, OWL + 'hasValue');
  if (value) return `∃${p}.{${value.termType === 'NamedNode' ? extractLocalName(value.value!) : literalDisplay(value)}}`;
  if (isTrueLiteral(objectOfNode(store, node, OWL + 'hasSelf'))) return `∃${p}.Self`;
  const onClass = filler('onClass') ?? filler('onDataRange');
  const suffix = onClass ? `.${onClass}` : '';
  const count = (pred: string) => objectOfNode(store, node, OWL + pred)?.value;
  const exact = count('qualifiedCardinality') ?? count('cardinality');
  if (exact != null) return `=${exact} ${p}${suffix}`;
  const min = count('minQualifiedCardinality') ?? count('minCardinality');
  const max = count('maxQualifiedCardinality') ?? count('maxCardinality');
  const bounds = [min != null ? `≥${min} ${p}${suffix}` : null, max != null ? `≤${max} ${p}${suffix}` : null].filter(Boolean);
  return bounds.length > 0 ? bounds.join(' ∩ ') : null;
}

/** Any class term in DL notation: a named class's local name, an expression, or a restriction. */
function termFormula(store: Store, term: RdfTerm, seen: Set<string>): string {
  if (term.termType === 'NamedNode' && term.value) return extractLocalName(term.value);
  if (term.termType !== 'BlankNode' || !term.value || seen.has(term.value)) return '?';
  const inner = new Set(seen).add(term.value);
  return readClassExpressionInner(store, term, inner)?.formula ?? restrictionFormula(store, term, inner) ?? '?';
}

/** Read the class expression a blank node denotes, or null if it isn't one of the handled constructors.
 * Nested operands are read recursively into the formula; only named classes become classUris. */
function readClassExpression(store: Store, node: RdfTerm): ClassExpression | null {
  if (node.termType !== 'BlankNode' || !node.value) return null;
  return readClassExpressionInner(store, node, new Set([node.value]));
}

function readClassExpressionInner(store: Store, node: RdfTerm, seen: Set<string>): ClassExpression | null {
  const objectOf = (pred: string) => objectOfNode(store, node, pred);
  // Named classes reachable through nested unions / intersections / complements (not restrictions).
  const namedClasses = (t: RdfTerm): string[] => {
    if (t.termType === 'NamedNode' && t.value) return [t.value];
    if (t.termType !== 'BlankNode' || !t.value || seen.has(t.value)) return [];
    const sub = readClassExpressionInner(store, t, new Set(seen).add(t.value));
    return sub ? sub.classUris : [];
  };
  const unique = (uris: string[]) => [...new Set(uris)];

  for (const [operator, pred, glyph] of LIST_OPERATORS) {
    const list = objectOf(pred);
    if (!list) continue;
    const operands = readRdfList(store, list);
    return {
      operator,
      classUris: unique(operands.flatMap(namedClasses)),
      formula: operands.map((t) => asOperand(termFormula(store, t, seen))).join(glyph),
      nested: operands.some((t) => t.termType !== 'NamedNode'),
    };
  }
  const complemented = objectOf(OWL + 'complementOf');
  if (complemented) {
    return {
      operator: 'complement',
      classUris: unique(namedClasses(complemented)),
      formula: `¬${asOperand(termFormula(store, complemented, seen))}`,
      nested: complemented.termType !== 'NamedNode',
    };
  }
  const enumeration = objectOf(OWL + 'oneOf');
  if (enumeration) {
    const items = readRdfList(store, enumeration).filter((t) => t.value != null);
    const classUris: string[] = [];
    for (const item of items) {
      if (item.termType !== 'NamedNode') continue;
      for (const uri of individualTypeUris(store, item)) if (!classUris.includes(uri)) classUris.push(uri);
    }
    const values = items.map((t) => (t.termType === 'NamedNode' ? extractLocalName(t.value!) : literalDisplay(t)));
    return { operator: 'oneOf', classUris, values, formula: `{${values.join(', ')}}`, nested: false };
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
  nested: boolean,
): boolean {
  switch (operator) {
    case 'union':
    case 'intersection':
      // A one-class union/intersection is only worth a mark when it also has anonymous operands
      // (e.g. Employee ∩ ∃hasBadge.Badge); the formula then says what the edge alone can't.
      return members.length >= 2 || (nested && members.length === 1);
    case 'complement':
      return members.length >= 1;
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
      // Every rdfs:domain / rdfs:range triple: a property may list a named class AND an expression.
      for (const { exprSide, otherSide } of sides) {
        for (const sideQuad of store.getQuads(subj, DataFactory.namedNode(RDFS + exprSide), null, null)) {
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
          if (!isDrawable(expr.operator, members, expr.values, anchorAvailable, expr.nested)) continue;
          groups.push({
            operator: expr.operator,
            members,
            ...(expr.values ? { values: expr.values } : {}),
            formula: expr.formula,
            nested: expr.nested,
            propertyName: extractLocalName(propUri),
            propertyUri: propUri,
            counterparts,
            position: exprSide,
            propertyKind,
          });
        }
      }
    }
  }
  return groups;
}
