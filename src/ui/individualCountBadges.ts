/**
 * The count of individuals on a class node (#209), drawn as a badge over the canvas near the bottom right corner of the node
 * (not in its label). Clicking it draws the individuals of the class, like the entry of the node's right-click menu, and
 * hovering it says what that does. The count is `individualCount` on the node's record; a node without it has no badge.
 */
import type { ClassIndividualsAction } from '../graph/classIndividuals';

interface Point {
  x: number;
  y: number;
}

interface BadgeNet {
  on(event: 'afterDrawing', cb: (ctx: CanvasRenderingContext2D) => void): void;
  getBoundingBox(nodeId: string): { left: number; right: number; top: number; bottom: number };
  body: { data: { nodes: { get(): Array<{ id: string | number; individualCount?: number }> } } };
}

export interface IndividualCountBadges {
  /** Tooltip text for the badge under a canvas-space point, or null. */
  tooltipAt(canvasPoint: Point): string | null;
  /** Draws the individuals of the class whose badge is under a canvas-space point; true if it did. */
  openAt(canvasPoint: Point): boolean;
}

const FONT = 'bold 15px sans-serif';
const HEIGHT = 22;

interface Placed {
  id: string;
  count: number;
  left: number;
  top: number;
  width: number;
}

export function attachIndividualCountBadges(net: BadgeNet, getAction: (nodeId: string) => ClassIndividualsAction | null): IndividualCountBadges {
  let placed: Placed[] = [];

  net.on('afterDrawing', (ctx) => {
    placed = [];
    ctx.save();
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const node of net.body.data.nodes.get()) {
      if (!node.individualCount) continue;
      const id = String(node.id);
      const box = net.getBoundingBox(id);
      const text = String(node.individualCount);
      const width = Math.max(HEIGHT, ctx.measureText(text).width + 14);
      // Centred on the corner, a little inside it.
      const left = box.right - 6 - width / 2;
      const top = box.bottom - 2 - HEIGHT / 2;
      placed.push({ id, count: node.individualCount, left, top, width });

      ctx.beginPath();
      ctx.roundRect(left, top, width, HEIGHT, HEIGHT / 2);
      ctx.fillStyle = '#fdebd0';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e67e22';
      ctx.stroke();
      ctx.fillStyle = '#a04000';
      ctx.fillText(text, left + width / 2, top + HEIGHT / 2 + 1);
    }
    ctx.restore();
  });

  const at = (p: Point): Placed | undefined => placed.find((b) => p.x >= b.left && p.x <= b.left + b.width && p.y >= b.top && p.y <= b.top + HEIGHT);

  return {
    tooltipAt(point) {
      const badge = at(point);
      const action = badge && getAction(badge.id);
      if (!badge || !action) return null;
      const what = action.disabled ? action.title : `Click to draw a sample of ${action.adds} ${action.adds === 1 ? 'individual' : 'individuals'} of this class, ${action.displayed} currently displayed`;
      return `${badge.count} ${badge.count === 1 ? 'individual' : 'individuals'} of this class in the loaded data.\n${what}`;
    },
    openAt(point) {
      const badge = at(point);
      const action = badge && getAction(badge.id);
      if (!action || action.disabled) return false;
      action.run();
      return true;
    },
  };
}
