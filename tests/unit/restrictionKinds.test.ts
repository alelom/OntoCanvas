import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph, removeRestrictionEdgeFromStore, getDataPropertyRestrictionsForClass } from '../../src/parser';
import { getEdgeDisplayLabel } from '../../src/ui/relationshipUtils';
import { isEditableRestriction, findRestrictionBlanks, describeRestriction } from '../../src/rdf/restrictions';
import type { GraphEdge } from '../../src/types';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures');

/** Restriction kinds on edges: ∃ some, ∀ only, ∋ hasValue, ⟲ hasSelf, cardinality (#63). */
describe('restriction kinds (#63)', async () => {
  const r = await parseRdfToGraph(readFileSync(join(FIXTURES, 'restrictionKinds.ttl'), 'utf-8'), { path: 'restrictionKinds.ttl' });
  const edge = (from: string, to: string, type: string): GraphEdge | undefined =>
    r.graphData.edges.find((e) => e.from === from && e.to === to && e.type === type);
  const label = (e: GraphEdge | undefined) => getEdgeDisplayLabel(e!, r.objectProperties, []);

  it('∃ someValuesFrom keeps its implied [1..*] and gains the ∃ prefix; a matching ∀ merges into the same edge', () => {
    const e = edge('Room', 'Wall', 'hasPart');
    expect(e?.restrictionKinds).toEqual(['some', 'only']);
    expect(label(e)).toBe('∃∀ hasPart [1..*]');
  });

  it('∀ allValuesFrom draws an edge with the ∀ prefix and no implied cardinality', () => {
    const e = edge('Building', 'Floor', 'hasFloor');
    expect(e?.restrictionKinds).toEqual(['only']);
    expect(e?.minCardinality ?? null).toBeNull();
    expect(label(e)).toBe('∀ hasFloor');
  });

  it('∋ hasValue draws an edge to the individual\'s class, naming the individual', () => {
    const e = edge('Sheet', 'Status', 'hasStatus');
    expect(e?.restrictionKinds).toEqual(['value']);
    expect(e?.restrictionValue).toBe('Current');
    expect(label(e)).toBe('∋ hasStatus {Current}');
  });

  it('⟲ hasSelf draws a self-loop', () => {
    const e = edge('Person', 'Person', 'knows');
    expect(e?.restrictionKinds).toEqual(['self']);
    expect(label(e)).toBe('⟲ knows');
  });

  it('unqualified owl:cardinality is read, drawn to the property range', () => {
    const e = edge('Sheet', 'Revision', 'hasRevision');
    expect(e?.restrictionKinds).toEqual(['unqualified']);
    expect(label(e)).toBe('hasRevision [2..2]');
  });

  it('an unqualified cardinality with no range has nowhere to point, so draws nothing', () => {
    expect(r.graphData.edges.some((e) => e.type === 'hasNote')).toBe(false);
  });

  it('qualified cardinality (onClass) is unchanged: no glyph', () => {
    const e = edge('DrawingSet', 'Sheet', 'contains');
    expect(e?.restrictionKinds).toEqual(['qualified']);
    expect(label(e)).toBe('contains [1..*]');
  });

  it('only ∃ and qualified restrictions are editable (the editor would rewrite the others)', () => {
    expect(isEditableRestriction(edge('DrawingSet', 'Sheet', 'contains')!)).toBe(true);
    expect(isEditableRestriction({ from: 'A', to: 'B', type: 'p', isRestriction: true, restrictionKinds: ['some'] })).toBe(true);
    expect(isEditableRestriction(edge('Room', 'Wall', 'hasPart')!)).toBe(false);
    expect(isEditableRestriction(edge('Building', 'Floor', 'hasFloor')!)).toBe(false);
    expect(isEditableRestriction(edge('Sheet', 'Status', 'hasStatus')!)).toBe(false);
    expect(isEditableRestriction(edge('Person', 'Person', 'knows')!)).toBe(false);
    expect(isEditableRestriction(edge('Sheet', 'Revision', 'hasRevision')!)).toBe(false);
    // Plain domain/range edges and legacy restriction edges without kinds stay editable.
    expect(isEditableRestriction({ from: 'A', to: 'B', type: 'p' })).toBe(true);
    expect(isEditableRestriction({ from: 'A', to: 'B', type: 'p', isRestriction: true })).toBe(true);
  });
});

