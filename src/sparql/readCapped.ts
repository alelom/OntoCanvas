/**
 * Reads a result stream only as far as the cap, and can be stopped (#180).
 *
 * A query like `SELECT * { ?a ?b ?c . ?d ?e ?f }` has as many rows as the square of the triples; building them all
 * before keeping the first 500 ran a tab out of memory. The stream is lazy, so asking it for one row more than the
 * cap and destroying it costs only those rows.
 */

/** The part of an `asynciterator` stream this needs. */
export interface CappableStream<T> {
  take(count: number): { toArray(): Promise<T[]> };
  destroy(): void;
}

/** The user stopped the query. */
export class QueryStopped extends Error {
  constructor() {
    super('The query was stopped.');
    this.name = 'QueryStopped';
  }
}

/** Rejects with QueryStopped when `signal` aborts; never settles otherwise. */
export function whenStopped(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) reject(new QueryStopped());
    else signal.addEventListener('abort', () => reject(new QueryStopped()), { once: true });
  });
}

/**
 * The first `limit` items, and whether there were more. Destroys the stream when done or stopped.
 */
export async function readCapped<T>(source: CappableStream<T>, limit: number, signal?: AbortSignal): Promise<{ items: T[]; truncated: boolean }> {
  try {
    const items = await Promise.race([source.take(limit + 1).toArray(), whenStopped(signal)]);
    return { items: items.slice(0, limit), truncated: items.length > limit };
  } finally {
    source.destroy();
  }
}
