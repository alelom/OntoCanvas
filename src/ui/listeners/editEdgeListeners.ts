/**
 * The Edit Edge modal: its type search, sections, confirm and cancel, and its keyboard handling.
 * Moved out of eventListeners.ts (#198).
 */
import { editState } from '../../state/appState';
import { hideEditEdgeModalWithCleanup, updateEditEdgeCommentDisplayLocal } from '../edgeModalHelpers';
import { confirmEditEdge } from '../editEdgeConfirm';
import { updateEditEdgeTypeSearch, updateEditEdgeTypeSections } from '../editEdgeTypeSearch';
import { hideRelationshipTooltip } from '../relationshipUtils';

export function wireEditEdge(): void {
  document.getElementById('editEdgeCancel')?.addEventListener('click', hideEditEdgeModalWithCleanup);
  document.getElementById('editEdgeConfirm')?.addEventListener('click', confirmEditEdge);
  
  // Toggle cardinality visibility based on restriction checkbox
  document.getElementById('editEdgeIsRestriction')?.addEventListener('change', (e) => {
    const isRestrictionCb = e.target as HTMLInputElement;
    const cardWrap = document.getElementById('editEdgeCardinalityWrap');
    if (cardWrap) {
      cardWrap.style.display = isRestrictionCb.checked ? 'block' : 'none';
      // Clear cardinality values when unchecked (they don't apply to non-restrictions)
      if (!isRestrictionCb.checked) {
        const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
        const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;
        if (minCardInput) minCardInput.value = '';
        if (maxCardInput) maxCardInput.value = '';
      }
    }
  });
  
  let editEdgeTypeSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  document.getElementById('editEdgeType')?.addEventListener('input', (e) => {
    const typeInput = e.target as HTMLInputElement;
    const query = typeInput.value.trim();
    
    // Clear previous timeout
    if (editEdgeTypeSearchTimeout) {
      clearTimeout(editEdgeTypeSearchTimeout);
    }
    
    // Reset selection when user types
    editState.selectedEdgeType = null;
    editState.selectedExternalObjectProperty = null;
    
    // Debounce search
    editEdgeTypeSearchTimeout = setTimeout(() => {
      updateEditEdgeTypeSearch(query).catch((err) => {
        console.error('Error in edge type search:', err);
      });
    }, 150);
    
    // Also update comment display immediately if we have a selected type
    if (editState.selectedEdgeType) {
      updateEditEdgeCommentDisplayLocal();
    }
  });
  
  // Close results when clicking outside
  document.addEventListener('click', (e) => {
    const resultsDiv = document.getElementById('editEdgeTypeResults');
    const typeInput = document.getElementById('editEdgeType');
    if (resultsDiv && typeInput && 
        !resultsDiv.contains(e.target as Node) && 
        !typeInput.contains(e.target as Node)) {
      resultsDiv.style.display = 'none';
      hideRelationshipTooltip();
    }
  });
  
  // Keep the sections in step with the type on leaving the field too (a no-op once a type was chosen).
  document.getElementById('editEdgeType')?.addEventListener('focusout', updateEditEdgeTypeSections);
  document.getElementById('editEdgeModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'editEdgeModal') hideEditEdgeModalWithCleanup();
  });
  document.getElementById('editEdgeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#editEdgeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') confirmEditEdge();
      else hideEditEdgeModalWithCleanup();
      e.preventDefault();
    }
  });
  // Document-level Escape so Edit Edge modal closes regardless of focus (e.g. type-ahead)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('editEdgeModal');
    if (modal && modal.style.display !== 'none') {
      hideEditEdgeModalWithCleanup();
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}
