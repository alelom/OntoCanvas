/**
 * The SPARQL panel example (#171) must keep giving what its header comment promises.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Store, Term } from 'n3';
import { parseRdfToGraph } from '../../src/parser';
import { runQuery } from '../../src/sparql/runQuery';
import { declaredPrefixes } from '../../src/sparql/declaredPrefixes';
import { prefixHeader, withStandardPrefixes } from '../../src/sparql/prefixHeader';
import { describeResult } from '../../src/sparql/resultView';

const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '../../examples/sparql/query-panel.ttl');
const text = readFileSync(EXAMPLE, 'utf-8');
const HEADER = prefixHeader(declaredPrefixes(text));

let store: Store;
const select = async (query: string) => {
  const result = await runQuery([store], `${HEADER}\n${query}`);
  if (result.kind !== 'bindings') throw new Error(`expected bindings, got ${result.kind}`);
  return result;
};
const shown = async (query: string) => {
  const view = await describeResult(await runQuery([store], `${HEADER}\n${query}`), withStandardPrefixes(declaredPrefixes(text)));
  if (view.kind !== 'table') throw new Error(`expected a table, got ${view.kind}`);
  return view.rows.map((row) => row.map((cell) => cell?.text));
};

describe('examples/sparql/query-panel.ttl', () => {
  // Loads the engine and the parser once, so the first test is not charged for it.
  beforeAll(async () => {
    store = (await parseRdfToGraph(text, { path: EXAMPLE })).store;
    await runQuery([store], 'ASK { ?s ?p ?o }');
  });

  it('declares the default prefix, so the panel\'s starting query can use it', () => {
    expect(HEADER).toContain('PREFIX : <http://example.org/examples/sparql-queries#>');
  });

  it('a property path finds the subclasses at any depth', async () => {
    expect(await shown('SELECT ?c WHERE { ?c rdfs:subClassOf+ :Space } ORDER BY ?c')).toEqual([[':Bedroom'], [':Room']]);
  });

  it('keeps the language tag of each label', async () => {
    expect(await shown('SELECT ?l WHERE { :Room rdfs:label ?l } ORDER BY ?l')).toEqual([['"Raum"@de'], ['"Room"@en']]);
  });

  it('returns the restriction as a blank node that is in the store', async () => {
    const result = await select('SELECT ?r WHERE { :Room rdfs:subClassOf ?r FILTER(isBlank(?r)) }');
    expect(result.rows).toHaveLength(1);
    const r = result.rows[0].r;
    expect(r.termType).toBe('BlankNode');
    expect(store.getQuads(r as Term, null, null, null).length).toBeGreaterThan(0);
  });

  it('counts five classes', async () => {
    expect(await shown('SELECT (COUNT(?c) AS ?n) WHERE { ?c a owl:Class }')).toEqual([['"5"^^xsd:integer']]);
  });

  it('answers an ASK query', async () => {
    expect(await runQuery([store], `${HEADER}\nASK { :Door a owl:Class }`)).toEqual({ kind: 'boolean', value: true });
  });

  it('CONSTRUCT gives the two subclass triples between classes', async () => {
    const result = await runQuery([store], `${HEADER}\nCONSTRUCT { ?c rdfs:subClassOf ?p } WHERE { ?c rdfs:subClassOf ?p . ?p a owl:Class }`);
    expect(result.kind).toBe('quads');
    if (result.kind !== 'quads') return;
    expect(result.quads.map((q) => `${q.subject.value.split('#')[1]} -> ${q.object.value.split('#')[1]}`).sort()).toEqual([
      'Bedroom -> Room',
      'Room -> Space',
    ]);
  });

  it('refuses the update the header ends with', async () => {
    await expect(runQuery([store], 'DELETE WHERE { ?s ?p ?o }')).rejects.toThrow(/read-only/i);
  });
});
