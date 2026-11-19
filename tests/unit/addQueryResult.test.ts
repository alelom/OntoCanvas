/**
 * A CONSTRUCT result added to the data (#253): `dataSources.addQuads` puts quads in a source of their own, in a named graph of
 * their own, and `addQueryResult` runs the query again, without the display limit, and adds what it gives, or says why not.
 */
import { describe, it, expect, vi } from 'vitest';
import { DataFactory, Store } from 'n3';
import { createDataSources } from '../../src/sparql/dataSources';
import { addQueryResult, MAX_RESULT_TRIPLES, RESULT_GRAPH } from '../../src/sparql/addQueryResult';
import type { QueryResult } from '../../src/sparql/runQuery';

const { quad, namedNode, literal, defaultGraph } = DataFactory;
const NS = 'http://example.org/p#';
const triple = (s: string, o: string) => quad(namedNode(NS + s), namedNode(NS + 'accepted'), literal(o), defaultGraph());

describe('addQuads', () => {
  it('adds the quads as a source of its own, in the named graph asked for, and tells the listeners', () => {
    const sources = createDataSources();
    const changed = vi.fn();
    sources.onChange(changed);

    const source = sources.addQuads('Query result', [triple('d1', 'A-102'), triple('d2', 'B-7')], { graph: 'urn:example:promoted' });

    expect(sources.list().map((s) => [s.name, s.triples])).toEqual([['Query result', 2]]);
    expect(source.store.getQuads(null, null, null, null).every((q) => q.graph.value === 'urn:example:promoted')).toBe(true);
    expect(sources.graphs().map((g) => [g.iri, g.quads])).toEqual([['urn:example:promoted', 2]]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('keeps the graph of each quad without one asked for, and the source can be removed and its graph hidden like any', () => {
    const sources = createDataSources();
    const own = quad(namedNode(NS + 's'), namedNode(NS + 'p'), literal('x'), namedNode('urn:example:own'));

    const source = sources.addQuads('Some quads', [own]);
    sources.setGraphHidden('urn:example:own', true);

    expect(source.store.getQuads(null, null, null, namedNode('urn:example:own'))).toHaveLength(1);
    expect(sources.visibleStores()[0].size).toBe(0);
    sources.remove(source.id);
    expect(sources.list()).toEqual([]);
  });
});

describe('addQueryResult', () => {
  const quadsResult = (n: number, truncated = false): QueryResult => ({
    kind: 'quads',
    quads: Array.from({ length: n }, (_, i) => triple(`d${i}`, `v${i}`)),
    truncated,
  });

  it('runs the query again over the same stores with the cap on the result, and adds it in the result graph', async () => {
    const sources = createDataSources();
    const run = vi.fn().mockResolvedValue(quadsResult(3));
    const stores = [new Store(), new Store()];

    const source = await addQueryResult({ run, sources, stores, query: 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }' });

    expect(run).toHaveBeenCalledWith(stores, 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }', { limit: MAX_RESULT_TRIPLES, signal: undefined });
    expect(source.triples).toBe(3);
    expect(sources.graphs().map((g) => g.iri)).toEqual([RESULT_GRAPH]);
  });

  it('adds nothing, and says so, when the result has more triples than the cap', async () => {
    const sources = createDataSources();
    const run = vi.fn().mockResolvedValue(quadsResult(2, true));

    await expect(addQueryResult({ run, sources, stores: [], query: 'q' })).rejects.toThrow(/more than 200,000 triples.*not added/);

    expect(sources.list()).toEqual([]);
  });

  it('says what it cannot add: a result of rows, an empty one', async () => {
    const sources = createDataSources();
    const rows: QueryResult = { kind: 'bindings', variables: [], rows: [], truncated: false };

    await expect(addQueryResult({ run: async () => rows, sources, stores: [], query: 'q' })).rejects.toThrow(/Only a CONSTRUCT or DESCRIBE result/);
    await expect(addQueryResult({ run: async () => quadsResult(0), sources, stores: [], query: 'q' })).rejects.toThrow(/no triples/);
    expect(sources.list()).toEqual([]);
  });
});
