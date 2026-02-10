import { DataSet } from 'vis-data/esnext';
import { Network } from 'vis-network/esnext';
import 'vis-network/styles/vis-network.css';
import {
  parseTtlToGraph,
  updateLabelInStore,
  updateLabellableInStore,
  updateCommentInStore,
  updateEdgeInStore,
  addEdgeToStore,
  removeEdgeFromStore,
  addNodeToStore,
  removeNodeFromStore,
  addObjectPropertyToStore,
  removeObjectPropertyFromStore,
  updateObjectPropertyLabelInStore,
  updateObjectPropertyCommentInStore,
  addDataPropertyToStore,
  removeDataPropertyFromStore,
  updateDataPropertyLabelInStore,
  updateDataPropertyCommentInStore,
  updateDataPropertyRangeInStore,
  addDataPropertyRestrictionToClass,
  removeDataPropertyRestrictionFromClass,
  getDataPropertyRestrictionsForClass,
  addAnnotationPropertyToStore,
  updateAnnotationPropertyLabelInStore,
  updateAnnotationPropertyCommentInStore,
  updateAnnotationPropertyIsBooleanInStore,
  removeAnnotationPropertyFromStore,
  storeToTurtle,
  extractLocalName,
} from './parser';
import {
  searchExternalClasses,
  preloadExternalOntologyClasses,
  type ExternalClassInfo,
} from './externalOntologySearch';
import type { GraphData, GraphEdge, GraphNode, DataPropertyRestriction } from './types';
import {
  wrapText,
  getEdgeTypes,
  getDefaultEdgeColors,
  getDefaultColor,
  getSpacing,
  computeNodeDepths,
  computeWeightedLayout,
  estimateNodeDimensions,
  resolveOverlaps,
  matchesSearch,
  COLORS,
} from './graph';
import './style.css';

const IDB_NAME = 'OntologyEditor';
const IDB_STORE = 'lastFile';
const IDB_KEY = 'handle';
const IDB_DISPLAY_NAME = 'OntologyEditorDisplay';
const IDB_DISPLAY_STORE = 'config';
const IDB_EXTERNAL_REFS_NAME = 'OntologyEditorExternalRefs';
const IDB_EXTERNAL_REFS_STORE = 'refs';

interface DisplayConfig {
  version: number;
  nodePositions: Record<string, { x: number; y: number }>;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: BorderLineType }>;
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  relationshipFontSize: number;
  layoutMode: string;
  searchQuery: string;
  includeNeighbors: boolean;
  annotationStyleConfig?: unknown;
  viewState?: { scale: number; position: { x: number; y: number } };
}

interface ExternalOntologyReference {
  url: string;
  usePrefix: boolean;
  prefix?: string; // Optional prefix name (e.g., 'dc', 'schema')
}

let externalOntologyReferences: ExternalOntologyReference[] = [];

const DISPLAY_CONFIG_VERSION = 1;

function getDisplayConfigKey(): string | null {
  return loadedFilePath || loadedFileName || null;
}

/** Normalize to filename for consistent lookup across different load paths. */
function getDisplayConfigKeyNormalized(): string | null {
  const raw = getDisplayConfigKey();
  if (!raw) return null;
  const basename = raw.replace(/^.*[/\\]/, '');
  return basename || raw;
}

async function openDisplayConfigDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DISPLAY_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_DISPLAY_STORE)) {
        db.createObjectStore(IDB_DISPLAY_STORE);
      }
    };
  });
}

async function loadDisplayConfigFromIndexedDB(): Promise<DisplayConfig | null> {
  const keysToTry = [
    getDisplayConfigKeyNormalized(),
    getDisplayConfigKey(),
  ].filter((k): k is string => !!k);
  const seen = new Set<string>();
  const uniqueKeys = keysToTry.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (uniqueKeys.length === 0) return null;
  try {
    const db = await openDisplayConfigDB();
    for (const key of uniqueKeys) {
      const result = await new Promise<DisplayConfig | null>((resolve) => {
        const tx = db.transaction(IDB_DISPLAY_STORE, 'readonly');
        const store = tx.objectStore(IDB_DISPLAY_STORE);
        const req = store.get(key);
        req.onsuccess = () => {
          const v = req.result;
          resolve(v && typeof v === 'object' && v.version === DISPLAY_CONFIG_VERSION ? v : null);
        };
        req.onerror = () => resolve(null);
      });
      if (result) {
        db.close();
        return result;
      }
    }
    db.close();
  } catch {
    // ignore
  }
  return null;
}

async function saveDisplayConfigToIndexedDB(config: DisplayConfig): Promise<void> {
  const key = getDisplayConfigKeyNormalized() || getDisplayConfigKey();
  if (!key) return;
  try {
    const db = await openDisplayConfigDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_DISPLAY_STORE, 'readwrite');
      const store = tx.objectStore(IDB_DISPLAY_STORE);
      store.put({ ...config, version: DISPLAY_CONFIG_VERSION }, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore
  }
}

async function openExternalRefsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_EXTERNAL_REFS_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_EXTERNAL_REFS_STORE)) {
        db.createObjectStore(IDB_EXTERNAL_REFS_STORE);
      }
    };
  });
}

async function loadExternalRefsFromIndexedDB(): Promise<ExternalOntologyReference[]> {
  const key = getDisplayConfigKeyNormalized() || getDisplayConfigKey();
  if (!key) return [];
  try {
    const db = await openExternalRefsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_EXTERNAL_REFS_STORE, 'readonly');
      const store = tx.objectStore(IDB_EXTERNAL_REFS_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as ExternalOntologyReference[]) || []);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

async function saveExternalRefsToIndexedDB(refs: ExternalOntologyReference[]): Promise<void> {
  const key = getDisplayConfigKeyNormalized() || getDisplayConfigKey();
  if (!key) return;
  try {
    const db = await openExternalRefsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_EXTERNAL_REFS_STORE, 'readwrite');
      const store = tx.objectStore(IDB_EXTERNAL_REFS_STORE);
      store.put(refs, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    // ignore
  }
}

function collectDisplayConfig(): DisplayConfig | null {
  if (rawData.nodes.length === 0) return null;
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  const annotationPropsContent = document.getElementById('annotationPropsContent');
  const nodePositions: Record<string, { x: number; y: number }> = {};
  rawData.nodes.forEach((n) => {
    if (n.x != null && n.y != null) nodePositions[n.id] = { x: n.x, y: n.y };
  });
  return {
    version: DISPLAY_CONFIG_VERSION,
    nodePositions,
    edgeStyleConfig: edgeStylesContent ? getEdgeStyleConfig(edgeStylesContent) : {},
    wrapChars: parseInt((document.getElementById('wrapChars') as HTMLInputElement)?.value, 10) || 10,
    minFontSize: parseInt((document.getElementById('minFontSize') as HTMLInputElement)?.value, 10) || 20,
    maxFontSize: parseInt((document.getElementById('maxFontSize') as HTMLInputElement)?.value, 10) || 80,
    relationshipFontSize: parseInt((document.getElementById('relationshipFontSize') as HTMLInputElement)?.value, 10) || 18,
    layoutMode: (document.getElementById('layoutMode') as HTMLSelectElement)?.value || 'weighted',
    searchQuery: (document.getElementById('searchQuery') as HTMLInputElement)?.value ?? '',
    includeNeighbors: (document.getElementById('searchIncludeNeighbors') as HTMLInputElement)?.checked ?? true,
    annotationStyleConfig: annotationPropsContent ? getAnnotationStyleConfig(annotationPropsContent) : undefined,
    viewState: network
      ? { scale: network.getScale(), position: network.getViewPosition() }
      : undefined,
  };
}

function applyDisplayConfig(config: DisplayConfig): void {
  Object.entries(config.nodePositions || {}).forEach(([id, pos]) => {
    const node = rawData.nodes.find((n) => n.id === id);
    if (node) {
      node.x = pos.x;
      node.y = pos.y;
    }
  });
  (document.getElementById('wrapChars') as HTMLInputElement).value = String(config.wrapChars ?? 10);
  (document.getElementById('minFontSize') as HTMLInputElement).value = String(config.minFontSize ?? 20);
  (document.getElementById('maxFontSize') as HTMLInputElement).value = String(config.maxFontSize ?? 80);
  (document.getElementById('relationshipFontSize') as HTMLInputElement).value = String(config.relationshipFontSize ?? 18);
  (document.getElementById('layoutMode') as HTMLSelectElement).value = config.layoutMode ?? 'weighted';
  (document.getElementById('searchQuery') as HTMLInputElement).value = config.searchQuery ?? '';
  (document.getElementById('searchIncludeNeighbors') as HTMLInputElement).checked = config.includeNeighbors ?? true;
  const edgeStyleConfig = config.edgeStyleConfig || {};
  if (document.getElementById('edgeStylesContent')) {
    Object.keys(edgeStyleConfig).forEach((type) => {
      const c = edgeStyleConfig[type];
      if (c) {
        const showCb = document.querySelector(`.edge-show-cb[data-type="${type}"]`) as HTMLInputElement | null;
        const labelCb = document.querySelector(`.edge-label-cb[data-type="${type}"]`) as HTMLInputElement | null;
        const colorEl = document.querySelector(`.edge-color-picker[data-type="${type}"]`) as HTMLInputElement | null;
        const lineTypeEl = document.querySelector(`.edge-linetype[data-type="${type}"]`) as HTMLInputElement | null;
        if (showCb) showCb.checked = c.show !== false;
        if (labelCb) labelCb.checked = c.showLabel !== false;
        if (colorEl) colorEl.value = c.color || getDefaultEdgeColors()[type] || getDefaultColor();
        if (lineTypeEl && c.lineType) {
          lineTypeEl.value = c.lineType;
          const dropdown = lineTypeEl.closest('.ap-linetype-dropdown');
          const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
          const opt = BORDER_LINE_OPTIONS.find((o) => o.value === c.lineType);
          if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
        }
      }
    });
    updateEdgeColorsLegend();
  }
  // Annotation style config is stored but restoration is deferred (complex DOM structure)
}

let displayConfigSaveTimer: number | null = null;

function scheduleDisplayConfigSave(): void {
  if (displayConfigSaveTimer != null) window.clearTimeout(displayConfigSaveTimer);
  displayConfigSaveTimer = window.setTimeout(() => {
    displayConfigSaveTimer = null;
    const config = collectDisplayConfig();
    if (config) saveDisplayConfigToIndexedDB(config).catch(() => {});
  }, 500);
}

async function getLastFileFromIndexedDB(): Promise<{
  handle: FileSystemFileHandle;
  name: string;
  pathHint?: string;
} | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_KEY);
      getReq.onsuccess = () => {
        const v = getReq.result;
        resolve(v && v.handle && v.name ? { handle: v.handle, name: v.name, pathHint: v.pathHint } : null);
      };
      getReq.onerror = () => resolve(null);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

async function saveLastFileToIndexedDB(
  handle: FileSystemFileHandle,
  name: string,
  pathHint?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ handle, name, pathHint }, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

function updateLoadLastOpenedButton(name: string | null, pathHint?: string): void {
  const btn = document.getElementById('loadLastOpened') as HTMLButtonElement;
  if (!btn) return;
  if (name) {
    btn.textContent = `Load last opened: ${name}`;
    btn.title = pathHint ?? name;
    btn.disabled = false;
    btn.dataset.hasLast = '1';
  } else {
    btn.textContent = 'Load last opened: (none)';
    btn.title = 'Select a TTL file first to enable';
    btn.disabled = true;
    btn.dataset.hasLast = '';
  }
}

let rawData: GraphData = { nodes: [], edges: [] };
let annotationProperties: { name: string; isBoolean: boolean }[] = [];
let objectProperties: { name: string; label: string; hasCardinality: boolean; comment?: string | null }[] = [];
let dataProperties: { name: string; label: string; comment?: string | null; range: string }[] = [];
let network: Network | null = null;
let addNodeMode = false;
let pendingAddNodePosition: { x: number; y: number } | null = null;
let addNodeModalShowing = false;
let ttlStore: import('n3').Store | null = null;
let loadedFileName: string | null = null;
let loadedFilePath: string | null = null;
let fileHandle: FileSystemFileHandle | null = null;
let hasUnsavedChanges = false;
let pendingEditEdgeCallback: ((data: { from: string; to: string } | null) => void) | null = null;
let pendingAddEdgeData: { from: string; to: string; callback: (data: { from: string; to: string; id?: string } | null) => void } | null = null;
/** Initial data property restrictions when rename modal was opened (single-node mode). */
let renameModalInitialDataProps: DataPropertyRestriction[] | null = null;
/** Current data property restrictions while editing in rename modal (single-node mode). */
let renameModalDataPropertyRestrictions: DataPropertyRestriction[] = [];

type UndoableAction = { undo: () => void; redo: () => void };
let undoStack: UndoableAction[] = [];
let redoStack: UndoableAction[] = [];

function pushUndoable(undo: () => void, redo: () => void): void {
  redoStack = [];
  undoStack.push({ undo, redo });
  updateUndoRedoButtons();
}

function performUndo(): void {
  const action = undoStack.pop();
  if (!action) return;
  action.undo();
  redoStack.push(action);
  updateUndoRedoButtons();
  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  applyFilter(true);
}

function performRedo(): void {
  const action = redoStack.pop();
  if (!action) return;
  action.redo();
  undoStack.push(action);
  updateUndoRedoButtons();
  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  applyFilter(true);
}

function clearUndoRedo(): void {
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
}

function addNewNodeAtPosition(
  x?: number,
  y?: number,
  label = 'New class'
): { id: string; label: string; x?: number; y?: number } | null {
  if (!ttlStore) return null;
  const displayLabel = label.trim() || 'New class';
  const id = addNodeToStore(ttlStore, displayLabel);
  if (!id) return null;
  const node: GraphNode = {
    id,
    label: displayLabel,
    labellableRoot: null,
    ...(x != null && y != null && { x, y }),
  };
  rawData.nodes.push(node);
  pushUndoable(
    () => {
      removeNodeFromStore(ttlStore!, id);
      const i = rawData.nodes.findIndex((n) => n.id === id);
      if (i >= 0) rawData.nodes.splice(i, 1);
    },
    () => {
      addNodeToStore(ttlStore!, displayLabel, id);
      rawData.nodes.push(node);
    }
  );
  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  return { id, label: displayLabel, x, y };
}

function updateUndoRedoButtons(): void {
  const undoBtn = document.getElementById('undoBtn') as HTMLButtonElement | null;
  const redoBtn = document.getElementById('redoBtn') as HTMLButtonElement | null;
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function performDeleteSelection(): boolean {
  if (!network || !ttlStore) return false;
  const activeEl = document.activeElement as HTMLElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
    return false;
  }
  const selectedNodeIds = network.getSelectedNodes().map(String);
  const selectedEdgeIds = network.getSelectedEdges().map(String);
  if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return false;

  const edgesToRemove: { from: string; to: string; type: string }[] = [];
  const dataPropertyRestrictionsToRemove: { classId: string; propertyName: string }[] = [];
  for (const edgeId of selectedEdgeIds) {
    const m = edgeId.match(/^(.+)->(.+):(.+)$/);
    if (m) {
      const [, from, to, type] = m;
      // Check if this is a data property edge
      if (type === 'dataprop' && from.startsWith('__dataprop__')) {
        const dpMatch = from.match(/^__dataprop__(.+)__(.+)$/);
        if (dpMatch) {
          const [, classId, propertyName] = dpMatch;
          dataPropertyRestrictionsToRemove.push({ classId, propertyName });
        }
      } else {
        edgesToRemove.push({ from, to, type });
      }
    }
  }

  const nodesToRemove = selectedNodeIds.filter((id) => rawData.nodes.some((n) => n.id === id));
  const connectedEdges = rawData.edges.filter(
    (e) => nodesToRemove.includes(e.from) || nodesToRemove.includes(e.to)
  );

  const nodeUndoActions: Array<() => void> = [];
  const nodeRedoActions: Array<() => void> = [];
  const edgeUndoActions: Array<() => void> = [];
  const edgeRedoActions: Array<() => void> = [];
  const dataPropUndoActions: Array<() => void> = [];
  const dataPropRedoActions: Array<() => void> = [];

  // Remove edges BEFORE nodes. Restriction-based edges (contains, partOf) require the node's
  // subClassOf quads to still exist for removeEdgeFromStore to find and remove them.
  for (const { from, to, type } of edgesToRemove) {
    const edge = rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
    const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
    const ok = removeEdgeFromStore(ttlStore, from, to, type);
    if (ok) {
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) rawData.edges.splice(idx, 1);
      edgeUndoActions.push(() => {
        addEdgeToStore(ttlStore!, from, to, type, card);
        rawData.edges.push(edge ?? { from, to, type });
      });
      edgeRedoActions.push(() => {
        removeEdgeFromStore(ttlStore!, from, to, type);
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
        if (i >= 0) rawData.edges.splice(i, 1);
      });
    } else {
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) {
        const edge = rawData.edges[idx];
        const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
        rawData.edges.splice(idx, 1);
        edgeUndoActions.push(() => {
          addEdgeToStore(ttlStore!, from, to, type, card);
          rawData.edges.push(edge);
        });
        edgeRedoActions.push(() => {
          removeEdgeFromStore(ttlStore!, from, to, type);
          const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
          if (i >= 0) rawData.edges.splice(i, 1);
        });
      }
    }
  }

  for (const { from, to, type } of connectedEdges) {
    if (edgesToRemove.some((e) => e.from === from && e.to === to && e.type === type)) continue;
    const edge = rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
    const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
    const ok = removeEdgeFromStore(ttlStore, from, to, type);
    if (ok) {
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) rawData.edges.splice(idx, 1);
      edgeUndoActions.push(() => {
        addEdgeToStore(ttlStore!, from, to, type, card);
        rawData.edges.push(edge ?? { from, to, type });
      });
      edgeRedoActions.push(() => {
        removeEdgeFromStore(ttlStore!, from, to, type);
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
        if (i >= 0) rawData.edges.splice(i, 1);
      });
    } else {
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) {
        const edge = rawData.edges[idx];
        const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
        rawData.edges.splice(idx, 1);
        edgeUndoActions.push(() => {
          addEdgeToStore(ttlStore!, from, to, type, card);
          rawData.edges.push(edge);
        });
        edgeRedoActions.push(() => {
          removeEdgeFromStore(ttlStore!, from, to, type);
          const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
          if (i >= 0) rawData.edges.splice(i, 1);
        });
      }
    }
  }

  // Handle data property restriction deletions
  for (const { classId, propertyName } of dataPropertyRestrictionsToRemove) {
    const classNode = rawData.nodes.find((n) => n.id === classId);
    const restriction = classNode?.dataPropertyRestrictions?.find((r) => r.propertyName === propertyName);
    if (!classNode || !restriction) continue;
    
    const oldMin = restriction.minCardinality ?? null;
    const oldMax = restriction.maxCardinality ?? null;
    
    removeDataPropertyRestrictionFromClass(ttlStore, classId, propertyName);
    const nodeIndex = rawData.nodes.findIndex((n) => n.id === classId);
    if (nodeIndex >= 0) {
      rawData.nodes[nodeIndex].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(ttlStore, classId);
    }
    
    dataPropUndoActions.push(() => {
      addDataPropertyRestrictionToClass(ttlStore!, classId, propertyName, { minCardinality: oldMin ?? undefined, maxCardinality: oldMax ?? undefined });
      const idx = rawData.nodes.findIndex((n) => n.id === classId);
      if (idx >= 0) {
        rawData.nodes[idx].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(ttlStore!, classId);
      }
    });
    dataPropRedoActions.push(() => {
      removeDataPropertyRestrictionFromClass(ttlStore!, classId, propertyName);
      const idx = rawData.nodes.findIndex((n) => n.id === classId);
      if (idx >= 0) {
        rawData.nodes[idx].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(ttlStore!, classId);
      }
    });
  }

  for (const nodeId of nodesToRemove) {
    const node = rawData.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    removeNodeFromStore(ttlStore, nodeId);
    const idx = rawData.nodes.findIndex((n) => n.id === nodeId);
    if (idx >= 0) rawData.nodes.splice(idx, 1);
    nodeUndoActions.push(() => {
      addNodeToStore(ttlStore!, node.label, nodeId);
      rawData.nodes.push(node);
    });
    nodeRedoActions.push(() => {
      removeNodeFromStore(ttlStore!, nodeId);
      const i = rawData.nodes.findIndex((n) => n.id === nodeId);
      if (i >= 0) rawData.nodes.splice(i, 1);
    });
  }

  const hasActions = nodeUndoActions.length + edgeUndoActions.length + dataPropUndoActions.length > 0;
  if (!hasActions) return false;

  // Clear search so children of deleted nodes remain visible (they were shown as neighbors)
  const searchEl = document.getElementById('searchQuery') as HTMLInputElement | null;
  if (searchEl?.value.trim()) {
    searchEl.value = '';
    document.getElementById('searchAutocomplete')?.classList.remove('visible');
  }

  pushUndoable(
    () => {
      nodeUndoActions.forEach((a) => a());
      edgeUndoActions.forEach((a) => a());
      dataPropUndoActions.forEach((a) => a());
    },
    () => {
      edgeRedoActions.forEach((a) => a());
      nodeRedoActions.forEach((a) => a());
      dataPropRedoActions.forEach((a) => a());
    }
  );
  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  applyFilter(true);
  network.unselectAll();
  return true;
}
const SPACING = getSpacing();

function getAllRelationshipTypes(): string[] {
  const fromProps = objectProperties.map((op) => op.name);
  return [...new Set(['subClassOf', ...fromProps])].sort();
}

const SUBCLASSOF_COMMENT = 'Classification or sub-typing relationship';

