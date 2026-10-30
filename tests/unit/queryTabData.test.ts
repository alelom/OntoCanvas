// @vitest-environment jsdom
/**
 * Data added to the open ontology, as the Query tab shows it (#205, #211): queries run over it, one line says that it is
 * there (and the loading status of an address's ?data=), and it is dropped when another ontology is opened. The controls to
 * add it are in the Individuals tab.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import { createDataSources, type DataSources } from '../../src/sparql/dataSources';
import { createDataLoader, type DataLoader } from '../../src/sparql/dataLoader';
import type { QueryResult } from '../../src/sparql/runQuery';

const ttl = (n: number) =>
  '@prefix : <http://example.org/d#> .\n' + Array.from({ length: n }, (_, i) => `:i${i} a :Thing ; :next :i${i + 1} .`).join('\n');

let container: HTMLElement;
let run: ReturnType<typeof vi.fn>;
let sources: DataSources;
let loader: DataLoader;
let openIndividuals: ReturnType<typeof vi.fn>;
const store = new Store();
const neverLoads = () => new Promise<never>(() => {});

const mount = () => {
  const tab = createQueryTab({
    getStore: () => store,
    getPrefixes: () => ({}),
    run: (...args) => run(...args),
    loadEditor: neverLoads,
    dataSources: sources,
    dataLoader: loader,
    openIndividuals: () => openIndividuals(),
  });
  tab.render(container);
  return tab;
};

const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const summary = () => q<HTMLElement>('[data-query-data-summary]');

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  run = vi.fn().mockResolvedValue({ kind: 'boolean', value: true } satisfies QueryResult);
  sources = createDataSources();
  loader = createDataLoader({ sources, getStore: () => store, confirm: async () => true });
  openIndividuals = vi.fn();
});

describe('the line about the data', () => {
  it('is not there while no data is added and nothing is loading', () => {
    mount();

    expect(summary().hidden).toBe(true);
  });

  it('says the queries run over the ontology and the data added, with a link to where it is managed', async () => {
    mount();

    await sources.addText('a.ttl', ttl(2), { path: 'a.ttl' });
    await sources.addText('b.ttl', ttl(3), { path: 'b.ttl' });

    expect(summary().hidden).toBe(false);
    expect(summary().textContent).toContain('Querying the ontology and 2 data files');
    q<HTMLButtonElement>('[data-query-data-manage]').click();
    expect(openIndividuals).toHaveBeenCalledTimes(1);
  });

  it('says "1 data file" in the singular, and goes when the data is removed', async () => {
    mount();
    const added = await sources.addText('a.ttl', ttl(2), { path: 'a.ttl' });
    expect(summary().textContent).toContain('1 data file');
    expect(summary().textContent).not.toContain('1 data files');

    sources.remove(added.id);

    expect(summary().hidden).toBe(true);
  });

  it('shows the loading status of data that is being read, with a Cancel, though nothing is added yet', async () => {
    mount();

    const reading = loader.addFile({ name: 'long.ttl', size: 10, text: async () => ttl(20000) });
    await vi.waitFor(() => expect(summary().textContent).toMatch(/Loading long\.ttl/));

    expect(summary().hidden).toBe(false);
    expect(q<HTMLButtonElement>('[data-query-data-cancel]').hidden).toBe(false);
    q<HTMLButtonElement>('[data-query-data-cancel]').click();
    await reading;
    expect(summary().textContent).toContain('Cancelled.');
    expect(q<HTMLButtonElement>('[data-query-data-cancel]').hidden).toBe(true);
  });

  it('shows why a file named in the address could not be added', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    mount();

    await loader.addUrls(['https://example.org/missing.ttl']);

    expect(summary().hidden).toBe(false);
    expect(summary().textContent).toContain('missing.ttl');
    expect(summary().textContent).toContain('404');
    vi.unstubAllGlobals();
  });

  it('is not drawn without data sources (a tab for an ontology alone)', () => {
    const tab = createQueryTab({ getStore: () => store, getPrefixes: () => ({}), loadEditor: neverLoads });
    tab.render(container);

    expect(container.querySelector('[data-query-data-summary]')).toBeNull();
  });
});

describe('queries over the data', () => {
  const runQuery = async () => {
    q<HTMLButtonElement>('[data-query-run]').click();
    await vi.waitFor(() => expect(q<HTMLButtonElement>('[data-query-run]').disabled).toBe(false));
  };

  it('run over the ontology and every added source, in that order', async () => {
    mount();
    await sources.addText('a.ttl', ttl(2), { path: 'a.ttl' });

    await runQuery();

    const stores = run.mock.calls[0][0] as Store[];
    expect(stores).toHaveLength(2);
    expect(stores[0]).toBe(store);
    expect(stores[1]).toBe(sources.list()[0].store);
  });

  it('run over the ontology alone when nothing is added, or after a source is removed', async () => {
    mount();
    const added = await sources.addText('a.ttl', ttl(2), { path: 'a.ttl' });
    sources.remove(added.id);

    await runQuery();

    expect(run.mock.calls[0][0]).toEqual([store]);
  });
});

describe('another ontology', () => {
  it('drops the data added to the one before, stops a read that is going on, and leaves no status of it in the line', async () => {
    const tab = mount();
    await sources.addText('a.ttl', ttl(2), { path: 'a.ttl' });
    const reading = loader.addFile({ name: 'long.ttl', size: 10, text: async () => ttl(20000) });
    await vi.waitFor(() => expect(loader.loading()).toBe(true));

    tab.refresh();
    await reading;

    expect(sources.list()).toEqual([]);
    expect(loader.status()).toBe('');
    expect(summary().hidden).toBe(true);
  });
});
