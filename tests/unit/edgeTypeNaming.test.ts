import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph, removeObjectPropertyFromStore } from '../../src/parser';

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

describe('deleting a property by its local name outside the default namespace (#87)', () => {
  it('removes the declaration and its domain/range, not a non-existent default-base IRI', async () => {
    const ttl = `@prefix : <http://example.org/other#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/other> a owl:Ontology .
:A a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :linksTo ; owl:someValuesFrom :B ] .
:B a owl:Class .
:linksTo a owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :B .`;
    const { store } = await parseRdfToGraph(ttl, { path: 'x.ttl' });
    expect(removeObjectPropertyFromStore(store, 'linksTo')).toBeGreaterThanOrEqual(0);
    expect(store.getQuads('http://example.org/other#linksTo', null, null, null)).toHaveLength(0);
    expect(store.getQuads(null, 'http://www.w3.org/2002/07/owl#onProperty', 'http://example.org/other#linksTo', null)).toHaveLength(0);
  });
});

/** The property list and the edges must key a property the same way, at parse time, so the Object
 * Properties menu, edge styles and deletion agree without any later re-keying (#87 review). */
describe('one key per property: property list and edges agree', () => {
  const cases: Array<[string, string]> = [
    ['ontology IRI differs from the term namespace', `@prefix : <http://example.org/vocab#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/onto> a owl:Ontology .
:A a owl:Class . :B a owl:Class .
:linksTo a owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :B .
:unused a owl:ObjectProperty .`],
    ['term namespace equals the ontology', `@prefix : <http://example.org/other#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/other> a owl:Ontology .
:A a owl:Class . :B a owl:Class .
:linksTo a owl:ObjectProperty ; rdfs:domain :A ; rdfs:range :B .
:A rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :linksTo ; owl:someValuesFrom :A ] .`],
    ['a slash ontology like FOAF', `@prefix f: <http://xmlns.example/v/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://xmlns.example/v/> a owl:Ontology .
f:Group a owl:Class . f:Agent a owl:Class .
f:member a owl:ObjectProperty ; rdfs:domain f:Group ; rdfs:range f:Agent .`],
  ];
  for (const [name, ttl] of cases) {
    it(name, async () => {
      const r = await parseRdfToGraph(ttl, { path: 'x.ttl' });
      const names = new Set(r.objectProperties.map((op) => op.name));
      const types = [...new Set(r.graphData.edges.map((e) => e.type).filter((t) => t !== 'subClassOf'))];
      expect(types.length).toBeGreaterThan(0);
      for (const t of types) expect(names).toContain(t);
    });
  }
});
