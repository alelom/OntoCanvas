/**
 * Placement for data properties that assert no rdfs:domain (pure, no DOM, no vis-network).
 *
 * These properties belong to no class, so they cannot be laid out relative to one. They are
 * gathered into their own wrapped row band beneath the class graph, where they read as free-standing
 * rather than as something attached to whichever class happened to be nearby.
 */

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Bounding box of the laid-out class nodes, or null when there are none. */
export function boundsOf(positions: Iterable<Point>): Bounds | null {
  let bounds: Bounds | null = null;
  for (const { x, y } of positions) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!bounds) {
      bounds = { minX: x, minY: y, maxX: x, maxY: y };
      continue;
    }
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  return bounds;
}

export interface UnattachedLayoutOptions {
  /** Gap left between the lowest class node and the first band row. */
  topMargin?: number;
  /** Horizontal gap between adjacent items. */
  horizontalSpacing?: number;
  /** Vertical gap between band rows. */
  rowSpacing?: number;
  /** Width at which the band wraps to a new row. Defaults to the class graph's width. */
  maxRowWidth?: number;
}

/**
 * Lay the given item widths out as a centred, wrapping row band below `bounds`.
 *
 * Returns one centre point per item, in input order. With no bounds (an ontology of nothing but
 * domainless properties) the band is centred on the origin.
 */
export function layoutUnattachedNodes(
  widths: number[],
  bounds: Bounds | null,
  options: UnattachedLayoutOptions = {}
): Point[] {
  if (widths.length === 0) return [];

  const topMargin = options.topMargin ?? 120;
  const horizontalSpacing = options.horizontalSpacing ?? 15;
  const rowSpacing = options.rowSpacing ?? 40;
  const centerX = bounds ? (bounds.minX + bounds.maxX) / 2 : 0;
  const startY = (bounds ? bounds.maxY : 0) + topMargin;
  const graphWidth = bounds ? bounds.maxX - bounds.minX : 0;
  const maxRowWidth = Math.max(options.maxRowWidth ?? graphWidth, 400);

  // Group into rows first, so each row can be centred once its full width is known.
  const rows: number[][] = [];
  let currentRow: number[] = [];
  let currentWidth = 0;
  widths.forEach((width, index) => {
    const added = currentRow.length === 0 ? width : width + horizontalSpacing;
    if (currentRow.length > 0 && currentWidth + added > maxRowWidth) {
      rows.push(currentRow);
      currentRow = [index];
      currentWidth = width;
      return;
    }
    currentRow.push(index);
    currentWidth += added;
  });
  if (currentRow.length > 0) rows.push(currentRow);

  const points: Point[] = new Array(widths.length);
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.reduce((sum, i) => sum + widths[i], 0) + horizontalSpacing * (row.length - 1);
    let x = centerX - rowWidth / 2;
    const y = startY + rowIndex * rowSpacing;
    for (const i of row) {
      points[i] = { x: x + widths[i] / 2, y };
      x += widths[i] + horizontalSpacing;
    }
  });
  return points;
}
