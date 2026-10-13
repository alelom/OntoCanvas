// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJsonCached } from './versionSources';

describe('fetchJsonCached (#132)', () => {
  const URL = 'https://api.github.com/repos/acme/onto/tags?per_page=100';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock = vi.fn(async () => new Response(JSON.stringify([{ name: 'v1.0.0' }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('asks GitHub once an hour at most: a second call within the hour is answered from the cache', async () => {
    expect(await fetchJsonCached(URL)).toEqual([{ name: 'v1.0.0' }]);
    expect(await fetchJsonCached(URL)).toEqual([{ name: 'v1.0.0' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks again once the hour is over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await fetchJsonCached(URL);
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    await fetchJsonCached(URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is null, and keeps nothing, when the answer is an error (e.g. the rate limit)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"message":"API rate limit exceeded"}', { status: 403 }));
    expect(await fetchJsonCached(URL)).toBeNull();
    expect(await fetchJsonCached(URL)).toEqual([{ name: 'v1.0.0' }]);
  });
});

describe('browserVersionSources (review of #134)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a file that cannot be checked (network error, timeout) counts as missing, rather than failing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { browserVersionSources } = await import('./versionSources');
    expect(await browserVersionSources.exists('https://raw.githubusercontent.com/acme/onto/v1.0.0/onto.ttl')).toBe(false);
  });

  it('JSON that cannot be read (network error, timeout) is null, rather than failing', async () => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await fetchJsonCached('https://api.github.com/repos/acme/onto/tags?per_page=100')).toBeNull();
  });
});
