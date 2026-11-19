/**
 * examples/datasets/adiro-promotion (#253): readings of a drawing's fields, each with a confidence, and a CONSTRUCT that derives
 * the accepted value of a field. Through the real engine: the ontology and the data are queried together, the result is added
 * to the data as a graph of its own, and a query for a drawing's field then answers with the accepted value. Made-up data.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Parser, Store } from 'n3';
import { createDataSources } from '../../src/sparql/dataSources';
import { addQueryResult, RESULT_GRAPH } from '../../src/sparql/addQueryResult';
import { runQuery } from '../../src/sparql/runQuery';

const DIR = join(__dirname, '../../examples/datasets/adiro-promotion');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');
const NS = 'http://example.org/promotion#';
const PREFIX = `PREFIX ex: <${NS}>\n`;

async function open() {
  const ontology = new Store(new Parser().parse(read('fields.ttl')));
  const sources = createDataSources();
  await sources.addText('readings.nq', read('readings.nq'), { path: 'readings.nq' });
  return { ontology, sources };
}

const accepted = async (stores: Store[], property: string, drawing: string): Promise<string[]> => {
  const result = await runQuery(stores, `${PREFIX}SELECT ?v WHERE { ex:${drawing} ex:${property} ?v }`);
  if (result.kind !== 'bindings') throw new Error('rows expected');
  return result.rows.map((row) => row.v.value).sort();
};

describe('the promotion example', () => {
  it('has no accepted value before the rule is applied: only the readings', async () => {
    const { ontology, sources } = await open();

    expect(await accepted([ontology, ...sources.stores()], 'drawingNumber', 'd1')).toEqual([]);
  });

  it('derives the reading of the highest confidence for each field, and where it came from', async () => {
    const { ontology, sources } = await open();

    const result = await runQuery([ontology, ...sources.stores()], read('promotion.rq'));

    expect(result.kind).toBe('quads');
    const local = (value: string) => (value.startsWith(NS) ? value.slice(NS.length) : value);
    const lines = result.kind === 'quads' ? result.quads.map((q) => [q.subject, q.predicate, q.object].map((t) => local(t.value)).join(' ')) : [];
    expect(lines.sort()).toEqual(['d1 drawingNumber A-101', 'd1 promotedFrom r2', 'd1 promotedFrom r3', 'd1 revision P02', 'd2 drawingNumber B-7', 'd2 promotedFrom r4']);
  });

  it('adds the derived triples to the data in a graph of their own, and a query for the field then answers with the accepted value', async () => {
    const { ontology, sources } = await open();

    const source = await addQueryResult({ run: runQuery, sources, stores: [ontology, ...sources.stores()], query: read('promotion.rq') });

    expect(source.triples).toBe(6);
    expect(sources.graphs().map((g) => g.iri)).toEqual(['urn:example:promotion:run-1', RESULT_GRAPH]);
    expect(await accepted([ontology, ...sources.stores()], 'drawingNumber', 'd1')).toEqual(['A-101']);
    expect(await accepted([ontology, ...sources.stores()], 'drawingNumber', 'd2')).toEqual(['B-7']);
    expect(await accepted([ontology, ...sources.stores()], 'revision', 'd1')).toEqual(['P02']);
  });

  it('leaves the ontology as it was, and the readings in their own graph', async () => {
    const { ontology, sources } = await open();
    const before = ontology.size;

    await addQueryResult({ run: runQuery, sources, stores: [ontology, ...sources.stores()], query: read('promotion.rq') });

    expect(ontology.size).toBe(before);
    expect(sources.graphs().find((g) => g.iri === 'urn:example:promotion:run-1')?.quads).toBe(22);
  });
});
