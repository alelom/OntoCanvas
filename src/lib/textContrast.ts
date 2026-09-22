/**
 * Readable-label colour selection (pure, no DOM, no vis-network).
 *
 * Node fills are user-configurable (annotation-property styling, default style) and can land
 * on any colour, including ones identical to a fixed label colour — which makes the label
 * invisible. Instead of hardcoding the label colour, callers derive it from the fill here.
 *
 * Contrast is measured with the WCAG 2.x relative-luminance formula.
 */
import { CANVAS_BACKGROUND, NODE_LABEL_BLACK, NODE_LABEL_DARK, NODE_LABEL_LIGHT } from '../ui/constants';

/** WCAG AA contrast ratio for normal-size text. Always reachable with black or white. */
export const MIN_CONTRAST_AA = 4.5;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parse `#rgb`, `#rrggbb`, `rgb(...)` or `rgba(...)`. Returns null for anything else. */
export function parseColor(color: string): Rgb | null {
  const value = color.trim();

  const hexMatch = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hexMatch) {
    const hex = hexMatch[1];
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
    };
  }

  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/i.exec(value);
  if (rgbMatch) {
    return { r: Number(rgbMatch[1]), g: Number(rgbMatch[2]), b: Number(rgbMatch[3]) };
  }

  return null;
}

/** WCAG relative luminance in [0, 1]. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (v: number): number => {
    const s = Math.min(Math.max(v, 0), 255) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio in [1, 21]. Unparseable colours yield 1 (worst case). */
export function contrastRatio(a: string, b: string): number {
  const rgbA = parseColor(a);
  const rgbB = parseColor(b);
  if (!rgbA || !rgbB) return 1;
  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const [hi, lo] = lumA >= lumB ? [lumA, lumB] : [lumB, lumA];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite `color` at `alpha` over `background`, giving the colour actually seen on screen.
 * A faded node shows a mix of its fill and the canvas, so that mix — not the raw fill — is
 * what the label has to stand out against.
 */
export function blendOverBackground(color: string, alpha: number, background: string = CANVAS_BACKGROUND): Rgb | null {
  const fg = parseColor(color);
  if (!fg) return null;
  const a = Math.min(Math.max(alpha, 0), 1);
  if (a >= 1) return fg;
  const bg = parseColor(background) ?? { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  };
}

export interface ReadableTextColorOptions {
  /** Node opacity in [0, 1]; the fill is composited over the canvas before measuring. */
  opacity?: number;
  /** Colour the node is drawn on top of. Defaults to the graph canvas colour. */
  canvasBackground?: string;
  /** Candidate label colours, tried in order; the highest-contrast one wins. Disables escalation. */
  candidates?: readonly string[];
}

/** Highest-contrast candidate against `background`; ties keep the earlier candidate. */
function pickBest(candidates: readonly string[], background: string): { color: string; ratio: number } {
  let color = candidates[0];
  let ratio = -1;
  for (const candidate of candidates) {
    const r = contrastRatio(candidate, background);
    if (r > ratio) {
      color = candidate;
      ratio = r;
    }
  }
  return { color, ratio };
}

/**
 * Pick the label colour with the best contrast against `background`.
 *
 * The house colours (dark slate, white) are tried first so the usual look is preserved. Mid-tone
 * fills are too close to the slate to reach WCAG AA, so those escalate to pure black/white, which
 * clears AA against any colour.
 */
export function readableTextColor(background: string, options: ReadableTextColorOptions = {}): string {
  const canvas = options.canvasBackground ?? CANVAS_BACKGROUND;
  const effective = blendOverBackground(background, options.opacity ?? 1, canvas);

  if (options.candidates) {
    if (!effective) return options.candidates[0];
    return pickBest(options.candidates, rgbToCss(effective)).color;
  }
  if (!effective) return NODE_LABEL_DARK;

  const effectiveCss = rgbToCss(effective);
  const preferred = pickBest([NODE_LABEL_DARK, NODE_LABEL_LIGHT], effectiveCss);
  if (preferred.ratio >= MIN_CONTRAST_AA) return preferred.color;

  const escalated = pickBest([NODE_LABEL_BLACK, NODE_LABEL_LIGHT], effectiveCss);
  return escalated.ratio > preferred.ratio ? escalated.color : preferred.color;
}

function rgbToCss({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}
