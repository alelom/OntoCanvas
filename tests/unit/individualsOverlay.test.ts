/**
 * The individuals layer as the canvas gets it (#209): nodes that look unlike classes, around the class they belong to,
 * edges that no edit modal can parse, and nothing at all while the layer is empty.
 */
import { describe, it, expect } from 'vitest';
import { DataSet } from 'vis-data';
import { Parser, Store } from 'n3';
import { createIndividualsLayer, INDIVIDUAL_PREFIX, isIndividualEdgeId } from '../../src/abox/individualsLayer';
import { addIndividualsToNetworkData, classNodesByUri } from '../../src/graph/individualsOverlay';
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
