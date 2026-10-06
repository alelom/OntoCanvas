/**
 * Draw an overlay BETWEEN vis-network's edge lines and edge labels. vis draws each edge's line and
 * its label together (Edge.draw), edge by edge, and exposes no hook in between — `beforeDrawing` is
 * under the lines, `afterDrawing` over the labels. This replaces the renderer's private `_drawEdges`
 * with a two-pass version: all lines, then the overlay, then all labels. Layers then read
 * edge lines → overlay → edge labels → nodes → arrowheads.
 *
 * It relies on vis internals (renderer._drawEdges, Edge.getFormattingValues / edgeType.drawLine /
 * drawLabel, mirroring Edge.draw in vis-network 9.x), so it is defensive: if the renderer can't be
 * patched it returns false, and if the split pass throws it restores vis's own pass for good and
 * reports it, so the caller can draw the overlay on top instead. Kept out of main.ts. See #59-#62.
 */

interface LayeredEdge {
  connected?: boolean;
  selected?: boolean;
  hover?: boolean;
  getFormattingValues(): { hidden?: boolean };
  edgeType: {
    getViaNode(): unknown;
    drawLine(ctx: CanvasRenderingContext2D, values: unknown, selected?: boolean, hover?: boolean, via?: unknown): void;
  };
  drawLabel(ctx: CanvasRenderingContext2D, via: unknown): void;
}

interface LayerableNet {
  renderer?: { _drawEdges?: (ctx: CanvasRenderingContext2D) => void };
  body?: { edges: Record<string, unknown>; edgeIndices: string[] };
}

/**
 * Make `drawOverlay` run between the edge lines and the edge labels on every frame. Returns false if
 * the network can't be patched. `onFallback` is called once if the split pass ever fails (vis
 * internals changed): vis's own edge pass is restored and the overlay is no longer drawn by it.
 */
export function drawBetweenEdgeLinesAndLabels(
  net: unknown,
  drawOverlay: (ctx: CanvasRenderingContext2D) => void,
  onFallback?: () => void,
): boolean {
  const { renderer, body } = net as LayerableNet;
  const original = renderer?._drawEdges;
  if (!renderer || !body || typeof original !== 'function') return false;

  renderer._drawEdges = function splitEdgePass(ctx: CanvasRenderingContext2D): void {
    const drawn: Array<[LayeredEdge, unknown]> = [];
    try {
      for (const id of body.edgeIndices) {
        const edge = body.edges[id] as LayeredEdge;
        if (edge.connected !== true) continue;
        const values = edge.getFormattingValues();
        if (values.hidden) continue;
        const via = edge.edgeType.getViaNode();
        edge.edgeType.drawLine(ctx, values, edge.selected, edge.hover, via);
        drawn.push([edge, via]);
      }
      drawOverlay(ctx);
      for (const [edge, via] of drawn) edge.drawLabel(ctx, via);
    } catch {
      // vis internals changed: go back to its own pass permanently and let the caller draw on top.
      renderer._drawEdges = original;
      original.call(renderer, ctx);
      onFallback?.();
    }
  };
  return true;
}
