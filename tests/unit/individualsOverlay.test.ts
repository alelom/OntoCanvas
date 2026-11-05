/**
 * The individuals layer as the canvas gets it (#209): nodes that look unlike classes, around the class they belong to,
 * edges that no edit modal can parse, and nothing at all while the layer is empty.
 */
import { describe, it, expect } from 'vitest';
import { DataSet } from 'vis-data';
import { Parser, Store } from 'n3';
import { createIndividualsLayer, INDIVIDUAL_PREFIX, INDIVIDUAL_CLASS_PREFIX, isIndividualEdgeId } from '../../src/abox/individualsLayer';
import { addIndividualsToNetworkData, classNodesByUri, focusNodeIds } from '../../src/graph/individualsOverlay';
import { parseEdgeId } from '../../src/utils/edgeId';

const NS = 'http://example.org/d#';
const store = new Store(new Parser().parse(`@prefix : <${NS}> . :a a :Room ; :next :b . :b a :Room .`));
const classNodes = [{ id: 'Room', uri: `${NS}Room` }];

const network = () => ({ nodes: new DataSet<any>([{ id: 'Room', label: 'Room', x: 100, y: 50 }]), edges: new DataSet<any>() });

describe('addIndividualsToNetworkData', () => {
  it('adds nothing while the layer is empty', () => {
    const data = network();
    addIndividualsToNetworkData(data, createIndividualsLayer({ autoMax: 0, getStores: () => [store] }), classNodesByUri(classNodes));
    expect(data.nodes.length).toBe(1);
    expect(data.edges.length).toBe(0);
  });

  it('adds ellipse nodes for the individuals and edges to their class, around the class node', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [store] });
    layer.showNeighbours(`${NS}a`);
    const data = network();

    addIndividualsToNetworkData(data, layer, classNodesByUri(classNodes));

    const a = data.nodes.get(INDIVIDUAL_PREFIX + `${NS}a`) as any;
    expect(a.shape).toBe('ellipse');
    expect(Math.hypot(a.x - 100, a.y - 50)).toBeGreaterThan(100);
    const toClass = data.edges.get().filter((e: any) => e.to === 'Room');
    expect(toClass).toHaveLength(2);
    expect(toClass.every((e: any) => e.dashes === true)).toBe(true);
    expect(data.edges.get().find((e: any) => e.label === 'next')).toBeDefined();
  });

  it('gives edges ids that no edit modal can read as an ontology edge', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [store] });
    layer.show(`${NS}a`);
    const data = network();

    addIndividualsToNetworkData(data, layer, classNodesByUri(classNodes));

    for (const edge of data.edges.get()) {
      expect(isIndividualEdgeId(String(edge.id))).toBe(true);
      expect(parseEdgeId(String(edge.id))).toBeNull();
    }
  });
});

describe('the layout of the individuals', () => {
  const crowded = new Store(new Parser().parse(`@prefix : <${NS}> . ${Array.from({ length: 10 }, (_, i) => `:r${i} a :Room .`).join(' ')}`));
  const place = (relax: boolean) => {
    const layer = createIndividualsLayer({ getStores: () => [crowded] });
    const data = network();
    addIndividualsToNetworkData(data, layer, classNodesByUri(classNodes), { relax });
    return data.nodes.get().filter((n: any) => String(n.id).startsWith(INDIVIDUAL_PREFIX)) as Array<{ x: number; y: number }>;
  };

  it('keeps them off the class nodes and off each other when relaxing, the default', () => {
    const points = place(true);

    expect(points).toHaveLength(10);
    for (const p of points) expect(Math.abs(p.x - 100) < 60 + 45 && Math.abs(p.y - 50) < 25 + 45).toBe(false);
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) expect(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y)).toBeGreaterThan(30);
  });

  it('leaves them on the plain ring around their class when not relaxing', () => {
    for (const p of place(false)) expect(Math.hypot(p.x - 100, p.y - 50)).toBeGreaterThanOrEqual(160 - 1e-6);
  });
});

