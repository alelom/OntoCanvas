import { describe, it, expect } from 'vitest';
import { markKind, markLayer, badgeFraction, cornerBadgeCenter, glyphFontSize, CornerStacker } from './classExpressionOverlay';
import type { ClassExpressionGroup } from '../types';

const g = (o: Partial<ClassExpressionGroup>): ClassExpressionGroup =>
  ({ operator: 'union', members: ['A', 'B'], propertyName: 'p', position: 'domain', propertyKind: 'object', counterparts: ['C'], ...o }) as ClassExpressionGroup;

describe('markKind: which mark a group gets (#59-#62)', () => {
  it('data-property groups are badged on their stub nodes', () => {
    expect(markKind(g({ propertyKind: 'data' }))).toBe('stubBadge');
    expect(markKind(g({ propertyKind: 'data', operator: 'oneOf', members: [], counterparts: ['S'], values: ['x'] }))).toBe('stubBadge');
  });

  it('object-property groups with 2+ members get the dot-line-dot connector (union, intersection, multi-class oneOf)', () => {
    expect(markKind(g({}))).toBe('connector');
    expect(markKind(g({ operator: 'intersection' }))).toBe('connector');
    expect(markKind(g({ operator: 'oneOf', values: ['i', 'j'] }))).toBe('connector');
  });

  it('a single-member object group gets one badge on its edge (complement, single-class oneOf)', () => {
    expect(markKind(g({ operator: 'complement', members: ['A'] }))).toBe('edgeBadge');
    expect(markKind(g({ operator: 'oneOf', members: ['A'], values: ['i'] }))).toBe('edgeBadge');
  });

  it('a member-less object group (untyped oneOf) is badged on the counterpart nodes', () => {
    expect(markKind(g({ operator: 'oneOf', members: [], values: ['i'] }))).toBe('nodeBadge');
  });

  it('nothing to draw without a counterpart for object groups', () => {
    expect(markKind(g({ counterparts: [] }))).toBeNull();
    expect(markKind(g({ operator: 'oneOf', members: [], values: ['i'], counterparts: [] }))).toBeNull();
  });
});

describe('badgeFraction', () => {
  it('sits near the expression end of the edge, measured from the domain end', () => {
    expect(badgeFraction('domain')).toBe(0.25);
    expect(badgeFraction('range')).toBe(0.75);
  });
});

describe('cornerBadgeCenter', () => {
  const box = { left: 0, top: 0, right: 100, bottom: 40 };
  it('domain marks go top-left, range marks top-right, nudged onto the node corner', () => {
    expect(cornerBadgeCenter(box, 'domain', 0, 10)).toEqual({ x: 6, y: 6 });
    expect(cornerBadgeCenter(box, 'range', 0, 10)).toEqual({ x: 94, y: 6 });
  });

  it('stacks further badges on the same corner inward along the top edge', () => {
    expect(cornerBadgeCenter(box, 'domain', 1, 10)).toEqual({ x: 28, y: 6 });
    expect(cornerBadgeCenter(box, 'range', 1, 10)).toEqual({ x: 72, y: 6 });
  });
});

describe('CornerStacker', () => {
  it('counts badges per node corner, resetting nothing between different corners', () => {
    const s = new CornerStacker();
    expect(s.next('n', 'domain')).toBe(0);
    expect(s.next('n', 'domain')).toBe(1);
    expect(s.next('n', 'range')).toBe(0);
    expect(s.next('m', 'domain')).toBe(0);
  });
});

describe('glyphFontSize', () => {
  it('keeps single-character glyphs at the base size and shrinks wider ones to fit the badge', () => {
    expect(glyphFontSize('∪', 20)).toBe(20);
    expect(glyphFontSize('¬', 16)).toBe(16);
    expect(glyphFontSize('{}', 20)).toBe(15);
  });
});

describe('markLayer', () => {
  it('edge marks sit between edge lines and labels; corner badges on nodes stay on top', () => {
    expect(markLayer('connector')).toBe('edges');
    expect(markLayer('edgeBadge')).toBe('edges');
    expect(markLayer('nodeBadge')).toBe('nodes');
    expect(markLayer('stubBadge')).toBe('nodes');
  });
});
