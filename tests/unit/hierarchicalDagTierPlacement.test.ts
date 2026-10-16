/**
 * Hierarchical DAG tier placement (#150): each tier's nodes go as close as possible to the x
 * they want, keeping their order and the minimum gap between centres. The old placement pushed
 * overlaps right and then shifted the whole tier left by the average push, which left crowded
 * groups right of their parents and moved nodes that weren't crowded.
 */
import { describe, it, expect } from 'vitest';
import { placeTier } from '../../src/layouts/hierarchicalDag';

const cost = (xs: number[], want: number[]) => xs.reduce((s, x, i) => s + (x - want[i]) ** 2, 0);

describe('placeTier', () => {
  it('centres a crowded group on what it wants and leaves the other nodes alone', () => {
    // The old placement gave -47, 93, 953.
    const xs = placeTier([0, 0, 1000], [140, 140]);
    expect(xs[0]).toBeCloseTo(-70);
    expect(xs[1]).toBeCloseTo(70);
    expect(xs[2]).toBeCloseTo(1000);
  });

  it('keeps every node at its desired x when nothing overlaps', () => {
    expect(placeTier([-500, 0, 300], [100, 100])).toEqual([-500, 0, 300]);
  });

  it('spreads nodes that all want the same x evenly around it', () => {
    const xs = placeTier([50, 50, 50, 50], [100, 100, 100]);
    xs.forEach((x, i) => expect(x).toBeCloseTo(50 - 150 + 100 * i));
  });

  it('keeps the order and the minimum gaps, whatever the desired x', () => {
    const want = [300, -200, 40, 40, 900, 880, -50];
    const gaps = [120, 80, 200, 60, 150, 90];
    const xs = placeTier(want, gaps);
    gaps.forEach((g, i) => expect(xs[i + 1] - xs[i]).toBeGreaterThanOrEqual(g - 1e-9));
  });

  it('is the least-squares optimum: no small shift of a node or a group does better', () => {
    const want = [300, -200, 40, 40, 900, 880, -50];
    const gaps = [120, 80, 200, 60, 150, 90];
    const xs = placeTier(want, gaps);
    const best = cost(xs, want);
    const feasible = (ys: number[]) => gaps.every((g, i) => ys[i + 1] - ys[i] >= g - 1e-9);
    for (let i = 0; i < xs.length; i++) {
      for (let j = i; j < xs.length; j++) {
        for (const d of [-1, 1]) {
          const ys = xs.map((x, k) => (k >= i && k <= j ? x + d : x));
          if (feasible(ys)) expect(cost(ys, want)).toBeGreaterThanOrEqual(best - 1e-6);
        }
      }
    }
  });

  it('places a single node or an empty tier', () => {
    expect(placeTier([42], [])).toEqual([42]);
    expect(placeTier([], [])).toEqual([]);
  });
});
