/**
 * The result of a query, as the panel shows it (#171): a table (capped), a true/false, or Turtle text.
 */
import { describe, it, expect } from 'vitest';
import { DataFactory } from 'n3';
import { describeResult, MAX_ROWS_SHOWN } from '../../src/sparql/resultView';

const { namedNode, literal, quad } = DataFactory;
const prefixes = { '': 'http://example.org/o#' };
const iri = (s: string) => namedNode(`http://example.org/o#${s}`);

describe('describeResult', () => {
  it('turns bindings into a table: columns, then one formatted cell per variable, empty for an unbound one', async () => {
    const view = await describeResult(
      { kind: 'bindings', variables: ['c', 'l'], rows: [{ c: iri('A'), l: literal('Alpha', 'en') }, { c: iri('B') }] },
      prefixes
    );

    expect(view).toMatchObject({ kind: 'table', columns: ['c', 'l'], total: 2, truncated: false });
    if (view.kind !== 'table') return;
    expect(view.rows[0].map((cell) => cell?.text)).toEqual([':A', '"Alpha"@en']);
    expect(view.rows[1].map((cell) => cell?.text)).toEqual([':B', undefined]);
  });

  it('shows only the first rows of a big result, and says how many there are', async () => {
    const rows = Array.from({ length: MAX_ROWS_SHOWN + 25 }, (_, i) => ({ c: iri(`C${i}`) }));
    const view = await describeResult({ kind: 'bindings', variables: ['c'], rows }, prefixes);

    expect(view).toMatchObject({ kind: 'table', total: MAX_ROWS_SHOWN + 25, truncated: true });
    if (view.kind !== 'table') return;
    expect(view.rows).toHaveLength(MAX_ROWS_SHOWN);
    expect(view.rows[MAX_ROWS_SHOWN - 1][0]?.text).toBe(`:C${MAX_ROWS_SHOWN - 1}`);
  });

  it('keeps a result of exactly the limit whole', async () => {
    const rows = Array.from({ length: MAX_ROWS_SHOWN }, (_, i) => ({ c: iri(`C${i}`) }));
    const view = await describeResult({ kind: 'bindings', variables: ['c'], rows }, prefixes);
    expect(view).toMatchObject({ kind: 'table', total: MAX_ROWS_SHOWN, truncated: false });
  });

  it('passes a boolean through', async () => {
    expect(await describeResult({ kind: 'boolean', value: true }, prefixes)).toEqual({ kind: 'boolean', value: true });
  });

  it('writes CONSTRUCT quads as Turtle with the file\'s prefixes, and counts them', async () => {
    const view = await describeResult(
      { kind: 'quads', quads: [quad(iri('A'), namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), iri('B'))] },
      { ...prefixes, rdfs: 'http://www.w3.org/2000/01/rdf-schema#' }
    );

    expect(view).toMatchObject({ kind: 'turtle', count: 1 });
    if (view.kind !== 'turtle') return;
    expect(view.text).toContain('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>');
    expect(view.text).toContain(':A rdfs:subClassOf :B');
  });

  it('writes an empty CONSTRUCT as an empty text', async () => {
    expect(await describeResult({ kind: 'quads', quads: [] }, prefixes)).toEqual({ kind: 'turtle', text: '', count: 0 });
  });
});
