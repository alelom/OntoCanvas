import type { GraphEdge, NodeDimensions } from '../types';
import { computeHierarchicalDag } from './hierarchicalDag';
import { computeHierarchicalTiersSpring } from './hierarchicalTiersSpring';
import { computeHierarchicalForceDownward } from './hierarchicalForceDownward';

/**
 * Layout algorithm function signature
 */
export type LayoutAlgorithm = (
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>
) => Record<string, { x: number; y: number }>;

/**
 * Registry of all available layout algorithms
 */
export const LAYOUT_ALGORITHMS: Record<string, LayoutAlgorithm> = {
  'hierarchical-dag': computeHierarchicalDag,
  'hierarchical-tiers-spring': computeHierarchicalTiersSpring,
  'hierarchical-force-downward': computeHierarchicalForceDownward,
};

/** Default layout mode, used when a requested mode does not exist (issue #19). */
export const DEFAULT_LAYOUT_MODE = 'hierarchical-dag';

/** Layout modes that produce an already-overlap-free / force-managed layout and therefore
 *  must NOT be post-processed by resolveOverlaps (its root-separation pass re-inflates them). */
export const SELF_CONTAINED_LAYOUT_MODES = new Set([
  'hierarchical-dag',
  'hierarchical-tiers-spring',
  'hierarchical-force-downward',
]);

/**
 * Get a layout algorithm by mode ID
 * @param mode Layout mode identifier
 * @returns Layout algorithm function or null if not found
 */
export function getLayoutAlgorithm(mode: string): LayoutAlgorithm | null {
  return LAYOUT_ALGORITHMS[mode] || null;
}

/**
 * Get all available layout mode IDs
 */
export function getAvailableLayoutModes(): string[] {
  return Object.keys(LAYOUT_ALGORITHMS);
}

/**
 * Resolve a requested layout mode to one that actually exists.
 *
 * Loaded styling configs may reference removed/legacy modes — the old numbered
 * hierarchical00/01/02/03 layouts or the 'weighted' alias — as well as unknown values.
 * When no match is found we fall back to the default DAG layout (issue #19).
 * 'force' is a valid physics mode even though it is not in the algorithm registry.
 */
export function resolveLayoutMode(mode: string | null | undefined): string {
  if (mode && (mode in LAYOUT_ALGORITHMS || mode === 'force')) {
    return mode;
  }
  return DEFAULT_LAYOUT_MODE;
}
