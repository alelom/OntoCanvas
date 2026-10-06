import { describe, it, expect, vi } from 'vitest';
import { edgePass } from './visEdgeLayering';

/** A fake vis edge that records the order its line and label are drawn in. */
function fakeEdge(id: string, log: string[], opts: { hidden?: boolean; connected?: boolean } = {}) {
  return {
    connected: opts.connected ?? true,
    selected: false,
    hover: false,
    getFormattingValues: () => ({ hidden: !!opts.hidden }),
    edgeType: {
      getViaNode: () => ({ id: `via-${id}` }),
      drawLine: () => log.push(`line:${id}`),
    },
    drawLabel: (_ctx: unknown, via: { id: string }) => log.push(`label:${id}:${via.id}`),
    drawArrows: (_ctx: unknown) => log.push(`arrow:${id}`),
    draw: (_ctx?: unknown) => log.push(`original:${id}`),
  };
}

function fakeNet(log: string[], edgeOpts: Record<string, { hidden?: boolean; connected?: boolean }> = {}) {
  const ids = ['a', 'b', 'c'];
  const edges = Object.fromEntries(ids.map((id) => [id, fakeEdge(id, log, edgeOpts[id])]));
  const renderer = {
    _drawEdges(ctx: unknown) {
      for (const id of ids) edges[id].draw(ctx);
    },
    _drawArrows(_ctx: unknown) {
      for (const id of ids) log.push(`vis-arrows:${id}`);
    },
  };
  return { renderer, body: { edges, edgeIndices: ids } };
}

const fakeCtx = (log: string[]) =>
  ({ save: () => log.push('save'), restore: () => log.push('restore') }) as unknown as CanvasRenderingContext2D;

describe('edgePass: vis edge drawing split into lines → overlays → labels', () => {
  it('draws every edge line, then the overlays, then every edge label', () => {
    const log: string[] = [];
    const net = fakeNet(log);
    edgePass(net)!.addBetweenLinesAndLabels(() => log.push('overlay'));
    net.renderer._drawEdges(fakeCtx(log));
    expect(log).toEqual(['save', 'line:a', 'line:b', 'line:c', 'overlay', 'restore', 'arrow:a', 'arrow:b', 'arrow:c', 'label:a:via-a', 'label:b:via-b', 'label:c:via-c']);
  });

  it('applies the clip to the lines and overlays, but not the labels (#71)', () => {
    const log: string[] = [];
    const net = fakeNet(log);
    const pass = edgePass(net)!;
    pass.setLineClip(() => log.push('clip'));
    pass.addBetweenLinesAndLabels(() => log.push('overlay'));
    net.renderer._drawEdges(fakeCtx(log));
    expect(log).toEqual(['save', 'clip', 'line:a', 'line:b', 'line:c', 'overlay', 'restore', 'arrow:a', 'arrow:b', 'arrow:c', 'label:a:via-a', 'label:b:via-b', 'label:c:via-c']);
  });

  it("draws arrowheads above the lines and marks but below the labels, and disables vis's later arrow pass", () => {
    const log: string[] = [];
    const net = fakeNet(log);
    edgePass(net);
    net.renderer._drawArrows(fakeCtx(log)); // vis calls this after drawing the nodes
    expect(log).toEqual([]);
  });

  it('is shared: patching the same network twice returns the same pass (one patch, several users)', () => {
    const log: string[] = [];
    const net = fakeNet(log);
    expect(edgePass(net)).toBe(edgePass(net));
    edgePass(net)!.addBetweenLinesAndLabels(() => log.push('first'));
    edgePass(net)!.addBetweenLinesAndLabels(() => log.push('second'));
    net.renderer._drawEdges(fakeCtx(log));
    expect(log.filter((l) => l === 'first' || l === 'second')).toEqual(['first', 'second']);
  });

  it('skips hidden and unconnected edges, as vis does', () => {
    const log: string[] = [];
    const net = fakeNet(log, { b: { hidden: true }, c: { connected: false } });
    edgePass(net)!.addBetweenLinesAndLabels(() => log.push('overlay'));
    net.renderer._drawEdges(fakeCtx(log));
    expect(log).toEqual(['save', 'line:a', 'overlay', 'restore', 'arrow:a', 'label:a:via-a']);
  });

  it('falls back to the original edge pass if the split pass throws, restoring the context', () => {
    const log: string[] = [];
    const net = fakeNet(log);
    (net.body.edges.b.edgeType as { drawLine: () => void }).drawLine = () => { throw new Error('vis changed'); };
    const onFallback = vi.fn();
    const pass = edgePass(net)!;
    pass.addBetweenLinesAndLabels(() => log.push('overlay'));
    pass.onFallback(onFallback);
    net.renderer._drawEdges(fakeCtx(log));
    expect(log).toContain('restore');
    expect(log.filter((l) => l.startsWith('original'))).toEqual(['original:a', 'original:b', 'original:c']);
    expect(log).not.toContain('overlay');
    expect(onFallback).toHaveBeenCalledOnce();
    // ...and vis's own arrow pass is back.
    net.renderer._drawArrows(fakeCtx(log));
    expect(log.filter((l) => l.startsWith('vis-arrows'))).toEqual(['vis-arrows:a', 'vis-arrows:b', 'vis-arrows:c']);
  });

  it('returns null (and changes nothing) when the renderer has no edge pass to split', () => {
    expect(edgePass({ renderer: {}, body: { edges: {}, edgeIndices: [] } })).toBeNull();
    expect(edgePass({})).toBeNull();
  });
});
