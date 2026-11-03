/**
 * Lays out the individuals drawn in the graph (#209) by force relaxation, a simple version to improve later: the class nodes
 * (and every other node already placed) stay where they are and anchor the individuals, which are pushed off those nodes and
 * off each other, and pulled along their links, whichever layout placed the classes. Pure and deterministic: positions in,
 * positions out, no randomness (a start on the same point is separated by the index).
 */

export interface RelaxNode {
  id: string;
  x: number;
  y: number;
  /** The room an individual's label takes, when known (DEFAULT_SIZE otherwise). */
  width?: number;
  height?: number;
}

/** A node that does not move: its centre and the room its box takes. */
export interface FixedBox extends RelaxNode {
  width: number;
  height: number;
}

export interface RelaxInput {
  movable: RelaxNode[];
  fixed: FixedBox[];
  /** Pairs of ids: individual to individual, or individual to a fixed node. */
  links: Array<[string, string]>;
  iterations?: number;
}

const ITERATIONS = 150;
const MAX_ITERATIONS = 600;
const MIN_SETTLE_STEPS = 200;
/** How far an individual's centre stays from the edge of a box, and from another individual's centre. */
const BOX_MARGIN = 45;
/** What an individual takes when its size is not known, and the space kept free around it. */
const DEFAULT_SIZE = 70;
const GAP = 8;
const LINK_LENGTH = 150;
const LINK_STRENGTH = 0.05;
const MAX_STEP = 40;
/** Below this move (px) of every individual in a step, with nothing overlapping, the layout has settled. */
const STILL = 0.3;

