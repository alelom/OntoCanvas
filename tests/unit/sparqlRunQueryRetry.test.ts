/**
 * The query engine loads lazily. If that import fails once (network error, a chunk replaced by a deploy),
 * the next query must try again instead of failing until the page is reloaded (#170 review).
 *
 * This tests the retry, not the engine, so the engine is a stub: it needs no real Comunica, which takes seconds to build
 * and used to time out this file's hook on a loaded machine (#175).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Store } from 'n3';

describe('runQuery engine loading', () => {
  // runQuery parses the query first, with a real parser, which is imported on first use.
  beforeAll(async () => {
    await import('@traqula/parser-sparql-1-2');
  });

  it('retries the engine import after it failed once', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock('@comunica/query-sparql-rdfjs-lite', () => {
      attempts += 1;
      if (attempts === 1) throw new Error('chunk failed to load');
      return {
        QueryEngine: class {
          query() {
            return Promise.resolve({ resultType: 'boolean', execute: () => Promise.resolve(false) });
          }
        },
      };
    });
    const { runQuery } = await import('../../src/sparql/runQuery');

    await expect(runQuery([new Store()], 'ASK { ?s ?p ?o }')).rejects.toThrow();
    await expect(runQuery([new Store()], 'ASK { ?s ?p ?o }')).resolves.toEqual({ kind: 'boolean', value: false });
    expect(attempts).toBe(2);
  });
});
