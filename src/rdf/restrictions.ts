/**
 * Reading OWL object-property restrictions (`C rdfs:subClassOf [ a owl:Restriction ; owl:onProperty p ; … ]`)
 * into the edge they are drawn as, and which of them the editor may change. See issue #63.
 *
 * Kinds, and the class the edge points to:
 * - `some`        owl:someValuesFrom C            → C            label prefix ∃
 * - `only`        owl:allValuesFrom C             → C            label prefix ∀
 * - `value`       owl:hasValue a                  → a's class    label prefix ∋, plus `{a}`
 * - `self`        owl:hasSelf true                → the subject  label prefix ⟲ (a self-loop)
 * - `qualified`   owl:onClass C (+ qualified n)   → C            label `[min..max]` (as before)
 * - `unqualified` owl:(min|max)Cardinality / owl:cardinality with no filler → p's rdfs:range
 */
import { DataFactory, type Store } from 'n3';
import type { GraphEdge, RestrictionKind } from '../types';
import { extractLocalName } from '../utils/localName';
import { individualTypeUris, isTrueLiteral, type RdfTerm } from './classExpressions';
import { removeBlankNodeClosure } from './blankNodes';

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/** Display / merge order of kinds on one edge. */
export const RESTRICTION_KIND_ORDER: RestrictionKind[] = ['some', 'only', 'value', 'self', 'qualified', 'unqualified'];

/** Label prefix glyph per kind (cardinality kinds show their numbers instead). */
export const RESTRICTION_GLYPH: Partial<Record<RestrictionKind, string>> = { some: '∃', only: '∀', value: '∋', self: '⟲' };

/** Kinds the Edit-edge modal and the store writers understand (they write someValuesFrom or onClass +
 * qualified cardinality). Editing any other kind through them would silently change its meaning. */
const EDITABLE_KINDS: ReadonlySet<RestrictionKind> = new Set(['some', 'qualified']);

/** Whether an edge may be edited/deleted through the editor without rewriting what it means. Plain
 * domain/range edges, and restriction edges with no recorded kinds, keep today's behaviour. */
export function isEditableRestriction(edge: Pick<GraphEdge, 'restrictionKinds'>): boolean {
  return (edge.restrictionKinds ?? []).every((k) => EDITABLE_KINDS.has(k));
}

/** Merge a kind into an edge's kinds, keeping RESTRICTION_KIND_ORDER and no duplicates. */
export function mergeRestrictionKinds(kinds: RestrictionKind[] | undefined, kind: RestrictionKind): RestrictionKind[] {
  const set = new Set([...(kinds ?? []), kind]);
  return RESTRICTION_KIND_ORDER.filter((k) => set.has(k));
}

/** An object restriction read from its blank node. */
export interface ObjectRestriction {
  kind: RestrictionKind;
  propertyUri: string;
  /** URI of the class the edge points to. */
  targetUri: string;
  /** `value` only: local name of the individual. */
  value?: string;
}

/** Read the object restriction a blank node denotes (given the restricted class's URI), or null if it
 * isn't one that can be drawn as an edge (no property, an anonymous filler, an untyped individual, an
 * unqualified cardinality with no named range, or a data restriction). */
export function readObjectRestriction(store: Store, blank: RdfTerm, subjectUri: string): ObjectRestriction | null {
  const objectOf = (pred: string) =>
    store.getQuads(blank as never, DataFactory.namedNode(OWL + pred), null, null)[0]?.object as RdfTerm | undefined;
  const named = (t: RdfTerm | undefined): string | null => (t?.termType === 'NamedNode' && t.value ? t.value : null);

  const propertyUri = named(objectOf('onProperty'));
  if (!propertyUri) return null;

  const filler = (pred: string, kind: RestrictionKind): ObjectRestriction | null => {
    const target = named(objectOf(pred));
    return target ? { kind, propertyUri, targetUri: target } : null;
  };
  // A restriction has exactly one of these fillers; each is drawn only when it is a named class.
  if (objectOf('someValuesFrom')) return filler('someValuesFrom', 'some');
  if (objectOf('onClass')) return filler('onClass', 'qualified');
  if (objectOf('allValuesFrom')) return filler('allValuesFrom', 'only');

  const value = objectOf('hasValue');
  if (value) {
    if (value.termType !== 'NamedNode' || !value.value) return null; // a literal: a data restriction
    const typeUri = individualTypeUris(store, value)[0];
    return typeUri ? { kind: 'value', propertyUri, targetUri: typeUri, value: extractLocalName(value.value) } : null;
  }

  if (isTrueLiteral(objectOf('hasSelf'))) return { kind: 'self', propertyUri, targetUri: subjectUri };

  if (objectOf('minCardinality') || objectOf('maxCardinality') || objectOf('cardinality')) {
    const range = store.getQuads(DataFactory.namedNode(propertyUri), DataFactory.namedNode(RDFS + 'range'), null, null)
      .map((q) => named(q.object as RdfTerm))
      .find((u): u is string => !!u);
    return range ? { kind: 'unqualified', propertyUri, targetUri: range } : null;
  }
  return null;
}

