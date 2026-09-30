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
