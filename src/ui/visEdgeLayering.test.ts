import { describe, it, expect, vi } from 'vitest';
import { drawBetweenEdgeLinesAndLabels } from './visEdgeLayering';

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
  };
  return { renderer, body: { edges, edgeIndices: ids } };
}

const ctx = {} as CanvasRenderingContext2D;

describe('drawBetweenEdgeLinesAndLabels', () => {
  it('draws every edge line, then the overlay, then every edge label', () => {
    const log: string[] = [];
    const net = fakeNet(log);
    expect(drawBetweenEdgeLinesAndLabels(net, () => log.push('overlay'))).toBe(true);
    net.renderer._drawEdges(ctx);
    expect(log).toEqual(['line:a', 'line:b', 'line:c', 'overlay', 'label:a:via-a', 'label:b:via-b', 'label:c:via-c']);
  });

  it('skips hidden and unconnected edges, as vis does', () => {
    const log: string[] = [];
    const net = fakeNet(log, { b: { hidden: true }, c: { connected: false } });
    drawBetweenEdgeLinesAndLabels(net, () => log.push('overlay'));
    net.renderer._drawEdges(ctx);
    expect(log).toEqual(['line:a', 'overlay', 'label:a:via-a']);
  });

  it('falls back to the original edge pass if the split pass throws, without losing the overlay', () => {
    const log: string[] = [];
    const net = fakeNet(log);
    (net.body.edges.b.edgeType as { drawLine: () => void }).drawLine = () => { throw new Error('vis changed'); };
    const onFallback = vi.fn();
    drawBetweenEdgeLinesAndLabels(net, () => log.push('overlay'), onFallback);
    net.renderer._drawEdges(ctx);
    expect(log.filter((l) => l.startsWith('original'))).toEqual(['original:a', 'original:b', 'original:c']);
    expect(log).not.toContain('overlay');
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it('returns false (and changes nothing) when the renderer has no edge pass to split', () => {
    expect(drawBetweenEdgeLinesAndLabels({ renderer: {}, body: { edges: {}, edgeIndices: [] } }, () => {})).toBe(false);
    expect(drawBetweenEdgeLinesAndLabels({}, () => {})).toBe(false);
  });
});
