import { describe, it, expect } from 'vitest';
import { markKind, markLayer, badgeFontScale, FONT_SCALE_MIN, FONT_SCALE_MAX, nodeBadgeTargets, partitionByEdge, propertyEdgeIds, badgeScale, BADGE_REFERENCE_LENGTH, BADGE_MIN_SCALE, BADGE_MAX_SCALE, badgeFraction, cornerBadgeCenter, glyphFontSize, CornerStacker } from './classExpressionOverlay';
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

  it('an object group with no other end (no range / domain, or owl:Thing) is badged on its own classes', () => {
    expect(markKind(g({ counterparts: [] }))).toBe('nodeBadge');
    expect(markKind(g({ operator: 'complement', members: ['A'], counterparts: [] }))).toBe('nodeBadge');
  });

  it('nothing to draw when neither end has a class on the graph', () => {
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

describe('badgeScale: badges follow the visible edge length, within limits', () => {
  it('is 1 at the reference length and grows / shrinks proportionally', () => {
    expect(badgeScale(BADGE_REFERENCE_LENGTH)).toBe(1);
    expect(badgeScale(BADGE_REFERENCE_LENGTH * 0.8)).toBeCloseTo(0.8, 5);
    expect(badgeScale(BADGE_REFERENCE_LENGTH * 1.2)).toBeCloseTo(1.2, 5);
  });

  it('is clamped so badges never get unreadably small or oversized', () => {
    expect(badgeScale(1)).toBe(BADGE_MIN_SCALE);
    expect(badgeScale(0)).toBe(BADGE_MIN_SCALE);
    expect(badgeScale(100000)).toBe(BADGE_MAX_SCALE);
    expect(BADGE_MIN_SCALE).toBeGreaterThan(0.4);
    expect(BADGE_MAX_SCALE).toBeLessThan(1.6);
  });

  it('keeps the default size when the length is unknown', () => {
    expect(badgeScale(null)).toBe(1);
  });
});

describe('nodeBadgeTargets: which nodes carry a corner badge', () => {
  it('the counterparts, when the expression has no member classes (untyped oneOf)', () => {
    expect(nodeBadgeTargets(g({ operator: 'oneOf', members: [], values: ['i'], counterparts: ['C'] }))).toEqual(['C']);
  });
  it("the expression's own classes, when there is no other end", () => {
    expect(nodeBadgeTargets(g({ members: ['A', 'B'], counterparts: [] }))).toEqual(['A', 'B']);
  });
});

describe('partitionByEdge: members whose edge to the counterpart is not drawn', () => {
  it('splits members by whether the member–counterpart edge exists', () => {
    const has = (m: string, c: string) => !(m === c); // self-loops are never drawn
    expect(partitionByEdge(['Agent', 'Doc'], 'Agent', has)).toEqual({ withEdge: ['Doc'], withoutEdge: ['Agent'] });
    expect(partitionByEdge(['A', 'B'], 'C', has)).toEqual({ withEdge: ['A', 'B'], withoutEdge: [] });
  });
});

describe('propertyEdgeIds: vis edge ids are `${from}->${to}:${type}`', () => {
  const FOAF = 'http://xmlns.com/foaf/0.1/';
  it('covers the property type as local name and as full URI', () => {
    expect(propertyEdgeIds('A', 'B', 'made', `${FOAF}made`)).toEqual(['A->B:made', `A->B:${FOAF}made`]);
    expect(propertyEdgeIds('A', 'B', 'made')).toEqual(['A->B:made']);
  });

  it('works with node ids that are full URIs', () => {
    expect(propertyEdgeIds(`${FOAF}Agent`, 'Doc', 'made')).toEqual([`${FOAF}Agent->Doc:made`]);
  });
});

describe('badgeFontScale: badges follow the display font settings, weighted by what they sit on', () => {
  const ones = { node: 1, relationship: 1, dataProperty: 1 };

  it('is exactly 1 at the default font settings, for every placement', () => {
    for (const placement of ['edge', 'node', 'dataProperty'] as const) expect(badgeFontScale(placement, ones)).toBeCloseTo(1, 10);
  });

  it('is led by the font of what the badge sits on (60%), blended with the others (25% / 15%)', () => {
    const relDoubled = { ...ones, relationship: 2 };
    expect(badgeFontScale('edge', relDoubled)).toBeCloseTo(1.6, 10);
    expect(badgeFontScale('node', relDoubled)).toBeCloseTo(1.25, 10);
    expect(badgeFontScale('dataProperty', relDoubled)).toBeCloseTo(1.25, 10);
    const nodeDoubled = { ...ones, node: 2 };
    expect(badgeFontScale('node', nodeDoubled)).toBeCloseTo(1.6, 10);
    expect(badgeFontScale('edge', nodeDoubled)).toBeCloseTo(1.25, 10);
    expect(badgeFontScale('dataProperty', nodeDoubled)).toBeCloseTo(1.15, 10);
  });

  it('moves all badges together when every font scales together', () => {
    for (const placement of ['edge', 'node', 'dataProperty'] as const) {
      expect(badgeFontScale(placement, { node: 0.5, relationship: 0.5, dataProperty: 0.5 })).toBeCloseTo(0.5, 10);
    }
  });

  it('is clamped', () => {
    expect(badgeFontScale('edge', { node: 50, relationship: 50, dataProperty: 50 })).toBe(FONT_SCALE_MAX);
    expect(badgeFontScale('edge', { node: 0.01, relationship: 0.01, dataProperty: 0.01 })).toBe(FONT_SCALE_MIN);
  });
});
