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
 * Build undirected adjacency for the hierarchy graph (for connected components).
 */
function buildUndirectedNeighbors(
  nodeIds: Set<string>,
  edges: GraphEdge[]
): Record<string, string[]> {
  const hierarchyEdges = edges.filter(
    (e) =>
      (e.type === 'subClassOf' || e.type === 'contains') &&
      nodeIds.has(e.from) &&
      nodeIds.has(e.to)
  );
  const neighbors: Record<string, string[]> = {};
  const seenPairs = new Set<string>();
  hierarchyEdges.forEach((e) => {
    const { parent, child } = getParentChild(e);
    const key = parent + '->' + child;
    if (seenPairs.has(key)) return;
    const reverseKey = child + '->' + parent;
    if (seenPairs.has(reverseKey)) return;
    seenPairs.add(key);
    (neighbors[parent] = neighbors[parent] || []).push(child);
    (neighbors[child] = neighbors[child] || []).push(parent);
  });
  return neighbors;
}

/**
 * Compute weakly connected components (by BFS on undirected graph).
 * Returns Map: nodeId -> componentIndex (0, 1, 2, ...).
 */
function getConnectedComponents(
  nodeIds: Set<string>,
  neighbors: Record<string, string[]>
): Map<string, number> {
  const componentId = new Map<string, number>();
  let compIndex = 0;
  const queue: string[] = [];
  for (const start of nodeIds) {
    if (componentId.has(start)) continue;
    componentId.set(start, compIndex);
    queue.length = 0;
    queue.push(start);
    let i = 0;
    while (i < queue.length) {
      const id = queue[i++];
      for (const n of neighbors[id] || []) {
        if (!nodeIds.has(n)) continue;
        if (!componentId.has(n)) {
          componentId.set(n, compIndex);
          queue.push(n);
        }
      }
    }
    compIndex++;
  }
  return componentId;
}

