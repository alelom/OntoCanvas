/**
 * Undo/redo management.
 */
import { state } from '../state';

export type UndoableAction = { undo: () => void; redo: () => void };

export function pushUndoable(undo: () => void, redo: () => void): void {
  state.redoStack = [];
  state.undoStack.push({ undo, redo });
}

export function performUndo(): UndoableAction | null {
  const action = state.undoStack.pop();
  if (!action) return null;
  action.undo();
  state.redoStack.push(action);
  return action;
}

export function performRedo(): UndoableAction | null {
  const action = state.redoStack.pop();
  if (!action) return null;
  action.redo();
  state.undoStack.push(action);
  return action;
}

export function clearUndoRedo(): void {
  state.undoStack = [];
  state.redoStack = [];
}
