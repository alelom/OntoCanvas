// @vitest-environment jsdom
/**
 * The saved queries in the Query tab (#230): listed by title, grouped by their manifest, and put in the editor when picked,
 * not run. Loaded from files, a folder or an address, with what the load did said under the controls.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import { createChecksLibrary, type ChecksLibrary } from '../../src/checks/checksLibrary';

const site: Record<string, string> = {
  'https://example.org/c/manifest.json': JSON.stringify({ title: 'Checks', queries: ['rooms.rq', { path: 'all.rq', title: 'Everything', description: 'Every triple' }] }),
  'https://example.org/c/rooms.rq': '# The rooms\nSELECT ?r WHERE { ?r a <http://example.org/Room> }',
  'https://example.org/c/all.rq': 'SELECT * WHERE { ?s ?p ?o }',
  'https://example.org/loose.rq': 'ASK { ?s ?p ?o }',
};

let container: HTMLElement;
let library: ChecksLibrary;
const run = vi.fn();
const neverLoads = () => new Promise<never>(() => {});
const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const options = () => [...q<HTMLSelectElement>('[data-query-saved]').querySelectorAll('option')].map((o) => o.textContent);

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.append(container);
  run.mockReset();
  library = createChecksLibrary({ fetchText: async (url) => site[url] ?? Promise.reject(new Error('the server answered 404')) });
  createQueryTab({ getStore: () => new Store(), getPrefixes: () => ({}), run, loadEditor: neverLoads, library }).render(container);
});

describe('the saved queries of the Query tab', () => {
  it('are hidden until some are loaded, with where to load them', () => {
    expect(q('[data-query-saved]').closest<HTMLElement>('.query-history')!.hidden).toBe(true);
    expect(q('.query-library-load summary').textContent).toBe('Load saved queries…');
  });

  it('list a manifest\'s queries by title under its name, and those loaded on their own apart', async () => {
    await library.addUrl('https://example.org/c/manifest.json');
    await library.addUrl('https://example.org/loose.rq');

    expect(q('[data-query-saved]').closest<HTMLElement>('.query-history')!.hidden).toBe(false);
    expect(options()).toEqual(['Saved queries (3)', 'The rooms', 'Everything', 'loose']);
    expect([...container.querySelectorAll('[data-query-saved] optgroup')].map((g) => (g as HTMLOptGroupElement).label)).toEqual(['Checks', 'Files']);
    expect(container.querySelectorAll('[data-query-saved] option')[2].getAttribute('title')).toBe('Every triple');
  });

  it('put the query picked in the editor, without running it', async () => {
    await library.addUrl('https://example.org/c/manifest.json');
    const select = q<HTMLSelectElement>('[data-query-saved]');

    select.value = '1';
    select.dispatchEvent(new Event('change'));

    expect(q<HTMLTextAreaElement>('[data-query-editor] textarea').value).toBe('SELECT * WHERE { ?s ?p ?o }');
    expect(select.value).toBe('');
    expect(run).not.toHaveBeenCalled();
  });

  it('load from an address typed, and say what was loaded', async () => {
    q<HTMLInputElement>('[data-checks-address]').value = 'https://example.org/c/manifest.json';
    q<HTMLButtonElement>('[data-checks-load-address]').click();

    await vi.waitFor(() => expect(q('[data-checks-loader-status]').textContent).toBe('2 queries loaded.'));
    expect(options()).toHaveLength(3);
  });

  it('say why an address could not be loaded', async () => {
    q<HTMLInputElement>('[data-checks-address]').value = 'https://example.org/nothing.json';
    q<HTMLButtonElement>('[data-checks-load-address]').click();

    await vi.waitFor(() => expect(q('[data-checks-loader-status]').textContent).toBe('Nothing was loaded. 1 file could not be read: nothing.json: the server answered 404'));
  });

  it('are forgotten with Clear', async () => {
    await library.addUrl('https://example.org/c/manifest.json');

    q<HTMLButtonElement>('[data-query-saved-clear]').click();

    expect(library.queries()).toEqual([]);
    expect(q('[data-query-saved]').closest<HTMLElement>('.query-history')!.hidden).toBe(true);
  });
});
