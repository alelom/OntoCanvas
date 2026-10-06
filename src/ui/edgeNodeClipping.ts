/**
 * Hide the part of every edge line that runs under a node. vis-network draws edges centre to centre and
 * paints nodes over them: opaque nodes hide the overlap, but semi-transparent ones (imported terms) let
 * the line show through to the node's centre. This clips node shapes out of the edge-line pass, so a
 * line (and class-expression mark) is only visible between the node outlines whatever the node's
 * opacity. Arrowheads and labels are not clipped. Geometry is in graph/nodeClip.ts. Kept out of
 * main.ts. See issue #71.
 */
import { boxesInView, nodeClipBox, viewRect, type ClipBox, type ClipNodeLike } from '../graph/nodeClip';
import { edgePass } from './visEdgeLayering';

/** Canvas units beyond the visible area kept inside the outer clip rectangle. */
const VIEW_MARGIN = 100;

function roundRectPath(ctx: CanvasRenderingContext2D, b: ClipBox): void {
  if (typeof ctx.roundRect === 'function') ctx.roundRect(b.left, b.top, b.width, b.height, b.radius);
  else ctx.rect(b.left, b.top, b.width, b.height);
}

/** Intersect the current clip with "everything except each visible node's outline". One clip per node
 * (clips intersect), rather than one even-odd path, so overlapping nodes stay clipped where they overlap. */
export function clipOutNodes(ctx: CanvasRenderingContext2D, nodes: Record<string, ClipNodeLike>): void {
  const inverse = ctx.getTransform().inverse();
  const view = viewRect((x, y) => inverse.transformPoint({ x, y }), ctx.canvas.width, ctx.canvas.height);
  const boxes = boxesInView(
    Object.values(nodes).map(nodeClipBox).filter((b): b is ClipBox => b !== null),
    view,
  );
  const outer = {
    x: view.left - VIEW_MARGIN,
    y: view.top - VIEW_MARGIN,
    w: view.right - view.left + 2 * VIEW_MARGIN,
    h: view.bottom - view.top + 2 * VIEW_MARGIN,
  };
  for (const box of boxes) {
    ctx.beginPath();
    ctx.rect(outer.x, outer.y, outer.w, outer.h);
    roundRectPath(ctx, box);
    ctx.clip('evenodd');
  }
}

/** Clip node shapes out of `net`'s edge lines on every frame. No-op if vis's edge pass can't be patched. */
export function hideEdgeLinesUnderNodes(net: unknown): void {
  const body = (net as { body?: { nodes?: Record<string, ClipNodeLike> } }).body;
  if (!body) return;
  edgePass(net)?.setLineClip((ctx) => {
    // Read body.nodes every frame: vis replaces the object on setData, so a reference taken at setup
    // would keep clipping the first layout's nodes instead of the live, draggable ones.
    const nodes = body.nodes;
    if (!nodes) return;
    try {
      clipOutNodes(ctx, nodes);
    } catch {
      /* clipping is cosmetic: on any failure draw the lines unclipped */
    }
  });
}
