/**
 * Individuals drawn in the graph (#209): the chosen individual and the individuals linked to it, one hop in both directions,
 * capped, with an edge to the class node of each when that class is drawn. Pure: stores in, nodes and edges out.
 */
import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { createIndividualsLayer, INDIVIDUAL_PREFIX, isIndividualNodeId } from '../../src/abox/individualsLayer';

const ex = (name: string) => `http://example.org/d#${name}`;
const store = (ttl: string): Store => new Store(new Parser().parse('@prefix : <http://example.org/d#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n' + ttl));

/** Hub :h with `n` outgoing links to :p0…, each a Person; plus :h's own label and a data value. */
const hub = (n: number) =>
  store(
    ':h a :Room ; rdfs:label "Hub" ; :area "12" .\n' +
      Array.from({ length: n }, (_, i) => `:h :contains :p${String(i).padStart(3, '0')} . :p${String(i).padStart(3, '0')} a :Person ; rdfs:label "P${String(i).padStart(3, '0')}" .`).join('\n')
  );

const classNodes = new Map([
  [ex('Room'), 'Room'],
  [ex('Person'), 'Person'],
]);

describe('createIndividualsLayer', () => {
  it('draws nothing until an individual is shown', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [hub(3)] });
    expect(layer.isEmpty()).toBe(true);
    expect(layer.build(classNodes)).toMatchObject({ nodes: [], edges: [], warning: null });
  });

  it('draws the individual, its neighbours in both directions, and the links between them', () => {
    const s = store(':a a :Room ; :next :b . :c :next :a . :b a :Room . :c a :Room . :x a :Room .');
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [s] });

    layer.showNeighbours(ex('a'));
    const view = layer.build(classNodes);

    expect(view.nodes.map((n) => n.iri).sort()).toEqual([ex('a'), ex('b'), ex('c')]);
    const links = view.edges.filter((e) => e.type === ex('next')).map((e) => [e.from, e.to]);
    expect(links).toContainEqual([INDIVIDUAL_PREFIX + ex('a'), INDIVIDUAL_PREFIX + ex('b')]);
    expect(links).toContainEqual([INDIVIDUAL_PREFIX + ex('c'), INDIVIDUAL_PREFIX + ex('a')]);
  });

  it('labels a node with the label, else the local name, and puts its values and class in the tooltip', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [hub(1)] });
    layer.showNeighbours(ex('h'));
    const nodes = layer.build(classNodes).nodes;

    const h = nodes.find((n) => n.iri === ex('h'))!;
    expect(h.label).toBe('Hub');
    expect(h.title).toContain('area');
    expect(h.title).toContain('12');
    expect(nodes.find((n) => n.iri === ex('p000'))!.label).toBe('P000');
  });

  it('joins an individual to the node of each class that is drawn, and to no other', () => {
    const s = store(':a a :Room, :Hidden .');
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [s] });
    layer.showNeighbours(ex('a'));

    const toClasses = layer.build(classNodes).edges.filter((e) => e.type === 'rdf:type');

    expect(toClasses.map((e) => [e.from, e.to])).toEqual([[INDIVIDUAL_PREFIX + ex('a'), 'Room']]);
  });

  it('draws the individual and at most 50 of its neighbours, and says how many are left', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [hub(120)] });
    layer.showNeighbours(ex('h'));

    const view = layer.build(classNodes);

    expect(view.nodes).toHaveLength(51);
    expect(view.nodes.some((n) => n.iri === ex('h'))).toBe(true);
    expect(layer.previewNeighbours(ex('h'))).toEqual({ adds: 50, displayed: 50, total: 120 });
  });

  it('shows 50 more at a time, in a stable order, until none are left', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [hub(120)] });
    layer.showNeighbours(ex('h'));
    const first = new Set(layer.build(classNodes).nodes.map((n) => n.iri));

    layer.showNeighbours(ex('h'));
    const second = layer.build(classNodes);
    expect(second.nodes).toHaveLength(101);
    expect([...first].every((iri) => second.nodes.some((n) => n.iri === iri))).toBe(true);

    layer.showNeighbours(ex('h'));
    const third = layer.build(classNodes);
    expect(third.nodes).toHaveLength(121);
    expect(layer.previewNeighbours(ex('h'))).toEqual({ adds: 0, displayed: 120, total: 120 });
  });

  it('stops at a total, with a warning, however many are expanded', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [hub(120)], maxPerExpansion: 50, maxTotal: 60 });
    layer.showNeighbours(ex('h'));
    layer.showNeighbours(ex('h'));

    const view = layer.build(classNodes);

    expect(view.nodes).toHaveLength(60);
    expect(view.warning).toMatch(/60/);
  });

  it('keeps what was drawn when another individual is shown, and clears all on request', () => {
    const s = store(':a a :Room . :b a :Room .');
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [s] });
    layer.showNeighbours(ex('a'));
    layer.showNeighbours(ex('b'));
    expect(layer.build(classNodes).nodes.map((n) => n.iri).sort()).toEqual([ex('a'), ex('b')]);

    layer.clear();

    expect(layer.isEmpty()).toBe(true);
    expect(layer.build(classNodes).nodes).toEqual([]);
  });

  it('forgets an individual that is no longer in the data, after invalidate()', () => {
    let current = store(':a a :Room .');
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [current] });
    layer.showNeighbours(ex('a'));
    expect(layer.build(classNodes).nodes).toHaveLength(1);

    current = store(':z a :Room .');
    layer.invalidate();

    expect(layer.build(classNodes).nodes).toEqual([]);
  });

  it('tells its listeners when what is drawn changes', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [hub(2)] });
    let calls = 0;
    layer.onChange(() => calls++);

    layer.showNeighbours(ex('h'));
    layer.showNeighbours(ex('h'));
    layer.clear();

    expect(calls).toBe(3);
  });

  it('draws the data of a store that is not the ontology’s', () => {
    const ontology = store(':Room a <http://www.w3.org/2002/07/owl#Class> .');
    const data = store(':a a :Room ; :next :b . :b a :Room .');
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [ontology, data] });
    layer.showNeighbours(ex('a'));

    expect(layer.build(classNodes).nodes).toHaveLength(2);
  });
});

