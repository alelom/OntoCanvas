/**
 * The data added to an open ontology (#205): size tiers by file size, and the list of sources with the stores queries run over.
 */
import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { classifyDataSize, createDataSources, DATA_LOAD_LIMIT_BYTES, DATA_REFUSE_LIMIT_BYTES, whenSourceListChanges } from '../../src/sparql/dataSources';

const MB = 1024 * 1024;
const ttl = (n: number) =>
  '@prefix : <http://example.org/d#> .\n' + Array.from({ length: n }, (_, i) => `:i${i} a :Thing ; :next :i${i + 1} .`).join('\n');

describe('classifyDataSize', () => {
  it('loads up to 2 MB, asks first up to 10 MB, refuses above, by the limits the issue sets', () => {
    expect(DATA_LOAD_LIMIT_BYTES).toBe(2 * MB);
    expect(DATA_REFUSE_LIMIT_BYTES).toBe(10 * MB);
    expect(classifyDataSize(100).tier).toBe('load');
    expect(classifyDataSize(2 * MB).tier).toBe('load');
    expect(classifyDataSize(2 * MB + 1).tier).toBe('confirm');
    expect(classifyDataSize(10 * MB).tier).toBe('confirm');
    expect(classifyDataSize(10 * MB + 1).tier).toBe('refuse');
  });

  it('gives a message for the two tiers that need one, with the size and the reason', () => {
    expect(classifyDataSize(5 * MB).message).toMatch(/5\.0 MB.*slow.*memory/i);
    expect(classifyDataSize(30 * MB).message).toMatch(/30\.0 MB.*too large/i);
    expect(classifyDataSize(10).message).toBeUndefined();
  });

  it('says what to do about data that is too large (#223), and speaks of what it is given to (a selection of files)', () => {
    expect(classifyDataSize(30 * MB).message).toMatch(/Load fewer files \(one part, one batch\), or use a tool with a database/);
    expect(classifyDataSize(5 * MB, 'These 3 files are 5.0 MB together').message).toMatch(/^These 3 files are 5\.0 MB together: loading/);
  });
});

