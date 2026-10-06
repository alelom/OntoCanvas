/**
 * Wires the class-expression overlay (∪ ∩ ¬ {}) into a vis Network and answers hover / click
 * hit-tests for main.ts's existing mouse handlers. Marks on edges are drawn between the edge lines
 * and the edge labels (so labels stay readable); corner badges on nodes are drawn after everything.
 * Kept out of main.ts. See issues #59-#62.
 */
import type { ClassExpressionGroup } from '../types';
import type { Point } from '../graph/classExpressionOverlay';
import { createClassExpressionOverlay, type OverlayNet } from './classExpressionOverlayRenderer';
import { describeClassExpression, showClassExpressionModal } from './classExpressionModal';
import { edgePass } from './visEdgeLayering';
import { debugWarn } from '../utils/debug';

export interface ClassExpressionMarks {
  /** Tooltip text for the mark under a canvas-space point, or null. */
  tooltipAt(canvasPoint: Point): string | null;
  /** Open the details modal for the mark under a canvas-space point; true if one was opened. */
  openAt(canvasPoint: Point): boolean;
}

interface DrawingNet extends OverlayNet {
  on(event: 'afterDrawing', cb: (ctx: CanvasRenderingContext2D) => void): void;
}

/** Draw the marks for `getGroups()` on every frame of `net`, and return its hit-test helpers. */
export function attachClassExpressionMarks(net: DrawingNet, getGroups: () => ClassExpressionGroup[]): ClassExpressionMarks {
  const overlay = createClassExpressionOverlay();
  // Edge marks go under the edge labels when vis's edge pass can be split; otherwise (or if the split
  // ever fails) they are drawn on top with the node badges, as before.
  const pass = edgePass(net);
  let edgeMarksOnTop = !pass;
  pass?.addBetweenLinesAndLabels((ctx) => overlay.draw(net, ctx, getGroups(), ['edges']));
  pass?.onFallback(() => {
    edgeMarksOnTop = true;
    debugWarn('[classExpressionMarks] could not draw edge marks under edge labels; drawing them on top');
  });
  net.on('afterDrawing', (ctx) => overlay.draw(net, ctx, getGroups(), edgeMarksOnTop ? ['edges', 'nodes'] : ['nodes']));
  return {
    tooltipAt(canvasPoint) {
      const group = overlay.groupAt(canvasPoint);
      return group ? describeClassExpression(group) : null;
    },
    openAt(canvasPoint) {
      const group = overlay.groupAt(canvasPoint);
      if (group) showClassExpressionModal(group);
      return !!group;
    },
  };
}
