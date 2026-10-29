/**
 * The data added to an open ontology (#205): size tiers by file size, and the list of sources with the stores queries run over.
 */
import { describe, it, expect, vi } from 'vitest';
import { classifyDataSize, createDataSources, DATA_LOAD_LIMIT_BYTES, DATA_REFUSE_LIMIT_BYTES } from '../../src/sparql/dataSources';

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

describe('addUrl', () => {
  const response = (body: string, headers: Record<string, string> = { 'content-type': 'text/turtle' }, status = 200) => new Response(body, { status, headers });

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