export function relaxIndividuals({ movable, fixed, links, iterations: requested }: RelaxInput): Map<string, { x: number; y: number }> {
  // A crowd needs more steps to spread out than a few individuals do.
  const settleSteps = Math.max(MIN_SETTLE_STEPS, movable.length * 4);
  const iterations = requested ?? Math.min(MAX_ITERATIONS, Math.max(ITERATIONS, movable.length * 4));
  const points = movable.map((m, i) => ({ id: m.id, x: m.x + (i % 7) * 0.01, y: m.y + Math.floor(i / 7) * 0.01 }));
  const byId = new Map<string, { x: number; y: number }>(points.map((p) => [p.id, p]));
  const anchors = new Map(fixed.map((f) => [f.id, f]));
  const springs = links.filter(([a, b]) => byId.has(a) && (byId.has(b) || anchors.has(b)));
  const sizes = movable.map((m) => ({ width: m.width ?? DEFAULT_SIZE, height: m.height ?? DEFAULT_SIZE }));
  const sizeOf = new Map(movable.map((m, i) => [m.id, sizes[i]]));
  // A grid cell is wider and taller than any box with its gap, so two boxes that overlap are never more than a cell apart.
  const cellW = Math.max(1, ...sizes.map((z) => z.width)) + GAP;
  const cellH = Math.max(1, ...sizes.map((z) => z.height)) + GAP;
  const cellKey = (cx: number, cy: number): number => (cx + 1_000_000) * 4_000_000 + (cy + 1_000_000);

  // The room around a class that the individuals linked to it need, as a disk: the more there are, the further out they sit.
  const linkedTo = new Map<string, number>();
  for (const [, b] of springs) if (anchors.has(b) && !byId.has(b)) linkedTo.set(b, (linkedTo.get(b) ?? 0) + 1);
  const restLength = (a: string, b: string): number => {
    const anchor = anchors.get(b);
    if (!anchor || byId.has(b)) return LINK_LENGTH;
    const own = sizeOf.get(a)!;
    const cell = (own.width + GAP) * (own.height + GAP);
    return Math.max(LINK_LENGTH, Math.hypot(anchor.width, anchor.height) / 2 + Math.sqrt(((linkedTo.get(b) ?? 1) * cell) / Math.PI));
  };

  // The links never change: each one's two ends and rest length are worked out once, not at every step.
  const index = new Map(points.map((p, i) => [p.id, i]));
  const pulls = springs.map(([a, b]) => ({ from: index.get(a)!, other: index.get(b) ?? -1, anchor: anchors.get(b), rest: restLength(a, b) }));
  // What each individual is moved by in a step, by its index.
  const moveX = new Float64Array(points.length);
  const moveY = new Float64Array(points.length);

  // After the relaxation, a few steps with the links off, until nothing overlaps: the links must not hold a crowd together.
  for (let step = 0; step < iterations + settleSteps; step++) {
    const settling = step >= iterations;
    const cooling = settling ? 1 : 1 - step / iterations;
    let crowded = false;
    moveX.fill(0);
    moveY.fill(0);

    // Individuals push each other apart when their boxes (their labels' room) overlap, along the way that clears them soonest;
    // identical points are separated by their order. Only individuals in the same or a next cell of a grid can overlap (a cell
    // is wider than any box), so each is compared with its neighbours and not with all the others.
    const grid = new Map<number, number[]>();
    points.forEach((p, i) => {
      const key = cellKey(Math.floor(p.x / cellW), Math.floor(p.y / cellH));
      const list = grid.get(key);
      if (list) list.push(i);
      else grid.set(key, [i]);
    });
    for (let i = 0; i < points.length; i++) {
      const cx = Math.floor(points[i].x / cellW);
      const cy = Math.floor(points[i].y / cellH);
      for (let gx = -1; gx <= 1; gx++) {
        for (let gy = -1; gy <= 1; gy++) {
          for (const j of grid.get(cellKey(cx + gx, cy + gy)) ?? []) {
            if (j <= i) continue;
            let dx = points[i].x - points[j].x;
            let dy = points[i].y - points[j].y;
            const ox = (sizes[i].width + sizes[j].width) / 2 + GAP - Math.abs(dx);
            const oy = (sizes[i].height + sizes[j].height) / 2 + GAP - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            crowded = true;
            if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
              const angle = (2 * Math.PI * (j + 1)) / (points.length + 1);
              dx = Math.cos(angle);
              dy = Math.sin(angle);
            }
            const [fx, fy] = ox < oy ? [Math.sign(dx || 1) * ox * 0.5, 0] : [0, Math.sign(dy || 1) * oy * 0.5];
            moveX[i] += fx;
            moveY[i] += fy;
            moveX[j] -= fx;
            moveY[j] -= fy;
          }
        }
      }
    }

    // A box pushes an individual out along the shortest way off it, to BOX_MARGIN beyond its edge.
    points.forEach((p, i) => {
      for (const box of fixed) {
        const ox = box.width / 2 + BOX_MARGIN - Math.abs(p.x - box.x);
        const oy = box.height / 2 + BOX_MARGIN - Math.abs(p.y - box.y);
        if (ox <= 0 || oy <= 0) continue;
        crowded = true;
        if (ox < oy) moveX[i] += (p.x >= box.x ? 1 : -1) * ox;
        else moveY[i] += (p.y >= box.y ? 1 : -1) * oy;
      }
    });

    // Links pull to a rest length.
    if (!settling) {
      for (const link of pulls) {
        const from = points[link.from];
        const to = link.other >= 0 ? points[link.other] : link.anchor!;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = (d - link.rest) * LINK_STRENGTH;
        moveX[link.from] += (dx / d) * pull;
        moveY[link.from] += (dy / d) * pull;
        if (link.other >= 0) {
          moveX[link.other] -= (dx / d) * pull;
          moveY[link.other] -= (dy / d) * pull;
        }
      }
    }

    const limit = Math.max(2, MAX_STEP * cooling);
    let moved = 0;
    points.forEach((p, i) => {
      const length = Math.hypot(moveX[i], moveY[i]);
      const scale = length > limit ? limit / length : 1;
      p.x += moveX[i] * scale;
      p.y += moveY[i] * scale;
      moved = Math.max(moved, length * scale);
    });
    // Done when nothing overlaps and nothing moves any more (or, once the links are off, when nothing overlaps).
    if (!crowded && (settling || moved < STILL)) break;
  }
  return new Map(points.map((p) => [p.id, { x: p.x, y: p.y }]));
}
