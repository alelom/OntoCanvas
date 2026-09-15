import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';

const TTL = `
@prefix : <http://example.org/aec-drawing-ontology#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

:Ontology rdf:type owl:Ontology .

:DrawingSheet rdf:type owl:Class .
:Layout rdf:type owl:Class .
:OtherClass rdf:type owl:Class .

:HasScale rdf:type owl:DatatypeProperty ;
  rdfs:label "Has Scale" ;
  rdfs:range xsd:string ;
  rdfs:domain [ rdf:type owl:Class ; owl:unionOf ( :DrawingSheet :Layout ) ] .
`;

describe('Data property domain expressed as owl:unionOf', () => {
  it('resolves union-of-classes domain to its member classes, not owl:Thing', async () => {
    const { dataProperties } = await parseRdfToGraph(TTL, { path: 'test.ttl' });

    const hasScale = dataProperties.find((dp) => dp.name === 'HasScale');
    expect(hasScale).toBeDefined();
    expect([...hasScale!.domains].sort()).toEqual(['DrawingSheet', 'Layout']);
    expect(hasScale!.domains).not.toContain('OtherClass');
  });
});
