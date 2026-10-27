/**
 * The test-log capture that E2E tests read through `__EDITOR_TEST__.getTestLogs` (moved out of main.ts, #175).
 * Pins the behaviour it had there: which messages are kept, and what still reaches the real console.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildMessageIfNeeded, hasTestLogTag, installTestLogCapture, safeStringify } from '../../src/e2e/testLogCapture';

describe('hasTestLogTag', () => {
  it.each(['[DELETE]', '[GET EDGE DATA]', '[DELETE KEY]', '[DEBUG]', '[TEST]'])('finds %s', (tag) => {
    expect(hasTestLogTag(`before ${tag} after`)).toBe(true);
  });

  it('finds nothing in an ordinary message', () => {
    expect(hasTestLogTag('loaded 12 classes')).toBe(false);
    expect(hasTestLogTag('[OTHER] tag')).toBe(false);
  });
});

describe('safeStringify', () => {
  it('returns a string as it is, and an object as JSON', () => {
    expect(safeStringify('plain')).toBe('plain');
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
  });

  it('falls back to String() for a circular structure', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(safeStringify(circular)).toBe('[object Object]');
  });

  it('gives up with a fixed text when even String() fails', () => {
    const hostile = { toJSON: () => { throw new Error('no json'); }, toString: () => { throw new Error('no string'); } };
    expect(safeStringify(hostile)).toBe('[Unable to stringify]');
  });
});

describe('buildMessageIfNeeded', () => {
  it('returns the joined message when a string argument carries a tag', () => {
    expect(buildMessageIfNeeded(['[DELETE] removed', 3, { a: 1 }])).toBe('[DELETE] removed 3 {"a":1}');
  });

  it('finds a tag that is only in a non-string argument', () => {
    expect(buildMessageIfNeeded(['x', { note: '[TEST] inside' }])).toBe('x {"note":"[TEST] inside"}');
  });

  it('returns null when there is no tag anywhere', () => {
    expect(buildMessageIfNeeded(['plain', 'text'])).toBeNull();
    expect(buildMessageIfNeeded(['plain', { a: 1 }])).toBeNull();
  });
});

describe('installTestLogCapture', () => {
  const fakeConsole = () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() });

  it('keeps a tagged log with a timestamp and passes it on to the real console, even without debug mode', () => {
    const real = fakeConsole();
    const target = { ...real };
    const { getTestLogs } = installTestLogCapture(() => false, target);

    target.log('[TEST] hello', 1);

    expect(getTestLogs()).toHaveLength(1);
    expect(getTestLogs()[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[TEST\] hello 1$/);
    expect(real.log).toHaveBeenCalledWith('[TEST] hello', 1);
  });

  it('drops an untagged log unless debug mode is on, and never keeps it', () => {
    const quiet = fakeConsole();
    const quietTarget = { ...quiet };
    const quietCapture = installTestLogCapture(() => false, quietTarget);
    quietTarget.log('just chatting');
    expect(quiet.log).not.toHaveBeenCalled();
    expect(quietCapture.getTestLogs()).toEqual([]);

    const loud = fakeConsole();
    const loudTarget = { ...loud };
    const loudCapture = installTestLogCapture(() => true, loudTarget);
    loudTarget.log('just chatting');
    expect(loud.log).toHaveBeenCalledWith('just chatting');
    expect(loudCapture.getTestLogs()).toEqual([]);
  });

  it('always passes errors and warnings on, and keeps the tagged ones', () => {
    const real = fakeConsole();
    const target = { ...real };
    const { getTestLogs } = installTestLogCapture(() => false, target);

    target.error('plain error');
    target.warn('[DEBUG] tagged warning');

    expect(real.error).toHaveBeenCalledWith('plain error');
    expect(real.warn).toHaveBeenCalledWith('[DEBUG] tagged warning');
    expect(getTestLogs()).toHaveLength(1);
    expect(getTestLogs()[0]).toContain('[DEBUG] tagged warning');
  });

  it('keeps the last 1000 logs, dropping the oldest', () => {
    const target = fakeConsole();
    const { getTestLogs, addTestLog } = installTestLogCapture(() => false, target);

    for (let i = 0; i < 1005; i++) addTestLog(`entry ${i}`);

    expect(getTestLogs()).toHaveLength(1000);
    expect(getTestLogs()[0]).toContain('entry 5');
    expect(getTestLogs()[999]).toContain('entry 1004');
  });

  it('hands out the same array every time, so a reader sees later entries', () => {
    const target = fakeConsole();
    const { getTestLogs, addTestLog } = installTestLogCapture(() => false, target);
    const logs = getTestLogs();
    addTestLog('later');
    expect(logs).toHaveLength(1);
  });
});
