/**
 * What counts as an individual (#181): the subjects typed with owl:NamedIndividual or with a class outside the RDF, RDFS and
 * OWL vocabularies, whether that class is declared or not. The Individuals tab, its button and the graph all count them this way.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/ontology/buildGraph';
import { individualsOf } from '../../src/lib/instanceData';

const PREFIXES = `
@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<http://example.org/o> a owl:Ontology .
`;

async function individualsIn(body: string): Promise<number> {
  const { store } = await parseRdfToGraph(PREFIXES + body, { contentType: 'text/turtle' });
  return individualsOf(store).size;
}

describe('individualsOf', () => {
  it('counts the individuals of a file, whether their class is declared or not', async () => {
    expect(
      await individualsIn(`
      :Room a owl:Class .
      :r1 a :Room .
      :r2 a :Room .
      :k1 a skos:Concept .
      :n1 a owl:NamedIndividual .
    `)
    ).toBe(4);
  });

  it('finds none in a file that holds only classes, properties and annotations', async () => {
    expect(
      await individualsIn(`
      :Room a owl:Class ; rdfs:label "Room" .
      :Hall a owl:Class ; rdfs:subClassOf :Room .
      :has a owl:ObjectProperty ; rdfs:domain :Room ; rdfs:range :Hall .
      :note a owl:AnnotationProperty .
      [ a owl:Restriction ; owl:onProperty :has ; owl:someValuesFrom :Hall ] rdfs:subClassOf :Room .
    `)
    ).toBe(0);
  });

  it('does not count the members of an owl:oneOf, which the graph shows in the class expression', async () => {
    expect(
      await individualsIn(`
      :Season a owl:Class ; owl:equivalentClass [ a owl:Class ; owl:oneOf ( :winter :summer ) ] .
      :winter a owl:NamedIndividual .
      :summer a owl:NamedIndividual .
    `)
    ).toBe(0);
  });
});
