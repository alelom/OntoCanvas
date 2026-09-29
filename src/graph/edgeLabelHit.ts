/**
 * Hit-testing for relationship (edge) label boxes.
 *
 * vis-network selects/hovers an edge by proximity to its line, not its label. To let users
 * interact with an edge by clicking (or hovering) its label box, we test the pointer against
 * each edge label's rectangle ourselves. This module holds the pure geometry; the adapter that
 * reads the boxes out of the live network lives in the caller.
 */

export interface EdgeLabelBox {
  id: string;
  /** Rectangle in canvas coordinates (same space as Network.DOMtoCanvas output). */
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Return the id of the edge whose label box contains `point`, or null if none does.
 * Boxes are tested last-first so the most-recently-drawn (topmost) label wins on overlap.
 */
export function findEdgeIdAtLabelPoint(
  boxes: EdgeLabelBox[],
  point: { x: number; y: number }
): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (b.width <= 0 || b.height <= 0) continue;
    if (
      point.x >= b.left &&
      point.x <= b.left + b.width &&
      point.y >= b.top &&
      point.y <= b.top + b.height
    ) {
      return b.id;
    }
  }
  return null;
}
