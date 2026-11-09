/**
 * The small modal an error, or a warning marked to pop up, opens when it is set (#240): a problem found while loading, such as a
 * folder whose images the browser could not see, is noticed even with the bottom bar out of sight. One modal at a time: a notice
 * set while it is open is added to it. ×, Escape or a click beside it dismisses it; the notice stays in the bottom bar.
 */
import { getNotices, type Notice } from './statusNotices';
import { renderLongPathSteps } from './sidePanel/imageProblem';

let open: { modal: HTMLElement; list: HTMLElement; title: HTMLElement; close: () => void } | null = null;

/**
 * The subjects whose pop-up the user turned off ("Don't show this again for this folder"): for the session of this tab, so a new
 * one shows it again. Kept in memory too, for a browser that keeps nothing.
 */
const MUTED_KEY = 'ontocanvas-muted-notices';
const mutedInMemory = new Set<string>();
const readMuted = (): Set<string> => {
  try {
    return new Set([...mutedInMemory, ...(JSON.parse(sessionStorage.getItem(MUTED_KEY) ?? '[]') as string[])]);
  } catch {
    return new Set(mutedInMemory);
  }
};

export const isNoticeMuted = (key: string): boolean => readMuted().has(key);

function muteNotice(key: string): void {
  mutedInMemory.add(key);
  try {
    sessionStorage.setItem(MUTED_KEY, JSON.stringify([...readMuted(), key]));
  } catch {
    // Kept in memory only.
  }
}

/** Whether the loading screen is up: a notice found while loading pops up once it is gone, not under it. */
const loadingScreen = (): HTMLElement | null => {
  const screen = document.getElementById('loadingModal');
  return screen && screen.style.display !== 'none' && screen.style.display !== '' ? screen : null;
};

/** Calls `then` once the loading screen is gone, or at once when it is not up. */
function afterLoading(then: () => void): void {
  const screen = loadingScreen();
  if (!screen) return then();
  const observer = new MutationObserver(() => {
    if (loadingScreen()) return;
    observer.disconnect();
    then();
  });
  observer.observe(screen, { attributes: true, attributeFilter: ['style'] });
}

/**
 * Shows a notice that pops up, once the loading is over, unless the user turned its pop-up off for what it is about. It is shown
 * as it is by then: its message may have changed meanwhile (a class named by its label), or it may be gone.
 */
export function popUpNotice(notice: Notice): void {
  if (notice.mute && isNoticeMuted(notice.mute.key)) return;
  afterLoading(() => {
    const now = getNotices().find((n) => n.key === notice.key);
    if (now) showNoticeModal(now);
  });
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function create(): NonNullable<typeof open> {
  const modal = element('div', 'modal notice-modal');
  modal.setAttribute('data-notice-modal', '');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const box = element('div', 'modal-content notice-modal-content');
  const header = element('div', 'notice-modal-header');
  const title = element('h3');
  title.id = 'noticeModalTitle';
  modal.setAttribute('aria-labelledby', title.id);
  const cross = element('button', 'notice-modal-close', '×');
  cross.type = 'button';
  cross.title = 'Close';
  cross.setAttribute('aria-label', 'Close');
  cross.setAttribute('data-notice-modal-close', '');
  header.append(title, cross);
  const list = element('div', 'notice-modal-list');
  box.append(header, list);
  modal.append(box);

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };
  const close = () => {
    // The subjects whose box is ticked stay quiet for the session, however the modal is closed.
    list.querySelectorAll<HTMLInputElement>('[data-notice-modal-mute]:checked').forEach((box) => muteNotice(box.value));
    document.removeEventListener('keydown', onKey);
    modal.remove();
    open = null;
  };
  cross.addEventListener('click', close);
  // A click beside the box, on the backdrop.
  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(modal);
  cross.focus();
  return { modal, list, title, close };
}

/** Shows a notice in the modal, opening it when it is not open; a notice of the same key replaces the one shown. */
export function showNoticeModal(notice: Notice): void {
  // Taken out of the page by something else (the page redrawn): opened again.
  if (open && !open.modal.isConnected) open.close();
  open ??= create();
  const item = element('div', `notice-modal-item notice-${notice.level ?? 'note'}`);
  item.setAttribute('data-notice-modal-item', notice.key);
  item.append(notice.message);
  if (notice.help?.kind === 'long-path') item.append(renderLongPathSteps(notice.help.folder));
  if (notice.mute) {
    const label = element('label', 'notice-modal-mute');
    const box = element('input');
    box.type = 'checkbox';
    box.value = notice.mute.key;
    box.setAttribute('data-notice-modal-mute', '');
    label.append(box, `Don't show this again for ${notice.mute.label} in this session`);
    item.append(label);
  }
  const shown = [...open.list.children].find((child) => child.getAttribute('data-notice-modal-item') === notice.key);
  if (shown) shown.replaceWith(item);
  else open.list.append(item);
  const anError = [...open.list.children].some((child) => child.classList.contains('notice-error'));
  open.title.textContent = anError ? 'Error' : 'Warning';
}
