/**
 * examples/datasets/adiro-promotion (#253): ADIRO field assertions in the states that matter to promotion, and the promotion rule of
 * the ADIRO checks (promotion.rq), which gives an accepted assertion's value to the property its field kind maps to. Through the
 * real engine: the field kinds (an excerpt of the ontology) and the data are queried together, the result is added to the data as
 * a graph of its own, and a query for a drawing's field then answers with the accepted value. Made-up data.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Parser, Store } from 'n3';
import { createDataSources } from '../../src/sparql/dataSources';
import { addQueryResult, RESULT_GRAPH } from '../../src/sparql/addQueryResult';
import { runQuery, type QueryResult } from '../../src/sparql/runQuery';

const DIR = join(__dirname, '../../examples/datasets/adiro-promotion');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');
const ADM = 'https://w3id.org/adiro/adiro_drawing_metadata#';
const EX = 'urn:example:promotion/';
const PREFIXES = `PREFIX adm: <${ADM}>\nPREFIX ex: <${EX}>\n`;

async function open() {
  const fields = new Store(new Parser().parse(read('fields.ttl')));
  const sources = createDataSources();
  await sources.addText('assertions.nq', read('assertions.nq'), { path: 'assertions.nq' });
  return { fields, sources };
}

/** The promoted triples as "subject property value", the example's own IRIs short. */
const promoted = (result: QueryResult): string[] => {
  if (result.kind !== 'quads') throw new Error('triples expected');
  const short = (value: string) => value.replace(EX, 'ex:').replace(ADM, 'adm:');
  return result.quads.map((q) => [q.subject, q.predicate, q.object].map((t) => short(t.value)).join(' ')).sort();
};

const valuesOf = async (stores: Store[], property: string, subject: string): Promise<string[]> => {
  const result = await runQuery(stores, `${PREFIXES}SELECT ?v WHERE { ex:${subject} adm:${property} ?v }`);
  if (result.kind !== 'bindings') throw new Error('rows expected');
  return result.rows.map((row) => row.v.value.replace(EX, 'ex:')).sort();
};

describe('the promotion example', () => {
  it('promotes only what is accepted, once, and of a kind that maps to a property', async () => {
    const { fields, sources } = await open();

    const result = await runQuery([fields, ...sources.stores()], read('promotion.rq'));

    // Not promoted: a1 (accepted, but a2 supersedes it), a4 (rejected), a5 (pending), a6 (a kind with no property), a7 (no acceptance recorded).
    expect(promoted(result)).toEqual(['ex:revision1 adm:drawingTitle Ground Floor Plan', 'ex:titleblock1 adm:assertsClient ex:org-acme-limited']);
  });

  it('has no promoted statement before the rule is applied: only the assertions', async () => {
    const { fields, sources } = await open();

    expect(await valuesOf([fields, ...sources.stores()], 'drawingTitle', 'revision1')).toEqual([]);
    expect(await valuesOf([fields, ...sources.stores()], 'assertsClient', 'titleblock1')).toEqual([]);
  });

  it('promotes nothing without the field kinds: the property each maps to is the ontology\'s, not the data\'s', async () => {
    const { sources } = await open();

    const result = await runQuery(sources.stores(), read('promotion.rq'));

    expect(promoted(result)).toEqual([]);
  });

  it('adds the promoted triples to the data in a graph of their own, and a query for the field then answers with the accepted value', async () => {
    const { fields, sources } = await open();

    const source = await addQueryResult({ run: runQuery, sources, stores: [fields, ...sources.stores()], query: read('promotion.rq') });

    expect(source.triples).toBe(2);
    expect(sources.graphs().map((g) => g.iri)).toEqual(['urn:example:promotion:run-1', RESULT_GRAPH]);
    const stores = [fields, ...sources.stores()];
    expect(await valuesOf(stores, 'drawingTitle', 'revision1')).toEqual(['Ground Floor Plan']);
    expect(await valuesOf(stores, 'assertsClient', 'titleblock1')).toEqual(['ex:org-acme-limited']);
    // The pending drawing number is still not a statement of the drawing.
    expect(await valuesOf(stores, 'drawingIdentifier', 'revision1')).toEqual([]);
  });

  it('leaves the field kinds as they were, and the assertions in their own graph', async () => {
    const { fields, sources } = await open();
    const before = fields.size;

    await addQueryResult({ run: runQuery, sources, stores: [fields, ...sources.stores()], query: read('promotion.rq') });

    expect(fields.size).toBe(before);
    expect(sources.graphs().find((g) => g.iri === 'urn:example:promotion:run-1')?.quads).toBe(55);
  });
});

describe('the job example, with the same rule', () => {
  const JOB = join(__dirname, '../../examples/datasets/adiro-job/job');

  it('promotes the accepted project number of each sheet of a run, and not the pending drawing number', async () => {
    const fields = new Store(new Parser().parse(read('fields.ttl')));
    const sources = createDataSources();
    for (const part of ['part-0001', 'part-0002']) {
      const text = gunzipSync(readFileSync(join(JOB, `runs/run-a/${part}.nq.gz`))).toString('utf8');
      await sources.addText(`runs/run-a/${part}.nq`, text, { path: 'part.nq' });
    }

    const result = await runQuery([fields, ...sources.stores()], read('promotion.rq'));

    expect(result.kind === 'quads' ? result.quads.map((q) => `${q.subject.value.replace('urn:example:job:run-a/', '')} ${q.predicate.value.replace(ADM, 'adm:')} ${q.object.value}`).sort() : []).toEqual([
      'titleblock1 adm:projectNumber EX-100',
      'titleblock2 adm:projectNumber EX-100',
    ]);
  });
});
