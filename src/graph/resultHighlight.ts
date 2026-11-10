/**
 * A query result shown in the graph by itself (#207): outlined, and the view brought to it, without touching the selection
 * (a selection arms Delete; see #206). The highlight is kept as a matcher, not as ids: the ids of the links between individuals
 * change when more are drawn, so it is matched again on every redraw (refreshResultHighlight, from applyFilter).
 */
import type { GraphIndex, GraphMatch } from '../sparql/graphMatches';
import type { OutlineTargets } from './searchOutline';

export type ResultMatcher = (graph: GraphIndex) => GraphMatch;

/** Above this many nodes and edges a result is not outlined: the outline would be noise, and a few hundred SVG shapes cost. */
export const RESULT_HIGHLIGHT_CAP = 500;

export type ShowDecision =
  | { kind: 'show'; nodes: number; edges: number }
  | { kind: 'none' }
  /** The result names every node drawn: there is nothing to single out, and the view would not move. */
  | { kind: 'everything' }
  | { kind: 'tooMany'; count: number };

const EMPTY: OutlineTargets = { nodeIds: [], dataPropertyNames: [], edgeIds: [] };

/** Whether a match is shown by itself. Pure. */
export function decideShow(match: GraphMatch, graph: GraphIndex): ShowDecision {
  const count = match.nodeIds.length + match.edgeIds.length;
  if (count === 0) return { kind: 'none' };
  const matched = new Set(match.nodeIds);
  if (graph.nodes.length > 0 && graph.nodes.every((n) => matched.has(n.id))) return { kind: 'everything' };
  if (count > RESULT_HIGHLIGHT_CAP) return { kind: 'tooMany', count };
  return { kind: 'show', nodes: match.nodeIds.length, edges: match.edgeIds.length };
}

/** What the view is brought to: the matched nodes and the two ends of each matched edge. Pure. */
export function nodesToFit(match: GraphMatch, graph: GraphIndex): string[] {
  const ids = new Set(match.nodeIds);
  const wanted = new Set(match.edgeIds);
  for (const edge of graph.edges) {
    if (wanted.has(edge.id ?? `${edge.from}->${edge.to}:${edge.type}`)) {
      ids.add(edge.from);
      ids.add(edge.to);
    }
  }
  return [...ids];
}

let matcher: ResultMatcher | null = null;
let targets: OutlineTargets = EMPTY;
const listeners: (() => void)[] = [];

const toTargets = (match: GraphMatch): OutlineTargets => ({ nodeIds: match.nodeIds, dataPropertyNames: [], edgeIds: match.edgeIds });

/** Shows a result (its matcher, matched against what is drawn now), or clears it with null. */
export function setResultHighlight(next: ResultMatcher | null, graph: GraphIndex | null): void {
  matcher = next;
  targets = next && graph ? toTargets(next(graph)) : EMPTY;
  listeners.forEach((listener) => listener());
}

/** The graph was redrawn: the result is matched again against it. */
export function refreshResultHighlight(graph: GraphIndex): void {
  if (matcher) targets = toTargets(matcher(graph));
}

export const resultOutlineTargets = (): OutlineTargets => targets;
export const hasResultHighlight = (): boolean => matcher !== null;
export const onResultHighlightChange = (listener: () => void): void => void listeners.push(listener);
