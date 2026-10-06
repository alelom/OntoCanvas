import { describe, it, expect } from 'vitest';
import {
  defaultMaxFontSize,
  fontSettingRatios,
  DEFAULT_MIN_FONT_SIZE,
  DEFAULT_RELATIONSHIP_FONT_SIZE,
  DEFAULT_DATA_PROPERTY_FONT_SIZE,
} from './fontSizeDefaults';

describe('defaultMaxFontSize', () => {
  it('uses a small Max for tiny ontologies (in the ~30-35 sweet spot)', () => {
    expect(defaultMaxFontSize(1)).toBe(33);
    expect(defaultMaxFontSize(3)).toBe(33);
    expect(defaultMaxFontSize(6)).toBeGreaterThanOrEqual(33);
    expect(defaultMaxFontSize(6)).toBeLessThanOrEqual(37);
  });

  it('uses the full Max for large ontologies', () => {
    expect(defaultMaxFontSize(45)).toBe(70);
    expect(defaultMaxFontSize(200)).toBe(70);
  });

  it('increases monotonically with node count', () => {
    let prev = 0;
    for (let n = 1; n <= 60; n++) {
      const v = defaultMaxFontSize(n);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(33);
      expect(v).toBeLessThanOrEqual(70);
      prev = v;
    }
  });

  it('handles non-finite input defensively', () => {
    expect(defaultMaxFontSize(NaN)).toBe(33);
  });
});

describe('fontSettingRatios: each font setting relative to its default (for sizing class-expression badges)', () => {
  const defaults = (n: number) => ({
    minFontSize: DEFAULT_MIN_FONT_SIZE,
    maxFontSize: defaultMaxFontSize(n),
    relationshipFontSize: DEFAULT_RELATIONSHIP_FONT_SIZE,
    dataPropertyFontSize: DEFAULT_DATA_PROPERTY_FONT_SIZE,
  });

  it('is 1 for every font at the defaults, whatever the graph size (adaptive node max)', () => {
    for (const n of [2, 12, 30, 100]) expect(fontSettingRatios(defaults(n), n)).toEqual({ node: 1, relationship: 1, dataProperty: 1 });
  });

  it('averages node min and max, each against its own default', () => {
    const n = 100; // default max 70
    expect(fontSettingRatios({ ...defaults(n), minFontSize: 40 }, n).node).toBeCloseTo(1.5, 10);
    expect(fontSettingRatios({ ...defaults(n), maxFontSize: 35 }, n).node).toBeCloseTo(0.75, 10);
  });

  it('scales relationship and data-property fonts against their defaults', () => {
    const r = fontSettingRatios({ ...defaults(10), relationshipFontSize: 36, dataPropertyFontSize: 6 }, 10);
    expect(r.relationship).toBeCloseTo(2, 10);
    expect(r.dataProperty).toBeCloseTo(0.5, 10);
  });
});
