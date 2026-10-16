import type { GraphEdge } from '../types';

type Pos = { x: number; y: number };
type Size = { width: number; height: number };

const GAP = 40;

/**
 * Positions for the nodes of `fresh` that have none in `placed` (#152): a node goes where its placed neighbours
 * are, at the offset the fresh layout gives it from them (below its parent, beside its siblings), then sideways
 * off any node it would overlap. Nodes placed this way count as placed for their own neighbours. A group with no
 * placed neighbour keeps its fresh shape, beside the placed nodes. With nothing placed, the fresh layout is used.
 */
export function placeUnsavedNodes(
  placed: Record<string, Pos>,
  fresh: Record<string, Pos>,
  edges: GraphEdge[],
  sizeOf: (id: string) => Size
): Record<string, Pos> {
  const ids = Object.keys(fresh);
  const unsaved = ids.filter((id) => !placed[id]);
  if (Object.keys(placed).length === 0) return { ...fresh };
  if (unsaved.length === 0) return {};

  const neighbours: Record<string, Set<string>> = {};
  for (const e of edges) {
    if (e.from === e.to || !fresh[e.from] || !fresh[e.to]) continue;
    (neighbours[e.from] = neighbours[e.from] || new Set()).add(e.to);
    (neighbours[e.to] = neighbours[e.to] || new Set()).add(e.from);
  }

  const all: Record<string, Pos> = { ...placed };
  const out: Record<string, Pos> = {};
  const overlaps = (id: string, p: Pos) => {
    const a = sizeOf(id);
    return Object.keys(all).some((other) => {
      const b = sizeOf(other);
      return (
        Math.abs(all[other].x - p.x) < (a.width + b.width) / 2 + GAP / 2 &&
        Math.abs(all[other].y - p.y) < (a.height + b.height) / 2 + GAP / 2
      );
    });
  };
  const freeSpot = (id: string, p: Pos): Pos => {
    const step = sizeOf(id).width + GAP;
    for (let k = 0; k <= 50; k++) {
      for (const dir of k === 0 ? [0] : [1, -1]) {
        const candidate = { x: p.x + dir * k * step, y: p.y };
        if (!overlaps(id, candidate)) return candidate;
      }
    }
    return p;
  };

  // Outward from the placed nodes, one ring at a time.
  let ring = unsaved.filter((id) => [...(neighbours[id] ?? [])].some((n) => all[n]));
  while (ring.length) {
    for (const id of ring.sort()) {
      const anchors = [...(neighbours[id] ?? [])].filter((n) => all[n]);
      const x = anchors.reduce((s, n) => s + all[n].x + fresh[id].x - fresh[n].x, 0) / anchors.length;
      const y = anchors.reduce((s, n) => s + all[n].y + fresh[id].y - fresh[n].y, 0) / anchors.length;
      all[id] = out[id] = freeSpot(id, { x, y });
    }
    ring = unsaved.filter((id) => !all[id] && [...(neighbours[id] ?? [])].some((n) => all[n]));
  }

  // The rest: their fresh shape, to the right of everything placed, top-aligned.
  const rest = unsaved.filter((id) => !all[id]);
  if (rest.length) {
    const right = Math.max(...Object.keys(all).map((id) => all[id].x + sizeOf(id).width / 2));
    const top = Math.min(...Object.keys(all).map((id) => all[id].y - sizeOf(id).height / 2));
    const restLeft = Math.min(...rest.map((id) => fresh[id].x - sizeOf(id).width / 2));
    const restTop = Math.min(...rest.map((id) => fresh[id].y - sizeOf(id).height / 2));
    const dx = right + GAP * 4 - restLeft;
    const dy = top - restTop;
    for (const id of rest) out[id] = { x: fresh[id].x + dx, y: fresh[id].y + dy };
  }
  return out;
}
