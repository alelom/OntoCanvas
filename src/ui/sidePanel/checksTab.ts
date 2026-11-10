/**
 * The Checks tab of the side panel (#231): SHACL shapes loaded into the library of the session, run over the open ontology and
 * the data added to it, and the report. Read-only. The validator is loaded on the first run.
 */
import { DataFactory, type Store } from 'n3';
import type { ChecksLibrary } from '../../checks/checksLibrary';
import { validateShapes, type CheckReport, type CheckResult, type CheckTerm, type ValidateOptions } from '../../checks/validateShapes';
import { countsText, groupByShape, pathText, reportSummary } from '../../checks/checksReport';
import { QueryStopped } from '../../sparql/readCapped';
import { formatTerm } from '../../sparql/formatTerm';
import { withStandardPrefixes } from '../../sparql/prefixHeader';
import type { SidePanelTab } from './sidePanelHost';
import { renderChecksLoader } from './checksLoader';

export type Validate = (shapes: Store, data: Store[], options?: ValidateOptions) => Promise<CheckReport>;

export interface ChecksTabDeps {
  library: ChecksLibrary;
  /** The open ontology's store and the data added to it, every graph: what the shapes check. */
  getStores: () => Store[];
  getPrefixes: () => Record<string, string>;
  /** Whether a focus node is an individual, whose card it then opens (#229). */
  isIndividual?: (iri: string) => boolean;
  openIndividual?: (iri: string) => void;
  /** Defaults to shacl-engine, loaded on the first run. */
  validate?: Validate;
}

export interface ChecksTab extends SidePanelTab {
  /** Another ontology was opened: the report was about the one before. */
  refresh(): void;
}

/** A report with thousands of results (a shape that fails on every individual) shows the first ones. */
export const MAX_RESULTS_SHOWN = 500;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

const toStoreTerm = (term: CheckTerm) =>
  term.termType === 'Literal'
    ? DataFactory.literal(term.value, term.language || (term.datatype ? DataFactory.namedNode(term.datatype) : undefined))
    : term.termType === 'BlankNode'
      ? DataFactory.blankNode(term.value)
      : DataFactory.namedNode(term.value);

