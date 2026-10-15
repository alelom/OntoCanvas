// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pickTooltip, showCanvasTooltip, hideCanvasTooltip, RICH_TOOLTIP_HIDE_DELAY_MS } from '../../src/ui/canvasTooltip';

/** The canvas shows one tooltip (#109): the most specific thing under the cursor wins. */
describe('pickTooltip', () => {
  it('prefers an edge label, then a class-expression mark, then a node, then an edge line', () => {
    expect(pickTooltip({ edgeLabel: 'label', expressionMark: 'mark', node: 'node', edgeLine: 'line' })?.text).toBe('label');
    expect(pickTooltip({ expressionMark: 'mark', node: 'node', edgeLine: 'line' })?.text).toBe('mark');
    expect(pickTooltip({ node: 'node', edgeLine: 'line' })?.text).toBe('node');
    expect(pickTooltip({ edgeLine: 'line' })?.text).toBe('line');
  });

  it('skips empty text and returns null when nothing has a tooltip', () => {
    expect(pickTooltip({ edgeLabel: '', node: null, edgeLine: 'line' })?.text).toBe('line');
    expect(pickTooltip({})).toBeNull();
  });

  it('keeps a term with example images and no comment (#142)', () => {
    expect(pickTooltip({ node: { text: '', images: ['https://example.org/a.png'] } })).toEqual({
      text: '',
      images: ['https://example.org/a.png'],
    });
  });
});

/** Example images in the tooltip (#142). */
describe('the tooltip with example images', () => {
  const IMAGES = ['https://example.org/A_01.png', 'https://example.org/A_02.png', 'https://example.org/A_03.png'];
  const tooltip = () => document.querySelector('.canvas-tooltip') as HTMLDivElement;
  const counter = () => tooltip().querySelector('.canvas-tooltip-counter')?.textContent;
  const shownImage = () => (tooltip().querySelector('.canvas-tooltip-image.is-shown') as HTMLImageElement | null)?.src ?? null;
  /** jsdom loads no image: settle the pending one by hand. */
  const settle = (ok = true) => {
    const pending = [...tooltip().querySelectorAll<HTMLImageElement>('.canvas-tooltip-image')].find(
      (img) => !img.classList.contains('is-shown') && img.onload
    );
    if (ok) pending?.onload?.(new Event('load'));
    else pending?.onerror?.(new Event('error'));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  });
  afterEach(() => {
    hideCanvasTooltip(true);
    vi.useRealTimers();
  });

  it('shows the comment, then the first image in a fixed box, with a 1/3 counter', () => {
    showCanvasTooltip({ text: 'A comment', images: IMAGES }, 100, 100);
    settle();
    expect(tooltip().querySelector('.canvas-tooltip-text')?.textContent).toBe('A comment');
    expect(shownImage()).toBe(IMAGES[0]);
    expect(counter()).toBe('1/3');
    const box = tooltip().querySelector('.canvas-tooltip-preview') as HTMLAnchorElement;
    expect([box.style.width, box.style.height]).toEqual(['280px', '200px']);
    expect(box.href).toBe(IMAGES[0]);
    expect(box.target).toBe('_blank');
  });

  it('a single image has no carousel control', () => {
    showCanvasTooltip({ text: 'x', images: [IMAGES[0]] }, 100, 100);
    expect(tooltip().querySelector('.canvas-tooltip-carousel')).toBeNull();
  });

  it('rotates every 2 s, the next image showing once loaded', () => {
    showCanvasTooltip({ text: '', images: IMAGES }, 100, 100);
    settle();
    vi.advanceTimersByTime(1999);
    expect(counter()).toBe('1/3');
    vi.advanceTimersByTime(1);
    expect(counter()).toBe('1/3'); // the next one is loading, hidden
    settle();
    expect(counter()).toBe('2/3');
    expect(shownImage()).toBe(IMAGES[1]);
  });

  it('a click on › or ‹ moves one image and stops the rotation for good', () => {
    showCanvasTooltip({ text: '', images: IMAGES }, 100, 100);
    settle();
    const [prev] = tooltip().querySelectorAll<HTMLButtonElement>('.canvas-tooltip-carousel button');
    prev.click();
    settle();
    expect(counter()).toBe('3/3');
    vi.advanceTimersByTime(10_000);
    settle();
    expect(counter()).toBe('3/3');
  });

  it('pauses while the cursor is over the image', () => {
    showCanvasTooltip({ text: '', images: IMAGES }, 100, 100);
    settle();
    const box = tooltip().querySelector('.canvas-tooltip-preview')!;
    box.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(5000);
    settle();
    expect(counter()).toBe('1/3');
    box.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(2000);
    settle();
    expect(counter()).toBe('2/3');
  });

  it('an image that does not load says so, with its address', () => {
    showCanvasTooltip({ text: '', images: [IMAGES[0]] }, 100, 100);
    settle(false);
    const missing = tooltip().querySelector('.canvas-tooltip-image-missing.is-shown');
    expect(missing?.textContent).toContain('Image not available');
    expect(missing?.querySelector('a')?.href).toBe(IMAGES[0]);
  });

  it('stays where it opened while the cursor is over its term', () => {
    showCanvasTooltip({ text: 'x', images: IMAGES }, 100, 100);
    const { left, top } = tooltip().style;
    showCanvasTooltip({ text: 'x', images: IMAGES }, 140, 130);
    expect([tooltip().style.left, tooltip().style.top]).toEqual([left, top]);
  });

  it('closes a moment after the cursor leaves the term, unless it moved onto the tooltip', () => {
    showCanvasTooltip({ text: 'x', images: IMAGES }, 100, 100);
    hideCanvasTooltip();
    expect(tooltip().style.display).toBe('block');
    tooltip().dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(RICH_TOOLTIP_HIDE_DELAY_MS * 3);
    expect(tooltip().style.display).toBe('block');
    tooltip().dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(RICH_TOOLTIP_HIDE_DELAY_MS);
    expect(tooltip().style.display).toBe('none');
  });

  it('a text-only tooltip still closes at once', () => {
    showCanvasTooltip('plain', 100, 100);
    hideCanvasTooltip();
    expect(tooltip().style.display).toBe('none');
  });

  it('in a window too small for a preview (a small iframe), links the images instead', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 240 });
    showCanvasTooltip({ text: 'x', images: IMAGES }, 10, 10);
    expect(tooltip().querySelector('.canvas-tooltip-preview')).toBeNull();
    const links = [...tooltip().querySelectorAll<HTMLAnchorElement>('.canvas-tooltip-image-note a')];
    expect(links.map((a) => a.href)).toEqual(IMAGES);
  });

  it('does not rotate when reduced motion is asked for', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    try {
      showCanvasTooltip({ text: '', images: IMAGES }, 100, 100);
      settle();
      vi.advanceTimersByTime(5000);
      settle();
      expect(counter()).toBe('1/3');
    } finally {
      (window as { matchMedia?: unknown }).matchMedia = undefined;
    }
  });
});
