import { describe, it, expect } from 'vitest';
import { postProcessTurtle } from './turtlePostProcess';

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
