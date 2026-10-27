/**
 * Undo and redo of edits: the stacks, the buttons, and marking the file changed.
 * Moved out of main.ts (#175).
 */
import { actions } from '../state/actions';
import { editState, fileState, session } from '../state/appState';
import { updateSaveButtonVisibility } from '../ui/fileBar';

export function pushUndoable(undo: () => void, redo: () => void): void {
  editState.redoStack = [];
  editState.undoStack.push({ undo, redo });
  updateUndoRedoButtons();
}

export function performUndo(): void {
  const action = editState.undoStack.pop();
  if (!action) return;
  action.undo();
  editState.redoStack.push(action);
  updateUndoRedoButtons();
  fileState.hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  
  // CRITICAL FIX: Deduplicate rawData.edges after undo to prevent duplicates
  // This ensures that when expandWithExternalRefs runs, it doesn't create edges that already exist
  const deduplicatedEdges: typeof session.rawData.edges = [];
  const seenEdgeKeys = new Set<string>();
  
  for (const edge of session.rawData.edges) {
    // Build all possible keys for this edge (accounting for URI/local name variations)
    const keys = new Set<string>();
    keys.add(`${edge.from}||${edge.to}||${edge.type}`);
    
    // Add variations with op.uri and op.name
    const op = session.objectProperties.find((p) => p.name === edge.type || p.uri === edge.type);
    if (op) {
      if (op.name) keys.add(`${edge.from}||${edge.to}||${op.name}`);
      if (op.uri) keys.add(`${edge.from}||${edge.to}||${op.uri}`);
    }
    
    // Also add variations for from/to using local names
    const fromLocal = edge.from.includes('#') ? edge.from.split('#').pop() : edge.from.includes('/') ? edge.from.split('/').pop() : edge.from;
    const toLocal = edge.to.includes('#') ? edge.to.split('#').pop() : edge.to.includes('/') ? edge.to.split('/').pop() : edge.to;
    if (fromLocal !== edge.from) {
      keys.add(`${fromLocal}||${edge.to}||${edge.type}`);
      if (op) {
        if (op.name) keys.add(`${fromLocal}||${edge.to}||${op.name}`);
        if (op.uri) keys.add(`${fromLocal}||${edge.to}||${op.uri}`);
      }
    }
    if (toLocal !== edge.to) {
      keys.add(`${edge.from}||${toLocal}||${edge.type}`);
      if (op) {
        if (op.name) keys.add(`${edge.from}||${toLocal}||${op.name}`);
        if (op.uri) keys.add(`${edge.from}||${toLocal}||${op.uri}`);
      }
    }
    if (fromLocal !== edge.from && toLocal !== edge.to) {
      keys.add(`${fromLocal}||${toLocal}||${edge.type}`);
      if (op) {
        if (op.name) keys.add(`${fromLocal}||${toLocal}||${op.name}`);
        if (op.uri) keys.add(`${fromLocal}||${toLocal}||${op.uri}`);
      }
    }
    
    // Check if any of these keys have been seen
    let isDuplicate = false;
    for (const key of keys) {
      if (seenEdgeKeys.has(key)) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      // Mark all keys as seen and add the edge
      for (const key of keys) {
        seenEdgeKeys.add(key);
      }
      deduplicatedEdges.push(edge);
    }
  }
  
  session.rawData.edges = deduplicatedEdges;
  
  actions.applyFilter(true);
}

export function performRedo(): void {
  const action = editState.redoStack.pop();
  if (!action) return;
  action.redo();
  editState.undoStack.push(action);
  updateUndoRedoButtons();
  fileState.hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  actions.applyFilter(true);
}

export function clearUndoRedo(): void {
  editState.undoStack = [];
  editState.redoStack = [];
  updateUndoRedoButtons();
}

export function updateUndoRedoButtons(): void {
  const undoBtn = document.getElementById('undoBtn') as HTMLButtonElement | null;
  const redoBtn = document.getElementById('redoBtn') as HTMLButtonElement | null;
  if (undoBtn) undoBtn.disabled = editState.undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = editState.redoStack.length === 0;
}
