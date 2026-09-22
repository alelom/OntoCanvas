/**
 * Unit tests for the placement band used by data properties that assert no rdfs:domain.
 */
import { describe, it, expect } from 'vitest';
import { boundsOf, layoutUnattachedNodes } from '../../src/graph/unattachedDataPropertyLayout';

describe('boundsOf', () => {
  it('returns null for no positions', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('spans all given points', () => {
    expect(boundsOf([{ x: -10, y: 5 }, { x: 30, y: -2 }, { x: 0, y: 40 }])).toEqual({
      minX: -10,
      minY: -2,
      maxX: 30,
      maxY: 40,
    });
  });

  it('skips points with a non-finite coordinate, since neither axis is usable', () => {
    expect(boundsOf([{ x: 0, y: 0 }, { x: NaN, y: 10 }, { x: 20, y: Infinity }])).toEqual({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    });
  });
});

describe('layoutUnattachedNodes', () => {
  const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };

  it('returns nothing for no items', () => {
    expect(layoutUnattachedNodes([], bounds)).toEqual([]);
  });

  it('places the band below the class graph', () => {
    const [point] = layoutUnattachedNodes([100], bounds, { topMargin: 120 });
    expect(point.y).toBe(620);
  });

  it('centres a single item on the graph', () => {
    const [point] = layoutUnattachedNodes([100], bounds);
    expect(point.x).toBe(500);
  });

  it('lays items out left to right without overlapping', () => {
    const widths = [100, 200, 150];
    const points = layoutUnattachedNodes(widths, bounds, { horizontalSpacing: 10 });

    expect(points).toHaveLength(3);
    expect(points.every((p) => p.y === points[0].y)).toBe(true);
    for (let i = 1; i < points.length; i++) {
      const gap = (points[i].x - widths[i] / 2) - (points[i - 1].x + widths[i - 1] / 2);
      expect(gap).toBeCloseTo(10, 5);
    }
  });

  it('wraps onto a new row once the graph width is exceeded', () => {
    const widths = [300, 300, 300, 300];
    const points = layoutUnattachedNodes(widths, { minX: 0, minY: 0, maxX: 700, maxY: 0 }, {
      horizontalSpacing: 10,
      rowSpacing: 40,
      topMargin: 100,
    });

    expect(points[0].y).toBe(100);
    expect(points[1].y).toBe(100);
    expect(points[2].y).toBe(140);
    expect(points[3].y).toBe(140);
  });

  it('centres the band on the origin when there are no class nodes', () => {
    const points = layoutUnattachedNodes([100, 100], null, { horizontalSpacing: 20 });
    const centre = (points[0].x + points[1].x) / 2;
    expect(centre).toBeCloseTo(0, 5);
  });
});
