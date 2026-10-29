/**
 * The last steps of the edges of the graph: dropping a relationship drawn twice, and spacing the edges that would
 * overlap (several self-loops on one node, several edges between the same two nodes). Pure functions of the edges.
 * Moved out of buildNetworkData.ts (#198).
 */

import { debugWarn } from '../utils/debug';
import type { ObjectPropertyInfo } from '../types';

type EdgeObject = Record<string, unknown>;

/** The edges without the duplicates: the same relationship between the same nodes, by any spelling of its name or theirs. */
export function dedupeEdges(edges: EdgeObject[], objectProperties: ObjectPropertyInfo[]): EdgeObject[] {
  // Deduplicate edges by id (same from, to, and type)
  // CRITICAL: Also check for format variations (URI vs local name) to catch duplicates
  const edgeMap = new Map<string, EdgeObject>();
  const seenEdgeKeys = new Set<string>();
  
  edges.forEach((edgeObj) => {
    const edgeId = edgeObj.id as string;
    const from = edgeObj.from as string;
    const to = edgeObj.to as string;
    // Extract type from edge ID if not present in edge object
    // Edge ID format: `${from}->${to}:${type}`
    let type = (edgeObj as { type?: string }).type as string;
    if (!type && edgeId.includes(':')) {
      const parts = edgeId.split(':');
      if (parts.length > 1) {
        type = parts.slice(1).join(':'); // Handle types that contain colons
      }
    }
    
    // Build all possible keys for this edge (accounting for URI/local name variations)
    const keys = new Set<string>();
    keys.add(edgeId); // Exact match
    keys.add(`${from}->${to}:${type}`); // Also add without the exact ID format
    
    // Extract local names for from/to
    const fromLocal = from.includes('#') ? from.split('#').pop() : from.includes('/') ? from.split('/').pop() : from;
    const toLocal = to.includes('#') ? to.split('#').pop() : to.includes('/') ? to.split('/').pop() : to;
    
    // Add variations with op.uri and op.name
    const op = objectProperties.find((p) => p.name === type || p.uri === type);
    if (op) {
      if (op.name && op.name !== type) {
        keys.add(`${from}->${to}:${op.name}`);
        if (fromLocal !== from) keys.add(`${fromLocal}->${to}:${op.name}`);
        if (toLocal !== to) keys.add(`${from}->${toLocal}:${op.name}`);
        if (fromLocal !== from && toLocal !== to) keys.add(`${fromLocal}->${toLocal}:${op.name}`);
      }
      if (op.uri && op.uri !== type) {
        keys.add(`${from}->${to}:${op.uri}`);
        if (fromLocal !== from) keys.add(`${fromLocal}->${to}:${op.uri}`);
        if (toLocal !== to) keys.add(`${from}->${toLocal}:${op.uri}`);
        if (fromLocal !== from && toLocal !== to) keys.add(`${fromLocal}->${toLocal}:${op.uri}`);
      }
    }
    
    // Add variations for from/to using local names
    if (fromLocal !== from) {
      keys.add(`${fromLocal}->${to}:${type}`);
      if (op) {
        if (op.name) keys.add(`${fromLocal}->${to}:${op.name}`);
        if (op.uri) keys.add(`${fromLocal}->${to}:${op.uri}`);
      }
    }
    if (toLocal !== to) {
      keys.add(`${from}->${toLocal}:${type}`);
      if (op) {
        if (op.name) keys.add(`${from}->${toLocal}:${op.name}`);
        if (op.uri) keys.add(`${from}->${toLocal}:${op.uri}`);
      }
    }
    if (fromLocal !== from && toLocal !== to) {
      keys.add(`${fromLocal}->${toLocal}:${type}`);
      if (op) {
        if (op.name) keys.add(`${fromLocal}->${toLocal}:${op.name}`);
        if (op.uri) keys.add(`${fromLocal}->${toLocal}:${op.uri}`);
      }
    }
    
    // Check if any of these keys have been seen
    let isDuplicate = false;
    for (const key of keys) {
      if (seenEdgeKeys.has(key)) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      // Mark all keys as seen and add the edge
      for (const key of keys) {
        seenEdgeKeys.add(key);
      }
      edgeMap.set(edgeId, edgeObj as EdgeObject);
    } else {
      // Duplicate edge found - log it
      debugWarn('Duplicate edge detected (format variation):', edgeId, edgeObj);
    }
  });
  const uniqueEdges = Array.from(edgeMap.values());
  return uniqueEdges;
}