describe('isIndividualNodeId', () => {
  it('tells the nodes of individuals from those of classes', () => {
    expect(isIndividualNodeId(INDIVIDUAL_PREFIX + ex('a'))).toBe(true);
    expect(isIndividualNodeId('Room')).toBe(false);
    expect(isIndividualNodeId(ex('Room'))).toBe(false);
  });
});

describe('few individuals are drawn without being asked', () => {
  const few = () => store(':a a :Room ; :next :b . :b a :Room . :c a :Room .');

  it('draws every individual while there are no more than the limit, with the links between them', () => {
    const layer = createIndividualsLayer({ getStores: () => [few()], autoMax: 3 });

    expect(layer.isEmpty()).toBe(false);
    const view = layer.build(classNodes);
    expect(view.nodes.map((n) => n.iri).sort()).toEqual([ex('a'), ex('b'), ex('c')]);
    expect(view.edges.some((e) => e.type === ex('next'))).toBe(true);
  });

  it('draws nothing by itself above the limit', () => {
    const layer = createIndividualsLayer({ getStores: () => [few()], autoMax: 2 });

    expect(layer.isEmpty()).toBe(true);
    expect(layer.build(classNodes).nodes).toEqual([]);
  });

  it('is hidden by clear(), and comes back when the data changes or reset() says another ontology is open', () => {
    let current = few();
    const layer = createIndividualsLayer({ getStores: () => [current], autoMax: 3 });
    let calls = 0;
    layer.onChange(() => calls++);

    layer.clear();
    expect(layer.isEmpty()).toBe(true);
    expect(calls).toBe(1);

    layer.invalidate();
    expect(layer.isEmpty()).toBe(false);

    layer.clear();
    current = store(':z a :Room .');
    layer.reset();
    expect(layer.isEmpty()).toBe(false);
    expect(layer.build(classNodes).nodes.map((n) => n.iri)).toEqual([ex('z')]);
  });

  it('keeps an individual shown on request when data added takes the total over the limit', () => {
    let current = few();
    const layer = createIndividualsLayer({ getStores: () => [current], autoMax: 3 });
    layer.showNeighbours(ex('a'));
    current = store(':a a :Room ; :next :b . :b a :Room . :c a :Room . :d a :Room .');
    layer.invalidate();

    expect(layer.build(classNodes).nodes.map((n) => n.iri).sort()).toEqual([ex('a'), ex('b')]);
  });
});

describe('preview(): what asking for an individual would draw', () => {
  it('counts the individual alone: one to draw, none displayed until it is drawn', () => {
    const layer = createIndividualsLayer({ getStores: () => [hub(120)], autoMax: 0 });

    expect(layer.preview(ex('h'))).toEqual({ shown: false, adds: 1, displayed: 0, total: 1 });
    expect(layer.preview(ex('p000'))).toEqual({ shown: false, adds: 1, displayed: 0, total: 1 });
  });

  it('draws one individual on its own, however many neighbours it has, and says it is displayed', () => {
    const layer = createIndividualsLayer({ getStores: () => [hub(120)], autoMax: 0 });
    layer.show(ex('h'));

    expect(layer.build(classNodes).nodes.map((n) => n.iri)).toEqual([ex('h')]);
    expect(layer.preview(ex('h'))).toEqual({ shown: true, adds: 0, displayed: 1, total: 1 });
  });

  it('counts the neighbours the next request would add, and what is left', () => {
    const layer = createIndividualsLayer({ getStores: () => [hub(120)], autoMax: 0 });
    expect(layer.previewNeighbours(ex('h'))).toEqual({ adds: 50, displayed: 0, total: 120 });

    layer.showNeighbours(ex('h'));
    expect(layer.previewNeighbours(ex('h'))).toEqual({ adds: 50, displayed: 50, total: 120 });

    layer.showNeighbours(ex('h'));
    expect(layer.previewNeighbours(ex('h'))).toEqual({ adds: 20, displayed: 100, total: 120 });

    layer.showNeighbours(ex('h'));
    expect(layer.previewNeighbours(ex('h'))).toEqual({ adds: 0, displayed: 120, total: 120 });
  });

  it('says there is nothing to add for an individual drawn by itself', () => {
    const layer = createIndividualsLayer({ getStores: () => [hub(3)], autoMax: 30 });

    expect(layer.preview(ex('h'))).toEqual({ shown: true, adds: 0, displayed: 1, total: 1 });
  });
});