describe('the stubs of classes that are not on the canvas (#216)', () => {
  const kinds = new Store(new Parser().parse(`@prefix : <${NS}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:a a :Kind , :Room ; rdfs:label "A" . :b a :Kind ; rdfs:label "B" . :Kind rdfs:label "A kind" .`));
  const drawKinds = (positions = true) => {
    const layer = createIndividualsLayer({ autoMax: 100, getStores: () => [kinds] });
    const data = {
      nodes: new DataSet<any>([{ id: 'Room', label: 'Room', ...(positions ? { x: 100, y: 50 } : {}) }, { id: 'Other', label: 'Other', ...(positions ? { x: 400, y: 250 } : {}) }]),
      edges: new DataSet<any>(),
    };
    addIndividualsToNetworkData(data, layer, classNodesByUri(classNodes));
    return data;
  };
  const stubId = INDIVIDUAL_CLASS_PREFIX + `${NS}Kind`;

  it('adds a faded stub for a class with no node, and a dashed edge to it from each individual of it', () => {
    const data = drawKinds();

    const stub = data.nodes.get(stubId) as any;
    expect(stub.label).toBe('A kind');
    expect(stub.title).toContain(`${NS}Kind`);
    expect(stub.shape).toBe('box');
    const toStub = data.edges.get().filter((e: any) => e.to === stubId);
    expect(toStub).toHaveLength(2);
    expect(toStub.every((e: any) => e.dashes === true)).toBe(true);
  });

  it('draws a class an import declares as a labelled node of that ontology, with a solid border, not as an undeclared stub (#235)', () => {
    const layer = createIndividualsLayer({ autoMax: 100, getStores: () => [kinds], classInfo: () => ({ label: 'Kind of thing', definedBy: 'https://example.org/kinds' }) });
    const data = { nodes: new DataSet<any>([{ id: 'Room', label: 'Room', x: 100, y: 50 }]), edges: new DataSet<any>() };

    addIndividualsToNetworkData(data, layer, classNodesByUri(classNodes));

    const node = data.nodes.get(stubId) as any;
    expect(node.label).toBe('(defined by: kinds)\nKind of thing');
    expect(node.title).toContain('Declared in https://example.org/kinds, an ontology loaded as context');
    expect(node.borderDashes).toBe(false);
  });

  it('draws the classes of the data with their counts for the badge before any individual is drawn (#239)', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [kinds] });
    const data = { nodes: new DataSet<any>([{ id: 'Room', label: 'Room', x: 100, y: 50 }]), edges: new DataSet<any>() };

    addIndividualsToNetworkData(data, layer, classNodesByUri(classNodes));

    const node = data.nodes.get(stubId) as any;
    expect(node.individualCount).toBe(2);
    expect(node.x).toBeGreaterThan(100);
    expect(data.nodes.get().filter((n: any) => String(n.id).startsWith(INDIVIDUAL_PREFIX))).toEqual([]);
  });

  it('places many class nodes in columns, each at a place of its own, also when the graph is empty', () => {
    const many = new Store(new Parser().parse(`@prefix : <${NS}> .\n` + Array.from({ length: 25 }, (_, i) => `:i${i} a :C${i} .`).join('\n')));
    const data = { nodes: new DataSet<any>(), edges: new DataSet<any>() };

    addIndividualsToNetworkData(data, createIndividualsLayer({ autoMax: 0, getStores: () => [many] }), new Map());

    const nodes = data.nodes.get() as any[];
    expect(nodes).toHaveLength(25);
    expect(nodes.every((n) => typeof n.x === 'number' && typeof n.y === 'number')).toBe(true);
    expect(new Set(nodes.map((n) => `${n.x},${n.y}`)).size).toBe(25);
    expect(new Set(nodes.map((n) => n.x)).size).toBeGreaterThan(1);
  });

  it('draws at most 50 classes of the data, and says how many more there are, for the note in the bottom bar', () => {
    const many = new Store(new Parser().parse(`@prefix : <${NS}> .\n` + Array.from({ length: 55 }, (_, i) => `:i${i} a :C${i} .`).join('\n')));
    const data = { nodes: new DataSet<any>(), edges: new DataSet<any>() };

    const { moreClasses } = addIndividualsToNetworkData(data, createIndividualsLayer({ autoMax: 0, getStores: () => [many] }), new Map());

    expect(data.nodes.length).toBe(50);
    expect(moreClasses).toBe(5);
  });

  it('cuts the middle out of a long name on the canvas, keeping the whole name in the tooltip (#239)', () => {
    const hash = 'sha256:c5731cb5f896100e95cfdbc34ee13d9783c0c0757d72840b5e3acfc4cabdd10d';
    const config = new Store(new Parser().parse(`<urn:example:configuration:${hash}> a <${NS}Configuration> .`));
    const data = { nodes: new DataSet<any>(), edges: new DataSet<any>() };

    addIndividualsToNetworkData(data, createIndividualsLayer({ autoMax: 100, getStores: () => [config] }), new Map());

    const individual = data.nodes.get(`${INDIVIDUAL_PREFIX}urn:example:configuration:${hash}`) as any;
    expect(individual.label.length).toBeLessThanOrEqual(30);
    // A urn has no / or #: its name drops "urn:<namespace>:", keeping what kind of thing it is and its hash.
    expect(individual.label).toBe("configuration:sha256…4cabdd10d");
    expect(individual.title).toContain(hash);
  });

  it('places the stub clear of the class nodes, beside them, and the individuals of it around it', () => {
    const data = drawKinds();

    const stub = data.nodes.get(stubId) as any;
    expect(stub.x).toBeGreaterThan(400);
    for (const name of ['a', 'b']) {
      const individual = data.nodes.get(INDIVIDUAL_PREFIX + `${NS}${name}`) as any;
      expect(Math.hypot(individual.x - stub.x, individual.y - stub.y)).toBeGreaterThan(60);
    }
  });

  it('leaves a stub to the canvas when the classes are not placed yet, and adds none for a class that is a node', () => {
    const unplaced = drawKinds(false);
    expect((unplaced.nodes.get(stubId) as any).x).toBeUndefined();

    const layer = createIndividualsLayer({ autoMax: 100, getStores: () => [kinds] });
    const data = { nodes: new DataSet<any>([{ id: 'Kind', label: 'Kind', x: 0, y: 0 }]), edges: new DataSet<any>() };
    addIndividualsToNetworkData(data, layer, new Map([[`${NS}Kind`, 'Kind'], [`${NS}Room`, 'Room']]));
    expect(data.nodes.get(stubId)).toBeNull();
  });

  it('puts only the classes of the data in the data while no individual is drawn (#239)', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [kinds] });
    const data = { nodes: new DataSet<any>([{ id: 'Room', label: 'Room', x: 0, y: 0 }]), edges: new DataSet<any>() };
    addIndividualsToNetworkData(data, layer, classNodesByUri(classNodes));
    expect(data.nodes.getIds().sort()).toEqual(['Room', stubId]);
    expect(data.edges.length).toBe(0);
  });

  it('puts nothing in the data when the data has no individual', () => {
    const layer = createIndividualsLayer({ autoMax: 0, getStores: () => [new Store()] });
    const data = { nodes: new DataSet<any>([{ id: 'Room', label: 'Room', x: 0, y: 0 }]), edges: new DataSet<any>() };
    addIndividualsToNetworkData(data, layer, new Map());
    expect(data.nodes.length).toBe(1);
  });
});