function getRelationshipLabel(type: string): string {
  if (type === 'subClassOf') return 'subClassOf';
  const op = objectProperties.find((p) => p.name === type);
  return op?.label ?? type;
}

/** Format edge label for graph display, using relationship label and optional cardinality. */
function getEdgeDisplayLabel(edge: import('./types').GraphEdge): string {
  const baseLabel = getRelationshipLabel(edge.type);
  const min = edge.minCardinality;
  const max = edge.maxCardinality;
  if (min == null && max == null) return baseLabel;
  const minStr = min != null ? String(min) : '0';
  const maxStr = max != null ? String(max) : '*';
  return `${baseLabel} [${minStr}..${maxStr}]`;
}

function getRelationshipComment(type: string): string | null {
  if (type === 'subClassOf') return SUBCLASSOF_COMMENT;
  const op = objectProperties.find((p) => p.name === type);
  return op?.comment ?? null;
}

let editRelationshipTypeHandlersInitialized = false;

function initEditRelationshipTypeHandlers(edgeStylesContent: HTMLElement, onApply: () => void): void {
  if (editRelationshipTypeHandlersInitialized) return;
  editRelationshipTypeHandlersInitialized = true;
  document.getElementById('editRelTypeCancel')?.addEventListener('click', () => {
    document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
  });
  document.getElementById('editRelTypeConfirm')?.addEventListener('click', () => {
    const type = (document.getElementById('editRelationshipTypeModal') as HTMLElement).dataset.type!;
    const labelInput = document.getElementById('editRelTypeLabel') as HTMLInputElement;
    const commentInput = document.getElementById('editRelTypeComment') as HTMLTextAreaElement;
    const newLabel = labelInput?.value?.trim() ?? '';
    const newComment = commentInput?.value?.trim() ?? '';
    if (!newLabel || !ttlStore) return;
    const op = objectProperties.find((p) => p.name === type);
    if (!op) return;
    const oldLabel = op.label;
    const oldComment = op.comment ?? '';
    const labelChanged = oldLabel !== newLabel;
    const commentChanged = oldComment !== newComment;
    if (!labelChanged && !commentChanged) {
      document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
      return;
    }
    if (labelChanged) {
      updateObjectPropertyLabelInStore(ttlStore, type, newLabel);
      op.label = newLabel;
    }
    if (commentChanged) {
      updateObjectPropertyCommentInStore(ttlStore, type, newComment || null);
      op.comment = newComment || undefined;
    }
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    initEdgeStylesMenu(edgeStylesContent, onApply);
    updateEdgeColorsLegend();
    applyFilter(true);
    document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
  });
  document.getElementById('editRelationshipTypeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#editRelationshipTypeModal') && e.key === 'Escape') {
      document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
      e.preventDefault();
    }
  });
}

function showEditRelationshipTypeModal(type: string, edgeStylesContent: HTMLElement, onApply: () => void): void {
  initEditRelationshipTypeHandlers(edgeStylesContent, onApply);
  const modal = document.getElementById('editRelationshipTypeModal')!;
  modal.dataset.type = type;
  const nameEl = document.getElementById('editRelTypeName') as HTMLElement;
  const labelInput = document.getElementById('editRelTypeLabel') as HTMLInputElement;
  const commentInput = document.getElementById('editRelTypeComment') as HTMLTextAreaElement;
  if (nameEl) nameEl.textContent = `Identifier: ${type} (used in ontology, cannot be changed here)`;
  const op = objectProperties.find((p) => p.name === type);
  if (labelInput) labelInput.value = op?.label ?? type;
  if (commentInput) commentInput.value = op?.comment ?? '';
  modal.style.display = 'flex';
  labelInput?.focus();
}

function initEdgeStylesMenu(
  edgeStylesContent: HTMLElement,
  onApply: () => void
): void {
  edgeStylesContent.innerHTML = '';
  const types = getAllRelationshipTypes();
  types.forEach((type) => {
    const color = getDefaultEdgeColors()[type] || getDefaultColor();
    const isEditable = type !== 'subClassOf';
    const editBtn = isEditable
      ? `<button type="button" class="edge-edit-btn" data-type="${type}" title="Edit object property (name, comment)" style="background: none; border: none; cursor: pointer; padding: 2px; color: #3498db; font-size: 14px; transform: scaleX(-1);">✎</button>`
      : '';
    const deleteBtn = isEditable
      ? `<button type="button" class="edge-delete-btn" data-type="${type}" title="Delete this object property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>`
      : '';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
    row.innerHTML = `
      <span style="font-weight: bold; font-family: Consolas, monospace; font-size: 12px; min-width: 100px;">${getRelationshipLabel(type)}</span>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-show-cb" data-type="${type}" checked>
        <span>Show</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-label-cb" data-type="${type}" checked>
        <span>Label</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 11px;">Color:</span>
        <input type="color" class="edge-color-picker" data-type="${type}" value="${color}" style="width: 28px; height: 22px; padding: 0; border: 1px solid #ccc; cursor: pointer;">
      </label>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <span>B. Line:</span>
        ${renderEdgeLineTypeDropdown(type, 'solid')}
      </label>
      ${editBtn}
      ${deleteBtn}
    `;
    edgeStylesContent.appendChild(row);
  });
  edgeStylesContent
    .querySelectorAll('.edge-show-cb, .edge-label-cb, .edge-color-picker')
    .forEach((el) => el.addEventListener('change', () => { onApply(); updateEdgeColorsLegend(); }));

  edgeStylesContent.querySelectorAll('.ap-linetype-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.closest('.ap-linetype-dropdown');
      const panel = dropdown?.querySelector('.ap-linetype-panel') as HTMLElement;
      const isOpen = panel?.style.display === 'block';
      edgeStylesContent.querySelectorAll('.ap-linetype-panel').forEach((p) => ((p as HTMLElement).style.display = 'none'));
      if (panel && !isOpen) panel.style.display = 'block';
    });
  });
  edgeStylesContent.querySelectorAll('.ap-linetype-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = (opt as HTMLElement).dataset.value as BorderLineType;
      const dropdown = opt.closest('.ap-linetype-dropdown');
      const hiddenInput = dropdown?.querySelector('.edge-linetype') as HTMLInputElement;
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      if (hiddenInput && trigger && value) {
        hiddenInput.value = value;
        const selectedOpt = BORDER_LINE_OPTIONS.find((o) => o.value === value);
        if (selectedOpt) {
          trigger.innerHTML = `${renderLineTypeSvg(selectedOpt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
        }
        (dropdown?.querySelector('.ap-linetype-panel') as HTMLElement).style.display = 'none';
        onApply();
        updateEdgeColorsLegend();
      }
    });
  });
  edgeStylesContent.querySelectorAll('.edge-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.type!;
      showEditRelationshipTypeModal(type, edgeStylesContent, onApply);
    });
  });
  if (!edgeLineTypeDocListenerAdded) {
    edgeLineTypeDocListenerAdded = true;
    document.addEventListener('click', () => {
      const edgeStylesContentEl = document.getElementById('edgeStylesContent');
      edgeStylesContentEl?.querySelectorAll('.ap-linetype-panel').forEach((p) => ((p as HTMLElement).style.display = 'none'));
    });
  }

  edgeStylesContent.querySelectorAll('.edge-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.type!;
      const count = rawData.edges.filter((e) => e.type === type).length;
      const msg =
        count === 0
          ? `Delete object property "${type}"?`
          : `You're going to delete ${count} edge${count === 1 ? '' : 's'} by deleting this object property. Are you sure?`;
      if (!confirm(msg)) return;
      if (!ttlStore) return;
      const removed = removeObjectPropertyFromStore(ttlStore, type);
      if (removed >= 0) {
        rawData.edges = rawData.edges.filter((e) => e.type !== type);
        objectProperties = objectProperties.filter((op) => op.name !== type);
        hasUnsavedChanges = true;
        updateSaveButtonVisibility();
        initEdgeStylesMenu(edgeStylesContent, onApply);
        applyFilter(true);
      }
    });
  });
  updateEdgeColorsLegend();
}

let edgeLineTypeDocListenerAdded = false;

let addRelationshipTypeHandlersInitialized = false;

function initAddRelationshipTypeHandlers(edgeStylesContent: HTMLElement): void {
  if (addRelationshipTypeHandlersInitialized) return;
  addRelationshipTypeHandlersInitialized = true;
  const labelInput = document.getElementById('addRelTypeLabel') as HTMLInputElement;
  if (labelInput) {
    labelInput.addEventListener('input', () => {
      const okBtn = document.getElementById('addRelTypeConfirm') as HTMLButtonElement;
      okBtn.disabled = !labelInput.value.trim();
    });
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('addRelTypeConfirm')?.click();
    });
  }
  document.getElementById('addRelationshipTypeBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('addRelationshipTypeModal')!;
    const li = document.getElementById('addRelTypeLabel') as HTMLInputElement;
    const hasCardCb = document.getElementById('addRelTypeHasCardinality') as HTMLInputElement;
    const okBtn = document.getElementById('addRelTypeConfirm') as HTMLButtonElement;
    li.value = '';
    hasCardCb.checked = true;
    okBtn.disabled = true;
    li.focus();
    modal.style.display = 'flex';
  });
  document.getElementById('addRelTypeCancel')?.addEventListener('click', () => {
    document.getElementById('addRelationshipTypeModal')!.style.display = 'none';
  });
  document.getElementById('addRelTypeConfirm')?.addEventListener('click', () => {
    const li = document.getElementById('addRelTypeLabel') as HTMLInputElement;
    const hasCardCb = document.getElementById('addRelTypeHasCardinality') as HTMLInputElement;
    const label = li.value.trim();
    if (!label || !ttlStore) return;
    const name = addObjectPropertyToStore(ttlStore, label, hasCardCb.checked);
    if (name) {
      objectProperties.push({ name, label, hasCardinality: hasCardCb.checked });
      objectProperties.sort((a, b) => a.name.localeCompare(b.name));
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      initEdgeStylesMenu(edgeStylesContent, applyFilter);
      applyFilter(true);
    }
    document.getElementById('addRelationshipTypeModal')!.style.display = 'none';
  });
}

const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';
const DATA_PROPERTY_RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: XSD_NS + 'string', label: 'xsd:string' },
  { value: XSD_NS + 'integer', label: 'xsd:integer' },
  { value: XSD_NS + 'decimal', label: 'xsd:decimal' },
  { value: XSD_NS + 'boolean', label: 'xsd:boolean' },
  { value: XSD_NS + 'date', label: 'xsd:date' },
  { value: XSD_NS + 'dateTime', label: 'xsd:dateTime' },
  { value: XSD_NS + 'anyURI', label: 'xsd:anyURI' },
];

function initDataPropsMenu(dataPropsContent: HTMLElement): void {
  dataPropsContent.innerHTML = '';
  dataProperties.forEach((dp) => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
    row.innerHTML = `
      <span style="font-weight: bold; font-family: Consolas, monospace; font-size: 12px; min-width: 100px;">${dp.label}</span>
      <span style="font-size: 11px; color: #666;">${dp.range.includes('string') ? 'string' : dp.range.includes('integer') ? 'integer' : dp.range.split('#').pop() ?? dp.range}</span>
      <button type="button" class="data-prop-edit-btn" data-name="${dp.name}" title="Edit data property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #3498db; font-size: 14px; transform: scaleX(-1);">✎</button>
      <button type="button" class="data-prop-delete-btn" data-name="${dp.name}" title="Delete this data property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>
    `;
    dataPropsContent.appendChild(row);
  });
  dataPropsContent.querySelectorAll('.data-prop-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.name!;
      showEditDataPropertyModal(name);
    });
  });
  dataPropsContent.querySelectorAll('.data-prop-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.name!;
      if (!confirm(`Delete data property "${name}"?`)) return;
      if (!ttlStore) return;
      if (removeDataPropertyFromStore(ttlStore, name)) {
        dataProperties = dataProperties.filter((dp) => dp.name !== name);
        hasUnsavedChanges = true;
        updateSaveButtonVisibility();
        initDataPropsMenu(dataPropsContent);
      }
    });
  });
}

let editDataPropertyHandlersInitialized = false;

function initEditDataPropertyHandlers(): void {
  if (editDataPropertyHandlersInitialized) return;
  editDataPropertyHandlersInitialized = true;
  document.getElementById('editDataPropCancel')?.addEventListener('click', () => {
    document.getElementById('editDataPropertyModal')!.style.display = 'none';
  });
  document.getElementById('editDataPropConfirm')?.addEventListener('click', () => {
    const modal = document.getElementById('editDataPropertyModal')!;
    const name = (modal as HTMLElement).dataset.dataPropName!;
    const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
    const commentInput = document.getElementById('editDataPropComment') as HTMLTextAreaElement;
    const rangeSel = document.getElementById('editDataPropRange') as HTMLSelectElement;
    const newLabel = labelInput?.value?.trim() ?? '';
    const newComment = commentInput?.value?.trim() ?? '';
    const newRange = rangeSel?.value ?? XSD_NS + 'string';
    if (!newLabel || !ttlStore) return;
    const dp = dataProperties.find((p) => p.name === name);
    if (!dp) return;
    const labelChanged = dp.label !== newLabel;
    const commentChanged = (dp.comment ?? '') !== newComment;
    const rangeChanged = dp.range !== newRange;
    if (!labelChanged && !commentChanged && !rangeChanged) {
      document.getElementById('editDataPropertyModal')!.style.display = 'none';
      return;
    }
    if (labelChanged) {
      updateDataPropertyLabelInStore(ttlStore, name, newLabel);
      dp.label = newLabel;
    }
    if (commentChanged) {
      updateDataPropertyCommentInStore(ttlStore, name, newComment || null);
      dp.comment = newComment || undefined;
    }
    if (rangeChanged) {
      updateDataPropertyRangeInStore(ttlStore, name, newRange);
      dp.range = newRange;
    }
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    const dataPropsContent = document.getElementById('dataPropsContent');
    if (dataPropsContent) initDataPropsMenu(dataPropsContent);
    document.getElementById('editDataPropertyModal')!.style.display = 'none';
  });
  document.getElementById('editDataPropertyModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#editDataPropertyModal') && (e.key === 'Escape')) {
      document.getElementById('editDataPropertyModal')!.style.display = 'none';
      e.preventDefault();
    }
  });
}

function showEditDataPropertyModal(name: string): void {
  initEditDataPropertyHandlers();
  const modal = document.getElementById('editDataPropertyModal')!;
  (modal as HTMLElement).dataset.dataPropName = name;
  const nameEl = document.getElementById('editDataPropName') as HTMLElement;
  const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
  const commentInput = document.getElementById('editDataPropComment') as HTMLTextAreaElement;
  const rangeSel = document.getElementById('editDataPropRange') as HTMLSelectElement;
  const dp = dataProperties.find((p) => p.name === name);
  if (nameEl) nameEl.textContent = `Identifier: ${name} (used in ontology)`;
  if (labelInput) labelInput.value = dp?.label ?? name;
  if (commentInput) commentInput.value = dp?.comment ?? '';
  const rangeOptions = [...DATA_PROPERTY_RANGE_OPTIONS];
  if (dp?.range && !rangeOptions.some((o) => o.value === dp.range)) {
    rangeOptions.push({ value: dp.range, label: dp.range.includes('#') ? dp.range.split('#').pop()! : dp.range });
  }
  rangeSel.innerHTML = rangeOptions.map((opt) => `<option value="${opt.value}"${dp?.range === opt.value ? ' selected' : ''}>${opt.label}</option>`).join('');
  modal.style.display = 'flex';
  labelInput?.focus();
}

let editAnnotationPropertyHandlersInitialized = false;

function initEditAnnotationPropertyHandlers(): void {
  if (editAnnotationPropertyHandlersInitialized) return;
  editAnnotationPropertyHandlersInitialized = true;
  document.getElementById('editAnnotationPropCancel')?.addEventListener('click', () => {
    document.getElementById('editAnnotationPropertyModal')!.style.display = 'none';
  });
  document.getElementById('editAnnotationPropConfirm')?.addEventListener('click', () => {
    const modal = document.getElementById('editAnnotationPropertyModal')!;
    const name = (modal as HTMLElement).dataset.annotationPropName!;
    const labelInput = document.getElementById('editAnnotationPropLabel') as HTMLInputElement;
    const commentInput = document.getElementById('editAnnotationPropComment') as HTMLTextAreaElement;
    const isBooleanCb = document.getElementById('editAnnotationPropIsBoolean') as HTMLInputElement;
    const newLabel = labelInput?.value?.trim() ?? '';
    const newComment = commentInput?.value?.trim() ?? '';
    const newIsBoolean = isBooleanCb?.checked ?? false;
    if (!newLabel || !ttlStore) return;
    const ap = annotationProperties.find((p) => p.name === name);
    if (!ap) return;
    const labelChanged = (ap.name !== newLabel && ap.name !== extractLocalName(newLabel));
    const commentChanged = false; // We don't track comments in annotationProperties array
    const isBooleanChanged = ap.isBoolean !== newIsBoolean;
    if (!labelChanged && !commentChanged && !isBooleanChanged) {
      document.getElementById('editAnnotationPropertyModal')!.style.display = 'none';
      return;
    }
    if (labelChanged) {
      updateAnnotationPropertyLabelInStore(ttlStore, name, newLabel);
      // Update the name if it changed (based on label)
      const newName = extractLocalName(newLabel) || name;
      if (newName !== name) {
        // Name changed, need to update the array
        annotationProperties = annotationProperties.filter((p) => p.name !== name);
        annotationProperties.push({ name: newName, isBoolean: ap.isBoolean });
        annotationProperties.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // Just update the label in the existing entry
        const idx = annotationProperties.findIndex((p) => p.name === name);
        if (idx >= 0) {
          // Label is stored as name, so we don't need to update it
        }
      }
    }
    if (commentChanged || commentInput?.value.trim()) {
      updateAnnotationPropertyCommentInStore(ttlStore, name, newComment || null);
    }
    if (isBooleanChanged) {
      updateAnnotationPropertyIsBooleanInStore(ttlStore, name, newIsBoolean);
      const idx = annotationProperties.findIndex((p) => p.name === name);
      if (idx >= 0) {
        annotationProperties[idx].isBoolean = newIsBoolean;
      }
    }
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    const annotationPropsContent = document.getElementById('annotationPropsContent');
    if (annotationPropsContent) initAnnotationPropsMenu(annotationPropsContent, applyFilter);
    document.getElementById('editAnnotationPropertyModal')!.style.display = 'none';
  });
  document.getElementById('editAnnotationPropertyModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#editAnnotationPropertyModal') && (e.key === 'Escape')) {
      document.getElementById('editAnnotationPropertyModal')!.style.display = 'none';
      e.preventDefault();
    }
  });
}

function showEditAnnotationPropertyModal(name: string): void {
  initEditAnnotationPropertyHandlers();
  const modal = document.getElementById('editAnnotationPropertyModal')!;
  (modal as HTMLElement).dataset.annotationPropName = name;
  const nameEl = document.getElementById('editAnnotationPropName') as HTMLElement;
  const labelInput = document.getElementById('editAnnotationPropLabel') as HTMLInputElement;
  const commentInput = document.getElementById('editAnnotationPropComment') as HTMLTextAreaElement;
  const isBooleanCb = document.getElementById('editAnnotationPropIsBoolean') as HTMLInputElement;
  const ap = annotationProperties.find((p) => p.name === name);
  if (nameEl) nameEl.textContent = `Identifier: ${name} (used in ontology)`;
  // Get label from store - annotation properties may have rdfs:label
  if (labelInput) {
    if (ttlStore) {
      const propUri = 'http://example.org/aec-drawing-ontology#' + name;
      const labelQuads = ttlStore.getQuads(propUri, 'http://www.w3.org/2000/01/rdf-schema#label', null, null);
      if (labelQuads.length > 0) {
        const labelObj = labelQuads[0].object as { value?: string };
        labelInput.value = labelObj?.value ?? name;
      } else {
        labelInput.value = name;
      }
    } else {
      labelInput.value = name;
    }
  }
  if (commentInput) {
    // Try to get comment from store
    if (ttlStore) {
      const propUri = 'http://example.org/aec-drawing-ontology#' + name;
      const commentQuads = ttlStore.getQuads(propUri, 'http://www.w3.org/2000/01/rdf-schema#comment', null, null);
      if (commentQuads.length > 0) {
        const commentObj = commentQuads[0].object as { value?: string };
        commentInput.value = commentObj?.value ?? '';
      } else {
        commentInput.value = '';
      }
    } else {
      commentInput.value = '';
    }
  }
  if (isBooleanCb) isBooleanCb.checked = ap?.isBoolean ?? false;
  modal.style.display = 'flex';
  labelInput?.focus();
}

let addAnnotationPropertyHandlersInitialized = false;

function initAddAnnotationPropertyHandlers(_annotationPropsContent?: HTMLElement): void {
  if (addAnnotationPropertyHandlersInitialized) return;
  addAnnotationPropertyHandlersInitialized = true;
  const labelInput = document.getElementById('addAnnotationPropLabel') as HTMLInputElement;
  const isBooleanCb = document.getElementById('addAnnotationPropIsBoolean') as HTMLInputElement;
  if (labelInput) {
    labelInput.addEventListener('input', () => {
      const okBtn = document.getElementById('addAnnotationPropConfirm') as HTMLButtonElement;
      okBtn.disabled = !labelInput.value.trim();
    });
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('addAnnotationPropConfirm')?.click();
    });
  }
  document.getElementById('addAnnotationPropertyBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('addAnnotationPropertyModal')!;
    const li = document.getElementById('addAnnotationPropLabel') as HTMLInputElement;
    const okBtn = document.getElementById('addAnnotationPropConfirm') as HTMLButtonElement;
    li.value = '';
    if (isBooleanCb) isBooleanCb.checked = false;
    okBtn.disabled = true;
    li.focus();
    modal.style.display = 'flex';
  });
  document.getElementById('addAnnotationPropCancel')?.addEventListener('click', () => {
    document.getElementById('addAnnotationPropertyModal')!.style.display = 'none';
  });
  document.getElementById('addAnnotationPropConfirm')?.addEventListener('click', () => {
    const li = document.getElementById('addAnnotationPropLabel') as HTMLInputElement;
    const isBool = isBooleanCb?.checked ?? false;
    const label = li.value.trim();
    if (!label || !ttlStore) return;
    const name = addAnnotationPropertyToStore(ttlStore, label, isBool);
    if (name) {
      annotationProperties.push({ name, isBoolean: isBool });
      annotationProperties.sort((a, b) => a.name.localeCompare(b.name));
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      const content = document.getElementById('annotationPropsContent');
      if (content) initAnnotationPropsMenu(content, applyFilter);
    }
    document.getElementById('addAnnotationPropertyModal')!.style.display = 'none';
  });
}

