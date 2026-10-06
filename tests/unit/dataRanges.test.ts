import { describe, it, expect } from 'vitest';
import { DataFactory, type Store } from 'n3';
import { parseRdfToGraph, getDataProperties, updateDataPropertyRangeInStore } from '../../src/parser';
import { describeDataRange } from '../../src/rdf/dataRanges';

/** Anonymous data ranges described for display: facets, unions, complements, enumerations (#63). */
describe('describeDataRange (#63)', async () => {
  const ttl = `@prefix : <http://example.org/dr#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/dr> a owl:Ontology .
:Thing a owl:Class .
:confidence a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:onDatatype xsd:decimal ;
  owl:withRestrictions ( [ xsd:minInclusive "0.0"^^xsd:decimal ] [ xsd:maxInclusive "1.0"^^xsd:decimal ] ) ] .
:count a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:onDatatype xsd:integer ;
  owl:withRestrictions ( [ xsd:minExclusive "0"^^xsd:integer ] ) ] .
:ratio a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:onDatatype xsd:decimal ;
  owl:withRestrictions ( [ xsd:maxExclusive "1"^^xsd:decimal ] ) ] .
:code a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:onDatatype xsd:string ;
  owl:withRestrictions ( [ xsd:pattern "[A-Z]+" ] [ xsd:maxLength "8"^^xsd:integer ] ) ] .
:either a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:unionOf ( xsd:string xsd:integer ) ] .
:both a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:intersectionOf ( xsd:decimal
  [ a rdfs:Datatype ; owl:onDatatype xsd:decimal ; owl:withRestrictions ( [ xsd:minInclusive "0"^^xsd:decimal ] ) ] ) ] .
:notText a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:datatypeComplementOf xsd:string ] .
:size a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range [ a rdfs:Datatype ; owl:oneOf ( "A0" "A1" ) ] .
:plain a owl:DatatypeProperty ; rdfs:domain :Thing ; rdfs:range xsd:string .`;
  const store = (await parseRdfToGraph(ttl, { path: 'dr.ttl' })).store as unknown as Store;
  const rangeOf = (p: string) =>
    store.getQuads(DataFactory.namedNode(`http://example.org/dr#${p}`), DataFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#range'), null, null)[0].object;
  const describeProp = (p: string) => describeDataRange(store, rangeOf(p));

  it('shows facets as an interval on the base type', () => {
    expect(describeProp('confidence')).toBe('xsd:decimal [0.0, 1.0]');
    expect(describeProp('count')).toBe('xsd:integer (0, ∞)');
    expect(describeProp('ratio')).toBe('xsd:decimal (−∞, 1)');
  });

  it('lists non-interval facets after the base type', () => {
    expect(describeProp('code')).toBe('xsd:string pattern "[A-Z]+", maxLength 8');
  });

  it('describes unions, intersections (recursively), complements and enumerations of datatypes', () => {
    expect(describeProp('either')).toBe('xsd:string ∪ xsd:integer');
    expect(describeProp('both')).toBe('xsd:decimal ∩ xsd:decimal [0, ∞)');
    expect(describeProp('notText')).toBe('¬xsd:string');
    expect(describeProp('size')).toBe('{A0, A1}');
  });

  it('is null for a plain named datatype (nothing to add)', () => {
    expect(describeProp('plain')).toBeNull();
  });

  it('is exposed on DataPropertyInfo as rangeExpression, only for anonymous ranges', () => {
    const dps = getDataProperties(store);
    expect(dps.find((d) => d.name === 'confidence')?.rangeExpression).toBe('xsd:decimal [0.0, 1.0]');
    expect(dps.find((d) => d.name === 'confidence')?.range).toBe('http://www.w3.org/2001/XMLSchema#decimal');
    expect(dps.find((d) => d.name === 'plain')?.rangeExpression).toBeUndefined();
  });
});

describe('changing a data property range replaces an anonymous range completely (#63)', () => {
  it('removes the old datatype restriction and its facet list, leaving no orphaned blank nodes', async () => {
    const ttl = `@prefix : <http://example.org/dr#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/dr> a owl:Ontology .
:confidence a owl:DatatypeProperty ; rdfs:range [ a rdfs:Datatype ; owl:onDatatype xsd:decimal ;
  owl:withRestrictions ( [ xsd:minInclusive "0.0"^^xsd:decimal ] [ xsd:maxInclusive "1.0"^^xsd:decimal ] ) ] .`;
    const store = (await parseRdfToGraph(ttl, { path: 'dr.ttl' })).store as unknown as Store;
    expect(updateDataPropertyRangeInStore(store, 'confidence', 'http://www.w3.org/2001/XMLSchema#string')).toBe(true);
    const blankQuads = store.getQuads(null, null, null, null).filter((q) => q.subject.termType === 'BlankNode');
    expect(blankQuads).toHaveLength(0);
    expect(getDataProperties(store).find((d) => d.name === 'confidence')).toMatchObject({ range: 'http://www.w3.org/2001/XMLSchema#string' });
  });
});
