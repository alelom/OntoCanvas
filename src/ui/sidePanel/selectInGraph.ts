/**
 * "Select in graph" above a query result (#203, #207): selects what the result names that is drawn, and brings it into view.
 * Individuals the result names that are not drawn are drawn by the button, within the limit, then selected with the rest: a
 * query alone never draws them (drawing changes the canvas).
 */
import { describeMatch, irisInTable, matchQuadsToGraph, matchTableToGraph, type GraphIndex, type GraphMatch } from '../../sparql/graphMatches';
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

/** What a result names: how to match it against what is drawn, and the IRIs in it (for the individuals not drawn). */
export interface ResultFound {
  matchOf: (graph: GraphIndex) => GraphMatch;
  iris: string[];
}

/** A SELECT result: its rows (#203). */
export const foundInTable = (view: Table): ResultFound => ({ matchOf: (graph) => matchTableToGraph(view, graph), iris: irisInTable(view) });

/** How many triples of a CONSTRUCT or DESCRIBE result the graph draws something for: "; 12 of 40 are in the graph", or nothing. */
export function triplesInGraph(quads: Parameters<typeof matchQuadsToGraph>[0], graph: GraphIndex | null | undefined): string {
  if (!graph) return '';
  const { total, inGraph } = matchQuadsToGraph(quads, graph).triples;
  return total ? `; ${inGraph} of ${total} ${total === 1 ? 'is' : 'are'} in the graph` : '';
}

/** A CONSTRUCT or DESCRIBE result: its triples (#207). */
export function foundInQuads(quads: Parameters<typeof matchQuadsToGraph>[0] & Iterable<{ subject: { termType: string; value: string }; object: { termType: string; value: string } }>): ResultFound {
  const iris = new Set<string>();
  for (const { subject, object } of quads) for (const term of [subject, object]) if (term.termType === 'NamedNode') iris.add(term.value);
  return { matchOf: (graph) => matchQuadsToGraph(quads, graph), iris: [...iris] };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** The button, or a line saying why the individuals of the result cannot be shown; nothing when it names nothing to show. */
export function selectInGraphRow(found: ResultFound, deps: SelectInGraphDeps): HTMLElement[] {
  const graph = deps.getGraph?.();
  if (!graph || !deps.showInGraph) return [];
  const match = found.matchOf(graph);
  const people = deps.individuals;
  const undrawn = people ? found.iris.filter((iri) => people.isIndividual(iri) && !people.isDrawn(iri)) : [];
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
      if (now) deps.showInGraph!(found.matchOf(now));
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
  /** Called when the outline changes from elsewhere (a draw or a clear of individuals drops it); `hasResult` says whether one is on. */
  onResultChange?: (listener: () => void) => void;
  hasResult?: () => boolean;
}

/**
 * A result shown in the graph by itself after each Run (#207): the checkbox that turns it off (remembered in the browser), and
 * the line that says what was outlined, with a Clear.
 */
export function createResultShowing(deps: ShowResultDeps): { toggle: HTMLElement; line: HTMLElement; show(matcher: ResultMatcher, from?: string): void; clear(): void } {
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
  // The outline dropped elsewhere: the line that says it goes too.
  deps.onResultChange?.(() => {
    if (deps.hasResult && !deps.hasResult()) line.replaceChildren();
  });
  box.addEventListener('change', () => {
    on = box.checked;
    writeShowResults(on);
    if (!on) clear();
  });

  /** `from`: what part of the result the outline comes from, when it was read only in part ("the first 500 rows"). */
  function show(matcher: ResultMatcher, from?: string): void {
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
      said.append(`${describeMatch(matcher(graph), graph)} outlined in the graph${from ? ` (from ${from})` : ''}. `, clearButton);
    }
    line.append(said);
  }

  return { toggle, line, show, clear };
}