let addDataPropertyHandlersInitialized = false;

function initAddDataPropertyHandlers(_dataPropsContent?: HTMLElement): void {
  if (addDataPropertyHandlersInitialized) return;
  addDataPropertyHandlersInitialized = true;
  const labelInput = document.getElementById('addDataPropLabel') as HTMLInputElement;
  const rangeSel = document.getElementById('addDataPropRange') as HTMLSelectElement;
  if (rangeSel) {
    rangeSel.innerHTML = DATA_PROPERTY_RANGE_OPTIONS.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
  }
  if (labelInput) {
    labelInput.addEventListener('input', () => {
      const okBtn = document.getElementById('addDataPropConfirm') as HTMLButtonElement;
      okBtn.disabled = !labelInput.value.trim();
    });
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('addDataPropConfirm')?.click();
    });
  }
  document.getElementById('addDataPropertyBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('addDataPropertyModal')!;
    const li = document.getElementById('addDataPropLabel') as HTMLInputElement;
    const okBtn = document.getElementById('addDataPropConfirm') as HTMLButtonElement;
    li.value = '';
    okBtn.disabled = true;
    li.focus();
    modal.style.display = 'flex';
  });
  document.getElementById('addDataPropCancel')?.addEventListener('click', () => {
    document.getElementById('addDataPropertyModal')!.style.display = 'none';
  });
  document.getElementById('addDataPropConfirm')?.addEventListener('click', () => {
    const li = document.getElementById('addDataPropLabel') as HTMLInputElement;
    const rangeEl = document.getElementById('addDataPropRange') as HTMLSelectElement;
    const label = li.value.trim();
    const rangeUri = rangeEl?.value ?? XSD_NS + 'string';
    if (!label || !ttlStore) return;
    const name = addDataPropertyToStore(ttlStore, label, rangeUri);
    if (name) {
      dataProperties.push({ name, label, range: rangeUri });
      dataProperties.sort((a, b) => a.name.localeCompare(b.name));
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      const content = document.getElementById('dataPropsContent');
      if (content) initDataPropsMenu(content);
    }
    document.getElementById('addDataPropertyModal')!.style.display = 'none';
  });
}

