/**
 * Wires the class-expression overlay (∪ ∩ ¬ {}) into a vis Network: draws the marks after every
 * frame, and answers hover / click hit-tests for main.ts's existing mouse handlers. Kept out of
 * main.ts. See issues #59-#62.
 */
import type { ClassExpressionGroup } from '../types';
import type { Point } from '../graph/classExpressionOverlay';
import { createClassExpressionOverlay, type OverlayNet } from './classExpressionOverlayRenderer';
import { describeClassExpression, showClassExpressionModal } from './classExpressionModal';

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
  net.on('afterDrawing', (ctx) => overlay.draw(net, ctx, getGroups()));
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
