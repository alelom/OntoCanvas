/**
 * Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y undo and redo the ontology edits (#180).
 *
 * Not while the user types in a field (an input, a textarea, the query editor): there the keys belong to the field's
 * own undo, and the ontology behind the panel must not change.
 */
import { performUndo, performRedo } from '../workflows/undoRedo';
import { isTextEditingElement } from '../utils/textEditing';

export function handleHistoryShortcut(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  if (isTextEditingElement(document.activeElement) || isTextEditingElement(e.target as Element | null)) return;

  e.preventDefault();
  if (key === 'y' || e.shiftKey) performRedo();
  else performUndo();
}
