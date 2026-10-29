// @vitest-environment jsdom
/**
 * The history selector of the query tab (#182): a query is recorded when it is run, the queries of the open file are offered
 * in a selector above the editor (newest first), and choosing one puts it in the editor without running it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import { HISTORY_LIMIT, localStorageHistory, type HistoryEntry, type HistoryStore } from '../../src/sparql/queryHistory';
import type { QueryResult } from '../../src/sparql/runQuery';

let container: HTMLElement;
let prefixes: Record<string, string>;
let run: ReturnType<typeof vi.fn>;
let key: string | null;
let history: HistoryStore;

/** The CodeMirror chunk never arrives here, so the plain textarea is what is driven. */
const neverLoads = () => new Promise<never>(() => {});

/** A history kept in a Map, so that a test can look at what was stored. */
function memoryHistory(): HistoryStore & { stored: Map<string, HistoryEntry[]> } {
  const stored = new Map<string, HistoryEntry[]>();
  return {
    stored,
    load: (k) => stored.get(k) ?? [],
    save: (k, entries) => void (entries.length ? stored.set(k, entries) : stored.delete(k)),
    clear: (k) => void stored.delete(k),
  };
}

const mount = (overrides: Partial<Parameters<typeof createQueryTab>[0]> = {}) => {
  const tab = createQueryTab({
    getStore: () => new Store(),
    getPrefixes: () => prefixes,
    run: (...args) => run(...args),
    loadEditor: neverLoads,
    history,
    getHistoryKey: () => key,
    ...overrides,
  });
  tab.render(container);
  return tab;
};

const editor = () => container.querySelector<HTMLTextAreaElement>('[data-query-editor] textarea')!;
const runButton = () => container.querySelector<HTMLButtonElement>('[data-query-run]')!;
const row = () => container.querySelector<HTMLElement>('[data-query-history-row]')!;
const select = () => container.querySelector<HTMLSelectElement>('[data-query-history]')!;
const clearButton = () => container.querySelector<HTMLButtonElement>('[data-query-history-clear]')!;
/** The options of the selector, without the placeholder. */
const options = () => [...select().options].slice(1);
const optionTexts = () => options().map((o) => o.textContent ?? '');

async function runQuery(text: string): Promise<void> {
  editor().value = text;
  runButton().click();
  await vi.waitFor(() => expect(runButton().disabled).toBe(false));
}

function choose(index: number): void {
  select().value = String(index);
  select().dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.append(container);
  prefixes = { '': 'http://example.org/o#' };
  run = vi.fn().mockResolvedValue({ kind: 'boolean', value: true } satisfies QueryResult);
  key = 'ontology:http://example.org/o';
  history = memoryHistory();
});

