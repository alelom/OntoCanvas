/**
 * The example datasets (#221): a run in numbered parts of compressed N-Quads (#222, #223). What the header of vocabulary.ttl
 * promises is what adding the parts gives.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Parser, Store } from 'n3';
import { createDataSources } from '../../src/sparql/dataSources';
import { createDataLoader } from '../../src/sparql/dataLoader';
import { individualsOf } from '../../src/lib/instanceData';

const DIR = join(__dirname, '../../examples/datasets/run-parts');
const NS = 'http://example.org/examples/run-parts#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

/** A file of the folder as the browser gives it. */
const fileOf = (name: string) => {
  const bytes = readFileSync(join(DIR, name));
  return { name, size: bytes.length, text: async () => bytes.toString('utf8'), stream: () => new Blob([bytes]).stream() };
};
const vocabulary = new Store(new Parser().parse(readFileSync(join(DIR, 'vocabulary.ttl'), 'utf8')));

async function add(...names: string[]) {
  const sources = createDataSources();
  const loader = createDataLoader({ sources, getStore: () => vocabulary, confirm: async () => true });
  await loader.addFiles(names.map(fileOf));
  expect(loader.status()).toBe('');
  return sources;
}
const typed = (stores: Store[], cls: string) => new Set(stores.flatMap((s) => s.getSubjects(RDF_TYPE, `${NS}${cls}`, null).map((t) => t.value))).size;

describe('run-parts', () => {
  it('both parts, picked at once: two sources of 81 and 74 triples, 33 individuals, Sensor (3) and Reading (30)', async () => {
    const sources = await add('part-0001.nq.gz', 'part-0002.nq.gz');

    expect(sources.list().map((s) => [s.name, s.triples])).toEqual([['part-0001.nq.gz', 81], ['part-0002.nq.gz', 74]]);
    const stores = sources.stores();
    expect(new Set(stores.flatMap((s) => [...individualsOf(s)])).size).toBe(33);
    expect([typed(stores, 'Sensor'), typed(stores, 'Reading')]).toEqual([3, 30]);
  });

  it('part-0001.nq is part-0001.nq.gz uncompressed: the same quads', async () => {
    const [compressed] = (await add('part-0001.nq.gz')).stores();
    const [plain] = (await add('part-0001.nq')).stores();

    const quads = (s: Store) => s.getQuads(null, null, null, null).map((q) => `${q.subject.value} ${q.predicate.value} ${q.object.value}`).sort();
    expect(quads(compressed)).toEqual(quads(plain));
  });

  it('Reading 15, the last of part 1, points to Reading 16, which only part 2 describes', async () => {
    const [part1] = (await add('part-0001.nq.gz')).stores();
    const [part2] = (await add('part-0002.nq.gz')).stores();

    expect(part1.getQuads(`${NS}reading15`, `${NS}next`, `${NS}reading16`, null)).toHaveLength(1);
    expect(part1.getQuads(`${NS}reading16`, RDF_TYPE, null, null)).toHaveLength(0);
    expect(part2.getQuads(`${NS}reading16`, RDF_TYPE, null, null)).toHaveLength(1);
    // Part 2 alone: its readings are made by sensors it does not describe.
    expect(part2.getQuads(null, `${NS}madeBy`, `${NS}sensor1`, null).length).toBeGreaterThan(0);
    expect(part2.getQuads(`${NS}sensor1`, null, null, null)).toHaveLength(0);
  });

  it('run.trig: both batches in one file, its graphs listed by label with their quads; hiding Batch 2 leaves 18 individuals (#224)', async () => {
    const sources = await add('run.trig');

    expect(sources.graphs().map((g) => [g.label, g.quads])).toEqual([['Batch 1', 82], ['Batch 2', 75]]);
    sources.setGraphHidden('http://example.org/examples/run-parts/batch/2', true);
    const visible = sources.visibleStores();
    expect(new Set(visible.flatMap((s) => [...individualsOf(s)])).size).toBe(18);
    expect([typed(visible, 'Sensor'), typed(visible, 'Reading')]).toEqual([3, 15]);
  });

  it('the two parts: their graphs listed by IRI, 81 and 74 quads, as they state no label (#224)', async () => {
    const sources = await add('part-0001.nq.gz', 'part-0002.nq.gz');

    expect(sources.graphs().map((g) => [g.iri, g.label, g.quads])).toEqual([
      ['http://example.org/examples/run-parts/batch/1', null, 81],
      ['http://example.org/examples/run-parts/batch/2', null, 74],
    ]);
  });

  it('keeps each part in a named graph of its own, one per batch', async () => {
    const [part1, part2] = (await add('part-0001.nq.gz', 'part-0002.nq.gz')).stores();

    expect(part1.getGraphs(null, null, null).map((g) => g.value)).toEqual(['http://example.org/examples/run-parts/batch/1']);
    expect(part2.getGraphs(null, null, null).map((g) => g.value)).toEqual(['http://example.org/examples/run-parts/batch/2']);
  });
});
