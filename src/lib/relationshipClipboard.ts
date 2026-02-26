import type { GraphEdge, GraphData } from '../types';
import type { Store } from 'n3';
import { addEdgeToStore } from '../parser';

/**
 * Represents a copied relationship that can be pasted to another node.
 * The 'from' property remains the same, but 'to' will be changed when pasting.
 */
export interface CopiedRelationship {
  from: string;
  type: string;
  minCardinality?: number | null;
  maxCardinality?: number | null;
  onClass?: string;
}

/**
 * Result of a paste operation.
 */
export interface PasteResult {
  success: boolean;
  addedEdges: GraphEdge[];
  failedEdges: Array<{ edge: CopiedRelationship; reason: string }>;
}

/**
 * Internal storage for copied relationships.
 */
let copiedRelationships: CopiedRelationship[] = [];

/**
 * Copy all relationships that target the given node.
 * Returns an array of relationships with all their properties.
 */
export function copyRelationshipsTargetingNode(
  nodeId: string,
  edges: GraphEdge[]
): CopiedRelationship[] {
  const relationships = edges
    .filter((edge) => edge.to === nodeId)
    .map((edge) => ({
      from: edge.from,
      type: edge.type,
      minCardinality: edge.minCardinality,
      maxCardinality: edge.maxCardinality,
      onClass: edge.onClass,
    }));
  
  copiedRelationships = relationships;
  return relationships;
}

/**
 * Check if there are any copied relationships available.
 */
export function hasCopiedRelationships(): boolean {
  return copiedRelationships.length > 0;
}

/**
 * Get the currently copied relationships (for display purposes).
 */
export function getCopiedRelationships(): CopiedRelationship[] {
  return [...copiedRelationships];
}

/**
 * Clear the clipboard.
 */
export function clearClipboard(): void {
  copiedRelationships = [];
}

/**
 * Paste copied relationships to a target node.
 * Creates new edges with the same 'from' and properties, but new 'to' (the target node).
 * 
 * @param targetNodeId - The node ID to paste relationships to
 * @param copiedRelationships - The relationships to paste
 * @param store - The TTL store to add edges to
 * @param rawData - The graph data to update
 * @returns Result indicating success/failure and which edges were added/failed
 */
export function pasteRelationshipsToNode(
  targetNodeId: string,
  copiedRelationships: CopiedRelationship[],
  store: Store,
  rawData: GraphData
): PasteResult {
  const addedEdges: GraphEdge[] = [];
  const failedEdges: Array<{ edge: CopiedRelationship; reason: string }> = [];

  for (const copiedEdge of copiedRelationships) {
    // Check if edge already exists
    const existingEdge = rawData.edges.find(
      (e) => e.from === copiedEdge.from && e.to === targetNodeId && e.type === copiedEdge.type
    );

    if (existingEdge) {
      failedEdges.push({
        edge: copiedEdge,
        reason: 'Edge already exists between these nodes',
      });
      continue;
    }

    // Create new edge with same properties but new target
    const newEdge: GraphEdge = {
      from: copiedEdge.from,
      to: targetNodeId,
      type: copiedEdge.type,
      minCardinality: copiedEdge.minCardinality,
      maxCardinality: copiedEdge.maxCardinality,
      onClass: copiedEdge.onClass,
    };

    // Add to store
    const cardinality = 
      newEdge.minCardinality != null || newEdge.maxCardinality != null
        ? {
            minCardinality: newEdge.minCardinality ?? null,
            maxCardinality: newEdge.maxCardinality ?? null,
          }
        : undefined;

    const success = addEdgeToStore(store, newEdge.from, newEdge.to, newEdge.type, cardinality);

    if (success) {
      // Add to rawData
      rawData.edges.push(newEdge);
      addedEdges.push(newEdge);
    } else {
      failedEdges.push({
        edge: copiedEdge,
        reason: 'Failed to add edge to store',
      });
    }
  }

  return {
    success: failedEdges.length === 0,
    addedEdges,
    failedEdges,
  };
}
