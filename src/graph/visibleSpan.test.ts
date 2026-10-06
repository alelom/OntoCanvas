import { describe, it, expect } from 'vitest';
import { pointAlongVisibleSpan, visibleSpanLength, chordT, arrowheadLength } from './visibleSpan';
import type { Point } from './classExpressionOverlay';

/** A straight path from (0,0) to (100,0). */
const line = (t: number): Point => ({ x: 100 * t, y: 0 });

/** A path whose parameter is NOT proportional to distance: x = 100·t² (slow start, fast end). */
const skewed = (t: number): Point => ({ x: 100 * t * t, y: 0 });

describe('pointAlongVisibleSpan', () => {
  it('measures the fraction on the visible span, not centre to centre', () => {
    // Node borders at t=0.2 (x=20) and t=0.8 (x=80): visible span 20..80, ¼ of it is x=35.
    const p = pointAlongVisibleSpan(line, { tStart: 0.2, tEnd: 0.8, trimStart: 0, trimEnd: 0 }, 0.25)!;
    expect(p.x).toBeCloseTo(35, 5);
    const q = pointAlongVisibleSpan(line, { tStart: 0.2, tEnd: 0.8, trimStart: 0, trimEnd: 0 }, 0.75)!;
    expect(q.x).toBeCloseTo(65, 5);
  });

  it('places the point by distance (arc length), not by curve parameter', () => {
    // Visible span is the whole path, x 0..100: ¼ by distance is x=25, whereas t=¼ would give x=6.25.
    const p = pointAlongVisibleSpan(skewed, { tStart: 0, tEnd: 1, trimStart: 0, trimEnd: 0 }, 0.25, 64)!;
    expect(p.x).toBeCloseTo(25, 0);
  });

  it('excludes arrowheads (trim, in pixels) from the ends of the span', () => {
    // Span 20..80 with a 20px arrowhead at the end: measured span 20..60, ¾ of it is x=50.
    const p = pointAlongVisibleSpan(line, { tStart: 0.2, tEnd: 0.8, trimStart: 0, trimEnd: 20 }, 0.75)!;
    expect(p.x).toBeCloseTo(50, 5);
    // ...and at the start: span 30..80, ¼ of it is x=42.5.
    const q = pointAlongVisibleSpan(line, { tStart: 0.2, tEnd: 0.8, trimStart: 10, trimEnd: 0 }, 0.25)!;
    expect(q.x).toBeCloseTo(42.5, 5);
  });

  it('works when the span runs backwards (tStart > tEnd), i.e. measured from the `to` end', () => {
    const p = pointAlongVisibleSpan(line, { tStart: 0.8, tEnd: 0.2, trimStart: 0, trimEnd: 0 }, 0.25)!;
    expect(p.x).toBeCloseTo(65, 5);
  });

  it('returns null when nothing is visible (overlapping nodes, or arrowheads eat the span)', () => {
    expect(pointAlongVisibleSpan(line, { tStart: 0.5, tEnd: 0.5, trimStart: 0, trimEnd: 0 }, 0.25)).toBeNull();
    expect(pointAlongVisibleSpan(line, { tStart: 0.2, tEnd: 0.3, trimStart: 6, trimEnd: 6 }, 0.25)).toBeNull();
  });
});

describe('chordT', () => {
  it('is the parameter of a point projected onto the straight chord a→b', () => {
    expect(chordT({ x: 25, y: 3 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(0.25, 5);
    expect(chordT({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });
});

describe('arrowheadLength', () => {
  it('matches vis-network: 15 × scaleFactor + 3 × edge width', () => {
    expect(arrowheadLength(1, 1)).toBe(18);
    expect(arrowheadLength(0.5, 2)).toBe(13.5);
  });
});

describe('visibleSpanLength', () => {
  it('is the on-screen length between the outlines, less the arrowheads', () => {
    expect(visibleSpanLength(line, { tStart: 0.2, tEnd: 0.8, trimStart: 0, trimEnd: 20 })).toBeCloseTo(40, 5);
    expect(visibleSpanLength(line, { tStart: 0.2, tEnd: 0.3, trimStart: 6, trimEnd: 6 })).toBe(0);
  });
});
