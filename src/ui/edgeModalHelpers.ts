/**
 * Helpers of the edit edge modal: closing it with its cleanup, and showing the comment of the chosen type.
 * Moved out of main.ts (#175).
 */
import { editState, session } from '../state/appState';
import { hideEditEdgeModal } from './modals';
import { updateEditEdgeCommentDisplay } from './relationshipUtils';

export function updateEditEdgeCommentDisplayLocal(): void {
  const typeInput = document.getElementById('editEdgeType') as HTMLInputElement;
  const commentEl = document.getElementById('editEdgeComment') as HTMLElement;
  if (!typeInput || !commentEl) return;
  
  const comment = updateEditEdgeCommentDisplay(
    editState.selectedEdgeType,
    editState.selectedExternalObjectProperty,
    typeInput.value,
    session.objectProperties
  );
  
  if (comment) {
    commentEl.textContent = comment;
    commentEl.style.display = 'block';
  } else {
    commentEl.textContent = '';
    commentEl.style.display = 'none';
  }
}

// hideEditEdgeModal wrapper - state cleanup still needed in main.ts
export function hideEditEdgeModalWithCleanup(): void {
  if (editState.pendingEditEdgeCallback) {
    editState.pendingEditEdgeCallback(null);
    editState.pendingEditEdgeCallback = null;
  }
  if (editState.pendingAddEdgeData) {
    editState.pendingAddEdgeData.callback(null);
    editState.pendingAddEdgeData = null;
  }
  hideEditEdgeModal();
}
