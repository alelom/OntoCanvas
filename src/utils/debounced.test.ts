import { describe, it, expect, vi, afterEach } from 'vitest';
import { debounced } from './debounced';

describe('debounced', () => {
  afterEach(() => vi.useRealTimers());

  it('runs once, after the delay since the last schedule', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounced(fn, 150);
    d.schedule();
    vi.advanceTimersByTime(100);
    d.schedule();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('cancel drops a pending run (Escape right after typing must not reopen the suggestions, #93)', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const d = debounced(fn, 150);
    d.schedule();
    d.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});
