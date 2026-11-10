/**
 * What the graph draws, for matching query results (#207): the class graph and the individuals drawn over it, each individual by
 * its IRI and each link between them by its relationship.
 */
import { describe, it, expect } from 'vitest';
import { withDrawnIndividuals } from '../../src/graph/drawnGraphIndex';
import { matchIrisToGraph } from '../../src/sparql/graphMatches';

const NS = 'http://example.org/r#';

const base = { nodes: [{ id: 'TextReading', uri: NS + 'TextReading' }], edges: [{ from: 'TextReading', to: 'TextReading', type: 'x' }], objectProperties: [] };
const drawn = {
  nodes: [{ id: 'TextReading' }, { id: `__individual__${NS}reading2` }, { id: `__individual_class__${NS}Imported` }],
  edges: [
    { id: 'TextReading->TextReading:x', from: 'TextReading', to: 'TextReading' },
    { id: '__individual_edge__0', from: `__individual__${NS}reading2`, to: `__individual__${NS}region1`, property: NS + 'isReadingOf' },
    { id: '__individual_edge__1', from: `__individual__${NS}reading2`, to: `__individual_class__${NS}Imported` },
  ],
};

describe('withDrawnIndividuals', () => {
  it('adds each drawn individual by its IRI, and each class drawn for them, to the class graph', () => {
    const index = withDrawnIndividuals(base, drawn);

    expect(index.nodes).toEqual([
      { id: 'TextReading', uri: NS + 'TextReading' },
      { id: `__individual__${NS}reading2`, uri: NS + 'reading2', kind: 'individual' },
      { id: `__individual_class__${NS}Imported`, uri: NS + 'Imported' },
    ]);
  });

  it('adds each link between them, by its relationship; the link to a class by rdf:type', () => {
    const index = withDrawnIndividuals(base, drawn);

    expect(index.edges.slice(1)).toEqual([
      { id: '__individual_edge__0', from: `__individual__${NS}reading2`, to: `__individual__${NS}region1`, type: NS + 'isReadingOf', property: NS + 'isReadingOf' },
      { id: '__individual_edge__1', from: `__individual__${NS}reading2`, to: `__individual_class__${NS}Imported`, type: 'rdf:type', property: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' },
    ]);
  });

  it('is what a result of individuals is matched against', () => {
    expect(matchIrisToGraph([NS + 'reading2'], withDrawnIndividuals(base, drawn)).nodeIds).toEqual([`__individual__${NS}reading2`]);
  });
});
