// @vitest-environment jsdom
/**
 * A CONSTRUCT result in the Query tab can be added to the data (#253), and queries run over the ontologies read as context.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataFactory, Store } from 'n3';
import { createQueryTab } from '../../src/ui/sidePanel/queryTab';
import { createDataSources, type DataSources } from '../../src/sparql/dataSources';
import { MAX_RESULT_TRIPLES, RESULT_GRAPH } from '../../src/sparql/addQueryResult';
import type { QueryResult } from '../../src/sparql/runQuery';

const { quad, namedNode, literal, defaultGraph } = DataFactory;
const NS = 'http://example.org/p#';
const triple = (s: string, o: string) => quad(namedNode(NS + s), namedNode(NS + 'accepted'), literal(o), defaultGraph());
const construct: QueryResult = { kind: 'quads', quads: [triple('d1', 'A-102'), triple('d2', 'B-7')], truncated: false };
const rows: QueryResult = { kind: 'bindings', variables: ['s'], rows: [{ s: namedNode(NS + 'd1') }], truncated: false };

const STORE = new Store();
const CONTEXT = new Store();
let container: HTMLElement;
let sources: DataSources;
let run: ReturnType<typeof vi.fn>;

function mount(result: QueryResult, withSources = true): void {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  localStorage.clear();
  sources = createDataSources();
  run = vi.fn().mockResolvedValue(result);
  createQueryTab({
    getStore: () => STORE,
    getPrefixes: () => ({ '': NS }),
    run,
    loadEditor: () => new Promise<never>(() => {}),
    ...(withSources ? { dataSources: sources, getContextStores: () => [CONTEXT] } : {}),
  }).render(container);
}

async function execute(): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>('[data-query-run]')!;
  button.click();
  await vi.waitFor(() => expect(button.disabled).toBe(false));
}

const addButton = () => container.querySelector<HTMLButtonElement>('[data-query-add-result]');
const status = () => container.querySelector('[data-query-status]')?.textContent ?? '';

describe('queries run over the ontologies read as context', () => {
  it('runs over the ontology, the context, then the data', async () => {
    mount(rows);
    sources.addQuads('x', [triple('a', 'b')]);

    await execute();

    expect(run.mock.calls[0][0]).toEqual([STORE, CONTEXT, ...sources.stores()]);
  });
});

describe('Add result to the data', () => {
  beforeEach(() => mount(construct));

  it('is offered under a CONSTRUCT result only, and only where data can be added', async () => {
    expect(addButton()).toBeNull();
    await execute();
    expect(addButton()).not.toBeNull();

    mount(rows);
    await execute();
    expect(addButton()).toBeNull();

    mount(construct, false);
    await execute();
    expect(addButton()).toBeNull();
  });

  it('runs the query again over the same stores with the cap, adds the result in the result graph, and says so', async () => {
    await execute();
    run.mockClear();

    addButton()!.click();
    await vi.waitFor(() => expect(sources.list()).toHaveLength(1));

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toEqual([STORE, CONTEXT]);
    expect(run.mock.calls[0][2]).toMatchObject({ limit: MAX_RESULT_TRIPLES });
    expect(sources.graphs().map((g) => g.iri)).toEqual([RESULT_GRAPH]);
    await vi.waitFor(() => expect(status()).toMatch(/^Added 2 triples to the data/));
  });

  it('says why when the result cannot be added, and adds nothing', async () => {
    await execute();
    run.mockResolvedValue({ ...construct, truncated: true });

    addButton()!.click();

    await vi.waitFor(() => expect(container.querySelector('[data-query-error]')?.textContent).toMatch(/more than 200,000 triples: not added/));
    expect(sources.list()).toEqual([]);
  });
});
