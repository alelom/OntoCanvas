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
import { individualTypeUris, type RdfTerm } from './classExpressions';

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

  if (objectOf('hasSelf')) return { kind: 'self', propertyUri, targetUri: subjectUri };

  if (objectOf('minCardinality') || objectOf('maxCardinality') || objectOf('cardinality')) {
    const range = store.getQuads(DataFactory.namedNode(propertyUri), DataFactory.namedNode(RDFS + 'range'), null, null)
      .map((q) => named(q.object as RdfTerm))
      .find((u): u is string => !!u);
    return range ? { kind: 'unqualified', propertyUri, targetUri: range } : null;
  }
  return null;
}
