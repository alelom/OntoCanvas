/**
 * Vertical placement of the data-property boxes drawn in rows under their class. Pure so it can be
 * unit-tested; main.ts lays the rows out. See issue #72.
 */

/** Minimum visible length (canvas units) of the edge between a class and its first row of data-property
 * boxes: room for the ~18px arrowhead plus a visible stretch of line, so the arrow never sits inside the
 * class box. */
export const MIN_DATA_PROPERTY_EDGE_LENGTH = 34;

/** Line-height ratio and box margin vis-network uses for a `box` node's label. */
const LINE_HEIGHT_RATIO = 1.35;
const VIS_BOX_MARGIN = 5;
/** Data-property boxes show the name and, usually, the datatype on a second line. */
const PROPERTY_BOX_LINES = 2;

/** Offset from the class centre to the centre of the first row of data-property boxes: half the class
 * height, the minimum edge length, then half a (two-line) property box — so the gap is measured from
 * the class's bottom edge to the boxes' top edge. `classHeight` should be estimated from the label as
 * drawn (prefix included). */
export function firstDataPropertyRowOffset(classHeight: number, propertyFontSize: number): number {
  const propertyHalfHeight = (PROPERTY_BOX_LINES * propertyFontSize * LINE_HEIGHT_RATIO) / 2 + VIS_BOX_MARGIN;
  return classHeight / 2 + MIN_DATA_PROPERTY_EDGE_LENGTH + propertyHalfHeight;
}
