/**
 * Individuals laid out by force relaxation (#209): the class nodes stay where they are and anchor the individuals, which are
 * pushed off the classes and off each other and pulled toward what they are linked to. Pure: positions in, positions out.
 */
import { describe, it, expect } from 'vitest';
import { relaxIndividuals, type FixedBox } from '../../src/graph/individualsRelax';

const box = (id: string, x: number, y: number): FixedBox => ({ id, x, y, width: 120, height: 50 });
const inside = (p: { x: number; y: number }, b: FixedBox, margin = 0) =>
  Math.abs(p.x - b.x) < b.width / 2 + margin && Math.abs(p.y - b.y) < b.height / 2 + margin;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('relaxIndividuals', () => {
  it('moves individuals that start on a class node off it, and keeps the class where it is', () => {
    const fixed = [box('Room', 0, 0)];
    const movable = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, x: i, y: -i }));
    const links = movable.map((m) => [m.id, 'Room'] as [string, string]);

    const out = relaxIndividuals({ movable, fixed, links });

    for (const m of movable) expect(inside(out.get(m.id)!, fixed[0]), m.id).toBe(false);
    expect(fixed[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('keeps individuals apart from each other', () => {
    const movable = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, x: 0, y: 0 }));

    const out = relaxIndividuals({ movable, fixed: [box('C', 0, 0)], links: [] });

    const points = movable.map((m) => out.get(m.id)!);
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) expect(dist(points[i], points[j])).toBeGreaterThan(30);
  });

  it('keeps an individual near the class it is linked to, and off the other classes between', () => {
    const fixed = [box('A', 0, 0), box('B', 600, 0), box('Mid', 300, 0)];

    const out = relaxIndividuals({ movable: [{ id: 'x', x: 300, y: 0 }], fixed, links: [['x', 'A']] });

    const p = out.get('x')!;
    expect(inside(p, fixed[2], 10)).toBe(false);
    expect(dist(p, { x: 0, y: 0 })).toBeLessThan(400);
  });

  it('is the same every time', () => {
    const movable = [{ id: 'a', x: 5, y: 5 }, { id: 'b', x: 5, y: 5 }];
    const args = { movable, fixed: [box('C', 0, 0)], links: [['a', 'b'] as [string, string]] };

    expect([...relaxIndividuals(args)]).toEqual([...relaxIndividuals(args)]);
  });

  it('does nothing with no individuals, and gives finite positions with no class', () => {
    expect(relaxIndividuals({ movable: [], fixed: [box('C', 0, 0)], links: [] }).size).toBe(0);

    const out = relaxIndividuals({ movable: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }], fixed: [], links: [['a', 'b']] });

    for (const p of out.values()) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

describe('relaxIndividuals with many individuals of one class', () => {
  const size = { width: 90, height: 34 };
  const crowd = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, x: 0, y: 0, ...size }));
  const overlap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < size.width && Math.abs(a.y - b.y) < size.height;

  it('leaves no two of them on top of each other, whatever the size of their labels', () => {
    const movable = crowd(120);

    const out = relaxIndividuals({ movable, fixed: [box('Sensor', 0, 0)], links: movable.map((m) => [m.id, 'Sensor'] as [string, string]) });

    const points = movable.map((m) => out.get(m.id)!);
    let overlapping = 0;
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (overlap(points[i], points[j])) overlapping++;
    expect(overlapping).toBe(0);
  });

  it('leaves none overlapping at the total cap, around one class or two crowds with a class between them', () => {
    const count = (movable: ReturnType<typeof crowd>, fixed: FixedBox[], links: Array<[string, string]>) => {
      const out = relaxIndividuals({ movable, fixed, links });
      const points = movable.map((m) => out.get(m.id)!);
      let n = 0;
      for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) if (overlap(points[i], points[j])) n++;
      return n;
    };
    const one = crowd(300);
    expect(count(one, [box('Sensor', 0, 0)], one.map((m) => [m.id, 'Sensor']))).toBe(0);

    const two = crowd(300);
    const links = two.map((m, i) => [m.id, i < 150 ? 'A' : 'B'] as [string, string]);
    expect(count(two.map((m, i) => ({ ...m, x: i < 150 ? -500 : 500 })), [box('A', -500, 0), box('B', 500, 0), box('Mid', 0, 0)], links)).toBe(0);
  });

  it('keeps them off the class and spreads them out from it as there are more', () => {
    const fixed = [box('Sensor', 0, 0)];
    const spread = (n: number) => {
      const movable = crowd(n);
      const out = relaxIndividuals({ movable, fixed, links: movable.map((m) => [m.id, 'Sensor'] as [string, string]) });
      const points = movable.map((m) => out.get(m.id)!);
      for (const p of points) expect(inside(p, fixed[0])).toBe(false);
      return Math.max(...points.map((p) => dist(p, { x: 0, y: 0 })));
    };

    expect(spread(120)).toBeGreaterThan(spread(10) * 1.5);
  });
});
