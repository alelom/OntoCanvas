// @vitest-environment jsdom
/**
 * Data files named in the address (?data=<url>, #205): added one after the other through the Data block, so they are listed
 * and queried like any other, and a failure is shown without stopping the others.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import { initSidePanel } from '../../src/ui/sidePanel/initSidePanel';
import { createDataSources, type DataSources } from '../../src/sparql/dataSources';

const ttl = (n: number) =>
  '@prefix : <http://example.org/d#> .\n' + Array.from({ length: n }, (_, i) => `:i${i} a :Thing .`).join('\n');
const store = new Store();
const neverLoads = () => new Promise<never>(() => {});

let sources: DataSources;
let fetchFn: ReturnType<typeof vi.fn>;

/** A server that answers each URL with what the table says, as text/plain like raw.githubusercontent.com. */
function serve(answers: Record<string, string | number>): void {
  fetchFn = vi.fn(async (url: string) => {
    const answer = answers[url];
    if (typeof answer === 'number') return new Response('', { status: answer });
    return new Response(answer ?? '', { headers: { 'content-type': 'text/plain' } });
  });
  vi.stubGlobal('fetch', fetchFn);
}

const items = () => [...document.querySelectorAll('[data-data-list] li')].map((li) => li.textContent ?? '');
const status = () => document.querySelector('[data-data-status]')!.textContent;

beforeEach(() => {
  document.body.innerHTML = '<div id="networkWrapper"></div><aside id="sidePanel"></aside>';
  sources = createDataSources();
});

describe('QueryTab.addDataUrls', () => {
  const mountTab = () => {
    const container = document.createElement('div');
    document.body.append(container);
    const tab = createQueryTab({ getStore: () => store, getPrefixes: () => ({}), loadEditor: neverLoads, dataSources: sources });
    tab.render(container);
    return tab;
  };

  it('adds each URL, in order, and lists them', async () => {
    serve({ 'https://example.org/a.ttl': ttl(2), 'https://example.org/b.ttl': ttl(3) });
    const tab = mountTab();

    await tab.addDataUrls(['https://example.org/a.ttl', 'https://example.org/b.ttl']);

    expect(items()).toHaveLength(2);
    expect(items()[0]).toContain('a.ttl');
    expect(items()[1]).toContain('b.ttl');
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(['https://example.org/a.ttl', 'https://example.org/b.ttl']);
    expect(status()).toBe('');
  });

  it('goes on after one that fails, and says which and why', async () => {
    serve({ 'https://example.org/missing.ttl': 404, 'https://example.org/b.ttl': ttl(3) });
    const tab = mountTab();

    await tab.addDataUrls(['https://example.org/missing.ttl', 'https://example.org/b.ttl']);

    expect(items()).toHaveLength(1);
    expect(items()[0]).toContain('b.ttl');
    expect(status()).toContain('missing.ttl');
    expect(status()).toContain('404');
  });

  it('adds nothing, and says so, when no ontology is open', async () => {
    serve({ 'https://example.org/a.ttl': ttl(2) });
    const container = document.createElement('div');
    document.body.append(container);
    const tab = createQueryTab({ getStore: () => null, getPrefixes: () => ({}), loadEditor: neverLoads, dataSources: sources });
    tab.render(container);

    await tab.addDataUrls(['https://example.org/a.ttl']);

    expect(items()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(status()).toMatch(/Open an ontology first/);
  });
});

describe('initSidePanel().addDataUrls', () => {
  it('opens the panel on the query tab and adds the data, so the page shows what the address asked for', async () => {
    serve({ 'https://example.org/a.ttl': ttl(2) });
    const panel = initSidePanel({ getStore: () => store, getPrefixes: () => ({}), dataSources: sources, embedded: false });
    expect((document.getElementById('sidePanel') as HTMLElement).hidden).toBe(true);

    await panel.addDataUrls(['https://example.org/a.ttl']);

    expect((document.getElementById('sidePanel') as HTMLElement).hidden).toBe(false);
    expect(items()).toHaveLength(1);
  });

  it('does nothing in an embedded (read-only) view: no panel, no download', async () => {
    serve({ 'https://example.org/a.ttl': ttl(2) });
    const panel = initSidePanel({ getStore: () => store, getPrefixes: () => ({}), dataSources: sources, embedded: true });

    await panel.addDataUrls(['https://example.org/a.ttl']);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(sources.list()).toEqual([]);
  });

  it('does nothing when the address names no data', async () => {
    serve({});
    const panel = initSidePanel({ getStore: () => store, getPrefixes: () => ({}), dataSources: sources, embedded: false });

    await panel.addDataUrls([]);

    expect((document.getElementById('sidePanel') as HTMLElement).hidden).toBe(true);
  });
});
