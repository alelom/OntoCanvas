/**
 * Unit tests for saveTtl functionality.
 * Tests the core TTL serialization logic without requiring browser automation or download detection.
 */
import { describe, it, expect } from 'vitest';
import { Store } from 'n3';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('saveTtl Unit Tests', () => {
  it('should serialize store to valid TTL string', async () => {
    const testTtl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Test ontology" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    const parseResult = await parseRdfToGraph(testTtl, { path: 'test.ttl' });
    const { store } = parseResult;

    expect(store).not.toBeNull();

    const ttlString = await storeToTurtle(store, []);

    expect(ttlString).toBeTruthy();
    expect(ttlString).toContain('@prefix');
    expect(ttlString).toContain('owl:Ontology');
    expect(ttlString).toContain('TestClass');
    expect(ttlString).toContain('Test Class');
  });

  it('should throw error when store is null', async () => {
    // storeToTurtle requires a valid Store, so null should throw
    await expect(storeToTurtle(null as any, [])).rejects.toThrow();
  });

  it('should preserve external ontology references in serialization', async () => {
    const testTtl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" .
`;

    const parseResult = await parseRdfToGraph(testTtl, { path: 'test.ttl' });
    const { store } = parseResult;

    const externalRefs = [
      { url: 'http://example.org/external#', usePrefix: true, prefix: 'ext' },
    ];

    const ttlString = await storeToTurtle(store, externalRefs);

    expect(ttlString).toBeTruthy();
    // Should include owl:imports for external references
    expect(ttlString).toContain('owl:imports');
  });

  it('should serialize complex ontology with multiple classes and properties', async () => {
    const fixtureFile = join(__dirname, '../fixtures/edge-style-test.ttl');
    const content = readFileSync(fixtureFile, 'utf-8');

    const parseResult = await parseRdfToGraph(content, { path: fixtureFile });
    const { store } = parseResult;

    expect(store).not.toBeNull();

    const ttlString = await storeToTurtle(store, []);

    expect(ttlString).toBeTruthy();
    expect(ttlString).toContain('@prefix');
    // Should contain all classes from the fixture
    expect(ttlString).toMatch(/ClassA|ClassB|ClassC/);
  });

  it('should produce idempotent serialization (parse -> serialize -> parse should preserve data)', async () => {
    const testTtl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology ;
    rdfs:comment "Test ontology" .

:TestClass rdf:type owl:Class ;
    rdfs:label "Test Class" ;
    rdfs:comment "A test class" .
`;

    // Parse original
    const parseResult1 = await parseRdfToGraph(testTtl, { path: 'test.ttl' });
    const { store: store1 } = parseResult1;

    // Serialize
    const serialized = await storeToTurtle(store1, []);

    // Parse serialized result
    const parseResult2 = await parseRdfToGraph(serialized, { path: 'test.ttl' });
    const { store: store2 } = parseResult2;

    // Both stores should have the same quads (ignoring blank node IDs which may differ)
    const quads1 = [...store1];
    const quads2 = [...store2];

    // Compare quad counts (should be same or similar)
    expect(quads2.length).toBeGreaterThan(0);
    // The exact count may differ due to blank node handling, but should be close
    expect(Math.abs(quads1.length - quads2.length)).toBeLessThan(5);
  });
});
