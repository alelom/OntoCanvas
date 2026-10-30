/**
 * The query tab of the side panel: write a SPARQL query, run it over the open ontology, see the result.
 * Read-only. The engine is loaded on the first Run, so opening the tab costs nothing extra.
 */

import type { Store } from 'n3';
import type { QueryResult, RunOptions } from '../../sparql/runQuery';
import { QueryStopped } from '../../sparql/readCapped';
import { prefixHeader, withStandardPrefixes } from '../../sparql/prefixHeader';
import { individualsOf } from '../../lib/instanceData';
import { describeResult, MAX_ROWS_SHOWN, type ResultView } from '../../sparql/resultView';
import { describeMatch, matchTableToGraph, type GraphIndex, type GraphMatch } from '../../sparql/graphMatches';
import { addToHistory, historyLabel, localStorageHistory, type HistoryEntry, type HistoryStore } from '../../sparql/queryHistory';
import type { DataSources } from '../../sparql/dataSources';
import type { DataLoader } from '../../sparql/dataLoader';
import type { SidePanelTab } from './sidePanelHost';
import { loadCodeMirrorEditor, mountTextarea, type LoadEditor, type QueryEditor } from './queryEditor';

export type RunQuery = (stores: Store[], query: string, options?: RunOptions) => Promise<QueryResult>;

export interface QueryTabDeps {
  getStore: () => Store | null;
  /** The prefixes the open file declares. */
  getPrefixes: () => Record<string, string>;
  /** Defaults to the lazily loaded engine. */
  run?: RunQuery;
  /** Fetches the CodeMirror editor that replaces the plain textarea. Defaults to the lazily loaded one. */
  loadEditor?: LoadEditor;
  /** Where the queries run on a file are kept (#182). Defaults to the browser's local storage. */
  history?: HistoryStore;
  /** What the open file's history is kept under (its ontology IRI); null, or absent, means nothing is recorded. */
  getHistoryKey?: () => string | null;
  /** What the graph draws now, to match a result against (#203); null when nothing is drawn. Without it, no "Show in graph". */
  getGraph?: () => GraphIndex | null;
  /** Selects these nodes and edges in the graph and brings them into view. */
  showInGraph?: (match: GraphMatch) => void;
  /** The data added to the open ontology (#205): queries run over it too, and a line says so. */
  dataSources?: DataSources;
  /** The loading of that data (#211): its status is shown in the same line, as an address's ?data= loads it in this tab. */
  dataLoader?: DataLoader;
  /** Opens the Individuals tab, where the data is added and removed (#211). */
  openIndividuals?: () => void;
}

export interface QueryTab extends SidePanelTab {
  /** Another ontology was opened: refresh the prefixes of a query the user has not edited. */
  refresh(): void;
}

const lazyRun: RunQuery = (stores, query, options) => import('../../sparql/runQuery').then((m) => m.runQuery(stores, query, options));

export const CLASSES_STARTER_QUERY = `SELECT ?class ?label
WHERE {
  ?class a owl:Class .
  OPTIONAL { ?class rdfs:label ?label }
}
ORDER BY ?class
LIMIT 100`;

