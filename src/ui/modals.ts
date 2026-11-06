/**
 * Modal management utilities
 * 
 * Note: Due to tight coupling with main.ts state, many modal functions remain in main.ts.
 * This module provides simple show/hide utilities and a structure for future extraction.
 */

import { hideRenameModalPopover } from './renameModalHeaderIcons';

/**
 * Hide the rename modal
 */
export function hideRenameModal(): void {
  hideRenameModalPopover();
  document.getElementById('renameModal')!.style.display = 'none';
}

/**
 * Hide the add node modal
 */
export function hideAddNodeModal(): void {
  document.getElementById('addNodeModal')!.style.display = 'none';
}

/**
 * Hide the edit edge modal
 */
export function hideEditEdgeModal(): void {
  document.getElementById('editEdgeModal')!.style.display = 'none';
}

/**
 * Get cardinality from the edit edge modal
 */
export function getCardinalityFromEditModal(): { minCardinality?: number | null; maxCardinality?: number | null } | undefined {
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap');
  if (!cardWrap || cardWrap.style.display === 'none') return undefined;
  const minVal = minCardInput?.value?.trim();
  const maxVal = maxCardInput?.value?.trim();
  const min = minVal === '' ? null : parseInt(minVal, 10);
  const max = maxVal === '' ? null : parseInt(maxVal, 10);
  if ((minVal !== '' && (isNaN(min!) || min! < 0)) || (maxVal !== '' && (isNaN(max!) || max! < 0))) return undefined;
  return { minCardinality: minVal === '' ? null : min!, maxCardinality: maxVal === '' ? null : max! };
}

/**
 * Show the loading modal
 */
export function showLoadingModal(text = OPENING_ONTOLOGY): void {
  setLoadingText(text);
  setLoadingCancel(null);
  const modal = document.getElementById('loadingModal');
  if (modal) modal.style.display = 'flex';
}

/**
 * Hide the loading modal
 */
export function hideLoadingModal(): void {
  const modal = document.getElementById('loadingModal');
  if (modal) modal.style.display = 'none';
}

/** What the loading screen says by default. */
export const OPENING_ONTOLOGY = 'Opening the ontology…';

/** Sets what the loading screen says: the step being done (#239), such as "Adding the data…". */
export function setLoadingText(text: string): void {
  const el = document.getElementById('loadingModalText');
  if (el) el.textContent = text;
}

/**
 * Shows a Cancel button on the loading screen that calls `onCancel`, or hides it with null (#239 fourth review): a step that
 * reads files or downloads can take a while, and the screen covers the Cancel of the Individuals tab.
 */
export function setLoadingCancel(onCancel: (() => void) | null): void {
  const button = document.getElementById('loadingModalCancel') as HTMLButtonElement | null;
  if (!button) return;
  button.hidden = onCancel === null;
  button.onclick = onCancel;
}

/** Settles when `work` does, or after `ms`, whichever comes first: a wait under the loading screen is never longer. */
export function withinMs(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    void work.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Runs `work` with the loading modal shown, saying `text` (`work` may say the next steps), and hides it after, however `work` ends. */
export async function underLoadingScreen(work: () => Promise<void>, text?: string): Promise<void> {
  showLoadingModal(text);
  try {
    await work();
  } finally {
    hideLoadingModal();
  }
}
