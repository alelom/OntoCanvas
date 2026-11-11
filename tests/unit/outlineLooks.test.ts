/**
 * The looks of the graph's outlines: the search's (#84) and a query result's (#207). Both pulse, each with keyframes of its own
 * (red and blue), and neither moves when the person asks the system for reduced motion.
 */
import { describe, it, expect } from 'vitest';
import { RESULT_LOOK, SEARCH_LOOK } from '../../src/ui/searchOutlineOverlay';

describe('the outline of a query result', () => {
  const css = RESULT_LOOK.css(RESULT_LOOK.overlayId);

  it('pulses in blue, like the search outline does in red, on keyframes of its own', () => {
    expect(css).toMatch(/\.oc-mark \{[^}]*stroke: #1a73e8;[^}]*animation: oc-result-mark /);
    expect(css).toMatch(/\.oc-halo \{[^}]*animation: oc-result-halo /);
    expect(css).toContain('@keyframes oc-result-mark');
    expect(css).toContain('@keyframes oc-result-halo');
    expect(SEARCH_LOOK.css(SEARCH_LOOK.overlayId)).not.toContain('oc-result-');
  });

  it('does not move with reduced motion', () => {
    expect(css).toContain(`@media (prefers-reduced-motion: reduce) { #${RESULT_LOOK.overlayId} .oc-outline { animation: none; } }`);
  });
});
