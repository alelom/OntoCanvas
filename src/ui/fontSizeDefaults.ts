/**
 * Default "Max" node font size, adapted to how many nodes are displayed.
 *
 * Node font size is interpolated per depth between Min and Max (roots get Max, leaves get Min).
 * A large Max makes the root→leaf size gap big — useful to read *large* ontologies, but excessive
 * for small ones. So the DEFAULT Max scales with node count: small graphs get a gentle gap, large
 * graphs keep the full disparity. An explicit user/saved value always wins over this default.
 */

/** Below this many nodes, use the smallest default Max. */
const SMALL_NODES = 3;
/** At/above this many nodes, use the full default Max. */
const LARGE_NODES = 45;
/** Default Max for small graphs (within the ~30–35 sweet spot). */
const SMALL_MAX = 33;
/** Default Max for large graphs (the historical default). */
const LARGE_MAX = 70;

/**
 * Empirical default for the "Max" node font size given the number of displayed nodes.
 * Linear between (SMALL_NODES → SMALL_MAX) and (LARGE_NODES → LARGE_MAX), clamped to both ends.
 */
export function defaultMaxFontSize(nodeCount: number): number {
  if (!Number.isFinite(nodeCount) || nodeCount <= SMALL_NODES) return SMALL_MAX;
  if (nodeCount >= LARGE_NODES) return LARGE_MAX;
  const t = (nodeCount - SMALL_NODES) / (LARGE_NODES - SMALL_NODES);
  return Math.round(SMALL_MAX + (LARGE_MAX - SMALL_MAX) * t);
}

/** Default font sizes of the other display settings (as in the Text display options). */
export const DEFAULT_MIN_FONT_SIZE = 20;
export const DEFAULT_RELATIONSHIP_FONT_SIZE = 18;
export const DEFAULT_DATA_PROPERTY_FONT_SIZE = 12;

export interface FontSettings {
  minFontSize: number;
  maxFontSize: number;
  relationshipFontSize: number;
  dataPropertyFontSize: number;
}

/** Each display font relative to its default — 1 everywhere at the defaults. The node ratio averages
 * Min and Max, each against its own default (Max's default adapts to `nodeCount`). Used to size the
 * class-expression badges along with the text around them. */
export function fontSettingRatios(s: FontSettings, nodeCount: number): { node: number; relationship: number; dataProperty: number } {
  return {
    node: (s.minFontSize / DEFAULT_MIN_FONT_SIZE + s.maxFontSize / defaultMaxFontSize(nodeCount)) / 2,
    relationship: s.relationshipFontSize / DEFAULT_RELATIONSHIP_FONT_SIZE,
    dataProperty: s.dataPropertyFontSize / DEFAULT_DATA_PROPERTY_FONT_SIZE,
  };
}

/** The node font at `depth`, as the graph draws it: interpolated from Max (roots) to Min (deepest);
 * every node gets Max when the graph has no depth. */
function nodeFontAtDepth(min: number, max: number, depth: number, maxDepth: number): number {
  return maxDepth > 0 ? min + ((max - min) * (maxDepth - depth)) / maxDepth : max;
}

/** A node's font relative to what the default settings would give it at the same depth: 1 everywhere at
 * the defaults; follows Max for roots, Min for the deepest nodes, Max alone in a flat graph. */
export function nodeFontRatio(s: FontSettings, depth: number, maxDepth: number, nodeCount: number): number {
  const current = nodeFontAtDepth(s.minFontSize, s.maxFontSize, depth, maxDepth);
  const byDefault = nodeFontAtDepth(DEFAULT_MIN_FONT_SIZE, defaultMaxFontSize(nodeCount), depth, maxDepth);
  return current / byDefault;
}