describe('the history selector', () => {
  it('is not shown while the file has no history', () => {
    mount();
    expect(row().hidden).toBe(true);
  });

  it('records a query when it is run, and offers it', async () => {
    mount();

    await runQuery('SELECT ?c WHERE { ?c a owl:Class }');

    expect(row().hidden).toBe(false);
    expect(optionTexts()).toHaveLength(1);
    expect(optionTexts()[0]).toContain('SELECT ?c WHERE { ?c a owl:Class }');
    expect(options()[0].title).toContain('SELECT ?c WHERE { ?c a owl:Class }');
  });

  it('lists the newest first, and does not record a repeat of the last query', async () => {
    mount();

    await runQuery('ASK { ?s ?p ?o }');
    await runQuery('SELECT * WHERE { ?s ?p ?o }');
    await runQuery('SELECT * WHERE { ?s ?p ?o }');

    expect(optionTexts()).toHaveLength(2);
    expect(optionTexts()[0]).toContain('SELECT * WHERE');
    expect(optionTexts()[1]).toContain('ASK');
  });

  it('records a query that fails too: it is the one the user wants back to fix', async () => {
    run.mockRejectedValueOnce(new Error('Parse error on line 1'));
    mount();

    await runQuery('SELECT WHERE {');

    expect(optionTexts()[0]).toContain('SELECT WHERE {');
  });

  it('does not record a blank query', async () => {
    mount();

    await runQuery('   ');

    expect(row().hidden).toBe(true);
  });

  it('puts the chosen query in the editor and does not run it', async () => {
    mount();
    await runQuery('ASK { ?s ?p ?o }');
    await runQuery('SELECT * WHERE { ?s ?p ?o }');
    run.mockClear();

    choose(1);

    expect(editor().value).toBe('ASK { ?s ?p ?o }');
    expect(run).not.toHaveBeenCalled();
    expect(select().value).toBe(''); // back on the placeholder, so the same entry can be chosen again
  });

  it('counts a chosen query as the user\'s own, so opening another ontology does not replace it', async () => {
    const tab = mount();
    await runQuery('ASK { ?s ?p ?o }');
    choose(0);

    prefixes = { other: 'http://example.org/other#' };
    tab.refresh();

    expect(editor().value).toBe('ASK { ?s ?p ?o }');
  });

  it('keeps each file\'s queries apart, and shows the right ones when another ontology is opened', async () => {
    const tab = mount();
    await runQuery('ASK { <http://a> ?p ?o }');

    key = 'ontology:http://example.org/other';
    tab.refresh();
    expect(row().hidden).toBe(true);
    await runQuery('ASK { <http://b> ?p ?o }');
    expect(optionTexts()).toHaveLength(1);
    expect(optionTexts()[0]).toContain('<http://b>');

    key = 'ontology:http://example.org/o';
    tab.refresh();
    expect(optionTexts()).toHaveLength(1);
    expect(optionTexts()[0]).toContain('<http://a>');
  });

  it('offers the queries of an earlier visit when the panel is drawn again for the same file', async () => {
    const first = mount();
    await runQuery('ASK { ?s ?p ?o }');
    first.refresh();
    document.body.replaceChildren();
    container = document.createElement('div');
    document.body.append(container);

    mount();

    expect(optionTexts()).toHaveLength(1);
    expect(optionTexts()[0]).toContain('ASK { ?s ?p ?o }');
  });

  it(`keeps the last ${HISTORY_LIMIT} queries`, async () => {
    mount();

    for (let i = 0; i < HISTORY_LIMIT + 3; i++) await runQuery(`ASK { ?s ?p "${i}" }`);

    expect(options()).toHaveLength(HISTORY_LIMIT);
    expect(optionTexts()[0]).toContain(`"${HISTORY_LIMIT + 2}"`);
  });

  it('clears the history of the open file, and only that', async () => {
    const memory = memoryHistory();
    history = memory;
    const tab = mount();
    await runQuery('ASK { <http://a> ?p ?o }');
    memory.save('ontology:http://example.org/other', [{ query: 'ASK { <http://b> ?p ?o }', at: 1 }]);

    clearButton().click();

    expect(row().hidden).toBe(true);
    expect(memory.load('ontology:http://example.org/o')).toEqual([]);
    expect(memory.load('ontology:http://example.org/other')).toHaveLength(1);
    tab.refresh();
    expect(row().hidden).toBe(true);
  });
});

describe('without a place to keep the history', () => {
  it('records nothing and shows nothing when the file has no key, and the query still runs', async () => {
    key = null;
    mount();

    await runQuery('ASK { ?s ?p ?o }');

    expect(run).toHaveBeenCalledTimes(1);
    expect(row().hidden).toBe(true);
  });

  it('works when the storage refuses to read and to write: the history then lasts for the session', async () => {
    history = localStorageHistory({
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    mount();

    await runQuery('ASK { ?s ?p ?o }');
    await runQuery('SELECT * WHERE { ?s ?p ?o }');

    expect(run).toHaveBeenCalledTimes(2);
    expect(optionTexts()).toHaveLength(2);
  });

  it('works when the panel is given no history at all (embedded or tested without one)', async () => {
    mount({ history: undefined, getHistoryKey: undefined });

    await runQuery('ASK { ?s ?p ?o }');

    expect(run).toHaveBeenCalledTimes(1);
    expect(row().hidden).toBe(true);
  });
});
