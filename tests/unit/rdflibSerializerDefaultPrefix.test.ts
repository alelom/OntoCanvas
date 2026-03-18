/**
 * Unit tests for rdflib serializer empty-prefix behavior.
 * Verifies we do not emit a hardcoded default @prefix : when the ontology base
 * is unknown, which would break round-trips for ontologies with other bases.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';

const WRONG_DEFAULT_PREFIX = /@prefix\s+:\s*<http:\/\/example\.org\/aec-drawing-ontology#>\s*\./;

describe('rdflib serializer default empty prefix', () => {
  it('must NOT emit hardcoded aec-drawing-ontology base when base is unknown (no originalTtlString)', async () => {
    // Ontology with a different base - not aec-drawing-ontology
    const ttl = `
@prefix : <http://example.org/other-ontology#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .

:SomeClass rdf:type owl:Class ;
    rdfs:label "Some Class" .
`;

    const { store } = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    // Intentionally do NOT pass originalTtlString - base is unknown
    const output = await storeToTurtle(store);

    // Must not use the wrong hardcoded default; that would make :SomeClass resolve
    // to http://example.org/aec-drawing-ontology#SomeClass and break round-trips
    expect(output).not.toMatch(WRONG_DEFAULT_PREFIX);
  });

  it('must use correct base for @prefix : when originalTtlString is provided', async () => {
    const ttl = `
@prefix : <http://example.org/my-ontology#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .

:MyClass rdf:type owl:Class ;
    rdfs:label "My Class" .
`;

    const { store } = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const output = await storeToTurtle(store, undefined, ttl);

    expect(output).toMatch(/@prefix\s+:\s*<http:\/\/example\.org\/my-ontology#>\s*\./);
    expect(output).not.toMatch(WRONG_DEFAULT_PREFIX);
  });
});