describe('createDataSources', () => {
  it('adds a source from text: its name, its triples, and a store of its own that queries run over', async () => {
    const sources = createDataSources();

    const added = await sources.addText('people.ttl', ttl(50), { path: 'people.ttl' });

    expect(added).toMatchObject({ name: 'people.ttl', triples: 100 });
    expect(sources.list()).toEqual([added]);
    expect(sources.stores()).toEqual([added.store]);
    expect(added.store.size).toBe(100);
  });

  it('keeps several sources apart, and removes one by id', async () => {
    const sources = createDataSources();
    const a = await sources.addText('a.ttl', ttl(2), { path: 'a.ttl' });
    const b = await sources.addText('b.ttl', ttl(3), { path: 'b.ttl' });

    sources.remove(a.id);

    expect(sources.list().map((s) => s.name)).toEqual(['b.ttl']);
    expect(sources.stores()).toEqual([b.store]);
  });

  it('forgets everything on clear, and tells the listeners on every change', async () => {
    const sources = createDataSources();
    const changed = vi.fn();
    sources.onChange(changed);

    await sources.addText('a.ttl', ttl(2), { path: 'a.ttl' });
    sources.clear();

    expect(sources.list()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('does not tell the listeners when clear finds nothing to forget', () => {
    const sources = createDataSources();
    const changed = vi.fn();
    sources.onChange(changed);

    sources.clear();

    expect(changed).not.toHaveBeenCalled();
  });

  it('refuses a source above the limit without reading it', async () => {
    const sources = createDataSources();
    const progress = vi.fn();

    await expect(sources.addText('huge.ttl', 'x', { path: 'huge.ttl', byteLength: 11 * MB, onProgress: progress })).rejects.toThrow(/too large/i);

    expect(progress).not.toHaveBeenCalled();
    expect(sources.list()).toEqual([]);
  });

  it('asks before reading a large source, and does not read it when the answer is no', async () => {
    const sources = createDataSources();
    const confirm = vi.fn().mockResolvedValue(false);

    await expect(sources.addText('big.ttl', ttl(5), { path: 'big.ttl', byteLength: 5 * MB, confirm })).rejects.toThrow('Cancelled');

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/5\.0 MB/));
    expect(sources.list()).toEqual([]);
  });

  it('reads a large source when the answer is yes', async () => {
    const sources = createDataSources();

    const added = await sources.addText('big.ttl', ttl(5), { path: 'big.ttl', byteLength: 5 * MB, confirm: async () => true });

    expect(added.triples).toBe(10);
  });

  it('does not ask for a source that loads at once', async () => {
    const sources = createDataSources();
    const confirm = vi.fn();

    await sources.addText('small.ttl', ttl(2), { path: 'small.ttl', confirm });

    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not add a source whose read failed or was cancelled', async () => {
    const sources = createDataSources();
    const controller = new AbortController();
    controller.abort();

    await expect(sources.addText('a.ttl', ttl(2), { path: 'a.ttl', signal: controller.signal })).rejects.toThrow('Cancelled');
    await expect(sources.addText('bad.ttl', ':a :b', { path: 'bad.ttl' })).rejects.toThrow(/Failed to parse/);

    expect(sources.list()).toEqual([]);
  });
});

describe('addFile', () => {
  const file = (name: string, text: string, size = text.length) => ({ name, size, text: vi.fn(async () => text) });

  it('reads a file and names the source after it', async () => {
    const sources = createDataSources();

    const added = await sources.addFile(file('people.ttl', ttl(4)));

    expect(added).toMatchObject({ name: 'people.ttl', triples: 8 });
  });

  it('refuses a file above the limit before reading it, by its size', async () => {
    const sources = createDataSources();
    const huge = file('huge.ttl', 'x', 11 * MB);

    await expect(sources.addFile(huge)).rejects.toThrow(/too large/i);

    expect(huge.text).not.toHaveBeenCalled();
  });

  it('asks before reading a large file, once, and does not read it on no', async () => {
    const sources = createDataSources();
    const big = file('big.ttl', ttl(3), 5 * MB);
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);

    await expect(sources.addFile(big, { confirm })).rejects.toThrow('Cancelled');
    expect(big.text).not.toHaveBeenCalled();

    await sources.addFile(big, { confirm });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(big.text).toHaveBeenCalledTimes(1);
  });
});

