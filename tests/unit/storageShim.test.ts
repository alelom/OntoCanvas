/**
 * The test setup's stand-in for `localStorage` (#175). On Node 26 `globalThis.localStorage` is an accessor that returns
 * undefined, and in Vitest's jsdom environment (where `window` is `globalThis`) it shadows jsdom's own storage, so
 * `localStorage.clear()` threw. The shim installs a working storage where there is none, and leaves a working one alone.
 */
import { describe, it, expect } from 'vitest';
import { ensureLocalStorage, MemoryStorage } from '../storageShim';

describe('MemoryStorage', () => {
  it('stores strings, returns null for a missing key, and counts its keys', () => {
    const s = new MemoryStorage();
    expect(s.getItem('a')).toBeNull();
    s.setItem('a', '1');
    s.setItem('b', '2');
    expect(s.getItem('a')).toBe('1');
    expect(s.length).toBe(2);
  });

  it('turns any value into a string, as the real one does', () => {
    const s = new MemoryStorage();
    s.setItem('n', 5 as unknown as string);
    expect(s.getItem('n')).toBe('5');
  });

  it('removes one key and clears all', () => {
    const s = new MemoryStorage();
    s.setItem('a', '1');
    s.setItem('b', '2');
    s.removeItem('a');
    expect(s.getItem('a')).toBeNull();
    s.clear();
    expect(s.length).toBe(0);
  });

  it('lists its keys by position, and null past the end', () => {
    const s = new MemoryStorage();
    s.setItem('a', '1');
    s.setItem('b', '2');
    expect([s.key(0), s.key(1), s.key(2)]).toEqual(['a', 'b', null]);
  });

  it('overwrites a key without growing', () => {
    const s = new MemoryStorage();
    s.setItem('a', '1');
    s.setItem('a', '2');
    expect(s.getItem('a')).toBe('2');
    expect(s.length).toBe(1);
  });
});

describe('ensureLocalStorage', () => {
  it('installs a working storage where there is none', () => {
    const target: { localStorage?: Storage } = {};
    ensureLocalStorage(target);
    target.localStorage!.setItem('a', '1');
    expect(target.localStorage!.getItem('a')).toBe('1');
    target.localStorage!.clear();
    expect(target.localStorage!.length).toBe(0);
  });

  it('replaces the accessor Node 26 defines, which returns undefined', () => {
    const target = {} as { localStorage?: Storage };
    Object.defineProperty(target, 'localStorage', { configurable: true, get: () => undefined });
    expect(target.localStorage).toBeUndefined();

    ensureLocalStorage(target);

    expect(() => target.localStorage!.clear()).not.toThrow();
  });

  it('leaves a working storage alone', () => {
    const existing = new MemoryStorage();
    const target = { localStorage: existing as Storage };
    ensureLocalStorage(target);
    expect(target.localStorage).toBe(existing);
  });
});
