import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/parser';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples');

const typesOf = async (ttl: string, property: string) => {
  const r = await parseRdfToGraph(ttl, { path: 'x.ttl' });
  return [...new Set(r.graphData.edges.filter((e) => e.type.replace(/.*[#/]/, '') === property).map((e) => e.type))];
};

/** One property, one edge type (#87): restriction edges and domain/range edges decide "is this property
 * external?" the same way, so the legend, colours and display config don't split a property in two. */
describe('edge type naming (#87)', () => {
  it('a property with both a restriction and a domain/range is one edge type', async () => {
    const ttl = readFileSync(join(EXAMPLES, 'class-expressions/self-loop-restriction.ttl'), 'utf-8');
    expect(await typesOf(ttl, 'knows')).toEqual(['knows']);
  });

  it("a domain/range property in the ontology's own namespace is local, whatever that namespace is", async () => {
    const ttl = `@prefix : <http://example.org/other#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/other> a owl:Ontology .
:A a owl:Class . :B a owl:Class .
:linksTo a owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :B .`;
    expect(await typesOf(ttl, 'linksTo')).toEqual(['linksTo']);
  });

  it('a property from another namespace keeps its full IRI on both kinds of edge', async () => {
    const ttl = `@prefix : <http://example.org/main#> .
@prefix ext: <http://example.org/ext#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/main> a owl:Ontology .
:A a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ext:uses ; owl:someValuesFrom :A ] .
:B a owl:Class .
ext:uses a owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :B .`;
    expect(await typesOf(ttl, 'uses')).toEqual(['http://example.org/ext#uses']);
  });
});

