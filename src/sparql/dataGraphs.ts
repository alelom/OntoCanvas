/**
 * The named graphs of the data added to an ontology (#224). N-Quads and TriG keep each quad's graph: a dataset may use one
 * graph per batch, or one for a whole run spread over several files. The graphs are listed across the sources, one row per
 * graph IRI, and a hidden graph's quads are left out of what the Individuals tab and the graph show. Queries keep every graph.
 *
 * Pure: no DOM.
 */
import { Store, type Quad } from 'n3';

/** The key of the default graph (quads in no named graph), listed only beside named graphs. */
export const DEFAULT_GRAPH_KEY = '';

const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

export interface DataGraph {
  /** The graph's IRI, or DEFAULT_GRAPH_KEY for the default graph. */
  key: string;
  iri: string | null;
  /** Its rdfs:label, from the data or the ontology. */
  label: string | null;
  /** Its quads, in all the sources. */
  quads: number;
}

const keyOf = (quad: Quad): string => (quad.graph.termType === 'DefaultGraph' ? DEFAULT_GRAPH_KEY : quad.graph.value);

/** Counts each store's quads by graph once, as stores do not change after they are read. */
const countsCache = new WeakMap<Store, Map<string, number>>();
function countsOf(store: Store): Map<string, number> {
  let counts = countsCache.get(store);
  if (!counts) {
    counts = new Map();
    for (const quad of store.getQuads(null, null, null, null)) {
      const key = keyOf(quad);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    countsCache.set(store, counts);
  }
  return counts;
}

function labelOf(iri: string, stores: Store[]): string | null {
  for (const store of stores) {
    const label = store.getObjects(iri, LABEL, null)[0];
    if (label) return label.value;
  }
  return null;
}

/**
 * The graphs of the data, named ones first in order of appearance, then the default graph if it holds anything. Empty when
 * the data has no named graph: there is nothing to choose from.
 * @param labelStores - Where else a graph's label may be stated (the ontology).
 */
export function listGraphs(stores: Store[], labelStores: Store[] = []): DataGraph[] {
  const totals = new Map<string, number>();
  for (const store of stores) for (const [key, n] of countsOf(store)) totals.set(key, (totals.get(key) ?? 0) + n);
  const named = [...totals.keys()].filter((key) => key !== DEFAULT_GRAPH_KEY);
  if (!named.length) return [];
  const graphs: DataGraph[] = named.map((iri) => ({ key: iri, iri, label: labelOf(iri, [...stores, ...labelStores]), quads: totals.get(iri)! }));
  const inDefault = totals.get(DEFAULT_GRAPH_KEY);
  if (inDefault) graphs.push({ key: DEFAULT_GRAPH_KEY, iri: null, label: null, quads: inDefault });
  return graphs;
}

const filteredCache = new WeakMap<Store, { key: string; store: Store }>();

/** The store without the quads of the hidden graphs: the store itself when it holds none of them, else a copy kept while the hidden graphs stay the same. */
export function filterGraphs(store: Store, hidden: ReadonlySet<string>): Store {
  const counts = countsOf(store);
  const mine = [...hidden].filter((key) => counts.has(key)).sort();
  if (!mine.length) return store;
  const key = mine.join('\n');
  const cached = filteredCache.get(store);
  if (cached?.key === key) return cached.store;
  const filtered = new Store(store.getQuads(null, null, null, null).filter((quad) => !hidden.has(keyOf(quad))));
  filteredCache.set(store, { key, store: filtered });
  return filtered;
}
