/**
 * Recording a store change and reverting it exactly (#77): undoing a class delete must bring back every
 * triple the delete removed, not only what the writers can rebuild (a label).
 */
import { describe, it, expect } from 'vitest';
import { DataFactory, type Store } from 'n3';
import { parseRdfToGraph, removeNodeFromStore, removeRestrictionEdgeFromStore } from '../../src/parser';
import { snapshotStore, diffStore, revertStoreChange, reapplyStoreChange } from '../../src/lib/storeChange';

const TTL = `@prefix : <http://example.org/u#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/u> rdf:type owl:Ontology .
:note rdf:type owl:AnnotationProperty .
:hasPart rdf:type owl:ObjectProperty ; rdfs:range :Wall .
:title rdf:type owl:DatatypeProperty .
:Thing rdf:type owl:Class .
:Wall rdf:type owl:Class ;
    rdfs:label "Wall"@en ;
    rdfs:comment "A vertical element." ;
    :note "checked" ;
    rdfs:subClassOf :Thing ,
        [ rdf:type owl:Restriction ; owl:onProperty :title ; owl:onDataRange xsd:string ; owl:qualifiedCardinality "1"^^xsd:nonNegativeInteger ] .
:Room rdf:type owl:Class ;
    rdfs:subClassOf [ rdf:type owl:Restriction ; owl:onProperty :hasPart ; owl:allValuesFrom :Wall ] .
`;

const sortedQuads = (store: Store) =>
  store.getQuads(null, null, null, null).map((q) => `${q.subject.termType}:${q.subject.termType === 'BlankNode' ? '_' : q.subject.value} ${q.predicate.value} ${q.object.termType}:${q.object.termType === 'BlankNode' ? '_' : q.object.value}`).sort();

describe('store change (#77)', () => {
  it('reverting a class delete restores every removed triple, including a ∀ restriction to it', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'u.ttl' });
    const before = sortedQuads(store!);
    const snapshot = snapshotStore(store!);

    // What deleting Wall does: its read-only ∀ restriction goes with it, then the class itself.
    removeRestrictionEdgeFromStore(store!, 'Room', 'Wall', 'hasPart');
    removeNodeFromStore(store!, 'Wall');
    const change = diffStore(snapshot, store!);
    expect(change.removed.length).toBeGreaterThan(5);
    const afterDelete = sortedQuads(store!);
    expect(afterDelete).not.toEqual(before);

    revertStoreChange(store!, change);
    expect(sortedQuads(store!)).toEqual(before);
    // The restored restriction is the same blank node as before, still linked from Room.
    const roomLinks = store!.getQuads(DataFactory.namedNode('http://example.org/u#Room'), null, null, null)
      .filter((q) => q.object.termType === 'BlankNode');
    expect(store!.getQuads(roomLinks[0].object, null, null, null)).toHaveLength(3);

    reapplyStoreChange(store!, change);
    expect(sortedQuads(store!)).toEqual(afterDelete);
  });

  it('records added triples too, and an unchanged store as no change', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'u.ttl' });
    const snapshot = snapshotStore(store!);
    expect(diffStore(snapshot, store!)).toEqual({ removed: [], added: [] });
    const q = DataFactory.quad(DataFactory.namedNode('http://example.org/u#X'), DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#label'), DataFactory.literal('X', 'en'));
    store!.addQuad(q);
    const change = diffStore(snapshot, store!);
    expect(change.added).toHaveLength(1);
    revertStoreChange(store!, change);
    expect(store!.has(q)).toBe(false);
  });
});
