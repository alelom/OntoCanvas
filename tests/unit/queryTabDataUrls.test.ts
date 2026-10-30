// @vitest-environment jsdom
/**
 * Data files named in the address (?data=<url>, #205): the panel opens on the Query tab and loads them, as the Individuals tab
 * is not drawn yet; they are listed and queried like any other, and a failure is shown without stopping the others.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import { initSidePanel } from '../../src/ui/sidePanel/initSidePanel';
import { createDataSources, type DataSources } from '../../src/sparql/dataSources';

const ttl = (n: number) =>
  '@prefix : <http://example.org/d#> .\n' + Array.from({ length: n }, (_, i) => `:i${i} a :Thing .`).join('\n');
const store = new Store();

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

const panelEl = () => document.getElementById('sidePanel') as HTMLElement;
const summary = () => document.querySelector('[data-query-data-summary]')!.textContent ?? '';

beforeEach(() => {
  document.body.innerHTML = '<div id="networkWrapper"></div><aside id="sidePanel"></aside>';
  sources = createDataSources();
});

describe('initSidePanel().addDataUrls', () => {
  const mount = (embedded = false, getStore: () => Store | null = () => store) =>
    initSidePanel({ getStore, getPrefixes: () => ({}), dataSources: sources, embedded });

  it('opens the panel on the Query tab and adds each URL, in order, the line there saying what is queried', async () => {
    serve({ 'https://example.org/a.ttl': ttl(2), 'https://example.org/b.ttl': ttl(3) });
    const panel = mount();
    expect(panelEl().hidden).toBe(true);

    await panel.addDataUrls(['https://example.org/a.ttl', 'https://example.org/b.ttl']);

    expect(panelEl().hidden).toBe(false);
    expect(panelEl().querySelector('[data-tab-body="query"]')!.hasAttribute('hidden')).toBe(false);
    expect(sources.list().map((s) => s.name)).toEqual(['a.ttl', 'b.ttl']);
    expect(fetchFn.mock.calls.map((c) => c[0])).toEqual(['https://example.org/a.ttl', 'https://example.org/b.ttl']);
    expect(summary()).toContain('Querying the ontology and 2 data files');
  });

  it('goes on after one that fails, and says which and why in that line', async () => {
    serve({ 'https://example.org/missing.ttl': 404, 'https://example.org/b.ttl': ttl(3) });
    const panel = mount();

    await panel.addDataUrls(['https://example.org/missing.ttl', 'https://example.org/b.ttl']);

    expect(sources.list().map((s) => s.name)).toEqual(['b.ttl']);
    expect(summary()).toContain('missing.ttl');
    expect(summary()).toContain('404');
  });

  it('adds nothing, and says so, when no ontology is open', async () => {
    serve({ 'https://example.org/a.ttl': ttl(2) });
    const panel = mount(false, () => null);

    await panel.addDataUrls(['https://example.org/a.ttl']);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(summary()).toMatch(/Open an ontology first/);
  });

  it('does nothing in an embedded (read-only) view: no panel, no download', async () => {
    serve({ 'https://example.org/a.ttl': ttl(2) });
    const panel = mount(true);

    await panel.addDataUrls(['https://example.org/a.ttl']);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(sources.list()).toEqual([]);
  });

  it('does nothing when the address names no data', async () => {
    serve({});
    const panel = mount();

    await panel.addDataUrls([]);

    expect(panelEl().hidden).toBe(true);
  });
});
