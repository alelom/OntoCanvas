import { describe, it, expect } from 'vitest';
import { defaultMaxFontSize } from './fontSizeDefaults';

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