describe('addFile, compressed (#223)', () => {
  const nquads = (n: number) => Array.from({ length: n }, (_, i) => `<http://example.org/d#i${i}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/d#Thing> .`).join('\n') + '\n';
  /** A file as the browser gives it: its bytes as a stream, and a size that may be made larger than the bytes. */
  const binaryFile = (name: string, bytes: Uint8Array, size = bytes.length) => ({
    name,
    size,
    text: vi.fn(async () => new TextDecoder().decode(bytes)),
    stream: vi.fn(() => new Blob([bytes]).stream()),
  });
  const utf8 = (text: string) => new TextEncoder().encode(text);
  const subjects = (source: { store: { getSubjects: (p: null, o: null, g: null) => Array<{ value: string }> } }) =>
    source.store.getSubjects(null, null, null).map((s) => s.value).sort();

  it.each([
    ['people.ttl.gz', 'people.ttl', ttl(4)],
    ['part-0001.nq.gz', 'part-0001.nq', nquads(4)],
  ])('reads %s as the same individuals as %s, telling the format from the name without .gz', async (gzName, plainName, text) => {
    const sources = createDataSources();

    const compressed = await sources.addFile(binaryFile(gzName, gzipSync(utf8(text))));
    const plain = await sources.addFile(binaryFile(plainName, utf8(text)));

    expect(compressed.name).toBe(gzName);
    expect(compressed.triples).toBe(plain.triples);
    expect(subjects(compressed)).toEqual(subjects(plain));
    expect(compressed.bytes).toBe(utf8(text).length);
  });

  it('decompresses a gzip told by its first bytes whatever its name, and reads a .gz that is not compressed as it is', async () => {
    const sources = createDataSources();

    const renamed = await sources.addFile(binaryFile('people.ttl', gzipSync(utf8(ttl(2)))));
    const plainGz = await sources.addFile(binaryFile('people.ttl.gz', utf8(ttl(2))));

    expect([renamed.triples, plainGz.triples]).toEqual([4, 4]);
  });

  it('stops a file whose data passes the limit once decompressed, adds nothing, and says what to do', async () => {
    const sources = createDataSources();
    const bomb = binaryFile('part-0001.ttl.gz', gzipSync(utf8('#'.repeat(10 * MB + 1))));

    const error = await sources.addFile(bomb).catch((e) => e);

    expect(error.message).toMatch(/part-0001\.ttl\.gz.*more than 10\.0 MB of data once decompressed.*too large/i);
    expect(error.message).toMatch(/Load fewer files.*database/i);
    expect(sources.list()).toEqual([]);
  });

  it('stops at a lower limit when one is given, for what is left of a selection', async () => {
    const sources = createDataSources();

    await expect(sources.addFile(binaryFile('a.ttl.gz', gzipSync(utf8(ttl(50)))), { limitBytes: 100 })).rejects.toThrow(/more than/);
    await expect(sources.addFile(binaryFile('a.ttl', utf8(ttl(50))), { limitBytes: 100 })).rejects.toThrow(/too large/);
    expect(sources.list()).toEqual([]);
  });

  it('asks before reading a compressed file whose estimated data is large, saying it is an estimate', async () => {
    const sources = createDataSources();
    const confirm = vi.fn().mockResolvedValue(false);
    const file = binaryFile('part-0001.nq.gz', gzipSync(utf8(nquads(2))), 0.5 * MB);

    await expect(sources.addFile(file, { confirm })).rejects.toThrow('Cancelled');

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/compressed file is 0\.5 MB, some 10\.0 MB of data once decompressed/));
    expect(file.stream).not.toHaveBeenCalled();
  });

  it('asks, and does not refuse, when only the estimate passes the limit: the read stops there if the data does', async () => {
    const sources = createDataSources();
    const confirm = vi.fn().mockResolvedValue(true);

    const added = await sources.addFile(binaryFile('part-0001.nq.gz', gzipSync(utf8(nquads(2))), 2 * MB), { confirm });

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/stops/));
    expect(added.triples).toBe(2);
  });

  it('refuses unread a compressed file that is above the limit compressed', async () => {
    const sources = createDataSources();
    const file = binaryFile('part-0001.nq.gz', gzipSync(utf8(nquads(2))), 11 * MB);

    await expect(sources.addFile(file)).rejects.toThrow(/too large/);

    expect(file.stream).not.toHaveBeenCalled();
  });
});

describe('addUrl, compressed (#223)', () => {
  it('downloads a .gz address, decompresses it, and tells the format from the address without .gz', async () => {
    const sources = createDataSources();
    const body = gzipSync(new TextEncoder().encode(ttl(3)));

    const added = await sources.addUrl('https://example.org/run/people.ttl.gz', {
      fetch: (async () => new Response(body, { headers: { 'content-type': 'application/gzip' } })) as never,
    });

    expect(added).toMatchObject({ name: 'people.ttl.gz', triples: 6 });
  });

  it('reads a .gz address the server already decompressed (Content-Encoding) as it is', async () => {
    const sources = createDataSources();

    const added = await sources.addUrl('https://example.org/run/people.ttl.gz', {
      fetch: (async () => new Response(ttl(3), { headers: { 'content-type': 'text/plain' } })) as never,
    });

    expect(added.triples).toBe(6);
  });
});

