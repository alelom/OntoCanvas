/**
 * The count of individuals on a class node (#209): an overlay badge near the bottom right corner of the node, not part of its
 * label, that draws the individuals of the class when clicked and says what it does when hovered.
 */
import { describe, it, expect, vi } from 'vitest';
import { attachIndividualCountBadges } from '../../src/ui/individualCountBadges';
import type { ClassIndividualsAction } from '../../src/graph/classIndividuals';

const BOX = { left: 0, right: 100, top: 0, bottom: 60 };

function fakeNet(nodes: Array<{ id: string; individualCount?: number }>) {
  let draw: (ctx: CanvasRenderingContext2D) => void = () => {};
  const calls: string[] = [];
  const ctx = new Proxy({ measureText: (t: string) => ({ width: t.length * 8 }) } as Record<string, unknown>, {
    get: (target, key: string) => (key in target ? target[key] : (...args: unknown[]) => void calls.push(`${key}:${args.join(',')}`)),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return {
    net: {
      on: (_event: 'afterDrawing', cb: (c: CanvasRenderingContext2D) => void) => void (draw = cb),
      getBoundingBox: () => BOX,
      body: { data: { nodes: { get: () => nodes } } },
    },
    paint: () => draw(ctx),
    calls,
  };
}

const action = (run = vi.fn(), over: Partial<ClassIndividualsAction> = {}): ClassIndividualsAction => ({ label: 'Show 50 individuals', title: 'Draw 50 of the individuals of this class in the graph', disabled: false, run, ...over });
/** Where the badge of a class node sits: on its bottom right corner. */
const corner = { x: BOX.right - 6, y: BOX.bottom - 2 };

describe('attachIndividualCountBadges', () => {
  it('draws a badge only on a class node that has individuals', () => {
    const { net, paint, calls } = fakeNet([{ id: 'Room' }, { id: 'Person', individualCount: 3 }]);
    attachIndividualCountBadges(net, () => action());

    paint();

    const texts = calls.filter((c) => c.startsWith('fillText'));
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/^fillText:3,/);
  });

  it('draws the individuals of the class when the badge is clicked, and not when the click is elsewhere on the node', () => {
    const run = vi.fn();
    const { net, paint } = fakeNet([{ id: 'Person', individualCount: 120 }]);
    const badges = attachIndividualCountBadges(net, () => action(run));
    paint();

    expect(badges.openAt({ x: 50, y: 30 })).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(badges.openAt(corner)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it('explains itself in a tooltip: how many individuals, and what a click does', () => {
    const { net, paint } = fakeNet([{ id: 'Person', individualCount: 120 }]);
    const badges = attachIndividualCountBadges(net, () => action());
    paint();

    expect(badges.tooltipAt({ x: 50, y: 30 })).toBeNull();
    expect(badges.tooltipAt(corner)).toBe('120 individuals of this class in the loaded data.\nDraw 50 of the individuals of this class in the graph');
  });

  it('does nothing when the action is disabled, and says why', () => {
    const run = vi.fn();
    const { net, paint } = fakeNet([{ id: 'Person', individualCount: 1 }]);
    const badges = attachIndividualCountBadges(net, () => action(run, { disabled: true, title: 'Every individual of this class is drawn' }));
    paint();

    expect(badges.openAt(corner)).toBe(false);
    expect(badges.tooltipAt(corner)).toBe('1 individual of this class in the loaded data.\nEvery individual of this class is drawn');
  });
});
