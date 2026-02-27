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
 * Original hierarchical layout algorithm (unchanged behavior)
 * This is the current algorithm that was previously called computeWeightedLayout
 */
export function computeHierarchical01(
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

  const minGap = 12;
  const getNodeWidth = (id: string) =>
    nodeDimensions?.get(id)?.width ?? spacing * 0.45;

  const positions: Record<string, { x: number; y: number }> = {};
  
  // Improved layout function that centers parent based on actual children span
  // Returns childrenRight separately to prevent parent extensions from adding spacing between siblings
  const layoutSubtree = (
    id: string,
    left: number,
    top: number
  ): { left: number; width: number; childrenRight: number } => {
    const ch = (children[id] || []).filter((c) => nodeIds.has(c));
    if (ch.length === 0) {
      const w = getNodeWidth(id);
      positions[id] = { x: left + w / 2, y: top };
      return { left, width: w, childrenRight: left + w };
    }
    
    // First, layout all children and collect their actual widths
    const childLayouts: Array<{ left: number; width: number; childrenRight: number }> = [];
    let x = left;
    ch.forEach((c) => {
      const r = layoutSubtree(c, x, top + spacing);
      childLayouts.push(r);
      // Use childrenRight (actual right edge of children) instead of full width
      // This prevents parent extensions from adding extra spacing between siblings
      x = r.childrenRight + minGap;
    });
    
    // Calculate the actual span of children (from first child's left to last child's right)
    const firstChildLeft = childLayouts[0].left;
    const lastChildRight = childLayouts[childLayouts.length - 1].childrenRight;
    const childrenSpan = lastChildRight - firstChildLeft;
    
    // Parent width
    const parentWidth = getNodeWidth(id);
    
    // Center parent above children based on actual children span
    // This prevents excessive spacing when parent is wider than children
    const parentX = firstChildLeft + childrenSpan / 2;
    
    positions[id] = { x: parentX, y: top };
    
    // Return the actual bounds of this subtree
    // If parent extends beyond children, include that in the width
    const subtreeLeft = Math.min(firstChildLeft, parentX - parentWidth / 2);
    const subtreeRight = Math.max(lastChildRight, parentX + parentWidth / 2);
    
    // Return childrenRight separately so siblings can use it for positioning
    // This is the actual right edge of children, not including parent extension
    return { 
      left: subtreeLeft, 
      width: subtreeRight - subtreeLeft,
      childrenRight: lastChildRight
    };
  };

  const rootGap = spacing * 0.2;
  let xOffset = 0;
  roots.forEach((root) => {
    const r = layoutSubtree(root, xOffset, 0);
    xOffset = r.left + r.width + rootGap;
  });

  return positions;
}
