/**
 * The named graphs of the data added to an ontology (#224): listed across the sources, one row per graph, and hidden from what
 * the Individuals tab and the graph show.
 */
import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { DEFAULT_GRAPH_KEY, filterGraphs, listGraphs } from '../../src/sparql/dataGraphs';

const T = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const quad = (s: string, g?: string) => `<http://example.org/${s}> <${T}> <http://example.org/Thing>${g ? ` <http://example.org/${g}>` : ''} .`;
const nquads = (...lines: string[]) => new Store(new Parser({ format: 'N-Quads' }).parse(lines.join('\n') + '\n'));

describe('listGraphs', () => {
  it('lists each named graph once across the sources, with its quads counted in all of them', () => {
    const a = nquads(quad('a', 'g1'), quad('b', 'g1'), quad('c', 'g2'));
    const b = nquads(quad('d', 'g1'));

    expect(listGraphs([a, b])).toEqual([
      { key: 'http://example.org/g1', iri: 'http://example.org/g1', label: null, quads: 3 },
      { key: 'http://example.org/g2', iri: 'http://example.org/g2', label: null, quads: 1 },
    ]);
  });

  it('lists nothing for data in no named graph: there is nothing to choose from', () => {
    expect(listGraphs([nquads(quad('a'), quad('b'))])).toEqual([]);
  });

  it('lists the default graph as a row of its own when some data is in named graphs and some is not', () => {
    const graphs = listGraphs([nquads(quad('a', 'g1'), quad('b'))]);

    expect(graphs.map((g) => [g.key, g.iri, g.quads])).toEqual([
      ['http://example.org/g1', 'http://example.org/g1', 1],
      [DEFAULT_GRAPH_KEY, null, 1],
    ]);
  });

  it('names a graph by its label, wherever it is stated (the data or the ontology)', () => {
    const data = nquads(quad('a', 'g1'), `<http://example.org/g1> <${LABEL}> "Batch 1" <http://example.org/g1> .`);
    const ontology = nquads(`<http://example.org/g2> <${LABEL}> "Batch 2" .`);

    const graphs = listGraphs([data, nquads(quad('b', 'g2'))], [ontology]);

    expect(graphs.map((g) => g.label)).toEqual(['Batch 1', 'Batch 2']);
  });
});

describe('filterGraphs', () => {
  const store = nquads(quad('a', 'g1'), quad('b', 'g2'), quad('c'));

  it('returns the store itself when it holds no hidden graph', () => {
    expect(filterGraphs(store, new Set())).toBe(store);
    expect(filterGraphs(store, new Set(['http://example.org/other']))).toBe(store);
  });

  it('leaves out the quads of the hidden graphs, and of the default graph when that is hidden', () => {
    const subjects = (s: Store) => s.getSubjects(null, null, null).map((t) => t.value).sort();

    expect(subjects(filterGraphs(store, new Set(['http://example.org/g1'])))).toEqual(['http://example.org/b', 'http://example.org/c']);
    expect(subjects(filterGraphs(store, new Set([DEFAULT_GRAPH_KEY])))).toEqual(['http://example.org/a', 'http://example.org/b']);
  });

  it('gives the same filtered store again while the hidden graphs are the same, and a new one when they change', () => {
    const hidden = new Set(['http://example.org/g1']);
    const first = filterGraphs(store, hidden);

    expect(filterGraphs(store, new Set(['http://example.org/g1']))).toBe(first);
    expect(filterGraphs(store, new Set(['http://example.org/g2']))).not.toBe(first);
  });
});
