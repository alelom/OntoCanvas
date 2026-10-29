/**
 * The keyboard shortcuts of the whole page: find, history and deleting the selection.
 * Moved out of eventListeners.ts (#198).
 */
import { canvasState } from '../../state/appState';
import { debugLog } from '../../utils/debug';
import { performDeleteSelection } from '../../workflows/deleteSelection';
import { handleHistoryShortcut } from '../historyShortcuts';

export function wireGlobalShortcuts(): void {
  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('searchQuery') as HTMLInputElement;
        searchInput?.focus();
      }
      handleHistoryShortcut(e);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Run in capture phase so we handle Delete before search input (which would delete a character)
        const activeEl = document.activeElement as HTMLElement;
        debugLog(`[DELETE KEY] Delete/Backspace key pressed. Active element:`, activeEl?.id || activeEl?.tagName);
        if (activeEl?.id === 'searchQuery' && canvasState.network?.getSelectedNodes().length) {
          activeEl.blur();
        }
        if (performDeleteSelection()) e.preventDefault();
      }
    },
    { capture: true }
  );
}
