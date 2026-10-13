import { describe, it, expect, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { findVersions, githubRawLocations, type VersionSources } from './ontologyVersions';

const HEADER = '@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n';
const ONTO = 'https://example.org/onto';
const store = (ttl: string): Store => new Store(new Parser().parse(HEADER + ttl));
const ontology = (version: string | null, extra = '') =>
  `<${ONTO}> rdf:type owl:Ontology${version ? ` ; owl:versionIRI <${ONTO}/${version}> ; owl:versionInfo "${version}"` : ''}${extra} .`;

/** Sources that answer from the given tables; anything else is "not available". */
function sources(texts: Record<string, string> = {}, json: Record<string, unknown> = {}, existing: string[] = []): VersionSources {
  return {
    fetchText: vi.fn(async (url: string) => texts[url] ?? null),
    fetchJson: vi.fn(async (url: string) => json[url] ?? null),
    exists: vi.fn(async (url: string) => existing.includes(url)),
    parse: async (text: string) => store(text.replace(HEADER, '')),
  };
}

describe('githubRawLocations (#132)', () => {
  it('reads owner, repository, ref and path from a raw.githubusercontent.com URL', () => {
    expect(githubRawLocations('https://raw.githubusercontent.com/acme/onto/v1.0.0/onto.ttl'))
      .toEqual([{ owner: 'acme', repo: 'onto', ref: 'v1.0.0', path: 'onto.ttl' }]);
    expect(githubRawLocations('https://raw.githubusercontent.com/acme/onto/refs/heads/main/onto.ttl'))
      .toEqual([{ owner: 'acme', repo: 'onto', ref: 'main', path: 'onto.ttl' }]);
  });

  it('gives each way to read a ref with slashes, shortest ref first, up to three parts (review of #134)', () => {
    expect(githubRawLocations('https://raw.githubusercontent.com/acme/onto/feat/x/src/v/onto.ttl').map((l) => [l.ref, l.path])).toEqual([
      ['feat', 'x/src/v/onto.ttl'],
      ['feat/x', 'src/v/onto.ttl'],
      ['feat/x/src', 'v/onto.ttl'],
    ]);
  });

  it('is empty for any other address', () => {
    expect(githubRawLocations('https://example.org/onto.ttl')).toEqual([]);
    expect(githubRawLocations(null)).toEqual([]);
  });
});

describe('findVersions (#132)', () => {
  it('lists the latest release, read from the ontology IRI, and says it is newer', async () => {
    const found = await findVersions(store(ontology('1.0.0')), 'https://files.example.org/onto-1.0.0.ttl', sources({ [ONTO]: ontology('1.2.0') }));
    expect(found.loaded).toBe('1.0.0');
    expect(found.entries.map((e) => [e.version, e.source])).toEqual([['1.2.0', 'latest'], ['1.0.0', 'loaded']]);
    expect(found.newer).toMatchObject({ version: '1.2.0', url: ONTO });
  });

  it('lists the versions the file names with owl:priorVersion, without any network', async () => {
    const src = sources();
    const found = await findVersions(store(ontology('2.0.0', ` ; owl:priorVersion <${ONTO}/1.0.0> , <${ONTO}/1.5.0>`)), ONTO, src);
    expect(found.entries.map((e) => e.version)).toEqual(['2.0.0', '1.5.0', '1.0.0']);
    expect(found.entries.find((e) => e.version === '1.5.0')).toMatchObject({ url: `${ONTO}/1.5.0`, source: 'prior' });
    expect(found.newer).toBeNull();
    // Opened from the ontology IRI itself: that is the latest, there is nothing more to read.
    expect(src.fetchText).not.toHaveBeenCalled();
  });

  it('reads nothing from the network for a file opened from disk: only what the file says', async () => {
    const src = sources({ [ONTO]: ontology('1.2.0') });
    const found = await findVersions(store(ontology('1.0.0', ` ; owl:priorVersion <${ONTO}/0.9.0>`)), null, src);
    expect(found.entries.map((e) => e.version)).toEqual(['1.0.0', '0.9.0']);
    expect(src.fetchText).not.toHaveBeenCalled();
    expect(src.fetchJson).not.toHaveBeenCalled();
  });

  it('lists the GitHub tags at which the file exists, for a file served from GitHub', async () => {
    const raw = (ref: string) => `https://raw.githubusercontent.com/acme/onto/${ref}/onto.ttl`;
    const found = await findVersions(
      store(ontology('1.0.0')),
      raw('v1.0.0'),
      sources({}, { 'https://api.github.com/repos/acme/onto/tags?per_page=100': [{ name: 'v2.0.0' }, { name: 'v1.0.0' }, { name: 'v0.1.0' }] }, [raw('v2.0.0'), raw('v1.0.0')])
    );
    expect(found.entries.map((e) => [e.version, e.source])).toEqual([['v2.0.0', 'github'], ['1.0.0', 'loaded']]);
    expect(found.entries[0].url).toBe(raw('v2.0.0'));
    expect(found.newer?.version).toBe('v2.0.0');
  });

  it('finds the tags of a file opened from a branch whose name has a slash (review of #134)', async () => {
    const raw = (ref: string) => `https://raw.githubusercontent.com/acme/onto/${ref}/examples/onto.ttl`;
    const found = await findVersions(
      store(ontology('1.0.0')),
      raw('feat/new-thing'),
      sources({}, { 'https://api.github.com/repos/acme/onto/tags?per_page=100': [{ name: 'v2.0.0' }] }, [raw('v2.0.0')])
    );
    expect(found.entries.find((e) => e.source === 'github')?.url).toBe(raw('v2.0.0'));
  });

  it('keeps the tags whose check succeeded when the check of another fails (review of #134)', async () => {
    const raw = (ref: string) => `https://raw.githubusercontent.com/acme/onto/${ref}/onto.ttl`;
    const src = sources({}, { 'https://api.github.com/repos/acme/onto/tags?per_page=100': [{ name: 'v3.0.0' }, { name: 'v2.0.0' }] }, [raw('v2.0.0')]);
    src.exists = async (url) => {
      if (url === raw('v3.0.0')) throw new Error('timed out');
      return url === raw('v2.0.0');
    };
    const found = await findVersions(store(ontology('1.0.0')), raw('v1.0.0'), src);
    expect(found.entries.filter((e) => e.source === 'github').map((e) => e.version)).toEqual(['v2.0.0']);
  });

  it('lists the releases between the loaded and the latest one, which the latest names with owl:priorVersion', async () => {
    const found = await findVersions(
      store(ontology('1.0.0')),
      'https://files.example.org/onto-1.0.0.ttl',
      sources({ [ONTO]: ontology('2.0.0', ` ; owl:priorVersion <${ONTO}/1.5.0> , <${ONTO}/1.0.0>`) })
    );
    expect(found.entries.map((e) => [e.version, e.source])).toEqual([['2.0.0', 'latest'], ['1.5.0', 'prior'], ['1.0.0', 'loaded']]);
  });

  it('offers the versions seen earlier in this tab, so an older version still lists the later ones', async () => {
    const seen = [
      { version: '2.0.0', url: 'https://files.example.org/onto-2.0.0.ttl', source: 'loaded' as const },
      { version: '1.0.0', url: 'https://files.example.org/onto-1.0.0.ttl', source: 'prior' as const },
    ];
    const found = await findVersions(store(ontology('1.0.0')), 'https://files.example.org/onto-1.0.0.ttl', sources(), seen);
    expect(found.entries.map((e) => [e.version, e.source])).toEqual([['2.0.0', 'seen'], ['1.0.0', 'loaded']]);
    expect(found.newer?.url).toBe('https://files.example.org/onto-2.0.0.ttl');
  });

  describe('latest: whether the loaded version is the latest', () => {
    it('is "certain" when opened from the ontology IRI, or when the ontology IRI names the loaded version', async () => {
      expect((await findVersions(store(ontology('2.0.0')), ONTO, sources())).latest).toBe('certain');
      expect((await findVersions(store(ontology('2.0.0')), 'https://files.example.org/onto.ttl', sources({ [ONTO]: ontology('2.0.0') }))).latest).toBe('certain');
    });

    it('is "known" when other versions are known and none is newer', async () => {
      const found = await findVersions(store(ontology('2.0.0', ` ; owl:priorVersion <${ONTO}/1.0.0>`)), 'https://files.example.org/onto.ttl', sources());
      expect(found.latest).toBe('known');
    });

    it('is null when a newer version is known, or no other version is', async () => {
      expect((await findVersions(store(ontology('1.0.0')), 'https://files.example.org/onto.ttl', sources({ [ONTO]: ontology('2.0.0') }))).latest).toBeNull();
      expect((await findVersions(store(ontology('1.0.0')), 'https://files.example.org/onto.ttl', sources())).latest).toBeNull();
    });
  });

  it('lists one entry per version, whichever sources name it', async () => {
    const found = await findVersions(
      store(ontology('1.0.0', ` ; owl:priorVersion <${ONTO}/0.9.0>`)),
      'https://files.example.org/onto.ttl',
      sources({ [ONTO]: ontology('1.0.0') })
    );
    expect(found.entries.map((e) => e.version)).toEqual(['1.0.0', '0.9.0']);
    expect(found.newer).toBeNull();
  });

  it('finds nothing more when no source answers, and nothing at all without an ontology', async () => {
    expect((await findVersions(store(ontology('1.0.0')), 'https://files.example.org/onto.ttl', sources())).entries).toHaveLength(1);
    expect(await findVersions(store('<http://example.org/x> rdf:type owl:Class .'), null, sources())).toEqual({ loaded: null, entries: [], newer: null, latest: null });
  });

  it('a source that fails is skipped, not fatal', async () => {
    const src = sources();
    src.fetchText = async () => { throw new Error('offline'); };
    const found = await findVersions(store(ontology('1.0.0', ` ; owl:priorVersion <${ONTO}/0.9.0>`)), 'https://files.example.org/onto.ttl', src);
    expect(found.entries.map((e) => e.version)).toEqual(['1.0.0', '0.9.0']);
  });
});
