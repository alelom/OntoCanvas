/**
 * The query engine loads lazily. If that import fails once (network error, a chunk replaced by a deploy),
 * the next query must try again instead of failing until the page is reloaded (#170 review).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Store } from 'n3';

describe('runQuery engine loading', () => {
  // Warm the real module once, so the retry below measures the retry and not the cold import.
  beforeAll(async () => {
    const { QueryEngine } = await import('@comunica/query-sparql-rdfjs-lite');
    await new QueryEngine().queryBoolean('ASK { ?s ?p ?o }', { sources: [new Store()] });
  });

  it('retries the engine import after it failed once', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock('@comunica/query-sparql-rdfjs-lite', async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('chunk failed to load');
      return vi.importActual<typeof import('@comunica/query-sparql-rdfjs-lite')>('@comunica/query-sparql-rdfjs-lite');
    });
    const { runQuery } = await import('../../src/sparql/runQuery');

    await expect(runQuery([new Store()], 'ASK { ?s ?p ?o }')).rejects.toThrow();
    await expect(runQuery([new Store()], 'ASK { ?s ?p ?o }')).resolves.toEqual({ kind: 'boolean', value: false });
    expect(attempts).toBe(2);
  });
});
