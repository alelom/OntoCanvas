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
  spacing: number
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

  const childGap = spacing * 0.15;
  const leafWidth = spacing * 0.4;
  const subtreeWidth = (id: string): number => {
    const ch = (children[id] || []).filter((c) => nodeIds.has(c));
    if (ch.length === 0) return leafWidth;
    const totalChildWidth = ch.reduce((sum, c) => sum + subtreeWidth(c), 0);
    return Math.max(leafWidth, totalChildWidth + (ch.length - 1) * childGap);
  };

  const positions: Record<string, { x: number; y: number }> = {};
  const layoutSubtree = (
    id: string,
    left: number,
    top: number
  ): { left: number; width: number } => {
    const ch = (children[id] || []).filter((c) => nodeIds.has(c));
    if (ch.length === 0) {
      positions[id] = { x: left, y: top };
      return { left, width: leafWidth };
    }
    let x = left;
    ch.forEach((c) => {
      const r = layoutSubtree(c, x, top + spacing);
      x = r.left + r.width + childGap;
    });
    const totalW = x - left - childGap;
    const parentX = left + totalW / 2;
    positions[id] = { x: parentX, y: top };
    return { left, width: totalW };
  };

  let xOffset = 0;
  roots.forEach((root) => {
    const r = layoutSubtree(root, xOffset, 0);
    xOffset = r.left + r.width + spacing * 0.2;
  });

  return positions;
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
