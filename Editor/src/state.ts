/**
 * Central application state. Shared across modules.
 */
import type { GraphData, GraphNode } from './types';
import type { Network } from 'vis-network/esnext';
import type { Store } from 'n3';

export interface AppState {
  rawData: GraphData;
  annotationProperties: { name: string; isBoolean: boolean }[];
  network: Network | null;
  ttlStore: Store | null;
  loadedFileName: string | null;
  loadedFilePath: string | null;
  fileHandle: FileSystemFileHandle | null;
  hasUnsavedChanges: boolean;
  addNodeMode: boolean;
  addedFromClickHandler: boolean;
  pendingAddNodePosition: { x: number; y: number } | null;
  addNodeModalShowing: boolean;
  pendingEditEdgeCallback: ((data: { from: string; to: string } | null) => void) | null;
  pendingAddEdgeData: {
    from: string;
    to: string;
    callback: (data: { from: string; to: string; id?: string } | null) => void;
  } | null;
  undoStack: Array<{ undo: () => void; redo: () => void }>;
  redoStack: Array<{ undo: () => void; redo: () => void }>;
}

export const state: AppState = {
  rawData: { nodes: [], edges: [] },
  annotationProperties: [],
  network: null,
  ttlStore: null,
  loadedFileName: null,
  loadedFilePath: null,
  fileHandle: null,
  hasUnsavedChanges: false,
  addNodeMode: false,
  addedFromClickHandler: false,
  pendingAddNodePosition: null,
  addNodeModalShowing: false,
  pendingEditEdgeCallback: null,
  pendingAddEdgeData: null,
  undoStack: [],
  redoStack: [],
};
