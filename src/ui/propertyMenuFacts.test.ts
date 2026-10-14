import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { propertySource, annotationUsedOnClass } from './propertyMenuFacts';

const MAIN = 'https://w3id.org/adiro/aec_drawing_metadata#';
const refs = [{ url: 'https://w3id.org/adiro/aec_provenance', usePrefix: true, prefix: 'aprov' }];

describe('propertySource (#137)', () => {
  it('is null for a property of the open ontology', () => {
    expect(propertySource({ uri: `${MAIN}drawingTitle` }, refs, MAIN)).toBeNull();
    expect(propertySource({ uri: undefined }, refs, MAIN)).toBeNull();
  });

  it('is the prefix of the ontology defining it, when one is known', () => {
    expect(propertySource({ uri: 'https://w3id.org/adiro/aec_provenance#hasConfidence', contextOnly: true }, refs, MAIN)).toBe('aprov');
  });

  it('is the defining ontology\'s name when no prefix is known', () => {
    expect(propertySource({ uri: 'https://w3id.org/adiro/aec_geometry#unit', contextOnly: true }, refs, MAIN)).toBe('aec_geometry');
  });
});

describe('annotationUsedOnClass (#137)', () => {
  const store = new Store(new Parser().parse(`@prefix : <${MAIN}> . @prefix owl: <http://www.w3.org/2002/07/owl#> .
    @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> . @prefix dcterms: <http://purl.org/dc/terms/> .
    @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
    <https://w3id.org/adiro/aec_drawing_metadata> rdf:type owl:Ontology ; dcterms:license <https://example.org/gpl> .
    :Plan rdf:type owl:Class ; :isLabel true .
    :ScaleField rdf:type skos:Concept ; skos:altLabel "scale" .`));

  it('is true for an annotation on a class, which can style it', () => {
    expect(annotationUsedOnClass(store, `${MAIN}isLabel`)).toBe(true);
  });

  it('is false for one only on the ontology header, or only on SKOS concepts, or not used at all', () => {
    expect(annotationUsedOnClass(store, 'http://purl.org/dc/terms/license')).toBe(false);
    expect(annotationUsedOnClass(store, 'http://www.w3.org/2004/02/skos/core#altLabel')).toBe(false);
    expect(annotationUsedOnClass(store, `${MAIN}labellableRoot`)).toBe(false);
  });
});
