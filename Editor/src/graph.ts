import type { DataSet } from 'vis-network';
import type { GraphData, GraphEdge, GraphNode } from './types';

const COLORS = {
  labellable: '#2ecc71',
  nonLabellable: '#b8b8b8',
  unknown: '#95a5a6',
  default: '#3498db',
};

const DEFAULT_EDGE_COLORS: Record<string, string> = {
  subClassOf: '#3498db',
  contains: '#27ae60',
  partOf: '#e67e22',
};
const DEFAULT_COLOR = '#95a5a6';
const SPACING = 220;

export interface FilterState {
  labellable: string;
  colorBy: string;
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  searchQuery: string;
  includeNeighbors: boolean;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string }>;
  layoutMode: string;
}

export function wrapText(text: string, maxChars: number): string {
  if (!text || maxChars <= 0) return text;
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  });
  if (current) lines.push(current);
  return lines.join('\n');
}

export function getEdgeTypes(edges: GraphEdge[]): string[] {
  const types = new Set(edges.map((e) => e.type));
  return [...types].sort();
}

export function getNodeColor(node: GraphNode, colorBy: string): string {
  if (colorBy === 'default') return COLORS.default;
  const lr = node.labellableRoot;
  if (lr === true) return COLORS.labellable;
  if (lr === false) return COLORS.nonLabellable;
  return COLORS.unknown;
}

export function getDefaultEdgeColors(): Record<string, string> {
  return { ...DEFAULT_EDGE_COLORS };
}

export function getDefaultColor(): string {
  return DEFAULT_COLOR;
}

export function getSpacing(): number {
  return SPACING;
}

interface DepthResult {
  depth: Record<string, number>;
  maxDepth: number;
}

export function computeNodeDepths(
  nodeIds: Set<string>,
  edges: GraphEdge[]
): DepthResult {
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
    const key = e.from + '->' + e.to;
    if (seenPairs.has(key)) return;
    const reverseKey = e.to + '->' + e.from;
    if (seenPairs.has(reverseKey)) return;
    seenPairs.add(key);
    (children[e.from] = children[e.from] || []).push(e.to);
    (parents[e.to] = parents[e.to] || []).push(e.from);
  });
  const roots = [...nodeIds].filter((id) => !parents[id] || parents[id].length === 0);
  const depth: Record<string, number> = {};
  roots.forEach((id) => (depth[id] = 0));
  const queue = [...roots];
  const seen = new Set(roots);
  while (queue.length) {
    const id = queue.shift()!;
    (children[id] || [])
      .filter((c) => nodeIds.has(c))
      .forEach((cid) => {
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
  });
  const maxDepth = Math.max(0, ...Object.values(depth));
  return { depth, maxDepth };
}

export function computeWeightedLayout(
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
    const key = e.from + '->' + e.to;
    if (seenPairs.has(key)) return;
    const reverseKey = e.to + '->' + e.from;
    if (seenPairs.has(reverseKey)) return;
    seenPairs.add(key);
    (children[e.from] = children[e.from] || []).push(e.to);
    (parents[e.to] = parents[e.to] || []).push(e.from);
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
  const subtreeWidth = (id: string): number => {
    const ch = (children[id] || []).filter((c) => nodeIds.has(c));
    if (ch.length === 0) return getNodeWidth(id);
    const totalChildWidth = ch.reduce((sum, c) => sum + subtreeWidth(c), 0);
    return Math.max(getNodeWidth(id), totalChildWidth + (ch.length - 1) * minGap);
  };

  const positions: Record<string, { x: number; y: number }> = {};
  const layoutSubtree = (
    id: string,
    left: number,
    top: number
  ): { left: number; width: number } => {
    const ch = (children[id] || []).filter((c) => nodeIds.has(c));
    if (ch.length === 0) {
      const w = getNodeWidth(id);
      positions[id] = { x: left + w / 2, y: top };
      return { left, width: w };
    }
    let x = left;
    ch.forEach((c) => {
      const r = layoutSubtree(c, x, top + spacing);
      x = r.left + r.width + minGap;
    });
    const totalW = x - left - minGap;
    const parentX = left + totalW / 2;
    positions[id] = { x: parentX, y: top };
    return { left, width: totalW };
  };

  const rootGap = spacing * 0.2;
  let xOffset = 0;
  roots.forEach((root) => {
    const r = layoutSubtree(root, xOffset, 0);
    xOffset = r.left + r.width + rootGap;
  });

  return positions;
}

const NODE_MARGIN = 10;
const CHAR_WIDTH_RATIO = 0.62;
const LINE_HEIGHT_RATIO = 1.35;

export interface NodeDimensions {
  width: number;
  height: number;
}

export function estimateNodeDimensions(
  label: string,
  wrapChars: number,
  fontSize: number
): NodeDimensions {
  const lines = wrapText(label, wrapChars).split('\n');
  const maxLineLen = Math.max(1, ...lines.map((l) => l.length));
  const width = maxLineLen * fontSize * CHAR_WIDTH_RATIO + 2 * NODE_MARGIN;
  const height = lines.length * fontSize * LINE_HEIGHT_RATIO + 2 * NODE_MARGIN;
  return { width: Math.max(70, width), height: Math.max(40, height) };
}

export interface ResolveOverlapsOptions {
  minPadding?: number;
}

