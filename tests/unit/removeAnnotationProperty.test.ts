import { describe, it, expect } from 'vitest';
import {
  parseRdfToGraph,
  removeAnnotationPropertyFromStore,
  getAnnotationProperties,
} from '../../src/parser';

// Ontology whose base is NOT the default BASE_IRI (http://example.org/aec-drawing-ontology#).
// This is the realistic case: the delete used to fail because it built the URI as
// BASE_IRI + name and found no quads to remove.
const TTL = `@prefix : <http://example.org/myonto#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:myFlag rdf:type owl:AnnotationProperty ;
    rdfs:range xsd:boolean .

:Thing rdf:type owl:Class ;
    :myFlag "true"^^xsd:boolean .
`;

describe('removeAnnotationPropertyFromStore', () => {
  it('deletes an annotation property defined under a non-BASE_IRI namespace (regression)', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    expect(getAnnotationProperties(store).some((ap) => ap.name === 'myFlag')).toBe(true);

    const removed = removeAnnotationPropertyFromStore(store, 'myFlag');
    expect(removed).toBe(true);
    expect(getAnnotationProperties(store).some((ap) => ap.name === 'myFlag')).toBe(false);
  });

  it('resolves the property URI from the store (not BASE_IRI + name)', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    const before = getAnnotationProperties(store).find((ap) => ap.name === 'myFlag');
    expect(before?.uri).toBe('http://example.org/myonto#myFlag');
    expect(removeAnnotationPropertyFromStore(store, 'myFlag')).toBe(true);
  });

  it('returns false for a property that does not exist', async () => {
    const { store } = await parseRdfToGraph(TTL, { path: 'test.ttl' });
    expect(removeAnnotationPropertyFromStore(store, 'doesNotExist')).toBe(false);
  });
});
