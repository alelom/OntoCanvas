/**
 * A stand-in for `localStorage` for the unit tests (#175).
 *
 * On Node 26, `globalThis.localStorage` is an accessor (Node's own web storage) that returns undefined unless a
 * storage file is configured. In Vitest's jsdom environment `window` is `globalThis`, so it shadows jsdom's own
 * storage, and a test that calls `localStorage.clear()` throws. CI runs Node 20 and never saw it.
 */

/** An in-memory `Storage`, enough for what the code and tests use. */
export class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  [name: string]: unknown;

  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
}

/** Install a working `localStorage` on `target` unless it already has one. */
export function ensureLocalStorage(target: object): void {
  let current: unknown;
  try {
    current = (target as { localStorage?: unknown }).localStorage;
  } catch {
    current = undefined; // an accessor that throws counts as missing
  }
  if (current && typeof (current as Storage).clear === 'function') return;
  Object.defineProperty(target, 'localStorage', { configurable: true, writable: true, value: new MemoryStorage() });
}
