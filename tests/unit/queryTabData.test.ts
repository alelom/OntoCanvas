// @vitest-environment jsdom
/**
 * Data added to the open ontology in the query tab (#205): a file or a URL, listed with its triples and a Remove button,
 * queried together with the ontology, dropped when another ontology is opened.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import { createDataSources, type DataSources } from '../../src/sparql/dataSources';
import type { QueryResult } from '../../src/sparql/runQuery';

const MB = 1024 * 1024;
const ttl = (n: number) =>
  '@prefix : <http://example.org/d#> .\n' + Array.from({ length: n }, (_, i) => `:i${i} a :Thing ; :next :i${i + 1} .`).join('\n');

let container: HTMLElement;
let run: ReturnType<typeof vi.fn>;
let sources: DataSources;
let confirm: ReturnType<typeof vi.fn>;
const store = new Store();
const neverLoads = () => new Promise<never>(() => {});

const mount = () => {
  const tab = createQueryTab({
    getStore: () => store,
    getPrefixes: () => ({}),
    run: (...args) => run(...args),
    loadEditor: neverLoads,
    dataSources: sources,
    confirm: (message) => confirm(message),
  });
  tab.render(container);
  return tab;
};

const file = (name: string, text: string, size = text.length) => ({ name, size, text: async () => text });
const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const items = () => [...container.querySelectorAll('[data-data-list] li')].map((li) => li.textContent ?? '');

/** What the file input does when the user picks a file. */
function pick(picked: unknown): void {
  const input = q<HTMLInputElement>('[data-add-file-input]');
  Object.defineProperty(input, 'files', { value: [picked], configurable: true });
  input.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  run = vi.fn().mockResolvedValue({ kind: 'boolean', value: true } satisfies QueryResult);
  sources = createDataSources();
  confirm = vi.fn().mockResolvedValue(true);
});

describe('the data block', () => {
  it('offers a file and a URL, and shows no list while nothing is added', () => {
    mount();

    expect(q('[data-add-file]').textContent).toMatch(/Add data file/);
    expect(q('[data-add-url-input]')).not.toBeNull();
    expect(q('[data-add-url]').textContent).toMatch(/Add/);
    expect(q<HTMLElement>('[data-data-list]').hidden).toBe(true);
  });

  it('lists a file added, with its triples, and removes it', async () => {
    mount();

    pick(file('people.ttl', ttl(4)));
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    expect(items()[0]).toContain('people.ttl');
    expect(items()[0]).toContain('8 triples');
    q<HTMLButtonElement>('[data-data-remove]').click();
    await vi.waitFor(() => expect(items()).toEqual([]));
    expect(q<HTMLElement>('[data-data-list]').hidden).toBe(true);
  });

  it('says "1 triple" in the singular', async () => {
    mount();

    pick(file('one.ttl', '@prefix : <http://example.org/d#> . :a :b :c .'));
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    expect(items()[0]).toContain('1 triple');
    expect(items()[0]).not.toContain('1 triples');
  });

  it('adds a URL, from the field, and empties the field', async () => {
    const fetchFn = vi.fn(async () => new Response(ttl(3), { headers: { 'content-type': 'text/turtle' } }));
    vi.stubGlobal('fetch', fetchFn);
    mount();

    q<HTMLInputElement>('[data-add-url-input]').value = 'https://example.org/data/places.ttl';
    q<HTMLButtonElement>('[data-add-url]').click();
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    expect(items()[0]).toContain('places.ttl');
    expect(q<HTMLInputElement>('[data-add-url-input]').value).toBe('');
    vi.unstubAllGlobals();
  });

  it('shows why a file was not added, in the block, and lists nothing', async () => {
    mount();

    pick(file('huge.ttl', 'x', 11 * MB));
    await vi.waitFor(() => expect(q('[data-data-status]').textContent).toMatch(/too large/i));

    expect(items()).toEqual([]);
  });

  it('asks before a large file, and says nothing when the answer is no', async () => {
    confirm.mockResolvedValue(false);
    mount();

    pick(file('big.ttl', ttl(3), 5 * MB));
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());

    expect(confirm.mock.calls[0][0]).toMatch(/5\.0 MB/);
    await vi.waitFor(() => expect(q('[data-data-status]').textContent).toBe(''));
    expect(items()).toEqual([]);
  });

  it('shows the triples read while a file loads, and Cancel stops it', async () => {
    mount();
    const text = ttl(20000);

    pick(file('long.ttl', text));
    await vi.waitFor(() => expect(q('[data-data-status]').textContent).toMatch(/Loading long\.ttl/));
    expect(q<HTMLButtonElement>('[data-data-cancel]').hidden).toBe(false);
    q<HTMLButtonElement>('[data-data-cancel]').click();

    await vi.waitFor(() => expect(q('[data-data-status]').textContent).toMatch(/Cancelled/));
    expect(items()).toEqual([]);
    expect(q<HTMLButtonElement>('[data-data-cancel]').hidden).toBe(true);
  });
});

describe('queries over the data', () => {
  const runQuery = async () => {
    q<HTMLButtonElement>('[data-query-run]').click();
    await vi.waitFor(() => expect(q<HTMLButtonElement>('[data-query-run]').disabled).toBe(false));
  };

  it('run over the ontology and every added source, in that order', async () => {
    mount();
    pick(file('a.ttl', ttl(2)));
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    await runQuery();

    const stores = run.mock.calls[0][0] as Store[];
    expect(stores).toHaveLength(2);
    expect(stores[0]).toBe(store);
    expect(stores[1]).toBe(sources.list()[0].store);
  });

  it('run over the ontology alone when nothing is added, or after a source is removed', async () => {
    mount();
    pick(file('a.ttl', ttl(2)));
    await vi.waitFor(() => expect(items()).toHaveLength(1));
    q<HTMLButtonElement>('[data-data-remove]').click();

    await runQuery();

    expect(run.mock.calls[0][0]).toEqual([store]);
  });
});

describe('another ontology', () => {
  it('drops the data added to the one before', async () => {
    const tab = mount();
    pick(file('a.ttl', ttl(2)));
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    tab.refresh();

    expect(sources.list()).toEqual([]);
    expect(items()).toEqual([]);
  });
});
