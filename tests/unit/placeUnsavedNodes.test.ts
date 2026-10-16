/**
 * Nodes without a saved position go near their placed neighbours (#152), keeping the offset the fresh layout gives
 * them from those neighbours, rather than taking the fresh layout's coordinates, which have nothing to do with where
 * the saved nodes are.
 */
import { describe, it, expect } from 'vitest';
import { placeUnsavedNodes } from '../../src/layouts/placeUnsaved';
import type { GraphEdge } from '../../src/types';

const size = () => ({ width: 100, height: 40 });
const sub = (child: string, parent: string): GraphEdge => ({ from: child, to: parent, type: 'subClassOf' });

describe('placeUnsavedNodes', () => {
  it('places a new subclass below its saved parent, as the fresh layout has it below', () => {
    const saved = { P: { x: 5000, y: 300 } };
    const fresh = { P: { x: 0, y: 0 }, C: { x: 0, y: 200 } };
    expect(placeUnsavedNodes(saved, fresh, [sub('C', 'P')], size)).toEqual({ C: { x: 5000, y: 500 } });
  });

  it('averages the offsets from several placed neighbours', () => {
    const saved = { A: { x: 0, y: 0 }, B: { x: 400, y: 0 } };
    const fresh = { A: { x: 0, y: 0 }, B: { x: 200, y: 0 }, C: { x: 100, y: 200 } };
    const out = placeUnsavedNodes(saved, fresh, [sub('C', 'A'), sub('C', 'B')], size);
    expect(out.C).toEqual({ x: 200, y: 200 });
  });

  it('places a chain of new nodes outward from the placed one', () => {
    const saved = { P: { x: 1000, y: 0 } };
    const fresh = { P: { x: 0, y: 0 }, C: { x: 0, y: 200 }, G: { x: 0, y: 400 } };
    const out = placeUnsavedNodes(saved, fresh, [sub('C', 'P'), sub('G', 'C')], size);
    expect(out.C).toEqual({ x: 1000, y: 200 });
    expect(out.G).toEqual({ x: 1000, y: 400 });
  });

  it('moves a new node sideways off a saved node it would overlap', () => {
    const saved = { P: { x: 0, y: 0 }, Other: { x: 0, y: 200 } };
    const fresh = { P: { x: 0, y: 0 }, C: { x: 0, y: 200 }, Other: { x: 900, y: 900 } };
    const { C } = placeUnsavedNodes(saved, fresh, [sub('C', 'P')], size);
    expect(C.y).toBe(200);
    expect(Math.abs(C.x)).toBeGreaterThanOrEqual(100);
  });

  it('puts a group with no placed neighbour beside the saved graph, keeping its own shape', () => {
    const saved = { A: { x: 0, y: 0 }, B: { x: 300, y: 100 } };
    const fresh = { A: { x: 0, y: 0 }, B: { x: 300, y: 100 }, X: { x: -50, y: 0 }, Y: { x: -50, y: 200 } };
    const out = placeUnsavedNodes(saved, fresh, [sub('Y', 'X')], size);
    expect(out.X.x).toBeGreaterThan(300 + 50);
    expect(out.Y.x).toBe(out.X.x);
    expect(out.Y.y - out.X.y).toBe(200);
    expect(out.X.y).toBe(0);
  });

  it('returns the fresh layout when nothing is saved', () => {
    const fresh = { A: { x: 1, y: 2 }, B: { x: 3, y: 4 } };
    expect(placeUnsavedNodes({}, fresh, [], size)).toEqual(fresh);
  });

  it('places nothing when every node is saved', () => {
    const saved = { A: { x: 1, y: 2 } };
    expect(placeUnsavedNodes(saved, { A: { x: 9, y: 9 } }, [], size)).toEqual({});
  });
});
