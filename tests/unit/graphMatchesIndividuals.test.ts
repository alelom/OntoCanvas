/**
 * A query result that names individuals (#207): the drawn individuals and the links between them are matched as classes and
 * relationships are (#203), and the counts name what they are. Pure.
 */
import { describe, it, expect } from 'vitest';
import { describeMatch, matchIrisToGraph, matchTableToGraph, type GraphIndex } from '../../src/sparql/graphMatches';
import type { ResultView } from '../../src/sparql/resultView';

const NS = 'http://example.org/r#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const I = (name: string) => `__individual__${NS}${name}`;

const graph: GraphIndex = {
  nodes: [
    { id: 'TextReading', uri: NS + 'TextReading' },
    { id: 'Region', uri: NS + 'Region' },
    { id: I('reading2'), uri: NS + 'reading2', kind: 'individual' },
    { id: I('reading4'), uri: NS + 'reading4', kind: 'individual' },
    { id: I('region1'), uri: NS + 'region1', kind: 'individual' },
  ],
  edges: [
    { from: 'TextReading', to: 'Region', type: 'isReadingOf' },
    { id: '__individual_edge__0', from: I('reading2'), to: I('region1'), type: NS + 'isReadingOf', property: NS + 'isReadingOf' },
    { id: '__individual_edge__1', from: I('reading2'), to: 'TextReading', type: 'rdf:type', property: RDF_TYPE },
  ],
  objectProperties: [{ name: 'isReadingOf', uri: NS + 'isReadingOf' }],
};

const table = (rows: string[][]): Extract<ResultView, { kind: 'table' }> => ({
  kind: 'table',
  columns: rows[0].map((_, i) => `c${i}`),
  rows: rows.map((row) => row.map((iri) => ({ kind: 'iri' as const, text: iri, title: iri }))),
  truncated: false,
});

describe('individuals in a result', () => {
  it('are matched by their IRI, as the drawn individuals they are', () => {
    expect(matchIrisToGraph([NS + 'reading2', NS + 'reading4', NS + 'reading6'], graph).nodeIds).toEqual([I('reading2'), I('reading4')]);
  });

  it("match a link between individuals by its two ends and its relationship, under the link's own id", () => {
    const match = matchTableToGraph(table([[NS + 'reading2', NS + 'isReadingOf', NS + 'region1']]), graph);

    expect(match.edgeIds).toEqual(['__individual_edge__0']);
    expect(match.allEdgesOfAProperty).toBe(false);
  });

  it('match the link to its class by rdf:type', () => {
    expect(matchTableToGraph(table([[NS + 'reading2', RDF_TYPE, NS + 'TextReading']]), graph).edgeIds).toEqual(['__individual_edge__1']);
  });

  it('name a relationship alone: every edge of it, between classes and between individuals', () => {
    const match = matchTableToGraph(table([[NS + 'isReadingOf']]), graph);

    expect(match.edgeIds).toEqual(['TextReading->Region:isReadingOf', '__individual_edge__0']);
    expect(match.allEdgesOfAProperty).toBe(true);
  });
});

describe('describeMatch with individuals', () => {
  it('counts the individuals apart from the classes', () => {
    expect(describeMatch(matchIrisToGraph([NS + 'reading2', NS + 'reading4', NS + 'TextReading'], graph), graph)).toBe('2 individuals, 1 class');
  });

  it('counts the classes alone as before, with no graph given', () => {
    expect(describeMatch({ nodeIds: ['a'], edgeIds: ['x'] })).toBe('1 class, 1 relationship');
  });
});