export type Hierarchical04ComponentBounds = {
  nodeIds: string[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
};

export type Hierarchical04DebugResult = {
  positions: Record<string, { x: number; y: number }>;
  componentBounds: Hierarchical04ComponentBounds[];
};

/**
 * Hierarchical layout with Option B: cluster by connected component (same-tree roots together).
 * Main (largest) component is placed at x=0; all other components are placed in a column
 * at a fixed horizontal distance (mainRight + slotGap), stacked vertically at regular gaps.
 * Keeps same in-tree packing as hierarchical01.
 */
export function computeHierarchical04(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>
): Record<string, { x: number; y: number }> {
  const { positions } = computeHierarchical04Internal(
    nodeIds,
    edges,
    spacing,
    nodeDimensions
  );
  return positions;
}

/**
 * Same as computeHierarchical04 but returns positions plus per-component bounds for logging/analysis.
 * Use this to log coordinates (e.g. in tests or when debugging): positions per node and
 * componentBounds[] with minX/maxX/minY/maxY per component to verify fixed-distance column layout.
 */
export function computeHierarchical04WithDebug(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>
): Hierarchical04DebugResult {
  return computeHierarchical04Internal(nodeIds, edges, spacing, nodeDimensions);
}

function computeHierarchical04Internal(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>
): Hierarchical04DebugResult {
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

  const neighbors = buildUndirectedNeighbors(nodeIds, edges);
  const componentId = getConnectedComponents(nodeIds, neighbors);

  const compNodes = new Map<number, Set<string>>();
  componentId.forEach((comp, id) => {
    if (!compNodes.has(comp)) compNodes.set(comp, new Set());
    compNodes.get(comp)!.add(id);
  });
  const componentOrder = [...compNodes.keys()].sort(
    (a, b) => (compNodes.get(b)!.size - compNodes.get(a)!.size)
  );

  const minGap = 12;
  const rootGap = spacing * 0.2;
  const getNodeWidth = (id: string) =>
    nodeDimensions?.get(id)?.width ?? spacing * 0.45;

  const layoutSubtree = (
    id: string,
    left: number,
    top: number,
    componentNodes: Set<string>,
    outPositions: Record<string, { x: number; y: number }>
  ): { left: number; width: number; childrenRight: number } => {
    const ch = (children[id] || []).filter(
      (c) => nodeIds.has(c) && componentNodes.has(c)
    );
    if (ch.length === 0) {
      const w = getNodeWidth(id);
      outPositions[id] = { x: left + w / 2, y: top };
      return { left, width: w, childrenRight: left + w };
    }
    const childLayouts: Array<{ left: number; width: number; childrenRight: number }> = [];
    let x = left;
    ch.forEach((c) => {
      const r = layoutSubtree(c, x, top + spacing, componentNodes, outPositions);
      childLayouts.push(r);
      x = r.childrenRight + minGap;
    });
    const firstChildLeft = childLayouts[0].left;
    const lastChildRight = childLayouts[childLayouts.length - 1].childrenRight;
    const childrenSpan = lastChildRight - firstChildLeft;
    const parentWidth = getNodeWidth(id);
    const parentX = firstChildLeft + childrenSpan / 2;
    outPositions[id] = { x: parentX, y: top };
    const subtreeLeft = Math.min(firstChildLeft, parentX - parentWidth / 2);
    const subtreeRight = Math.max(lastChildRight, parentX + parentWidth / 2);
    return {
      left: subtreeLeft,
      width: subtreeRight - subtreeLeft,
      childrenRight: lastChildRight,
    };
  };

  const componentResults: Array<{
    nodeIds: string[];
    positions: Record<string, { x: number; y: number }>;
    minX: number;
    maxX: number;
    width: number;
    minY: number;
    maxY: number;
    height: number;
  }> = [];

  for (const comp of componentOrder) {
    const componentNodes = compNodes.get(comp)!;
    const rootsInComp = roots.filter((r) => componentId.get(r) === comp);
    const compPositions: Record<string, { x: number; y: number }> = {};
    let xOffset = 0;
    rootsInComp.forEach((root) => {
      const r = layoutSubtree(root, xOffset, 0, componentNodes, compPositions);
      xOffset = r.left + r.width + rootGap;
    });
    const idsInComp = Object.keys(compPositions);
    if (idsInComp.length === 0) continue;
    const xs = idsInComp.map((id) => compPositions[id].x);
    const ys = idsInComp.map((id) => compPositions[id].y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    componentResults.push({
      nodeIds: idsInComp,
      positions: compPositions,
      minX,
      maxX,
      width: maxX - minX,
      minY,
      maxY,
      height: maxY - minY,
    });
  }

  const positions: Record<string, { x: number; y: number }> = {};
  const slotGap = spacing * 0.6;
  const verticalGap = spacing * 0.5;

  if (componentResults.length === 0) return positions;

  const main = componentResults[0];
  const mainRight = main.maxX;
  const fixedX = mainRight + slotGap;

  let nonMainY = 0;
  for (let i = 0; i < componentResults.length; i++) {
    const { positions: compPositions, minX, minY, height } = componentResults[i];
    if (i === 0) {
      for (const id of Object.keys(compPositions)) {
        positions[id] = { x: compPositions[id].x, y: compPositions[id].y };
      }
      continue;
    }
    const xOffset = fixedX - minX;
    const yOffset = nonMainY - minY;
    for (const id of Object.keys(compPositions)) {
      positions[id] = {
        x: compPositions[id].x + xOffset,
        y: compPositions[id].y + yOffset,
      };
    }
    nonMainY += height + verticalGap;
  }

  const componentBounds: Hierarchical04ComponentBounds[] = componentResults.map(
    ({ nodeIds: ids }) => {
      const xs = ids.map((id) => positions[id].x);
      const ys = ids.map((id) => positions[id].y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return {
        nodeIds: ids,
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
  );

  return { positions, componentBounds };
}
