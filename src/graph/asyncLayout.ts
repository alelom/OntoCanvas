/**
 * Running a layout that takes time (such as ELK) and applying its positions when it is ready.
 * Moved out of main.ts (#175).
 */
import type { AsyncLayoutAlgorithm } from '../layouts';
import type { LayeredModelOptions } from '../layouts/layeredModel';
import { placeUnsavedNodes } from '../layouts/placeUnsaved';
import { actions } from '../state/actions';
import { canvasState, session } from '../state/appState';
import type { GraphEdge } from '../types';
import { SPACING } from '../ui/constants';
import { debugError } from '../utils/debug';

/**
 * Runs an asynchronous layout (ELK, #153) and keeps its positions for the nodes that had none, then redraws. Only
 * the latest run counts, and only while its layout is still the chosen one. If it fails (e.g. elkjs can't be
 * loaded), the positions shown meanwhile are kept.
 */
export function runAsyncLayout(
  layout: AsyncLayoutAlgorithm,
  mode: string,
  nodeIds: Set<string>,
  edges: GraphEdge[],
  nodeDimensions: Map<string, { width: number; height: number }>,
  layoutOptions: LayeredModelOptions,
  toPlace: Set<string>,
  placedBefore: Record<string, { x: number; y: number }>,
  sizeOf: (id: string) => { width: number; height: number },
  shown: Record<string, { x: number; y: number }>
): void {
  const run = ++canvasState.asyncLayoutRun;
  const keep = (positions: Record<string, { x: number; y: number }>) => {
    if (run !== canvasState.asyncLayoutRun || (document.getElementById('layoutMode') as HTMLSelectElement).value !== mode) return;
    let changed = false;
    for (const [id, pos] of Object.entries(positions)) {
      if (!toPlace.has(id)) continue;
      const node = session.rawData.nodes.find((n) => n.id === id);
      if (node && (node.x != null || node.y != null)) continue;
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
      } else {
        canvasState.loadedNodePositions = { ...(canvasState.loadedNodePositions ?? {}), [id]: pos };
      }
      changed = true;
    }
    if (changed) actions.applyFilter(true);
  };
  layout(nodeIds, edges, SPACING, nodeDimensions, layoutOptions)
    .then((computed) => keep(placeUnsavedNodes(placedBefore, computed, edges, sizeOf)))
    .catch((err) => {
      debugError(`[LAYOUT] ${mode} failed; keeping the default layout`, err);
      keep(shown);
    });
}
