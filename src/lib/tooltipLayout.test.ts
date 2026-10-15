import { describe, it, expect } from 'vitest';
import { previewBoxSize, tooltipPlacement } from './tooltipLayout';

describe('previewBoxSize (#142)', () => {
  it('is 280 × 200 in a full window', () => {
    expect(previewBoxSize({ width: 1600, height: 900 })).toEqual({ width: 280, height: 200 });
  });

  it('shrinks with a small window, such as an embedding iframe', () => {
    expect(previewBoxSize({ width: 400, height: 300 })).toEqual({ width: 180, height: 105 });
  });

  it('is dropped when the window is too small to show an image usefully', () => {
    expect(previewBoxSize({ width: 240, height: 200 })).toBeNull();
    expect(previewBoxSize({ width: 800, height: 220 })).toBeNull();
  });
});

describe('tooltipPlacement (#142)', () => {
  const viewport = { width: 800, height: 600 };
  const size = { width: 300, height: 260 };

  it('goes below and to the right of the cursor when it fits', () => {
    expect(tooltipPlacement({ x: 100, y: 100 }, size, viewport)).toEqual({ left: 112, top: 112 });
  });

  it('flips to the left near the right edge, and above near the bottom edge', () => {
    expect(tooltipPlacement({ x: 700, y: 500 }, size, viewport)).toEqual({ left: 388, top: 228 });
  });

  it('stays inside the window when it fits on neither side', () => {
    const p = tooltipPlacement({ x: 200, y: 150 }, { width: 380, height: 280 }, { width: 400, height: 300 });
    expect(p.left).toBeGreaterThanOrEqual(4);
    expect(p.top).toBeGreaterThanOrEqual(4);
    expect(p.left + 380).toBeLessThanOrEqual(396);
    expect(p.top + 280).toBeLessThanOrEqual(296);
  });
});
