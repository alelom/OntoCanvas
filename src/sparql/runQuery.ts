/**
 * Read-only SPARQL over the editor's N3 stores.
 *
 * Comunica is loaded with a dynamic import so it stays out of the entry bundle until the first query.
 * It queries the N3 stores directly as RDF/JS sources: nothing is copied, so results always reflect
 * the current edits. Several stores are queried as one dataset (e.g. a T-Box store and an A-Box store).
 *
 * Results are RDF/JS terms in the stores' own terms: a value keeps its kind (IRI, literal with datatype
 * or language, blank node), and a blank node is the store's blank node, so it can be looked up in the store.
 */

import { DataFactory, type Store, type Quad, type Term } from 'n3';
import type * as RDF from '@rdfjs/types';

/** A term, or a quoted triple (RDF-star). */
export type StoreTerm = Term | Quad;

export type QueryRow = Record<string, StoreTerm>;

export type QueryResult =
  | { kind: 'bindings'; variables: string[]; rows: QueryRow[] }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'quads'; quads: Quad[] };

type Engine = InstanceType<typeof import('@comunica/query-sparql-rdfjs-lite').QueryEngine>;

let enginePromise: Promise<Engine> | undefined;

function getEngine(): Promise<Engine> {
  enginePromise ??= import('@comunica/query-sparql-rdfjs-lite')
    .then(({ QueryEngine }) => new QueryEngine())
    .catch((error) => {
      enginePromise = undefined; // a failed load (network, a replaced chunk) must not poison every later query
      throw error;
    });
  return enginePromise;
}

/** Comunica labels each source's blank nodes `bc_<index of the source>_<label in the source>`. */
const COMUNICA_BLANK_NODE = /^bc_(\d+)_(.*)$/s;

function toStoreTerm(term: RDF.Term, storeCount: number): StoreTerm {
  switch (term.termType) {
    case 'NamedNode':
      return DataFactory.namedNode(term.value);
    case 'BlankNode': {
      const match = COMUNICA_BLANK_NODE.exec(term.value);
      return DataFactory.blankNode(match && Number(match[1]) < storeCount ? match[2] : term.value);
    }
    case 'Literal':
      return DataFactory.literal(term.value, term.language || DataFactory.namedNode(term.datatype.value));
    case 'Variable':
      return DataFactory.variable(term.value);
    case 'DefaultGraph':
      return DataFactory.defaultGraph();
    case 'Quad':
      return toStoreQuad(term, storeCount);
  }
}

function toStoreQuad(quad: RDF.BaseQuad, storeCount: number): Quad {
  return DataFactory.quad(
    toStoreTerm(quad.subject, storeCount) as Quad['subject'],
    toStoreTerm(quad.predicate, storeCount) as Quad['predicate'],
    toStoreTerm(quad.object, storeCount) as Quad['object'],
    toStoreTerm(quad.graph, storeCount) as Quad['graph']
  );
}

/** Reject updates up front, with the parser Comunica itself uses, so no store is ever handed to an update. */
async function assertReadOnly(query: string): Promise<void> {
  const { Parser } = await import('@traqula/parser-sparql-1-2');
  if (new Parser().parse(query).type === 'update') {
    throw new Error('SPARQL update queries are not supported: queries are read-only.');
  }
}

export async function runQuery(stores: Store[], query: string): Promise<QueryResult> {
  await assertReadOnly(query);
  const engine = await getEngine();
  const result = await engine.query(query, { sources: stores as [Store, ...Store[]] });

  switch (result.resultType) {
    case 'bindings': {
      const { variables } = await result.metadata();
      const names = variables.map((v) => v.value);
      const bindings = await (await result.execute()).toArray();
      const rows = bindings.map((binding) => {
        const row: QueryRow = {};
        for (const name of names) {
          const term = binding.get(name);
          if (term) row[name] = toStoreTerm(term, stores.length);
        }
        return row;
      });
      return { kind: 'bindings', variables: names, rows };
    }
    case 'boolean':
      return { kind: 'boolean', value: await result.execute() };
    case 'quads': {
      const quads = await (await result.execute()).toArray();
      return { kind: 'quads', quads: quads.map((quad) => toStoreQuad(quad, stores.length)) };
    }
    default:
      throw new Error(`Unsupported SPARQL result type: ${result.resultType}`);
  }
}