describe('focusNodeIds: what the view fits to after a draw (#216)', () => {
  it('is the individuals that were drawn, and the classes and stubs they are joined to; not the ones drawn before', () => {
    const data = {
      nodes: new DataSet<any>([{ id: 'Room', x: 0, y: 0 }, { id: 'Person', x: 0, y: 0 }, { id: INDIVIDUAL_CLASS_PREFIX + 'k' }, { id: INDIVIDUAL_PREFIX + 'a' }, { id: INDIVIDUAL_PREFIX + 'b' }, { id: INDIVIDUAL_PREFIX + 'old' }]),
      edges: new DataSet<any>([
        { id: 'e1', from: INDIVIDUAL_PREFIX + 'a', to: 'Room' },
        { id: 'e2', from: INDIVIDUAL_PREFIX + 'b', to: INDIVIDUAL_CLASS_PREFIX + 'k' },
        { id: 'e3', from: INDIVIDUAL_PREFIX + 'a', to: INDIVIDUAL_PREFIX + 'b' },
        { id: 'e4', from: INDIVIDUAL_PREFIX + 'old', to: 'Person' },
      ]),
    };

    expect(focusNodeIds(data, ['a', 'b']).sort()).toEqual(['Room', INDIVIDUAL_CLASS_PREFIX + 'k', INDIVIDUAL_PREFIX + 'a', INDIVIDUAL_PREFIX + 'b'].sort());
  });

  it('leaves out what is not in the data (a search hid it), and is empty when none is', () => {
    const data = { nodes: new DataSet<any>([{ id: INDIVIDUAL_PREFIX + 'a' }]), edges: new DataSet<any>() };

    expect(focusNodeIds(data, ['a', 'gone'])).toEqual([INDIVIDUAL_PREFIX + 'a']);
    expect(focusNodeIds(data, ['gone'])).toEqual([]);
  });
});
