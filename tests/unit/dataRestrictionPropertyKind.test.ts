/**
 * #100: a property used only in a data restriction (owl:onDataRange) is a data property. The parser used to
 * add every property it found in a restriction to the object properties too, so it was listed in both menus.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';

const PREFIXES = `@prefix : <http://example.org/m#> .
@prefix ext: <http://example.org/ext#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/m> a owl:Ontology .
:B a owl:Class .
`;

const parse = (body: string) => parseRdfToGraph(PREFIXES + body, { path: 'm.ttl' });

describe('property kind from restrictions (#100)', () => {
  it('lists an undeclared property used with owl:onDataRange as a data property only', async () => {
    const r = await parse(`:A a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ext:extProp ;
      owl:onDataRange xsd:string ; owl:minQualifiedCardinality 1 ] .`);
    expect(r.objectProperties.map((op) => op.uri)).not.toContain('http://example.org/ext#extProp');
    expect(r.dataProperties.map((dp) => dp.name)).toContain('extProp');
  });

  it('does not list a declared data property as an object property when it is restricted', async () => {
    const r = await parse(`:title a owl:DatatypeProperty .
:A a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :title ; owl:minCardinality 1 ] .`);
    expect(r.objectProperties.map((op) => op.name)).not.toContain('title');
  });

  it('still lists an undeclared property of an object restriction as an object property', async () => {
    const r = await parse(`:A a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ext:linksTo ; owl:someValuesFrom :B ] .`);
    expect(r.objectProperties.map((op) => op.uri)).toContain('http://example.org/ext#linksTo');
  });
});
