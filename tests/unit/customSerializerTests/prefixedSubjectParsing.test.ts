/**
 * Reading a statement's subject when it is written with a named prefix.
 *
 * https://github.com/alelom/OntoCanvas/issues/32 — `prov:Agent` was read neither as a block subject
 * (so the stanza looked absent from the file and was appended again) nor skipped by the property
 * parser (so it was taken for the block's first predicate, matching no quad).
 */
import { describe, it, expect } from 'vitest';
import { extractSubject } from '../../../src/rdf/sourcePreservation';
import { parsePropertyLinesWithStateMachine } from '../../../src/rdf/propertyLineParser';

describe('extractSubject', () => {
  it('reads a subject written with a named prefix', () => {
    expect(extractSubject('prov:Agent rdf:type owl:Class ;')).toBe('prov:Agent');
    expect(extractSubject('dc-terms:title a owl:AnnotationProperty .')).toBe('dc-terms:title');
  });

  it('still reads the default-prefix and absolute forms', () => {
    expect(extractSubject(':FieldAssertion rdf:type owl:Class ;')).toBe(':FieldAssertion');
    expect(extractSubject('<https://w3id.org/adiro/x> rdf:type owl:Ontology ;')).toBe('<https://w3id.org/adiro/x>');
  });

  it('returns null for a line that starts with no subject', () => {
    expect(extractSubject('a owl:Class ;')).toBeNull();
    expect(extractSubject('')).toBeNull();
    expect(extractSubject('# a comment')).toBeNull();
  });
});

describe('parsePropertyLinesWithStateMachine subject handling', () => {
  const block = `prov:Agent rdf:type owl:Class ;
    rdfs:label "Agent" ;
    rdfs:isDefinedBy <http://www.w3.org/ns/prov#> .`;

  it('skips a prefixed subject it is told about', () => {
    const matches = parsePropertyLinesWithStateMachine(block, 0, 1, 'prov:Agent');
    expect(matches.map((m) => m.predicate)).toEqual(['rdf:type', 'rdfs:label', 'rdfs:isDefinedBy']);
  });

  it('would otherwise mistake that subject for the first predicate', () => {
    const matches = parsePropertyLinesWithStateMachine(block, 0, 1);
    expect(matches[0].predicate).toBe('prov:Agent');
  });

  it('leaves text that already starts at a predicate alone', () => {
    const properties = `rdfs:subClassOf [ rdf:type owl:Restriction ; owl:onProperty :contains ] ;
    rdfs:label "Sheet" .`;
    const matches = parsePropertyLinesWithStateMachine(properties, 0, 1);
    expect(matches.map((m) => m.predicate)).toEqual(['rdfs:subClassOf', 'rdfs:label']);
  });

  it('still skips a default-prefix subject with no subject given', () => {
    const matches = parsePropertyLinesWithStateMachine(':Sheet rdf:type owl:Class ;\n    rdfs:label "Sheet" .', 0, 1);
    expect(matches.map((m) => m.predicate)).toEqual(['rdf:type', 'rdfs:label']);
  });
});
