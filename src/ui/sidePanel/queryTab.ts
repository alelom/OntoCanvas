/**
 * The query tab of the side panel: write a SPARQL query, run it over the open ontology, see the result.
 * Read-only. The engine is loaded on the first Run, so opening the tab costs nothing extra.
 */

import type { Store } from 'n3';
import type { QueryResult } from '../../sparql/runQuery';
import { prefixHeader, withStandardPrefixes } from '../../sparql/prefixHeader';
import { describeResult, MAX_ROWS_SHOWN, type ResultView } from '../../sparql/resultView';
import type { SidePanelTab } from './sidePanelHost';

export type RunQuery = (stores: Store[], query: string) => Promise<QueryResult>;

export interface QueryTabDeps {
  getStore: () => Store | null;
  /** The prefixes the open file declares. */
  getPrefixes: () => Record<string, string>;
  /** Defaults to the lazily loaded engine. */
  run?: RunQuery;
}

export interface QueryTab extends SidePanelTab {
  /** Another ontology was opened: refresh the prefixes of a query the user has not edited. */
  refresh(): void;
}

const lazyRun: RunQuery = (stores, query) => import('../../sparql/runQuery').then((m) => m.runQuery(stores, query));

const STARTER_QUERY = `SELECT ?class ?label
WHERE {
  ?class a owl:Class .
  OPTIONAL { ?class rdfs:label ?label }
}
ORDER BY ?class
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
  let editor: HTMLTextAreaElement | null = null;
  let edited = false;

  const starterText = () => `${prefixHeader(deps.getPrefixes())}\n\n${STARTER_QUERY}`;

  function render(container: HTMLElement): void {
    container.classList.add('query-tab');
    const note = element(
      'p',
      'query-note',
      "Queries are read-only and run over the open ontology's own triples. Classes shown from external ontologies (faded stubs) are not part of that data. Ctrl+Enter runs the query."
    );

    editor = element('textarea', 'query-editor');
    editor.setAttribute('data-query-editor', '');
    editor.spellcheck = false;
    editor.rows = 12;
    editor.value = starterText();
    editor.addEventListener('input', () => {
      edited = true;
    });

    const runButton = element('button', 'primary', 'Run');
    runButton.type = 'button';
    runButton.setAttribute('data-query-run', '');
    const status = element('span', 'query-status');
    status.setAttribute('data-query-status', '');
    status.setAttribute('aria-live', 'polite');
    const actions = element('div', 'query-actions');
    actions.append(runButton, status);

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

      runButton.disabled = true;
      status.textContent = 'Running…';
      const started = performance.now();
      try {
        const prefixes = withStandardPrefixes(deps.getPrefixes());
        const view = await describeResult(await run([store], editor!.value), prefixes);
        const took = `${Math.round(performance.now() - started)} ms`;

        if (view.kind === 'table') {
          result.replaceChildren(renderTable(view));
          status.textContent = view.truncated
            ? `${plural(view.total, 'row', 'rows')} in ${took}; showing the first ${MAX_ROWS_SHOWN}`
            : `${plural(view.total, 'row', 'rows')} in ${took}`;
        } else if (view.kind === 'boolean') {
          result.replaceChildren(element('p', 'query-boolean', String(view.value)));
          status.textContent = `Answered in ${took}`;
        } else {
          result.replaceChildren(element('pre', 'query-turtle', view.text));
          status.textContent = `${plural(view.count, 'triple', 'triples')} in ${took}`;
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      } finally {
        runButton.disabled = false;
      }
    }

    runButton.addEventListener('click', () => void execute());
    editor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void execute();
      }
    });

    container.append(note, editor, actions, result);
  }

  return {
    id: 'query',
    title: 'Query',
    render,
    refresh() {
      if (editor && !edited) editor.value = starterText();
    },
  };
}
