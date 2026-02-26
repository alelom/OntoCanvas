import type { DataSet } from 'vis-network';
import type { GraphData, GraphEdge, GraphNode } from './types';

export const COLORS = {
  labellable: '#2ecc71',
  nonLabellable: '#b8b8b8',
  unknown: '#95a5a6',
  default: '#3498db',
};

// subClassOf is always black
const SUBCLASSOF_COLOR = '#000000';
const DEFAULT_COLOR = '#95a5a6';
const SPACING = 220;

/**
 * Convert HSL to hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  
  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }
  
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  
  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
}

/**
 * Generate a color from purple to red based on index and total count.
 * Colors are evenly distributed across the spectrum: purple -> blue -> cyan -> green -> yellow -> orange -> red
 */
function generateSpectrumColor(index: number, total: number): string {
  if (total <= 1) {
    // If only one property, use purple
    return '#8000ff';
  }
  
  // Map index to hue: 0 = purple (270°), 1 = blue (240°), 2 = cyan (180°), 3 = green (120°), 4 = yellow (60°), 5 = orange (30°), 6 = red (0°)
  // Interpolate between these key colors
  const keyHues = [270, 240, 180, 120, 60, 30, 0]; // Purple to red
  const position = (index / (total - 1)) * (keyHues.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.min(lowerIndex + 1, keyHues.length - 1);
  const t = position - lowerIndex;
  
  const hue = keyHues[lowerIndex] + t * (keyHues[upperIndex] - keyHues[lowerIndex]);
  
  // Use HSL with high saturation and medium lightness for vibrant colors, then convert to hex
  return hslToHex(hue, 70, 50);
}

/**
 * Generate default edge colors for all edge types, distributed evenly across the spectrum.
 * subClassOf is always black, other properties get colors from purple to red.
 */
export function getDefaultEdgeColors(edgeTypes?: string[]): Record<string, string> {
  const colors: Record<string, string> = {
    subClassOf: SUBCLASSOF_COLOR, // Always black
  };
  
  if (!edgeTypes) {
    // Return minimal default if no types provided (backward compatibility)
    return colors;
  }
  
  // Filter out subClassOf and sort the rest for consistent color assignment
  const objectPropertyTypes = edgeTypes
    .filter((type) => type !== 'subClassOf')
    .sort(); // Sort for consistent ordering
  
  // Assign colors evenly across the spectrum
  objectPropertyTypes.forEach((type, index) => {
    colors[type] = generateSpectrumColor(index, objectPropertyTypes.length);
  });
  
  return colors;
}

export interface FilterState {
  labellable: string;
  colorBy: string;
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  relationshipFontSize?: number;
  searchQuery: string;
  includeNeighbors: boolean;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: string }>;
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

/** Format edge label including cardinality when present, e.g. "contains [0..3]" */
export function formatEdgeLabel(edge: GraphEdge): string {
  const min = edge.minCardinality;
  const max = edge.maxCardinality;
  if (min == null && max == null) return edge.type;
  const minStr = min != null ? String(min) : '0';
  const maxStr = max != null ? String(max) : '*';
  return `${edge.type} [${minStr}..${maxStr}]`;
}

export function getNodeColor(node: GraphNode, colorBy: string): string {
  if (colorBy === 'default') return COLORS.default;
  const lr = node.labellableRoot;
  if (lr === true) return COLORS.labellable;
  if (lr === false) return COLORS.nonLabellable;
  return COLORS.unknown;
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

/** For hierarchy layout: subClassOf goes subclass→superclass; contains goes container→contained. */
function getParentChild(e: GraphEdge): { parent: string; child: string } {
  if (e.type === 'subClassOf') {
    return { parent: e.to, child: e.from };
  }
  return { parent: e.from, child: e.to };
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
