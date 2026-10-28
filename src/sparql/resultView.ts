/**
 * A query result as the panel shows it: a table (capped), a true/false, or Turtle text. Pure: no DOM.
 * The cap is applied while the result is read (runQuery's `limit`); the slice here only keeps the table small for a result
 * that was read without one.
 */

import { Writer } from 'n3';
import type { QueryResult } from './runQuery';
import { formatTerm, type FormattedTerm } from './formatTerm';

/** Rows drawn in the table, and how many rows the panel asks the engine for (one more is read, to know there are more). */
export const MAX_ROWS_SHOWN = 500;

export type Cell = FormattedTerm | undefined;

export type ResultView =
  | { kind: 'table'; columns: string[]; rows: Cell[][]; truncated: boolean }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'turtle'; text: string; count: number; truncated: boolean };

function quadsToTurtle(quads: Extract<QueryResult, { kind: 'quads' }>['quads'], prefixes: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ prefixes });
    writer.addQuads(quads);
    writer.end((error, text) => (error ? reject(error) : resolve(text)));
  });
}

export async function describeResult(result: QueryResult, prefixes: Record<string, string>): Promise<ResultView> {
  switch (result.kind) {
    case 'bindings': {
      const shown = result.rows.slice(0, MAX_ROWS_SHOWN);
      return {
        kind: 'table',
        columns: result.variables,
        rows: shown.map((row) => result.variables.map((name) => (row[name] ? formatTerm(row[name], prefixes) : undefined))),
        truncated: result.truncated || result.rows.length > MAX_ROWS_SHOWN,
      };
    }
    case 'boolean':
      return { kind: 'boolean', value: result.value };
    case 'quads':
      // The writer prints the @prefix lines even for no triples; an empty result should be an empty text.
      return {
        kind: 'turtle',
        text: result.quads.length ? await quadsToTurtle(result.quads, prefixes) : '',
        count: result.quads.length,
        truncated: result.truncated,
      };
  }
}
