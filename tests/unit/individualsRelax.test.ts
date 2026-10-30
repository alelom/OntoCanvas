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