describe('the individuals of a class', () => {
  const person = ex('Person');
  const layer = (autoMax = 0) => createIndividualsLayer({ getStores: () => [hub(120)], autoMax });

  it('previews 50 of the 120 before any is drawn', () => {
    expect(layer().previewClass(person)).toEqual({ adds: 50, displayed: 0, total: 120 });
  });

  it('draws the first 50 by label, with no neighbours, and the next 50 and the last 20 on the next requests', () => {
    const l = layer();
    l.showClass(person);

    const first = l.build(classNodes);
    expect(first.nodes).toHaveLength(50);
    expect(first.nodes.map((n) => n.label).sort()[0]).toBe('P000');
    expect(l.previewClass(person)).toEqual({ adds: 50, displayed: 50, total: 120 });

    l.showClass(person);
    l.showClass(person);
    expect(l.build(classNodes).nodes).toHaveLength(120);
    expect(l.previewClass(person)).toEqual({ adds: 0, displayed: 120, total: 120 });
  });

  it('counts the individuals of the class that are drawn some other way, and draws only the ones still missing', () => {
    const l = layer();
    l.showNeighbours(ex('h'));
    // The hub and 50 persons are drawn.
    expect(l.previewClass(person)).toEqual({ adds: 50, displayed: 50, total: 120 });

    l.showClass(person);

    expect(l.previewClass(person)).toEqual({ adds: 20, displayed: 100, total: 120 });
    expect(l.build(classNodes).nodes).toHaveLength(101);
  });

  it('is all displayed when the individuals are drawn by themselves, is cleared by clear() and reset(), and tells the listeners', () => {
    expect(layer(200).previewClass(person)).toEqual({ adds: 0, displayed: 120, total: 120 });

    const l = layer();
    let calls = 0;
    l.onChange(() => calls++);
    l.showClass(person);
    expect(calls).toBe(1);
    expect(l.isEmpty()).toBe(false);

    l.clear();
    expect(l.isEmpty()).toBe(true);
    l.showClass(person);
    l.reset();
    expect(l.isEmpty()).toBe(true);
  });
});

describe('at the total cap', () => {
  const capped = () => createIndividualsLayer({ autoMax: 0, getStores: () => [hub(12)], maxPerExpansion: 4, maxTotal: 6 });

  it('adds only what fits, then offers nothing more and draws nothing more', () => {
    const l = capped();
    l.showNeighbours(ex('h'));
    expect(l.build(classNodes).nodes).toHaveLength(5);
    expect(l.previewNeighbours(ex('h'))).toEqual({ adds: 1, displayed: 4, total: 12 });

    l.showNeighbours(ex('h'));
    expect(l.build(classNodes).nodes).toHaveLength(6);
    expect(l.previewNeighbours(ex('h'))).toEqual({ adds: 0, displayed: 5, total: 12 });

    for (let i = 0; i < 3; i++) l.showNeighbours(ex('h'));
    expect(l.build(classNodes).nodes).toHaveLength(6);
  });

  it('offers nothing for a class or another individual either, and says the limit was reached', () => {
    const l = capped();
    l.showNeighbours(ex('h'));
    l.showNeighbours(ex('h'));

    expect(l.previewClass(ex('Person'))).toMatchObject({ adds: 0 });
    expect(l.preview(ex('p011'))).toMatchObject({ adds: 0, shown: false });
    l.showClass(ex('Person'));
    l.show(ex('p011'));
    expect(l.build(classNodes).nodes).toHaveLength(6);
    expect(l.build(classNodes).warning).toMatch(/first 6 individuals/);
  });

  it('frees room again when everything is cleared', () => {
    const l = capped();
    l.showNeighbours(ex('h'));
    l.showNeighbours(ex('h'));
    l.clear();

    l.showNeighbours(ex('h'));

    expect(l.build(classNodes).nodes).toHaveLength(5);
  });
});
