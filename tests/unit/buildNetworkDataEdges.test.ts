/**
 * The edges buildNetworkData draws, as the app hands them over: nodes whose ids are full IRIs (external classes drawn under
 * their IRI, #164) and a relationship that is known by its name and by its IRI (#200).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { buildNetworkData } from '../../src/graph/buildNetworkData';
import { session, canvasState } from '../../src/state/appState';
import type { GraphData, ObjectPropertyInfo } from '../../src/types';

const PROPERTY_IRI = 'http://x.org/o#hasPart';
const filter = {
  wrapChars: 12,
  minFontSize: 20,
  maxFontSize: 70,
  relationshipFontSize: 18,
  searchQuery: '',
  searchScope: 'matches' as never,
  exactMatch: true,
  edgeStyleConfig: {},
  annotationStyleConfig: {} as never,
  layoutMode: 'hierarchical',
};

const graph = (ids: [string, string], types: string[]): GraphData => ({
  nodes: ids.map((id) => ({ id, label: id, x: 0, y: 0 })) as never,
  edges: types.map((type) => ({ from: ids[0], to: ids[1], type })) as never,
});

function drawnEdges(data: GraphData): string[] {
  session.rawData = data;
  const { edges } = buildNetworkData(filter, data);
  return edges.getIds().map(String);
}

describe('buildNetworkData: the same relationship under two spellings is drawn once (#200)', () => {
  beforeEach(() => {
    session.objectProperties = [{ name: 'hasPart', uri: PROPERTY_IRI }] as ObjectPropertyInfo[];
    session.dataProperties = [];
    session.ttlStore = null as never;
    canvasState.hierarchyTypes = new Set(['subClassOf']);
  });

  it('with local-name nodes', () => {
    expect(drawnEdges(graph(['A', 'B'], ['hasPart', PROPERTY_IRI]))).toHaveLength(1);
  });

  it('with nodes whose ids are IRIs, which have colons of their own', () => {
    expect(drawnEdges(graph(['http://x.org/o#A', 'http://x.org/o#B'], ['hasPart', PROPERTY_IRI]))).toHaveLength(1);
  });

  it('still draws two different relationships between the same nodes', () => {
    session.objectProperties = [{ name: 'hasPart', uri: PROPERTY_IRI }, { name: 'owns', uri: 'http://x.org/o#owns' }] as ObjectPropertyInfo[];

    expect(drawnEdges(graph(['http://x.org/o#A', 'http://x.org/o#B'], ['hasPart', 'owns']))).toHaveLength(2);
  });
});
