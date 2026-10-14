/**
 * The dismissible warning bar above the canvas (`#warningMsg`): a notice that does not block, e.g. an empty
 * canvas, or a display config borrowed from the latest version (#136).
 */

/** Show `text` in the warning bar, with its close button working. */
export function showWarningBar(text: string): void {
  const bar = document.getElementById('warningMsg');
  const textEl = document.getElementById('warningMsgText');
  if (!bar || !textEl) return;
  textEl.textContent = text;
  bar.style.display = 'flex';
  const closeBtn = document.getElementById('warningMsgClose');
  if (closeBtn) {
    // Replace the button, so listeners from earlier notices do not pile up.
    const fresh = closeBtn.cloneNode(true) as HTMLElement;
    closeBtn.replaceWith(fresh);
    fresh.addEventListener('click', () => {
      bar.style.display = 'none';
    });
  }
}

export function hideWarningBar(): void {
  const bar = document.getElementById('warningMsg');
  if (bar) bar.style.display = 'none';
}
