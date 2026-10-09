/**
 * The one hover tooltip on the canvas (#109): class and data-property nodes, edge lines, edge labels and
 * class-expression marks all show their text in it, straight away. vis-network's own tooltip is hidden in
 * style.css; it appeared after a delay, in another style, and repeated the same text.
 */

let tooltipEl: HTMLDivElement | null = null;

/** Show `text` next to the cursor at (clientX, clientY). */
export function showCanvasTooltip(text: string, clientX: number, clientY: number): void {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'canvas-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);
  }
  tooltipEl.textContent = text;
  tooltipEl.style.display = 'block';
  // Offset slightly from the cursor.
  tooltipEl.style.left = `${clientX + 12}px`;
  tooltipEl.style.top = `${clientY + 12}px`;
}

export function hideCanvasTooltip(): void {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

/** What is under the cursor that can have a tooltip, from the most specific to the least: an edge label
 * (drawn over nodes and lines), a class-expression mark, a node, then an edge line. */
export interface TooltipCandidates {
  edgeLabel?: string | null;
  expressionMark?: string | null;
  node?: string | null;
  edgeLine?: string | null;
}

/** The tooltip text to show, or null for none. */
export function pickTooltip(c: TooltipCandidates): string | null {
  return c.edgeLabel || c.expressionMark || c.node || c.edgeLine || null;
}
