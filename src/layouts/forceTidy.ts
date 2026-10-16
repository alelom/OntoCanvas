import type { GraphEdge, NodeDimensions } from '../types';
import type { AsyncLayoutAlgorithm, LayoutAlgorithm } from './index';
import type { LayoutOptions } from './leafBlocks';

type Pos = Record<string, { x: number; y: number }>;
type Size = { width: number; height: number };

/** Attraction and anchor move no node further than this from where the layout put it (#162). */
export const TIDY_MAX_DRIFT = 400;
const ITERATIONS = 150;
/** Then separation alone, until no boxes overlap or this many iterations have run. */
const SEPARATION_ITERATIONS = 200;
/** Boxes closer than this are pushed apart. */
const MARGIN = 20;
/** The most a node moves in one iteration: the relaxation is mild. */
const STEP_CAP = 20;
const SEPARATION = 0.5;
/** A relationship longer than this many times the layout's median length is pulled shorter. */
const LONG_FACTOR = 1.5;
const SPRING = 0.05;
/** Pull back toward the layout's position: stronger vertically, so the tiers stay readable. */
const ANCHOR_X = 0.02;
const ANCHOR_Y = 0.15;
/** Boxes are pushed apart sideways unless they overlap this many times more horizontally than vertically. */
const SIDEWAYS_BIAS = 3;

/**
 * "Tidy with forces" (#162): a short, deterministic relaxation starting from a layout's positions. Each iteration:
 * - separation: two boxes closer than a margin are pushed apart, sideways unless they mostly overlap vertically;
 * - attraction: a relationship longer than 1.5 × the layout's median relationship is pulled shorter; shorter ones
 *   are left alone;
 * - anchor: each node is pulled back toward where the layout put it.
 * A node moves at most `STEP_CAP` per iteration, and attraction keeps it within `TIDY_MAX_DRIFT` of its start. A last
 * phase of separation alone then removes the overlaps left: no overlap comes first. `fixed` nodes don't move; the
 * others keep clear of them.
 */
export function tidyWithForces(
  start: Pos,
  edges: GraphEdge[],
  sizeOf: (id: string) => Size,
  options: { fixed?: Set<string> } = {}
): Pos {
  const ids = Object.keys(start).sort();
  if (ids.length === 0) return {};
  const fixed = options.fixed ?? new Set<string>();
  const pos: Pos = {};
  for (const id of ids) pos[id] = { ...start[id] };

  const pairKeys = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const e of edges) {
    if (e.from === e.to || !start[e.from] || !start[e.to]) continue;
    const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
    const key = `${a}\u0000${b}`;
    if (!pairKeys.has(key)) { pairKeys.add(key); pairs.push([a, b]); }
  }
  const lengths = pairs.map(([a, b]) => Math.hypot(start[a].x - start[b].x, start[a].y - start[b].y)).sort((p, q) => p - q);
  const fair = lengths.length ? LONG_FACTOR * lengths[Math.floor(lengths.length / 2)] : Infinity;
  const sizes = new Map(ids.map((id) => [id, sizeOf(id)]));

  /** Adds the separation pushes to `disp`; returns whether any boxes overlap (without the margin). */
  const separate = (disp: Pos, strength: number): boolean => {
    let overlapping = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]];
        if (fixed.has(a) && fixed.has(b)) continue;
        const [sa, sb] = [sizes.get(a)!, sizes.get(b)!];
        const dx = pos[b].x - pos[a].x;
        const dy = pos[b].y - pos[a].y;
        const ox = (sa.width + sb.width) / 2 + MARGIN - Math.abs(dx);
        const oy = (sa.height + sb.height) / 2 + MARGIN - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        if (ox > MARGIN && oy > MARGIN) overlapping = true;
        const sideways = oy * SIDEWAYS_BIAS >= ox;
        const amount = strength * (sideways ? ox : oy);
        const sign = (sideways ? dx : dy) >= 0 ? 1 : -1;
        const share = fixed.has(a) || fixed.has(b) ? 1 : 0.5;
        const [vx, vy] = sideways ? [sign * amount * share, 0] : [0, sign * amount * share];
        if (!fixed.has(a)) { disp[a].x -= vx; disp[a].y -= vy; }
        if (!fixed.has(b)) { disp[b].x += vx; disp[b].y += vy; }
      }
    }
    return overlapping;
  };
  const zero = (): Pos => Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]));
  const step = (id: string, d: { x: number; y: number }) => {
    const len = Math.hypot(d.x, d.y);
    const scale = len > STEP_CAP ? STEP_CAP / len : 1;
    return { x: pos[id].x + d.x * scale, y: pos[id].y + d.y * scale };
  };

  for (let it = 0; it < ITERATIONS; it++) {
    const disp = zero();
    const push = (id: string, dx: number, dy: number) => {
      disp[id].x += dx;
      disp[id].y += dy;
    };
    separate(disp, SEPARATION);

    for (const [a, b] of pairs) {
      const dx = pos[b].x - pos[a].x;
      const dy = pos[b].y - pos[a].y;
      const d = Math.hypot(dx, dy);
      if (d <= fair) continue;
      const f = (SPRING * (d - fair)) / d;
      if (!fixed.has(a)) push(a, dx * f, dy * f);
      if (!fixed.has(b)) push(b, -dx * f, -dy * f);
    }

    for (const id of ids) {
      if (fixed.has(id)) continue;
      push(id, ANCHOR_X * (start[id].x - pos[id].x), ANCHOR_Y * (start[id].y - pos[id].y));
      let { x, y } = step(id, disp[id]);
      const drift = Math.hypot(x - start[id].x, y - start[id].y);
      if (drift > TIDY_MAX_DRIFT) {
        x = start[id].x + ((x - start[id].x) * TIDY_MAX_DRIFT) / drift;
        y = start[id].y + ((y - start[id].y) * TIDY_MAX_DRIFT) / drift;
      }
      pos[id] = { x, y };
    }
  }

  for (let it = 0; it < SEPARATION_ITERATIONS; it++) {
    const disp = zero();
    if (!separate(disp, 1)) break;
    for (const id of ids) if (!fixed.has(id)) pos[id] = step(id, disp[id]);
  }
  return pos;
}

const sizeFor = (spacing: number, dims?: Map<string, NodeDimensions>) => (id: string) =>
  dims?.get(id) ?? { width: spacing * 0.45, height: spacing * 0.3 };

/** A layout followed by the relaxation when `options.tidyForces` is set (#162). */
export function withForceTidy(layout: LayoutAlgorithm): LayoutAlgorithm {
  return (nodeIds, edges, spacing, dims, options: LayoutOptions = {}) => {
    const positions = layout(nodeIds, edges, spacing, dims, options);
    return options.tidyForces ? tidyWithForces(positions, edges, sizeFor(spacing, dims)) : positions;
  };
}

/** The same for an asynchronous layout (ELK). */
export function withForceTidyAsync(layout: AsyncLayoutAlgorithm): AsyncLayoutAlgorithm {
  return async (nodeIds, edges, spacing, dims, options: LayoutOptions = {}) => {
    const positions = await layout(nodeIds, edges, spacing, dims, options);
    return options.tidyForces ? tidyWithForces(positions, edges, sizeFor(spacing, dims)) : positions;
  };
}
