import { describe, it, expect } from 'vitest';
import { findEdgeIdAtLabelPoint, type EdgeLabelBox } from './edgeLabelHit';

const boxes: EdgeLabelBox[] = [
  { id: 'a->b:rel', left: 0, top: 0, width: 40, height: 12 },
  { id: 'c->d:rel', left: 100, top: 50, width: 60, height: 16 },
];

describe('findEdgeIdAtLabelPoint', () => {
  it('returns the edge whose box contains the point', () => {
    expect(findEdgeIdAtLabelPoint(boxes, { x: 20, y: 6 })).toBe('a->b:rel');
    expect(findEdgeIdAtLabelPoint(boxes, { x: 130, y: 58 })).toBe('c->d:rel');
  });

  it('includes the box edges (inclusive bounds)', () => {
    expect(findEdgeIdAtLabelPoint(boxes, { x: 0, y: 0 })).toBe('a->b:rel');
    expect(findEdgeIdAtLabelPoint(boxes, { x: 40, y: 12 })).toBe('a->b:rel');
  });

  it('returns null when the point is outside every box', () => {
    expect(findEdgeIdAtLabelPoint(boxes, { x: 41, y: 6 })).toBeNull();
    expect(findEdgeIdAtLabelPoint(boxes, { x: 200, y: 200 })).toBeNull();
  });

  it('prefers the last (topmost) box on overlap', () => {
    const overlapping: EdgeLabelBox[] = [
      { id: 'under', left: 0, top: 0, width: 50, height: 50 },
      { id: 'over', left: 10, top: 10, width: 20, height: 20 },
    ];
    expect(findEdgeIdAtLabelPoint(overlapping, { x: 15, y: 15 })).toBe('over');
    expect(findEdgeIdAtLabelPoint(overlapping, { x: 45, y: 45 })).toBe('under');
  });

  it('ignores zero-size boxes', () => {
    expect(findEdgeIdAtLabelPoint([{ id: 'x', left: 0, top: 0, width: 0, height: 0 }], { x: 0, y: 0 })).toBeNull();
  });
});
