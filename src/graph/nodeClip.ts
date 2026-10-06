/**
 * Geometry for clipping edge lines out of node shapes, so an edge is only visible between the node
 * outlines even when a node is semi-transparent (imported terms). Pure (plain node data in, boxes out)
 * so it can be unit-tested; the canvas side is in ui/edgeNodeClipping.ts. See issue #71.
 */

/** A node's drawn outline: a (rounded) rectangle in canvas coordinates. */
export interface ClipBox {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
}

export interface ViewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A vis node, as far as clipping needs: centre, sized shape, options. */
export interface ClipNodeLike {
  x?: number;
  y?: number;
  options?: { hidden?: boolean; shape?: string; shapeProperties?: { borderRadius?: number } };
  shape?: { width?: number; height?: number };
}

/** vis-network's default box corner radius (nodes.shapeProperties.borderRadius). */
const VIS_DEFAULT_BORDER_RADIUS = 6;

/** The outline vis draws for a `box` node (centred on x/y, sized by its shape), or null when it can't
 * be clipped: hidden, not sized yet, or another shape (left unclipped rather than mis-clipped). */
export function nodeClipBox(node: ClipNodeLike): ClipBox | null {
  const { x, y, options, shape } = node;
  if (options?.hidden || options?.shape !== 'box') return null;
  const width = shape?.width;
  const height = shape?.height;
  if (x == null || y == null || !(width! > 0) || !(height! > 0)) return null;
  const radius = Math.min(options.shapeProperties?.borderRadius ?? VIS_DEFAULT_BORDER_RADIUS, width! / 2, height! / 2);
  return { left: x - width! / 2, top: y - height! / 2, width: width!, height: height!, radius };
}

/** Boxes overlapping the visible area — only these need clipping in a frame. */
export function boxesInView(boxes: ClipBox[], view: ViewRect): ClipBox[] {
  return boxes.filter(
    (b) => b.left < view.right && b.left + b.width > view.left && b.top < view.bottom && b.top + b.height > view.top,
  );
}

/** The visible area in canvas coordinates: the canvas pixel rectangle (0,0)–(width,height) mapped
 * back through the inverse of the context's current transform. */
export function viewRect(inverse: (x: number, y: number) => { x: number; y: number }, width: number, height: number): ViewRect {
  const a = inverse(0, 0);
  const b = inverse(width, height);
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) };
}
