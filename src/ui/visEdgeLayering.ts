/**
 * A shared replacement for vis-network's edge pass. vis draws each edge's line and its label together
 * (Edge.draw), edge by edge, and exposes no hook in between — `beforeDrawing` is under the lines,
 * `afterDrawing` over everything. This replaces the renderer's private `_drawEdges` with:
 *
 *   1. all edge LINES, then
 *   2. overlays registered to sit between lines and labels (class-expression marks, #59-#62) —
 *      both under an optional clip (e.g. node shapes cut out, #71, so nothing shows through
 *      semi-transparent nodes);
 *   3. all edge LABELS, unclipped.
 *
 * Layers then read edge lines → overlays → edge labels → nodes → arrowheads. The patch is applied once
 * per network and shared (`edgePass(net)` returns the same instance), since only one replacement can
 * own `_drawEdges`.
 *
 * It relies on vis internals (renderer._drawEdges, Edge.getFormattingValues / edgeType.drawLine /
 * drawLabel, mirroring Edge.draw in vis-network 9.x), so it is defensive: if the renderer can't be
 * patched, edgePass returns null; if the split pass ever throws, vis's own pass is restored for good
 * and the onFallback callbacks run, so users can fall back (e.g. draw overlays on top instead).
 * Kept out of main.ts.
 */

type DrawFn = (ctx: CanvasRenderingContext2D) => void;

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
  renderer?: { _drawEdges?: DrawFn };
  body?: { edges: Record<string, unknown>; edgeIndices: string[] };
}

export interface EdgePass {
  /** Set the clip applied (inside save/restore) while edge lines and overlays are drawn; labels are unaffected. */
  setLineClip(clip: DrawFn): void;
  /** Draw `fn` after the edge lines and before the edge labels, every frame. */
  addBetweenLinesAndLabels(fn: DrawFn): void;
  /** Called once if the split pass fails and vis's own edge pass is restored. */
  onFallback(fn: () => void): void;
}

const passes = new WeakMap<object, EdgePass>();

/** The shared split edge pass for `net`, patching vis on first use; null if it can't be patched. */
export function edgePass(net: unknown): EdgePass | null {
  if (!net || typeof net !== 'object') return null;
  const existing = passes.get(net);
  if (existing) return existing;
  const { renderer, body } = net as LayerableNet;
  const original = renderer?._drawEdges;
  if (!renderer || !body || typeof original !== 'function') return null;

  let lineClip: DrawFn | null = null;
  const between: DrawFn[] = [];
  const fallbacks: Array<() => void> = [];

  renderer._drawEdges = function splitEdgePass(ctx: CanvasRenderingContext2D): void {
    const drawn: Array<[LayeredEdge, unknown]> = [];
    try {
      ctx.save();
      try {
        lineClip?.(ctx);
        for (const id of body.edgeIndices) {
          const edge = body.edges[id] as LayeredEdge;
          if (edge.connected !== true) continue;
          const values = edge.getFormattingValues();
          if (values.hidden) continue;
          const via = edge.edgeType.getViaNode();
          edge.edgeType.drawLine(ctx, values, edge.selected, edge.hover, via);
          drawn.push([edge, via]);
        }
        for (const fn of between) fn(ctx);
      } finally {
        ctx.restore(); // always drop the clip, even if a line or overlay failed
      }
      for (const [edge, via] of drawn) edge.drawLabel(ctx, via);
    } catch {
      // vis internals changed: go back to its own pass permanently and let users fall back.
      renderer._drawEdges = original;
      original.call(renderer, ctx);
      for (const fn of fallbacks) fn();
    }
  };

  const pass: EdgePass = {
    setLineClip: (clip) => { lineClip = clip; },
    addBetweenLinesAndLabels: (fn) => { between.push(fn); },
    onFallback: (fn) => { fallbacks.push(fn); },
  };
  passes.set(net, pass);
  return pass;
}
