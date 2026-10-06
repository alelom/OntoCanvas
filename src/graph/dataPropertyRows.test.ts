import { describe, it, expect } from 'vitest';
import { firstDataPropertyRowOffset, MIN_DATA_PROPERTY_EDGE_LENGTH } from './dataPropertyRows';
import { arrowheadLength } from './visibleSpan';

describe('firstDataPropertyRowOffset (#72)', () => {
  it('leaves at least the minimum edge length between the class bottom and the top of the property boxes', () => {
    const classHeight = 60;
    const fontSize = 12;
    const offset = firstDataPropertyRowOffset(classHeight, fontSize);
    const classBottom = classHeight / 2;
    const tallestPropertyHalfHeight = offset - classBottom - MIN_DATA_PROPERTY_EDGE_LENGTH;
    // The box half-height assumed is that of a two-line box (name + datatype) at this font size.
    expect(tallestPropertyHalfHeight).toBeCloseTo((2 * fontSize * 1.35) / 2 + 5, 5);
  });

  it('keeps room for the arrowhead plus a visible stretch of line', () => {
    expect(MIN_DATA_PROPERTY_EDGE_LENGTH).toBeGreaterThan(arrowheadLength(1, 1) + 10);
    expect(MIN_DATA_PROPERTY_EDGE_LENGTH).toBeLessThanOrEqual(50); // "a bit longer", not far away
  });

  it('grows with the class height and the property font size', () => {
    expect(firstDataPropertyRowOffset(80, 12)).toBeGreaterThan(firstDataPropertyRowOffset(40, 12));
    expect(firstDataPropertyRowOffset(40, 20)).toBeGreaterThan(firstDataPropertyRowOffset(40, 12));
  });

  it('is further than the old fixed `classHeight / 2 + 20` placement', () => {
    expect(firstDataPropertyRowOffset(40, 12)).toBeGreaterThan(40 / 2 + 20);
  });
});
