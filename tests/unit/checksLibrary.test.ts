/**
 * The library of checks (#230, #231): queries and shapes loaded from an address (a manifest or a file), from files, or from a
 * folder, with what could not be read said by file.
 */
import { describe, it, expect, vi } from 'vitest';
import { createChecksLibrary, describeOutcome, type PickedFile } from '../../src/checks/checksLibrary';

const BASE = 'https://example.org/checks/1.0.0/';
const SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix : <http://example.org/d#> .
:Reading a sh:NodeShape ; sh:targetClass :TextReading ; sh:property [ sh:path :isReadingOf ; sh:minCount 1 ] .`;
const Q1 = 'PREFIX : <http://example.org/d#>\n# CQ 1.3: the rooms\nSELECT ?r WHERE { ?r a :Room }';
const Q2 = 'SELECT * WHERE { ?s ?p ?o }';
const MANIFEST = JSON.stringify({ artefact: 'Checks', queries: ['queries/cq-1-3.rq', { path: 'queries/all.rq', title: 'Everything' }], shapes: ['shapes/readings.shacl.ttl'] });

const site: Record<string, string> = {
  [BASE + 'manifest.json']: MANIFEST,
  [BASE + 'queries/cq-1-3.rq']: Q1,
  [BASE + 'queries/all.rq']: Q2,
  [BASE + 'shapes/readings.shacl.ttl']: SHAPES,
};
const fetchText = vi.fn(async (url: string) => {
  if (!(url in site)) throw new Error('the server answered 404');
  return site[url];
});
const picked = (files: Record<string, string>): PickedFile[] => Object.entries(files).map(([path, text]) => ({ path, text: async () => text }));

describe('loading a manifest by its address', () => {
  it('reads the queries, titled by the manifest or by their first comment, and the shapes, in its order', async () => {
    const library = createChecksLibrary({ fetchText });

    const outcome = await library.addUrl(BASE + 'manifest.json');

    expect(outcome).toEqual({ queries: 2, shapes: 1, problems: [] });
    expect(library.queries().map((q) => [q.title, q.group, q.source])).toEqual([
      ['CQ 1.3: the rooms', 'Checks', BASE + 'queries/cq-1-3.rq'],
      ['Everything', 'Checks', BASE + 'queries/all.rq'],
    ]);
    expect(library.shapesFiles().map((s) => [s.name, s.shapeCount])).toEqual([['readings.shacl.ttl', 1]]);
    expect(library.shapes().size).toBeGreaterThan(0);
  });

  it('keeps what it could read, and names what it could not', async () => {
    const library = createChecksLibrary({ fetchText });
    site[BASE + 'broken.json'] = JSON.stringify({ queries: ['queries/all.rq', 'queries/missing.rq'], shapes: ['queries/all.rq'] });

    const outcome = await library.addUrl(BASE + 'broken.json');

    expect(outcome.queries).toBe(1);
    expect(outcome.problems).toEqual(['missing.rq: the server answered 404', 'all.rq: not readable as Turtle (' + outcome.problems[1].split('(')[1]]);
  });

  it('replaces what was read from the same place, rather than listing it twice', async () => {
    const library = createChecksLibrary({ fetchText });

    await library.addUrl(BASE + 'manifest.json');
    await library.addUrl(BASE + 'manifest.json');

    expect(library.queries()).toHaveLength(2);
    expect(library.shapesFiles()).toHaveLength(1);
  });

  it('loads a single query or shapes file by its address', async () => {
    const library = createChecksLibrary({ fetchText });

    await library.addUrl(BASE + 'queries/all.rq');
    await library.addUrl(BASE + 'shapes/readings.shacl.ttl');

    expect(library.queries().map((q) => [q.title, q.group])).toEqual([['all', null]]);
    expect(library.shapesFiles()).toHaveLength(1);
  });

  it('says why an address could not be read', async () => {
    const outcome = await createChecksLibrary({ fetchText }).addUrl('https://example.org/nothing.json');

    expect(outcome.problems).toEqual(['nothing.json: the server answered 404']);
  });

  it('refuses a Turtle file with no shape in it', async () => {
    site['https://example.org/data.ttl'] = '<http://example.org/a> <http://example.org/b> <http://example.org/c> .';

    const outcome = await createChecksLibrary({ fetchText }).addUrl('https://example.org/data.ttl');

    expect(outcome.problems).toEqual(['data.ttl: it holds no SHACL shape with a target']);
  });
});

describe('addresses a manifest names (#243 review)', () => {
  it('skips one on this machine or a private network, unless it is on the manifest\'s own server', async () => {
    const fetched: string[] = [];
    const files: Record<string, string> = {
      'https://example.org/c/manifest.json': JSON.stringify({ queries: ['http://localhost:8080/q.rq', 'http://192.168.1.4/q.rq', 'q.rq'] }),
      'https://example.org/c/q.rq': Q2,
      'http://localhost:5173/c/manifest.json': JSON.stringify({ queries: ['q.rq', 'http://localhost:5173/other/q.rq', 'http://localhost:8080/q.rq'] }),
      'http://localhost:5173/c/q.rq': Q2,
      'http://localhost:5173/other/q.rq': Q2,
    };
    const library = createChecksLibrary({
      fetchText: async (url) => {
        fetched.push(url);
        return files[url] ?? Promise.reject(new Error('the server answered 404'));
      },
    });

    const outcome = await library.addUrl('https://example.org/c/manifest.json');

    expect(outcome.queries).toBe(1);
    expect(outcome.problems).toEqual([
      'q.rq: not loaded: the address is on this machine or a private network, and the manifest, not you, names it',
      'q.rq: not loaded: the address is on this machine or a private network, and the manifest, not you, names it',
    ]);
    expect(fetched).not.toContain('http://localhost:8080/q.rq');
    expect(fetched).not.toContain('http://192.168.1.4/q.rq');

    fetched.length = 0;
    const local = await library.addUrl('http://localhost:5173/c/manifest.json');
    expect(local.queries).toBe(2);
    expect(fetched).not.toContain('http://localhost:8080/q.rq');
  });
});

describe('loading files', () => {
  it('takes queries and shapes by their extension, and names a file that is neither', async () => {
    const library = createChecksLibrary();

    const outcome = await library.addFiles(picked({ 'cq-1-3.rq': Q1, 'readings.shacl.ttl': SHAPES, 'notes.md': '#' }));

    expect(outcome).toMatchObject({ queries: 1, shapes: 1 });
    expect(outcome.problems).toEqual(['notes.md: not a query (.rq), shapes (Turtle) or a manifest (.json)']);
  });

  it('reads a manifest picked with its files, and says when its files were not picked with it', async () => {
    const library = createChecksLibrary();

    const outcome = await library.addFiles(picked({ 'manifest.json': MANIFEST, 'all.rq': Q2 }));

    expect(outcome.queries).toBe(1);
    expect(library.queries().map((q) => q.title)).toEqual(['Everything']);
    expect(outcome.problems[0]).toBe('cq-1-3.rq: not among the files picked: pick the folder, or the files with the manifest');
  });
});

describe('loading a folder', () => {
  it('with a manifest: only what it lists, against its place in the folder', async () => {
    const library = createChecksLibrary();

    const outcome = await library.addFiles(
      picked({ 'checks/manifest.json': MANIFEST, 'checks/queries/cq-1-3.rq': Q1, 'checks/queries/all.rq': Q2, 'checks/shapes/readings.shacl.ttl': SHAPES, 'checks/other.rq': Q2 }),
      { folder: true }
    );

    expect(outcome).toEqual({ queries: 2, shapes: 1, problems: [] });
  });

  it('without one: the queries, and the Turtle files named as shapes; not the data next to them', async () => {
    const library = createChecksLibrary();

    const outcome = await library.addFiles(picked({ 'run/q.rq': Q2, 'run/readings.shacl.ttl': SHAPES, 'run/shapes.ttl': SHAPES, 'run/data.ttl': '<a:b> <a:c> <a:d> .' }), { folder: true });

    expect(outcome).toEqual({ queries: 1, shapes: 2, problems: [] });
  });
});

describe('changes', () => {
  it('tells its listeners, and removes a shapes file or every query', async () => {
    const library = createChecksLibrary({ fetchText });
    const listener = vi.fn();
    library.onChange(listener);
    await library.addUrl(BASE + 'manifest.json');

    library.removeShapes(BASE + 'shapes/readings.shacl.ttl');
    library.clearQueries();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(library.shapesFiles()).toEqual([]);
    expect(library.queries()).toEqual([]);
    expect(library.shapes().size).toBe(0);
  });
});

describe('describeOutcome', () => {
  it('says what was loaded, and the first problem', () => {
    expect(describeOutcome({ queries: 2, shapes: 1, problems: [] })).toBe('2 queries and 1 shapes file loaded.');
    expect(describeOutcome({ queries: 0, shapes: 0, problems: ['a.rq: 404', 'b.rq: 404'] })).toBe('Nothing was loaded. 2 files could not be read: a.rq: 404 …');
  });
});

describe('the prefixes of the shapes', () => {
  it('are kept, so the report can name a shape as its file does; the first file to declare a prefix wins', async () => {
    const library = createChecksLibrary();
    await library.addFiles(picked({
      'a.shacl.ttl': '@prefix s: <http://example.org/a#> . ' + SHAPES,
      'b.shacl.ttl': '@prefix s: <http://example.org/b#> . @prefix t: <http://example.org/t#> . ' + SHAPES,
    }));

    expect(library.shapesPrefixes()).toMatchObject({ s: 'http://example.org/a#', t: 'http://example.org/t#', sh: 'http://www.w3.org/ns/shacl#' });
  });
});
