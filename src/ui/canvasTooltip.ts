/**
 * The one hover tooltip on the canvas (#109): class and data-property nodes, edge lines, edge labels and
 * class-expression marks all show their text in it, straight away. vis-network's own tooltip is hidden in
 * style.css; it appeared after a delay, in another style, and repeated the same text.
 *
 * A term with example images (#142) shows them under its text, in a box of fixed size, rotating every 2 s with a
 * cross-fade and a ‹ 1/3 › control. Such a tooltip stays where it opened and can be hovered and clicked; it closes a
 * moment after the cursor leaves both the term and the tooltip. A tooltip with text only follows the cursor.
 */
import { autoAdvance, carouselCounter, createCarousel, stepCarousel, CAROUSEL_INTERVAL_MS, type CarouselState } from '../lib/imageCarousel';
import { previewBoxSize, tooltipPlacement } from '../lib/tooltipLayout';

/** What a tooltip shows: text, then the term's example images (absolute addresses, in display order). */
export interface TooltipContent {
  text: string;
  images?: string[];
}

/** How long a tooltip with images stays after the cursor leaves the term, so the cursor can reach it. */
export const RICH_TOOLTIP_HIDE_DELAY_MS = 300;

let tooltipEl: HTMLDivElement | null = null;
/** Identifies the tooltip with images on show; null when the shown tooltip has text only, or none is shown. */
let richKey: string | null = null;
let pointerInside = false;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let stopCarousel: (() => void) | null = null;

function viewport(): { width: number; height: number } {
  return { width: window.innerWidth, height: window.innerHeight };
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureTooltip(): HTMLDivElement {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'canvas-tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.addEventListener('mouseenter', () => {
    pointerInside = true;
    cancelHide();
  });
  tooltipEl.addEventListener('mouseleave', () => {
    pointerInside = false;
    if (richKey) scheduleHide();
  });
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function cancelHide(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
}

function scheduleHide(): void {
  cancelHide();
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (!pointerInside) hideCanvasTooltip(true);
  }, RICH_TOOLTIP_HIDE_DELAY_MS);
}

function teardownCarousel(): void {
  stopCarousel?.();
  stopCarousel = null;
}

function placeAt(el: HTMLElement, clientX: number, clientY: number): void {
  const rect = el.getBoundingClientRect();
  const { left, top } = tooltipPlacement({ x: clientX, y: clientY }, { width: rect.width, height: rect.height }, viewport());
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/**
 * The image area: two stacked images for the cross-fade (the next one loads hidden, then fades in, so the box is never
 * blank), the "Image not available" fallback, and the ‹ n/m › control when there are several images.
 */
function renderImages(parent: HTMLElement, images: string[], box: { width: number; height: number }): () => void {
  let state: CarouselState = createCarousel(images.length, { reducedMotion: prefersReducedMotion() });
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const link = document.createElement('a');
  link.className = 'canvas-tooltip-preview';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = 'Open the image in a new tab';
  link.style.width = `${box.width}px`;
  link.style.height = `${box.height}px`;
  const layers = [document.createElement('img'), document.createElement('img')];
  layers.forEach((img) => {
    img.alt = 'Example image';
    img.className = 'canvas-tooltip-image';
    link.appendChild(img);
  });
  const missing = document.createElement('div');
  missing.className = 'canvas-tooltip-image-missing';
  link.appendChild(missing);
  parent.appendChild(link);

  let counter: HTMLSpanElement | null = null;
  if (images.length > 1) {
    const controls = document.createElement('div');
    controls.className = 'canvas-tooltip-carousel';
    const button = (text: string, label: string, direction: -1 | 1) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', (e) => {
        e.preventDefault();
        state = stepCarousel(state, direction);
        clearTimer();
        show(state.index);
      });
      return b;
    };
    counter = document.createElement('span');
    counter.className = 'canvas-tooltip-counter';
    controls.append(button('‹', 'Previous image', -1), counter, button('›', 'Next image', 1));
    parent.appendChild(controls);
  }

  let front = 0;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const scheduleNext = () => {
    clearTimer();
    if (stopped || !state.autoplay) return;
    timer = setTimeout(() => {
      state = autoAdvance(state);
      show(state.index);
    }, CAROUSEL_INTERVAL_MS);
  };

  /** Load image `index` in the hidden layer; once loaded (or failed), swap it in and update the counter. */
  const show = (index: number) => {
    const url = images[index];
    const back = 1 - front;
    const img = layers[back];
    const done = (ok: boolean) => {
      if (stopped || state.index !== index) return;
      layers[front].classList.remove('is-shown');
      img.classList.toggle('is-shown', ok);
      front = back;
      missing.replaceChildren();
      if (!ok) {
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = url;
        missing.append('Image not available', document.createElement('br'), a);
      }
      missing.classList.toggle('is-shown', !ok);
      link.href = url;
      if (counter) counter.textContent = carouselCounter(state);
      scheduleNext();
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
  };

  if (counter) counter.textContent = carouselCounter(state);
  show(0);
  return () => {
    stopped = true;
    clearTimer();
  };
}

