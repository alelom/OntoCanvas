import { debugWarn } from './debug';

/**
 * Copy text to the clipboard. Uses the async Clipboard API, falling back to a hidden textarea +
 * execCommand where that API is unavailable (non-secure contexts, some iframes).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    debugWarn('[clipboard] Clipboard API failed, falling back to execCommand:', err);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position: fixed; top: -1000px; opacity: 0;';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
