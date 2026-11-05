// @vitest-environment jsdom
/**
 * The controls to add individuals (#205, moved to the Individuals tab in #211): a file or a URL, what is added with a Remove
 * button, the progress with Cancel, and why a file was not added.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import { createDataBlock } from '../../src/ui/sidePanel/dataBlock';
import { createDataSources, type DataSources } from '../../src/sparql/dataSources';
import { createDataLoader, type DataLoader } from '../../src/sparql/dataLoader';

const MB = 1024 * 1024;
const ttl = (n: number) =>
  '@prefix : <http://example.org/d#> .\n' + Array.from({ length: n }, (_, i) => `:i${i} a :Thing ; :next :i${i + 1} .`).join('\n');

let block: HTMLElement;
let sources: DataSources;
let loader: DataLoader;
let confirm: ReturnType<typeof vi.fn>;
const store = new Store();

const file = (name: string, text: string, size = text.length) => ({ name, size, text: async () => text });
const q = <T extends HTMLElement>(selector: string) => block.querySelector<T>(selector)!;
const items = () => [...block.querySelectorAll('[data-data-list] li')].map((li) => li.textContent ?? '');

/** What the file input does when the user picks a file. */
function pick(picked: unknown): void {
  const input = q<HTMLInputElement>('[data-add-file-input]');
  Object.defineProperty(input, 'files', { value: [picked], configurable: true });
  input.dispatchEvent(new Event('change'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  sources = createDataSources();
  confirm = vi.fn().mockResolvedValue(true);
  loader = createDataLoader({ sources, getStore: () => store, confirm: (m) => confirm(m) });
  block = createDataBlock({ sources, loader });
  document.body.append(block);
});

describe('the controls', () => {
  it('offer a file and a URL, and show no list while nothing is added', () => {
    expect(q('[data-add-file]').textContent).toMatch(/From a file/);
    expect(q('[data-add-url-input]')).not.toBeNull();
    expect(q('[data-add-url]').textContent).toMatch(/Add/);
    expect(q<HTMLElement>('[data-data-list]').hidden).toBe(true);
  });

  it('list a file added, with its triples, and remove it', async () => {
    pick(file('people.ttl', ttl(4)));
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    expect(items()[0]).toContain('people.ttl');
    expect(items()[0]).toContain('8 triples');
    q<HTMLButtonElement>('[data-data-remove]').click();
    await vi.waitFor(() => expect(items()).toEqual([]));
    expect(q<HTMLElement>('[data-data-list]').hidden).toBe(true);
  });

  it('take several files at once, each its own source (#222)', async () => {
    const input = q<HTMLInputElement>('[data-add-file-input]');
    expect(input.multiple).toBe(true);
    expect(q('[data-add-file]').getAttribute('title')).toMatch(/drop/i);

    Object.defineProperty(input, 'files', { value: [file('a.ttl', ttl(1)), file('b.ttl', ttl(2)), file('c.ttl', ttl(3))], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(items()).toHaveLength(3));

    expect(items().map((text) => text.split(' ')[0])).toEqual(['a.ttl', 'b.ttl', 'c.ttl']);
  });

  it('say "1 triple" in the singular', async () => {
    pick(file('one.ttl', '@prefix : <http://example.org/d#> . :a :b :c .'));
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    expect(items()[0]).toContain('1 triple');
    expect(items()[0]).not.toContain('1 triples');
  });

  it('add a URL, from the field, and empty the field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ttl(3), { headers: { 'content-type': 'text/turtle' } })));
    q<HTMLInputElement>('[data-add-url-input]').value = 'https://example.org/data/places.ttl';

    q<HTMLButtonElement>('[data-add-url]').click();
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    expect(items()[0]).toContain('places.ttl');
    expect(q<HTMLInputElement>('[data-add-url-input]').value).toBe('');
    vi.unstubAllGlobals();
  });

  it('add a URL on Enter in the field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ttl(3), { headers: { 'content-type': 'text/turtle' } })));
    const input = q<HTMLInputElement>('[data-add-url-input]');
    input.value = 'https://example.org/data/places.ttl';

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    vi.unstubAllGlobals();
  });

  it('add nothing for an empty URL field', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);

    q<HTMLButtonElement>('[data-add-url]').click();

    expect(fetchFn).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('show why a file was not added, and list nothing', async () => {
    pick(file('huge.ttl', 'x', 11 * MB));
    await vi.waitFor(() => expect(q('[data-data-status]').textContent).toMatch(/too large/i));

    expect(items()).toEqual([]);
  });

  it('ask before a large file, and say nothing when the answer is no', async () => {
    confirm.mockResolvedValue(false);

    pick(file('big.ttl', ttl(3), 5 * MB));
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());

    expect(confirm.mock.calls[0][0]).toMatch(/5\.0 MB/);
    await vi.waitFor(() => expect(q('[data-data-status]').textContent).toBe(''));
    expect(items()).toEqual([]);
  });

  it('show the triples read while a file loads, and Cancel stops it', async () => {
    pick(file('long.ttl', ttl(20000)));
    await vi.waitFor(() => expect(q('[data-data-status]').textContent).toMatch(/Loading long\.ttl/));
    expect(q<HTMLButtonElement>('[data-data-cancel]').hidden).toBe(false);
    q<HTMLButtonElement>('[data-data-cancel]').click();

    await vi.waitFor(() => expect(q('[data-data-status]').textContent).toMatch(/Cancelled/));
    expect(items()).toEqual([]);
    expect(q<HTMLButtonElement>('[data-data-cancel]').hidden).toBe(true);
  });

  it('show what a load started elsewhere (an address with ?data=) says, and list what it added', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    await loader.addUrls(['https://example.org/missing.ttl']);

    expect(q('[data-data-status]').textContent).toContain('missing.ttl');
    expect(q('[data-data-status]').textContent).toContain('404');
    await sources.addText('later.ttl', ttl(2), { path: 'later.ttl' });
    expect(items()).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it('list the sources that were there before the block was drawn', async () => {
    await sources.addText('earlier.ttl', ttl(2), { path: 'earlier.ttl' });

    const later = createDataBlock({ sources, loader });

    expect(later.querySelector('[data-data-list] li')!.textContent).toContain('earlier.ttl');
  });
});

