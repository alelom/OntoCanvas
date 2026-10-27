// @vitest-environment jsdom
/**
 * The query tab's guard rails (#180): a running query can be stopped, a result that arrives after another ontology
 * was opened is dropped, and a query the user edited says when the new file's prefixes differ from its own.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store, DataFactory } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import { QueryStopped } from '../../src/sparql/readCapped';
import type { QueryResult, RunOptions } from '../../src/sparql/runQuery';

const { namedNode } = DataFactory;
const iri = (s: string) => namedNode(`http://example.org/o#${s}`);

let container: HTMLElement;
let store: Store | null;
let prefixes: Record<string, string>;
let run: ReturnType<typeof vi.fn>;

const neverLoads = () => new Promise<never>(() => {});
const mount = () => {
  const tab = createQueryTab({ getStore: () => store, getPrefixes: () => prefixes, run: (...a) => run(...a), loadEditor: neverLoads });
  tab.render(container);
  return tab;
};
const editor = () => container.querySelector<HTMLTextAreaElement>('[data-query-editor] textarea')!;
const runButton = () => container.querySelector<HTMLButtonElement>('[data-query-run]')!;
const stopButton = () => container.querySelector<HTMLButtonElement>('[data-query-stop]')!;
const status = () => container.querySelector<HTMLElement>('[data-query-status]')!.textContent ?? '';
const prefixNote = () => container.querySelector<HTMLElement>('[data-prefix-note]');
const table = (): QueryResult => ({ kind: 'bindings', variables: ['c'], rows: [{ c: iri('A') }], truncated: false });

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.append(container);
  store = new Store();
  prefixes = { '': 'http://example.org/o#' };
  run = vi.fn();
});

describe('Stop', () => {
  it('is hidden until a query runs, and replaces Run while it does', async () => {
    let finish!: (r: QueryResult) => void;
    run.mockReturnValue(new Promise<QueryResult>((resolve) => { finish = resolve; }));
    mount();
    expect(stopButton().hidden).toBe(true);

    runButton().click();
    await vi.waitFor(() => expect(stopButton().hidden).toBe(false));
    expect(runButton().disabled).toBe(true);

    finish(table());
    await vi.waitFor(() => expect(runButton().disabled).toBe(false));
    expect(stopButton().hidden).toBe(true);
  });

  it('aborts the query it started, and says it was stopped, without an error box', async () => {
    let seen: RunOptions | undefined;
    run.mockImplementation((_stores: Store[], _q: string, options: RunOptions) => {
      seen = options;
      return new Promise<QueryResult>((_, reject) => options.signal!.addEventListener('abort', () => reject(new QueryStopped())));
    });
    mount();

    runButton().click();
    await vi.waitFor(() => expect(stopButton().hidden).toBe(false));
    stopButton().click();
    await vi.waitFor(() => expect(runButton().disabled).toBe(false));

    expect(seen?.signal?.aborted).toBe(true);
    expect(status()).toMatch(/stopped/i);
    expect(container.querySelector('[data-query-error]')).toBeNull();
  });
});

describe('a result that arrives after another ontology was opened', () => {
  it('is dropped, with a note to run the query again', async () => {
    let finish!: (r: QueryResult) => void;
    run.mockReturnValue(new Promise<QueryResult>((resolve) => { finish = resolve; }));
    mount();

    runButton().click();
    await vi.waitFor(() => expect(stopButton().hidden).toBe(false));
    store = new Store(); // another ontology was opened meanwhile
    finish(table());
    await vi.waitFor(() => expect(runButton().disabled).toBe(false));

    expect(container.querySelector('tbody')).toBeNull();
    expect(status()).toMatch(/another ontology|run it again/i);
  });

  it('is shown when the ontology is still the same', async () => {
    run.mockResolvedValue(table());
    mount();
    runButton().click();
    await vi.waitFor(() => expect(container.querySelector('tbody tr')).not.toBeNull());
  });
});

describe('the prefix note', () => {
  it('stays away while the query is the starter one, which follows the file', () => {
    const tab = mount();
    prefixes = { x: 'http://x/#' };
    tab.refresh();
    expect(prefixNote()?.hidden ?? true).toBe(true);
    expect(editor().value).toContain('PREFIX x: <http://x/#>');
  });

  it('appears when the user has edited the query and a newly opened file declares other prefixes', () => {
    const tab = mount();
    editor().value += '\n# mine';
    editor().dispatchEvent(new Event('input'));

    prefixes = { '': 'http://other.org/#' };
    tab.refresh();

    expect(prefixNote()?.hidden).toBe(false);
    expect(prefixNote()?.textContent).toMatch(/prefix/i);
    expect(editor().value).toContain('# mine');
    expect(editor().value).not.toContain('http://other.org/#');
  });

  it('does not appear when the new file declares the same prefixes', () => {
    const tab = mount();
    editor().dispatchEvent(new Event('input'));
    tab.refresh();
    expect(prefixNote()?.hidden ?? true).toBe(true);
  });
});
