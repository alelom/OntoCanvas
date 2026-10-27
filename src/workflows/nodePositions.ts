/**
 * Forgetting, parking and restoring the node positions around a layout change or a reset.
 * Moved out of main.ts (#175).
 */
import { actions } from '../state/actions';
import { canvasState, session } from '../state/appState';
import { updateRestorePositionsButton } from './layoutOptions';

/**
 * Drops every node position, so the layout places them all again: the local classes' (on rawData) and the
 * loaded config's, from which imported nodes take theirs (#156).
 */
export function forgetNodePositions(): void {
  // What was shown before, for "Restore positions" (#152); the first copy is kept while trying several layouts.
  if (!canvasState.positionsBeforeLayout) {
    const shown: Record<string, { x: number; y: number }> = canvasState.network ? canvasState.network.getPositions() : {};
    session.rawData.nodes.forEach((n) => {
      if (!shown[n.id] && n.x != null && n.y != null) shown[n.id] = { x: n.x, y: n.y };
    });
    if (Object.keys(shown).length > 0) {
      canvasState.positionsBeforeLayout = shown;
      canvasState.arrangedBeforeLayout = canvasState.positionsArranged;
    }
  }
  canvasState.positionsArranged = false;
  session.rawData.nodes.forEach((node) => {
    delete node.x;
    delete node.y;
  });
  canvasState.loadedNodePositions = null;
  updateRestorePositionsButton();
}

/** Puts every node back where it was before the positions were dropped (#152). */
export function restoreNodePositions(): void {
  const before = canvasState.positionsBeforeLayout;
  if (!before) return;
  session.rawData.nodes.forEach((node) => {
    if (before[node.id]) {
      node.x = before[node.id].x;
      node.y = before[node.id].y;
    } else {
      delete node.x;
      delete node.y;
    }
  });
  canvasState.loadedNodePositions = { ...before };
  canvasState.positionsBeforeLayout = null;
  canvasState.positionsArranged = canvasState.arrangedBeforeLayout;
  updateRestorePositionsButton();
  actions.applyFilter(true);
}

/** Forgets the positions "Restore positions" would bring back: another ontology or config is shown. */
export function clearPositionsBeforeLayout(): void {
  canvasState.positionsBeforeLayout = null;
  updateRestorePositionsButton();
}