describe('the named graphs of the data (#224)', () => {
  const NQ =
    '<http://example.org/d#a> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/d#Thing> <http://example.org/batch/1> .\n' +
    '<http://example.org/d#b> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/d#Thing> <http://example.org/batch/2> .\n' +
    '<http://example.org/d#c> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/d#Thing> <http://example.org/batch/2> .\n' +
    '<http://example.org/batch/2> <http://www.w3.org/2000/01/rdf-schema#label> "Batch 2" <http://example.org/batch/2> .\n';
  const rows = () => [...block.querySelectorAll<HTMLElement>('[data-data-graph]')];

  it('are not listed while the data has none', async () => {
    await sources.addText('people.ttl', ttl(2), { path: 'people.ttl' });

    expect(q<HTMLElement>('[data-data-graphs]').hidden).toBe(true);
  });

  it('are listed with their label (or IRI) and their quads, each with a checkbox that hides and shows it', async () => {
    await sources.addText('run.nq', NQ, { path: 'run.nq' });

    expect(q<HTMLElement>('[data-data-graphs]').hidden).toBe(false);
    expect(rows().map((row) => row.textContent)).toEqual(['http://example.org/batch/1 — 1 quad', 'Batch 2 — 3 quads']);
    expect(rows()[1].title).toBe('http://example.org/batch/2');
    const box = rows()[0].querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(true);

    box.click();
    expect(sources.isGraphHidden('http://example.org/batch/1')).toBe(true);
    expect(rows()[0].querySelector<HTMLInputElement>('input')!.checked).toBe(false);

    rows()[0].querySelector<HTMLInputElement>('input')!.click();
    expect(sources.isGraphHidden('http://example.org/batch/1')).toBe(false);
  });
});

describe('the notice about numbered parts (#225)', () => {
  const notice = () => q<HTMLElement>('[data-data-parts]');

  it('says nothing for files with no part number', async () => {
    await sources.addText('people.ttl', ttl(2), { path: 'people.ttl' });

    expect(notice().hidden).toBe(true);
  });

  it('names the missing part across everything added, and offers to add files', async () => {
    await sources.addText('part-0001.ttl', ttl(1), { path: 'part-0001.ttl' });
    await sources.addText('part-0004.ttl', ttl(1), { path: 'part-0004.ttl' });

    expect(notice().hidden).toBe(false);
    expect(notice().textContent).toContain('parts 2 and 3, and any after 4, may be missing');
    expect(notice().classList.contains('strong')).toBe(true);
    const picker = vi.spyOn(q<HTMLInputElement>('[data-add-file-input]'), 'click').mockImplementation(() => {});
    notice().querySelector<HTMLButtonElement>('[data-data-parts-add]')!.click();
    expect(picker).toHaveBeenCalled();
  });

  it('is softer for parts with no gap, and stays dismissed until what is added changes', async () => {
    await sources.addText('part-0001.ttl', ttl(1), { path: 'part-0001.ttl' });
    await sources.addText('part-0002.ttl', ttl(1), { path: 'part-0002.ttl' });
    expect(notice().classList.contains('strong')).toBe(false);
    expect(notice().textContent).toContain('There may be more');

    notice().querySelector<HTMLButtonElement>('[data-data-parts-dismiss]')!.click();
    expect(notice().hidden).toBe(true);
    await sources.addText('other.ttl', ttl(1), { path: 'other.ttl' });
    expect(notice().hidden).toBe(true);

    await sources.addText('part-0004.ttl', ttl(1), { path: 'part-0004.ttl' });
    expect(notice().hidden).toBe(false);
    expect(notice().textContent).toContain('part 3');
  });
});
