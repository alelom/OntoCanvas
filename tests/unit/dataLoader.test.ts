/**
 * Loading data into the open ontology (#211), apart from any tab: the one-at-a-time rule, the progress, Cancel, the failures,
 * and the "open an ontology first" case, shown by whichever tab is looking.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Store } from 'n3';
import { createDataLoader } from '../../src/sparql/dataLoader';
import { createDataSources, type DataSources } from '../../src/sparql/dataSources';

const MB = 1024 * 1024;
const ttl = (n: number) =>
  '@prefix : <http://example.org/d#> .\n' + Array.from({ length: n }, (_, i) => `:i${i} a :Thing .`).join('\n');
const file = (name: string, text: string, size = text.length) => ({ name, size, text: vi.fn(async () => text) });

let sources: DataSources;
let store: Store | null;
let confirm: ReturnType<typeof vi.fn>;

const loader = () => createDataLoader({ sources, getStore: () => store, confirm: (m) => confirm(m) });

beforeEach(() => {
  sources = createDataSources();
  store = new Store();
  confirm = vi.fn().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('addFile', () => {
  it('adds the source, and leaves nothing to say', async () => {
    const data = loader();

    await data.addFile(file('people.ttl', ttl(3)));

    expect(sources.list().map((s) => s.name)).toEqual(['people.ttl']);
    expect(data.status()).toBe('');
    expect(data.loading()).toBe(false);
  });

  it('says the triples read so far while it loads, and is loading until it is done', async () => {
    const data = loader();
    const seen: string[] = [];
    data.onChange(() => seen.push(`${data.loading()}|${data.status()}`));

    await data.addFile(file('long.ttl', ttl(20000)));

    expect(seen[0]).toBe('true|Loading long.ttl…');
    expect(seen.some((s) => /^true\|Loading long\.ttl… [\d,]+ triples$/.test(s))).toBe(true);
    expect(seen[seen.length - 1]).toBe('false|');
  });

  it('says why a file was not added', async () => {
    const data = loader();

    await data.addFile(file('huge.ttl', 'x', 11 * MB));

    expect(data.status()).toMatch(/too large/i);
    expect(sources.list()).toEqual([]);
  });

  it('asks before a large file, and says nothing when the answer is no', async () => {
    confirm.mockResolvedValue(false);
    const data = loader();

    await data.addFile(file('big.ttl', ttl(3), 5 * MB));

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/5\.0 MB/));
    expect(data.status()).toBe('');
    expect(sources.list()).toEqual([]);
  });

  it('says to open an ontology first, and adds nothing, when there is none', async () => {
    store = null;
    const data = loader();

    await data.addFile(file('people.ttl', ttl(3)));

    expect(data.status()).toMatch(/Open an ontology first/);
    expect(sources.list()).toEqual([]);
  });

  it('stops on cancel, and says so', async () => {
    const data = loader();

    const added = data.addFile(file('long.ttl', ttl(20000)));
    await vi.waitFor(() => expect(data.loading()).toBe(true));
    data.cancel();
    await added;

    expect(data.status()).toBe('Cancelled.');
    expect(data.loading()).toBe(false);
    expect(sources.list()).toEqual([]);
  });

  it('reads one file at a time: a second one added while the first loads is left alone', async () => {
    const data = loader();

    const first = data.addFile(file('a.ttl', ttl(20000)));
    await vi.waitFor(() => expect(data.loading()).toBe(true));
    await data.addFile(file('b.ttl', ttl(2)));
    await first;

    expect(sources.list().map((s) => s.name)).toEqual(['a.ttl']);
  });

  it('does nothing about cancel when nothing is loading', () => {
    const data = loader();

    expect(() => data.cancel()).not.toThrow();
    expect(data.status()).toBe('');
  });
});

describe('addFiles (#222)', () => {
  it('adds each file as its own source, in order, and leaves nothing to say', async () => {
    const data = loader();

    await data.addFiles([file('a.ttl', ttl(2)), file('b.ttl', ttl(3)), file('c.ttl', ttl(4))]);

    expect(sources.list().map((s) => [s.name, s.triples])).toEqual([['a.ttl', 2], ['b.ttl', 3], ['c.ttl', 4]]);
    expect(data.status()).toBe('');
    expect(data.loading()).toBe(false);
  });

  it('says which file of how many it is adding, with the triples read so far, on one line', async () => {
    const data = loader();
    const seen: string[] = [];
    data.onChange(() => seen.push(data.status()));

    await data.addFiles([file('a.ttl', ttl(2)), file('part-0002.ttl', ttl(20000))]);

    expect(seen).toContain('Adding 1 of 2: a.ttl…');
    expect(seen).toContain('Adding 2 of 2: part-0002.ttl…');
    expect(seen.some((s) => /^Adding 2 of 2: part-0002\.ttl… [\d,]+ triples$/.test(s))).toBe(true);
  });

  it('asks once for a selection whose total is large, though no file is large alone', async () => {
    const data = loader();

    await data.addFiles([file('a.ttl', ttl(2), 1 * MB), file('b.ttl', ttl(2), 1 * MB), file('c.ttl', ttl(2), 1 * MB)]);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^These 3 files are 3\.0 MB together: loading/));
    expect(sources.list()).toHaveLength(3);
  });

  it('asks once, not once per file, when files are large alone, and adds none on no', async () => {
    confirm.mockResolvedValue(false);
    const data = loader();
    const files = [file('a.ttl', ttl(2), 4 * MB), file('b.ttl', ttl(2), 4 * MB)];

    await data.addFiles(files);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(files[0].text).not.toHaveBeenCalled();
    expect(sources.list()).toEqual([]);
    expect(data.status()).toBe('');
  });

  it('refuses a selection whose total is above the limit, reading none of it, and says what to do', async () => {
    const data = loader();
    const files = [file('a.ttl', ttl(2), 6 * MB), file('b.ttl', ttl(2), 6 * MB)];

    await data.addFiles(files);

    expect(data.status()).toMatch(/These 2 files are 12\.0 MB together, too large.*Load fewer files/);
    expect(files[0].text).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(sources.list()).toEqual([]);
  });

  it('estimates what compressed files hold when it asks', async () => {
    const data = loader();

    await data.addFiles([file('part-0001.nq.gz', '', 0.2 * MB), file('part-0002.nq.gz', '', 0.2 * MB)]);

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/These 2 files are 0\.4 MB, some 8\.0 MB of data once decompressed \(an estimate\)/));
  });

  it('gives each file what is left of the limit after the files before it', async () => {
    const addFile = vi.spyOn(sources, 'addFile');
    const data = loader();

    await data.addFiles([file('a.ttl', ttl(2)), file('b.ttl', ttl(2))]);

    const [first, second] = addFile.mock.calls.map((call) => call[1]!.limitBytes!);
    expect(first).toBe(10 * MB);
    expect(second).toBe(10 * MB - sources.list()[0].bytes);
  });

  it('goes on after a file that fails, keeps the others, and says which failed and why', async () => {
    const data = loader();

    await data.addFiles([file('bad.ttl', ':a :b'), file('b.ttl', ttl(3))]);

    expect(sources.list().map((s) => s.name)).toEqual(['b.ttl']);
    expect(data.status()).toMatch(/^bad\.ttl: Failed to parse/);
  });

  it('stops the rest on cancel, keeps what was added before, and says so', async () => {
    const data = loader();
    const last = file('c.ttl', ttl(2));

    const adding = data.addFiles([file('a.ttl', ttl(2)), file('b.ttl', ttl(20000)), last]);
    await vi.waitFor(() => expect(data.status()).toMatch(/^Adding 2 of 3/));
    data.cancel();
    await adding;

    expect(sources.list().map((s) => s.name)).toEqual(['a.ttl']);
    expect(last.text).not.toHaveBeenCalled();
    expect(data.status()).toBe('Cancelled.');
    expect(data.loading()).toBe(false);
  });

  it('does nothing for an empty selection', async () => {
    const data = loader();

    await data.addFiles([]);

    expect(data.status()).toBe('');
    expect(data.loading()).toBe(false);
  });
});

describe('reset (another ontology is opened)', () => {
  it('stops a read that is going on, and leaves nothing to say: nobody pressed Cancel', async () => {
    const data = loader();

    const reading = data.addFile(file('long.ttl', ttl(20000)));
    await vi.waitFor(() => expect(data.loading()).toBe(true));
    data.reset();
    await reading;

    expect(data.loading()).toBe(false);
    expect(data.status()).toBe('');
    expect(sources.list()).toEqual([]);
  });

  it('forgets the failure of the last read', async () => {
    const data = loader();
    await data.addFile(file('huge.ttl', 'x', 11 * MB));
    expect(data.status()).toMatch(/too large/i);

    data.reset();

    expect(data.status()).toBe('');
  });

  it('tells the listeners, once, when it clears something, and not when there was nothing to clear', async () => {
    const data = loader();
    const changed = vi.fn();
    data.onChange(changed);

    data.reset();
    expect(changed).not.toHaveBeenCalled();

    await data.addFile(file('huge.ttl', 'x', 11 * MB));
    changed.mockClear();
    data.reset();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('lets the next read go ahead as normal', async () => {
    const data = loader();
    const reading = data.addFile(file('long.ttl', ttl(20000)));
    await vi.waitFor(() => expect(data.loading()).toBe(true));
    data.reset();
    await reading;

    await data.addFile(file('b.ttl', ttl(2)));

    expect(sources.list().map((s) => s.name)).toEqual(['b.ttl']);
  });
});

describe('addUrls', () => {
  function serve(answers: Record<string, string | number>): ReturnType<typeof vi.fn> {
    const fetchFn = vi.fn(async (url: string) => {
      const answer = answers[url];
      if (typeof answer === 'number') return new Response('', { status: answer });
      return new Response(answer ?? '', { headers: { 'content-type': 'text/plain' } });
    });
    vi.stubGlobal('fetch', fetchFn);
    return fetchFn;
  }

  it('adds each URL, in order', async () => {
    const fetchFn = serve({ 'https://example.org/a.ttl': ttl(2), 'https://example.org/b.ttl': ttl(3) });
    const data = loader();

    await data.addUrls(['https://example.org/a.ttl', 'https://example.org/b.ttl']);

    expect(sources.list().map((s) => s.name)).toEqual(['a.ttl', 'b.ttl']);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(['https://example.org/a.ttl', 'https://example.org/b.ttl']);
    expect(data.status()).toBe('');
  });

  it('goes on after one that fails, and says which and why once all are tried', async () => {
    serve({ 'https://example.org/missing.ttl': 404, 'https://example.org/b.ttl': ttl(3) });
    const data = loader();

    await data.addUrls(['https://example.org/missing.ttl', 'https://example.org/b.ttl']);

    expect(sources.list().map((s) => s.name)).toEqual(['b.ttl']);
    expect(data.status()).toContain('https://example.org/missing.ttl');
    expect(data.status()).toContain('404');
  });

  it('adds nothing, and does not download, when no ontology is open', async () => {
    const fetchFn = serve({ 'https://example.org/a.ttl': ttl(2) });
    store = null;
    const data = loader();

    await data.addUrls(['https://example.org/a.ttl']);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(data.status()).toMatch(/Open an ontology first/);
  });
});

describe('addUrl', () => {
  it('adds one URL, as the field of the tab does', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ttl(3), { headers: { 'content-type': 'text/turtle' } })));
    const data = loader();

    await data.addUrl('https://example.org/data/places.ttl');

    expect(sources.list().map((s) => s.name)).toEqual(['places.ttl']);
  });
});
