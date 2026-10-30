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
/** How far an individual's centre stays from the edge of a box, and from another individual's centre. */
const BOX_MARGIN = 45;
const MIN_GAP = 70;
const LINK_LENGTH = 150;
const LINK_STRENGTH = 0.05;
const MAX_STEP = 40;

export function relaxIndividuals({ movable, fixed, links, iterations = ITERATIONS }: RelaxInput): Map<string, { x: number; y: number }> {
  const points = movable.map((m, i) => ({ id: m.id, x: m.x + (i % 7) * 0.01, y: m.y + Math.floor(i / 7) * 0.01 }));
  const byId = new Map<string, { x: number; y: number }>(points.map((p) => [p.id, p]));
  const anchors = new Map(fixed.map((f) => [f.id, f]));
  const springs = links.filter(([a, b]) => byId.has(a) && (byId.has(b) || anchors.has(b)));

  for (let step = 0; step < iterations; step++) {
    const cooling = 1 - step / iterations;
    const move = new Map(points.map((p) => [p.id, { x: 0, y: 0 }]));
    const push = (id: string, dx: number, dy: number): void => {
      const m = move.get(id)!;
      m.x += dx;
      m.y += dy;
    };

    // Individuals repel each other when closer than MIN_GAP; identical points are separated by their order.
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        let dx = points[i].x - points[j].x;
        let dy = points[i].y - points[j].y;
        let d = Math.hypot(dx, dy);
        if (d >= MIN_GAP) continue;
        if (d < 0.001) {
          const angle = (2 * Math.PI * (j + 1)) / (points.length + 1);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const force = (MIN_GAP - d) * 0.5;
        push(points[i].id, (dx / d) * force, (dy / d) * force);
        push(points[j].id, (-dx / d) * force, (-dy / d) * force);
      }
    }

    // A box pushes an individual out along the shortest way off it, to BOX_MARGIN beyond its edge.
    for (const p of points) {
      for (const box of fixed) {
        const ox = box.width / 2 + BOX_MARGIN - Math.abs(p.x - box.x);
        const oy = box.height / 2 + BOX_MARGIN - Math.abs(p.y - box.y);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) push(p.id, (p.x >= box.x ? 1 : -1) * ox, 0);
        else push(p.id, 0, (p.y >= box.y ? 1 : -1) * oy);
      }
    }

    // Links pull to a rest length.
    for (const [a, b] of springs) {
      const from = byId.get(a)!;
      const to = byId.get(b) ?? anchors.get(b)!;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = (d - LINK_LENGTH) * LINK_STRENGTH;
      push(a, (dx / d) * pull, (dy / d) * pull);
      if (byId.has(b)) push(b, (-dx / d) * pull, (-dy / d) * pull);
    }

    const limit = Math.max(2, MAX_STEP * cooling);
    for (const p of points) {
      const m = move.get(p.id)!;
      const length = Math.hypot(m.x, m.y);
      const scale = length > limit ? limit / length : 1;
      p.x += m.x * scale;
      p.y += m.y * scale;
    }
  }
  return new Map(points.map((p) => [p.id, { x: p.x, y: p.y }]));
}