describe('addUrl', () => {
  const response =(body: string, headers: Record<string, string> = { 'content-type': 'text/turtle' }, status = 200) => new Response(body, { status, headers });

  it('downloads a URL, names the source after its file, and reads it in the format its content type says', async () => {
    const sources = createDataSources();
    const fetchFn = vi.fn(async () => response(ttl(4)));

    const added = await sources.addUrl('https://example.org/data/people.ttl', { fetch: fetchFn as never });

    expect(added).toMatchObject({ name: 'people.ttl', triples: 8 });
    expect(fetchFn).toHaveBeenCalledWith('https://example.org/data/people.ttl', expect.anything());
  });

  it.each(['text/plain', 'text/plain; charset=utf-8', 'application/octet-stream', ''])(
    'reads a .ttl address by its name when the server calls it %j, as raw.githubusercontent.com does (#205)',
    async (type) => {
      const sources = createDataSources();
      const headers: Record<string, string> = type ? { 'content-type': type } : {};

      const added = await sources.addUrl('https://raw.githubusercontent.com/o/r/main/data/people.ttl', { fetch: (async () => response(ttl(4), headers)) as never });

      expect(added.triples).toBe(8);
    }
  );

  it('still believes a content type that names an RDF format over the end of the address', async () => {
    const sources = createDataSources();
    const rdfXml = '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:d="http://example.org/d#"><rdf:Description rdf:about="http://example.org/d#a"><d:p>x</d:p></rdf:Description></rdf:RDF>';

    const added = await sources.addUrl('https://example.org/export?id=7', { fetch: (async () => response(rdfXml, { 'content-type': 'application/rdf+xml' })) as never });

    expect(added.triples).toBe(1);
  });

  it('says what to do when the format cannot be told from the address or the content type', async () => {
    const sources = createDataSources();

    await expect(sources.addUrl('https://example.org/export?id=7', { fetch: (async () => response(ttl(2), { 'content-type': 'text/plain' })) as never })).rejects.toThrow(
      /format of this file could not be told.*.ttl/is
    );
  });

  it('refuses a download whose Content-Length is above the limit without reading its body', async () => {
    const sources = createDataSources();
    const huge = response('x', { 'content-type': 'text/turtle', 'content-length': String(11 * MB) });
    const text = vi.spyOn(huge, 'text');

    await expect(sources.addUrl('https://example.org/huge.ttl', { fetch: (async () => huge) as never })).rejects.toThrow(/too large/i);

    expect(text).not.toHaveBeenCalled();
  });

  describe('a server that compresses: Content-Length is the size of the compressed body, the text is the decoded one (#206 review)', () => {
    const bigTurtle = (triples: number) =>
      '@prefix : <http://example.org/d#> .\n' + Array.from({ length: triples / 2 }, (_, i) => `:subject${i} a :Thing ; :next :object${i} .`).join('\n');

    it('asks before loading text over 2 MB though the announced size is far below it, as it does for the same text from a file', async () => {
      const sources = createDataSources();
      const text = bigTurtle(100_000);
      expect(text.length).toBeGreaterThan(2 * MB);
      const confirm = vi.fn().mockResolvedValue(true);

      const added = await sources.addUrl('https://example.org/big.ttl', {
        fetch: (async () => response(text, { 'content-type': 'text/turtle', 'content-length': '200000' })) as never,
        confirm,
      });

      expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/MB/));
      expect(added.bytes).toBe(text.length);
    });

    it('does not load it when the answer is no', async () => {
      const sources = createDataSources();

      await expect(
        sources.addUrl('https://example.org/big.ttl', {
          fetch: (async () => response(bigTurtle(100_000), { 'content-type': 'text/turtle', 'content-length': '200000' })) as never,
          confirm: async () => false,
        })
      ).rejects.toThrow('Cancelled');

      expect(sources.list()).toEqual([]);
    });

    it('refuses text over 10 MB though the announced size is small, without parsing it', async () => {
      const sources = createDataSources();
      const text = '#'.repeat(10 * MB + 1);

      await expect(
        sources.addUrl('https://example.org/huge.ttl', { fetch: (async () => response(text, { 'content-type': 'text/turtle', 'content-length': '300000' })) as never })
      ).rejects.toThrow(/too large/i);

      expect(sources.list()).toEqual([]);
    });

    it('keeps the announced size when it is the larger, as for a server that sends the text as it is', async () => {
      const sources = createDataSources();

      const added = await sources.addUrl('https://example.org/a.ttl', { fetch: (async () => response(ttl(2), { 'content-type': 'text/turtle', 'content-length': String(1 * MB) })) as never });

      expect(added.bytes).toBe(1 * MB);
    });
  });

  it('says so when the server answers with an error', async () => {
    const sources = createDataSources();

    await expect(sources.addUrl('https://example.org/x.ttl', { fetch: (async () => response('', {}, 404)) as never })).rejects.toThrow(/404/);
  });

  it('says what a failed request means: the address, or a server that does not allow the page to read it', async () => {
    const sources = createDataSources();

    await expect(
      sources.addUrl('https://example.org/x.ttl', {
        fetch: (async () => {
          throw new TypeError('Failed to fetch');
        }) as never,
      })
    ).rejects.toThrow(/could not be fetched.*CORS/i);
  });

  it('does not take an address that is not http or https', async () => {
    const sources = createDataSources();

    await expect(sources.addUrl('file:///etc/passwd', { fetch: vi.fn() as never })).rejects.toThrow(/http/i);
  });
});

