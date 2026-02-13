/**
 * Modal management utilities
 * 
 * Note: Due to tight coupling with main.ts state, many modal functions remain in main.ts.
 * This module provides simple show/hide utilities and a structure for future extraction.
 */

/**
 * Hide the rename modal
 */
export function hideRenameModal(): void {
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
export function showLoadingModal(): void {
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
