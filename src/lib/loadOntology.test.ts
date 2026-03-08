import { describe, it, expect } from 'vitest';
import { loadOntologyFromContent } from './loadOntology';

const minimalTurtle = `
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix ex: <http://example.org/ns#> .

ex:TestClass a owl:Class ;
  rdfs:label "Test Class" .
`;

const minimalRdfXml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#"
         xmlns:ex="http://example.org/ns#">
  <owl:Class rdf:about="http://example.org/ns#OwlClass">
    <rdfs:label>OWL Class</rdfs:label>
  </owl:Class>
</rdf:RDF>`;

describe('loadOntologyFromContent', () => {
  it('parses Turtle and returns parseResult, prefixMap, extractedRefs', async () => {
    const result = await loadOntologyFromContent(minimalTurtle, 'http://example.org/ont.ttl');
    expect(result.parseResult.graphData.nodes.length).toBe(1);
    expect(result.parseResult.graphData.nodes[0].id).toBe('TestClass');
    expect(result.parseResult.store).toBeDefined();
    expect(result.prefixMap).toEqual({
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      owl: 'http://www.w3.org/2002/07/owl#',
      ex: 'http://example.org/ns#',
    });
    expect(Array.isArray(result.extractedRefs)).toBe(true);
  });

  it('parses RDF/XML when path has .owl extension', async () => {
    const result = await loadOntologyFromContent(minimalRdfXml, 'http://example.org/ont.owl');
    expect(result.parseResult.graphData.nodes.length).toBe(1);
    expect(result.parseResult.graphData.nodes[0].label).toBe('OWL Class');
    expect(result.prefixMap).toEqual({});
    expect(result.extractedRefs).toEqual([]);
  });

  it('returns empty prefixMap for non-Turtle content', async () => {
    const result = await loadOntologyFromContent(minimalRdfXml, 'file.owl');
    expect(result.prefixMap).toEqual({});
  });

  it('parses RDF/XML when path has no extension (URL ending in /)', async () => {
    const result = await loadOntologyFromContent(
      minimalRdfXml,
      'https://rub-informatik-im-bauwesen.github.io/dano/'
    );
    expect(result.parseResult.graphData.nodes.length).toBe(1);
    expect(result.parseResult.graphData.nodes[0].label).toBe('OWL Class');
  });

  it('parses Turtle when path has no extension and content is Turtle', async () => {
    const result = await loadOntologyFromContent(
      minimalTurtle,
      'https://example.org/ontology'
    );
    expect(result.parseResult.graphData.nodes.length).toBe(1);
    expect(result.parseResult.graphData.nodes[0].id).toBe('TestClass');
  });
});
