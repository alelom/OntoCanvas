/**
 * Read-only SPARQL over the editor's N3 stores.
 *
 * Comunica is loaded with a dynamic import so it stays out of the entry bundle until the first query.
 * It queries the N3 stores directly as RDF/JS sources: nothing is copied, so results always reflect
 * the current edits. Several stores are queried as one dataset (e.g. a T-Box store and an A-Box store).
 */

import type { Store, Quad } from 'n3';

export type QueryRow = Record<string, string>;

export type QueryResult =
  | { kind: 'bindings'; variables: string[]; rows: QueryRow[] }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'quads'; quads: Quad[] };

type Engine = InstanceType<typeof import('@comunica/query-sparql-rdfjs').QueryEngine>;

let enginePromise: Promise<Engine> | undefined;

function getEngine(): Promise<Engine> {
  enginePromise ??= import('@comunica/query-sparql-rdfjs').then(({ QueryEngine }) => new QueryEngine());
  return enginePromise;
}

export async function runQuery(stores: Store[], query: string): Promise<QueryResult> {
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
          if (term) row[name] = term.value;
        }
        return row;
      });
      return { kind: 'bindings', variables: names, rows };
    }
    case 'boolean':
      return { kind: 'boolean', value: await result.execute() };
    case 'quads':
      return { kind: 'quads', quads: (await (await result.execute()).toArray()) as Quad[] };
    default:
      throw new Error('SPARQL update queries are not supported: queries are read-only.');
  }
}
