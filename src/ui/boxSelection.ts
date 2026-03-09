/**
 * Box selection functionality for vis-network.
 * Handles drag-to-select multiple nodes and edges.
 */

import type { Network } from 'vis-network';
import { showSelectionRectangle, hideSelectionRectangle } from './boxSelectionRenderer';

export interface BoxSelectionState {
  isActive: boolean;
  startPos: { x: number; y: number } | null;
  currentPos: { x: number; y: number } | null;
  minDragDistance: number;
  dragDistance: number;
  modifierKeys: { ctrl: boolean; shift: boolean };
}

const DEFAULT_MIN_DRAG_DISTANCE = 10;

/**
 * Create a new box selection state.
 */
export function createBoxSelectionState(minDragDistance = DEFAULT_MIN_DRAG_DISTANCE): BoxSelectionState {
  return {
    isActive: false,
    startPos: null,
    currentPos: null,
    minDragDistance,
    dragDistance: 0,
    modifierKeys: { ctrl: false, shift: false },
  };
}

/**
 * Calculate distance between two points.
 */
function calculateDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

/**
 * Check if a point is inside a rectangle.
 */
function isPointInRectangle(
  point: { x: number; y: number },
  rect: { left: number; top: number; right: number; bottom: number }
): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

/**
 * Check if a rectangle intersects with another rectangle (for node bounding boxes).
 */
function rectanglesIntersect(
  rect1: { left: number; top: number; right: number; bottom: number },
  rect2: { left: number; top: number; right: number; bottom: number }
): boolean {
  return !(
    rect1.right < rect2.left ||
    rect1.left > rect2.right ||
    rect1.bottom < rect2.top ||
    rect1.top > rect2.bottom
  );
}

/**
 * Get the selection rectangle bounds from start and current positions.
 */
function getSelectionRectangle(
  startPos: { x: number; y: number },
  currentPos: { x: number; y: number }
): { left: number; top: number; right: number; bottom: number } {
  const left = Math.min(startPos.x, currentPos.x);
  const right = Math.max(startPos.x, currentPos.x);
  const top = Math.min(startPos.y, currentPos.y);
  const bottom = Math.max(startPos.y, currentPos.y);
  return { left, top, right, bottom };
}

/**
 * Find nodes within the selection rectangle.
 */
export function findNodesInRectangle(
  net: Network,
  startPos: { x: number; y: number },
  currentPos: { x: number; y: number }
): string[] {
  const selectionRect = getSelectionRectangle(startPos, currentPos);
  const selectedNodeIds: string[] = [];

  // Convert selection rectangle corners to canvas coordinates
  const topLeftCanvas = net.DOMtoCanvas({ x: selectionRect.left, y: selectionRect.top });
  const bottomRightCanvas = net.DOMtoCanvas({ x: selectionRect.right, y: selectionRect.bottom });
  
  const canvasSelectionRect = {
    left: Math.min(topLeftCanvas.x, bottomRightCanvas.x),
    top: Math.min(topLeftCanvas.y, bottomRightCanvas.y),
    right: Math.max(topLeftCanvas.x, bottomRightCanvas.x),
    bottom: Math.max(topLeftCanvas.y, bottomRightCanvas.y),
  };

  // Get all node positions in canvas coordinates
  const nodePositions = net.getPositions();
  const allNodeIds = Object.keys(nodePositions);

  for (const nodeId of allNodeIds) {
    const canvasPos = nodePositions[nodeId];
    if (!canvasPos) continue;

    // Get node bounding box in canvas coordinates (approximate)
    // vis-network nodes are typically boxes with some margin
    const nodeBoundingBox = {
      left: canvasPos.x - 50, // Approximate node width/2 + margin
      top: canvasPos.y - 25,  // Approximate node height/2 + margin
      right: canvasPos.x + 50,
      bottom: canvasPos.y + 25,
    };

    // Check if node bounding box intersects with selection rectangle in canvas space
    if (rectanglesIntersect(canvasSelectionRect, nodeBoundingBox)) {
      selectedNodeIds.push(nodeId);
    }
  }

  return selectedNodeIds;
}

