import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { annotationUsages } from './annotationUsages';

const NS = 'http://example.org/u#';
const store = new Store(new Parser().parse(`@prefix : <${NS}> . @prefix owl: <http://www.w3.org/2002/07/owl#> .
  @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
  <http://example.org/u> rdf:type owl:Ontology ; :hint "about the ontology" .
  :hint rdf:type owl:AnnotationProperty .
  :Room rdf:type owl:Class ; rdfs:label "Room" ; :hint "a room" , "a space" .
  :Building rdf:type owl:Class ; :hint "a building" .
  :hasRoom rdf:type owl:ObjectProperty ; rdfs:label "has room" ; :hint <http://example.org/doc/hasRoom> .
  :RoomField rdf:type skos:Concept ; skos:prefLabel "Room field"@en ; :hint "a concept" .
  :unused rdf:type owl:AnnotationProperty .`));

describe('annotationUsages (#139)', () => {
  it('lists each term carrying the property, with its label, its kind and its values', () => {
    expect(annotationUsages(store, `${NS}hint`)).toEqual([
      { subject: `${NS}Building`, label: 'Building', kind: 'class', values: ['a building'] },
      { subject: `${NS}Room`, label: 'Room', kind: 'class', values: ['a room', 'a space'] },
      { subject: `${NS}hasRoom`, label: 'has room', kind: 'object property', values: ['http://example.org/doc/hasRoom'] },
      { subject: `${NS}RoomField`, label: 'Room field', kind: 'concept', values: ['a concept'] },
      { subject: 'http://example.org/u', label: 'u', kind: 'ontology', values: ['about the ontology'] },
    ]);
  });

  it('is empty for a property used nowhere', () => {
    expect(annotationUsages(store, `${NS}unused`)).toEqual([]);
  });
});