/**
 * Splits the edges into regular ones and self-loops, and gives each overlapping group its own curve: self-loops of one node
 * are spaced with different sizes and angles, edges of one node pair curve either way (the spacing scales with the font).
 */
export function spaceEdges(uniqueEdges: EdgeObject[], relationshipFontSize: number): { regularEdges: EdgeObject[]; selfLoops: EdgeObject[] } {
  // Separate self-loops (from === to) from regular edges
  const selfLoops: Array<EdgeObject> = [];
  const regularEdges: Array<EdgeObject> = [];
  uniqueEdges.forEach((edgeObj) => {
    if (edgeObj.from === edgeObj.to) {
      selfLoops.push(edgeObj);
    } else {
      regularEdges.push(edgeObj);
    }
  });

  // Handle multiple self-loops on the same node - space them out using different sizes and angles
  // When multiple object properties have the same domain and range (self-loops), they overlap completely.
  // We use different selfReference.size values to create concentric loops that don't overlap.
  // The spacing scales with relationshipFontSize to prevent label overlap with larger fonts.
  const nodeToSelfLoops = new Map<string, Array<EdgeObject>>();
  selfLoops.forEach((edgeObj) => {
    const nodeId = edgeObj.from as string;
    if (!nodeToSelfLoops.has(nodeId)) nodeToSelfLoops.set(nodeId, []);
    nodeToSelfLoops.get(nodeId)!.push(edgeObj);
  });
  nodeToSelfLoops.forEach((list) => {
    if (list.length >= 2) {
      // For multiple self-loops, space them out using different sizes to create concentric circles
      // Scale spacing with relationshipFontSize to accommodate larger labels
      // Base size: 2x font size (minimum 30) to ensure adequate spacing
      // Increment: 1.5x font size (minimum 20) to maintain proportional spacing
      const baseSize = Math.max(30, relationshipFontSize * 2);
      const sizeIncrement = Math.max(20, relationshipFontSize * 1.5);
      
      list.forEach((edgeObj, i) => {
        // Distribute angles evenly around the node (0 to 2π)
        const angleStep = (2 * Math.PI) / list.length;
        const angle = i * angleStep;
        
        // Use new selfReference format (replaces deprecated selfReferenceSize and selfReferenceAngle)
        edgeObj.selfReference = {
          size: baseSize + i * sizeIncrement,
          angle: angle,
        };
      });
    } else if (list.length === 1) {
      // Single self-loop - scale with font size (minimum 30)
      // Use default angle (Math.PI / 4) as suggested in the deprecation warning
      list[0].selfReference = {
        size: Math.max(30, relationshipFontSize * 2),
        angle: Math.PI / 4,
      };
    }
  });

  // Assign smooth curves to overlapping edges (same node pair) to avoid label/line overlap
  const pairToEdges = new Map<string, Array<EdgeObject>>();
  regularEdges.forEach((edgeObj) => {
    const pairKey = [edgeObj.from, edgeObj.to].sort().join('|');
    if (!pairToEdges.has(pairKey)) pairToEdges.set(pairKey, []);
    pairToEdges.get(pairKey)!.push(edgeObj);
  });
  pairToEdges.forEach((list) => {
    if (list.length >= 2) {
      list.forEach((edgeObj, i) => {
        const smoothTypes = ['curvedCW', 'curvedCCW'] as const;
        const roundness = 0.15 + (i >> 1) * 0.1;
        edgeObj.smooth = {
          type: smoothTypes[i % 2],
          roundness: i % 2 === 0 ? roundness : -roundness,
        };
      });
    }
  });
  return { regularEdges, selfLoops };
}
