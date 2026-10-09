import { describe, it, expect } from 'vitest';
import { RESERVED_VOCABULARY_NAMESPACES, isReservedNamespace, isReservedVocabularyUri } from './reservedVocabulary';

describe('the OWL 2 reserved vocabulary (owl, rdf, rdfs, xsd)', () => {
  it('is the four namespaces the language itself defines, without a trailing # or /', () => {
    expect([...RESERVED_VOCABULARY_NAMESPACES].sort()).toEqual([
      'http://www.w3.org/1999/02/22-rdf-syntax-ns',
      'http://www.w3.org/2000/01/rdf-schema',
      'http://www.w3.org/2001/XMLSchema',
      'http://www.w3.org/2002/07/owl',
    ]);
  });

  it('knows a namespace with or without its trailing # or /', () => {
    expect(isReservedNamespace('http://www.w3.org/2002/07/owl')).toBe(true);
    expect(isReservedNamespace('http://www.w3.org/2002/07/owl#')).toBe(true);
    expect(isReservedNamespace('http://www.w3.org/2003/01/geo/wgs84_pos')).toBe(false);
  });

  it('knows the terms in them (owl:Thing, rdfs:Resource, xsd:string, rdf:Property)', () => {
    expect(isReservedVocabularyUri('http://www.w3.org/2002/07/owl#Thing')).toBe(true);
    expect(isReservedVocabularyUri('http://www.w3.org/2000/01/rdf-schema#Resource')).toBe(true);
    expect(isReservedVocabularyUri('http://www.w3.org/1999/02/22-rdf-syntax-ns#Property')).toBe(true);
    expect(isReservedVocabularyUri('http://www.w3.org/2001/XMLSchema#string')).toBe(true);
  });

  it('is not about who published a vocabulary: other W3C ones, and any third party, are not reserved', () => {
    expect(isReservedVocabularyUri('http://www.w3.org/2004/02/skos/core#Concept')).toBe(false);
    expect(isReservedVocabularyUri('http://www.w3.org/ns/prov#Entity')).toBe(false);
    expect(isReservedVocabularyUri('http://xmlns.com/foaf/0.1/Person')).toBe(false);
  });

  it('is false for something that is not an IRI', () => {
    expect(isReservedVocabularyUri('Person')).toBe(false);
    expect(isReservedVocabularyUri('')).toBe(false);
  });
});
