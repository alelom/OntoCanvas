import type { GraphEdge, NodeDimensions } from '../types';
import { computeHierarchical01 } from './hierarchical01';
import { computeHierarchical02 } from './hierarchical02';

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
  'hierarchical01': computeHierarchical01,
  'hierarchical02': computeHierarchical02,
  // Backward compatibility: 'weighted' maps to hierarchical01
  'weighted': computeHierarchical01,
};

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