function getEdgeStyleConfig(
  edgeStylesContent: HTMLElement
): Record<string, { show: boolean; showLabel: boolean; color: string; lineType: BorderLineType }> {
  const config: Record<string, { show: boolean; showLabel: boolean; color: string; lineType: BorderLineType }> = {};
  getAllRelationshipTypes().forEach((type) => {
    const showCb = edgeStylesContent.querySelector(
      `.edge-show-cb[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const labelCb = edgeStylesContent.querySelector(
      `.edge-label-cb[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const colorEl = edgeStylesContent.querySelector(
      `.edge-color-picker[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const lineTypeEl = edgeStylesContent.querySelector(
      `.edge-linetype[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const lineType = (lineTypeEl?.value as BorderLineType) ?? 'solid';
    config[type] = {
      show: showCb?.checked ?? true,
      showLabel: labelCb?.checked ?? true,
      color: colorEl?.value ?? getDefaultEdgeColors()[type] ?? getDefaultColor(),
      lineType,
    };
  });
  return config;
}

function updateEdgeColorsLegend(): void {
  const legendEl = document.getElementById('edgeColorsLegend');
  if (!legendEl) return;
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  if (!edgeStylesContent) {
    legendEl.textContent = '';
    return;
  }
  const config = getEdgeStyleConfig(edgeStylesContent);
  const types = Object.keys(config).filter((t) => config[t].show);
  if (types.length === 0) {
    legendEl.textContent = '';
    return;
  }
  legendEl.innerHTML =
    'Edge colors: ' +
    types.map((t) => `<span style="color: ${config[t].color}">●</span> ${getRelationshipLabel(t)}`).join(' ');
}

type BorderLineType = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot';

const BORDER_LINE_OPTIONS: { value: BorderLineType; visValue: false | true | number[]; svgDasharray: string }[] = [
  { value: 'solid', visValue: false, svgDasharray: '' },
  { value: 'dashed', visValue: [5, 5], svgDasharray: '5,3' },
  { value: 'dotted', visValue: [1, 3], svgDasharray: '1,3' },
  { value: 'dash-dot', visValue: [5, 2, 1, 2], svgDasharray: '5,2,1,2' },
  { value: 'dash-dot-dot', visValue: [5, 2, 1, 2, 1, 2], svgDasharray: '5,2,1,2,1,2' },
];

function borderLineTypeToVis(value: BorderLineType): false | true | number[] {
  return BORDER_LINE_OPTIONS.find((o) => o.value === value)?.visValue ?? false;
}

interface AnnotationStyleConfig {
  booleanProps: Record<
    string,
    {
      whenTrue: { fillColor: string; borderColor: string; borderLineType: BorderLineType; show: boolean };
      whenFalse: { fillColor: string; borderColor: string; borderLineType: BorderLineType; show: boolean };
      whenUndefined: { fillColor: string; borderColor: string; borderLineType: BorderLineType; show: boolean };
    }
  >;
  textProps: Record<string, { rules: { regex: string; fillColor: string; borderColor: string; borderLineType: BorderLineType }[] }>;
}

const DEFAULT_BOOL_COLORS = {
  whenTrue: { fill: '#2ecc71', border: '#000000', lineType: 'solid' as BorderLineType },
  whenFalse: { fill: '#b8b8b8', border: '#000000', lineType: 'dashed' as BorderLineType },
  whenUndefined: { fill: '#95a5a6', border: '#000000', lineType: 'dashed' as BorderLineType },
};
const DEFAULT_TEXT_COLOR = { fill: '#3498db', border: '#2980b9', lineType: 'solid' as BorderLineType };

function renderLineTypeSvg(dasharray: string): string {
  return `<svg width="32" height="10" style="display: block;"><line x1="2" y1="5" x2="30" y2="5" stroke="#333" stroke-width="1.5" ${dasharray ? `stroke-dasharray="${dasharray}"` : ''}></line></svg>`;
}

function renderLineTypeDropdown(
  dataProp: string,
  dataVal: string,
  selected: BorderLineType,
  inputClass: string
): string {
  const selectedOpt = BORDER_LINE_OPTIONS.find((o) => o.value === selected) ?? BORDER_LINE_OPTIONS[0];
  const dataValAttr = dataVal ? ` data-val="${dataVal}"` : '';
  const optionsHtml = BORDER_LINE_OPTIONS.map(
    (opt) => `
    <div class="ap-linetype-option" data-value="${opt.value}" style="display: flex; align-items: center; padding: 4px 8px; cursor: pointer; font-size: 11px; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='#fff'">
      ${renderLineTypeSvg(opt.svgDasharray)}
    </div>`
  ).join('');
  return `
    <div class="ap-linetype-dropdown" style="position: relative; display: inline-block;">
      <input type="hidden" class="${inputClass}" data-prop="${dataProp}"${dataValAttr} value="${selected}">
      <button type="button" class="ap-linetype-trigger" style="display: flex; align-items: center; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; background: #fff; cursor: pointer; font-size: 11px;">
        ${renderLineTypeSvg(selectedOpt.svgDasharray)}
        <span style="margin-left: 4px;">▾</span>
      </button>
      <div class="ap-linetype-panel" style="display: none; position: absolute; top: 100%; left: 0; margin-top: 2px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1001; min-width: 60px;">
        ${optionsHtml}
      </div>
    </div>`;
}

/** Line type dropdown for edges (uses data-type instead of data-prop/data-val). */
function renderEdgeLineTypeDropdown(type: string, selected: BorderLineType): string {
  const selectedOpt = BORDER_LINE_OPTIONS.find((o) => o.value === selected) ?? BORDER_LINE_OPTIONS[0];
  const optionsHtml = BORDER_LINE_OPTIONS.map(
    (opt) => `
    <div class="ap-linetype-option" data-value="${opt.value}" style="display: flex; align-items: center; padding: 4px 8px; cursor: pointer; font-size: 11px; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='#fff'">
      ${renderLineTypeSvg(opt.svgDasharray)}
    </div>`
  ).join('');
  return `
    <div class="ap-linetype-dropdown" style="position: relative; display: inline-block;">
      <input type="hidden" class="edge-linetype" data-type="${type}" value="${selected}">
      <button type="button" class="ap-linetype-trigger" style="display: flex; align-items: center; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; background: #fff; cursor: pointer; font-size: 11px;">
        ${renderLineTypeSvg(selectedOpt.svgDasharray)}
        <span style="margin-left: 4px;">▾</span>
      </button>
      <div class="ap-linetype-panel" style="display: none; position: absolute; top: 100%; left: 0; margin-top: 2px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1001; min-width: 60px;">
        ${optionsHtml}
      </div>
    </div>`;
}

let annotationPropsMenuClickAbort: AbortController | null = null;

function initAnnotationPropsMenu(
  container: HTMLElement,
  onApply: () => void
): void {
  annotationPropsMenuClickAbort?.abort();
  annotationPropsMenuClickAbort = new AbortController();
  const signal = annotationPropsMenuClickAbort.signal;

  container.innerHTML = '';
  const boolProps = annotationProperties.filter((ap) => ap.isBoolean);
  const textProps = annotationProperties.filter((ap) => !ap.isBoolean);

  if (boolProps.length > 0) {
    const boolSection = document.createElement('div');
    boolSection.style.marginBottom = '12px';
    boolSection.innerHTML = '<strong style="font-size: 11px;">Boolean properties</strong>';
    boolProps.forEach((ap) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin: 8px 0; padding: 8px; background: #f9f9f9; border-radius: 4px;';
      const renderBoolBlock = (val: 'true' | 'false' | 'undefined', defaults: { fill: string; border: string; lineType: BorderLineType }) => {
        const dataVal = val === 'undefined' ? 'undefined' : val;
        return `
          <div>
            <span>When ${val}:</span>
            <label><input type="checkbox" class="ap-bool-show" data-prop="${ap.name}" data-val="${dataVal}" checked> Show</label>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
              <div><span style="font-size: 10px;">Fill:</span> <input type="color" class="ap-bool-fill" data-prop="${ap.name}" data-val="${dataVal}" value="${defaults.fill}" style="width: 24px; height: 18px; vertical-align: middle;"></div>
              <div><span style="font-size: 10px;">Border:</span> <input type="color" class="ap-bool-border" data-prop="${ap.name}" data-val="${dataVal}" value="${defaults.border}" style="width: 24px; height: 18px; vertical-align: middle;"></div>
              <div><span style="font-size: 10px;">B. Line:</span> ${renderLineTypeDropdown(ap.name, dataVal, defaults.lineType, 'ap-bool-linetype')}</div>
            </div>
          </div>`;
      };
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <div style="font-weight: bold; font-family: Consolas, monospace; font-size: 11px; flex: 1;">${ap.name}</div>
          <button type="button" class="annotation-prop-edit-btn" data-name="${ap.name}" title="Edit annotation property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #3498db; font-size: 14px; transform: scaleX(-1);">✎</button>
          <button type="button" class="annotation-prop-delete-btn" data-name="${ap.name}" title="Delete this annotation property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px;">
          ${renderBoolBlock('true', DEFAULT_BOOL_COLORS.whenTrue)}
          ${renderBoolBlock('false', DEFAULT_BOOL_COLORS.whenFalse)}
          ${renderBoolBlock('undefined', DEFAULT_BOOL_COLORS.whenUndefined)}
        </div>
      `;
      boolSection.appendChild(row);
    });
    container.appendChild(boolSection);
  }

  if (textProps.length > 0) {
    const textSection = document.createElement('div');
    textSection.innerHTML = '<strong style="font-size: 11px;">Text properties (regex)</strong>';
    textProps.forEach((ap) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin: 8px 0; padding: 8px; background: #f9f9f9; border-radius: 4px;';
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <div style="font-weight: bold; font-family: Consolas, monospace; font-size: 11px; flex: 1;">${ap.name}</div>
          <button type="button" class="annotation-prop-edit-btn" data-name="${ap.name}" title="Edit annotation property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #3498db; font-size: 14px; transform: scaleX(-1);">✎</button>
          <button type="button" class="annotation-prop-delete-btn" data-name="${ap.name}" title="Delete this annotation property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>
        </div>
        <div class="ap-text-rules" data-prop="${ap.name}"></div>
        <button type="button" class="ap-add-rule" data-prop="${ap.name}" style="font-size: 11px; margin-top: 4px;">+ Add regex rule</button>
      `;
      const rulesDiv = row.querySelector('.ap-text-rules')!;
      const addRule = (regex = '', fillColor = DEFAULT_TEXT_COLOR.fill, borderColor = DEFAULT_TEXT_COLOR.border, borderLineType = DEFAULT_TEXT_COLOR.lineType) => {
        const ruleEl = document.createElement('div');
        ruleEl.style.cssText = 'display: flex; align-items: center; gap: 6px; margin: 4px 0; flex-wrap: wrap;';
        ruleEl.innerHTML = `
          <input type="text" class="ap-regex" placeholder="regex" value="${regex}" style="flex: 1; min-width: 80px; font-size: 11px; padding: 4px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div><span style="font-size: 10px;">Fill:</span> <input type="color" class="ap-regex-fill" value="${fillColor}" style="width: 24px; height: 18px;"></div>
            <div><span style="font-size: 10px;">Border:</span> <input type="color" class="ap-regex-border" value="${borderColor}" style="width: 24px; height: 18px;"></div>
            <div><span style="font-size: 10px;">B. Line:</span> ${renderLineTypeDropdown(ap.name, '', borderLineType, 'ap-regex-linetype')}</div>
          </div>
          <button type="button" class="ap-remove-rule" style="font-size: 11px;">×</button>
        `;
        ruleEl.querySelector('.ap-remove-rule')!.addEventListener('click', () => {
          ruleEl.remove();
          onApply();
        });
        [...ruleEl.querySelectorAll('.ap-regex, .ap-regex-fill, .ap-regex-border')].forEach((el) =>
          el.addEventListener('change', onApply)
        );
        ruleEl.querySelector('.ap-regex')!.addEventListener('input', onApply);
        rulesDiv.appendChild(ruleEl);
      };
      addRule();
      row.querySelector('.ap-add-rule')!.addEventListener('click', () => {
        addRule();
        onApply();
      });
      textSection.appendChild(row);
    });
    container.appendChild(textSection);
  }

  // Add event listeners for edit and delete buttons
  container.querySelectorAll('.annotation-prop-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.name!;
      showEditAnnotationPropertyModal(name);
    }, { signal });
  });
  container.querySelectorAll('.annotation-prop-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.name!;
      if (!confirm(`Delete annotation property "${name}"?`)) return;
      if (!ttlStore) return;
      
      // Save all quads for this property for undo
      const propUri = 'http://example.org/aec-drawing-ontology#' + name;
      const allQuads = Array.from(ttlStore.getQuads(propUri as any, null, null, null));
      const ap = annotationProperties.find((p) => p.name === name);
      
      if (removeAnnotationPropertyFromStore(ttlStore, name)) {
        annotationProperties = annotationProperties.filter((ap) => ap.name !== name);
        
        // Add undo action
        pushUndoable(
          () => {
            // Undo: restore the property
            if (ttlStore) {
              for (const q of allQuads) {
                ttlStore.addQuad(q.subject, q.predicate, q.object, q.graph);
              }
            }
            if (ap) {
              annotationProperties.push(ap);
              annotationProperties.sort((a, b) => a.name.localeCompare(b.name));
            }
            initAnnotationPropsMenu(container, onApply);
            hasUnsavedChanges = true;
            updateSaveButtonVisibility();
          },
          () => {
            // Redo: delete again
            if (ttlStore) {
              removeAnnotationPropertyFromStore(ttlStore, name);
            }
            annotationProperties = annotationProperties.filter((ap) => ap.name !== name);
            initAnnotationPropsMenu(container, onApply);
            hasUnsavedChanges = true;
            updateSaveButtonVisibility();
          }
        );
        
        hasUnsavedChanges = true;
        updateSaveButtonVisibility();
        initAnnotationPropsMenu(container, onApply);
      }
    }, { signal });
  });

  if (boolProps.length === 0 && textProps.length === 0) {
    container.innerHTML = '<span style="font-size: 11px; color: #888;">No annotation properties in ontology</span>';
  }

  container.querySelectorAll('.ap-bool-show, .ap-bool-fill, .ap-bool-border').forEach((el) =>
    el.addEventListener('change', onApply, { signal })
  );

  container.querySelectorAll('.ap-linetype-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.closest('.ap-linetype-dropdown');
      const panel = dropdown?.querySelector('.ap-linetype-panel') as HTMLElement;
      const isOpen = panel?.style.display === 'block';
      container.querySelectorAll('.ap-linetype-panel').forEach((p) => ((p as HTMLElement).style.display = 'none'));
      if (panel && !isOpen) panel.style.display = 'block';
    });
  });
  container.querySelectorAll('.ap-linetype-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = (opt as HTMLElement).dataset.value as BorderLineType;
      const dropdown = opt.closest('.ap-linetype-dropdown');
      const hiddenInput = dropdown?.querySelector('.ap-bool-linetype, .ap-regex-linetype') as HTMLInputElement;
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      if (hiddenInput && trigger && value) {
        hiddenInput.value = value;
        const selectedOpt = BORDER_LINE_OPTIONS.find((o) => o.value === value);
        if (selectedOpt) {
          trigger.innerHTML = `${renderLineTypeSvg(selectedOpt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
        }
        (dropdown?.querySelector('.ap-linetype-panel') as HTMLElement).style.display = 'none';
        onApply();
      }
    });
  });
  document.addEventListener(
    'click',
    () => {
      container.querySelectorAll('.ap-linetype-panel').forEach((p) => ((p as HTMLElement).style.display = 'none'));
    },
    { signal }
  );
}

function getAnnotationStyleConfig(container: HTMLElement | null): AnnotationStyleConfig {
  const config: AnnotationStyleConfig = { booleanProps: {}, textProps: {} };
  if (!container) return config;
  annotationProperties.forEach((ap) => {
    if (ap.isBoolean) {
      const showTrue = container.querySelector(
        `.ap-bool-show[data-prop="${ap.name}"][data-val="true"]`
      ) as HTMLInputElement | null;
      const showFalse = container.querySelector(
        `.ap-bool-show[data-prop="${ap.name}"][data-val="false"]`
      ) as HTMLInputElement | null;
      const fillTrue = container.querySelector(
        `.ap-bool-fill[data-prop="${ap.name}"][data-val="true"]`
      ) as HTMLInputElement | null;
      const borderTrue = container.querySelector(
        `.ap-bool-border[data-prop="${ap.name}"][data-val="true"]`
      ) as HTMLInputElement | null;
      const fillFalse = container.querySelector(
        `.ap-bool-fill[data-prop="${ap.name}"][data-val="false"]`
      ) as HTMLInputElement | null;
      const borderFalse = container.querySelector(
        `.ap-bool-border[data-prop="${ap.name}"][data-val="false"]`
      ) as HTMLInputElement | null;
      const linetypeTrue = container.querySelector(
        `.ap-bool-linetype[data-prop="${ap.name}"][data-val="true"]`
      ) as HTMLInputElement | null;
      const linetypeFalse = container.querySelector(
        `.ap-bool-linetype[data-prop="${ap.name}"][data-val="false"]`
      ) as HTMLInputElement | null;
      const showUndefined = container.querySelector(
        `.ap-bool-show[data-prop="${ap.name}"][data-val="undefined"]`
      ) as HTMLInputElement | null;
      const fillUndefined = container.querySelector(
        `.ap-bool-fill[data-prop="${ap.name}"][data-val="undefined"]`
      ) as HTMLInputElement | null;
      const borderUndefined = container.querySelector(
        `.ap-bool-border[data-prop="${ap.name}"][data-val="undefined"]`
      ) as HTMLInputElement | null;
      const linetypeUndefined = container.querySelector(
        `.ap-bool-linetype[data-prop="${ap.name}"][data-val="undefined"]`
      ) as HTMLInputElement | null;
      config.booleanProps[ap.name] = {
        whenTrue: {
          fillColor: fillTrue?.value ?? DEFAULT_BOOL_COLORS.whenTrue.fill,
          borderColor: borderTrue?.value ?? DEFAULT_BOOL_COLORS.whenTrue.border,
          borderLineType: (linetypeTrue?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenTrue.lineType,
          show: showTrue?.checked ?? true,
        },
        whenFalse: {
          fillColor: fillFalse?.value ?? DEFAULT_BOOL_COLORS.whenFalse.fill,
          borderColor: borderFalse?.value ?? DEFAULT_BOOL_COLORS.whenFalse.border,
          borderLineType: (linetypeFalse?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenFalse.lineType,
          show: showFalse?.checked ?? true,
        },
        whenUndefined: {
          fillColor: fillUndefined?.value ?? DEFAULT_BOOL_COLORS.whenUndefined.fill,
          borderColor: borderUndefined?.value ?? DEFAULT_BOOL_COLORS.whenUndefined.border,
          borderLineType: (linetypeUndefined?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenUndefined.lineType,
          show: showUndefined?.checked ?? true,
        },
      };
    } else {
      const rulesDiv = container.querySelector(`.ap-text-rules[data-prop="${ap.name}"]`);
      const rules: { regex: string; fillColor: string; borderColor: string; borderLineType: BorderLineType }[] = [];
      rulesDiv?.querySelectorAll(':scope > div').forEach((ruleEl) => {
        const regexInput = ruleEl.querySelector('.ap-regex') as HTMLInputElement | null;
        const fillInput = ruleEl.querySelector('.ap-regex-fill') as HTMLInputElement | null;
        const borderInput = ruleEl.querySelector('.ap-regex-border') as HTMLInputElement | null;
        const linetypeInput = ruleEl.querySelector('.ap-regex-linetype') as HTMLInputElement | null;
        if (regexInput && regexInput.value.trim()) {
          rules.push({
            regex: regexInput.value.trim(),
            fillColor: fillInput?.value ?? DEFAULT_TEXT_COLOR.fill,
            borderColor: borderInput?.value ?? DEFAULT_TEXT_COLOR.border,
            borderLineType: (linetypeInput?.value as BorderLineType) ?? DEFAULT_TEXT_COLOR.lineType,
          });
        }
      });
      config.textProps[ap.name] = { rules };
    }
  });
  return config;
}

function shouldShowNodeByAnnotations(
  node: GraphNode,
  config: AnnotationStyleConfig
): boolean {
  const ann = node.annotations ?? {};
  for (const [propName, boolConfig] of Object.entries(config.booleanProps)) {
    const val = ann[propName];
    if (val === true) {
      if (!boolConfig.whenTrue.show) return false;
    } else if (val === false) {
      if (!boolConfig.whenFalse.show) return false;
    } else if (val == null) {
      // when null/undefined: respect whenUndefined.show if configured
      if (boolConfig.whenUndefined && boolConfig.whenUndefined.show === false) return false;
    }
  }
  return true;
}

function getNodeStyleFromAnnotations(
  node: GraphNode,
  config: AnnotationStyleConfig
): { background: string; border: string; shapeProperties?: { borderDashes: false | true | number[] } } {
  const ann = node.annotations ?? {};
  for (const [propName, boolConfig] of Object.entries(config.booleanProps)) {
    const val = ann[propName];
    if (val === true) {
      const dashes = borderLineTypeToVis(boolConfig.whenTrue.borderLineType);
      return {
        background: boolConfig.whenTrue.fillColor,
        border: boolConfig.whenTrue.borderColor,
        shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
      };
    }
    if (val === false) {
      const dashes = borderLineTypeToVis(boolConfig.whenFalse.borderLineType);
      return {
        background: boolConfig.whenFalse.fillColor,
        border: boolConfig.whenFalse.borderColor,
        shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
      };
    }
    if (val == null) {
      const dashes = borderLineTypeToVis(boolConfig.whenUndefined.borderLineType);
      return {
        background: boolConfig.whenUndefined.fillColor,
        border: boolConfig.whenUndefined.borderColor,
        shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
      };
    }
  }
  for (const [propName, textConfig] of Object.entries(config.textProps)) {
    const val = ann[propName];
    if (val == null || typeof val !== 'string') continue;
    for (const rule of textConfig.rules) {
      if (!rule.regex) continue;
      try {
        const re = new RegExp(rule.regex);
        if (re.test(val)) {
          const dashes = borderLineTypeToVis(rule.borderLineType);
          return {
            background: rule.fillColor,
            border: rule.borderColor,
            shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
          };
        }
      } catch {
        // invalid regex: skip
      }
    }
  }
  return { background: COLORS.default, border: '#2c3e50' };
}

function buildNetworkData(filter: {
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  relationshipFontSize: number;
  searchQuery: string;
  includeNeighbors: boolean;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: BorderLineType }>;
  annotationStyleConfig: AnnotationStyleConfig;
  layoutMode: string;
}): { nodes: DataSet; edges: DataSet } {
  let filteredNodes = rawData.nodes.filter((n) =>
    shouldShowNodeByAnnotations(n, filter.annotationStyleConfig)
  );
  let nodeIds = new Set(filteredNodes.map((n) => n.id));
  let filteredEdges = rawData.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
  );

  const searchQuery = (filter.searchQuery || '').trim();
  if (searchQuery) {
    const matchingNodeIds = new Set<string>();
    filteredNodes.forEach((n) => {
      if (matchesSearch(n, null, searchQuery)) matchingNodeIds.add(n.id);
    });
    filteredEdges.forEach((e) => {
      if (matchesSearch(null, e, searchQuery)) {
        matchingNodeIds.add(e.from);
        matchingNodeIds.add(e.to);
      }
    });
    let searchMatchNodeIds = new Set(matchingNodeIds);
    if (filter.includeNeighbors) {
      filteredEdges.forEach((e) => {
        if (matchingNodeIds.has(e.from) || matchingNodeIds.has(e.to)) {
          searchMatchNodeIds.add(e.from);
          searchMatchNodeIds.add(e.to);
        }
      });
    }
    filteredNodes = filteredNodes.filter((n) => searchMatchNodeIds.has(n.id));
    nodeIds = new Set(filteredNodes.map((n) => n.id));
    filteredEdges = rawData.edges.filter(
      (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
    );
  }

  const edgeStyleConfig = filter.edgeStyleConfig;
  filteredEdges = filteredEdges.filter((e) => {
    const style = edgeStyleConfig[e.type];
    return !style || style.show !== false;
  });

  const layoutMode = filter.layoutMode;
  const wrapChars = filter.wrapChars ?? 10;
  const minFontSize = Math.max(8, Math.min(96, filter.minFontSize ?? 20));
  const maxFontSize = Math.max(minFontSize, Math.min(96, filter.maxFontSize ?? 80));
  const relationshipFontSize = Math.max(8, Math.min(48, filter.relationshipFontSize ?? 18));
  const { depth, maxDepth } = computeNodeDepths(nodeIds, filteredEdges);

  let nodePositions: Record<string, { x: number; y: number }> = {};
  if (layoutMode === 'weighted') {
    const nodeDimensions = new Map<string, { width: number; height: number }>();
    filteredNodes.forEach((n) => {
      const fontSize =
        maxDepth > 0
          ? Math.round(
              minFontSize +
                ((maxFontSize - minFontSize) * (maxDepth - (depth[n.id] ?? 0))) /
                  maxDepth
            )
          : maxFontSize;
      nodeDimensions.set(
        n.id,
        estimateNodeDimensions(n.label, wrapChars, fontSize)
      );
    });
    nodePositions = computeWeightedLayout(
      nodeIds,
      filteredEdges,
      SPACING,
      nodeDimensions
    );
    nodePositions = resolveOverlaps(
      nodePositions,
      nodeIds,
      filteredEdges,
      nodeDimensions,
      { minPadding: 8 }
    );
  }

  const nodes = filteredNodes.map((n) => {
    const pos = (n.x != null && n.y != null) ? { x: n.x, y: n.y } : nodePositions[n.id];
    const d = depth[n.id] ?? 0;
    const fontSize =
      maxDepth > 0
        ? Math.round(
            minFontSize +
              (maxFontSize - minFontSize) * (maxDepth - d) / maxDepth
          )
        : maxFontSize;
    const style = getNodeStyleFromAnnotations(n, filter.annotationStyleConfig);
    const node: Record<string, unknown> = {
      id: n.id,
      label: wrapText(n.label, wrapChars),
      labellableRoot: n.labellableRoot,
      color: { background: style.background, border: style.border },
      font: { size: fontSize, color: '#2c3e50' },
      ...(style.shapeProperties && { shapeProperties: style.shapeProperties }),
      ...(n.comment && { title: n.comment }),
    };
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
    }
    return node;
  });

  // Add data property nodes as small rectangles
  const dataPropertyNodes: Array<Record<string, unknown>> = [];
  const dataPropertyEdges: Array<Record<string, unknown>> = [];
  filteredNodes.forEach((n) => {
    const restrictions = n.dataPropertyRestrictions;
    if (restrictions && restrictions.length > 0) {
      restrictions.forEach((restriction, index) => {
        const dp = dataProperties.find((p) => p.name === restriction.propertyName);
        const label = dp?.label ?? restriction.propertyName;
        const cardLabel =
          restriction.minCardinality != null || restriction.maxCardinality != null
            ? ` [${restriction.minCardinality ?? 0}..${restriction.maxCardinality ?? '*'}]`
            : '';
        const dataPropNodeId = `__dataprop__${n.id}__${restriction.propertyName}`;
        const classPos = (n.x != null && n.y != null) ? { x: n.x, y: n.y } : nodePositions[n.id];
        
        // Position data property node relative to the class node
        // In hierarchical layout, place below; otherwise place to the right
        let dataPropPos: { x: number; y: number } | undefined;
        if (classPos) {
          if (layoutMode === 'weighted') {
            // Hierarchical layout: place below the class node
            const offsetY = 80 + (index * 50); // Start 80px below, then 50px spacing for each additional property
            dataPropPos = { x: classPos.x, y: classPos.y + offsetY };
          } else {
            // Other layouts: place to the right of the class node
            const offsetX = 200;
            const offsetY = (index - (restrictions.length - 1) / 2) * 40;
            dataPropPos = { x: classPos.x + offsetX, y: classPos.y + offsetY };
          }
        }
        
        dataPropertyNodes.push({
          id: dataPropNodeId,
          label: label + cardLabel,
          shape: 'box',
          size: 15,
          color: { background: '#e8f4f8', border: '#4a90a4' },
          font: { size: 10, color: '#2c3e50' },
          margin: 4,
          physics: false,
          ...(dataPropPos && { x: dataPropPos.x, y: dataPropPos.y }),
          ...(dp?.comment && { title: dp.comment }),
        });
        
        // Create edge from data property node to class node
        dataPropertyEdges.push({
          id: `${dataPropNodeId}->${n.id}:dataprop`,
          from: dataPropNodeId,
          to: n.id,
          arrows: 'to',
          label: '',
          font: { size: 10, color: '#666' },
          color: { color: '#4a90a4', highlight: '#4a90a4' },
          dashes: [5, 5],
          width: 1.5,
        });
      });
    }
  });

  const edges = filteredEdges.map((e) => {
    const style = edgeStyleConfig[e.type] || {
      showLabel: true,
      color: getDefaultColor(),
      lineType: 'solid' as BorderLineType,
    };
    const edgeComment = getRelationshipComment(e.type);
    const lineType = style.lineType ?? 'solid';
    const dashes = lineType === 'solid' ? false : borderLineTypeToVis(lineType);
    return {
      id: `${e.from}->${e.to}:${e.type}`,
      from: e.from,
      to: e.to,
      arrows: 'to',
      label: style.showLabel ? getEdgeDisplayLabel(e) : '',
      font: { size: relationshipFontSize, color: '#2c3e50' },
      color: { color: style.color, highlight: style.color },
      dashes,
      ...(edgeComment && { title: edgeComment }),
    };
  });

  // Assign smooth curves to overlapping edges (same node pair) to avoid label/line overlap
  const pairToEdges = new Map<string, Array<Record<string, unknown>>>();
  edges.forEach((edgeObj) => {
    const pairKey = [edgeObj.from, edgeObj.to].sort().join('|');
    if (!pairToEdges.has(pairKey)) pairToEdges.set(pairKey, []);
    pairToEdges.get(pairKey)!.push(edgeObj as Record<string, unknown>);
  });
  pairToEdges.forEach((list) => {
    if (list.length >= 2) {
      list.forEach((edgeObj, i) => {
        const smoothTypes = ['curvedCW', 'curvedCCW'] as const;
        const roundness = 0.15 + (i >> 1) * 0.1;
        edgeObj.smooth = {
          type: smoothTypes[i % 2],
          roundness: i % 2 === 0 ? roundness : -roundness,
        };
      });
    }
  });

  // Combine regular nodes with data property nodes
  const allNodes = [...nodes, ...dataPropertyNodes];
  // Combine regular edges with data property edges
  const allEdges = [...edges, ...dataPropertyEdges];

  return {
    nodes: new DataSet(allNodes),
    edges: new DataSet(allEdges),
  };
}

function updateSelectionInfoDisplay(net: Network): void {
  const selectionEl = document.getElementById('selectionInfo');
  if (!selectionEl) return;
  const nodeIds = net.getSelectedNodes().map(String);
  if (nodeIds.length === 0) {
    selectionEl.textContent = '';
  } else if (nodeIds.length === 1) {
    const node = rawData.nodes.find((n) => n.id === nodeIds[0]);
    selectionEl.textContent = ` | Selected: ${node?.label ?? nodeIds[0]} | Labellable: ${node?.labellableRoot ?? 'N/A'}`;
  } else {
    selectionEl.textContent = ` | Selected: ${nodeIds.length} nodes`;
  }
}

function setupNetworkSelectionAndNavigation(
  net: Network,
  container: HTMLElement
): void {
  const RIGHT_BUTTON = 2;
  const LEFT_BUTTON = 1;
  let rightPanStart: { x: number; y: number; viewPos: { x: number; y: number }; scale: number } | null = null;
  let selectionBeforeClick: string[] = [];

  container.oncontextmenu = () => false;

  const getContainerCoords = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (!container.contains(e.target as Node)) return;
    const coords = getContainerCoords(e);
    if (e.button === RIGHT_BUTTON) {
      const viewPos = net.getViewPosition();
      const scale = net.getScale();
      rightPanStart = { x: coords.x, y: coords.y, viewPos: { ...viewPos }, scale };
    } else if (e.button === LEFT_BUTTON) {
      selectionBeforeClick = net.getSelectedNodes().map(String);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const coords = getContainerCoords(e);
    if (rightPanStart) {
      const dx = coords.x - rightPanStart.x;
      const dy = coords.y - rightPanStart.y;
      const canvasDx = dx / rightPanStart.scale;
      const canvasDy = dy / rightPanStart.scale;
      const newViewPos = {
        x: rightPanStart.viewPos.x - canvasDx,
        y: rightPanStart.viewPos.y - canvasDy,
      };
      net.moveTo({
        position: newViewPos,
        scale: rightPanStart.scale,
        animation: false,
      });
      rightPanStart = { ...rightPanStart, x: coords.x, y: coords.y, viewPos: newViewPos };
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (e.button === RIGHT_BUTTON) rightPanStart = null;
  };

  const handleMouseLeave = () => {
    rightPanStart = null;
  };

  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseup', handleMouseUp, true);
  container.addEventListener('mouseleave', handleMouseLeave);

  const handleNativeClick = (e: MouseEvent) => {
    if (!ttlStore || !network) return;
    const target = e.target as HTMLElement;
    if (target.closest?.('.vis-add')) {
      addNodeMode = true;
      return;
    }
    if (target.closest?.('.vis-manipulation') && !addNodeMode) return;
    if (!addNodeMode) return;
    const rect = container.getBoundingClientRect();
    const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const nodeAt = net.getNodeAt(domPos);
    if (nodeAt != null) return;
    const canvasPos = net.DOMtoCanvas(domPos);
    showAddNodeModal(canvasPos.x, canvasPos.y);
  };

  const handleNativeDblclick = (e: MouseEvent) => {
    if (!ttlStore || !network) return;
    const target = e.target as HTMLElement;
    if (target.closest?.('.vis-manipulation')) return;
    const rect = container.getBoundingClientRect();
    const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const nodeAt = net.getNodeAt(domPos);
    if (nodeAt != null) {
      const nodeId = String(nodeAt);
      // Check if this is a data property node
      if (nodeId.startsWith('__dataprop__')) {
        // Parse the data property node ID: __dataprop__${classId}__${propertyName}
        const match = nodeId.match(/^__dataprop__(.+)__(.+)$/);
        if (match) {
          const [, classId] = match;
          showEditEdgeModal(nodeId, classId, 'dataprop');
          return;
        }
      }
      const selectedIds = net.getSelectedNodes().map(String);
      if (selectedIds.length > 1 && selectedIds.includes(nodeId)) {
        showMultiEditModal(selectedIds);
      } else {
        const node = rawData.nodes.find((n) => n.id === nodeId);
        if (node) showRenameModal(nodeId, node.label, node.labellableRoot);
      }
      return;
    }
    const edgeAt = net.getEdgeAt(domPos);
    if (edgeAt != null) {
      const m = String(edgeAt).match(/^(.+)->(.+):(.+)$/);
      if (m) showEditEdgeModal(m[1], m[2], m[3]);
      return;
    }
    const canvasPos = net.DOMtoCanvas(domPos);
    showAddNodeModal(canvasPos.x, canvasPos.y);
  };

  container.addEventListener('click', handleNativeClick, true);
  container.addEventListener('dblclick', handleNativeDblclick, true);

  net.on('click', (params: { nodes: string[]; edges: string[]; event?: { srcEvent?: MouseEvent; pointer?: { DOM: { x: number; y: number } } } }) => {
    const clickedNode = params.nodes[0] as string | undefined;
    const ctrlKey = params.event?.srcEvent?.ctrlKey ?? false;

    // If in add node mode and no node clicked, show the add node modal
    if (!clickedNode && addNodeMode) {
      const srcEvent = params.event?.srcEvent;
      if (srcEvent && container) {
        const rect = container.getBoundingClientRect();
        const domPos = { x: srcEvent.clientX - rect.left, y: srcEvent.clientY - rect.top };
        const nodeAt = net.getNodeAt(domPos);
        if (nodeAt == null) {
          const canvasPos = net.DOMtoCanvas(domPos);
          showAddNodeModal(canvasPos.x, canvasPos.y);
        }
      }
      return;
    }

    // If in add node mode and a node is clicked, exit add node mode
    if (addNodeMode) {
      addNodeMode = false;
      return;
    }

    if (!clickedNode) {
      return;
    }

    if (ctrlKey) {
      const wasSelected = selectionBeforeClick.includes(clickedNode);
      const newSelection = wasSelected
        ? selectionBeforeClick.filter((id) => id !== clickedNode)
        : [...new Set([...selectionBeforeClick, clickedNode])];
      net.setSelection({ nodes: newSelection }, { unselectAll: false, highlightEdges: true });
    } else {
      const newSelection = [clickedNode];
      net.setSelection({ nodes: newSelection }, { unselectAll: false, highlightEdges: true });
    }
    updateSelectionInfoDisplay(net);
  });
}

function getNetworkOptions(layoutMode: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    nodes: {
      shape: 'box',
      margin: 10,
      font: { size: 20, color: '#2c3e50' },
    },
    edges: { smooth: { type: 'cubicBezier' }, arrows: 'to' },
    interaction: {
      dragView: false,
      dragNodes: true,
      multiselect: true,
    },
  };
  if (layoutMode === 'weighted') {
    base.physics = { enabled: false };
  } else if (layoutMode === 'force') {
    base.physics = {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: SPACING,
        springConstant: 0.04,
        damping: 0.09,
        avoidOverlap: 0.1,
      },
      stabilization: { iterations: 150 },
    };
  } else {
    base.physics = { enabled: false };
  }
  return base;
}

function updateSaveButtonVisibility(): void {
  const group = document.getElementById('saveGroup');
  if (group) {
    group.style.display = hasUnsavedChanges ? 'inline-flex' : 'none';
  }
}

function updateFilePathDisplay(): void {
  const el = document.getElementById('filePathDisplay');
  if (!el) return;
  if (loadedFilePath) {
    el.textContent = `| File: ${loadedFilePath}`;
    el.title = loadedFilePath;
    el.style.display = '';
  } else {
    el.textContent = '';
    el.title = '';
    el.style.display = 'none';
  }
}

function updateRenameDataPropAddButtonState(): void {
  const selectEl = document.getElementById('renameDataPropSelect') as HTMLSelectElement;
  const addBtn = document.getElementById('renameDataPropAdd') as HTMLButtonElement;
  if (!selectEl || !addBtn) return;
  const hasSelection = selectEl.value.trim() !== '';
  addBtn.disabled = !hasSelection;
  addBtn.style.display = hasSelection ? '' : 'none';
}

function renderRenameModalDataPropsList(): void {
  const listEl = document.getElementById('renameDataPropsList');
  const selectEl = document.getElementById('renameDataPropSelect') as HTMLSelectElement;
  if (!listEl || !selectEl) return;
  const assignedNames = new Set(renameModalDataPropertyRestrictions.map((r) => r.propertyName));
  listEl.innerHTML = renameModalDataPropertyRestrictions
    .map((r) => {
      const dp = dataProperties.find((p) => p.name === r.propertyName);
      const label = dp?.label ?? r.propertyName;
      const card =
        r.minCardinality != null || r.maxCardinality != null
          ? ` [${r.minCardinality ?? 0}..${r.maxCardinality ?? '*'}]`
          : '';
      return `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
        <span>${label}${card}</span>
        <button type="button" class="rename-data-prop-remove" data-name="${r.propertyName}" style="font-size: 11px; padding: 2px 6px;">Remove</button>
      </div>`;
    })
    .join('');
  selectEl.innerHTML = '<option value="">-- data property --</option>' + dataProperties.filter((p) => !assignedNames.has(p.name)).map((p) => `<option value="${p.name}">${p.label}</option>`).join('');
  updateRenameDataPropAddButtonState();
  listEl.querySelectorAll('.rename-data-prop-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.name!;
      renameModalDataPropertyRestrictions = renameModalDataPropertyRestrictions.filter((r) => r.propertyName !== name);
      renderRenameModalDataPropsList();
    });
  });
}

function showRenameModal(
  nodeId: string,
  currentLabel: string,
  labellableRoot: boolean | null
): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const labellableCb = document.getElementById('renameLabellable') as HTMLInputElement;
  const titleEl = modal.querySelector('h3');
  if (titleEl) titleEl.textContent = 'Edit node';
  modal.dataset.mode = 'single';
  delete modal.dataset.nodeIds;
  input.value = currentLabel;
  input.disabled = false;
  input.style.color = '';
  input.dataset.nodeId = nodeId;
  labellableCb.checked = labellableRoot === true;
  labellableCb.indeterminate = labellableRoot === null;
  const node = rawData.nodes.find((n) => n.id === nodeId);
  const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
  if (commentInput) commentInput.value = node?.comment ?? '';
  const dataPropsSection = document.getElementById('renameDataPropsSection');
  if (dataPropsSection) {
    if (dataProperties.length === 0) {
      dataPropsSection.style.display = 'none';
    } else {
      dataPropsSection.style.display = 'block';
      renameModalInitialDataProps = node?.dataPropertyRestrictions ? [...node.dataPropertyRestrictions] : [];
      renameModalDataPropertyRestrictions = node?.dataPropertyRestrictions ? [...node.dataPropertyRestrictions] : [];
      renderRenameModalDataPropsList();
      updateRenameDataPropAddButtonState();
    }
  }
  modal.style.display = 'flex';
  input.focus();
  input.select();
}

function showMultiEditModal(nodeIds: string[]): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const labellableCb = document.getElementById('renameLabellable') as HTMLInputElement;
  modal.dataset.mode = 'multi';
  modal.dataset.nodeIds = JSON.stringify(nodeIds);
  delete input.dataset.nodeId;
  input.value = 'multiple nodes selected';
  input.disabled = true;
  input.style.color = '#999';
  const nodes = nodeIds.map((id) => rawData.nodes.find((n) => n.id === id)).filter(Boolean) as GraphNode[];
  const labellableValues = nodes.map((n) => n.labellableRoot);
  const allTrue = labellableValues.every((v) => v === true);
  const allFalse = labellableValues.every((v) => v === false);
  labellableCb.checked = allTrue;
  labellableCb.indeterminate = !allTrue && !allFalse;
  const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
  const comments = nodes.map((n) => n.comment ?? '').filter((c) => c);
  if (commentInput) {
    commentInput.value = comments.length > 0 && comments.every((c) => c === comments[0]) ? comments[0] : '';
    commentInput.disabled = false;
  }
  const dataPropsSection = document.getElementById('renameDataPropsSection');
  if (dataPropsSection) dataPropsSection.style.display = 'none';
  modal.style.display = 'flex';
  labellableCb.focus();
}

function hideRenameModal(): void {
  document.getElementById('renameModal')!.style.display = 'none';
}

let addNodeSearchTimeout: ReturnType<typeof setTimeout> | null = null;
let selectedExternalClass: ExternalClassInfo | null = null;

function showAddNodeModal(canvasX: number, canvasY: number): void {
  pendingAddNodePosition = { x: canvasX, y: canvasY };
  addNodeModalShowing = true;
  const modal = document.getElementById('addNodeModal')!;
  const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
  const externalInput = document.getElementById('addNodeExternalInput') as HTMLInputElement;
  const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
  const externalTabBtn = document.getElementById('addNodeExternalTabBtn');
  const externalTabContent = document.getElementById('addNodeExternalTabContent');
  const customTabContent = document.getElementById('addNodeCustomTab');
  
  // Show/hide external tab based on whether we have external references
  if (externalTabBtn && externalOntologyReferences.length > 0) {
    externalTabBtn.style.display = '';
  } else if (externalTabBtn) {
    externalTabBtn.style.display = 'none';
  }
  
  // Reset to custom tab
  document.querySelectorAll('.add-node-tab').forEach((tab) => {
    (tab as HTMLElement).classList.remove('active');
    (tab as HTMLElement).style.borderBottomColor = 'transparent';
    (tab as HTMLElement).style.fontWeight = 'normal';
    (tab as HTMLElement).style.color = '#666';
  });
  const customTabBtn = document.querySelector('.add-node-tab[data-tab="custom"]') as HTMLElement;
  if (customTabBtn) {
    customTabBtn.classList.add('active');
    customTabBtn.style.borderBottomColor = '#3498db';
    customTabBtn.style.fontWeight = 'bold';
    customTabBtn.style.color = '#000';
  }
  
  if (customTabContent) customTabContent.style.display = 'block';
  if (externalTabContent) externalTabContent.style.display = 'none';
  
  if (customInput) customInput.value = '';
  if (externalInput) externalInput.value = '';
  const resultsDiv = document.getElementById('addNodeExternalResults');
  const descDiv = document.getElementById('addNodeExternalDescription');
  if (resultsDiv) resultsDiv.style.display = 'none';
  if (descDiv) descDiv.style.display = 'none';
  
  okBtn.disabled = true;
  modal.style.display = 'flex';
  if (customInput) customInput.focus();
}

function hideAddNodeModal(): void {
  pendingAddNodePosition = null;
  addNodeMode = false;
  selectedExternalClass = null;
  if (addNodeSearchTimeout) {
    clearTimeout(addNodeSearchTimeout);
    addNodeSearchTimeout = null;
  }
  document.getElementById('addNodeModal')!.style.display = 'none';
}

function updateAddNodeOkButton(): void {
  const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
  const externalInput = document.getElementById('addNodeExternalInput') as HTMLInputElement;
  const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
  const customTabContent = document.getElementById('addNodeCustomTab');
  const isCustomTab = customTabContent && customTabContent.style.display !== 'none';
  
  if (okBtn) {
    if (isCustomTab) {
      okBtn.disabled = !customInput?.value.trim();
    } else {
      okBtn.disabled = !selectedExternalClass;
    }
  }
}

async function handleExternalClassSearch(query: string): Promise<void> {
  const resultsDiv = document.getElementById('addNodeExternalResults');
  const descDiv = document.getElementById('addNodeExternalDescription');
  
  if (!query.trim()) {
    if (resultsDiv) resultsDiv.style.display = 'none';
    if (descDiv) descDiv.style.display = 'none';
    selectedExternalClass = null;
    updateAddNodeOkButton();
    return;
  }
  
  // Debug logging
  console.log('Search query:', query);
  console.log('External references:', externalOntologyReferences);
  
  if (externalOntologyReferences.length === 0) {
    if (resultsDiv) {
      resultsDiv.innerHTML = '<div style="padding: 8px; color: #666; font-size: 11px;">No external ontologies referenced. Add one via "Manage external references".</div>';
      resultsDiv.style.display = 'block';
    }
    if (descDiv) descDiv.style.display = 'none';
    selectedExternalClass = null;
    updateAddNodeOkButton();
    return;
  }
  
  try {
    const results = await searchExternalClasses(query, externalOntologyReferences);
    console.log('Search results:', results);
  
    if (results.length === 0) {
      if (resultsDiv) {
        resultsDiv.innerHTML = '<div style="padding: 8px; color: #666; font-size: 11px;">No classes found</div>';
        resultsDiv.style.display = 'block';
      }
      if (descDiv) descDiv.style.display = 'none';
      selectedExternalClass = null;
    } else if (results.length === 1) {
      // Single match - show description overlay
      const match = results[0];
      selectedExternalClass = match;
      if (descDiv) {
        descDiv.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px;">${match.label}${match.prefix ? ` (${match.prefix}:${match.localName})` : ''}</div>
          ${match.comment ? `<div style="margin-top: 4px;">${match.comment}</div>` : ''}
          <div style="margin-top: 4px; font-size: 10px; color: #999;">From: ${match.ontologyUrl}</div>
        `;
        descDiv.style.display = 'block';
      }
      if (resultsDiv) resultsDiv.style.display = 'none';
    } else {
    // Multiple matches - show list
    if (resultsDiv) {
      resultsDiv.innerHTML = results.map((cls, idx) => `
        <div class="external-class-result" data-index="${idx}" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; ${idx === 0 ? 'background: #f0f7ff;' : ''}" onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background='${idx === 0 ? '#f0f7ff' : 'transparent'}'">
          <div style="font-weight: bold;">${cls.label}${cls.prefix ? ` (${cls.prefix}:${cls.localName})` : ''}</div>
          ${cls.comment ? `<div style="font-size: 10px; color: #666; margin-top: 2px;">${cls.comment.substring(0, 100)}${cls.comment.length > 100 ? '...' : ''}</div>` : ''}
          <div style="font-size: 9px; color: #999; margin-top: 2px;">From: ${cls.ontologyUrl}</div>
        </div>
      `).join('');
      resultsDiv.style.display = 'block';
      
      // Add click handlers
      resultsDiv.querySelectorAll('.external-class-result').forEach((el, idx) => {
        el.addEventListener('click', () => {
          selectedExternalClass = results[idx];
          if (descDiv) {
            descDiv.innerHTML = `
              <div style="font-weight: bold; margin-bottom: 4px;">${results[idx].label}${results[idx].prefix ? ` (${results[idx].prefix}:${results[idx].localName})` : ''}</div>
              ${results[idx].comment ? `<div style="margin-top: 4px;">${results[idx].comment}</div>` : ''}
              <div style="margin-top: 4px; font-size: 10px; color: #999;">From: ${results[idx].ontologyUrl}</div>
            `;
            descDiv.style.display = 'block';
          }
          if (resultsDiv) resultsDiv.style.display = 'none';
          updateAddNodeOkButton();
        });
      });
    }
    if (descDiv) descDiv.style.display = 'none';
    selectedExternalClass = results[0]; // Auto-select first result
    }
    
    updateAddNodeOkButton();
  } catch (err) {
    console.error('Search error:', err);
    if (resultsDiv) {
      resultsDiv.innerHTML = '<div style="padding: 8px; color: #d32f2f; font-size: 11px;">Error searching external ontologies. Check console for details.</div>';
      resultsDiv.style.display = 'block';
    }
    if (descDiv) descDiv.style.display = 'none';
    selectedExternalClass = null;
    updateAddNodeOkButton();
  }
}

