/**
 * A query result shown in the graph by itself (#207): outlined, and the view brought to it, when the rule of resultHighlight.ts
 * allows. Nothing is selected.
 */
import { canvasState } from '../state/appState';
import { currentGraphIndex } from './drawnGraphIndex';
import { decideShow, nodesToFit, setResultHighlight, type ResultMatcher, type ShowDecision } from './resultHighlight';

export function showResultInGraph(matcher: ResultMatcher): ShowDecision {
  const graph = currentGraphIndex();
  const net = canvasState.network;
  if (!graph || !net) return { kind: 'none' };
  const match = matcher(graph);
  const decision = decideShow(match, graph);
  if (decision.kind !== 'show') {
    clearResultInGraph();
    return decision;
  }
  setResultHighlight(matcher, graph);
  net.fit({ nodes: nodesToFit(match, graph), maxZoomLevel: 1, animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
  net.redraw();
  return decision;
}

export function clearResultInGraph(): void {
  setResultHighlight(null, null);
  canvasState.network?.redraw();
}
