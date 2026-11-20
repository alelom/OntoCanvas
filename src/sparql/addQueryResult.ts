/**
 * A CONSTRUCT or DESCRIBE result kept as data (#253): the query runs again over the same stores, without the display limit,
 * and its triples are added as a source of their own, in a named graph of their own, so they are listed, hidden, queried and
 * drawn like any other data, and removed in one click. Nothing is saved. Pure but for the sources it adds to.
 *
 * A result replaces the one added before it: running a rule again after the data changed gives the new result, not a second copy.
 */
import type { Store } from 'n3';
import type { DataSource, DataSources } from './dataSources';
import type { QueryResult, RunOptions } from './runQuery';

/** The graph the triples of a result are put in. */
export const RESULT_GRAPH = 'urn:ontocanvas:result';

/** What the source of a result is listed as. */
export const RESULT_SOURCE_NAME = 'Query result';

/** A result of more triples than this is not added: memory follows the triples (about 1.2 KB each), and a part of a result would mislead. */
export const MAX_RESULT_TRIPLES = 200_000;

export interface AddQueryResultDeps {
  run: (stores: Store[], query: string, options?: RunOptions) => Promise<QueryResult>;
  sources: DataSources;
  /** The stores the query ran over: the same again. */
  stores: Store[];
  query: string;
  signal?: AbortSignal;
}

export async function addQueryResult({ run, sources, stores, query, signal }: AddQueryResultDeps): Promise<DataSource> {
  // The earlier result is not an input of the new one: the query reads the data without it.
  const earlier = sources.list().filter((s) => s.name === RESULT_SOURCE_NAME);
  const earlierStores = new Set(earlier.map((s) => s.store));
  const result = await run(stores.filter((s) => !earlierStores.has(s)), query, { limit: MAX_RESULT_TRIPLES, signal });
  if (result.kind !== 'quads') throw new Error('Only a CONSTRUCT or DESCRIBE result can be added to the data.');
  if (result.truncated) {
    throw new Error(`The result has more than ${MAX_RESULT_TRIPLES.toLocaleString('en')} triples: not added. Make the query more selective.`);
  }
  if (!result.quads.length) throw new Error('The result has no triples: nothing to add.');
  // The swap is one change to the listeners, and the earlier result stays until the new one is in.
  return sources.batch(async () => {
    const added = sources.addQuads(RESULT_SOURCE_NAME, result.quads, { graph: RESULT_GRAPH });
    for (const s of earlier) sources.remove(s.id);
    return added;
  });
}