function confirmAddNode(): void {
  if (!pendingAddNodePosition) return;
  const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
  const externalInput = document.getElementById('addNodeExternalInput') as HTMLInputElement;
  const customTabContent = document.getElementById('addNodeCustomTab');
  const isCustomTab = customTabContent && customTabContent.style.display !== 'none';
  
  const { x, y } = pendingAddNodePosition;
  
  if (isCustomTab) {
    const label = customInput?.value?.trim();
    if (!label) return;
    const result = addNewNodeAtPosition(x, y, label);
    if (result) {
      applyFilter(true);
    }
  } else {
    // Add from external ontology
    if (!selectedExternalClass || !ttlStore) return;
    
    // Use the local name as the node ID, but we need to import the class from external ontology
    // For now, we'll create a local class with the same name and add a comment indicating it's from external
    const localName = selectedExternalClass.localName;
    const label = selectedExternalClass.label;
    const comment = selectedExternalClass.comment 
      ? `${selectedExternalClass.comment}\n\n(Imported from ${selectedExternalClass.ontologyUrl})`
      : `(Imported from ${selectedExternalClass.ontologyUrl})`;
    
    const result = addNewNodeAtPosition(x, y, label);
    if (result && ttlStore) {
      // Update the comment to include external reference info
      if (comment) {
        updateCommentInStore(ttlStore, result.id, comment);
        const node = rawData.nodes.find((n) => n.id === result.id);
        if (node) node.comment = comment;
      }
      applyFilter(true);
    }
  }
  
  hideAddNodeModal();
}

function getAllEdgeTypes(): string[] {
  const fromProps = objectProperties.map((op) => op.name);
  const fromEdges = getEdgeTypes(rawData.edges);
  return [...new Set(['subClassOf', ...fromProps, ...fromEdges])].sort();
}

function getPropertyHasCardinality(edgeType: string): boolean {
  if (edgeType === 'subClassOf') return false;
  const op = objectProperties.find((p) => p.name === edgeType);
  return op?.hasCardinality ?? true;
}

function updateEditEdgeCommentDisplay(): void {
  const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
  const commentEl = document.getElementById('editEdgeComment') as HTMLElement;
  if (!typeSel || !commentEl) return;
  const comment = getRelationshipComment(typeSel.value);
  if (comment) {
    commentEl.textContent = comment;
    commentEl.style.display = 'block';
  } else {
    commentEl.textContent = '';
    commentEl.style.display = 'none';
  }
}

