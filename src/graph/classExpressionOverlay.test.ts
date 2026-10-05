import { describe, it, expect } from 'vitest';
import {
  boxCenter,
  centroid,
  lerp,
  pointNear,
  distanceToSegment,
  pointNearSegment,
  type Box,
} from './classExpressionOverlay';

describe('classExpressionOverlay geometry', () => {
  it('boxCenter', () => {
    const b: Box = { minX: 0, minY: 0, maxX: 3, maxY: 4 };
    expect(boxCenter(b)).toEqual({ x: 1.5, y: 2 });
  });

  it('centroid averages points', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
    expect(centroid([])).toEqual({ x: 0, y: 0 });
  });

  it('lerp interpolates along a segment', () => {
    expect(lerp({ x: 0, y: 0 }, { x: 8, y: 4 }, 0.25)).toEqual({ x: 2, y: 1 });
    expect(lerp({ x: 0, y: 0 }, { x: 8, y: 4 }, 0.75)).toEqual({ x: 6, y: 3 });
  });

  it('pointNear tests a circle', () => {
    expect(pointNear({ x: 3, y: 4 }, { x: 0, y: 0 }, 5)).toBe(true);
    expect(pointNear({ x: 3, y: 4 }, { x: 0, y: 0 }, 4)).toBe(false);
  });

  it('distanceToSegment / pointNearSegment', () => {
    // Horizontal segment from (0,0) to (10,0); point (5,3) is 3 away.
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    // Beyond the segment end, distance is to the endpoint.
    expect(distanceToSegment({ x: 13, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(pointNearSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 4)).toBe(true);
    expect(pointNearSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }, 2)).toBe(false);
  });
});