/** The restriction blank nodes of `subjectUri` (via rdfs:subClassOf) that are drawn as the edge to
 * `targetUri` for `propertyUri` — matched with readObjectRestriction, exactly as the parser drew them,
 * so every kind is found (a merged ∃∀ edge yields both). */
export function findRestrictionBlanks(store: Store, subjectUri: string, propertyUri: string, targetUri: string): RdfTerm[] {
  return store
    .getQuads(DataFactory.namedNode(subjectUri), DataFactory.namedNode(RDFS + 'subClassOf'), null, null)
    .map((q) => q.object as RdfTerm)
    .filter((o) => o.termType === 'BlankNode')
    .filter((blank) => {
      const r = readObjectRestriction(store, blank, subjectUri);
      return !!r && r.propertyUri === propertyUri && r.targetUri === targetUri;
    });
}

/** Remove one restriction of `subjectUri`: its rdfs:subClassOf link and, once no other class refers to it
 * (a labelled blank node can be shared), the restriction's own triples, leaving no orphaned blank nodes. */
export function removeRestrictionBlank(store: Store, subjectUri: string, blank: RdfTerm): void {
  for (const q of store.getQuads(DataFactory.namedNode(subjectUri), DataFactory.namedNode(RDFS + 'subClassOf'), blank as never, null)) {
    store.removeQuad(q);
  }
  if (store.getQuads(null, null, blank as never, null).length === 0) removeBlankNodeClosure(store, blank);
}

/** Plain-language detail of a restriction edge, one line per kind (for the read-only Edit-edge notice). */
export function describeRestriction(edge: GraphEdge, propertyLabel: string): string[] {
  const { from, to } = edge;
  const card = `[${edge.minCardinality ?? 0}..${edge.maxCardinality ?? '*'}]`;
  return (edge.restrictionKinds ?? []).map((kind) => {
    switch (kind) {
      case 'some':
        return `∃ some: every ${from} has at least one ${propertyLabel} that is a ${to}.`;
      case 'only':
        return `∀ only: every ${propertyLabel} of a ${from} is a ${to}.`;
      case 'value':
        return `∋ value: every ${from} has ${propertyLabel} ${edge.restrictionValue ?? '?'} (a ${to}).`;
      case 'self':
        return `⟲ self: every ${from} is related to itself by ${propertyLabel}.`;
      case 'qualified':
        return `Cardinality: every ${from} has ${card} ${propertyLabel} values that are a ${to}.`;
      case 'unqualified':
        return `Cardinality: every ${from} has ${card} ${propertyLabel} values (of any class; ${to} is the property range).`;
    }
  });
}

/** Cardinality of a restriction blank node, reading both the qualified (OWL 2, used with owl:onClass /
 * owl:onDataRange) and unqualified forms: an exact count sets min and max; otherwise min/max as given. */
export function readRestrictionCardinality(store: Store, blank: RdfTerm): { min: number | null; max: number | null } {
  const int = (pred: string): number | null => {
    const value = store.getQuads(blank as never, DataFactory.namedNode(OWL + pred), null, null)[0]?.object?.value;
    const n = value != null ? Number.parseInt(String(value), 10) : NaN;
    return Number.isNaN(n) ? null : n;
  };
  const exact = int('qualifiedCardinality') ?? int('cardinality');
  if (exact != null) return { min: exact, max: exact };
  return { min: int('minQualifiedCardinality') ?? int('minCardinality'), max: int('maxQualifiedCardinality') ?? int('maxCardinality') };
}