function showEditEdgeModal(edgeFrom: string, edgeTo: string, edgeType: string): void {
  const modal = document.getElementById('editEdgeModal')!;
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap')!;
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;

  const isDataPropertyEdge = edgeType === 'dataprop';
  
  if (isDataPropertyEdge) {
    // For data property edges, parse the data property node ID to get the class and property
    const match = edgeFrom.match(/^__dataprop__(.+)__(.+)$/);
    if (!match) {
      hideEditEdgeModal();
      return;
    }
    const [, classId, propertyName] = match;
    const classNode = rawData.nodes.find((n) => n.id === classId);
    const restriction = classNode?.dataPropertyRestrictions?.find((r) => r.propertyName === propertyName);
    
    modal.dataset.mode = 'edit';
    modal.dataset.oldFrom = edgeFrom;
    modal.dataset.oldTo = edgeTo;
    modal.dataset.oldType = edgeType;
    modal.dataset.dataPropertyName = propertyName;
    modal.dataset.classId = classId;
    
    // For data properties, show the data property name and class, but disable editing
    fromSel.disabled = true;
    toSel.disabled = true;
    typeSel.disabled = true;
    
    // Constrain select widths to prevent modal from expanding too wide
    fromSel.style.maxWidth = '350px';
    toSel.style.maxWidth = '350px';
    typeSel.style.maxWidth = '350px';
    // Also constrain the modal content width
    const modalContent = modal.querySelector('.modal-content') as HTMLElement;
    if (modalContent) {
      modalContent.style.maxWidth = '400px';
      modalContent.style.width = '400px';
    }
    
    // Show data property node label and class node label
    const dp = dataProperties.find((p) => p.name === propertyName);
    const dpLabel = dp?.label ?? propertyName;
    fromSel.innerHTML = `<option value="${edgeFrom}" selected>${dpLabel} (data property)</option>`;
    toSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${n.label}</option>`).join('');
    
    // Show data properties in type selector (though it's disabled)
    typeSel.innerHTML = dataProperties.map((dp) => `<option value="dataprop"${dp.name === propertyName ? ' selected' : ''}>${dp.label} (data property)</option>`).join('');
    
    // Show cardinality for data properties
    minCardInput.value = restriction?.minCardinality != null ? String(restriction.minCardinality) : '';
    maxCardInput.value = restriction?.maxCardinality != null ? String(restriction.maxCardinality) : '';
    cardWrap.style.display = 'block';
    
    // Show explanation for disabled fields
    let explanationEl = document.getElementById('editEdgeDataPropExplanation');
    if (!explanationEl) {
      explanationEl = document.createElement('div');
      explanationEl.id = 'editEdgeDataPropExplanation';
      explanationEl.style.cssText = 'font-size: 11px; color: #666; margin-top: 4px; margin-bottom: 4px; padding: 6px 8px; background: #f0f0f0; border-radius: 4px; line-height: 1.4; width: 100%; box-sizing: border-box; word-wrap: break-word; overflow-wrap: break-word;';
      // Insert after the "To" field, before the cardinality section
      const toSelParent = toSel.parentElement;
      if (toSelParent && toSelParent.parentElement) {
        toSelParent.parentElement.insertBefore(explanationEl, cardWrap);
      }
    }
    const classNodeLabel = classNode?.label ?? classId;
    explanationEl.textContent = `Note: To change which data property, edit the source node (double-click the class node ${classNodeLabel})`;
    explanationEl.style.display = 'block';
    
    // Hide comment display for data properties (or show data property comment)
    const commentEl = document.getElementById('editEdgeComment') as HTMLElement;
    if (commentEl) {
      if (dp?.comment) {
        commentEl.textContent = dp.comment;
        commentEl.style.display = 'block';
      } else {
        commentEl.style.display = 'none';
      }
    }
    
    modal.querySelector('h3')!.textContent = 'Edit data property restriction';
  } else {
    // Regular object property edge
    const edge = rawData.edges.find((e) => e.from === edgeFrom && e.to === edgeTo && e.type === edgeType);

    modal.dataset.mode = 'edit';
    modal.dataset.oldFrom = edgeFrom;
    modal.dataset.oldTo = edgeTo;
    modal.dataset.oldType = edgeType;
    delete modal.dataset.dataPropertyName;
    delete modal.dataset.classId;
    
    fromSel.disabled = false;
    toSel.disabled = false;
    typeSel.disabled = false;
    
    // Reset max-width for regular edges (let them size naturally)
    fromSel.style.maxWidth = '';
    toSel.style.maxWidth = '';
    typeSel.style.maxWidth = '';
    const modalContent = modal.querySelector('.modal-content') as HTMLElement;
    if (modalContent) {
      modalContent.style.maxWidth = '';
    }
    
    fromSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeFrom ? ' selected' : ''}>${n.label}</option>`).join('');
    toSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${n.label}</option>`).join('');
    const allTypes = getAllEdgeTypes();
    typeSel.innerHTML = allTypes.map((t) => `<option value="${t}"${t === edgeType ? ' selected' : ''}>${getRelationshipLabel(t)}</option>`).join('');

    minCardInput.value = edge?.minCardinality != null ? String(edge.minCardinality) : '';
    maxCardInput.value = edge?.maxCardinality != null ? String(edge.maxCardinality) : '';
    cardWrap.style.display = edgeType !== 'subClassOf' && getPropertyHasCardinality(edgeType) ? 'block' : 'none';

    updateEditEdgeCommentDisplay();
    modal.querySelector('h3')!.textContent = 'Edit edge';
    
    // Hide explanation for regular edges
    const explanationEl = document.getElementById('editEdgeDataPropExplanation');
    if (explanationEl) {
      explanationEl.style.display = 'none';
    }
  }
  
  modal.style.display = 'flex';
}

function showAddEdgeModal(from: string, to: string, callback: (data: { from: string; to: string; id?: string } | null) => void): void {
  const modal = document.getElementById('editEdgeModal')!;
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap')!;
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;

  modal.dataset.mode = 'add';
  pendingAddEdgeData = { from, to, callback };
  fromSel.disabled = true;
  toSel.disabled = true;
  fromSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === from ? ' selected' : ''}>${n.label}</option>`).join('');
  toSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === to ? ' selected' : ''}>${n.label}</option>`).join('');
  const allTypes = getAllEdgeTypes();
  typeSel.innerHTML = allTypes.map((t) => `<option value="${t}"${t === 'subClassOf' ? ' selected' : ''}>${getRelationshipLabel(t)}</option>`).join('');

  minCardInput.value = '';
  maxCardInput.value = '';
  cardWrap.style.display = typeSel.value !== 'subClassOf' && getPropertyHasCardinality(typeSel.value) ? 'block' : 'none';

  updateEditEdgeCommentDisplay();
  modal.querySelector('h3')!.textContent = 'Add edge';
  modal.style.display = 'flex';
}

function hideEditEdgeModal(): void {
  if (pendingEditEdgeCallback) {
    pendingEditEdgeCallback(null);
    pendingEditEdgeCallback = null;
  }
  if (pendingAddEdgeData) {
    pendingAddEdgeData.callback(null);
    pendingAddEdgeData = null;
  }
  document.getElementById('editEdgeModal')!.style.display = 'none';
}

function getCardinalityFromEditModal(): { minCardinality?: number | null; maxCardinality?: number | null } | undefined {
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

function confirmEditEdge(): void {
  const modal = document.getElementById('editEdgeModal')!;
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
  const mode = modal.dataset.mode;
  const cardinality = getCardinalityFromEditModal();

  if (mode === 'add' && pendingAddEdgeData) {
    const { from, to, callback } = pendingAddEdgeData;
    const newType = typeSel.value;
    if (!ttlStore) {
      hideEditEdgeModal();
      return;
    }
    const card = newType !== 'subClassOf' ? cardinality : undefined;
    const ok = addEdgeToStore(ttlStore, from, to, newType, card);
    if (!ok) {
      alert('Failed to add edge. An edge may already exist between these nodes.');
      hideEditEdgeModal();
      return;
    }
    const newEdge: import('./types').GraphEdge = { from, to, type: newType };
    if (card) {
      newEdge.minCardinality = card.minCardinality ?? undefined;
      newEdge.maxCardinality = card.maxCardinality ?? undefined;
    }
    rawData.edges.push(newEdge);
    pushUndoable(
      () => {
        removeEdgeFromStore(ttlStore!, from, to, newType);
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === newType);
        if (i >= 0) rawData.edges.splice(i, 1);
      },
      () => {
        addEdgeToStore(ttlStore!, from, to, newType, card);
        rawData.edges.push(newEdge);
      }
    );
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    callback({ from, to, id: `${from}->${to}:${newType}` });
    pendingAddEdgeData = null;
    hideEditEdgeModal();
    applyFilter(true);
    return;
  }

  const oldFrom = modal.dataset.oldFrom!;
  const oldTo = modal.dataset.oldTo!;
  const oldType = modal.dataset.oldType!;
  const isDataPropertyEdge = oldType === 'dataprop';
  
  if (isDataPropertyEdge) {
    // Handle data property restriction update
    const propertyName = modal.dataset.dataPropertyName!;
    const classId = modal.dataset.classId!;
    const classNode = rawData.nodes.find((n) => n.id === classId);
    const restriction = classNode?.dataPropertyRestrictions?.find((r) => r.propertyName === propertyName);
    
    if (!ttlStore || !classNode || !restriction) {
      hideEditEdgeModal();
      return;
    }
    
    const oldMin = restriction.minCardinality ?? null;
    const oldMax = restriction.maxCardinality ?? null;
    const newMin = cardinality?.minCardinality ?? null;
    const newMax = cardinality?.maxCardinality ?? null;
    
    const sameCardinality = oldMin === newMin && oldMax === newMax;
    if (sameCardinality) {
      hideEditEdgeModal();
      return;
    }
    
    // Update the restriction in the store
    removeDataPropertyRestrictionFromClass(ttlStore, classId, propertyName);
    addDataPropertyRestrictionToClass(ttlStore, classId, propertyName, { minCardinality: newMin ?? undefined, maxCardinality: newMax ?? undefined });
    
    // Update in rawData
    const nodeIndex = rawData.nodes.findIndex((n) => n.id === classId);
    if (nodeIndex >= 0) {
      rawData.nodes[nodeIndex].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(ttlStore, classId);
    }
    
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    hideEditEdgeModal();
    applyFilter(true);
    return;
  }
  
  const newFrom = fromSel.value;
  const newTo = toSel.value;
  const newType = typeSel.value;
  const oldEdge = rawData.edges.find((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
  const card = newType !== 'subClassOf' ? cardinality : undefined;
  const sameEdge = oldFrom === newFrom && oldTo === newTo && oldType === newType &&
    (card?.minCardinality ?? null) === (oldEdge?.minCardinality ?? null) &&
    (card?.maxCardinality ?? null) === (oldEdge?.maxCardinality ?? null);
  if (!ttlStore || sameEdge) {
    hideEditEdgeModal();
    return;
  }
  const removeOk = removeEdgeFromStore(ttlStore, oldFrom, oldTo, oldType);
  if (!removeOk) {
    hideEditEdgeModal();
    return;
  }
  const addOk = addEdgeToStore(ttlStore, newFrom, newTo, newType, card);
  if (!addOk) {
    addEdgeToStore(ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
    alert('Failed to update edge.');
    hideEditEdgeModal();
    return;
  }
  const idx = rawData.edges.findIndex((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
  if (idx >= 0) rawData.edges.splice(idx, 1);
  const newEdge: import('./types').GraphEdge = { from: newFrom, to: newTo, type: newType };
  if (card) {
    newEdge.minCardinality = card.minCardinality ?? undefined;
    newEdge.maxCardinality = card.maxCardinality ?? undefined;
  }
  rawData.edges.push(newEdge);
  const oldCard = { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null };
  pushUndoable(
    () => {
      removeEdgeFromStore(ttlStore!, newFrom, newTo, newType);
      addEdgeToStore(ttlStore!, oldFrom, oldTo, oldType, oldCard);
      const i = rawData.edges.findIndex((e) => e.from === newFrom && e.to === newTo && e.type === newType);
      if (i >= 0) rawData.edges.splice(i, 1);
      rawData.edges.push({ from: oldFrom, to: oldTo, type: oldType, ...oldCard });
    },
    () => {
      removeEdgeFromStore(ttlStore!, oldFrom, oldTo, oldType);
      addEdgeToStore(ttlStore!, newFrom, newTo, newType, card);
      const i = rawData.edges.findIndex((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
      if (i >= 0) rawData.edges.splice(i, 1);
      rawData.edges.push(newEdge);
    }
  );
  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  hideEditEdgeModal();
  applyFilter(true);
}

function confirmRename(): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const labellableCb = document.getElementById('renameLabellable') as HTMLInputElement;
  const mode = modal.dataset.mode;

  if (mode === 'multi') {
    const nodeIdsJson = modal.dataset.nodeIds;
    if (!nodeIdsJson || !ttlStore) {
      hideRenameModal();
      return;
    }
    const nodeIds: string[] = JSON.parse(nodeIdsJson);
    const newLabellable = labellableCb.checked;
    const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
    const newComment = commentInput?.value?.trim() ?? '';
    const oldVals = nodeIds.map((id) => {
      const n = rawData.nodes.find((x) => x.id === id);
      return { id, labellable: n?.labellableRoot, comment: n?.comment ?? '' };
    });
    let anyChanged = false;
    for (const nodeId of nodeIds) {
      const node = rawData.nodes.find((n) => n.id === nodeId);
      if (node && (node.labellableRoot === true) !== newLabellable) {
        node.labellableRoot = newLabellable;
        if (!node.annotations) node.annotations = {};
        node.annotations['labellableRoot'] = newLabellable;
        updateLabellableInStore(ttlStore, nodeId, newLabellable);
        anyChanged = true;
      }
      if (node && (node.comment ?? '') !== newComment) {
        node.comment = newComment || undefined;
        updateCommentInStore(ttlStore, nodeId, newComment || null);
        anyChanged = true;
      }
    }
    if (anyChanged) {
      pushUndoable(
        () => {
          oldVals.forEach(({ id, labellable, comment }) => {
            const n = rawData.nodes.find((x) => x.id === id);
            if (n && ttlStore) {
              n.labellableRoot = labellable ?? null;
              if (n.annotations) n.annotations['labellableRoot'] = labellable ?? null;
              updateLabellableInStore(ttlStore, id, labellable === true);
              n.comment = comment || undefined;
              updateCommentInStore(ttlStore, id, comment || null);
            }
          });
        },
        () => {
          nodeIds.forEach((id) => {
            const n = rawData.nodes.find((x) => x.id === id);
            if (n && ttlStore) {
              n.labellableRoot = newLabellable;
              if (!n.annotations) n.annotations = {};
              n.annotations['labellableRoot'] = newLabellable;
              updateLabellableInStore(ttlStore, id, newLabellable);
              n.comment = newComment || undefined;
              updateCommentInStore(ttlStore, id, newComment || null);
            }
          });
        }
      );
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    }
    hideRenameModal();
    applyFilter(true);
    return;
  }

  const nodeId = input.dataset.nodeId;
  const newLabel = input.value.trim();
  if (!nodeId || !newLabel) return;

  const nodeIndex = rawData.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex < 0) {
    hideRenameModal();
    return;
  }
  const node = rawData.nodes[nodeIndex];

  const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
  const newComment = commentInput?.value?.trim() ?? '';
  const oldComment = node.comment ?? '';
  const commentChanged = oldComment !== newComment;

  const labelChanged = node.label !== newLabel;
  const newLabellable = labellableCb.checked;
  const labellableChanged = (node.labellableRoot === true) !== newLabellable;

  const initialDataProps = renameModalInitialDataProps ?? [];
  const currentDataProps = renameModalDataPropertyRestrictions;
  const dataPropsEqual =
    initialDataProps.length === currentDataProps.length &&
    initialDataProps.every((a) => {
      const b = currentDataProps.find((c) => c.propertyName === a.propertyName);
      return b && a.minCardinality === b.minCardinality && a.maxCardinality === b.maxCardinality;
    }) &&
    currentDataProps.every((b) => initialDataProps.some((a) => a.propertyName === b.propertyName));
  const dataPropsChanged = !dataPropsEqual;

  console.log('[confirmRename] data props', { 
    nodeId, 
    hasTtlStore: !!ttlStore, 
    initialDataProps: JSON.stringify(initialDataProps), 
    currentDataProps: JSON.stringify(currentDataProps), 
    dataPropsEqual,
    dataPropsChanged, 
    labelChanged, 
    labellableChanged, 
    commentChanged 
  });

  if (!labelChanged && !labellableChanged && !commentChanged && !dataPropsChanged) {
    hideRenameModal();
    return;
  }

  const oldLabel = node.label;
  const oldLabellable = node.labellableRoot;
  const oldDataProps = [...(node.dataPropertyRestrictions ?? [])];

  if (labelChanged) {
    node.label = newLabel;
    if (ttlStore) updateLabelInStore(ttlStore, nodeId, newLabel);
  }
  if (labellableChanged && ttlStore) {
    node.labellableRoot = newLabellable;
    if (!node.annotations) node.annotations = {};
    node.annotations['labellableRoot'] = newLabellable;
    updateLabellableInStore(ttlStore, nodeId, newLabellable);
  }
  if (commentChanged && ttlStore) {
    node.comment = newComment || undefined;
    updateCommentInStore(ttlStore, nodeId, newComment || null);
  }

  if (dataPropsChanged) {
    if (ttlStore) {
      const toRemove = initialDataProps.filter(
        (i) => !currentDataProps.some((c) => c.propertyName === i.propertyName && c.minCardinality === i.minCardinality && c.maxCardinality === i.maxCardinality)
      );
      const toAdd = currentDataProps.filter(
        (c) => !initialDataProps.some((i) => i.propertyName === c.propertyName && i.minCardinality === c.minCardinality && i.maxCardinality === c.maxCardinality)
      );
      console.log('[confirmRename] dataPropsChanged - toRemove:', toRemove, 'toAdd:', toAdd);
      for (const r of toRemove) {
        console.log('[confirmRename] Removing restriction:', r);
        removeDataPropertyRestrictionFromClass(ttlStore, nodeId, r.propertyName);
      }
      for (const r of toAdd) {
        console.log('[confirmRename] Adding restriction:', r);
        const result = addDataPropertyRestrictionToClass(ttlStore, nodeId, r.propertyName, { minCardinality: r.minCardinality ?? undefined, maxCardinality: r.maxCardinality ?? undefined });
        console.log('[confirmRename] addDataPropertyRestrictionToClass result:', result);
      }
      const readBack = getDataPropertyRestrictionsForClass(ttlStore, nodeId);
      console.log('[confirmRename] Read back restrictions from store:', readBack);
      rawData.nodes[nodeIndex].dataPropertyRestrictions = readBack;
    } else {
      rawData.nodes[nodeIndex].dataPropertyRestrictions = [...currentDataProps];
    }
  }

  pushUndoable(
    () => {
      if (labelChanged) {
        node.label = oldLabel;
        if (ttlStore) updateLabelInStore(ttlStore, nodeId, oldLabel);
      }
      if (labellableChanged && ttlStore) {
        node.labellableRoot = oldLabellable;
        if (!node.annotations) node.annotations = {};
        node.annotations['labellableRoot'] = oldLabellable ?? null;
        updateLabellableInStore(ttlStore, nodeId, oldLabellable === true);
      }
      if (commentChanged && ttlStore) {
        node.comment = oldComment || undefined;
        updateCommentInStore(ttlStore, nodeId, oldComment || null);
      }
      if (dataPropsChanged) {
        rawData.nodes[nodeIndex].dataPropertyRestrictions = [...oldDataProps];
        if (ttlStore) {
          const toRemove = currentDataProps.filter(
          (c) => !oldDataProps.some((i) => i.propertyName === c.propertyName && i.minCardinality === c.minCardinality && i.maxCardinality === c.maxCardinality)
        );
        const toAdd = oldDataProps.filter(
          (i) => !currentDataProps.some((c) => c.propertyName === i.propertyName && c.minCardinality === i.minCardinality && c.maxCardinality === i.maxCardinality)
        );
        for (const r of toRemove) removeDataPropertyRestrictionFromClass(ttlStore, nodeId, r.propertyName);
        for (const r of toAdd) addDataPropertyRestrictionToClass(ttlStore, nodeId, r.propertyName, { minCardinality: r.minCardinality ?? undefined, maxCardinality: r.maxCardinality ?? undefined });
        }
      }
    },
    () => {
      if (labelChanged) {
        node.label = newLabel;
        if (ttlStore) updateLabelInStore(ttlStore, nodeId, newLabel);
      }
      if (labellableChanged && ttlStore) {
        node.labellableRoot = newLabellable;
        if (!node.annotations) node.annotations = {};
        node.annotations['labellableRoot'] = newLabellable;
        updateLabellableInStore(ttlStore, nodeId, newLabellable);
      }
      if (commentChanged && ttlStore) {
        node.comment = newComment || undefined;
        updateCommentInStore(ttlStore, nodeId, newComment || null);
      }
      if (dataPropsChanged) {
        if (ttlStore) {
          const toRemove = oldDataProps.filter(
          (i) => !currentDataProps.some((c) => c.propertyName === i.propertyName && c.minCardinality === i.minCardinality && c.maxCardinality === i.maxCardinality)
        );
        const toAdd = currentDataProps.filter(
          (c) => !oldDataProps.some((i) => i.propertyName === c.propertyName && i.minCardinality === c.minCardinality && i.maxCardinality === c.maxCardinality)
        );
        for (const r of toRemove) removeDataPropertyRestrictionFromClass(ttlStore, nodeId, r.propertyName);
        for (const r of toAdd) addDataPropertyRestrictionToClass(ttlStore, nodeId, r.propertyName, { minCardinality: r.minCardinality ?? undefined, maxCardinality: r.maxCardinality ?? undefined });
          rawData.nodes[nodeIndex].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(ttlStore, nodeId);
        } else {
          rawData.nodes[nodeIndex].dataPropertyRestrictions = [...currentDataProps];
        }
      }
    }
  );

  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  hideRenameModal();
  applyFilter(true);
}

async function saveTtl(): Promise<void> {
  if (!ttlStore) return;
  const overwriteCb = document.getElementById('overwriteFile') as HTMLInputElement | null;
  const doOverwrite = overwriteCb?.checked === true && fileHandle;
  try {
    const ttlString = await storeToTurtle(ttlStore, externalOntologyReferences);
    if (doOverwrite) {
      const writable = await fileHandle!.createWritable();
      await writable.write(ttlString);
      await writable.close();
    } else {
      const blob = new Blob([ttlString], { type: 'text/turtle' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = loadedFileName ?? 'ontology.ttl';
      a.click();
      URL.revokeObjectURL(url);
    }
    hasUnsavedChanges = false;
    updateSaveButtonVisibility();
  } catch (err) {
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = `Save error: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}

function renderApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div id="controls">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Load ontology:</strong>
        <button type="button" id="selectFile" class="primary">Select TTL file...</button>
        <button type="button" id="loadLastOpened" title="Select a TTL file first" disabled>Load last opened: (none)</button>
        <input type="file" id="fileInput" accept=".ttl,.turtle" />
      </div>
      <div id="vizControls" style="display: none;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Layout:</strong>
        <select id="layoutMode">
          <option value="weighted">Hierarchical</option>
          <option value="force">Force-directed</option>
        </select>
      </div>
      <div id="styleMenusGroup" style="display: flex; flex-direction: column; gap: 8px; padding: 8px; border: 1px solid #000; border-radius: 4px;">
        <details id="edgeStylesMenu">
          <summary style="cursor: pointer; font-weight: bold;">Object Properties</summary>
          <div id="edgeStylesContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
          <button type="button" id="addRelationshipTypeBtn" style="margin-top: 6px; font-size: 11px;">+ Add object property</button>
        </details>
        <details id="dataPropsMenu">
          <summary style="cursor: pointer; font-weight: bold;">Data Properties</summary>
          <div id="dataPropsContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
          <button type="button" id="addDataPropertyBtn" style="margin-top: 6px; font-size: 11px;">+ Add data property</button>
        </details>
        <details id="annotationPropsMenu">
          <summary style="cursor: pointer; font-weight: bold;">Annotation Properties</summary>
          <div id="annotationPropsContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
          <button type="button" id="addAnnotationPropertyBtn" style="margin-top: 6px; font-size: 11px;">+ Add annotation property</button>
        </details>
      </div>
      <div id="textDisplayWrap" style="position: relative; display: inline-block;">
        <button type="button" id="textDisplayToggle" style="cursor: pointer; font-weight: bold; font-size: 12px;">Text display options</button>
        <div id="textDisplayPopup" style="position: absolute; top: 100%; left: 0; margin-top: 4px; padding: 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; display: none; min-width: 200px;">
          <div style="margin-bottom: 10px;">
            <strong style="font-size: 12px;">Wrap text:</strong>
            <input type="number" id="wrapChars" min="1" max="50" value="10" style="width: 50px; margin-left: 6px;">
            <span style="font-size: 11px;">chars</span>
          </div>
          <div>
            <strong style="font-size: 12px;">Node font size (px)</strong>
            <div style="margin-top: 6px;">
              <span style="font-size: 11px;">Min (leaves)</span>
              <input type="number" id="minFontSize" min="8" max="96" value="20" style="width: 45px; margin-left: 6px;">
              <span style="font-size: 11px; margin-left: 8px;">Max (roots)</span>
              <input type="number" id="maxFontSize" min="8" max="96" value="80" style="width: 45px; margin-left: 6px;">
            </div>
          </div>
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Relationships font size</strong>
            <input type="number" id="relationshipFontSize" min="8" max="48" value="18" style="width: 45px; margin-left: 6px;">
            <span style="font-size: 11px;">px</span>
          </div>
        </div>
      </div>
      <div>
        <strong>Search:</strong>
        <div id="searchWrap">
          <input type="text" id="searchQuery" placeholder="Node or relationship..." autocomplete="off" style="width: 180px;">
          <div id="searchAutocomplete"></div>
        </div>
        <label style="font-size: 11px; margin-left: 4px;">
          <input type="checkbox" id="searchIncludeNeighbors" checked> Include neighbors
        </label>
      </div>
      <span id="undoRedoGroup" style="gap: 4px; align-items: center; display: inline-flex;">
        <button type="button" id="undoBtn" title="Undo (Ctrl+Z)" disabled>Undo</button>
        <button type="button" id="redoBtn" title="Redo (Ctrl+Shift+Z)" disabled>Redo</button>
      </span>
      <span id="saveGroup" style="display: none; gap: 8px; align-items: center;">
        <button id="saveChanges" class="primary">Save changes</button>
        <span id="overwriteFileWrap">
          <label style="font-size: 11px;">
            <input type="checkbox" id="overwriteFile"> Overwrite file on save
          </label>
        </span>
      </span>
      <span id="displayConfigGroup" style="display: none; gap: 8px; align-items: center;">
        <button type="button" id="saveDisplayConfig" title="Save display config to a .display.json file (e.g. next to your ontology)">Save display config</button>
        <button type="button" id="loadDisplayConfig" title="Load display config from a .display.json file">Load display config</button>
      </span>
      <span id="externalRefsGroup" style="display: none; gap: 8px; align-items: center;">
        <button type="button" id="manageExternalRefs" title="Manage external ontology references">Manage external references</button>
      </span>
      </div>
      <div id="errorMsg" class="error" style="display: none;"></div>
    </div>
    <div id="networkWrapper">
      <div id="network"></div>
      <button type="button" id="resetView">Reset view</button>
    </div>
    <div id="info">
      Nodes: <span id="nodeCount">0</span> | Edges: <span id="edgeCount">0</span>
      <span id="filePathDisplay" style="margin-left: 24px; font-size: 11px;"></span>
      <span id="edgeColorsLegend" style="margin-left: 24px; font-size: 11px;"></span>
      <span id="selectionInfo"></span>
    </div>
    <div id="renameModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit node</h3>
        <label>Label: <input type="text" id="renameInput" /></label>
        <label style="display: block; margin-top: 10px;">
          <input type="checkbox" id="renameLabellable" />
          Labellable
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="renameComment" rows="3" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div id="renameDataPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
          <strong style="font-size: 12px;">Assign data property</strong>
          <div id="renameDataPropsList" style="margin-top: 6px; margin-bottom: 8px; font-size: 11px;"></div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <select id="renameDataPropSelect" style="padding: 4px 8px; font-size: 11px; min-width: 120px;">
              <option value="">-- data property --</option>
            </select>
            <span style="font-size: 11px;">Min:</span>
            <input type="number" id="renameDataPropMin" min="0" placeholder="0" style="width: 48px; padding: 4px; font-size: 11px;">
            <span style="font-size: 11px;">Max:</span>
            <input type="number" id="renameDataPropMax" min="0" placeholder="*" style="width: 48px; padding: 4px; font-size: 11px;" title="Leave empty for unbounded">
            <button type="button" id="renameDataPropAdd" style="font-size: 11px; padding: 4px 8px; display: none;" disabled>Add</button>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" id="renameCancel">Cancel</button>
          <button type="button" id="renameConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="addNodeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add node</h3>
        <div id="addNodeTabs" style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid #ddd;">
          <button type="button" class="add-node-tab active" data-tab="custom" style="padding: 8px 16px; background: none; border: none; border-bottom: 2px solid #3498db; cursor: pointer; font-size: 12px; font-weight: bold;">Add custom</button>
          <button type="button" class="add-node-tab" data-tab="external" id="addNodeExternalTabBtn" style="padding: 8px 16px; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; font-size: 12px; color: #666; display: none;">Add from referenced ontology</button>
        </div>
        <div id="addNodeCustomTab" class="add-node-tab-content">
          <label>Label: <input type="text" id="addNodeInput" placeholder="Enter node label" /></label>
        </div>
        <div id="addNodeExternalTabContent" class="add-node-tab-content" style="display: none;">
          <label>Search class: <input type="text" id="addNodeExternalInput" placeholder="Type to search referenced ontologies..." /></label>
          <div id="addNodeExternalResults" style="margin-top: 12px; max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 8px; display: none;"></div>
          <div id="addNodeExternalDescription" style="margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px; font-size: 11px; color: #666; display: none;"></div>
        </div>
        <div class="modal-actions">
          <button type="button" id="addNodeCancel">Cancel</button>
          <button type="button" id="addNodeConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="addRelationshipTypeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add object property</h3>
        <label style="display: block; margin-top: 8px;">Label: <input type="text" id="addRelTypeLabel" placeholder="e.g. contains" /></label>
        <label style="display: flex; align-items: center; margin-top: 10px; gap: 6px;">
          <input type="checkbox" id="addRelTypeHasCardinality" checked /> 
          <span>Has cardinality</span>
          <span style="cursor: help; color: #666; font-size: 14px; line-height: 1;" title="When checked, edges of this type can specify min/max cardinality (e.g. &quot;contains [0..3]&quot;).">ⓘ</span>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="addRelTypeCancel">Cancel</button>
          <button type="button" id="addRelTypeConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="editRelationshipTypeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit object property</h3>
        <p id="editRelTypeName" style="font-size: 11px; color: #666; margin-bottom: 8px;"></p>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="editRelTypeLabel" placeholder="e.g. contains" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="editRelTypeComment" rows="3" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editRelTypeCancel">Cancel</button>
          <button type="button" id="editRelTypeConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="addDataPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add data property</h3>
        <label style="display: block; margin-top: 8px;">Label: <input type="text" id="addDataPropLabel" placeholder="e.g. refersToDrawingId" /></label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (datatype)</span>
          <select id="addDataPropRange" style="display: block; margin-top: 4px; padding: 6px; width: 100%; box-sizing: border-box;"></select>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="addDataPropCancel">Cancel</button>
          <button type="button" id="addDataPropConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="editDataPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit data property</h3>
        <p id="editDataPropName" style="font-size: 11px; color: #666; margin-bottom: 8px;"></p>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="editDataPropLabel" placeholder="e.g. refers to drawing ID" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="editDataPropComment" rows="2" placeholder="Optional" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range datatype)</span>
          <select id="editDataPropRange" style="display: block; margin-top: 4px; padding: 8px; width: 100%; box-sizing: border-box;"></select>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editDataPropCancel">Cancel</button>
          <button type="button" id="editDataPropConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="addAnnotationPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add annotation property</h3>
        <label style="display: block; margin-top: 8px;">Label: <input type="text" id="addAnnotationPropLabel" placeholder="e.g. isVisible" /></label>
        <label style="display: flex; align-items: center; margin-top: 10px; gap: 6px;">
          <input type="checkbox" id="addAnnotationPropIsBoolean" /> 
          <span>Boolean property (rdfs:range xsd:boolean)</span>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="addAnnotationPropCancel">Cancel</button>
          <button type="button" id="addAnnotationPropConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="editAnnotationPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit annotation property</h3>
        <p id="editAnnotationPropName" style="font-size: 11px; color: #666; margin-bottom: 8px;"></p>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="editAnnotationPropLabel" placeholder="e.g. isVisible" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="editAnnotationPropComment" rows="2" placeholder="Optional" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <label style="display: flex; align-items: center; margin-top: 10px; gap: 6px;">
          <input type="checkbox" id="editAnnotationPropIsBoolean" /> 
          <span>Boolean property (rdfs:range xsd:boolean)</span>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editAnnotationPropCancel">Cancel</button>
          <button type="button" id="editAnnotationPropConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="editEdgeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit edge</h3>
        <label>Relationship: <select id="editEdgeType"></select></label>
        <div id="editEdgeComment" style="font-size: 11px; color: #666; margin-top: 4px; margin-bottom: 8px; line-height: 1.4; display: none;"></div>
        <label style="display: block; margin-top: 8px;">From: <select id="editEdgeFrom"></select></label>
        <label style="display: block; margin-top: 8px;">To: <select id="editEdgeTo"></select></label>
        <div id="editEdgeCardinalityWrap" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
          <strong style="font-size: 12px;">Cardinality</strong>
          <div style="display: flex; gap: 12px; margin-top: 6px; align-items: center; flex-wrap: wrap;">
            <label style="font-size: 11px;">Min: <input type="number" id="editEdgeMinCard" min="0" placeholder="0" style="width: 60px;"></label>
            <label style="font-size: 11px;">Max: <input type="number" id="editEdgeMaxCard" min="0" placeholder="*" style="width: 60px;" title="Leave empty for unbounded"></label>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editEdgeCancel">Cancel</button>
          <button type="button" id="editEdgeConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="externalRefsModal" class="modal" style="display: none;">
      <div class="modal-content" style="min-width: 500px; max-width: 700px;">
        <h3>Manage External Ontology References</h3>
        <div id="externalRefsList" style="margin-top: 16px; margin-bottom: 16px; max-height: 400px; overflow-y: auto;">
          <!-- External references will be listed here -->
        </div>
        <div style="margin-top: 16px; padding: 12px; background: #f9f9f9; border-radius: 4px;">
          <strong style="font-size: 12px;">Add External Ontology</strong>
          <div style="margin-top: 8px; display: flex; gap: 8px; align-items: flex-start;">
            <input type="text" id="addExternalRefUrl" placeholder="Ontology URL (e.g., http://purl.org/dc/elements/1.1/)" style="flex: 1; padding: 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px;">
            <button type="button" id="addExternalRefBtn" style="padding: 6px 12px; font-size: 12px;">Add</button>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="externalRefsCancel">Close</button>
        </div>
      </div>
    </div>
  `;
}

async function loadTtlAndRender(
  ttlString: string,
  fileName?: string,
  handle?: FileSystemFileHandle | null,
  pathHint?: string
): Promise<void> {
  const errorMsg = document.getElementById('errorMsg') as HTMLElement;
  const vizControls = document.getElementById('vizControls') as HTMLElement;
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';

  try {
    const { graphData, store, annotationProperties: annotationProps, objectProperties: objectProps, dataProperties: dataProps } = await parseTtlToGraph(ttlString);
    rawData = graphData;
    annotationProperties = annotationProps;
    objectProperties = objectProps;
    dataProperties = dataProps;
    ttlStore = store;
    loadedFileName = fileName ?? null;
    loadedFilePath = pathHint ?? fileName ?? null;
    fileHandle = handle ?? null;
    hasUnsavedChanges = false;
    clearUndoRedo();
    updateFilePathDisplay();
    if (handle && fileName) {
      saveLastFileToIndexedDB(handle, fileName, pathHint ?? fileName).catch(() => {});
      updateLoadLastOpenedButton(fileName, pathHint ?? fileName);
    }
    updateSaveButtonVisibility();

    vizControls.style.display = 'contents';
    const displayConfigGroup = document.getElementById('displayConfigGroup');
    if (displayConfigGroup) displayConfigGroup.style.display = 'inline-flex';
    const externalRefsGroup = document.getElementById('externalRefsGroup');
    if (externalRefsGroup) externalRefsGroup.style.display = 'inline-flex';
    
    // Load external references
    externalOntologyReferences = await loadExternalRefsFromIndexedDB();
    
    // Pre-fetch and cache external ontology classes (await to ensure they're loaded before search)
    if (externalOntologyReferences.length > 0) {
      try {
        await preloadExternalOntologyClasses(externalOntologyReferences);
      } catch (err) {
        console.error('Failed to pre-load external ontologies:', err);
      }
    }

    const edgeStylesContent = document.getElementById('edgeStylesContent')!;
    const annotationPropsContent = document.getElementById('annotationPropsContent');
    initEdgeStylesMenu(edgeStylesContent, applyFilter);
    const dataPropsContent = document.getElementById('dataPropsContent');
    if (dataPropsContent) initDataPropsMenu(dataPropsContent);
    if (annotationPropsContent) initAnnotationPropsMenu(annotationPropsContent, applyFilter);
    initAddRelationshipTypeHandlers(edgeStylesContent);
    initAddDataPropertyHandlers(dataPropsContent ?? undefined);
    initAddAnnotationPropertyHandlers(annotationPropsContent ?? undefined);

    let savedViewState: { scale: number; position: { x: number; y: number } } | null = null;
    const displayConfig = await loadDisplayConfigFromIndexedDB();
    if (displayConfig) {
      applyDisplayConfig(displayConfig);
      if (displayConfig.viewState) savedViewState = displayConfig.viewState;
    }

    // Allow layout to settle after vizControls appears, then render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        applyFilter();
        if (network && savedViewState) {
          network.moveTo({
            scale: savedViewState.scale,
            position: savedViewState.position,
            animation: false,
          });
        }
      });
    });
  } catch (err) {
    errorMsg.textContent = `Parse error: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}

