/**
 * A CONSTRUCT or DESCRIBE result in the graph (#207): each triple is the drawn edge it stands for and its two ends, with the
 * triples the canvas draws differently (domain, range: one edge for the property) translated, and those with nothing drawn
 * counted. Pure.
 */
import { describe, it, expect } from 'vitest';
import { DataFactory } from 'n3';
import { matchQuadsToGraph, type GraphIndex } from '../../src/sparql/graphMatches';

const NS = 'http://example.org/r#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const { quad, namedNode, literal } = DataFactory;
const t = (s: string, p: string, o: string) => quad(namedNode(s), namedNode(p), namedNode(o));
const I = (name: string) => `__individual__${NS}${name}`;

const graph: GraphIndex = {
  nodes: [
    { id: 'TextReading', uri: NS + 'TextReading' },
    { id: 'Region', uri: NS + 'Region' },
    { id: 'Thing', uri: NS + 'Thing' },
    { id: I('reading2'), uri: NS + 'reading2', kind: 'individual' },
    { id: I('region1'), uri: NS + 'region1', kind: 'individual' },
  ],
  edges: [
    { from: 'TextReading', to: 'Region', type: 'isReadingOf' },
    { from: 'TextReading', to: 'Thing', type: 'subClassOf' },
    { id: '__individual_edge__0', from: I('reading2'), to: I('region1'), type: NS + 'isReadingOf', property: NS + 'isReadingOf' },
    { id: '__individual_edge__1', from: I('reading2'), to: 'TextReading', type: 'rdf:type', property: RDF_TYPE },
  ],
  objectProperties: [{ name: 'isReadingOf', uri: NS + 'isReadingOf' }],
};

describe('matchQuadsToGraph', () => {
  it('matches a triple between individuals to their link and its two ends', () => {
    const match = matchQuadsToGraph([t(NS + 'reading2', NS + 'isReadingOf', NS + 'region1')], graph);

    expect(match.edgeIds).toEqual(['__individual_edge__0']);
    expect(match.nodeIds.sort()).toEqual([I('reading2'), I('region1')]);
    expect(match.triples).toEqual({ total: 1, inGraph: 1 });
  });

  it('matches rdfs:subClassOf and rdf:type triples to their edges', () => {
    const match = matchQuadsToGraph([t(NS + 'TextReading', RDFS + 'subClassOf', NS + 'Thing'), t(NS + 'reading2', RDF_TYPE, NS + 'TextReading')], graph);

    expect(match.edgeIds.sort()).toEqual(['TextReading->Thing:subClassOf', '__individual_edge__1']);
  });

  it('translates rdfs:domain and rdfs:range to the one edge the property is drawn as', () => {
    const match = matchQuadsToGraph([t(NS + 'isReadingOf', RDFS + 'domain', NS + 'TextReading'), t(NS + 'isReadingOf', RDFS + 'range', NS + 'Region')], graph);

    expect(match.edgeIds).toEqual(['TextReading->Region:isReadingOf']);
    expect(match.triples).toEqual({ total: 2, inGraph: 2 });
  });

  it('counts the triples with nothing drawn for them, and matches a lone drawn end as a node', () => {
    const match = matchQuadsToGraph(
      [quad(namedNode(NS + 'reading2'), namedNode(NS + 'readText'), literal('x')), t(NS + 'other', NS + 'p', NS + 'more'), t(NS + 'reading2', NS + 'seeAlso', NS + 'elsewhere')],
      graph
    );

    expect(match.nodeIds).toEqual([I('reading2')]);
    expect(match.edgeIds).toEqual([]);
    expect(match.triples).toEqual({ total: 3, inGraph: 2 });
  });
});