describe('removing the restriction(s) behind an edge (#63)', () => {
  const RK = 'http://example.org/rk#';
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

  async function load() {
    const ttl = readFileSync(join(FIXTURES, 'restrictionKinds.ttl'), 'utf-8');
    return (await parseRdfToGraph(ttl, { path: 'restrictionKinds.ttl' })).store;
  }

  it('finds every restriction drawn as the edge (∃ and ∀ merged) and removes them without orphans', async () => {
    const store = await load();
    const blanks = findRestrictionBlanks(store, RK + 'Room', RK + 'hasPart', RK + 'Wall');
    expect(blanks).toHaveLength(2);
    const before = store.size;
    expect(removeRestrictionEdgeFromStore(store, 'Room', 'Wall', 'hasPart')).toBe(2);
    // Each restriction: its subClassOf link + rdf:type + onProperty + filler = 4 quads.
    expect(before - store.size).toBe(8);
    expect(findRestrictionBlanks(store, RK + 'Room', RK + 'hasPart', RK + 'Wall')).toHaveLength(0);
    const orphans = store.getQuads(null, null, null, null).filter((q) => q.subject.termType === 'BlankNode' && store.getQuads(null, null, q.subject, null).length === 0);
    expect(orphans).toHaveLength(0);
  });

  it('matches each kind by the class its edge points to, and leaves other restrictions alone', async () => {
    const store = await load();
    expect(findRestrictionBlanks(store, RK + 'Sheet', RK + 'hasStatus', RK + 'Status')).toHaveLength(1); // ∋ via the individual's class
    expect(findRestrictionBlanks(store, RK + 'Person', RK + 'knows', RK + 'Person')).toHaveLength(1); // ⟲
    expect(findRestrictionBlanks(store, RK + 'Sheet', RK + 'hasRevision', RK + 'Revision')).toHaveLength(1); // unqualified, via range
    expect(findRestrictionBlanks(store, RK + 'Sheet', RK + 'hasStatus', RK + 'Revision')).toHaveLength(0);
    removeRestrictionEdgeFromStore(store, 'Building', 'Floor', 'hasFloor');
    expect(findRestrictionBlanks(store, RK + 'Sheet', RK + 'hasStatus', RK + 'Status')).toHaveLength(1);
    expect(store.getQuads(null, RDFS + 'subClassOf', null, null).filter((q) => q.subject.value === RK + 'Building')).toHaveLength(0);
    expect(store.getQuads(null, OWL + 'allValuesFrom', RK + 'Floor', null)).toHaveLength(0);
  });
});

describe('describeRestriction: the read-only detail shown in the Edit-edge modal (#63)', () => {
  const e = (o: Partial<GraphEdge>): GraphEdge => ({ from: 'Room', to: 'Wall', type: 'hasPart', isRestriction: true, ...o });
  it('says what each kind means, in plain language', () => {
    expect(describeRestriction(e({ restrictionKinds: ['some'], minCardinality: 1 }), 'hasPart')).toEqual([
      '∃ some: every Room has at least one hasPart that is a Wall.',
    ]);
    expect(describeRestriction(e({ restrictionKinds: ['only'] }), 'hasPart')).toEqual([
      '∀ only: every hasPart of a Room is a Wall.',
    ]);
    expect(describeRestriction(e({ to: 'Status', restrictionKinds: ['value'], restrictionValue: 'Current' }), 'hasStatus')).toEqual([
      '∋ value: every Room has hasStatus Current (a Status).',
    ]);
    expect(describeRestriction(e({ to: 'Room', restrictionKinds: ['self'] }), 'knows')).toEqual([
      '⟲ self: every Room is related to itself by knows.',
    ]);
    expect(describeRestriction(e({ to: 'Revision', restrictionKinds: ['unqualified'], minCardinality: 2, maxCardinality: 2 }), 'hasRevision')).toEqual([
      'Cardinality: every Room has [2..2] hasRevision values (of any class; Revision is the property range).',
    ]);
    expect(describeRestriction(e({ to: 'Sheet', restrictionKinds: ['qualified'], minCardinality: 1 }), 'contains')).toEqual([
      'Cardinality: every Room has [1..*] contains values that are a Sheet.',
    ]);
  });
  it('lists one line per kind on a merged edge', () => {
    expect(describeRestriction(e({ restrictionKinds: ['some', 'only'], minCardinality: 1 }), 'hasPart')).toHaveLength(2);
  });
});

describe('data-property restriction cardinality, OWL 2 qualified forms (#63)', async () => {
  const ttl = `@prefix : <http://example.org/dq#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/dq> a owl:Ontology .
:Sheet a owl:Class ;
  rdfs:subClassOf
    [ a owl:Restriction ; owl:onProperty :title ; owl:onDataRange xsd:string ; owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ] ,
    [ a owl:Restriction ; owl:onProperty :note ; owl:onDataRange xsd:string ; owl:minQualifiedCardinality "0"^^xsd:nonNegativeInteger ; owl:maxQualifiedCardinality "3"^^xsd:nonNegativeInteger ] ,
    [ a owl:Restriction ; owl:onProperty :code ; owl:onDataRange xsd:string ; owl:minCardinality "2"^^xsd:nonNegativeInteger ] .
:title a owl:DatatypeProperty .
:note a owl:DatatypeProperty .
:code a owl:DatatypeProperty .`;
  const r = await parseRdfToGraph(ttl, { path: 'dq.ttl' });
  const sheet = r.graphData.nodes.find((n) => n.id === 'Sheet')!;
  const byProp = (p: string) => sheet.dataPropertyRestrictions?.find((x) => x.propertyName === p);

  it('reads qualifiedCardinality and min/maxQualifiedCardinality, not only the unqualified forms', () => {
    expect(byProp('title')).toMatchObject({ minCardinality: 1, maxCardinality: 1 });
    expect(byProp('note')).toMatchObject({ minCardinality: 0, maxCardinality: 3 });
    expect(byProp('code')).toMatchObject({ minCardinality: 2 });
    expect(byProp('code')?.maxCardinality).toBeUndefined();
  });

  it('reads them the same way when re-reading a class after an edit', () => {
    const again = getDataPropertyRestrictionsForClass(r.store, 'Sheet');
    expect(again.find((x) => x.propertyName === 'note')).toMatchObject({ minCardinality: 0, maxCardinality: 3 });
  });
});