function applyFilter(preserveView = false): void {
  if (rawData.nodes.length === 0) return;

  let savedScale: number | null = null;
  let savedPosition: { x: number; y: number } | null = null;
  if (preserveView && network) {
    savedScale = network.getScale();
    savedPosition = network.getViewPosition();
  }

  const layoutMode = (document.getElementById('layoutMode') as HTMLSelectElement)
    .value;
  const wrapChars =
    parseInt(
      (document.getElementById('wrapChars') as HTMLInputElement).value,
      10
    ) || 10;
  const minFontSize =
    parseInt(
      (document.getElementById('minFontSize') as HTMLInputElement).value,
      10
    ) || 20;
  const maxFontSize =
    parseInt(
      (document.getElementById('maxFontSize') as HTMLInputElement).value,
      10
    ) || 80;
  const relationshipFontSize =
    parseInt(
      (document.getElementById('relationshipFontSize') as HTMLInputElement).value,
      10
    ) || 18;
  const searchEl = document.getElementById('searchQuery') as HTMLInputElement;
  const neighborsEl = document.getElementById(
    'searchIncludeNeighbors'
  ) as HTMLInputElement;
  const edgeStylesContent = document.getElementById('edgeStylesContent')!;

  const annotationPropsContent = document.getElementById('annotationPropsContent');
  const currentFilter = {
    wrapChars,
    minFontSize,
    maxFontSize,
    relationshipFontSize,
    searchQuery: searchEl?.value ?? '',
    includeNeighbors: neighborsEl?.checked ?? true,
    edgeStyleConfig: getEdgeStyleConfig(edgeStylesContent),
    annotationStyleConfig: getAnnotationStyleConfig(annotationPropsContent),
    layoutMode,
  };

  const data = buildNetworkData(currentFilter);
  const options = getNetworkOptions(layoutMode);

  scheduleDisplayConfigSave();

  const manipulationOptions = {
    enabled: true,
    initiallyActive: true,
    addNode: (
      nodeData: { x?: number; y?: number },
      callback: (data: { id: string; label: string; x?: number; y?: number } | null) => void
    ) => {
      if (addNodeModalShowing) {
        callback(null);
        return;
      }
      const x = nodeData.x ?? 0;
      const y = nodeData.y ?? 0;
      showAddNodeModal(x, y);
      callback(null);
    },
    addEdge: (
      edgeData: { from: string; to: string },
      callback: (data: { from: string; to: string; id?: string } | null) => void
    ) => {
      const from = String(edgeData.from);
      const to = String(edgeData.to);
      if (from === to || !ttlStore) {
        callback(null);
        return;
      }
      showAddEdgeModal(from, to, callback);
    },
    editNode: false,
    editEdge: {
      editWithoutDrag: (
        edgeData: { id?: string; from: string; to: string },
        callback: (data: { from: string; to: string } | null) => void
      ) => {
        const edgeId = edgeData.id ?? '';
        const match = edgeId.match(/^(.+)->(.+):(.+)$/);
        if (!match || !ttlStore) {
          callback(null);
          return;
        }
        const [, from, to, type] = match;
        pendingEditEdgeCallback = callback;
        showEditEdgeModal(from, to, type);
      },
    },
    deleteNode: false,
    deleteEdge: false,
  };

  const networkContainer = document.getElementById('network')!;
  if (network) {
    network.setData(data);
    network.setOptions({
      ...options,
      manipulation: manipulationOptions,
      width: '100%',
      height: '100%',
    });
    const w = networkContainer.clientWidth;
    const h = networkContainer.clientHeight;
    if (w > 0 && h > 0) network.setSize(`${w}px`, `${h}px`);
    if (preserveView && savedScale !== null && savedPosition !== null) {
      requestAnimationFrame(() => {
        network?.moveTo({
          position: savedPosition!,
          scale: savedScale!,
          animation: false,
        });
      });
    } else if (layoutMode === 'force') {
      network.once('stabilizationIterationsDone', () => network!.fit());
    } else if (layoutMode === 'weighted') {
      setTimeout(() => network!.fit({ padding: 20 }), 100);
    }
  } else {
    const opts = {
      ...options,
      manipulation: manipulationOptions,
      width: '100%',
      height: '100%',
    };
    network = new Network(networkContainer, data, opts);
    if (layoutMode === 'force') {
      network.once('stabilizationIterationsDone', () => network!.fit());
    } else if (layoutMode === 'weighted') {
      setTimeout(() => network!.fit({ padding: 20 }), 100);
    }
    // Resize network when container size changes (e.g. flex layout settling)
    const resizeNetwork = () => {
      if (network && networkContainer) {
        const w = networkContainer.clientWidth;
        const h = networkContainer.clientHeight;
        if (w > 0 && h > 0) {
          network.setSize(`${w}px`, `${h}px`);
          network.redraw();
        }
      }
    };
    const ro = new ResizeObserver(resizeNetwork);
    ro.observe(networkContainer);
    resizeNetwork(); // Initial size
    setupNetworkSelectionAndNavigation(network, networkContainer);
    network.on('click', () => {
      if (network) updateSelectionInfoDisplay(network);
    });
    network.on('dragEnd', () => {
      if (!network) return;
      const positions = network.getPositions();
      Object.entries(positions).forEach(([id, pos]) => {
        const node = rawData.nodes.find((n) => n.id === id);
        if (node && pos) {
          node.x = pos.x;
          node.y = pos.y;
        }
      });
      scheduleDisplayConfigSave();
    });
    network.on('doubleClick', (params: { nodes: string[]; edges: string[] }) => {
      if (!network) return;
      if (!params.nodes.length) return;
      const clickedNodeId = params.nodes[0] as string;
      // Check if this is a data property node
      if (clickedNodeId.startsWith('__dataprop__')) {
        const match = clickedNodeId.match(/^__dataprop__(.+)__(.+)$/);
        if (match) {
          const [, classId] = match;
          showEditEdgeModal(clickedNodeId, classId, 'dataprop');
          return;
        }
      }
      const selectedIds = network.getSelectedNodes().map(String);
      if (selectedIds.length > 1 && selectedIds.includes(clickedNodeId)) {
        showMultiEditModal(selectedIds);
      } else {
        const node = rawData.nodes.find((n) => n.id === clickedNodeId);
        if (node) showRenameModal(clickedNodeId, node.label, node.labellableRoot);
      }
    });
  }

  (
    document.getElementById('nodeCount')!
  ).textContent = String(data.nodes.length);
  (document.getElementById('edgeCount')!).textContent = String(
    data.edges.length
  );

  scheduleDisplayConfigSave();
}

function renderExternalRefsList(): void {
  const listEl = document.getElementById('externalRefsList');
  if (!listEl) return;
  
  if (externalOntologyReferences.length === 0) {
    listEl.innerHTML = '<p style="font-size: 12px; color: #666; text-align: center; padding: 20px;">No external ontology references added yet.</p>';
    return;
  }
  
  listEl.innerHTML = externalOntologyReferences.map((ref, index) => {
    const urlDisplay = ref.url.length > 60 ? ref.url.substring(0, 60) + '...' : ref.url;
    return `
      <div style="display: flex; align-items: center; gap: 12px; padding: 10px; margin-bottom: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">
        <div style="flex: 1;">
          <a href="${ref.url}" target="_blank" rel="noopener noreferrer" style="font-size: 12px; color: #3498db; text-decoration: none; word-break: break-all;" title="${ref.url}">${urlDisplay}</a>
          <div style="margin-top: 6px; display: flex; align-items: center; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 4px; font-size: 11px; cursor: pointer;">
              <input type="checkbox" class="external-ref-use-prefix" data-index="${index}" ${ref.usePrefix ? 'checked' : ''}>
              Use prefix
            </label>
            ${ref.usePrefix ? `
              <input type="text" class="external-ref-prefix" data-index="${index}" value="${ref.prefix || ''}" placeholder="prefix name" style="padding: 4px 6px; font-size: 11px; width: 100px; border: 1px solid #ccc; border-radius: 4px;">
            ` : ''}
          </div>
        </div>
        <button type="button" class="external-ref-delete" data-index="${index}" style="padding: 4px 8px; font-size: 11px; color: #c0392b; background: none; border: 1px solid #c0392b; border-radius: 4px; cursor: pointer;">Delete</button>
      </div>
    `;
  }).join('');
  
  // Add event listeners
  listEl.querySelectorAll('.external-ref-use-prefix').forEach((cb) => {
    (cb as HTMLElement).addEventListener('change', ((e: Event) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0', 10);
      externalOntologyReferences[index].usePrefix = (e.target as HTMLInputElement).checked;
      renderExternalRefsList();
      saveExternalRefsToIndexedDB(externalOntologyReferences).catch(() => {});
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    }) as EventListener);
  });
  
  listEl.querySelectorAll('.external-ref-prefix').forEach((input) => {
    (input as HTMLElement).addEventListener('change', ((e: Event) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0', 10);
      externalOntologyReferences[index].prefix = (e.target as HTMLInputElement).value.trim() || undefined;
      saveExternalRefsToIndexedDB(externalOntologyReferences).catch(() => {});
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    }) as EventListener);
  });
  
  listEl.querySelectorAll('.external-ref-delete').forEach((btn) => {
    (btn as HTMLElement).addEventListener('click', ((e: Event) => {
      const index = parseInt((e.target as HTMLElement).dataset.index || '0', 10);
      externalOntologyReferences.splice(index, 1);
      renderExternalRefsList();
      saveExternalRefsToIndexedDB(externalOntologyReferences).catch(() => {});
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    }) as EventListener);
  });
}

function showExternalRefsModal(): void {
  const modal = document.getElementById('externalRefsModal');
  if (!modal) return;
  renderExternalRefsList();
  modal.style.display = 'flex';
}

function hideExternalRefsModal(): void {
  const modal = document.getElementById('externalRefsModal');
  if (modal) modal.style.display = 'none';
}

