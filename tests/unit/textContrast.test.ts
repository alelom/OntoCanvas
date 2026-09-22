/**
 * Unit tests for readable node-label colour selection.
 *
 * Regression guard for the bug where a node's fill and its label colour were both the
 * hardcoded slate `#2c3e50`, rendering classes annotated with `labellableRoot true` as solid
 * black boxes with invisible text.
 */
import { describe, it, expect } from 'vitest';
import {
  parseColor,
  relativeLuminance,
  contrastRatio,
  blendOverBackground,
  readableTextColor,
  MIN_CONTRAST_AA,
} from '../../src/lib/textContrast';
import {
  ANNOTATION_FILL_PALETTE,
  CANVAS_BACKGROUND,
  DATA_PROPERTY_FILL,
  DEFAULT_BOOL_COLORS,
  DEFAULT_NODE_FALLBACK,
  DEFAULT_TEXT_COLOR,
  NODE_LABEL_DARK,
  NODE_LABEL_LIGHT,
} from '../../src/ui/constants';

const MIN_CONTRAST = MIN_CONTRAST_AA;

describe('parseColor', () => {
  it('parses six-digit hex with and without the hash', () => {
    expect(parseColor('#2c3e50')).toEqual({ r: 44, g: 62, b: 80 });
    expect(parseColor('2c3e50')).toEqual({ r: 44, g: 62, b: 80 });
  });

  it('expands three-digit hex', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor('#03a')).toEqual({ r: 0, g: 51, b: 170 });
  });

  it('parses rgb() and rgba()', () => {
    expect(parseColor('rgb(44, 62, 80)')).toEqual({ r: 44, g: 62, b: 80 });
    expect(parseColor('rgba(44, 62, 80, 0.65)')).toEqual({ r: 44, g: 62, b: 80 });
  });

  it('returns null for unsupported input', () => {
    expect(parseColor('rebeccapurple')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('spans the full range from black to white', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
});

describe('contrastRatio', () => {
  it('gives the maximum ratio for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
  });

  it('gives the minimum ratio for identical colours', () => {
    expect(contrastRatio('#2c3e50', '#2c3e50')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#2c3e50', '#e67e22')).toBeCloseTo(contrastRatio('#e67e22', '#2c3e50'), 5);
  });
});

describe('blendOverBackground', () => {
  it('returns the colour unchanged at full opacity', () => {
    expect(blendOverBackground('#2c3e50', 1)).toEqual({ r: 44, g: 62, b: 80 });
  });

  it('composites towards the canvas colour as opacity drops', () => {
    expect(blendOverBackground('#000000', 0.5, '#ffffff')).toEqual({ r: 128, g: 128, b: 128 });
    expect(blendOverBackground('#000000', 0, '#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('returns null for unparseable colours', () => {
    expect(blendOverBackground('nonsense', 0.5)).toBeNull();
  });
});

describe('readableTextColor', () => {
  it('uses light text on the dark slate fill that previously hid the label', () => {
    expect(readableTextColor('#2c3e50')).toBe(NODE_LABEL_LIGHT);
  });

  it('uses dark text on light fills', () => {
    expect(readableTextColor(DEFAULT_NODE_FALLBACK.fill)).toBe(NODE_LABEL_DARK);
    expect(readableTextColor(DATA_PROPERTY_FILL)).toBe(NODE_LABEL_DARK);
    expect(readableTextColor('#ffffff')).toBe(NODE_LABEL_DARK);
  });

  it('never returns a colour equal to the fill', () => {
    for (const fill of [NODE_LABEL_DARK, NODE_LABEL_LIGHT, '#000000', '#7f8c8d']) {
      expect(readableTextColor(fill)).not.toBe(fill);
    }
  });

  it('switches back to dark text once a dark fill is faded into the canvas', () => {
    expect(readableTextColor('#2c3e50', { opacity: 1 })).toBe(NODE_LABEL_LIGHT);
    expect(readableTextColor('#2c3e50', { opacity: 0.08 })).toBe(NODE_LABEL_DARK);
  });

  it('falls back to the first candidate for unparseable fills', () => {
    expect(readableTextColor('nonsense')).toBe(NODE_LABEL_DARK);
  });

  it('honours custom candidates', () => {
    expect(readableTextColor('#ffffff', { candidates: ['#111111', '#222222'] })).toBe('#111111');
  });

  it('escalates to pure black on mid-tones the house slate cannot clear', () => {
    expect(readableTextColor('#16a085')).toBe('#000000');
    expect(readableTextColor('#95a5a6')).toBe('#000000');
  });
});

describe('every fill the UI can produce keeps its label legible', () => {
  const fills = [
    ...ANNOTATION_FILL_PALETTE,
    DEFAULT_BOOL_COLORS.whenTrue.fill,
    DEFAULT_BOOL_COLORS.whenFalse.fill,
    DEFAULT_BOOL_COLORS.whenUndefined.fill,
    DEFAULT_TEXT_COLOR.fill,
    DEFAULT_NODE_FALLBACK.fill,
    DATA_PROPERTY_FILL,
  ];

  it.each(fills)('%s meets WCAG AA', (fill) => {
    const textColor = readableTextColor(fill);
    expect(contrastRatio(textColor, fill)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('meets WCAG AA for arbitrary fills at the opacities the app uses', () => {
    const opacities = [1, 0.65, 0.3, 0.08];
    for (let r = 0; r <= 255; r += 51) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 51) {
          const fill = `rgb(${r}, ${g}, ${b})`;
          for (const opacity of opacities) {
            const blended = blendOverBackground(fill, opacity, CANVAS_BACKGROUND)!;
            const effective = `rgb(${blended.r}, ${blended.g}, ${blended.b})`;
            const textColor = readableTextColor(fill, { opacity });
            expect(
              contrastRatio(textColor, effective),
              `fill ${fill} at opacity ${opacity}`
            ).toBeGreaterThanOrEqual(MIN_CONTRAST);
          }
        }
      }
    }
  });
});