/**
 * Find edges where both endpoints are in the selected nodes.
 * Note: This requires access to edge data. We'll use a callback to get edge information
 * from the raw data since vis-network doesn't expose edge data directly.
 */
export function findEdgesForSelectedNodes(
  selectedNodeIds: string[],
  getEdgeData: (edgeId: string) => { from: string; to: string } | null
): string[] {
  if (selectedNodeIds.length === 0) return [];

  const selectedNodeSet = new Set(selectedNodeIds);
  const selectedEdgeIds: string[] = [];

  // We need to get all edge IDs - this will be passed from the caller
  // For now, return empty array - the caller will provide edge IDs
  return selectedEdgeIds;
}

/**
 * Filter edges where both endpoints are in the selected nodes.
 * This version takes edge IDs and edge data directly.
 */
export function filterEdgesForSelectedNodes(
  edgeIds: string[],
  selectedNodeIds: string[],
  getEdgeData: (edgeId: string) => { from: string; to: string } | null
): string[] {
  if (selectedNodeIds.length === 0) return [];

  const selectedNodeSet = new Set(selectedNodeIds);
  const selectedEdgeIds: string[] = [];

  for (const edgeId of edgeIds) {
    const edgeData = getEdgeData(edgeId);
    if (edgeData) {
      // Check if both endpoints are selected
      if (selectedNodeSet.has(edgeData.from) && selectedNodeSet.has(edgeData.to)) {
        selectedEdgeIds.push(edgeId);
      }
    }
  }

  return selectedEdgeIds;
}

/**
 * Start box selection.
 */
export function startBoxSelection(
  state: BoxSelectionState,
  x: number,
  y: number,
  ctrlKey: boolean,
  shiftKey: boolean
): void {
  state.isActive = true;
  state.startPos = { x, y };
  state.currentPos = { x, y };
  state.dragDistance = 0;
  state.modifierKeys = { ctrl: ctrlKey, shift: shiftKey };
}

/**
 * Update box selection during drag.
 */
export function updateBoxSelection(
  state: BoxSelectionState,
  x: number,
  y: number
): void {
  if (!state.isActive || !state.startPos) return;

  state.currentPos = { x, y };
  
  // Calculate drag distance
  state.dragDistance = calculateDistance(
    state.startPos.x,
    state.startPos.y,
    x,
    y
  );

  // Show rectangle if minimum distance reached
  if (state.dragDistance >= state.minDragDistance) {
    showSelectionRectangle(
      state.startPos.x,
      state.startPos.y,
      x,
      y
    );
  } else {
    // Hide rectangle if drag distance is too small
    hideSelectionRectangle();
  }
}

/**
 * Complete box selection and return selected nodes/edges.
 */
export function completeBoxSelection(
  state: BoxSelectionState,
  net: Network,
  getEdgeData?: (edgeId: string) => { from: string; to: string } | null
): { nodes: string[]; edges: string[] } {
  hideSelectionRectangle();

  if (!state.isActive || !state.startPos || !state.currentPos) {
    state.isActive = false;
    return { nodes: [], edges: [] };
  }

  // Only complete selection if minimum drag distance was reached
  if (state.dragDistance < state.minDragDistance) {
    state.isActive = false;
    return { nodes: [], edges: [] };
  }

  // Find nodes in rectangle
  const selectedNodeIds = findNodesInRectangle(
    net,
    state.startPos,
    state.currentPos
  );

  // Find edges for selected nodes if edge data provider is available
  let selectedEdgeIds: string[] = [];
  if (getEdgeData && selectedNodeIds.length > 0) {
    const allEdgeIds = net.getEdges();
    selectedEdgeIds = filterEdgesForSelectedNodes(
      allEdgeIds.map(String),
      selectedNodeIds,
      getEdgeData
    );
  }

  state.isActive = false;
  return { nodes: selectedNodeIds, edges: selectedEdgeIds };
}

/**
 * Cancel box selection.
 */
export function cancelBoxSelection(state: BoxSelectionState): void {
  hideSelectionRectangle();
  state.isActive = false;
  state.startPos = null;
  state.currentPos = null;
  state.dragDistance = 0;
}
