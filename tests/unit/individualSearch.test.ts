/**
 * Individuals and the search (#209): while a search dims the graph, individuals unrelated to it are hidden. A relationship
 * keeps the individuals that exhibit it; a class (or anything else that highlights classes) keeps its individuals; an
 * individual's own name keeps it. The sets come from the class graph's search, the individuals from the layer.
 */
import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { createIndividualsLayer, INDIVIDUAL_PREFIX } from '../../src/abox/individualsLayer';
import { individualSearchFilter, filterIndividualsBySearch } from '../../src/abox/individualSearch';
import { computeSearchSets } from '../../src/lib/searchHighlight';
import type { GraphEdge, GraphNode } from '../../src/types';

const NS = 'http://example.org/d#';
const store = new Store(
  new Parser().parse(`@prefix : <${NS}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:alice a :Person ; rdfs:label "Alice" ; :memberOf :red ; :likes :bob .
:bob a :Person ; rdfs:label "Bob" ; :memberOf :red .
:carol a :Person ; rdfs:label "Carol" .
:red a :Team ; rdfs:label "Red team" .
:apollo a :Project ; rdfs:label "Apollo" .`)
);
const classNodes = new Map([[`${NS}Person`, 'Person'], [`${NS}Team`, 'Team'], [`${NS}Project`, 'Project']]);
const nodes = ['Person', 'Team', 'Project'].map((id) => ({ id, label: id, labellableRoot: null }) as GraphNode);
const edges: GraphEdge[] = [{ from: 'Person', to: 'Team', type: 'memberOf' }, { from: 'Person', to: 'Person', type: 'likes' }];
const objectProperties = [
  { name: 'memberOf', uri: `${NS}memberOf` },
  { name: 'likes', uri: `${NS}likes` },
] as any;

const iris = (view: { nodes: Array<{ iri: string }> }) => view.nodes.map((n) => n.iri.replace(NS, '')).sort();
function searched(query: string, includeNeighbours = false) {
  const view = createIndividualsLayer({ getStores: () => [store], autoMax: 100 }).build(classNodes);
  const sets = computeSearchSets(nodes, edges, query, includeNeighbours, false);
  return filterIndividualsBySearch(view, individualSearchFilter(sets, edges, objectProperties, { query, exactMatch: false }));
}

describe('individuals while a search is active', () => {
  it('shows every individual when there is no search', () => {
    const view = createIndividualsLayer({ getStores: () => [store], autoMax: 100 }).build(classNodes);
    expect(individualSearchFilter(computeSearchSets(nodes, edges, '', false), edges, objectProperties, { query: '', exactMatch: false })).toBeNull();
    expect(iris(filterIndividualsBySearch(view, null))).toEqual(['alice', 'apollo', 'bob', 'carol', 'red']);
  });

  it('keeps, for a relationship, the individuals that exhibit it, and hides the rest', () => {
    const view = searched('memberOf');

    expect(iris(view)).toEqual(['alice', 'bob', 'red']);
    expect(view.edges.some((e) => e.type === `${NS}memberOf`)).toBe(true);
    expect(view.edges.every((e) => e.from !== `${INDIVIDUAL_PREFIX}${NS}carol`)).toBe(true);
  });

  it('keeps, for a class, the individuals of that class, and hides the unrelated ones', () => {
    expect(iris(searched('Team'))).toEqual(['red']);
    expect(iris(searched('Project'))).toEqual(['apollo']);
  });

  it('keeps the individuals of the neighbours of the class too, when the search includes neighbours', () => {
    expect(iris(searched('Team', true))).toEqual(['alice', 'bob', 'carol', 'red']);
  });

  it('keeps an individual that the search names, though no class or relationship matches', () => {
    expect(iris(searched('Carol'))).toEqual(['carol']);
  });

  it('hides everything when nothing matches, and drops the edges of what is hidden', () => {
    const view = searched('zzz');

    expect(view.nodes).toEqual([]);
    expect(view.edges).toEqual([]);
  });
});

describe('the stubs of classes that are not on the canvas, while a search is active (#216)', () => {
  const withStubs = new Store(
    new Parser().parse(`@prefix : <${NS}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:one a :Concept ; rdfs:label "Client" . :two a :Concept ; rdfs:label "Scale" . :tom a :Person ; rdfs:label "Tom" . :Concept rdfs:label "Field kind" .`)
  );
  const stubView = () => createIndividualsLayer({ getStores: () => [withStubs], autoMax: 100 }).build(classNodes);
  const sets = (query: string) => computeSearchSets(nodes, edges, query, false, false);
  const filtered = (query: string) => filterIndividualsBySearch(stubView(), individualSearchFilter(sets(query), edges, objectProperties, { query, exactMatch: false }));

  it('keeps the stub of a class while an individual that has it is kept, and drops it with the last one', () => {
    expect(filtered('Client').classes.map((c) => c.iri)).toEqual([`${NS}Concept`]);
    expect(iris(filtered('Client'))).toEqual(['one']);
    expect(filtered('Tom').classes).toEqual([]);
  });

  it('keeps the individuals of a class named by its stub, so searching a kind shows its individuals', () => {
    const view = filtered('Field kind');

    expect(iris(view)).toEqual(['one', 'two']);
    expect(view.classes.map((c) => c.iri)).toEqual([`${NS}Concept`]);
  });
});
