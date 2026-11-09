/**
 * Notices for the bottom bar's issues area (#239): what the app tells without blocking, such as an ontology with no classes,
 * data explored with no ontology, or a version's display config borrowed from the latest one. One message per key, so setting
 * a key again replaces its message; opening another ontology clears them. They used to be a bar over the canvas. No DOM: the
 * status bar draws them (src/ui/statusBar.ts).
 *
 * A notice is a note unless it says otherwise: a warning, or an error (#240). An error, and a warning marked `alert` (one the
 * user must not miss, such as a folder whose images the browser could not see), also pop up once in a small modal
 * (src/ui/noticeModal.ts).
 */

export type NoticeLevel = 'note' | 'warning' | 'error';

/** Steps the user can take, drawn under the message: on Windows, open a folder again from a shorter path. */
export type NoticeHelp = { kind: 'long-path'; folder: string };

export interface NoticeOptions {
  /** Defaults to a note. */
  level?: NoticeLevel;
  /** A warning that pops up as an error does. */
  alert?: boolean;
  /**
   * What makes it pop up again when it changes; defaults to the message. A folder's warning is the counts: a class named by its
   * label once the ontologies are read is not news.
   */
  alertKey?: string;
  help?: NoticeHelp;
  /**
   * What the notice is about, for its pop-up to be turned off for that only, for the session: `key` names it (a folder by its
   * name), `label` says it ("this folder (run-0001)").
   */
  mute?: { key: string; label: string };
}

export interface Notice extends NoticeOptions {
  key: string;
  message: string;
}

const notices = new Map<string, Notice>();
const listeners: Array<() => void> = [];
const alertListeners: Array<(notice: Notice) => void> = [];
const changed = () => listeners.forEach((listener) => listener());

/** Whether a notice pops up: an error, or a warning marked to. */
export const popsUp = (notice: NoticeOptions): boolean => notice.level === 'error' || (notice.level === 'warning' && !!notice.alert);

const alertKeyOf = (notice: Notice | undefined): string | undefined => notice && (notice.alertKey ?? notice.message);

/**
 * Sets the message of `key`, or removes it with null. A notice that pops up asks for it when it is new or its `alertKey` (its
 * message, by default) changed.
 */
export function setNotice(key: string, message: string | null, options: NoticeOptions = {}): void {
  if (message === null) {
    if (notices.delete(key)) changed();
    return;
  }
  const before = notices.get(key);
  const notice: Notice = { key, message, ...options };
  if (before && JSON.stringify(before) === JSON.stringify(notice)) return;
  notices.set(key, notice);
  changed();
  if (popsUp(notice) && alertKeyOf(before) !== alertKeyOf(notice)) alertListeners.forEach((listener) => listener(notice));
}

export function clearNotices(): void {
  if (!notices.size) return;
  notices.clear();
  changed();
}

export const getNotices = (): Notice[] => [...notices.values()];

export function onNoticesChange(listener: () => void): void {
  listeners.push(listener);
}

/** Called with each notice that pops up, when it is set. */
export function onNoticeAlert(listener: (notice: Notice) => void): void {
  alertListeners.push(listener);
}