export function createChecksTab(deps: ChecksTabDeps): ChecksTab {
  const run = deps.validate ?? validateShapes;
  let result: HTMLElement | null = null;
  let status: HTMLElement | null = null;

  // The shapes are named with their own prefixes too (shapes:Reading), the open file's winning a prefix both declare.
  const formatted = (term: CheckTerm) => formatTerm(toStoreTerm(term), withStandardPrefixes({ ...deps.library.shapesPrefixes(), ...deps.getPrefixes() }));
  const nameOf = (iri: string) => formatted({ termType: 'NamedNode', value: iri }).text;

  /** A term of the report: an individual opens its card; anything else is shown. */
  function renderTerm(term: CheckTerm): HTMLElement {
    const { text, title, kind } = formatted(term);
    if (term.termType === 'NamedNode' && deps.openIndividual && deps.isIndividual?.(term.value)) {
      const open = element('button', 'individual-follow', text);
      open.type = 'button';
      open.title = `${term.value}: open the card of this individual`;
      open.setAttribute('data-checks-open', '');
      open.addEventListener('click', () => deps.openIndividual!(term.value));
      return open;
    }
    const span = element('span', `term-${kind}`, text);
    span.title = title;
    return span;
  }

  function renderResult(r: CheckResult): HTMLElement {
    const item = element('li', `checks-result checks-${r.severity.toLowerCase()}`);
    item.setAttribute('data-checks-result', '');
    item.setAttribute('data-severity', r.severity);
    const head = element('div', 'checks-result-head');
    head.append(element('span', 'checks-severity', r.severity), renderTerm(r.focusNode));
    if (r.path) {
      const path = element('span', 'checks-path', pathText(r.path, nameOf));
      path.title = 'The path the constraint is on';
      head.append(path);
    }
    if (r.value) head.append(element('span', 'checks-value-label', '='), renderTerm(r.value));
    const message = element('div', 'checks-message', r.message || r.constraint);
    message.title = r.constraint;
    item.append(head, message);
    return item;
  }

  function renderReport(report: CheckReport): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (report.notChecked.length) {
      const note = element('div', 'query-note checks-not-checked');
      note.setAttribute('data-checks-not-checked', '');
      note.append(
        `${plural(report.notChecked.length, 'shape uses', 'shapes use')} SPARQL-based constraints or targets and ${report.notChecked.length === 1 ? 'was' : 'were'} not checked (one query per focus node is too slow in the browser): `,
        ...report.notChecked.flatMap((shape, i) => [...(i ? [', '] : []), renderTerm(shape)])
      );
      parts.push(note);
    }
    let shown = 0;
    for (const group of groupByShape(report.results)) {
      if (shown >= MAX_RESULTS_SHOWN) break;
      const section = element('details', 'checks-shape');
      section.open = true;
      section.setAttribute('data-checks-shape', '');
      const summary = element('summary');
      summary.append(renderTerm(group.shape), ` (${countsText(group.counts)})`);
      const list = element('ul', 'checks-results');
      const take = group.results.slice(0, MAX_RESULTS_SHOWN - shown);
      shown += take.length;
      list.append(...take.map(renderResult));
      section.append(summary, list);
      parts.push(section);
    }
    if (report.results.length > shown) parts.push(element('p', 'query-note', `The first ${MAX_RESULTS_SHOWN} of ${report.results.length} results are shown.`));
    return parts;
  }

  function renderShapesList(): HTMLElement {
    const list = element('ul', 'checks-shapes-files');
    list.setAttribute('data-checks-shapes-files', '');
    const draw = (): void => {
      list.replaceChildren(
        ...deps.library.shapesFiles().map((file) => {
          const item = element('li');
          item.setAttribute('data-checks-shapes-file', '');
          const name = element('span', 'checks-file-name', file.name);
          name.title = file.source;
          const remove = element('button', undefined, 'Remove');
          remove.type = 'button';
          remove.setAttribute('data-checks-remove', '');
          remove.addEventListener('click', () => deps.library.removeShapes(file.source));
          item.append(name, ` ${plural(file.shapeCount, 'shape', 'shapes')}${file.group ? ` (${file.group})` : ''} `, remove);
          return item;
        })
      );
    };
    deps.library.onChange(draw);
    draw();
    return list;
  }

  function render(container: HTMLElement): void {
    container.classList.add('checks-tab');
    const note = element(
      'p',
      'query-note panel-description',
      'Checks the open ontology and the data added to it against SHACL shapes: every graph, each triple once. Read-only. A manifest loads the queries of the Query tab too.'
    );
    const loading = element('details', 'checks-load');
    loading.open = deps.library.shapesFiles().length === 0;
    loading.append(element('summary', undefined, 'Load shapes…'), renderChecksLoader(deps.library, { label: 'From' }));

    const runButton = element('button', 'primary', 'Run checks');
    runButton.type = 'button';
    runButton.setAttribute('data-checks-run', '');
    const stopButton = element('button', undefined, 'Stop');
    stopButton.type = 'button';
    stopButton.hidden = true;
    stopButton.setAttribute('data-checks-stop', '');
    status = element('span', 'query-status');
    status.setAttribute('data-checks-status', '');
    status.setAttribute('aria-live', 'polite');
    const actions = element('div', 'query-actions');
    actions.append(runButton, stopButton, status);
    result = element('div', 'checks-report');
    result.setAttribute('data-checks-report', '');

    const enable = (): void => {
      runButton.disabled = deps.library.shapesFiles().length === 0 || !stopButton.hidden;
      runButton.title = runButton.disabled && stopButton.hidden ? 'Load shapes first' : 'Check the ontology and its data against the shapes loaded';
    };
    deps.library.onChange(() => {
      enable();
      if (deps.library.shapesFiles().length) loading.open = false;
    });
    enable();

    let stopper: AbortController | null = null;
    stopButton.addEventListener('click', () => stopper?.abort());
    runButton.addEventListener('click', async () => {
      const stores = deps.getStores();
      if (!stores.length) {
        status!.textContent = 'Open an ontology or add data first: there is nothing to check yet.';
        return;
      }
      stopper = new AbortController();
      stopButton.hidden = false;
      enable();
      result!.replaceChildren();
      const started = performance.now();
      try {
        const report = await run(deps.library.shapes(), stores, {
          signal: stopper.signal,
          onProgress: (done, total) => (status!.textContent = `Checking shape ${Math.min(done + 1, total)} of ${total}…`),
        });
        status!.textContent = reportSummary(report, `${Math.round(performance.now() - started)} ms`);
        result!.replaceChildren(...renderReport(report));
      } catch (error) {
        status!.textContent = error instanceof QueryStopped ? 'Stopped.' : `The check failed: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        stopper = null;
        stopButton.hidden = true;
        enable();
      }
    });

    container.append(note, loading, renderShapesList(), actions, result);
  }

  return {
    id: 'checks',
    title: 'Checks',
    render,
    refresh() {
      result?.replaceChildren();
      if (status) status.textContent = '';
    },
  };
}
