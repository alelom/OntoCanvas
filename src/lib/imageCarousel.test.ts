import { describe, it, expect } from 'vitest';
import { createCarousel, autoAdvance, stepCarousel, carouselCounter, CAROUSEL_INTERVAL_MS } from './imageCarousel';

describe('image carousel state (#142)', () => {
  it('rotates every 2 s', () => {
    expect(CAROUSEL_INTERVAL_MS).toBe(2000);
  });

  it('starts on the first image, autoplaying when there are several', () => {
    expect(createCarousel(3)).toEqual({ index: 0, count: 3, autoplay: true });
    expect(createCarousel(1).autoplay).toBe(false);
  });

  it('does not autoplay when reduced motion is asked for', () => {
    expect(createCarousel(3, { reducedMotion: true }).autoplay).toBe(false);
  });

  it('advances by itself and wraps around', () => {
    let s = createCarousel(3);
    s = autoAdvance(s);
    expect(carouselCounter(s)).toBe('2/3');
    s = autoAdvance(autoAdvance(s));
    expect(carouselCounter(s)).toBe('1/3');
  });

  it('a manual step moves either way, wraps, and stops autoplay for good', () => {
    let s = stepCarousel(createCarousel(3), -1);
    expect(s).toEqual({ index: 2, count: 3, autoplay: false });
    expect(autoAdvance(s)).toEqual(s);
    s = stepCarousel(s, 1);
    expect(s.index).toBe(0);
    expect(s.autoplay).toBe(false);
  });

  it('a lone image never moves', () => {
    const s = createCarousel(1);
    expect(autoAdvance(s)).toEqual(s);
    expect(stepCarousel(s, 1).index).toBe(0);
  });
});
