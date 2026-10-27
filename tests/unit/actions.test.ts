/**
 * The late-bound action registry (#175): modules moved out of main.ts call `actions.name(...)` for the few functions that
 * stay in the cycle of main.ts, and main.ts registers the real ones once, before the app starts.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { actions, registerActions, type Actions } from '../../src/state/actions';

const original = { ...actions };
afterEach(() => registerActions(original));

describe('actions', () => {
  it('fails loudly, naming the action, when one is called before main.ts registered it', () => {
    expect(() => (actions.applyFilter as () => void)()).toThrow(/applyFilter/);
  });

  it('calls what main.ts registered, with the arguments it was given', () => {
    const applyFilter = vi.fn();
    registerActions({ ...actions, applyFilter } as Actions);

    actions.applyFilter(true);

    expect(applyFilter).toHaveBeenCalledWith(true);
  });

  it('keeps the same object, so a module that imported it sees a later registration', () => {
    const seen = actions;
    const applyFilter = vi.fn();
    registerActions({ ...actions, applyFilter } as Actions);
    expect(seen.applyFilter).toBe(applyFilter);
  });
});
