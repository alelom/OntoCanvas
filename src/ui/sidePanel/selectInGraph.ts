/**
 * "Select in graph" above a query result (#203, #207): selects what the result names that is drawn, and brings it into view.
 * Individuals the result names that are not drawn are drawn by the button, within the limit, then selected with the rest: a
 * query alone never draws them (drawing changes the canvas).
 */
import { describeMatch, irisInTable, matchTableToGraph, type GraphIndex, type GraphMatch } from '../../sparql/graphMatches';
import type { ResultView } from '../../sparql/resultView';
import { limitTitle } from '../../abox/individualsLayer';
import type { ResultMatcher, ShowDecision } from '../../graph/resultHighlight';

/** The individuals of the open data, for a result to draw those it names (#207). */
export interface ResultIndividuals {
  isIndividual(iri: string): boolean;
  isDrawn(iri: string): boolean;
  /** Draws those not drawn, within the limit, in one change; returns how many it drew. */
  draw(iris: string[]): number;
  /** How many more the graph can draw. */
  room(): number;
  limit: number;
}

export interface SelectInGraphDeps {
  getGraph?: () => GraphIndex | null;
  showInGraph?: (match: GraphMatch) => void;
  individuals?: ResultIndividuals;
}

type Table = Extract<ResultView, { kind: 'table' }>;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** The button, or a line saying why the individuals of the result cannot be shown; nothing when it names nothing to show. */
export function selectInGraphRow(view: Table, deps: SelectInGraphDeps): HTMLElement[] {
  const graph = deps.getGraph?.();
  if (!graph || !deps.showInGraph) return [];
  const match = matchTableToGraph(view, graph);
  const people = deps.individuals;
  const undrawn = people ? irisInTable(view).filter((iri) => people.isIndividual(iri) && !people.isDrawn(iri)) : [];
  const drawable = people ? Math.min(undrawn.length, people.room()) : 0;
  const drawnPart = describeMatch(match, graph);
  if (!drawnPart && drawable === 0) {
    if (!undrawn.length || !people) return [];
    const note = element('p', 'query-note', `${plural(undrawn.length, 'individual of the result is', 'individuals of the result are')} not drawn: the graph draws up to ${plural(people.limit, 'individual', 'individuals')}.`);
    note.setAttribute('data-query-undrawn', '');
    return [note];
  }

  const ofAll = drawable < undrawn.length ? ` of ${undrawn.length}` : '';
  const drawPart = drawable ? (drawnPart ? `draws ${drawable} more${ofAll}` : `draws ${plural(drawable, 'individual', 'individuals')}${ofAll}`) : '';
  const button = element('button', undefined, `Select in graph (${[drawnPart, drawPart].filter(Boolean).join(', ')})`);
  button.type = 'button';
  button.setAttribute('data-query-show-in-graph', '');
  button.title = [
    drawable ? 'Draw the individuals of the result that are not drawn, then select' : 'Select',
    ' these in the graph and bring them into view.',
    match.allEdgesOfAProperty ? ' A property named without the two ends of an edge selects every edge that uses it.' : '',
    ofAll && people ? ` ${limitTitle(people.limit)}.` : '',
  ].join('');
  button.addEventListener('click', () => {
    if (!drawable || !people) {
      deps.showInGraph!(match);
      return;
    }
    people.draw(undrawn);
    // The graph is redrawn with them; the selection follows the redraw's own view change, so it lands on what is drawn now.
    requestAnimationFrame(() => {
      const now = deps.getGraph?.();
      if (now) deps.showInGraph!(matchTableToGraph(view, now));
    });
  });
  return [button];
}

const SHOW_RESULTS_KEY = 'ontocanvas.showResultsInGraph';

function readShowResults(): boolean {
  try {
    return localStorage.getItem(SHOW_RESULTS_KEY) !== 'false';
  } catch {
    return true;
  }
}

function writeShowResults(on: boolean): void {
  try {
    localStorage.setItem(SHOW_RESULTS_KEY, String(on));
  } catch {
    // A browser that keeps nothing: the choice lasts for the page.
  }
}

export interface ShowResultDeps {
  getGraph?: () => GraphIndex | null;
  /** Outlines a result in the graph and brings it into view, when the rule allows (#207). */
  showResult?: (matcher: ResultMatcher) => ShowDecision;
  clearResult?: () => void;
}

/**
 * A result shown in the graph by itself after each Run (#207): the checkbox that turns it off (remembered in the browser), and
 * the line that says what was outlined, with a Clear.
 */
export function createResultShowing(deps: ShowResultDeps): { toggle: HTMLElement; line: HTMLElement; show(matcher: ResultMatcher): void; clear(): void } {
  let on = readShowResults();
  const line = element('span', 'query-status query-shown-line');
  const toggle = element('label', 'query-show-results');
  const box = element('input');
  box.type = 'checkbox';
  box.checked = on;
  box.setAttribute('data-query-show-results', '');
  toggle.title = 'After each run, outline in the graph what the result names, and bring it into view. It selects nothing.';
  toggle.append(box, ' Show results in the graph');

  function clear(): void {
    line.replaceChildren();
    deps.clearResult?.();
  }
  box.addEventListener('change', () => {
    on = box.checked;
    writeShowResults(on);
    if (!on) clear();
  });

  function show(matcher: ResultMatcher): void {
    line.replaceChildren();
    const graph = deps.getGraph?.();
    if (!on || !deps.showResult || !graph) return;
    const decision = deps.showResult(matcher);
    if (decision.kind !== 'show' && decision.kind !== 'tooMany') return;
    const said = element('span');
    said.setAttribute('data-query-shown', '');
    if (decision.kind === 'tooMany') {
      said.textContent = `${decision.count} matches in the graph: too many to outline.`;
    } else {
      const clearButton = element('button', 'link-button', 'Clear');
      clearButton.type = 'button';
      clearButton.title = 'Remove the outline';
      clearButton.setAttribute('data-query-shown-clear', '');
      clearButton.addEventListener('click', clear);
      said.append(`${describeMatch(matcher(graph), graph)} outlined in the graph. `, clearButton);
    }
    line.append(said);
  }

  return { toggle, line, show, clear };
}
