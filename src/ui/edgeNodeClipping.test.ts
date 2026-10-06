import { describe, it, expect } from 'vitest';
import { hideEdgeLinesUnderNodes } from './edgeNodeClipping';

const box = (x: number, y: number) => ({ x, y, options: { shape: 'box' }, shape: { width: 40, height: 20 } });

/** A canvas context fake that records the node outlines clipped out (roundRect calls). */
function recordingCtx(clipped: Array<[number, number]>) {
  return {
    canvas: { width: 2000, height: 2000 },
    getTransform: () => ({ inverse: () => ({ transformPoint: (p: { x: number; y: number }) => p }) }),
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    roundRect: (left: number, top: number) => clipped.push([left, top]),
    clip() {},
  } as unknown as CanvasRenderingContext2D;
}

/** A network fake with an empty edge pass, enough for the clip to run each frame. */
function fakeNet(nodes: Record<string, unknown>) {
  return {
    renderer: { _drawEdges: (_ctx: CanvasRenderingContext2D) => {}, _drawArrows: (_ctx: CanvasRenderingContext2D) => {} },
    body: { nodes, edges: {}, edgeIndices: [] as string[] },
  };
}

describe('hideEdgeLinesUnderNodes (#71)', () => {
  it('clips each node at its CURRENT position every frame (moves with dragged nodes)', () => {
    const net = fakeNet({ A: box(100, 100) });
    hideEdgeLinesUnderNodes(net);
    (net.body.nodes.A as { x: number }).x = 300; // dragged
    const clipped: Array<[number, number]> = [];
    net.renderer._drawEdges(recordingCtx(clipped));
    expect(clipped).toEqual([[280, 90]]);
  });

  it('follows vis replacing body.nodes (setData), instead of clipping the stale first layout', () => {
    const net = fakeNet({ A: box(100, 100) });
    hideEdgeLinesUnderNodes(net);
    net.body.nodes = { A: box(500, 400) }; // vis: this.body.nodes = {} on setData
    const clipped: Array<[number, number]> = [];
    net.renderer._drawEdges(recordingCtx(clipped));
    expect(clipped).toEqual([[480, 390]]);
  });

  it('installs even when the network has no nodes yet', () => {
    const net = fakeNet({});
    (net.body as { nodes?: unknown }).nodes = undefined;
    hideEdgeLinesUnderNodes(net);
    net.body.nodes = { A: box(10, 10) };
    const clipped: Array<[number, number]> = [];
    net.renderer._drawEdges(recordingCtx(clipped));
    expect(clipped).toEqual([[-10, 0]]);
  });
});