/**
 * Show `content` next to the cursor at (clientX, clientY). A tooltip with images that is already showing the same
 * content stays where it is (the cursor is still over its term), so its controls can be reached.
 */
export function showCanvasTooltip(content: string | TooltipContent, clientX: number, clientY: number): void {
  const { text, images = [] } = typeof content === 'string' ? { text: content } : content;
  const el = ensureTooltip();
  cancelHide();

  if (images.length === 0) {
    if (richKey) teardownCarousel();
    richKey = null;
    el.classList.remove('canvas-tooltip--rich');
    el.textContent = text;
    el.style.display = 'block';
    placeAt(el, clientX, clientY);
    return;
  }

  const key = `${text}\n${images.join('\n')}`;
  if (richKey === key && el.style.display === 'block') return;
  teardownCarousel();
  richKey = key;
  el.classList.add('canvas-tooltip--rich');
  el.replaceChildren();
  const box = previewBoxSize(viewport());
  if (text) {
    const t = document.createElement('div');
    t.className = 'canvas-tooltip-text';
    t.textContent = text;
    // The comment wraps to the image's width, as the plain tooltip does to its own.
    t.style.maxWidth = `${box?.width ?? 300}px`;
    el.appendChild(t);
  }
  if (box) {
    stopCarousel = renderImages(el, images, box);
  } else {
    // Too small a window (e.g. a small embedding iframe) to preview; say that there are images, and link them.
    const note = document.createElement('div');
    note.className = 'canvas-tooltip-image-note';
    images.forEach((url, i) => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = images.length === 1 ? 'Example image' : `Example image ${i + 1}`;
      if (i > 0) note.append(' · ');
      note.append(a);
    });
    el.appendChild(note);
  }
  el.style.display = 'block';
  placeAt(el, clientX, clientY);
}

/**
 * Hide the tooltip. One with images closes after a short delay, and not while the cursor is over it, so the cursor
 * can move from the term onto it; `immediately` closes it at once (e.g. when the canvas starts panning).
 */
export function hideCanvasTooltip(immediately = false): void {
  if (!tooltipEl || tooltipEl.style.display === 'none') return;
  if (richKey && !immediately) {
    if (!pointerInside && !hideTimer) scheduleHide();
    return;
  }
  cancelHide();
  teardownCarousel();
  richKey = null;
  pointerInside = false;
  tooltipEl.style.display = 'none';
}

/** What is under the cursor that can have a tooltip, from the most specific to the least: an edge label
 * (drawn over nodes and lines), a class-expression mark, a node, then an edge line. */
export interface TooltipCandidates {
  edgeLabel?: string | TooltipContent | null;
  expressionMark?: string | TooltipContent | null;
  node?: string | TooltipContent | null;
  edgeLine?: string | TooltipContent | null;
}

function asContent(c: string | TooltipContent | null | undefined): TooltipContent | null {
  if (!c) return null;
  const content = typeof c === 'string' ? { text: c } : c;
  return content.text || content.images?.length ? content : null;
}

/** The tooltip to show, or null for none. */
export function pickTooltip(c: TooltipCandidates): TooltipContent | null {
  return asContent(c.edgeLabel) ?? asContent(c.expressionMark) ?? asContent(c.node) ?? asContent(c.edgeLine);
}