/** For a file with instance data, which the graph does not draw: its individuals with their classes (the vocabularies' own types left out). */
export const INDIVIDUALS_STARTER_QUERY = `SELECT ?individual ?class
WHERE {
  ?individual a ?class .
  FILTER (!STRSTARTS(STR(?class), STR(owl:)) && !STRSTARTS(STR(?class), STR(rdfs:)))
}
ORDER BY ?class ?individual
LIMIT 100`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderTable(view: Extract<ResultView, { kind: 'table' }>): HTMLElement {
  const table = element('table', 'query-results');
  const headRow = element('tr');
  for (const column of view.columns) headRow.append(element('th', undefined, `?${column}`));
  const head = element('thead');
  head.append(headRow);
  table.append(head);

  const body = element('tbody');
  for (const row of view.rows) {
    const tr = element('tr');
    for (const cell of row) {
      const inFull = cell?.kind === 'iri' && cell.text.startsWith('<');
      const td = element('td', cell ? `term-${cell.kind}${inFull ? ' term-iri-full' : ''}` : 'term-unbound', cell?.text ?? '');
      if (cell) td.title = cell.title;
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  return table;
}

export function createQueryTab(deps: QueryTabDeps): QueryTab {
  const run = deps.run ?? lazyRun;
  let editor: QueryEditor | null = null;
  let edited = false;
  let prefixNote: HTMLElement | null = null;
  let stop: (() => void) | null = null;
  /** The prefixes the query's text was written with (the starter's header); the note compares the open file's to them. */
  let headerPrefixes = JSON.stringify(deps.getPrefixes());

  // The history of the open file (#182). `entries` is what is shown, newest first; it is also kept when the storage fails,
  // so a history that cannot be saved still lasts for the session.
  const history = deps.history ?? localStorageHistory();
  let historyRow: HTMLElement | null = null;
  let historySelect: HTMLSelectElement | null = null;
  let entries: HistoryEntry[] = [];
  let loadedKey: string | null | undefined;

  /** Loads the history of the file that is open now, when it is not the one already loaded. */
  function syncHistory(): string | null {
    const key = deps.getHistoryKey?.() ?? null;
    if (key !== loadedKey) {
      loadedKey = key;
      entries = key ? history.load(key) : [];
    }
    return key;
  }

  function renderHistory(): void {
    if (!historyRow || !historySelect) return;
    historyRow.hidden = entries.length === 0;
    const placeholder = element('option', undefined, `History (${entries.length})`);
    placeholder.value = '';
    const items = entries.map((entry, index) => {
      const option = element('option', undefined, historyLabel(entry));
      option.value = String(index);
      option.title = entry.query.slice(0, 500);
      return option;
    });
    historySelect.replaceChildren(placeholder, ...items);
  }

  function recordRun(query: string): void {
    const key = syncHistory();
    if (!key) return;
    const next = addToHistory(entries, query, Date.now());
    if (next === entries) return;
    entries = next;
    history.save(key, entries);
    renderHistory();
  }

  const starterText = () => {
    headerPrefixes = JSON.stringify(deps.getPrefixes());
    const store = deps.getStore();
    const starter = store && individualsOf(store).size > 0 ? INDIVIDUALS_STARTER_QUERY : CLASSES_STARTER_QUERY;
    return `${prefixHeader(deps.getPrefixes())}\n\n${starter}`;
  };

  /** The "Show in graph" button above a table that names drawn classes or relationships; nothing when it names none (#203). */
  function showInGraphRow(view: Extract<ResultView, { kind: 'table' }>): HTMLElement[] {
    const graph = deps.getGraph?.();
    if (!graph || !deps.showInGraph) return [];
    const match = matchTableToGraph(view, graph);
    if (!match.nodeIds.length && !match.edgeIds.length) return [];
    const button = element('button', undefined, `Show in graph (${describeMatch(match)})`);
    button.type = 'button';
    button.title = match.allEdgesOfAProperty
      ? 'Select these in the graph and bring them into view. A property named without the two ends of an edge selects every edge that uses it.'
      : 'Select these in the graph and bring them into view';
    button.setAttribute('data-query-show-in-graph', '');
    button.addEventListener('click', () => deps.showInGraph!(match));
    return [button];
  }

  /**
   * One line about the data added to the ontology (#211): the queries run over it, where it is managed, and the status of a
   * read going on (an address's ?data= loads its files while this is the tab shown). Nothing when there is nothing to say.
   */
  function renderDataSummary(): HTMLElement | null {
    const sources = deps.dataSources;
    if (!sources) return null;
    const line = element('div', 'query-note query-data-summary');
    line.setAttribute('data-query-data-summary', '');
    const text = element('span');
    text.setAttribute('data-query-data-text', '');
    const manage = element('button', undefined, 'manage in Individuals');
    manage.type = 'button';
    manage.setAttribute('data-query-data-manage', '');
    manage.addEventListener('click', () => deps.openIndividuals?.());
    const status = element('span');
    status.setAttribute('data-query-data-status', '');
    status.setAttribute('aria-live', 'polite');
    const cancel = element('button', undefined, 'Cancel');
    cancel.type = 'button';
    cancel.setAttribute('data-query-data-cancel', '');
    cancel.addEventListener('click', () => deps.dataLoader?.cancel());
    line.append(text, ' ', manage, ' ', status, ' ', cancel);

    const draw = (): void => {
      const added = sources.list().length;
      const said = deps.dataLoader?.status() ?? '';
      text.textContent = added ? `Querying the ontology and ${plural(added, 'data file', 'data files')}.` : '';
      manage.hidden = added === 0;
      status.textContent = said;
      cancel.hidden = !deps.dataLoader?.loading();
      line.hidden = added === 0 && said === '';
    };
    sources.onChange(draw);
    deps.dataLoader?.onChange(draw);
    draw();
    return line;
  }

  function render(container: HTMLElement): void {
    container.classList.add('query-tab');
    const note = element(
      'p',
      'query-note',
      "Queries are read-only and run over the open ontology's own triples. Classes shown from external ontologies (faded stubs) are not part of that data. Ctrl+Enter runs the query."
    );

    prefixNote = element(
      'p',
      'query-note query-prefix-note',
      'The file you opened declares other prefixes than the ones in your query, so a name like :Room may not match. Edit the PREFIX lines to match.'
    );
    prefixNote.setAttribute('data-prefix-note', '');
    prefixNote.hidden = true;

    // The queries run on this file: choosing one puts it in the editor (it does not run it, and counts as the user's own query).
    historyRow = element('div', 'query-history');
    historyRow.setAttribute('data-query-history-row', '');
    historySelect = element('select');
    historySelect.setAttribute('data-query-history', '');
    historySelect.setAttribute('aria-label', 'Query history');
    const clearHistory = element('button', undefined, 'Clear');
    clearHistory.type = 'button';
    clearHistory.title = 'Forget the queries run on this ontology';
    clearHistory.setAttribute('data-query-history-clear', '');
    historyRow.append(historySelect, clearHistory);
    historySelect.addEventListener('change', () => {
      const chosen = entries[Number(historySelect!.value)];
      historySelect!.value = '';
      if (!chosen || !editor) return;
      edited = true;
      editor.setText(chosen.query);
      updatePrefixNote();
      editor.focus();
    });
    clearHistory.addEventListener('click', () => {
      const key = syncHistory();
      if (key) history.clear(key);
      entries = [];
      renderHistory();
    });
    syncHistory();
    renderHistory();

    const editorHost = element('div', 'query-editor');
    editorHost.setAttribute('data-query-editor', '');
    const hooks = {
      onChange: () => {
        edited = true;
      },
      onRun: () => void execute(),
    };
    editor = mountTextarea(editorHost, starterText(), hooks);

    // The textarea is usable at once. CodeMirror replaces it when its chunk arrives, with whatever was typed meanwhile;
    // if it cannot be fetched the textarea simply stays.
    void (deps.loadEditor ?? loadCodeMirrorEditor)()
      .then((mount) => {
        const text = editor!.getText();
        const hadFocus = editorHost.contains(document.activeElement);
        const selection = editor!.getSelection();
        editorHost.replaceChildren();
        editor = mount(editorHost, text, hooks, selection);
        editorHost.setAttribute('data-editor', 'codemirror');
        if (hadFocus) editor.focus();
      })
      .catch(() => editorHost.setAttribute('data-editor', 'textarea'));

    const runButton = element('button', 'primary', 'Run');
    runButton.type = 'button';
    runButton.setAttribute('data-query-run', '');
    const stopButton = element('button', undefined, 'Stop');
    stopButton.type = 'button';
    stopButton.hidden = true;
    stopButton.setAttribute('data-query-stop', '');
    const status = element('span', 'query-status');
    status.setAttribute('data-query-status', '');
    status.setAttribute('aria-live', 'polite');
    const actions = element('div', 'query-actions');
    actions.append(runButton, stopButton, status);

    const result = element('div', 'query-result');
    result.setAttribute('data-query-result', '');

    async function execute(): Promise<void> {
      if (runButton.disabled) return;
      result.replaceChildren();
      const showError = (message: string) => {
        const box = element('div', 'query-error', message);
        box.setAttribute('data-query-error', '');
        box.setAttribute('role', 'alert');
        result.replaceChildren(box);
        status.textContent = '';
      };

      const store = deps.getStore();
      if (!store) {
        showError('Open an ontology first: there is nothing to query yet.');
        return;
      }

      recordRun(editor!.getText());
      runButton.disabled = true;
      stopButton.hidden = false;
      status.textContent = 'Running…';
      const stopper = new AbortController();
      stop = () => stopper.abort();
      const started = performance.now();
      try {
        // Only the rows shown are read from the engine (one more, to know there are more): a forgotten join must not
        // build hundreds of thousands of rows in memory.
        const rows = await run([store, ...(deps.dataSources?.stores() ?? [])], editor!.getText(), { limit: MAX_ROWS_SHOWN, signal: stopper.signal });
        if (deps.getStore() !== store) {
          status.textContent = 'Another ontology was opened while the query ran, so its result was dropped. Run it again.';
          return;
        }
        const view = await describeResult(rows, withStandardPrefixes(deps.getPrefixes()));
        const took = `${Math.round(performance.now() - started)} ms`;

        if (view.kind === 'table') {
          result.replaceChildren(...showInGraphRow(view), renderTable(view));
          status.textContent = view.truncated
            ? `The first ${MAX_ROWS_SHOWN} rows in ${took}; there are more`
            : `${plural(view.rows.length, 'row', 'rows')} in ${took}`;
        } else if (view.kind === 'boolean') {
          result.replaceChildren(element('p', 'query-boolean', String(view.value)));
          status.textContent = `Answered in ${took}`;
        } else {
          result.replaceChildren(element('pre', 'query-turtle', view.text));
          status.textContent = view.truncated
            ? `The first ${plural(view.count, 'triple', 'triples')} in ${took}; there are more`
            : `${plural(view.count, 'triple', 'triples')} in ${took}`;
        }
      } catch (error) {
        if (error instanceof QueryStopped) status.textContent = 'Stopped.';
        else showError(error instanceof Error ? error.message : String(error));
      } finally {
        stop = null;
        stopButton.hidden = true;
        runButton.disabled = false;
      }
    }

    runButton.addEventListener('click', () => void execute());
    stopButton.addEventListener('click', () => stop?.());
    const dataSummary = renderDataSummary();
    container.append(note, ...(dataSummary ? [dataSummary] : []), prefixNote, historyRow, editorHost, actions, result);
  }

  /** An edited query keeps its own PREFIX lines; say so when the open file's differ from them. */
  function updatePrefixNote(): void {
    if (prefixNote) prefixNote.hidden = !edited || JSON.stringify(deps.getPrefixes()) === headerPrefixes;
  }

  return {
    id: 'query',
    title: 'Query',
    render,
    refresh() {
      // The data belongs to the ontology it was added to.
      deps.dataLoader?.reset();
      deps.dataSources?.clear();
      if (!editor) return;
      if (!edited) editor.setText(starterText());
      updatePrefixNote();
      // Another ontology: its own queries.
      syncHistory();
      renderHistory();
    },
  };
}
