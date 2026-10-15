/**
 * The state of the example-image carousel in the hover tooltip (#142). Pure; the DOM and the timer live in
 * src/ui/canvasTooltip.ts.
 */

/** How long each image shows before the next one fades in. */
export const CAROUSEL_INTERVAL_MS = 2000;

export interface CarouselState {
  index: number;
  count: number;
  /** Rotates by itself. Off for a single image, with reduced motion, and for good after a manual step. */
  autoplay: boolean;
}

export function createCarousel(count: number, opts: { reducedMotion?: boolean } = {}): CarouselState {
  return { index: 0, count, autoplay: count > 1 && !opts.reducedMotion };
}

function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}

/** The timer's step: the next image, when autoplaying. */
export function autoAdvance(s: CarouselState): CarouselState {
  if (!s.autoplay || s.count < 2) return s;
  return { ...s, index: wrap(s.index + 1, s.count) };
}

/** A click on ‹ or ›: moves one image and stops autoplay for good. */
export function stepCarousel(s: CarouselState, direction: -1 | 1): CarouselState {
  if (s.count < 2) return s;
  return { index: wrap(s.index + direction, s.count), count: s.count, autoplay: false };
}

export function carouselCounter(s: CarouselState): string {
  return `${s.index + 1}/${s.count}`;
}
