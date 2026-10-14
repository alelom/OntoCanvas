/**
 * Properties declared `owl:deprecated true` are flagged as such (#137), so the menus can show them apart. Kept
 * declared so that data written against an earlier release keeps its meaning; nothing else about them changes.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';

const TTL = `@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<http://example.org/o> rdf:type owl:Ontology .
:isLabel rdf:type owl:AnnotationProperty ; rdfs:range xsd:boolean .
:labellableRoot rdf:type owl:AnnotationProperty ; owl:deprecated true ; rdfs:range xsd:boolean ;
    rdfs:comment "Deprecated: use isLabel." .
:hasPart rdf:type owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :A .
:contains rdf:type owl:ObjectProperty ; owl:deprecated "true"^^xsd:boolean ; rdfs:domain :A ; rdfs:range :A .
:name rdf:type owl:DatatypeProperty ; rdfs:domain :A ; rdfs:range xsd:string .
:oldName rdf:type owl:DatatypeProperty ; owl:deprecated true ; rdfs:domain :A ; rdfs:range xsd:string .
:A rdf:type owl:Class .
`;

describe('owl:deprecated properties (#137)', () => {
  it('flags deprecated annotation, object and data properties, and only those', async () => {
    const { annotationProperties, objectProperties, dataProperties } = await parseRdfToGraph(TTL, { path: 'o.ttl' });
    const deprecated = (list: { name: string; deprecated?: boolean }[]) => list.filter((p) => p.deprecated).map((p) => p.name);
    expect(deprecated(annotationProperties)).toEqual(['labellableRoot']);
    expect(deprecated(objectProperties)).toEqual(['contains']);
    expect(deprecated(dataProperties)).toEqual(['oldName']);
  });
});
