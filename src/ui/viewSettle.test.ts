import { describe, it, expect } from 'vitest';
import { beginViewSettle, isViewSettled, viewSettled } from './viewSettle';

describe('view settle: is the graph view still moving after a render? (#93)', () => {
  it('is unsettled from the start of a render until it settles', () => {
    const t = beginViewSettle();
    expect(isViewSettled()).toBe(false);
    viewSettled(t);
    expect(isViewSettled()).toBe(true);
  });

  it("an earlier render's late fit does not settle a newer render", () => {
    const first = beginViewSettle();
    const second = beginViewSettle();
    viewSettled(first);
    expect(isViewSettled()).toBe(false);
    viewSettled(second);
    expect(isViewSettled()).toBe(true);
  });
});
