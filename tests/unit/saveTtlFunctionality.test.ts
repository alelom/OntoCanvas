import { describe, it, expect } from 'vitest';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';
import { DataFactory, Store } from 'n3';

describe('saveTtl Functionality', () => {
  it('storeToTurtle should complete without hanging', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Test ontology" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // This should complete quickly
    const startTime = Date.now();
    const ttlString = await storeToTurtle(store, undefined, ttl);
    const duration = Date.now() - startTime;

    // Should complete in under 1 second
    expect(duration).toBeLessThan(1000);
    expect(ttlString).toBeTruthy();
    expect(ttlString.length).toBeGreaterThan(0);
    expect(ttlString).toContain('@prefix');
    expect(ttlString).toContain('owl:Ontology');
  });

  it('storeToTurtle should handle empty store', async () => {
    const store = new Store();
    
    const startTime = Date.now();
    const ttlString = await storeToTurtle(store);
    const duration = Date.now() - startTime;

    // Should complete quickly even with empty store
    expect(duration).toBeLessThan(1000);
    expect(ttlString).toBeTruthy();
  });

  it('storeToTurtle should handle store with attribution in rdfs:comment', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Test ontology", "Created/edited with https://alelom.github.io/OntoCanvas/ version 1.8.1" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    // This should complete without hanging
    const startTime = Date.now();
    const ttlString = await storeToTurtle(store, undefined, ttl);
    const duration = Date.now() - startTime;

    // Should complete in under 1 second
    expect(duration).toBeLessThan(1000);
    expect(ttlString).toBeTruthy();
    // Attribution should be removed from rdfs:comment
    expect(ttlString).not.toMatch(/"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/);
    // But should be in comment at top
    expect(ttlString).toMatch(/#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version/);
  });

  it('storeToTurtle should handle large store', async () => {
    const store = new Store();
    const baseIri = 'http://example.org/test#';
    
    // Add many quads to test performance
    for (let i = 0; i < 100; i++) {
      const subject = DataFactory.namedNode(`${baseIri}Class${i}`);
      const predicate = DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      const object = DataFactory.namedNode('http://www.w3.org/2002/07/owl#Class');
      store.addQuad(subject, predicate, object);
    }

    const startTime = Date.now();
    const ttlString = await storeToTurtle(store);
    const duration = Date.now() - startTime;

    // Should complete in under 2 seconds even with many quads
    expect(duration).toBeLessThan(2000);
    expect(ttlString).toBeTruthy();
  });
});
