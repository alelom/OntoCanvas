import type { GraphEdge, NodeDimensions } from '../types';
import { computeHierarchical00 } from './hierarchical00';
import { computeHierarchical01 } from './hierarchical01';
import { computeHierarchical02 } from './hierarchical02';
import { computeHierarchical03 } from './hierarchical03';
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
  'hierarchical00': computeHierarchical00,
  'hierarchical01': computeHierarchical01,
  'hierarchical02': computeHierarchical02,
  'hierarchical03': computeHierarchical03,
  // Backward compatibility: 'weighted' maps to hierarchical01
  'weighted': computeHierarchical01,
};

/** Layout modes that produce an already-overlap-free / force-managed layout and therefore
 *  must NOT be post-processed by resolveOverlaps (its root-separation pass re-inflates them). */
export const SELF_CONTAINED_LAYOUT_MODES = new Set([
  'hierarchical00',
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
