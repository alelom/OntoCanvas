/**
 * Modals shown when loading an ontology from URL fails (before the editor is opened).
 * Keeps pre-open failures out of the in-editor error bar.
 */

import { deriveTtlFileNameFromUrl } from '../utils/deriveTtlFileNameFromUrl';

const MODAL_STYLE = `
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10002;
`;

const CONTENT_STYLE = `
  background: white;
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 520px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
`;

const TITLE_STYLE = `
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
`;

const BODY_STYLE = `
  margin: 0 0 20px 0;
  font-size: 14px;
  line-height: 1.5;
  color: #333;
`;

const BUTTON_ROW_STYLE = `
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
`;

const PRIMARY_BTN_STYLE = `
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
  border-radius: 4px;
  border: none;
`;

const LINK_STYLE = `
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
  color: #0066cc;
  text-decoration: underline;
  background: none;
  border: none;
`;

function createModalBase(title: string, bodyHtml: string): { overlay: HTMLElement; content: HTMLElement } {
  const overlay = document.createElement('div');
  overlay.style.cssText = MODAL_STYLE;

  const content = document.createElement('div');
  content.style.cssText = CONTENT_STYLE;

  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  titleEl.style.cssText = TITLE_STYLE;

  const body = document.createElement('p');
  body.style.cssText = BODY_STYLE;
  body.innerHTML = bodyHtml;

  content.appendChild(titleEl);
  content.appendChild(body);
  overlay.appendChild(content);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
      document.body.style.overflow = '';
    }
  });
  document.addEventListener('keydown', function esc(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      overlay.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', esc);
    }
  });

  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  return { overlay, content };
}

/**
 * Show the CORS fallback modal: explain CORS, offer "Download TTL" link and "Open file" button.
 */
export function showCorsFailureModal(
  url: string,
  onOpenFile: () => void | Promise<void>
): void {
  const fileName = deriveTtlFileNameFromUrl(url);
  const bodyHtml = `This ontology could not be loaded because the server does not allow cross-origin requests (CORS). You can still use it by downloading the file and opening it here.`;
  const { overlay, content } = createModalBase('Could not load ontology from URL', bodyHtml);

  const buttons = document.createElement('div');
  buttons.style.cssText = BUTTON_ROW_STYLE;

  const downloadLink = document.createElement('a');
  downloadLink.href = url;
  downloadLink.download = fileName;
  downloadLink.rel = 'noopener noreferrer';
  downloadLink.target = '_blank';
  downloadLink.textContent = `Download TTL (${fileName})`;
  downloadLink.style.cssText = LINK_STYLE;
  downloadLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  const openFileBtn = document.createElement('button');
  openFileBtn.textContent = 'Open file…';
  openFileBtn.className = 'primary';
  openFileBtn.style.cssText = PRIMARY_BTN_STYLE;
  const close = (): void => {
    overlay.remove();
    document.body.style.overflow = '';
  };
  openFileBtn.addEventListener('click', () => {
    close();
    void Promise.resolve(onOpenFile());
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = PRIMARY_BTN_STYLE + ' background: #f0f0f0; border: 1px solid #ccc;';
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = '';
  });

  buttons.appendChild(downloadLink);
  buttons.appendChild(openFileBtn);
  buttons.appendChild(closeBtn);
  content.appendChild(buttons);
}

/**
 * Show the slow-server modal: the ontology's server did not answer in time. That is often temporary, so the
 * main suggestion is to reload; opening a downloaded copy is the other way out.
 *
 * @param seconds - How long the app waited
 * @param reload - What "Reload" does (the page itself by default; injectable for tests)
 */
export function showTimeoutFailureModal(
  _url: string,
  seconds: number,
  onOpenFile: () => void | Promise<void>,
  reload: () => void = () => window.location.reload()
): void {
  const unit = seconds === 1 ? 'second' : 'seconds';
  const bodyHtml = `The server took too long to send the ontology: nothing arrived within ${seconds} ${unit}.<br><br>It may just be slow or busy, so <strong>reloading the page</strong> often works. If it keeps happening, download the file from the URL and open it here using <strong>Open file</strong>.`;
  const { overlay, content } = createModalBase('The server took too long to answer', bodyHtml);

  const close = (): void => {
    overlay.remove();
    document.body.style.overflow = '';
  };

  const buttons = document.createElement('div');
  buttons.style.cssText = BUTTON_ROW_STYLE;

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload';
  reloadBtn.className = 'primary';
  reloadBtn.style.cssText = PRIMARY_BTN_STYLE;
  reloadBtn.addEventListener('click', () => {
    close();
    reload();
  });

  const openFileBtn = document.createElement('button');
  openFileBtn.textContent = 'Open file…';
  openFileBtn.style.cssText = PRIMARY_BTN_STYLE + ' background: #f0f0f0; border: 1px solid #ccc;';
  openFileBtn.addEventListener('click', () => {
    close();
    void Promise.resolve(onOpenFile());
  });

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText = PRIMARY_BTN_STYLE + ' background: #f0f0f0; border: 1px solid #ccc;';
  closeBtn.addEventListener('click', close);

  buttons.appendChild(reloadBtn);
  buttons.appendChild(openFileBtn);
  buttons.appendChild(closeBtn);
  content.appendChild(buttons);
}

/**
 * Show the generic URL load failure modal (non-CORS): show error and suggest download-then-open as an option.
 */
export function showGenericUrlLoadFailureModal(_url: string, errorMessage: string): void {
  const bodyHtml = `The ontology could not be loaded from the URL.<br><br><strong>Error:</strong> ${escapeHtml(errorMessage)}<br><br>You can try downloading the TTL file from the URL and opening it here using <strong>Open file</strong>.`;
  const { overlay, content } = createModalBase('Failed to load ontology from URL', bodyHtml);

  const buttons = document.createElement('div');
  buttons.style.cssText = BUTTON_ROW_STYLE;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.className = 'primary';
  closeBtn.style.cssText = PRIMARY_BTN_STYLE;
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = '';
  });

  buttons.appendChild(closeBtn);
  content.appendChild(buttons);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
