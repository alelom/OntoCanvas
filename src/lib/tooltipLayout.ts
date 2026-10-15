/**
 * Where the canvas tooltip goes and how big its example-image preview is (#142). Pure, in window (CSS) pixels.
 * OntoCanvas may be embedded in a small iframe, so both depend on the window's size.
 */

export interface Size {
  width: number;
  height: number;
}

const PREVIEW_MAX: Size = { width: 280, height: 200 };
const PREVIEW_MIN: Size = { width: 120, height: 90 };
const CURSOR_OFFSET = 12;
const EDGE_MARGIN = 4;

/** The fixed size of the image box for this window, or null when the window is too small to show one. */
export function previewBoxSize(viewport: Size): Size | null {
  const width = Math.min(PREVIEW_MAX.width, Math.round(viewport.width * 0.45));
  const height = Math.min(PREVIEW_MAX.height, Math.round(viewport.height * 0.35));
  if (width < PREVIEW_MIN.width || height < PREVIEW_MIN.height) return null;
  return { width, height };
}

/** One axis: after the cursor if it fits, else before it, else pushed inside the window. */
function place(cursor: number, size: number, viewport: number): number {
  const after = cursor + CURSOR_OFFSET;
  if (after + size <= viewport - EDGE_MARGIN) return after;
  const before = cursor - CURSOR_OFFSET - size;
  if (before >= EDGE_MARGIN) return before;
  return Math.max(EDGE_MARGIN, viewport - EDGE_MARGIN - size);
}

/** Top-left corner of the tooltip, next to the cursor and inside the window. */
export function tooltipPlacement(cursor: { x: number; y: number }, size: Size, viewport: Size): { left: number; top: number } {
  return { left: place(cursor.x, size.width, viewport.width), top: place(cursor.y, size.height, viewport.height) };
}