function setupEventListeners(): void {
  const selectFile = document.getElementById('selectFile');
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;

  const loadLastOpened = document.getElementById('loadLastOpened');
  loadLastOpened?.addEventListener('click', async () => {
    if (loadLastOpened.dataset.hasLast !== '1') return;
    const stored = await getLastFileFromIndexedDB();
    if (!stored) {
      updateLoadLastOpenedButton(null);
      return;
    }
    try {
      const perm = await stored.handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const requested = await stored.handle.requestPermission({ mode: 'readwrite' });
        if (requested !== 'granted') {
          const errorMsg = document.getElementById('errorMsg') as HTMLElement;
          errorMsg.textContent = 'Permission to access file was denied.';
          errorMsg.style.display = 'block';
          return;
        }
      }
      const file = await stored.handle.getFile();
      const ttl = await file.text();
      const pathHint = (file as File & { path?: string }).path ?? stored.pathHint ?? file.name;
      await loadTtlAndRender(ttl, file.name, stored.handle, pathHint);
    } catch (err) {
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to load file: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
  });

  selectFile?.addEventListener('click', async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as Window & { showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]> })
          .showOpenFilePicker({
            types: [{ accept: { 'text/turtle': ['.ttl', '.turtle'] } }],
            mode: 'readwrite',
          });
        const file = await handle.getFile();
        const ttl = await file.text();
        const pathHint = (file as File & { path?: string }).path ?? file.name;
        await loadTtlAndRender(ttl, file.name, handle, pathHint);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const errorMsg = document.getElementById('errorMsg') as HTMLElement;
          errorMsg.textContent = `Failed to open file: ${err instanceof Error ? err.message : String(err)}`;
          errorMsg.style.display = 'block';
        }
      }
    } else {
      fileInput?.click();
    }
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const ttl = await file.text();
      await loadTtlAndRender(ttl, file.name, null);
    } catch (err) {
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to read file: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
    fileInput.value = '';
  });

  document.getElementById('layoutMode')?.addEventListener('change', applyFilter);

  document.getElementById('manageExternalRefs')?.addEventListener('click', showExternalRefsModal);
  document.getElementById('externalRefsCancel')?.addEventListener('click', hideExternalRefsModal);
  document.getElementById('externalRefsModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'externalRefsModal') hideExternalRefsModal();
  });
  document.getElementById('addExternalRefBtn')?.addEventListener('click', async () => {
    const urlInput = document.getElementById('addExternalRefUrl') as HTMLInputElement;
    const addBtn = document.getElementById('addExternalRefBtn') as HTMLButtonElement;
    const url = urlInput?.value.trim();
    if (!url) return;
    
    // Validate URL format
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      alert('Please enter a valid URL');
      return;
    }
    
    // Check if already exists
    if (externalOntologyReferences.some((ref) => ref.url === url)) {
      alert('This ontology is already in the list');
      return;
    }
    
    // Disable button and show loading state
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = 'Validating...';
    }
    
    try {
      // Fetch the URL to validate it's an ontology
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/turtle, application/rdf+xml, application/n-triples, text/n3, */*',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Read the response body once (can only be read once)
      const text = await response.text();
      
      const contentType = response.headers.get('content-type') || '';
      const isRdfContent = contentType.includes('turtle') || 
                          contentType.includes('rdf+xml') || 
                          contentType.includes('n-triples') ||
                          contentType.includes('n3') ||
                          url.endsWith('.ttl') ||
                          url.endsWith('.rdf') ||
                          url.endsWith('.owl') ||
                          url.endsWith('.nt') ||
                          url.endsWith('.n3');
      
      if (!isRdfContent) {
        // Check if it looks like RDF/Turtle
        const looksLikeRdf = /@prefix|@base|rdf:type|owl:|rdfs:|<http|https:\/\/[^>]+>/i.test(text);
        if (!looksLikeRdf) {
          throw new Error('The URL does not appear to be an ontology. It should return RDF/Turtle content.');
        }
      }
      
      // Parse the ontology to find preferred namespace prefix
      let preferredPrefix: string | undefined;
      let usePrefix = true; // Default to true - user can uncheck if they want full IRIs
      
      // Try to parse as Turtle
      try {
        const { Parser } = await import('n3');
        const parser = new Parser({ format: 'text/turtle' });
        const quads = [...parser.parse(text)];
        
        // Look for vann:preferredNamespacePrefix
        const VANN_NS = 'http://purl.org/vocab/vann/';
        const VANN_PREFERRED_PREFIX = VANN_NS + 'preferredNamespacePrefix';
        
        for (const quad of quads) {
          const pred = quad.predicate as { value?: string };
          if (pred.value === VANN_PREFERRED_PREFIX) {
            const obj = quad.object as { value?: string };
            const prefixValue = obj.value;
            if (prefixValue && typeof prefixValue === 'string') {
              preferredPrefix = prefixValue.trim();
              usePrefix = true;
              break;
            }
          }
        }
      } catch (parseError) {
        // If parsing fails, try regex as fallback
        const prefixMatch = text.match(/vann:preferredNamespacePrefix\s+"([^"]+)"/i) ||
                           text.match(/<http:\/\/purl\.org\/vocab\/vann\/preferredNamespacePrefix>\s+"([^"]+)"/i);
        if (prefixMatch && prefixMatch[1]) {
          preferredPrefix = prefixMatch[1].trim();
          usePrefix = true;
        }
      }
      
      // If no preferred prefix found, extract suggestion from URL
      if (!preferredPrefix) {
        const pathParts = urlObj.pathname.split('/').filter((p) => p);
        if (pathParts.length > 0) {
          const lastPart = pathParts[pathParts.length - 1];
          if (lastPart && /^[a-z]/.test(lastPart)) {
            preferredPrefix = lastPart.replace(/[^a-z0-9]/gi, '');
          }
        }
        if (!preferredPrefix && urlObj.hostname) {
          const hostParts = urlObj.hostname.split('.');
          if (hostParts.length > 0) {
            preferredPrefix = hostParts[0].replace(/[^a-z0-9]/gi, '');
          }
        }
      }
      
      const newRef = {
        url,
        usePrefix,
        prefix: preferredPrefix,
      };
      externalOntologyReferences.push(newRef);
      
      urlInput.value = '';
      renderExternalRefsList();
      await saveExternalRefsToIndexedDB(externalOntologyReferences);
      
      // Pre-fetch the newly added ontology
      try {
        await preloadExternalOntologyClasses([newRef]);
      } catch (err) {
        console.warn(`Failed to pre-load newly added ontology ${newRef.url}:`, err);
      }
      
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    } catch (error) {
      alert(`Failed to validate ontology: ${error instanceof Error ? error.message : String(error)}\n\nPlease ensure the URL points to a valid ontology file (Turtle/RDF format).`);
    } finally {
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add';
      }
    }
  });
  document.getElementById('addExternalRefUrl')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      (document.getElementById('addExternalRefBtn') as HTMLButtonElement)?.click();
    }
  });

  const textDisplayToggle = document.getElementById('textDisplayToggle');
  const textDisplayPopup = document.getElementById('textDisplayPopup');
  const textDisplayWrap = document.getElementById('textDisplayWrap');
  textDisplayToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = textDisplayPopup?.style.display === 'block';
    if (textDisplayPopup) textDisplayPopup.style.display = isVisible ? 'none' : 'block';
  });
  document.addEventListener('click', (e) => {
    if (textDisplayPopup?.style.display === 'block' && textDisplayWrap && !textDisplayWrap.contains(e.target as Node)) {
      textDisplayPopup.style.display = 'none';
    }
  });

  document.getElementById('wrapChars')?.addEventListener('input', applyFilter);
  document.getElementById('wrapChars')?.addEventListener('change', applyFilter);
  document.getElementById('minFontSize')?.addEventListener('input', applyFilter);
  document.getElementById('minFontSize')?.addEventListener('change', applyFilter);
  document.getElementById('maxFontSize')?.addEventListener('input', applyFilter);
  document.getElementById('maxFontSize')?.addEventListener('change', applyFilter);
  document.getElementById('relationshipFontSize')?.addEventListener('input', applyFilter);
  document.getElementById('relationshipFontSize')?.addEventListener('change', applyFilter);
  document
    .getElementById('searchIncludeNeighbors')
    ?.addEventListener('change', applyFilter);
  document.getElementById('undoBtn')?.addEventListener('click', performUndo);
  document.getElementById('redoBtn')?.addEventListener('click', performRedo);
  document.getElementById('editEdgeCancel')?.addEventListener('click', hideEditEdgeModal);
  document.getElementById('editEdgeConfirm')?.addEventListener('click', confirmEditEdge);
  document.getElementById('editEdgeType')?.addEventListener('change', () => {
    const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
    const cardWrap = document.getElementById('editEdgeCardinalityWrap');
    if (cardWrap) cardWrap.style.display = typeSel.value !== 'subClassOf' && getPropertyHasCardinality(typeSel.value) ? 'block' : 'none';
    updateEditEdgeCommentDisplay();
  });
  document.getElementById('editEdgeModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'editEdgeModal') hideEditEdgeModal();
  });
  document.getElementById('editEdgeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#editEdgeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') confirmEditEdge();
      else hideEditEdgeModal();
      e.preventDefault();
    }
  });
  document.getElementById('resetView')?.addEventListener('click', () => {
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'weighted';
    (document.getElementById('wrapChars') as HTMLInputElement).value = '10';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = '80';
    (document.getElementById('relationshipFontSize') as HTMLInputElement).value = '18';
    (document.getElementById('searchQuery') as HTMLInputElement).value = '';
    (document.getElementById('searchIncludeNeighbors') as HTMLInputElement).checked = true;
    document.getElementById('searchAutocomplete')?.classList.remove('visible');
    textDisplayPopup && (textDisplayPopup.style.display = 'none');
    document.querySelectorAll('.edge-show-cb').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.edge-label-cb').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    getAllRelationshipTypes().forEach((type) => {
      const colorEl = document.querySelector(`.edge-color-picker[data-type="${type}"]`) as HTMLInputElement;
      if (colorEl) colorEl.value = getDefaultEdgeColors()[type] ?? getDefaultColor();
      const lineTypeEl = document.querySelector(`.edge-linetype[data-type="${type}"]`) as HTMLInputElement;
      if (lineTypeEl) {
        lineTypeEl.value = 'solid';
        const dropdown = lineTypeEl.closest('.ap-linetype-dropdown');
        const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
        const opt = BORDER_LINE_OPTIONS.find((o) => o.value === 'solid');
        if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
      }
    });
    updateEdgeColorsLegend();
    document.querySelectorAll('.ap-bool-show').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.ap-bool-fill[data-val="true"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenTrue.fill));
    document.querySelectorAll('.ap-bool-border[data-val="true"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenTrue.border));
    document.querySelectorAll('.ap-bool-linetype[data-val="true"]').forEach((el) => {
      (el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenTrue.lineType;
      const dropdown = (el as HTMLElement).closest('.ap-linetype-dropdown');
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      const opt = BORDER_LINE_OPTIONS.find((o) => o.value === DEFAULT_BOOL_COLORS.whenTrue.lineType);
      if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
    });
    document.querySelectorAll('.ap-bool-fill[data-val="false"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenFalse.fill));
    document.querySelectorAll('.ap-bool-border[data-val="false"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenFalse.border));
    document.querySelectorAll('.ap-bool-linetype[data-val="false"]').forEach((el) => {
      (el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenFalse.lineType;
      const dropdown = (el as HTMLElement).closest('.ap-linetype-dropdown');
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      const opt = BORDER_LINE_OPTIONS.find((o) => o.value === DEFAULT_BOOL_COLORS.whenFalse.lineType);
      if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
    });
    document.querySelectorAll('.ap-bool-show[data-val="undefined"]').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.ap-bool-fill[data-val="undefined"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenUndefined.fill));
    document.querySelectorAll('.ap-bool-border[data-val="undefined"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenUndefined.border));
    document.querySelectorAll('.ap-bool-linetype[data-val="undefined"]').forEach((el) => {
      (el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenUndefined.lineType;
      const dropdown = (el as HTMLElement).closest('.ap-linetype-dropdown');
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      const opt = BORDER_LINE_OPTIONS.find((o) => o.value === DEFAULT_BOOL_COLORS.whenUndefined.lineType);
      if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
    });
    document.querySelectorAll('.ap-text-rules').forEach((rulesDiv) => {
      const divs = rulesDiv.querySelectorAll(':scope > div');
      divs.forEach((d, i) => {
        if (i > 0) d.remove();
        else {
          (d.querySelector('.ap-regex') as HTMLInputElement).value = '';
          (d.querySelector('.ap-regex-fill') as HTMLInputElement).value = DEFAULT_TEXT_COLOR.fill;
          (d.querySelector('.ap-regex-border') as HTMLInputElement).value = DEFAULT_TEXT_COLOR.border;
          const linetypeInput = d.querySelector('.ap-regex-linetype') as HTMLInputElement;
          if (linetypeInput) {
            linetypeInput.value = 'solid';
            const dropdown = linetypeInput.closest('.ap-linetype-dropdown');
            const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
            if (trigger) trigger.innerHTML = `${renderLineTypeSvg('')}<span style="margin-left: 4px;">▾</span>`;
          }
        }
      });
    });
    applyFilter();
    network?.fit();
  });
  document.getElementById('saveChanges')?.addEventListener('click', saveTtl);

  document.getElementById('saveDisplayConfig')?.addEventListener('click', async () => {
    if (rawData.nodes.length === 0) return;
    if (network) {
      const positions = network.getPositions();
      Object.entries(positions).forEach(([id, pos]) => {
        const node = rawData.nodes.find((n) => n.id === id);
        if (node && pos) {
          node.x = pos.x;
          node.y = pos.y;
        }
      });
    }
    const config = collectDisplayConfig();
    if (!config) return;
    const baseName = (loadedFileName || loadedFilePath || 'ontology').replace(/\.(ttl|turtle)$/i, '');
    const suggestedName = `${baseName}.display.json`;
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as Window & { showSaveFilePicker: (o?: { suggestedName?: string; types?: object[] }) => Promise<FileSystemFileHandle> })
          .showSaveFilePicker({ suggestedName, types: [{ accept: { 'application/json': ['.json'] } }] });
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }));
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errorMsg = document.getElementById('errorMsg') as HTMLElement;
        errorMsg.textContent = `Failed to save display config: ${err instanceof Error ? err.message : String(err)}`;
        errorMsg.style.display = 'block';
      }
    }
  });

  const loadDisplayConfigInput = document.createElement('input');
  loadDisplayConfigInput.type = 'file';
  loadDisplayConfigInput.accept = '.json,application/json';
  loadDisplayConfigInput.style.display = 'none';
  document.body.appendChild(loadDisplayConfigInput);
  loadDisplayConfigInput.addEventListener('change', async () => {
    const file = loadDisplayConfigInput.files?.[0];
    loadDisplayConfigInput.value = '';
    if (!file || rawData.nodes.length === 0) return;
    try {
      const text = await file.text();
      const config = JSON.parse(text) as DisplayConfig;
      if (!config || typeof config !== 'object') throw new Error('Invalid config format');
      applyDisplayConfig(config);
      applyFilter();
      if (network && config.viewState) {
        network.moveTo({
          scale: config.viewState.scale,
          position: config.viewState.position,
          animation: false,
        });
      }
      saveDisplayConfigToIndexedDB(config).catch(() => {});
    } catch (err) {
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to load display config: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
  });

  document.getElementById('loadDisplayConfig')?.addEventListener('click', async () => {
    if (rawData.nodes.length === 0) return;
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as Window & { showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]> })
          .showOpenFilePicker({ types: [{ accept: { 'application/json': ['.json'] } }] });
        const file = await handle.getFile();
        const text = await file.text();
        const config = JSON.parse(text) as DisplayConfig;
        if (!config || typeof config !== 'object') throw new Error('Invalid config format');
        applyDisplayConfig(config);
        applyFilter();
        if (network && config.viewState) {
          network.moveTo({
            scale: config.viewState.scale,
            position: config.viewState.position,
            animation: false,
          });
        }
        saveDisplayConfigToIndexedDB(config).catch(() => {});
      } else {
        loadDisplayConfigInput.click();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errorMsg = document.getElementById('errorMsg') as HTMLElement;
        errorMsg.textContent = `Failed to load display config: ${err instanceof Error ? err.message : String(err)}`;
        errorMsg.style.display = 'block';
      }
    }
  });

  const redrawNetworkOnMenuToggle = (): void => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (network) {
          const nc = document.getElementById('network');
          if (nc) {
            const w = nc.clientWidth;
            const h = nc.clientHeight;
            if (w > 0 && h > 0) {
              network.setSize(`${w}px`, `${h}px`);
              network.redraw();
            }
          }
        }
      }, 50);
    });
  };
  document.getElementById('annotationPropsMenu')?.addEventListener('toggle', redrawNetworkOnMenuToggle);
  document.getElementById('edgeStylesMenu')?.addEventListener('toggle', redrawNetworkOnMenuToggle);

  document.getElementById('renameCancel')?.addEventListener('click', hideRenameModal);
  document.getElementById('renameConfirm')?.addEventListener('click', confirmRename);
  document.getElementById('renameDataPropAdd')?.addEventListener('click', () => {
    const modal = document.getElementById('renameModal')!;
    if (modal.dataset.mode !== 'single') return;
    const selectEl = document.getElementById('renameDataPropSelect') as HTMLSelectElement;
    const minEl = document.getElementById('renameDataPropMin') as HTMLInputElement;
    const maxEl = document.getElementById('renameDataPropMax') as HTMLInputElement;
    const propName = selectEl?.value?.trim();
    if (!propName) return;
    const min = minEl?.value?.trim();
    const max = maxEl?.value?.trim();
    const minCardinality = min === '' ? undefined : parseInt(min, 10);
    const maxCardinality = max === '' ? undefined : parseInt(max, 10);
    if (min !== '' && (Number.isNaN(minCardinality!) || minCardinality! < 0)) return;
    if (max !== '' && (Number.isNaN(maxCardinality!) || maxCardinality! < 0)) return;
    renameModalDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    renderRenameModalDataPropsList();
    if (minEl) minEl.value = '';
    if (maxEl) maxEl.value = '';
  });
  document.getElementById('renameDataPropSelect')?.addEventListener('change', () => {
    updateRenameDataPropAddButtonState();
  });
  document.getElementById('renameModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#renameModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') confirmRename();
      else hideRenameModal();
      e.preventDefault();
    }
  });
  document.getElementById('renameModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'renameModal') hideRenameModal();
  });

  // Tab switching
  document.querySelectorAll('.add-node-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;
      if (!tabName) return;
      
      // Update tab styles
      document.querySelectorAll('.add-node-tab').forEach((t) => {
        (t as HTMLElement).classList.remove('active');
        (t as HTMLElement).style.borderBottomColor = 'transparent';
        (t as HTMLElement).style.fontWeight = 'normal';
        (t as HTMLElement).style.color = '#666';
      });
      (tab as HTMLElement).classList.add('active');
      (tab as HTMLElement).style.borderBottomColor = '#3498db';
      (tab as HTMLElement).style.fontWeight = 'bold';
      (tab as HTMLElement).style.color = '#000';
      
      // Show/hide tab content
      const customTabContent = document.getElementById('addNodeCustomTab');
      const externalTabContent = document.getElementById('addNodeExternalTabContent');
      if (tabName === 'custom') {
        if (customTabContent) customTabContent.style.display = 'block';
        if (externalTabContent) externalTabContent.style.display = 'none';
        const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
        if (customInput) customInput.focus();
      } else {
        if (customTabContent) customTabContent.style.display = 'none';
        if (externalTabContent) externalTabContent.style.display = 'block';
        const externalInput = document.getElementById('addNodeExternalInput') as HTMLInputElement;
        if (externalInput) externalInput.focus();
      }
      
      updateAddNodeOkButton();
    });
  });
  
  document.getElementById('addNodeInput')?.addEventListener('input', updateAddNodeOkButton);
  document.getElementById('addNodeExternalInput')?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.trim();
    
    // Clear previous timeout
    if (addNodeSearchTimeout) {
      clearTimeout(addNodeSearchTimeout);
    }
    
    // Debounce search
    addNodeSearchTimeout = setTimeout(() => {
      handleExternalClassSearch(query).catch((err) => {
        console.error('Search error:', err);
      });
    }, 300);
    
    updateAddNodeOkButton();
  });
  
  document.getElementById('addNodeCancel')?.addEventListener('click', hideAddNodeModal);
  document.getElementById('addNodeConfirm')?.addEventListener('click', confirmAddNode);
  document.getElementById('addNodeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#addNodeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') {
        const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
        if (okBtn && !okBtn.disabled) confirmAddNode();
      } else {
        hideAddNodeModal();
      }
      e.preventDefault();
    }
  });
  document.getElementById('addNodeModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'addNodeModal') hideAddNodeModal();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('searchQuery') as HTMLInputElement;
        searchInput?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) performRedo();
        else performUndo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        performRedo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Run in capture phase so we handle Delete before search input (which would delete a character)
        const activeEl = document.activeElement as HTMLElement;
        if (activeEl?.id === 'searchQuery' && network?.getSelectedNodes().length) {
          activeEl.blur();
        }
        if (performDeleteSelection()) e.preventDefault();
      }
    },
    { capture: true }
  );

  const searchInput = document.getElementById('searchQuery');
  const searchList = document.getElementById('searchAutocomplete');
  if (searchInput && searchList) {
    let debounceTimer: number;
    searchInput.addEventListener('input', () => {
      applyFilter();
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(updateSearchAutocomplete, 150);
    });
    searchInput.addEventListener('focus', () => {
      if ((searchInput as HTMLInputElement).value.trim()) updateSearchAutocomplete();
    });
  }
}

function updateSearchAutocomplete(): void {
  const input = document.getElementById('searchQuery') as HTMLInputElement;
  const list = document.getElementById('searchAutocomplete')!;
  const query = (input?.value || '').trim();
  const q = query.toLowerCase();
  if (q.length < 1) {
    list.innerHTML = '';
    list.classList.remove('visible');
    return;
  }
  const seen = new Set<string>();
  const suggestions: { value: string; label: string; hint: string }[] = [];
  getEdgeTypes(rawData.edges).forEach((type) => {
    if (type.toLowerCase().includes(q) && !seen.has(type)) {
      seen.add(type);
      suggestions.push({ value: type, label: type, hint: 'relationship' });
    }
  });
  rawData.nodes.forEach((n) => {
    const label = (n.label || '').toLowerCase();
    const id = (n.id || '').toLowerCase();
    const val = n.label || n.id;
    if ((label.includes(q) || id.includes(q)) && !seen.has(val)) {
      seen.add(val);
      suggestions.push({ value: val, label: val, hint: 'node' });
    }
  });
  list.innerHTML = '';
  list.classList.remove('visible');
  list.dataset.highlight = '-1';
  suggestions.slice(0, 12).forEach((s) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.dataset.value = s.value;
    div.innerHTML = s.label + '<span class="hint">(' + s.hint + ')</span>';
    div.addEventListener('click', () => {
      input.value = s.value;
      list.classList.remove('visible');
      applyFilter();
    });
    list.appendChild(div);
  });
  list.classList.add('visible');
}

document.addEventListener('keydown', (e) => {
  const list = document.getElementById('searchAutocomplete');
  const input = document.getElementById('searchQuery');
  if (!list?.classList.contains('visible')) return;
  const items = list.querySelectorAll('.suggestion');
  let idx = parseInt(list.dataset.highlight || '-1', 10);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = Math.min(idx + 1, items.length - 1);
    list.dataset.highlight = String(idx);
    items.forEach((el, i) => el.classList.toggle('highlight', i === idx));
    if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = Math.max(idx - 1, -1);
    list.dataset.highlight = String(idx);
    items.forEach((el, i) => el.classList.toggle('highlight', i === idx));
  } else if (e.key === 'Enter' && idx >= 0 && items[idx]) {
    e.preventDefault();
    (input as HTMLInputElement).value = (items[idx] as HTMLElement).dataset
      .value!;
    list.classList.remove('visible');
    applyFilter();
  } else if (e.key === 'Escape') {
    list.classList.remove('visible');
  }
});

document.addEventListener('click', (e) => {
  const input = document.getElementById('searchQuery');
  const list = document.getElementById('searchAutocomplete');
  if (
    input &&
    list &&
    !input.contains(e.target as Node) &&
    !list.contains(e.target as Node)
  ) {
    list.classList.remove('visible');
  }
});

async function initLastOpened(): Promise<void> {
  const stored = await getLastFileFromIndexedDB();
  if (stored) {
    updateLoadLastOpenedButton(stored.name, stored.pathHint);
  } else {
    updateLoadLastOpenedButton(null);
  }
}

renderApp();
setupEventListeners();
initLastOpened().catch(() => {});

// Test hook for browser automation (e.g. Playwright). Exposes programmatic control for E2E tests.
(window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ = {
  selectNodeByLabel: (label: string): boolean => {
    const node = rawData.nodes.find((n) => (n.label || n.id) === label);
    if (node && network) {
      network.setSelection({ nodes: [node.id] });
      return true;
    }
    return false;
  },
  performDelete: (): boolean => performDeleteSelection(),
  performUndo: (): void => performUndo(),
  performRedo: (): void => performRedo(),
  getNodeIds: (): string[] => rawData.nodes.map((n) => n.id),
  getNodeCount: (): number => rawData.nodes.length,
  getUndoStackLength: (): number => undoStack.length,
  /** Visible node count from the UI (what's actually rendered). Use to verify display matches rawData. */
  getVisibleNodeCount: (): number =>
    parseInt(document.getElementById('nodeCount')?.textContent ?? '0', 10) || 0,
  /** Clear IndexedDB display config to test with fresh state. */
  clearDisplayConfig: async (): Promise<void> => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('OntologyEditorDisplay', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    const tx = db.transaction('config', 'readwrite');
    tx.objectStore('config').clear();
    db.close();
  },
};
