import type { GraphEdge, NodeDimensions } from '../types';

/**
 * For hierarchy layout: subClassOf goes subclass→superclass; contains goes container→contained.
 */
function getParentChild(e: GraphEdge): { parent: string; child: string } {
  if (e.type === 'subClassOf') {
    return { parent: e.to, child: e.from };
  }
  return { parent: e.from, child: e.to };
}

/**
 * Configuration parameters for adaptive spacing
 */
const SPACING_CONFIG = {
  minHorizontalGap: 8, // Reduced for tighter horizontal spacing
  minVerticalGap: 45, // Increased for more vertical spacing
  horizontalMultiplier: 0.08, // Reduced to minimize horizontal spacing
  verticalMultiplier: 0.7, // Increased for more vertical spacing
  depthFactor: 12, // Increased extra pixels per depth level
  rootMultiplier: 0.15, // Slightly reduced for root spacing
};

/**
 * Calculate adaptive horizontal gap between sibling nodes
 */
function calculateHorizontalGap(
  nodes: string[],
  nodeDimensions: Map<string, NodeDimensions>,
  baseSpacing: number
): number {
  if (nodes.length === 0) return SPACING_CONFIG.minHorizontalGap;
  
  let totalWidth = 0;
  let maxHeight = 0;
  let validNodes = 0;
  
  nodes.forEach((id) => {
    const dim = nodeDimensions?.get(id);
    if (dim) {
      totalWidth += dim.width;
      maxHeight = Math.max(maxHeight, dim.height);
      validNodes++;
    }
  });
  
  if (validNodes === 0) return SPACING_CONFIG.minHorizontalGap;
  
  const avgWidth = totalWidth / validNodes;
  // Use only width for horizontal spacing (not height) to keep it tighter
  const adaptiveGap = avgWidth * SPACING_CONFIG.horizontalMultiplier;
  
  return Math.max(SPACING_CONFIG.minHorizontalGap, adaptiveGap);
}

/**
 * Calculate adaptive vertical gap between levels
 */
function calculateVerticalGap(
  currentLevelNodes: string[],
  nextLevelNodes: string[],
  nodeDimensions: Map<string, NodeDimensions>,
  depth: number,
  baseSpacing: number
): number {
  let maxCurrentHeight = 0;
  let maxNextHeight = 0;
  
  currentLevelNodes.forEach((id) => {
    const dim = nodeDimensions?.get(id);
    if (dim) {
      maxCurrentHeight = Math.max(maxCurrentHeight, dim.height);
    }
  });
  
  nextLevelNodes.forEach((id) => {
    const dim = nodeDimensions?.get(id);
    if (dim) {
      maxNextHeight = Math.max(maxNextHeight, dim.height);
    }
  });
  
  // Base gap from node heights - use full heights for more spacing
  const heightGap = maxCurrentHeight + maxNextHeight;
  // Add depth factor for deeper levels (more space for readability)
  const depthGap = depth * SPACING_CONFIG.depthFactor;
  // Apply multiplier with additional base spacing
  const adaptiveGap = heightGap * SPACING_CONFIG.verticalMultiplier + depthGap;
  
  return Math.max(SPACING_CONFIG.minVerticalGap, adaptiveGap);
}

/**
 * Subtree metrics for complexity-aware spacing
 */
interface SubtreeMetrics {
  width: number;
  depth: number;
  nodeCount: number;
}

/**
 * Adaptive hierarchical layout algorithm with dynamic spacing
 * Addresses issues with excessive horizontal spacing and insufficient vertical spacing
 */