describe('named graphs (#224)', () => {
  const nq = (...rows: Array<[string, string]>) =>
    rows.map(([s, g]) => `<http://example.org/${s}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/Thing> <http://example.org/${g}> .`).join('\n') + '\n';

  it('lists the graphs of all the sources, and hides one from the visible stores only (queries keep every graph)', async () => {
    const sources = createDataSources();
    await sources.addText('a.nq', nq(['a', 'g1'], ['b', 'g2']), { path: 'a.nq' });
    await sources.addText('b.nq', nq(['c', 'g2']), { path: 'b.nq' });
    const changed = vi.fn();
    sources.onChange(changed);

    expect(sources.graphs().map((g) => [g.key, g.quads])).toEqual([['http://example.org/g1', 1], ['http://example.org/g2', 2]]);
    sources.setGraphHidden('http://example.org/g2', true);

    expect(sources.isGraphHidden('http://example.org/g2')).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(sources.visibleStores().reduce((n, s) => n + s.size, 0)).toBe(1);
    expect(sources.stores().reduce((n, s) => n + s.size, 0)).toBe(3);
    // Still listed, so it can be shown again.
    expect(sources.graphs()).toHaveLength(2);

    sources.setGraphHidden('http://example.org/g2', false);
    expect(sources.visibleStores()).toEqual(sources.stores());
  });

  it('does not tell the listeners when a graph is set to what it already is', async () => {
    const sources = createDataSources();
    await sources.addText('a.nq', nq(['a', 'g1']), { path: 'a.nq' });
    const changed = vi.fn();
    sources.onChange(changed);

    sources.setGraphHidden('http://example.org/g1', false);

    expect(changed).not.toHaveBeenCalled();
  });

  it('forgets a hidden graph once no source holds it, and all of them on clear', async () => {
    const sources = createDataSources();
    const a = await sources.addText('a.nq', nq(['a', 'g1']), { path: 'a.nq' });
    await sources.addText('b.nq', nq(['b', 'g2']), { path: 'b.nq' });
    sources.setGraphHidden('http://example.org/g1', true);
    sources.setGraphHidden('http://example.org/g2', true);

    sources.remove(a.id);
    expect(sources.isGraphHidden('http://example.org/g1')).toBe(false);
    expect(sources.isGraphHidden('http://example.org/g2')).toBe(true);

    sources.clear();
    expect(sources.isGraphHidden('http://example.org/g2')).toBe(false);
  });
});

describe('whenSourceListChanges (#239 review)', () => {
  it('calls back when a source is added or removed, not when a graph is shown or hidden', async () => {
    const sources = createDataSources();
    const changed = vi.fn();
    whenSourceListChanges(sources, changed);

    const a = await sources.addText('a.nq', '<http://e/a> <http://e/p> <http://e/o> <http://e/g> .\n', { path: 'a.nq' });
    sources.setGraphHidden('http://e/g', true);
    sources.setGraphHidden('http://e/g', false);
    sources.remove(a.id);

    expect(changed).toHaveBeenCalledTimes(2);
  });
});
