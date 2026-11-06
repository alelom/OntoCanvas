/**
 * Notices for the bottom bar's issues area (#239): what the app tells without blocking, such as an ontology with no classes,
 * data explored with no ontology, or a version's display config borrowed from the latest one. One message per key, so setting
 * a key again replaces its message; opening another ontology clears them. They used to be a bar over the canvas. No DOM: the
 * status bar draws them (src/ui/statusBar.ts).
 */

export interface Notice {
  key: string;
  message: string;
}

const notices = new Map<string, string>();
const listeners: Array<() => void> = [];
const changed = () => listeners.forEach((listener) => listener());

/** Sets the message of `key`, or removes it with null. */
export function setNotice(key: string, message: string | null): void {
  if (message === null) {
    if (notices.delete(key)) changed();
    return;
  }
  if (notices.get(key) === message) return;
  notices.set(key, message);
  changed();
}

export function clearNotices(): void {
  if (!notices.size) return;
  notices.clear();
  changed();
}

export const getNotices = (): Notice[] => [...notices].map(([key, message]) => ({ key, message }));

export function onNoticesChange(listener: () => void): void {
  listeners.push(listener);
}
