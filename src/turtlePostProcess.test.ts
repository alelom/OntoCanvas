import { describe, it, expect } from 'vitest';
import { postProcessTurtle, hasUndefinedBlankNodeRefs } from './turtlePostProcess';

describe('hasUndefinedBlankNodeRefs', () => {
  it('is true when a blank node is referenced but never defined (data loss)', () => {
    const ttl = `:hasOrientation rdfs:domain _:df_0_0 ;\n    rdfs:range :OrientationValue .`;
    expect(hasUndefinedBlankNodeRefs(ttl)).toBe(true);
  });
  it('is false when a referenced blank node is also defined', () => {
    const ttl = `:Test rdfs:subClassOf _:n3-0 .\n_:n3-0 rdf:type owl:Restriction ; owl:onProperty :p .`;
    expect(hasUndefinedBlankNodeRefs(ttl)).toBe(false);
  });
  it('is false for inline-only anonymous nodes (no _: references at all)', () => {
    const ttl = `:hasOrientation rdfs:domain [ a owl:Class ; owl:unionOf ( :A :B ) ] .`;
    expect(hasUndefinedBlankNodeRefs(ttl)).toBe(false);
  });
  it('is false for a label the source already left undefined, true for a new one (#124)', () => {
    const source = `:A rdfs:subClassOf _:df_0_0 .`;
    expect(hasUndefinedBlankNodeRefs(`:A rdfs:subClassOf _:df_0_0 .`, source)).toBe(false);
    expect(hasUndefinedBlankNodeRefs(`:A rdfs:subClassOf _:df_0_0, _:df_0_1 .`, source)).toBe(true);
  });
});

describe('postProcessTurtle blank node inlining', () => {
  it('inlines _:n3-X to [ ... ] form', () => {
    const input = `@prefix : <http://example.org/aec-drawing-ontology#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Test rdf:type owl:Class;
    rdfs:subClassOf _:n3-0.

_:n3-0 rdf:type owl:Restriction;
    owl:onProperty :contains;
    owl:minQualifiedCardinality 0;
    owl:onClass :Layout.
`;
    const output = postProcessTurtle(input);
    expect(output).not.toMatch(/_\s*:\s*n3-\d/);
    expect(output).toMatch(/\[\s*rdf:type\s+owl:Restriction/);
    expect(output).toMatch(/rdfs:subClassOf\s+\[/);
  });
});

describe('buildInlineForms RDF lists', () => {
  it('writes a class expression list as a collection, as Turtle sources do (#65)', async () => {
    const { Parser } = await import('n3');
    const { buildInlineForms } = await import('./turtlePostProcess');
    const quads = new Parser().parse(
      '@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n' +
      '<http://example.org/aec-drawing-ontology#p> rdfs:domain [ owl:unionOf ( <http://example.org/aec-drawing-ontology#A> [ owl:complementOf <http://example.org/aec-drawing-ontology#B> ] ) ] .'
    );
    const domain = quads.find((q) => q.predicate.value.endsWith('domain'))!.object as { id: string };
    expect(buildInlineForms(quads).get(domain.id)).toBe('[ owl:unionOf ( :A [ owl:complementOf :B ] ) ]');
  });
});
