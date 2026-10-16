import type { GraphEdge, NodeDimensions } from '../types';
import { buildLayeredModel, type LayeredModel, type LayeredModelOptions } from './layeredModel';
import type { AsyncLayoutAlgorithm, LayoutAlgorithm } from './index';

/** A parent's leaf children form a block when there are at least this many (#159). */
export const LEAF_BLOCK_THRESHOLD = 6;
const GAP_X = 40;
const GAP_Y = 30;

export interface LayoutOptions extends LayeredModelOptions {
  /** Stack many leaf children in a block under their parent (#159). */
  stackLeaves?: boolean;
}

export interface LeafBlock {
  parent: string;
  members: string[];
}

/**
 * The blocks of a ranking (#159): for each parent, its children that have no children and no other parent, when
 * there are at least `threshold` of them, sorted.
 */
export function findLeafBlocks(model: LayeredModel, threshold = LEAF_BLOCK_THRESHOLD): LeafBlock[] {
  const blocks: LeafBlock[] = [];
  for (const parent of Object.keys(model.children).sort()) {
    const members = model.children[parent]
      .filter((c) => !model.children[c]?.length && model.parents[c]?.length === 1)
      .sort();
    if (members.length >= threshold) blocks.push({ parent, members });
  }
  return blocks;
}

export interface BlockShape {
  columns: number;
  width: number;
  height: number;
  /** Each member's centre, from the block's centre. */
  offsets: Record<string, { dx: number; dy: number }>;
}

/**
 * The grid of a block: cells as wide and tall as its widest and tallest member, filled row by row, with the number
 * of columns that makes the block closest to square.
 */
export function blockShape(members: string[], sizeOf: (id: string) => { width: number; height: number }): BlockShape {
  const cellW = Math.max(...members.map((m) => sizeOf(m).width));
  const cellH = Math.max(...members.map((m) => sizeOf(m).height));
  const extent = (columns: number) => {
    const rows = Math.ceil(members.length / columns);
    return { width: columns * cellW + (columns - 1) * GAP_X, height: rows * cellH + (rows - 1) * GAP_Y };
  };
  let columns = 1;
  for (let c = 2; c <= members.length; c++) {
    const [best, next] = [extent(columns), extent(c)];
    if (Math.abs(Math.log(next.width / next.height)) < Math.abs(Math.log(best.width / best.height))) columns = c;
  }
  const { width, height } = extent(columns);
  const offsets: BlockShape['offsets'] = {};
  members.forEach((m, i) => {
    offsets[m] = {
      dx: -width / 2 + cellW / 2 + (i % columns) * (cellW + GAP_X),
      dy: -height / 2 + cellH / 2 + Math.floor(i / columns) * (cellH + GAP_Y),
    };
  });
  return { columns, width, height, offsets };
}

type Positions = Record<string, { x: number; y: number }>;
interface Collapsed {
  nodeIds: Set<string>;
  edges: GraphEdge[];
  dims: Map<string, NodeDimensions>;
  options: LayoutOptions;
  expand: (positions: Positions) => Positions;
}

/** Replaces each block by one node of its grid's size; `expand` puts the members back in their grid. */
function collapse(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions: Map<string, NodeDimensions> | undefined,
  options: LayoutOptions
): Collapsed | null {
  const blocks = findLeafBlocks(buildLayeredModel(nodeIds, edges, options));
  if (blocks.length === 0) return null;
  const sizeOf = (id: string) => nodeDimensions?.get(id) ?? { width: spacing * 0.45, height: spacing * 0.3 };
  const blockOf = new Map<string, string>();
  const dims = new Map(nodeDimensions ?? []);
  const shapes = blocks.map((b) => {
    const id = `\u0000block:${b.parent}`;
    const shape = blockShape(b.members, sizeOf);
    b.members.forEach((m) => blockOf.set(m, id));
    dims.set(id, { width: shape.width, height: shape.height });
    return { id, shape };
  });
  const to = (id: string) => blockOf.get(id) ?? id;
  return {
    nodeIds: new Set([...[...nodeIds].filter((id) => !blockOf.has(id)), ...shapes.map((s) => s.id)]),
    edges: edges.map((e) => ({ ...e, from: to(e.from), to: to(e.to) })).filter((e) => e.from !== e.to),
    dims,
    options: {
      ...options,
      definitions: options.definitions
        ?.map(({ cls, parent }) => ({ cls: to(cls), parent: to(parent) }))
        .filter(({ cls, parent }) => cls !== parent),
    },
    expand: (positions) => {
      const out: Positions = {};
      for (const [id, p] of Object.entries(positions)) if (!id.startsWith('\u0000block:')) out[id] = p;
      for (const { id, shape } of shapes) {
        const centre = positions[id];
        if (!centre) continue;
        for (const [m, o] of Object.entries(shape.offsets)) out[m] = { x: centre.x + o.dx, y: centre.y + o.dy };
      }
      return out;
    },
  };
}

/** A tiered layout that stacks leaf blocks when `options.stackLeaves` is set (#159). */
export function withLeafBlocks(layout: LayoutAlgorithm): LayoutAlgorithm {
  return (nodeIds, edges, spacing, nodeDimensions, options = {}) => {
    const plan = options.stackLeaves ? collapse(nodeIds, edges, spacing, nodeDimensions, options) : null;
    if (!plan) return layout(nodeIds, edges, spacing, nodeDimensions, options);
    return plan.expand(layout(plan.nodeIds, plan.edges, spacing, plan.dims, plan.options));
  };
}

/** The same for an asynchronous layout (ELK). */
export function withLeafBlocksAsync(layout: AsyncLayoutAlgorithm): AsyncLayoutAlgorithm {
  return async (nodeIds, edges, spacing, nodeDimensions, options = {}) => {
    const plan = options.stackLeaves ? collapse(nodeIds, edges, spacing, nodeDimensions, options) : null;
    if (!plan) return layout(nodeIds, edges, spacing, nodeDimensions, options);
    return plan.expand(await layout(plan.nodeIds, plan.edges, spacing, plan.dims, plan.options));
  };
}
