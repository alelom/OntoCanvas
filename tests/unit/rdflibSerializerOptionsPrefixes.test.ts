/**
 * Unit tests for SerializeStoreOptions.prefixes in rdflib serializer.
 * Verifies that options.prefixes is actually used when building the prefix map.
 * If the option is ignored (dead config), these tests fail.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { serializeStoreWithRdflib } from '../../src/rdf/rdflibSerializer';
import { Store } from 'n3';

describe('rdflib serializer options.prefixes', () => {
  it('should include custom prefix from options.prefixes in output', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .
:MyClass rdf:type owl:Class ; rdfs:label "My Class" .
`;

    const { store } = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const customPrefixes: Record<string, string> = {
      ex: 'http://example.org/custom-namespace#',
    };

    const output = await serializeStoreWithRdflib(store, {
      baseIRI: 'http://example.org/test#',
      prefixes: customPrefixes,
    });

    // If options.prefixes is wired in, we should see the custom prefix
    expect(output).toMatch(/@prefix\s+ex:\s*<http:\/\/example\.org\/custom-namespace#>\s*\./);
  });

  it('should merge options.prefixes with built-in prefixes (custom overrides same key)', async () => {
    const store = new Store();
    // Minimal store so we get some output
    const { DataFactory } = await import('n3');
    store.addQuad(
      DataFactory.namedNode('http://example.org/foo#Subject'),
      DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      DataFactory.namedNode('http://www.w3.org/2002/07/owl#Class')
    );

    // Pass a custom 'owl' to prove options.prefixes is used (would override built-in if merged)
    const output = await serializeStoreWithRdflib(store, {
      baseIRI: 'http://example.org/foo#',
      prefixes: {
        owl: 'http://example.org/custom-owl#',
      },
    });

    // If options.prefixes is used and merged, we should see our custom owl namespace
    expect(output).toMatch(/@prefix\s+owl:\s*<http:\/\/example\.org\/custom-owl#>\s*\./);
  });
});
