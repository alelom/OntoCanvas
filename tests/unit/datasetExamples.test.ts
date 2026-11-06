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
import { findDataOntologies } from '../../src/abox/dataOntologies';
import { gunzipSync } from 'node:zlib';
import { readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { folderFromHandle, type DirectoryHandleLike } from '../../src/sparql/dataFolder';
import { createDataImages } from '../../src/abox/dataImages';
import { findPartGroups, partsNotice } from '../../src/sparql/numberedParts';

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

describe('adiro-run (#235, #236)', () => {
  const DIR_RUN = join(__dirname, '../../examples/datasets/adiro-run');
  const read = (name: string) => readFileSync(join(DIR_RUN, name));

  it('the compressed part is the plain one, and holds 19 individuals', () => {
    const plain = new Store(new Parser({ format: 'N-Quads' }).parse(read('part-0001.nq').toString('utf8')));
    // Compared as quads: a checkout may turn the plain file's line endings into CRLF.
    const compressed = new Store(new Parser({ format: 'N-Quads' }).parse(gunzipSync(read('part-0001.nq.gz')).toString('utf8')));
    const quads = (s: Store) => s.getQuads(null, null, null, null).map((q) => `${q.subject.value} ${q.predicate.value} ${q.object.value}`).sort();
    expect(quads(compressed)).toEqual(quads(plain));
    expect(individualsOf(plain).size).toBe(19);
  });

  it('names the three ADIRO versions it was made with, which the Individuals tab offers to open', () => {
    const plain = new Store(new Parser({ format: 'N-Quads' }).parse(read('part-0001.nq').toString('utf8')));

    expect(findDataOntologies([plain], [])).toEqual([
      { iri: 'https://w3id.org/adiro/adiro_drawing_metadata/7.0.1', via: 'prov:used' },
      { iri: 'https://w3id.org/adiro/adiro_provenance/2.2.0', via: 'prov:used' },
      { iri: 'https://w3id.org/adiro/adiro_geometry/3.1.0', via: 'prov:used' },
    ]);
  });
});

describe('run-folder (#227, #228)', () => {
  const ROOT_DIR = join(__dirname, '../../examples/datasets/run-folder');
  const NS_RUN = 'http://example.org/examples/run-folder#';
  const DATA_RUN = 'http://example.org/examples/run-folder/run-0001/';

  /** The folder on disk as the folder picker gives it. */
  const handleOf = (dir: string): DirectoryHandleLike => ({
    kind: 'directory',
    name: basename(dir),
    async *values() {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        yield entry.isDirectory()
          ? handleOf(path)
          : { kind: 'file' as const, name: entry.name, getFile: async () => new File([readFileSync(path)], entry.name) };
      }
    },
  });

  async function open(dir: string) {
    const sources = createDataSources();
    const loader = createDataLoader({ sources, getStore: () => new Store(), confirm: async () => true });
    await loader.addFolder((options) => folderFromHandle(handleOf(dir), options));
    let next = 0;
    return { sources, loader, images: createDataImages({ sources, createUrl: () => `blob:${++next}` }) };
  }

  it('runs/run-0001: four data files with the triples the README says, four images, the README skipped, 11 individuals, two graphs', async () => {
    const { sources, loader } = await open(join(ROOT_DIR, 'runs/run-0001'));

    expect(loader.status()).toBe('Added 4 data files from run-0001; 4 images kept for previews; 1 other file skipped.');
    expect(sources.list().map((s) => [s.name, s.triples])).toEqual([['part-0001.nq.gz', 18], ['part-0002.nq.gz', 9], ['part-0003.nq.gz', 18], ['run.ttl', 4]]);
    const stores = sources.stores();
    expect(new Set(stores.flatMap((s) => [...individualsOf(s)])).size).toBe(11);
    expect(sources.graphs().map((g) => [g.iri, g.quads])).toEqual([[`${DATA_RUN}batch/1`, 27], [`${DATA_RUN}batch/2`, 18], [null, 4]]);
    // The folder holds every part: nothing said about missing ones.
    const names = sources.list().map((s) => s.name);
    expect(partsNotice(findPartGroups(names, new Set(names)))).toBeNull();
  });

  it("finds each titleblock's image in the folder, though the data names it from the folder above runs/; sheet 4 has none", async () => {
    const { images } = await open(join(ROOT_DIR, 'runs/run-0001'));
    const path = (n: number) => `runs/run-0001/images/sheet-${n}/titleblock.png`;
    const imageOf = (n: number) => images.find(path(n), `${DATA_RUN}sheet-${n}/titleblock`, `${NS_RUN}imagePath`);

    expect(imageOf(2)).toEqual({ url: expect.stringMatching(/^blob:/) });
    expect(imageOf(4)).toEqual({ hint: expect.stringContaining('No file at this path') });
  });

  it('the folder above, run-folder: the same data, its own README skipped too, the images found from its root', async () => {
    const { sources, loader, images } = await open(ROOT_DIR);

    expect(loader.status()).toBe('Added 4 data files from run-folder; 4 images kept for previews; 2 other files skipped.');
    expect(sources.list().map((s) => s.name)).toEqual(['runs/run-0001/part-0001.nq.gz', 'runs/run-0001/part-0002.nq.gz', 'runs/run-0001/part-0003.nq.gz', 'runs/run-0001/run.ttl']);
    expect(images.find('runs/run-0001/images/sheet-1/titleblock.png')).toEqual({ url: expect.stringMatching(/^blob:/) });
  });
});