export function computeHierarchical02(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>
): Record<string, { x: number; y: number }> {
  const hierarchyEdges = edges.filter(
    (e) =>
      (e.type === 'subClassOf' || e.type === 'contains') &&
      nodeIds.has(e.from) &&
      nodeIds.has(e.to)
  );
  const children: Record<string, string[]> = {};
  const parents: Record<string, string[]> = {};
  const seenPairs = new Set<string>();
  hierarchyEdges.forEach((e) => {
    const { parent, child } = getParentChild(e);
    const key = parent + '->' + child;
    if (seenPairs.has(key)) return;
    const reverseKey = child + '->' + parent;
    if (seenPairs.has(reverseKey)) return;
    seenPairs.add(key);
    (children[parent] = children[parent] || []).push(child);
    (parents[child] = parents[child] || []).push(parent);
  });
  const roots = [...nodeIds].filter((id) => !parents[id] || parents[id].length === 0);
  const depth: Record<string, number> = {};
  roots.forEach((id) => (depth[id] = 0));
  const queue = [...roots];
  const seen = new Set(roots);
  while (queue.length) {
    const id = queue.shift()!;
    (children[id] || []).forEach((cid) => {
      if (!seen.has(cid)) {
        seen.add(cid);
        depth[cid] = (depth[id] || 0) + 1;
        queue.push(cid);
      } else {
        depth[cid] = Math.min(depth[cid] ?? 999, (depth[id] || 0) + 1);
      }
    });
  }
  const unreached = [...nodeIds].filter((id) => depth[id] === undefined);
  unreached.forEach((id) => {
    depth[id] = 0;
    roots.push(id);
  });

  const getNodeWidth = (id: string) =>
    nodeDimensions?.get(id)?.width ?? spacing * 0.45;
  const getNodeHeight = (id: string) =>
    nodeDimensions?.get(id)?.height ?? spacing * 0.3;

  const positions: Record<string, { x: number; y: number }> = {};
  
  /**
   * Layout a subtree with adaptive spacing
   * Returns layout info including subtree metrics
   */
  const layoutSubtree = (
    id: string,
    left: number,
    top: number,
    currentDepth: number
  ): { 
    left: number; 
    width: number; 
    childrenRight: number;
    metrics: SubtreeMetrics;
  } => {
    const ch = (children[id] || []).filter((c) => nodeIds.has(c));
    
    // Leaf node
    if (ch.length === 0) {
      const w = getNodeWidth(id);
      positions[id] = { x: left + w / 2, y: top };
      return { 
        left, 
        width: w, 
        childrenRight: left + w,
        metrics: { width: w, depth: 1, nodeCount: 1 }
      };
    }
    
    // Calculate adaptive horizontal gap for siblings
    const horizontalGap = calculateHorizontalGap(ch, nodeDimensions || new Map(), spacing);
    
    // Layout all children with adaptive vertical spacing
    const childLayouts: Array<{ 
      left: number; 
      width: number; 
      childrenRight: number;
      metrics: SubtreeMetrics;
    }> = [];
    
    let x = left;
    let maxChildDepth = 0;
    let totalChildWidth = 0;
    let totalNodeCount = 1; // Include this node
    
    ch.forEach((c) => {
      // Calculate vertical gap for this child level
      const childDepth = currentDepth + 1;
      const childVerticalGap = calculateVerticalGap(
        [id],
        [c],
        nodeDimensions || new Map(),
        childDepth,
        spacing
      );
      
      const r = layoutSubtree(c, x, top + childVerticalGap, childDepth);
      childLayouts.push(r);
      
      maxChildDepth = Math.max(maxChildDepth, r.metrics.depth);
      totalChildWidth += r.width;
      totalNodeCount += r.metrics.nodeCount;
      
      // Use adaptive horizontal gap
      x = r.childrenRight + horizontalGap;
    });
    
    // Calculate the actual span of children
    const firstChildLeft = childLayouts[0].left;
    const lastChildRight = childLayouts[childLayouts.length - 1].childrenRight;
    const childrenSpan = lastChildRight - firstChildLeft;
    
    // Parent width
    const parentWidth = getNodeWidth(id);
    
    // Center parent above children based on actual children span
    const parentX = firstChildLeft + childrenSpan / 2;
    
    positions[id] = { x: parentX, y: top };
    
    // Calculate subtree metrics
    const subtreeMetrics: SubtreeMetrics = {
      width: Math.max(parentWidth, childrenSpan),
      depth: maxChildDepth + 1,
      nodeCount: totalNodeCount,
    };
    
    // Return the actual bounds of this subtree
    const subtreeLeft = Math.min(firstChildLeft, parentX - parentWidth / 2);
    const subtreeRight = Math.max(lastChildRight, parentX + parentWidth / 2);
    
    return { 
      left: subtreeLeft, 
      width: subtreeRight - subtreeLeft,
      childrenRight: lastChildRight,
      metrics: subtreeMetrics
    };
  };

  // Calculate adaptive root gap based on subtree sizes
  const rootLayouts: Array<{
    left: number;
    width: number;
    metrics: SubtreeMetrics;
  }> = [];
  
  let xOffset = 0;
  roots.forEach((root, index) => {
    const r = layoutSubtree(root, xOffset, 0, 0);
    rootLayouts.push({
      left: r.left,
      width: r.width,
      metrics: r.metrics
    });
    
    // Calculate adaptive root gap for next root
    if (index < roots.length - 1) {
      const currMetrics = r.metrics;
      // Estimate next root size (we'll recalculate, but use current for gap)
      const avgSubtreeWidth = currMetrics.width;
      const rootGap = Math.max(
        SPACING_CONFIG.minHorizontalGap * 2,
        avgSubtreeWidth * SPACING_CONFIG.rootMultiplier
      );
      xOffset = r.left + r.width + rootGap;
    }
  });

  return positions;
}
