/**
 * Which drawn nodes and edges a query result names (#203): classes by IRI, relationships by the IRI of their property,
 * and rdfs:subClassOf by its own IRI. Pure.
 */
import { describe, it, expect } from 'vitest';
import { matchIrisToGraph, irisInTable, describeMatch, type GraphIndex } from '../../src/sparql/graphMatches';
import type { ResultView } from '../../src/sparql/resultView';

const NS = 'http://example.org/o#';
const SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

const graph: GraphIndex = {
  nodes: [
    { id: 'Building', uri: NS + 'Building' },
    { id: 'Floor', uri: NS + 'Floor' },
    { id: 'Room' },
    { id: 'http://other.org/x#Agent', uri: 'http://other.org/x#Agent' },
  ],
  edges: [
    { from: 'Floor', to: 'Building', type: 'subClassOf' },
    { from: 'Building', to: 'Floor', type: 'hasFloor' },
    { from: 'Floor', to: 'Room', type: NS + 'hasRoom' },
    { from: 'Room', to: 'Building', type: 'partOf' },
  ],
  objectProperties: [
    { name: 'hasFloor', uri: NS + 'hasFloor' },
    { name: 'hasRoom', uri: NS + 'hasRoom' },
    { name: 'partOf' },
  ],
};

describe('matchIrisToGraph', () => {
  it('finds a class by its IRI', () => {
    expect(matchIrisToGraph([NS + 'Building'], graph)).toEqual({ nodeIds: ['Building'], edgeIds: [] });
  });

  it('finds an expanded external class under its IRI, whose node id is the IRI itself', () => {
    expect(matchIrisToGraph(['http://other.org/x#Agent'], graph).nodeIds).toEqual(['http://other.org/x#Agent']);
  });

  it('finds the edges of an object property by its IRI, whether the edge names it by name or by IRI', () => {
    expect(matchIrisToGraph([NS + 'hasFloor'], graph).edgeIds).toEqual(['Building->Floor:hasFloor']);
    expect(matchIrisToGraph([NS + 'hasRoom'], graph).edgeIds).toEqual([`Floor->Room:${NS}hasRoom`]);
  });

  it('finds the subClassOf edges by the IRI of rdfs:subClassOf', () => {
    expect(matchIrisToGraph([SUBCLASS], graph).edgeIds).toEqual(['Floor->Building:subClassOf']);
  });

  it('finds several at once, once each, whatever the order of the IRIs', () => {
    const match = matchIrisToGraph([NS + 'Floor', NS + 'Building', NS + 'Floor', NS + 'hasFloor'], graph);

    expect(match.nodeIds.sort()).toEqual(['Building', 'Floor']);
    expect(match.edgeIds).toEqual(['Building->Floor:hasFloor']);
  });

  it('finds nothing for an IRI the graph does not draw, and for a property that has no IRI to match', () => {
    expect(matchIrisToGraph([NS + 'Unknown', NS + 'partOf', 'http://example.org/o#Room'], graph)).toEqual({ nodeIds: [], edgeIds: [] });
  });
});

describe('irisInTable', () => {
  const cell = (kind: 'iri' | 'literal' | 'blank', title: string) => ({ kind, text: title, title });
  const view: ResultView = {
    kind: 'table',
    columns: ['a', 'b'],
    rows: [
      [cell('iri', NS + 'Building'), cell('literal', '"x"')],
      [cell('iri', NS + 'Building'), undefined],
      [cell('blank', '_:b0'), cell('iri', NS + 'Floor')],
    ],
    truncated: false,
  };

  it('lists the IRIs of the cells once each, not literals or blank nodes', () => {
    expect(irisInTable(view as Extract<ResultView, { kind: 'table' }>).sort()).toEqual([NS + 'Building', NS + 'Floor']);
  });
});

describe('describeMatch', () => {
  it('says what a click will select', () => {
    expect(describeMatch({ nodeIds: ['a', 'b'], edgeIds: ['x'] })).toBe('2 classes, 1 relationship');
    expect(describeMatch({ nodeIds: ['a'], edgeIds: [] })).toBe('1 class');
    expect(describeMatch({ nodeIds: [], edgeIds: ['x', 'y'] })).toBe('2 relationships');
  });
});
