import { describe, it, expect } from 'vitest';
import { nodeClipBox, boxesInView, viewRect } from './nodeClip';

const boxNode = (o: Record<string, unknown> = {}) => ({
  x: 100,
  y: 50,
  options: { shape: 'box', shapeProperties: { borderRadius: 6 }, color: { background: 'rgba(200, 200, 200, 0.5)' } },
  shape: { width: 80, height: 30 },
  ...o,
});

describe('nodeClipBox: the drawn outline of a vis box node', () => {
  it('is the box centred on the node, with its corner radius', () => {
    expect(nodeClipBox(boxNode())).toEqual({ left: 60, top: 35, width: 80, height: 30, radius: 6 });
  });

  it("uses vis's default radius (6) when none is set, and clamps it to the box", () => {
    const faded = { background: 'rgba(1, 2, 3, 0.4)' };
    expect(nodeClipBox(boxNode({ options: { shape: 'box', color: faded } }))?.radius).toBe(6);
    expect(nodeClipBox(boxNode({ options: { shape: 'box', color: faded, shapeProperties: { borderRadius: 99 } } }))?.radius).toBe(15);
  });

  it('is null for hidden nodes, nodes not sized yet, and non-box shapes (left unclipped)', () => {
    const faded = { background: 'rgba(1, 2, 3, 0.4)' };
    expect(nodeClipBox(boxNode({ options: { shape: 'box', color: faded, hidden: true } }))).toBeNull();
    expect(nodeClipBox(boxNode({ shape: {} }))).toBeNull();
    expect(nodeClipBox(boxNode({ x: undefined }))).toBeNull();
    expect(nodeClipBox(boxNode({ options: { shape: 'ellipse', color: faded } }))).toBeNull();
  });
});

describe('nodeClipBox: only semi-transparent nodes need clipping (opaque ones already cover the lines)', () => {
  it('skips opaque nodes: hex colours, rgb(), rgba() with alpha 1, no colour', () => {
    for (const background of ['#c0c0c0', 'rgb(1, 2, 3)', 'rgba(1, 2, 3, 1)', undefined]) {
      expect(nodeClipBox(boxNode({ options: { shape: 'box', color: { background } } }))).toBeNull();
    }
    expect(nodeClipBox(boxNode({ options: { shape: 'box', color: '#c0c0c0' } }))).toBeNull();
  });

  it('clips nodes with a translucent background or a node opacity below 1', () => {
    expect(nodeClipBox(boxNode({ options: { shape: 'box', color: { background: 'rgba(1, 2, 3, 0.35)' } } }))).not.toBeNull();
    expect(nodeClipBox(boxNode({ options: { shape: 'box', color: 'rgba(1,2,3,0.5)' } }))).not.toBeNull();
    expect(nodeClipBox(boxNode({ options: { shape: 'box', color: { background: '#c0c0c0' }, opacity: 0.6 } }))).not.toBeNull();
  });
});

describe('boxesInView', () => {
  it('keeps only boxes that overlap the visible area', () => {
    const view = { left: 0, top: 0, right: 100, bottom: 100 };
    const inside = { left: 10, top: 10, width: 20, height: 20, radius: 0 };
    const straddling = { left: 90, top: 90, width: 40, height: 40, radius: 0 };
    const outside = { left: 200, top: 0, width: 20, height: 20, radius: 0 };
    expect(boxesInView([inside, straddling, outside], view)).toEqual([inside, straddling]);
  });
});

describe('viewRect', () => {
  it('maps the canvas pixel rectangle back through the inverse transform', () => {
    // translate(+50, +20) then scale(2): canvas pixel (px, py) is graph point ((px-50)/2, (py-20)/2).
    const inverse = (x: number, y: number) => ({ x: (x - 50) / 2, y: (y - 20) / 2 });
    expect(viewRect(inverse, 250, 220)).toEqual({ left: -25, top: -10, right: 100, bottom: 100 });
  });
});
