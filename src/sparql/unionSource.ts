/**
 * The stores a query runs over, as one RDF/JS source (#224, #237 review). The engine asks a source for the default graph or for
 * the quads of any graph:
 *
 * - the default graph is the RDF merge of every graph of every store: each triple once, however many graphs or stores state it,
 *   so data in named graphs (N-Quads, TriG) is seen by a query without GRAPH, and a triple stated twice counts once;
 * - any other graph pattern (GRAPH ?g, GRAPH <g>) gets the quads as they are, and the engine keeps them to the named graphs.
 *
 * The engine's own union option was not used: it counted a triple once per graph stating it, and gave the default graph to
 * GRAPH ?g, against the spec.
 */
import { Readable } from 'readable-stream';
import type { Store } from 'n3';
import type * as RDF from '@rdfjs/types';

type Pattern = RDF.Term | null | undefined;

/** A variable matches anything, as null does. */
const asPattern = (term: Pattern): RDF.Term | null => (term && term.termType !== 'Variable' ? term : null);

const keyOf = (term: RDF.Term): string =>
  term.termType === 'Literal' ? `L${term.value}@${term.language}^${term.datatype.value}` : `${term.termType[0]}${term.value}`;

function* allQuads(stores: Store[], s: RDF.Term | null, p: RDF.Term | null, o: RDF.Term | null, g: RDF.Term | null): Generator<RDF.Quad> {
  for (const store of stores) yield* store.readQuads(s as never, p as never, o as never, g as never) as Iterable<RDF.Quad>;
}

function* mergedTriples(stores: Store[], s: RDF.Term | null, p: RDF.Term | null, o: RDF.Term | null, factory: RDF.DataFactory): Generator<RDF.Quad> {
  const seen = new Set<string>();
  for (const quad of allQuads(stores, s, p, o, null)) {
    const key = `${keyOf(quad.subject)} ${keyOf(quad.predicate)} ${keyOf(quad.object)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    yield quad.graph.termType === 'DefaultGraph' ? quad : factory.quad(quad.subject, quad.predicate, quad.object, factory.defaultGraph());
  }
}

export function unionSource(stores: Store[], factory: RDF.DataFactory): RDF.Source {
  return {
    match(subject?: Pattern, predicate?: Pattern, object?: Pattern, graph?: Pattern) {
      const [s, p, o, g] = [asPattern(subject), asPattern(predicate), asPattern(object), asPattern(graph)];
      const quads = g?.termType === 'DefaultGraph' ? mergedTriples(stores, s, p, o, factory) : allQuads(stores, s, p, o, g);
      return Readable.from(quads, { objectMode: true }) as unknown as RDF.Stream;
    },
  };
}