function buildHierarchy(
  nodeIds: Set<string>,
  edges: GraphEdge[]
): {
  parents: Record<string, string[]>;
  children: Record<string, string[]>;
  roots: string[];
  rootOf: Record<string, string>;
  depth: Record<string, number>;
} {
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
    const key = e.from + '->' + e.to;
    if (seenPairs.has(key)) return;
    const reverseKey = e.to + '->' + e.from;
    if (seenPairs.has(reverseKey)) return;
    seenPairs.add(key);
    (children[e.from] = children[e.from] || []).push(e.to);
    (parents[e.to] = parents[e.to] || []).push(e.from);
  });
  const roots = [...nodeIds].filter((id) => !parents[id] || parents[id].length === 0);
  const unreached = [...nodeIds].filter((id) => !parents[id]?.length && !roots.includes(id));
  roots.push(...unreached);

  const rootOf: Record<string, string> = {};
  const depth: Record<string, number> = {};
  const visit = (id: string, root: string, d: number) => {
    rootOf[id] = root;
    depth[id] = d;
    (children[id] || []).filter((c) => nodeIds.has(c)).forEach((c) => visit(c, root, d + 1));
  };
  roots.forEach((r) => visit(r, r, 0));

  return { parents, children, roots, rootOf, depth };
}

function getNodeBounds(
  pos: { x: number; y: number },
  dim: NodeDimensions
): { left: number; right: number; top: number; bottom: number } {
  const hw = dim.width / 2;
  const hh = dim.height / 2;
  return {
    left: pos.x - hw,
    right: pos.x + hw,
    top: pos.y - hh,
    bottom: pos.y + hh,
  };
}

export function resolveOverlaps(
  positions: Record<string, { x: number; y: number }>,
  nodeIds: Set<string>,
  edges: GraphEdge[],
  nodeDimensions: Map<string, NodeDimensions>,
  options: ResolveOverlapsOptions = {}
): Record<string, { x: number; y: number }> {
  const minPadding = options.minPadding ?? 8;

  const { roots, rootOf, depth } = buildHierarchy(nodeIds, edges);
  const result = { ...Object.fromEntries(Object.entries(positions).map(([k, v]) => [k, { ...v }])) };

  const getDim = (id: string): NodeDimensions =>
    nodeDimensions.get(id) ?? { width: 80, height: 40 };

  const getBounds = (id: string) => {
    const pos = result[id];
    if (!pos) return null;
    return getNodeBounds(pos, getDim(id));
  };

  const getRootBounds = (rootId: string) => {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const nid of nodeIds) {
      if (rootOf[nid] !== rootId) continue;
      const b = getBounds(nid);
      if (b) {
        minX = Math.min(minX, b.left);
        maxX = Math.max(maxX, b.right);
      }
    }
    if (minX === Infinity) return null;
    return { left: minX, right: maxX };
  };

  const rootBoundsList = roots
    .map((r) => ({ root: r, bounds: getRootBounds(r) }))
    .filter((x): x is { root: string; bounds: NonNullable<ReturnType<typeof getRootBounds>> } => x.bounds != null)
    .sort((a, b) => a.bounds.left - b.bounds.left);

  const rootGap = minPadding + 8;
  let shiftAccum = 0;
  for (let i = 0; i < rootBoundsList.length; i++) {
    const curr = rootBoundsList[i];
    const nodesOfRoot = [...nodeIds].filter((n) => rootOf[n] === curr.root);
    nodesOfRoot.forEach((nid) => {
      if (result[nid]) result[nid].x += shiftAccum;
    });
    if (i + 1 < rootBoundsList.length) {
      const next = rootBoundsList[i + 1];
      const currRight = curr.bounds.right + shiftAccum;
      const gap = currRight - next.bounds.left + rootGap;
      if (gap > 0) shiftAccum += gap;
    }
  }

  const depthLevels = new Map<number, string[]>();
  for (const nid of nodeIds) {
    const d = depth[nid] ?? 0;
    if (!depthLevels.has(d)) depthLevels.set(d, []);
    depthLevels.get(d)!.push(nid);
  }

  for (const [, ids] of depthLevels) {
    const byRoot = new Map<string, string[]>();
    for (const id of ids) {
      const r = rootOf[id];
      if (!byRoot.has(r)) byRoot.set(r, []);
      byRoot.get(r)!.push(id);
    }
    for (const [, rootIds] of byRoot) {
      rootIds.sort((a, b) => result[a]!.x - result[b]!.x);
      let prevRight = -Infinity;
      for (const id of rootIds) {
        const dim = getDim(id);
        const halfW = dim.width / 2;
        const desiredLeft = prevRight + minPadding;
        const currentLeft = result[id]!.x - halfW;
        if (desiredLeft > currentLeft) {
          result[id]!.x = desiredLeft + halfW;
        }
        prevRight = result[id]!.x + halfW;
      }
    }
  }

  return result;
}

export function matchesSearch(
  node: GraphNode | null,
  edge: GraphEdge | null,
  query: string
): boolean {
  if (!query || query.trim() === '') return true;
  const q = query.trim().toLowerCase();
  if (node) {
    const matchLabel = (node.label || '').toLowerCase().includes(q);
    const matchId = (node.id || '').toLowerCase().includes(q);
    if (matchLabel || matchId) return true;
  }
  if (edge) {
    if ((edge.type || '').toLowerCase().includes(q)) return true;
  }
  return false;
}
