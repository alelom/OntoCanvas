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
import { readCapped, whenStopped } from './readCapped';

/** A term, or a quoted triple (RDF-star). */
export type StoreTerm = Term | Quad;

export type QueryRow = Record<string, StoreTerm>;

export type QueryResult =
  | { kind: 'bindings'; variables: string[]; rows: QueryRow[]; truncated: boolean }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'quads'; quads: Quad[]; truncated: boolean };

export interface RunOptions {
  /** Read at most this many rows (or triples) of the result; `truncated` says whether there were more. Without it, all. */
  limit?: number;
  /** Stops the query: the promise rejects with QueryStopped and the result stream is destroyed. */
  signal?: AbortSignal;
}

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

type Operation = ReturnType<typeof import('@traqula/algebra-sparql-1-2').toAlgebra>;

/**
 * Give the engine a result of at most `rows` solutions: an ORDER BY has to see every row before it can give the first,
 * so reading only the first rows of its stream still builds (and sorts) the whole result in memory. A slice over the
 * sort lets the engine keep just the best `rows` (the same as a LIMIT written in the query, which the query's own
 * LIMIT and OFFSET stay in charge of when they are smaller). ASK, CONSTRUCT and DESCRIBE are left as they are.
 */
function capSolutions(operation: Operation, rows: number): Operation {
  if (operation.type === 'ask' || operation.type === 'construct' || operation.type === 'describe') return operation;
  if (operation.type === 'slice') return { ...operation, length: Math.min(operation.length ?? rows, rows) };
  return { type: 'slice', input: operation, start: 0, length: rows } as Operation;
}

/**
 * Parse with the parser Comunica itself uses, so a query that is not read-only is rejected before any store is handed
 * to the engine. Returns what to give the engine: the query itself, or its algebra with the result capped.
 */
async function prepare(query: string, limit: number): Promise<string | Operation> {
  const [{ Parser }, { toAlgebra }, { AstFactory }, { DataFactory: RdfDataFactory }] = await Promise.all([
    import('@traqula/parser-sparql-1-2'),
    import('@traqula/algebra-sparql-1-2'),
    import('@traqula/rules-sparql-1-2'),
    import('rdf-data-factory'),
  ]);
  const parsed = new Parser().parse(query, { astFactory: new AstFactory() });
  if (parsed.type === 'update') {
    throw new Error('SPARQL update queries are not supported: queries are read-only.');
  }
  if (!Number.isFinite(limit)) return query;
  const operation = toAlgebra(parsed, { quads: true, blankToVariable: true, dataFactory: new RdfDataFactory() });
  return capSolutions(operation, limit + 1);
}

export async function runQuery(stores: Store[], query: string, options: RunOptions = {}): Promise<QueryResult> {
  const { limit = Infinity, signal } = options;
  return Promise.race([execute(stores, query, limit, signal), whenStopped(signal)]);
}

async function execute(stores: Store[], query: string, limit: number, signal: AbortSignal | undefined): Promise<QueryResult> {
  const prepared = await prepare(query, limit);
  const engine = await getEngine();
  const result = await engine.query(prepared, { sources: stores as [Store, ...Store[]] });

  switch (result.resultType) {
    case 'bindings': {
      const { variables } = await result.metadata();
      const names = variables.map((v) => v.value);
      const { items, truncated } = await readCapped(await result.execute(), limit, signal);
      const rows = items.map((binding) => {
        const row: QueryRow = {};
        for (const name of names) {
          const term = binding.get(name);
          if (term) row[name] = toStoreTerm(term, stores.length);
        }
        return row;
      });
      return { kind: 'bindings', variables: names, rows, truncated };
    }
    case 'boolean':
      return { kind: 'boolean', value: await result.execute() };
    case 'quads': {
      const { items, truncated } = await readCapped(await result.execute(), limit, signal);
      return { kind: 'quads', quads: items.map((quad) => toStoreQuad(quad, stores.length)), truncated };
    }
    default:
      throw new Error(`Unsupported SPARQL result type: ${result.resultType}`);
  }
}
