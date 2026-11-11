// @vitest-environment jsdom
/**
 * A query result shown in the graph by itself (#207): after each Run, outlined and in view, said in the status line with a
 * Clear; not when nothing or everything matches, nor above the cap; a checkbox turns it off, remembered in the browser.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store, DataFactory } from 'n3';
import { createQueryTab, type QueryTabDeps } from '../../src/ui/sidePanel/queryTab';
import type { GraphIndex } from '../../src/sparql/graphMatches';
import type { QueryResult } from '../../src/sparql/runQuery';
import { decideShow, type ResultMatcher } from '../../src/graph/resultHighlight';

const NS = 'http://example.org/r#';
const STORE = new Store();
const { namedNode } = DataFactory;
const I = (name: string) => `__individual__${NS}${name}`;

let container: HTMLElement;
let names: string[];
const graph: GraphIndex = {
  nodes: [
    { id: 'TextReading', uri: NS + 'TextReading' },
    { id: I('reading2'), uri: NS + 'reading2', kind: 'individual' },
    { id: I('reading4'), uri: NS + 'reading4', kind: 'individual' },
  ],
  edges: [],
  objectProperties: [],
};
const showResult = vi.fn((matcher: ResultMatcher) => decideShow(matcher(graph), graph));
const clearResult = vi.fn();

function mount(): ReturnType<typeof createQueryTab> {
  const deps: QueryTabDeps = {
    getStore: () => STORE,
    getPrefixes: () => ({ '': NS }),
    run: async () => ({ kind: 'bindings', variables: ['r'], rows: names.map((n) => ({ r: namedNode(NS + n) })), truncated: false }) as unknown as QueryResult,
    loadEditor: () => new Promise<never>(() => {}),
    getGraph: () => graph,
    showInGraph: () => {},
    showResult,
    clearResult,
  };
  const tab = createQueryTab(deps);
  tab.render(container);
  return tab;
}
const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector);
async function runQuery(): Promise<void> {
  q<HTMLButtonElement>('[data-query-run]')!.click();
  await vi.waitFor(() => expect(q<HTMLButtonElement>('[data-query-run]')!.disabled).toBe(false));
}

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  showResult.mockClear();
  clearResult.mockClear();
  localStorage.clear();
  names = ['reading2'];
});

describe('a result shown in the graph', () => {
  it('is shown after Run, and the status line says what is outlined, with a Clear', async () => {
    mount();

    await runQuery();

    expect(showResult).toHaveBeenCalledTimes(1);
    expect(q('[data-query-shown]')!.textContent).toBe('1 individual outlined in the graph. Clear');
    q<HTMLButtonElement>('[data-query-shown-clear]')!.click();
    expect(clearResult).toHaveBeenCalled();
    expect(q('[data-query-shown]')).toBeNull();
  });

  it('clears the last one before each run', async () => {
    mount();
    await runQuery();
    clearResult.mockClear();

    await runQuery();

    expect(clearResult).toHaveBeenCalled();
  });

  it('says nothing when the result names everything drawn, or nothing', async () => {
    names = ['TextReading', 'reading2', 'reading4'];
    mount();
    await runQuery();
    expect(q('[data-query-shown]')).toBeNull();

    names = ['nothing'];
    await runQuery();
    expect(q('[data-query-shown]')).toBeNull();
  });

  it('is off with the checkbox, which is remembered, and unticking it clears what is shown', async () => {
    mount();
    await runQuery();
    const box = q<HTMLInputElement>('[data-query-show-results]')!;
    expect(box.checked).toBe(true);

    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(clearResult).toHaveBeenCalled();
    expect(q('[data-query-shown]')).toBeNull();

    showResult.mockClear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    mount();
    expect(q<HTMLInputElement>('[data-query-show-results]')!.checked).toBe(false);
    await runQuery();
    expect(showResult).not.toHaveBeenCalled();
  });

  it('is cleared when another ontology is opened', async () => {
    const tab = mount();
    await runQuery();
    clearResult.mockClear();

    tab.refresh();

    expect(clearResult).toHaveBeenCalled();
    expect(q('[data-query-shown]')).toBeNull();
  });
});
