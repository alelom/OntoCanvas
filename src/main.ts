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
  updateObjectPropertyDomainRangeInStore,
  updateObjectPropertySubPropertyOfInStore,
  updateObjectPropertyIsDefinedByInStore,
  getMainOntologyBase,
  getClassNamespace,
  getObjectProperties,
  renameObjectPropertyInStore,
  renameDataPropertyInStore,
  BASE_IRI,
  addDataPropertyToStore,
  removeDataPropertyFromStore,
  updateDataPropertyLabelInStore,
  updateDataPropertyCommentInStore,
  updateDataPropertyRangeInStore,
  updateDataPropertyDomainsInStore,
  updateDataPropertyIsDefinedByInStore,
  getDataProperties,
  addDataPropertyRestrictionToClass,
  removeDataPropertyRestrictionFromClass,
  getDataPropertyRestrictionsForClass,
  addAnnotationPropertyToStore,
  updateAnnotationPropertyLabelInStore,
  updateAnnotationPropertyCommentInStore,
  updateAnnotationPropertyIsBooleanInStore,
  updateAnnotationPropertyRangeInStore,
  removeAnnotationPropertyFromStore,
  storeToTurtle,
  extractLocalName,
} from './parser';
import {
  getOrRequestImageDirectory,
  writeExampleImageFile,
  getSafeExampleImageFileName,
  openExampleImageUri,
  getCachedImageDirectory,
  clearCachedImageDirectory,
} from './lib/exampleImageFiles';
import { initExampleImagesSection } from './ui/exampleImagesSection';
import {
  isDuplicateIdentifierForRename,
  ADD_NODE_DUPLICATE_MESSAGE,
  applyNodeFormToStore,
  type NodeFormData,
} from './ui/nodeModalForm';
import * as nodeModalFormUi from './ui/nodeModalFormUi';
import { Store, DataFactory } from 'n3';
import {
  searchExternalClasses,
  searchExternalObjectProperties,
  preloadExternalOntologyClasses,
  type ExternalClassInfo,
  type ExternalObjectPropertyInfo,
} from './externalOntologySearch';
import type { GraphData, GraphEdge, GraphNode, DataPropertyRestriction, DataPropertyInfo, AnnotationPropertyInfo, ObjectPropertyInfo, BorderLineType } from './types';
import {
  type DisplayConfig,
  type ExternalOntologyReference,
  loadDisplayConfigFromIndexedDB,
  saveDisplayConfigToIndexedDB,
  deleteDisplayConfigFromIndexedDB,
  loadExternalRefsFromIndexedDB,
  saveExternalRefsToIndexedDB,
  getLastFileFromIndexedDB,
  saveLastFileToIndexedDB,
  getLastUrlFromIndexedDB,
  saveLastUrlToIndexedDB,
  DISPLAY_CONFIG_VERSION,
} from './storage';
import {
  wrapText,
  getEdgeTypes,
  getDefaultEdgeColors,
  getDefaultColor,
  getSpacing,
  computeNodeDepths,
  estimateNodeDimensions,
  resolveOverlaps,
  matchesSearch,
  COLORS,
  getLayoutAlgorithm,
} from './graph';
import {
  initStatusBar,
  updateStatusBar,
  updateNodeEdgeCounts,
  updateFilePathDisplay as updateStatusBarFilePath,
  updateSelectionInfo as updateStatusBarSelection,
} from './ui/statusBar';
import {
  initContextMenu,
  showContextMenu,
  updateContextMenuData,
} from './ui/contextMenu';
import {
  initOpenOntologyModal,
  showOpenOntologyModal,
  hideOpenOntologyModal,
} from './ui/openOntologyModal';
import { handleUrlParameterLoad } from './lib/urlParamLoader';
import {
  extractExternalRefsFromStore,
  extractPrefixesFromTtl,
  formatNodeLabelWithPrefix,
  formatRelationshipLabelWithPrefix,
  renderExternalRefsList,
  showExternalRefsModal,
  hideExternalRefsModal,
  type ExternalRefsModalCallbacks,
} from './ui/externalRefs';
import { getAppVersion } from './utils/version';
import {
  getAllRelationshipTypes,
  cleanupUnusedExternalProperties,
  getRelationshipLabel,
  getEdgeDisplayLabel,
  getRelationshipComment,
  getAllEdgeTypes,
  getPropertyHasCardinality,
  updateEditEdgeCommentDisplay,
  showRelationshipTooltip,
  hideRelationshipTooltip,
} from './ui/relationshipUtils';
import {
  hideRenameModal,
  hideAddNodeModal,
  hideEditEdgeModal,
  getCardinalityFromEditModal,
  showLoadingModal,
  hideLoadingModal,
} from './ui/modals';
import {
  BORDER_LINE_OPTIONS,
  borderLineTypeToVis,
  renderLineTypeSvg,
  renderLineTypeDropdown,
  renderEdgeLineTypeDropdown,
  getEdgeStyleConfig,
  updateEdgeColorsLegend,
} from './ui/edgeStyleUtils';
import { getNetworkOptions } from './ui/networkConfig';
import { fetchOntologyFromUrl } from './lib/ontologyUrlLoader';
import {
  labelToCamelCaseIdentifier,
  validateLabelForIdentifier,
  validateLabelForIdentifierWithUniqueness,
} from './lib/identifierFromLabel';
import { getDisplayBase } from './lib/displayBase';
import { updateAddRelTypeIdentifierAndValidation as updateAddRelTypeIdentifierAndValidationFromModal } from './ui/objectPropertyModal';
import { updateAddDataPropIdentifierAndValidation as updateAddDataPropIdentifierAndValidationFromModal } from './ui/dataPropertyModal';
import './style.css';

let externalOntologyReferences: ExternalOntologyReference[] = [];

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
    edgeStyleConfig: edgeStylesContent ? getEdgeStyleConfig(edgeStylesContent, rawData, objectProperties, externalOntologyReferences) : {},
    wrapChars: parseInt((document.getElementById('wrapChars') as HTMLInputElement)?.value, 10) || 10,
    minFontSize: parseInt((document.getElementById('minFontSize') as HTMLInputElement)?.value, 10) || 20,
    maxFontSize: parseInt((document.getElementById('maxFontSize') as HTMLInputElement)?.value, 10) || 80,
    relationshipFontSize: parseInt((document.getElementById('relationshipFontSize') as HTMLInputElement)?.value, 10) || 18,
    dataPropertyFontSize: parseInt((document.getElementById('dataPropertyFontSize') as HTMLInputElement)?.value, 10) || 18,
    layoutMode: (document.getElementById('layoutMode') as HTMLSelectElement)?.value || 'hierarchical01',
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
  (document.getElementById('dataPropertyFontSize') as HTMLInputElement).value = String(config.dataPropertyFontSize ?? 18);
  // Handle backward compatibility: 'weighted' maps to 'hierarchical01'
  const layoutMode = config.layoutMode ?? 'hierarchical01';
  const normalizedLayoutMode = layoutMode === 'weighted' ? 'hierarchical01' : layoutMode;
  (document.getElementById('layoutMode') as HTMLSelectElement).value = normalizedLayoutMode;
  (document.getElementById('searchQuery') as HTMLInputElement).value = config.searchQuery ?? '';
  (document.getElementById('searchIncludeNeighbors') as HTMLInputElement).checked = config.includeNeighbors ?? true;
  const edgeStyleConfig = config.edgeStyleConfig || {};
  if (document.getElementById('edgeStylesContent')) {
    const types = getAllRelationshipTypes(rawData, objectProperties);
    const defaultColors = getDefaultEdgeColors(types);
    Object.keys(edgeStyleConfig).forEach((type) => {
      const c = edgeStyleConfig[type];
      if (c) {
        const showCb = document.querySelector(`.edge-show-cb[data-type="${type}"]`) as HTMLInputElement | null;
        const labelCb = document.querySelector(`.edge-label-cb[data-type="${type}"]`) as HTMLInputElement | null;
        const colorEl = document.querySelector(`.edge-color-picker[data-type="${type}"]`) as HTMLInputElement | null;
        if (showCb) showCb.checked = c.show !== false;
        if (labelCb) labelCb.checked = c.showLabel !== false;
        if (colorEl) {
          // Use saved color if available, otherwise use default color for this type
          colorEl.value = c.color || defaultColors[type] || getDefaultColor();
        }
      }
    });
    // For types not in saved config, ensure they have default colors
    // This ensures that even if no saved config exists, all types get their spectrum colors
    types.forEach((type) => {
      if (!edgeStyleConfig[type]) {
        const escapedType = CSS.escape(type);
        const colorEl = document.querySelector(`.edge-color-picker[data-type="${escapedType}"]`) as HTMLInputElement | null;
        if (colorEl) {
          // Always set default color if not in saved config (override any existing value)
          const defaultColor = defaultColors[type] || getDefaultColor();
          colorEl.value = defaultColor;
        }
      }
    });
    updateEdgeColorsLegend(rawData, objectProperties, externalOntologyReferences);
  }
  // Annotation style config is stored but restoration is deferred (complex DOM structure)
}

let displayConfigSaveTimer: number | null = null;

function scheduleDisplayConfigSave(): void {
  if (displayConfigSaveTimer != null) window.clearTimeout(displayConfigSaveTimer);
  displayConfigSaveTimer = window.setTimeout(() => {
    displayConfigSaveTimer = null;
    const config = collectDisplayConfig();
    if (config) saveDisplayConfigToIndexedDB(config, loadedFilePath, loadedFileName).catch(() => {});
  }, 500);
}


// Removed updateLoadLastOpenedButton - now handled by openOntologyModal

let rawData: GraphData = { nodes: [], edges: [] };
let annotationProperties: AnnotationPropertyInfo[] = [];
let objectProperties: ObjectPropertyInfo[] = [];
let dataProperties: DataPropertyInfo[] = [];
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
/** Example image URIs while editing in rename modal (single-node mode). */
let renameModalExampleImageUris: string[] = [];
/** Example image URIs while adding a new node (custom tab). */
let addNodeExampleImageUris: string[] = [];
/** Data property restrictions while adding a new node (custom tab). */
let addNodeDataPropertyRestrictions: DataPropertyRestriction[] = [];

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
    // Edge ID format: "from->to:type"
    // But type can contain ":" (e.g., "https://w3id.org/dano#contains")
    // So we need to split on "->" first, then split the second part on ":" from the left (only the first ":")
    const arrowIndex = edgeId.indexOf('->');
    if (arrowIndex !== -1) {
      const from = edgeId.substring(0, arrowIndex);
      const afterArrow = edgeId.substring(arrowIndex + 2);
      const colonIndex = afterArrow.indexOf(':');
      if (colonIndex !== -1) {
        const to = afterArrow.substring(0, colonIndex);
        const type = afterArrow.substring(colonIndex + 1);
        // Check if this is a data property edge
        if (type === 'dataprop' || type === 'dataproprestrict') {
        // Handle both restriction nodes and generic property nodes
        let dpMatch = from.match(/^__dataproprestrict__(.+)__(.+)$/);
        if (!dpMatch) {
          dpMatch = from.match(/^__dataprop__(.+)__(.+)$/);
        }
        if (dpMatch) {
          const [, classId, propertyName] = dpMatch;
          // Only remove if it's actually a restriction (has restriction data)
          const classNode = rawData.nodes.find((n) => n.id === classId);
          if (classNode?.dataPropertyRestrictions?.some((r) => r.propertyName === propertyName)) {
          dataPropertyRestrictionsToRemove.push({ classId, propertyName });
          }
        }
        } else {
          edgesToRemove.push({ from, to, type });
        }
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
  // Clean up unused external properties and update edge styles menu
  objectProperties = cleanupUnusedExternalProperties(rawData, objectProperties);
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  if (edgeStylesContent) {
    initEdgeStylesMenu(edgeStylesContent, applyFilter);
  }
  applyFilter(true);
  network.unselectAll();
  return true;
}
const SPACING = getSpacing();

// Relationship utility functions moved to ui/relationshipUtils.ts

let editRelationshipTypeHandlersInitialized = false;

function setupClassSelector(inputId: string, resultsId: string): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const resultsDiv = document.getElementById(resultsId) as HTMLElement;
  if (!input || !resultsDiv) return;
  let blurTimer: number | null = null;
  const showResults = (query: string) => {
    const q = (query || '').toLowerCase().trim();
    const nodes = rawData.nodes.slice();
    const filtered = q
      ? nodes.filter((n) => n.id.toLowerCase().includes(q) || (n.label && n.label.toLowerCase().includes(q)))
      : nodes;
    const limit = 50;
    resultsDiv.innerHTML = '';
    filtered.slice(0, limit).forEach((n) => {
      const div = document.createElement('div');
      div.className = 'rel-type-class-option';
      div.dataset.id = n.id;
      div.textContent = n.label || n.id;
      div.style.cssText = 'padding: 6px 8px; cursor: pointer; font-size: 12px; font-family: Consolas, monospace; border-bottom: 1px solid #eee;';
      resultsDiv.appendChild(div);
    });
    resultsDiv.style.display = filtered.length > 0 ? 'block' : 'none';
  };
  const hideResults = () => {
    resultsDiv.style.display = 'none';
  };
  input.addEventListener('focus', () => {
    if (blurTimer != null) clearTimeout(blurTimer);
    blurTimer = null;
    showResults(input.value);
  });
  input.addEventListener('input', () => showResults(input.value));
  input.addEventListener('blur', () => {
    blurTimer = window.setTimeout(hideResults, 200);
  });
  resultsDiv.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (blurTimer != null) clearTimeout(blurTimer);
    blurTimer = null;
  });
  resultsDiv.addEventListener('click', (e) => {
    const opt = (e.target as HTMLElement).closest('.rel-type-class-option');
    if (opt && opt instanceof HTMLElement && opt.dataset.id != null) {
      input.value = opt.dataset.id;
      hideResults();
      input.focus();
    }
  });
}

function setupPropertySelector(inputId: string, resultsId: string, getExcludeType?: () => string | null): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const resultsDiv = document.getElementById(resultsId) as HTMLElement;
  if (!input || !resultsDiv) return;
  let blurTimer: number | null = null;
  const showResults = (query: string) => {
    const excludeType = getExcludeType?.() ?? (document.getElementById('editRelationshipTypeModal') as HTMLElement)?.dataset?.type ?? null;
    const types = getAllRelationshipTypes(rawData, objectProperties).filter((t) => t !== excludeType && t !== 'subClassOf');
    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? types.filter((t) => {
          const baseLabel = getRelationshipLabel(t, objectProperties, externalOntologyReferences);
          const display = formatRelationshipLabelWithPrefix(t, baseLabel, externalOntologyReferences);
          return t.toLowerCase().includes(q) || baseLabel.toLowerCase().includes(q) || display.toLowerCase().includes(q);
        })
      : types;
    const limit = 50;
    resultsDiv.innerHTML = '';
    filtered.slice(0, limit).forEach((type) => {
      const baseLabel = getRelationshipLabel(type, objectProperties, externalOntologyReferences);
      const display = formatRelationshipLabelWithPrefix(type, baseLabel, externalOntologyReferences);
      const div = document.createElement('div');
      div.className = 'rel-type-property-option';
      div.dataset.type = type;
      div.textContent = display;
      div.style.cssText = 'padding: 6px 8px; cursor: pointer; font-size: 12px; font-family: Consolas, monospace; border-bottom: 1px solid #eee;';
      resultsDiv.appendChild(div);
    });
    resultsDiv.style.display = filtered.length > 0 ? 'block' : 'none';
  };
  const hideResults = () => {
    resultsDiv.style.display = 'none';
  };
  input.addEventListener('focus', () => {
    if (blurTimer != null) clearTimeout(blurTimer);
    blurTimer = null;
    showResults(input.value);
  });
  input.addEventListener('input', () => showResults(input.value));
  input.addEventListener('blur', () => {
    blurTimer = window.setTimeout(hideResults, 200);
  });
  resultsDiv.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (blurTimer != null) clearTimeout(blurTimer);
    blurTimer = null;
  });
  resultsDiv.addEventListener('click', (e) => {
    const opt = (e.target as HTMLElement).closest('.rel-type-property-option');
    if (opt && opt instanceof HTMLElement && opt.dataset.type != null) {
      input.value = opt.dataset.type;
      hideResults();
      input.focus();
    }
  });
}

function updateEditRelTypeIdentifierAndValidation(): void {
  const modal = document.getElementById('editRelationshipTypeModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  const type = (modal as HTMLElement).dataset.type;
  if (!type) return;
  const labelInput = document.getElementById('editRelTypeLabel') as HTMLInputElement;
  const identifierEl = document.getElementById('editRelTypeIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('editRelTypeLabelValidation') as HTMLElement;
  const okBtn = document.getElementById('editRelTypeConfirm') as HTMLButtonElement;
  const op = objectProperties.find((p) => p.name === type);
  const baseWithHash = getDisplayBase(ttlStore);
  const isImported = !!(op?.isDefinedBy);
  const lbl = labelInput?.value?.trim() ?? '';
  if (identifierEl) {
    if (isImported) {
      identifierEl.textContent = op?.uri ?? baseWithHash + (op?.name ?? type);
    } else {
      const derived = labelToCamelCaseIdentifier(lbl) || (op?.name ?? type);
      identifierEl.textContent = derived.startsWith('http') ? derived : baseWithHash + derived;
    }
  }
  if (labelValidationEl && okBtn) {
    if (isImported) {
      labelValidationEl.style.display = 'none';
      okBtn.disabled = false;
      return;
    }
    if (!lbl) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#c0392b';
      labelValidationEl.textContent = 'Label is required.';
      okBtn.disabled = true;
      return;
    }
    const result = validateLabelForIdentifier(lbl);
    if (!result.valid) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#c0392b';
      labelValidationEl.textContent = result.error ?? 'Invalid label.';
      okBtn.disabled = true;
      return;
    }
    if (result.warning) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#b8860b';
      labelValidationEl.textContent = result.warning;
    } else {
      labelValidationEl.style.display = 'none';
      labelValidationEl.textContent = '';
    }
    okBtn.disabled = false;
  }
}

function initEditRelationshipTypeHandlers(edgeStylesContent: HTMLElement, onApply: () => void): void {
  if (editRelationshipTypeHandlersInitialized) return;
  editRelationshipTypeHandlersInitialized = true;
  setupClassSelector('editRelTypeDomain', 'editRelTypeDomainResults');
  setupClassSelector('editRelTypeRange', 'editRelTypeRangeResults');
  setupPropertySelector('editRelTypeSubPropertyOf', 'editRelTypeSubPropertyOfResults');
  document.getElementById('editRelTypeLabel')?.addEventListener('input', updateEditRelTypeIdentifierAndValidation);
  document.getElementById('editRelTypeCancel')?.addEventListener('click', () => {
    document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
  });
  document.getElementById('editRelTypeConfirm')?.addEventListener('click', () => {
    const modal = document.getElementById('editRelationshipTypeModal') as HTMLElement;
    const type = modal.dataset.type!;
    const labelInput = document.getElementById('editRelTypeLabel') as HTMLInputElement;
    const commentInput = document.getElementById('editRelTypeComment') as HTMLTextAreaElement;
    const domainInput = document.getElementById('editRelTypeDomain') as HTMLInputElement;
    const rangeInput = document.getElementById('editRelTypeRange') as HTMLInputElement;
    const subPropertyOfInput = document.getElementById('editRelTypeSubPropertyOf') as HTMLInputElement;
    const definedByInput = document.getElementById('editRelTypeDefinedBy') as HTMLInputElement;
    const newLabel = labelInput?.value?.trim() ?? '';
    const newComment = commentInput?.value?.trim() ?? '';
    const newDomain = domainInput?.value?.trim() ?? '';
    const newRange = rangeInput?.value?.trim() ?? '';
    const newSubPropertyOf = subPropertyOfInput?.value?.trim() ?? '';
    const newDefinedBy = definedByInput?.value?.trim() ?? null;
    if (!ttlStore) return;
    const op = objectProperties.find((p) => p.name === type);
    if (!op) return;
    const isImported = !!op.isDefinedBy;
    if (!isImported && !newLabel) return;
    if (!isImported) {
      const validation = validateLabelForIdentifier(newLabel);
      if (!validation.valid) return;
    }
    const oldLabel = op.label;
    const oldComment = op.comment ?? '';
    const oldDomain = op.domain ?? '';
    const oldRange = op.range ?? '';
    const oldSubPropertyOf = op.subPropertyOf ?? '';
    const oldDefinedBy = op.isDefinedBy ?? '';
    const labelChanged = oldLabel !== newLabel;
    const commentChanged = oldComment !== newComment;
    const domainChanged = oldDomain !== newDomain;
    const rangeChanged = oldRange !== newRange;
    const subPropertyOfChanged = oldSubPropertyOf !== newSubPropertyOf;
    const definedByChanged = (oldDefinedBy || '') !== (newDefinedBy || '');
    const derivedId = !isImported && newLabel ? labelToCamelCaseIdentifier(newLabel) : null;
    const identifierChanged = !!derivedId && derivedId !== (op.uri ? extractLocalName(op.uri) : op.name);
    if (!labelChanged && !commentChanged && !domainChanged && !rangeChanged && !subPropertyOfChanged && !definedByChanged && !identifierChanged) {
      document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
      return;
    }
    let effectiveType = type;
    if (identifierChanged && op.uri && !op.isDefinedBy) {
      const renamed = renameObjectPropertyInStore(ttlStore, op.uri, derivedId!);
      if (renamed) {
        for (const e of rawData.edges) {
          if (e.type === type) e.type = derivedId!;
        }
        objectProperties = getObjectProperties(ttlStore);
        objectProperties = cleanupUnusedExternalProperties(rawData, objectProperties);
        effectiveType = derivedId!;
      }
    }
    if (labelChanged) {
      updateObjectPropertyLabelInStore(ttlStore, effectiveType, newLabel);
      const o = objectProperties.find((p) => p.name === effectiveType);
      if (o) o.label = newLabel;
    }
    if (commentChanged) {
      updateObjectPropertyCommentInStore(ttlStore, effectiveType, newComment || null);
      const o = objectProperties.find((p) => p.name === effectiveType);
      if (o) o.comment = newComment || undefined;
    }
    if (domainChanged || rangeChanged) {
      updateObjectPropertyDomainRangeInStore(
        ttlStore,
        effectiveType,
        newDomain ? newDomain : null,
        newRange ? newRange : null
      );
      const o = objectProperties.find((p) => p.name === effectiveType);
      if (o) {
        o.domain = newDomain || undefined;
        o.range = newRange || undefined;
      }
    }
    if (subPropertyOfChanged) {
      updateObjectPropertySubPropertyOfInStore(ttlStore, effectiveType, newSubPropertyOf ? newSubPropertyOf : null);
      const o = objectProperties.find((p) => p.name === effectiveType);
      if (o) o.subPropertyOf = newSubPropertyOf || undefined;
    }
    if (definedByChanged) {
      updateObjectPropertyIsDefinedByInStore(ttlStore, effectiveType, newDefinedBy && newDefinedBy.startsWith('http') ? newDefinedBy : null);
      const o = objectProperties.find((p) => p.name === effectiveType);
      if (o) o.isDefinedBy = (newDefinedBy && newDefinedBy.startsWith('http') ? newDefinedBy : null) ?? undefined;
    }
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    initEdgeStylesMenu(edgeStylesContent, onApply);
    updateEdgeColorsLegend(rawData, objectProperties, externalOntologyReferences);
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
  const domainInput = document.getElementById('editRelTypeDomain') as HTMLInputElement;
  const rangeInput = document.getElementById('editRelTypeRange') as HTMLInputElement;
  const domainResults = document.getElementById('editRelTypeDomainResults');
  const rangeResults = document.getElementById('editRelTypeRangeResults');
  const subPropertyOfInput = document.getElementById('editRelTypeSubPropertyOf') as HTMLInputElement;
  const subPropertyOfResults = document.getElementById('editRelTypeSubPropertyOfResults');
  const op = objectProperties.find((p) => p.name === type);
  if (labelInput) labelInput.value = op?.label ?? type;
  if (commentInput) commentInput.value = op?.comment ?? '';
  if (domainInput) domainInput.value = op?.domain ?? '';
  if (rangeInput) rangeInput.value = op?.range ?? '';
  if (subPropertyOfInput) {
    const subUri = op?.subPropertyOf ?? '';
    if (subUri) {
      const parentOp = objectProperties.find((p) => p.uri === subUri || p.name === subUri);
      subPropertyOfInput.value = parentOp ? parentOp.name : subUri;
    } else {
      subPropertyOfInput.value = '';
    }
  }
  const definedByInput = document.getElementById('editRelTypeDefinedBy') as HTMLInputElement;
  const identifierEl = document.getElementById('editRelTypeIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('editRelTypeLabelValidation') as HTMLElement;
  const baseWithHash = getDisplayBase(ttlStore);
  const isImported = !!(op?.isDefinedBy);
  if (nameEl) nameEl.textContent = 'Identifier (derived from label):';
  if (identifierEl) {
    const currentId = isImported ? (op?.uri ?? op?.name ?? type) : (op?.uri ?? baseWithHash + (op?.name ?? type));
    identifierEl.textContent = (currentId.startsWith('http') ? currentId : baseWithHash + currentId);
  }
  if (definedByInput) definedByInput.value = op?.isDefinedBy ?? '';
  if (labelInput) {
    labelInput.disabled = isImported;
    labelInput.title = isImported ? 'Label cannot be changed for imported properties.' : '';
  }
  if (labelValidationEl) {
    labelValidationEl.style.display = 'none';
    labelValidationEl.textContent = '';
  }
  updateEditRelTypeIdentifierAndValidation();
  if (domainResults) (domainResults as HTMLElement).style.display = 'none';
  if (rangeResults) (rangeResults as HTMLElement).style.display = 'none';
  if (subPropertyOfResults) (subPropertyOfResults as HTMLElement).style.display = 'none';
  modal.style.display = 'flex';
  labelInput?.focus();
}

function initEdgeStylesMenu(
  edgeStylesContent: HTMLElement,
  onApply: () => void
): void {
  edgeStylesContent.innerHTML = '';
  const types = getAllRelationshipTypes(rawData, objectProperties);
  // Get default colors for all types (distributed across spectrum)
  const defaultColors = getDefaultEdgeColors(types);
  types.forEach((type) => {
    // Get default color - use the generated color directly
    const color = defaultColors[type] || getDefaultColor();
    const isEditable = type !== 'subClassOf';
    const editBtn = isEditable
      ? `<button type="button" class="edge-edit-btn" data-type="${type}" title="Edit object property (name, comment)" style="background: none; border: none; cursor: pointer; padding: 2px; color: #3498db; font-size: 14px; transform: scaleX(-1);">✎</button>`
      : '';
    const deleteBtn = isEditable
      ? `<button type="button" class="edge-delete-btn" data-type="${type}" title="Delete this object property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>`
      : '';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
    // HTML attributes can contain # without escaping, but we need to escape quotes
    const htmlEscapedType = type.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const baseLabel = getRelationshipLabel(type, objectProperties, externalOntologyReferences);
    const displayLabel = formatRelationshipLabelWithPrefix(type, baseLabel, externalOntologyReferences);
    row.innerHTML = `
      <span style="font-weight: bold; font-family: Consolas, monospace; font-size: 12px; min-width: 100px;">${displayLabel}</span>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-show-cb" data-type="${htmlEscapedType}" checked>
        <span>Show</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-label-cb" data-type="${htmlEscapedType}" checked>
        <span>Label</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 11px;">Color:</span>
        <input type="color" class="edge-color-picker" data-type="${htmlEscapedType}" value="${color}" style="width: 28px; height: 22px; padding: 0; border: 1px solid #ccc; cursor: pointer;">
      </label>
      ${editBtn.replace(`data-type="${type}"`, `data-type="${htmlEscapedType}"`)}
      ${deleteBtn.replace(`data-type="${type}"`, `data-type="${htmlEscapedType}"`)}
    `;
    edgeStylesContent.appendChild(row);
  });
  edgeStylesContent
    .querySelectorAll('.edge-show-cb, .edge-label-cb, .edge-color-picker')
    .forEach((el) => el.addEventListener('change', () => { onApply(); updateEdgeColorsLegend(rawData, objectProperties, externalOntologyReferences); }));
  edgeStylesContent.querySelectorAll('.edge-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.type!;
      showEditRelationshipTypeModal(type, edgeStylesContent, onApply);
    });
  });
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
        // Clean up unused external properties
        objectProperties = cleanupUnusedExternalProperties(rawData, objectProperties);
        hasUnsavedChanges = true;
        updateSaveButtonVisibility();
        initEdgeStylesMenu(edgeStylesContent, onApply);
        applyFilter(true);
      }
    });
  });
  updateEdgeColorsLegend(rawData, objectProperties, externalOntologyReferences);
}


let addRelationshipTypeHandlersInitialized = false;

function updateAddRelTypeIdentifierAndValidation(): void {
  updateAddRelTypeIdentifierAndValidationFromModal(ttlStore, objectProperties);
}

function initAddRelationshipTypeHandlers(edgeStylesContent: HTMLElement): void {
  if (addRelationshipTypeHandlersInitialized) return;
  addRelationshipTypeHandlersInitialized = true;
  setupClassSelector('addRelTypeDomain', 'addRelTypeDomainResults');
  setupClassSelector('addRelTypeRange', 'addRelTypeRangeResults');
  setupPropertySelector('addRelTypeSubPropertyOf', 'addRelTypeSubPropertyOfResults', () => null);
  const labelInput = document.getElementById('addRelTypeLabel') as HTMLInputElement;
  if (labelInput) {
    labelInput.addEventListener('input', updateAddRelTypeIdentifierAndValidation);
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('addRelTypeConfirm')?.click();
    });
  }
  document.getElementById('addRelationshipTypeBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('addRelationshipTypeModal')!;
    const li = document.getElementById('addRelTypeLabel') as HTMLInputElement;
    const hasCardCb = document.getElementById('addRelTypeHasCardinality') as HTMLInputElement;
    const commentInput = document.getElementById('addRelTypeComment') as HTMLTextAreaElement;
    const domainInput = document.getElementById('addRelTypeDomain') as HTMLInputElement;
    const rangeInput = document.getElementById('addRelTypeRange') as HTMLInputElement;
    const isDefinedByInput = document.getElementById('addRelTypeIsDefinedBy') as HTMLInputElement;
    const subPropertyOfInput = document.getElementById('addRelTypeSubPropertyOf') as HTMLInputElement;
    const okBtn = document.getElementById('addRelTypeConfirm') as HTMLButtonElement;
    const labelValidationEl = document.getElementById('addRelTypeLabelValidation') as HTMLElement;
    li.value = '';
    hasCardCb.checked = true;
    if (commentInput) commentInput.value = '';
    if (domainInput) domainInput.value = '';
    if (rangeInput) rangeInput.value = '';
    if (isDefinedByInput) isDefinedByInput.value = '';
    if (subPropertyOfInput) subPropertyOfInput.value = '';
    if (labelValidationEl) {
      labelValidationEl.style.display = 'none';
      labelValidationEl.textContent = '';
    }
    okBtn.disabled = true;
    const identifierEl = document.getElementById('addRelTypeIdentifier') as HTMLElement;
    if (identifierEl) identifierEl.textContent = '';
    li.focus();
    modal.style.display = 'flex';
  });
  document.getElementById('addRelTypeCancel')?.addEventListener('click', () => {
    document.getElementById('addRelationshipTypeModal')!.style.display = 'none';
  });
  document.getElementById('addRelTypeConfirm')?.addEventListener('click', () => {
    const li = document.getElementById('addRelTypeLabel') as HTMLInputElement;
    const hasCardCb = document.getElementById('addRelTypeHasCardinality') as HTMLInputElement;
    const commentInput = document.getElementById('addRelTypeComment') as HTMLTextAreaElement;
    const domainInput = document.getElementById('addRelTypeDomain') as HTMLInputElement;
    const rangeInput = document.getElementById('addRelTypeRange') as HTMLInputElement;
    const isDefinedByInput = document.getElementById('addRelTypeIsDefinedBy') as HTMLInputElement;
    const subPropertyOfInput = document.getElementById('addRelTypeSubPropertyOf') as HTMLInputElement;
    const labelValidationEl = document.getElementById('addRelTypeLabelValidation') as HTMLElement;
    const label = li.value.trim();
    if (!ttlStore) return;
    const existingNames = new Set(objectProperties.map((op) => extractLocalName(op.name) || op.name));
    const validation = validateLabelForIdentifierWithUniqueness(label, existingNames, {
      duplicateMessage: 'An object property with this identifier already exists.',
    });
    if (!validation.valid || !validation.identifier) {
      if (labelValidationEl) {
        labelValidationEl.style.display = 'block';
        labelValidationEl.style.color = '#c0392b';
        labelValidationEl.textContent = validation.error ?? 'Label is required.';
      }
      return;
    }
    const comment = commentInput?.value?.trim() ?? null;
    const domain = domainInput?.value?.trim() ?? null;
    const range = rangeInput?.value?.trim() ?? null;
    const isDefinedBy = isDefinedByInput?.value?.trim() ?? null;
    const subPropertyOf = subPropertyOfInput?.value?.trim() ?? null;
    const name = addObjectPropertyToStore(ttlStore, label, hasCardCb.checked, validation.identifier, {
      comment: comment || undefined,
      isDefinedBy: isDefinedBy || undefined,
      subPropertyOf: subPropertyOf || undefined,
      domain: domain || undefined,
      range: range || undefined,
    });
    if (name) {
      objectProperties = getObjectProperties(ttlStore);
      objectProperties = cleanupUnusedExternalProperties(rawData, objectProperties);
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      initEdgeStylesMenu(edgeStylesContent, applyFilter);
      updateEdgeColorsLegend(rawData, objectProperties, externalOntologyReferences);
      applyFilter(true);
      document.getElementById('addRelationshipTypeModal')!.style.display = 'none';
    }
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

/**
 * Format a range URI to short format (e.g., "http://www.w3.org/2001/XMLSchema#string" → "xsd:string").
 * Uses DATA_PROPERTY_RANGE_OPTIONS for known URIs, otherwise extracts local name after '#'.
 */
function formatRangeUri(rangeUri: string): string {
  // Check if it's in the known options
  const knownOption = DATA_PROPERTY_RANGE_OPTIONS.find((opt) => opt.value === rangeUri);
  if (knownOption) {
    return knownOption.label;
  }
  
  // Extract local name after '#'
  const hashIndex = rangeUri.indexOf('#');
  if (hashIndex !== -1 && hashIndex < rangeUri.length - 1) {
    const localName = rangeUri.substring(hashIndex + 1);
    // Try to detect namespace prefix
    if (rangeUri.startsWith(XSD_NS)) {
      return `xsd:${localName}`;
    }
    // For other namespaces, just return the local name
    return localName;
  }
  
  // Fallback: return as-is if no '#' found
  return rangeUri;
}

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
      
      // Check if this property is used in any restrictions
      const restrictionsUsingProperty = rawData.nodes.filter((n) =>
        n.dataPropertyRestrictions?.some((r) => r.propertyName === name)
      );
      
      if (restrictionsUsingProperty.length > 0) {
        const classNames = restrictionsUsingProperty.map((n) => n.label || n.id).join(', ');
        if (!confirm(`This property is used in restrictions on: ${classNames}\n\nDelete anyway? This will also remove all restrictions using this property.`)) {
          return;
        }
        
        // Remove all restrictions using this property
        for (const node of restrictionsUsingProperty) {
          removeDataPropertyRestrictionFromClass(ttlStore, node.id, name);
          const nodeIndex = rawData.nodes.findIndex((n) => n.id === node.id);
          if (nodeIndex >= 0) {
            rawData.nodes[nodeIndex].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(ttlStore, node.id);
          }
        }
      }
      
      // Try to remove from store
      const removed = removeDataPropertyFromStore(ttlStore, name);
      
      // Always remove from the array and refresh UI, even if store removal failed
      // (the property might have been from an external ontology or already deleted)
      const wasInArray = dataProperties.some((dp) => dp.name === name);
      if (wasInArray) {
        dataProperties = dataProperties.filter((dp) => dp.name !== name);
        hasUnsavedChanges = true;
        updateSaveButtonVisibility();
        initDataPropsMenu(dataPropsContent);
        applyFilter(true); // Refresh the graph to reflect the deletion
      }
      
      if (!removed && wasInArray) {
        console.warn(`Data property "${name}" was in the list but not found in store. It may have been from an external ontology or already deleted.`);
      }
    });
  });
}

function updateEditDataPropIdentifierAndValidation(): void {
  const modal = document.getElementById('editDataPropertyModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  const name = (modal as HTMLElement).dataset.dataPropName;
  if (!name) return;
  const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
  const identifierEl = document.getElementById('editDataPropIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('editDataPropLabelValidation') as HTMLElement;
  const okBtn = document.getElementById('editDataPropConfirm') as HTMLButtonElement;
  const dp = dataProperties.find((p) => p.name === name);
  const baseWithHash = getDisplayBase(ttlStore);
  const isImported = !!(dp?.isDefinedBy);
  const lbl = labelInput?.value?.trim() ?? '';
  if (identifierEl) {
    if (isImported) {
      identifierEl.textContent = dp?.uri ?? baseWithHash + (dp?.name ?? name);
    } else {
      const derived = labelToCamelCaseIdentifier(lbl) || (dp?.name ?? name);
      identifierEl.textContent = derived.startsWith('http') ? derived : baseWithHash + derived;
    }
  }
  if (labelValidationEl && okBtn) {
    if (isImported) {
      labelValidationEl.style.display = 'none';
      okBtn.disabled = false;
      return;
    }
    if (!lbl) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#c0392b';
      labelValidationEl.textContent = 'Label is required.';
      okBtn.disabled = true;
      return;
    }
    const result = validateLabelForIdentifier(lbl);
    if (!result.valid) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#c0392b';
      labelValidationEl.textContent = result.error ?? 'Invalid label.';
      okBtn.disabled = true;
      return;
    }
    if (result.warning) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#b8860b';
      labelValidationEl.textContent = result.warning;
    } else {
      labelValidationEl.style.display = 'none';
      labelValidationEl.textContent = '';
    }
    okBtn.disabled = false;
  }
}

let editDataPropertyHandlersInitialized = false;

function initEditDataPropertyHandlers(): void {
  if (editDataPropertyHandlersInitialized) return;
  editDataPropertyHandlersInitialized = true;
  document.getElementById('editDataPropLabel')?.addEventListener('input', updateEditDataPropIdentifierAndValidation);
  document.getElementById('editDataPropCancel')?.addEventListener('click', () => {
    document.getElementById('editDataPropertyModal')!.style.display = 'none';
  });
  document.getElementById('editDataPropConfirm')?.addEventListener('click', () => {
    const modal = document.getElementById('editDataPropertyModal')!;
    let name = (modal as HTMLElement).dataset.dataPropName!;
    const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
    const commentInput = document.getElementById('editDataPropComment') as HTMLTextAreaElement;
    const rangeSel = document.getElementById('editDataPropRange') as HTMLSelectElement;
    const definedByInput = document.getElementById('editDataPropDefinedBy') as HTMLInputElement;
    const newLabel = labelInput?.value?.trim() ?? '';
    const newComment = commentInput?.value?.trim() ?? '';
    const newRange = rangeSel?.value ?? XSD_NS + 'string';
    const newDefinedBy = definedByInput?.value?.trim() ?? null;
    if (!ttlStore) return;
    let dp = dataProperties.find((p) => p.name === name);
    if (!dp) return;
    const isImported = !!dp.isDefinedBy;
    if (!isImported && !newLabel) return;
    if (!isImported) {
      const validation = validateLabelForIdentifier(newLabel);
      if (!validation.valid) return;
    }
    const derivedId = !isImported && newLabel ? labelToCamelCaseIdentifier(newLabel) : null;
    const currentLocalName = dp.uri ? extractLocalName(dp.uri) : dp.name;
    const identifierChanged = !!derivedId && derivedId !== currentLocalName;
    const labelChanged = dp.label !== newLabel;
    const commentChanged = (dp.comment ?? '') !== newComment;
    const rangeChanged = dp.range !== newRange;
    const oldDefinedBy = dp.isDefinedBy ?? '';
    const definedByChanged = (oldDefinedBy || '') !== (newDefinedBy || '');
    const originalDomainsJson = (modal as HTMLElement).dataset.originalDomains || '[]';
    const originalDomains = JSON.parse(originalDomainsJson) as string[];
    const currentDomains = dp.domains || [];
    const domainsChanged = JSON.stringify(originalDomains.sort()) !== JSON.stringify([...currentDomains].sort());
    if (!labelChanged && !commentChanged && !rangeChanged && !domainsChanged && !definedByChanged && !identifierChanged) {
      document.getElementById('editDataPropertyModal')!.style.display = 'none';
      return;
    }
    if (identifierChanged && dp.uri && !dp.isDefinedBy) {
      const renamed = renameDataPropertyInStore(ttlStore, dp.uri, derivedId!);
      if (renamed) {
        dataProperties = getDataProperties(ttlStore);
        name = derivedId!;
        (modal as HTMLElement).dataset.dataPropName = name;
        dp = dataProperties.find((p) => p.name === name)!;
      }
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
    if (domainsChanged) {
      updateDataPropertyDomainsInStore(ttlStore, name, currentDomains);
    }
    if (definedByChanged) {
      updateDataPropertyIsDefinedByInStore(ttlStore, name, newDefinedBy && newDefinedBy.startsWith('http') ? newDefinedBy : null);
      dp.isDefinedBy = (newDefinedBy && newDefinedBy.startsWith('http') ? newDefinedBy : null) ?? undefined;
    }
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    dataProperties = getDataProperties(ttlStore);
    applyFilter(true);
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
  
  // Add domain button handler
  document.getElementById('editDataPropAddDomain')?.addEventListener('click', () => {
    const modal = document.getElementById('editDataPropertyModal')!;
    const name = (modal as HTMLElement).dataset.dataPropName!;
    const dp = dataProperties.find((p) => p.name === name);
    if (!dp) return;
    
    // Get available classes (not already added as domains)
    const availableClasses = rawData.nodes
      .map((n) => ({ id: n.id, label: n.label || n.id }))
      .filter((c) => !dp.domains.includes(c.id))
      .sort((a, b) => a.label.localeCompare(b.label));
    
    if (availableClasses.length === 0) {
      alert('All available classes are already added as domains.');
      return;
    }
    
    // Create a simple select dropdown
    const select = document.createElement('select');
    select.style.cssText = 'width: 100%; padding: 6px; margin-top: 4px; font-size: 11px;';
    select.innerHTML = '<option value="">-- Select a class --</option>' + 
      availableClasses.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
    
    // Create a wrapper div
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top: 8px;';
    wrapper.appendChild(select);
    
    // Create confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.textContent = 'Add';
    confirmBtn.className = 'primary';
    confirmBtn.style.cssText = 'margin-top: 8px; padding: 6px 12px; font-size: 11px;';
    confirmBtn.disabled = true;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'margin-top: 8px; margin-left: 8px; padding: 6px 12px; font-size: 11px;';
    
    const buttonWrapper = document.createElement('div');
    buttonWrapper.style.cssText = 'display: flex; gap: 8px;';
    buttonWrapper.appendChild(confirmBtn);
    buttonWrapper.appendChild(cancelBtn);
    wrapper.appendChild(buttonWrapper);
    
    // Insert before the domains list
    const domainsListEl = document.getElementById('editDataPropDomainsList') as HTMLElement;
    if (domainsListEl && domainsListEl.parentElement) {
      domainsListEl.parentElement.insertBefore(wrapper, domainsListEl);
    }
    
    // Enable confirm button when selection is made
    select.addEventListener('change', () => {
      confirmBtn.disabled = !select.value;
    });
    
    // Handle confirm
    confirmBtn.addEventListener('click', () => {
      const className = select.value;
      if (className && !dp.domains.includes(className)) {
        if (!dp.domains) {
          dp.domains = [];
        }
        dp.domains.push(className);
        renderDomainsList(domainsListEl, dp.domains);
      }
      wrapper.remove();
    });
    
    // Handle cancel
    cancelBtn.addEventListener('click', () => {
      wrapper.remove();
    });
    
    select.focus();
  });
}

function renderDomainsList(domainsListEl: HTMLElement, domains: string[]): void {
  domainsListEl.innerHTML = '';
  
  // If no custom domains, show owl:Thing (cannot be deleted)
  if (domains.length === 0) {
    const thingItem = document.createElement('div');
    thingItem.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px; margin-bottom: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;';
    thingItem.innerHTML = `
      <span style="font-size: 11px; font-family: Consolas, monospace;">owl:Thing</span>
      <span style="font-size: 10px; color: #999;">(default - all classes)</span>
    `;
    domainsListEl.appendChild(thingItem);
  } else {
    // Show custom domains with delete buttons
    domains.forEach((domainName) => {
      const domainItem = document.createElement('div');
      domainItem.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px; margin-bottom: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;';
      domainItem.innerHTML = `
        <span style="font-size: 11px; font-family: Consolas, monospace;">${domainName}</span>
        <button type="button" class="domain-delete-btn" data-domain="${domainName}" title="Delete domain" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>
      `;
      domainsListEl.appendChild(domainItem);
    });
  }
  
  // Add delete button handlers
  domainsListEl.querySelectorAll('.domain-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const domainName = (btn as HTMLElement).dataset.domain!;
      const modal = document.getElementById('editDataPropertyModal')!;
      const name = (modal as HTMLElement).dataset.dataPropName!;
      const dp = dataProperties.find((p) => p.name === name);
      if (!dp) return;
      
      // Remove domain from array
      const newDomains = dp.domains.filter((d) => d !== domainName);
      dp.domains = newDomains;
      
      // Re-render list
      renderDomainsList(domainsListEl, newDomains);
    });
  });
}

function showEditDataPropertyModal(name: string): void {
  initEditDataPropertyHandlers();
  const modal = document.getElementById('editDataPropertyModal')!;
  (modal as HTMLElement).dataset.dataPropName = name;
  const nameEl = document.getElementById('editDataPropName') as HTMLElement;
  const identifierEl = document.getElementById('editDataPropIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('editDataPropLabelValidation') as HTMLElement;
  const definedByInput = document.getElementById('editDataPropDefinedBy') as HTMLInputElement;
  const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
  const commentInput = document.getElementById('editDataPropComment') as HTMLTextAreaElement;
  const rangeSel = document.getElementById('editDataPropRange') as HTMLSelectElement;
  const domainsListEl = document.getElementById('editDataPropDomainsList') as HTMLElement;
  const dp = dataProperties.find((p) => p.name === name);
  const baseWithHash = getDisplayBase(ttlStore);
  const isImported = !!(dp?.isDefinedBy);
  if (nameEl) nameEl.textContent = 'Identifier (derived from label):';
  if (identifierEl) {
    const fullUri = dp?.uri ?? baseWithHash + (dp?.name ?? name);
    identifierEl.textContent = fullUri;
  }
  if (labelValidationEl) {
    labelValidationEl.style.display = 'none';
    labelValidationEl.textContent = '';
  }
  if (definedByInput) definedByInput.value = dp?.isDefinedBy ?? '';
  if (labelInput) {
    labelInput.value = dp?.label ?? name;
    labelInput.disabled = isImported;
    labelInput.title = isImported ? 'Label cannot be changed for imported properties.' : '';
  }
  if (commentInput) commentInput.value = dp?.comment ?? '';
  const rangeOptions = [...DATA_PROPERTY_RANGE_OPTIONS];
  if (dp?.range && !rangeOptions.some((o) => o.value === dp.range)) {
    rangeOptions.push({ value: dp.range, label: dp.range.includes('#') ? dp.range.split('#').pop()! : dp.range });
  }
  rangeSel.innerHTML = rangeOptions.map((opt) => `<option value="${opt.value}"${dp?.range === opt.value ? ' selected' : ''}>${opt.label}</option>`).join('');
  const originalDomains = dp ? [...(dp.domains || [])] : [];
  (modal as HTMLElement).dataset.originalDomains = JSON.stringify(originalDomains);
  if (domainsListEl && dp) {
    renderDomainsList(domainsListEl, dp.domains || []);
  }
  updateEditDataPropIdentifierAndValidation();
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
    const rangeSel = document.getElementById('editAnnotationPropRange') as HTMLSelectElement;
    const newLabel = labelInput?.value?.trim() ?? '';
    const newComment = commentInput?.value?.trim() ?? '';
    const newRange = rangeSel?.value ?? null;
    if (!newLabel || !ttlStore) return;
    const ap = annotationProperties.find((p) => p.name === name);
    if (!ap) return;
    const labelChanged = (ap.name !== newLabel && ap.name !== extractLocalName(newLabel));
    const commentChanged = false; // We don't track comments in annotationProperties array
    const rangeChanged = (ap.range ?? null) !== (newRange || null);
    if (!labelChanged && !commentChanged && !rangeChanged) {
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
        annotationProperties.push({ name: newName, isBoolean: ap.isBoolean, range: ap.range });
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
    if (rangeChanged) {
      updateAnnotationPropertyRangeInStore(ttlStore, name, newRange || null);
      const idx = annotationProperties.findIndex((p) => p.name === name);
      if (idx >= 0) {
        annotationProperties[idx].range = newRange || null;
        // Update isBoolean for backward compatibility
        annotationProperties[idx].isBoolean = newRange === XSD_NS + 'boolean' || newRange?.endsWith('#boolean') || false;
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
  const rangeSel = document.getElementById('editAnnotationPropRange') as HTMLSelectElement;
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
  
  // Populate range dropdown
  if (rangeSel) {
    const rangeOptions = [
      { value: '', label: 'No range (untyped)' },
      ...DATA_PROPERTY_RANGE_OPTIONS,
    ];
    const currentRange = ap?.range ?? null;
    rangeSel.innerHTML = rangeOptions.map((opt) => 
      `<option value="${opt.value}"${currentRange === opt.value ? ' selected' : ''}>${opt.label}</option>`
    ).join('');
    
    // If current range is not in the list, add it
    if (currentRange && !rangeOptions.some((o) => o.value === currentRange)) {
      const rangeLabel = currentRange.includes('#') ? currentRange.split('#').pop()! : currentRange;
      rangeSel.innerHTML += `<option value="${currentRange}" selected>${rangeLabel}</option>`;
    }
  }
  
  modal.style.display = 'flex';
  labelInput?.focus();
}

let addAnnotationPropertyHandlersInitialized = false;

function initAddAnnotationPropertyHandlers(_annotationPropsContent?: HTMLElement): void {
  if (addAnnotationPropertyHandlersInitialized) return;
  addAnnotationPropertyHandlersInitialized = true;
  const labelInput = document.getElementById('addAnnotationPropLabel') as HTMLInputElement;
  const rangeSel = document.getElementById('addAnnotationPropRange') as HTMLSelectElement;
  
  // Populate range dropdown with XSD types
  if (rangeSel) {
    const rangeOptions = [
      { value: '', label: 'No range (untyped)' },
      ...DATA_PROPERTY_RANGE_OPTIONS,
    ];
    rangeSel.innerHTML = rangeOptions.map((opt) => 
      `<option value="${opt.value}">${opt.label}</option>`
    ).join('');
  }
  
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
    if (rangeSel) rangeSel.value = '';
    okBtn.disabled = true;
    li.focus();
    modal.style.display = 'flex';
  });
  document.getElementById('addAnnotationPropCancel')?.addEventListener('click', () => {
    document.getElementById('addAnnotationPropertyModal')!.style.display = 'none';
  });
  document.getElementById('addAnnotationPropConfirm')?.addEventListener('click', () => {
    const li = document.getElementById('addAnnotationPropLabel') as HTMLInputElement;
    const range = rangeSel?.value || null;
    const label = li.value.trim();
    if (!label || !ttlStore) return;
    const name = addAnnotationPropertyToStore(ttlStore, label, range);
    if (name) {
      const isBoolean = range === XSD_NS + 'boolean' || range?.endsWith('#boolean') || false;
      annotationProperties.push({ name, isBoolean, range });
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

function updateAddDataPropIdentifierAndValidation(): void {
  updateAddDataPropIdentifierAndValidationFromModal(ttlStore, dataProperties);
}

function initAddDataPropertyHandlers(_dataPropsContent?: HTMLElement): void {
  if (addDataPropertyHandlersInitialized) return;
  addDataPropertyHandlersInitialized = true;
  const labelInput = document.getElementById('addDataPropLabel') as HTMLInputElement;
  const rangeSel = document.getElementById('addDataPropRange') as HTMLSelectElement;
  if (rangeSel) {
    rangeSel.innerHTML = DATA_PROPERTY_RANGE_OPTIONS.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
  }
  if (labelInput) {
    labelInput.addEventListener('input', updateAddDataPropIdentifierAndValidation);
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('addDataPropConfirm')?.click();
    });
  }
  document.getElementById('addDataPropertyBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('addDataPropertyModal')!;
    const li = document.getElementById('addDataPropLabel') as HTMLInputElement;
    const okBtn = document.getElementById('addDataPropConfirm') as HTMLButtonElement;
    const labelValidationEl = document.getElementById('addDataPropLabelValidation') as HTMLElement;
    li.value = '';
    if (labelValidationEl) {
      labelValidationEl.style.display = 'none';
      labelValidationEl.textContent = '';
    }
    okBtn.disabled = true;
    const identifierEl = document.getElementById('addDataPropIdentifier') as HTMLElement;
    if (identifierEl) identifierEl.textContent = '';
    li.focus();
    modal.style.display = 'flex';
  });
  document.getElementById('addDataPropCancel')?.addEventListener('click', () => {
    document.getElementById('addDataPropertyModal')!.style.display = 'none';
  });
  document.getElementById('addDataPropConfirm')?.addEventListener('click', () => {
    const li = document.getElementById('addDataPropLabel') as HTMLInputElement;
    const rangeEl = document.getElementById('addDataPropRange') as HTMLSelectElement;
    const labelValidationEl = document.getElementById('addDataPropLabelValidation') as HTMLElement;
    const label = li.value.trim();
    const rangeUri = rangeEl?.value ?? XSD_NS + 'string';
    if (!ttlStore) return;
    const existingNames = new Set(dataProperties.map((dp) => dp.name));
    const validation = validateLabelForIdentifierWithUniqueness(label, existingNames, {
      duplicateMessage: 'A data property with this identifier already exists.',
    });
    if (!validation.valid || !validation.identifier) {
      if (labelValidationEl) {
        labelValidationEl.style.display = 'block';
        labelValidationEl.style.color = '#c0392b';
        labelValidationEl.textContent = validation.error ?? 'Label is required.';
      }
      return;
    }
    const name = addDataPropertyToStore(ttlStore, label, rangeUri, validation.identifier);
    if (name) {
      dataProperties = getDataProperties(ttlStore);
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      const content = document.getElementById('dataPropsContent');
      if (content) initDataPropsMenu(content);
      applyFilter(true);
      document.getElementById('addDataPropertyModal')!.style.display = 'none';
    }
  });
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

/**
 * Convert hex color to rgba with opacity.
 * @param color Hex color string (e.g., "#3498db" or "#2c3e50")
 * @param opacity Opacity value between 0 and 1
 * @returns rgba color string (e.g., "rgba(52, 152, 219, 0.65)")
 */
function applyOpacityToColor(color: string, opacity: number): string {
  // Remove # if present
  const hex = color.replace('#', '');
  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Get opacity value based on search category.
 * @param nodeId Node ID to check
 * @param matchingIds Set of matching node IDs
 * @param neighborIds Set of neighbor node IDs
 * @returns Opacity value: 1.0 for matching, 0.65 for neighbors, 0.25 for others
 */
function getSearchOpacity(nodeId: string, matchingIds: Set<string>, neighborIds: Set<string>): number {
  if (matchingIds.has(nodeId)) {
    return 1.0; // 100% opacity for matching
  }
  if (neighborIds.has(nodeId)) {
    return 0.65; // 60-70% opacity for neighbors (using 65%)
  }
  return 0.25; // 20-30% opacity for others (using 25%)
}

function buildNetworkData(filter: {
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  relationshipFontSize: number;
  dataPropertyFontSize?: number;
  searchQuery: string;
  includeNeighbors: boolean;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string }>;
  annotationStyleConfig: AnnotationStyleConfig;
  layoutMode: string;
}): { nodes: DataSet; edges: DataSet } {
  let filteredNodes = rawData.nodes.filter((n) =>
    shouldShowNodeByAnnotations(n, filter.annotationStyleConfig)
  );
  let nodeIds = new Set(filteredNodes.map((n) => n.id));
  
  // Debug: Check for describes edges before filtering
  const describesEdgesBeforeFilter = rawData.edges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesBeforeFilter.length > 0) {
    console.log('[DEBUG] Describes edges in rawData.edges before filtering:', describesEdgesBeforeFilter);
    console.log('[DEBUG] Available node IDs in filteredNodes:', Array.from(nodeIds));
    describesEdgesBeforeFilter.forEach((e) => {
      const fromExists = nodeIds.has(e.from);
      const toExists = nodeIds.has(e.to);
      console.log(`[DEBUG] Describes edge: from="${e.from}" (exists: ${fromExists}), to="${e.to}" (exists: ${toExists}), type="${e.type}"`);
      if (!fromExists || !toExists) {
        console.warn(`[DEBUG] ⚠ Describes edge will be filtered out - missing nodes`);
        if (!fromExists) console.warn(`[DEBUG]   Missing from node: "${e.from}"`);
        if (!toExists) console.warn(`[DEBUG]   Missing to node: "${e.to}"`);
      }
    });
  } else {
    console.warn('[DEBUG] ⚠ No describes edges found in rawData.edges at all!');
  }
  
  // Debug: Check for edges with external property URIs before filtering
  const externalEdgesBeforeFilter = rawData.edges.filter((e) => 
    (e.type.startsWith('http://') || e.type.startsWith('https://')) &&
    (e.type.includes('describes') || e.type.includes('dano'))
  );
  if (externalEdgesBeforeFilter.length > 0) {
    console.log('[DEBUG] External property edges in rawData.edges:', externalEdgesBeforeFilter);
    console.log('[DEBUG] Available node IDs:', Array.from(nodeIds));
    externalEdgesBeforeFilter.forEach((e) => {
      console.log(`[DEBUG] Edge ${e.type}: from="${e.from}" (exists: ${nodeIds.has(e.from)}), to="${e.to}" (exists: ${nodeIds.has(e.to)})`);
    });
  }
  
  let filteredEdges = rawData.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
  );
  
  // Debug: Check describes edges after node filtering
  const describesEdgesAfterNodeFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  console.log(`[DEBUG] Describes edges after node filtering: ${describesEdgesAfterNodeFilter.length}`, describesEdgesAfterNodeFilter);

  const searchQuery = (filter.searchQuery || '').trim();
  // Track search categories for transparency styling
  let matchingNodeIds = new Set<string>();
  let neighborNodeIds = new Set<string>();
  let matchingEdgeIds = new Set<string>();
  let neighborEdgeIds = new Set<string>();
  
  if (searchQuery) {
    // Find matching nodes and edges
    filteredNodes.forEach((n) => {
      if (matchesSearch(n, null, searchQuery)) matchingNodeIds.add(n.id);
    });
    filteredEdges.forEach((e) => {
      if (matchesSearch(null, e, searchQuery)) {
        matchingNodeIds.add(e.from);
        matchingNodeIds.add(e.to);
        matchingEdgeIds.add(`${e.from}->${e.to}:${e.type}`);
      }
    });
    
    // Find neighbor nodes and edges (if includeNeighbors is enabled)
    if (filter.includeNeighbors) {
      filteredEdges.forEach((e) => {
        const fromMatches = matchingNodeIds.has(e.from);
        const toMatches = matchingNodeIds.has(e.to);
        if (fromMatches || toMatches) {
          // Add neighbor nodes (connected to matching nodes but not matching themselves)
          if (!matchingNodeIds.has(e.from)) neighborNodeIds.add(e.from);
          if (!matchingNodeIds.has(e.to)) neighborNodeIds.add(e.to);
          // Add neighbor edges (connected to matching nodes but not matching themselves)
          const edgeId = `${e.from}->${e.to}:${e.type}`;
          if (!matchingEdgeIds.has(edgeId)) neighborEdgeIds.add(edgeId);
        }
      });
    }
    
    // Keep ALL nodes and edges - don't filter them out
    // All nodes remain in filteredNodes, all edges remain in filteredEdges
    // We'll apply opacity styling based on their category
  }

  const edgeStyleConfig = filter.edgeStyleConfig;
  
  // Debug: Check describes edges before style filtering
  const describesEdgesBeforeStyleFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  console.log(`[DEBUG] Describes edges before style filtering: ${describesEdgesBeforeStyleFilter.length}`, describesEdgesBeforeStyleFilter);
  
  // Debug: Check edge style config for describes
  const describesEdgeType = describesEdgesBeforeStyleFilter.length > 0 ? describesEdgesBeforeStyleFilter[0].type : null;
  if (describesEdgeType) {
    const describesStyle = edgeStyleConfig[describesEdgeType];
    console.log(`[DEBUG] Edge style config for "${describesEdgeType}":`, describesStyle);
    console.log(`[DEBUG] All edge style config keys:`, Object.keys(edgeStyleConfig));
  }
  
  // Debug: Log edges with external property URIs
  const externalEdges = filteredEdges.filter((e) => e.type.startsWith('http://') || e.type.startsWith('https://'));
  if (externalEdges.length > 0) {
    console.log('[DEBUG] External property edges found:', externalEdges.map((e) => ({ from: e.from, to: e.to, type: e.type })));
    console.log('[DEBUG] Edge style config keys:', Object.keys(edgeStyleConfig));
  }
  
  filteredEdges = filteredEdges.filter((e) => {
    const style = edgeStyleConfig[e.type];
    const shouldShow = !style || style.show !== false;
    
    // Debug: Specifically log describes edge filtering
    if (e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')) {
      console.log(`[DEBUG] Describes edge style check:`, {
        type: e.type,
        style: style,
        shouldShow: shouldShow,
        showValue: style?.show,
      });
      if (!shouldShow) {
        console.warn(`[DEBUG] ⚠ Describes edge filtered out by style config:`, style);
      }
    }
    
    if (!shouldShow && (e.type.startsWith('http://') || e.type.startsWith('https://'))) {
      console.warn(`[DEBUG] External edge filtered out: ${e.type}, style:`, style);
    }
    return shouldShow;
  });
  
  // Debug: Check describes edges after style filtering
  const describesEdgesAfterStyleFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  console.log(`[DEBUG] Describes edges after style filtering: ${describesEdgesAfterStyleFilter.length}`, describesEdgesAfterStyleFilter);

  const layoutMode = filter.layoutMode;
  const wrapChars = filter.wrapChars ?? 10;
  const minFontSize = Math.max(8, Math.min(96, filter.minFontSize ?? 20));
  const maxFontSize = Math.max(minFontSize, Math.min(96, filter.maxFontSize ?? 80));
  const relationshipFontSize = Math.max(8, Math.min(48, filter.relationshipFontSize ?? 18));
  const dataPropertyFontSize = Math.max(8, Math.min(48, filter.dataPropertyFontSize ?? 18));
  const { depth, maxDepth } = computeNodeDepths(nodeIds, filteredEdges);

  let nodePositions: Record<string, { x: number; y: number }> = {};
  // Use layout registry for hierarchical layouts
  const layoutAlgorithm = getLayoutAlgorithm(layoutMode);
  if (layoutAlgorithm) {
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
    nodePositions = layoutAlgorithm(
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
    const displayLabel = formatNodeLabelWithPrefix(n, externalOntologyReferences);
    
    // Apply search transparency if search query is active
    let nodeOpacity = 1.0;
    let backgroundColor = style.background;
    let borderColor = style.border;
    let fontColor = '#2c3e50';
    
    if (searchQuery) {
      nodeOpacity = getSearchOpacity(n.id, matchingNodeIds, neighborNodeIds);
      if (nodeOpacity < 1.0) {
        backgroundColor = applyOpacityToColor(style.background, nodeOpacity);
        borderColor = applyOpacityToColor(style.border, nodeOpacity);
        fontColor = applyOpacityToColor('#2c3e50', nodeOpacity);
      }
    }
    
    const node: Record<string, unknown> = {
      id: n.id,
      label: wrapText(displayLabel, wrapChars),
      labellableRoot: n.labellableRoot,
      color: { background: backgroundColor, border: borderColor },
      font: { size: fontSize, color: fontColor },
      ...(style.shapeProperties && { shapeProperties: style.shapeProperties }),
      ...(n.comment && { title: n.comment }),
    };
    
    // Apply opacity property if less than 1.0
    if (nodeOpacity < 1.0) {
      node.opacity = nodeOpacity;
    }
    
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
    }
    return node;
  });

  // Add data property nodes as small rectangles
  const dataPropertyNodes: Array<Record<string, unknown>> = [];
  const dataPropertyEdges: Array<Record<string, unknown>> = [];
  
  // Track which data properties are already displayed as restrictions
  const displayedAsRestriction = new Set<string>();
  
  // Calculate node dimensions for proper positioning
  const nodeDimensionsMap = new Map<string, { width: number; height: number }>();
  filteredNodes.forEach((n) => {
    const d = depth[n.id] ?? 0;
    const fontSize =
      maxDepth > 0
        ? Math.round(
            minFontSize +
              (maxFontSize - minFontSize) * (maxDepth - d) / maxDepth
          )
        : maxFontSize;
    nodeDimensionsMap.set(n.id, estimateNodeDimensions(n.label, wrapChars, fontSize));
  });
  
  // Group data properties by their parent class node for better layout
  const dataPropsByClass = new Map<string, Array<{ id: string; label: string; isRestriction: boolean; propertyName: string }>>();
  
  // First, collect all data property restrictions
  filteredNodes.forEach((n) => {
    const restrictions = n.dataPropertyRestrictions;
    if (restrictions && restrictions.length > 0) {
      if (!dataPropsByClass.has(n.id)) {
        dataPropsByClass.set(n.id, []);
      }
      restrictions.forEach((restriction) => {
        const dp = dataProperties.find((p) => p.name === restriction.propertyName);
        const label = dp?.label ?? restriction.propertyName;
        const cardLabel =
          restriction.minCardinality != null || restriction.maxCardinality != null
            ? ` [${restriction.minCardinality ?? 0}..${restriction.maxCardinality ?? '*'}]`
            : '';
        const dataPropNodeId = `__dataproprestrict__${n.id}__${restriction.propertyName}`;
        displayedAsRestriction.add(`${n.id}__${restriction.propertyName}`);
        dataPropsByClass.get(n.id)!.push({
          id: dataPropNodeId,
          label: label + cardLabel,
          isRestriction: true,
          propertyName: restriction.propertyName,
        });
      });
    }
  });
  
  // Then, collect generic data properties
  dataProperties.forEach((dp) => {
    filteredNodes.forEach((n) => {
      if (displayedAsRestriction.has(`${n.id}__${dp.name}`)) return;
      const shouldDisplay = dp.domains.length === 0 || dp.domains.includes(n.id);
      if (!shouldDisplay) return;
      
      if (!dataPropsByClass.has(n.id)) {
        dataPropsByClass.set(n.id, []);
      }
      const dataPropNodeId = `__dataprop__${n.id}__${dp.name}`;
      dataPropsByClass.get(n.id)!.push({
        id: dataPropNodeId,
        label: dp.label,
        isRestriction: false,
        propertyName: dp.name,
      });
    });
  });
  
  // Position data properties for each class node
  dataPropsByClass.forEach((dataProps, classId) => {
    const classNode = filteredNodes.find((n) => n.id === classId);
    if (!classNode) return;
    
    const classPos = (classNode.x != null && classNode.y != null) 
      ? { x: classNode.x, y: classNode.y } 
      : nodePositions[classId];
    if (!classPos) return;
    
    const nodeDim = nodeDimensionsMap.get(classId) ?? { width: 100, height: 40 };
    // Round up the node width to be less conservative (ceiling approach)
    const classNodeWidth = Math.ceil(nodeDim.width);
    const classNodeHeight = nodeDim.height;
    
    // Calculate available width: node width + 50px on each side
    // Add tolerance factor (20% more) to allow properties to slightly exceed parent width
    const baseAvailableWidth = classNodeWidth + 100;
    const availableWidth = Math.ceil(baseAvailableWidth * 1.2);
    
    // Estimate width per data property node (label length + padding)
    // Each data property node width depends on font size
    const estimateDataPropWidth = (label: string): number => {
      // Use character width ratio similar to node dimensions estimation
      // Font size affects character width: ~0.62 * fontSize per character
      const charWidth = dataPropertyFontSize * 0.62;
      const textWidth = label.length * charWidth;
      // Add padding: 2 * margin (4px each) + some extra for node shape
      const padding = 8 + 30; // margin + node shape padding
      return Math.max(60, textWidth + padding);
    };
    
    // Calculate how many properties fit per row
    let currentRowWidth = 0;
    let propertiesPerRow: number[] = [];
    let currentRowCount = 0;
    
    dataProps.forEach((dataProp) => {
      const propWidth = estimateDataPropWidth(dataProp.label);
      const spacing = 15; // Horizontal spacing between properties
      
      // More tolerant check: allow fitting if within available width or if it's the first item in a row
      // Also allow if adding this property would only slightly exceed (within 10% tolerance)
      const wouldExceed = currentRowWidth + propWidth + spacing > availableWidth;
      const exceedsBy = (currentRowWidth + propWidth + spacing) - availableWidth;
      const tolerance = availableWidth * 0.1; // 10% tolerance
      const fitsWithTolerance = wouldExceed && exceedsBy <= tolerance;
      
      if ((currentRowWidth + propWidth + spacing <= availableWidth || fitsWithTolerance) || currentRowCount === 0) {
        currentRowWidth += propWidth + spacing;
        currentRowCount++;
      } else {
        // Start new row
        propertiesPerRow.push(currentRowCount);
        currentRowWidth = propWidth + spacing;
        currentRowCount = 1;
      }
    });
    if (currentRowCount > 0) {
      propertiesPerRow.push(currentRowCount);
    }
    
    // Calculate positions with horizontal fan-out and alternating vertical positions
    const horizontalSpacing = 15;
    const verticalOffset = 25; // Vertical offset for alternating rows
    const baseYOffset = classNodeHeight / 2 + 20; // Start below the node
    
    let propIndex = 0;
    let currentX = classPos.x - (classNodeWidth / 2) - 50; // Start 50px to the left of node edge
    let currentY = classPos.y + baseYOffset;
    let rowIndex = 0;
    
    dataProps.forEach((dataProp) => {
      const propWidth = estimateDataPropWidth(dataProp.label);
      
      // Check if we need to start a new row
      if (propIndex > 0 && propertiesPerRow.length > 0) {
        let propsInPreviousRows = 0;
        for (let i = 0; i < rowIndex; i++) {
          propsInPreviousRows += propertiesPerRow[i];
        }
        if (propIndex >= propsInPreviousRows + propertiesPerRow[rowIndex]) {
          // Move to next row
          rowIndex++;
          currentX = classPos.x - (classNodeWidth / 2) - 50; // Reset X position
          currentY = classPos.y + baseYOffset + (rowIndex * (verticalOffset * 2)); // Alternate Y position
        }
      }
      
      // Calculate X position (centered within available width if row is not full)
      const propsInCurrentRow = propertiesPerRow[rowIndex] || 1;
      const totalRowWidth = dataProps
        .slice(propIndex, propIndex + propsInCurrentRow)
        .reduce((sum, p) => sum + estimateDataPropWidth(p.label) + horizontalSpacing, 0) - horizontalSpacing;
      
      // Center the row if it's shorter than available width
      const rowStartX = classPos.x - (classNodeWidth / 2) - 50;
      const rowCenterOffset = (availableWidth - totalRowWidth) / 2;
      const adjustedRowStartX = rowStartX + rowCenterOffset;
      
      // Calculate position for this property
      let xOffset = 0;
      for (let i = 0; i < propIndex - (rowIndex > 0 ? propertiesPerRow.slice(0, rowIndex).reduce((a, b) => a + b, 0) : 0); i++) {
        xOffset += estimateDataPropWidth(dataProps[propIndex - (propIndex - i - 1)]?.label || '') + horizontalSpacing;
      }
      
      // Simpler approach: just position sequentially
      const dataPropPos: { x: number; y: number } = {
        x: adjustedRowStartX + (propIndex - (rowIndex > 0 ? propertiesPerRow.slice(0, rowIndex).reduce((a, b) => a + b, 0) : 0)) * (propWidth + horizontalSpacing),
        y: currentY + (rowIndex % 2 === 0 ? 0 : verticalOffset), // Alternate up/down
      };
      
      // Actually, let me recalculate this more simply
      let rowStartIndex = 0;
      for (let i = 0; i < rowIndex; i++) {
        rowStartIndex += propertiesPerRow[i];
      }
      const positionInRow = propIndex - rowStartIndex;
      
      // Calculate total width of current row
      let rowTotalWidth = 0;
      for (let i = rowStartIndex; i < rowStartIndex + propertiesPerRow[rowIndex]; i++) {
        if (i < dataProps.length) {
          rowTotalWidth += estimateDataPropWidth(dataProps[i].label) + (i > rowStartIndex ? horizontalSpacing : 0);
        }
      }
      
      // Center the row
      const rowCenterX = classPos.x;
      const rowLeftX = rowCenterX - (rowTotalWidth / 2);
      
      // Position this property
      let xPos = rowLeftX;
      for (let i = rowStartIndex; i < propIndex; i++) {
        xPos += estimateDataPropWidth(dataProps[i].label) + horizontalSpacing;
      }
      xPos += estimateDataPropWidth(dataProp.label) / 2; // Center the property node
      
      const finalDataPropPos: { x: number; y: number } = {
        x: xPos,
        y: currentY + (rowIndex % 2 === 0 ? 0 : verticalOffset), // Alternate up/down for even/odd rows
      };
      
      const dp = dataProperties.find((p) => p.name === dataProp.propertyName);
      
      // Format the range URI to short format (e.g., "xsd:string")
      const rangeLabel = dp?.range ? formatRangeUri(dp.range) : 'xsd:string';
      
      // Apply search transparency if search query is active
      // Data property nodes inherit opacity from their associated class node
      let dataPropNodeOpacity = 1.0;
      let dataPropBackgroundColor = '#e8f4f8';
      let dataPropBorderColor = '#4a90a4';
      let dataPropFontColor = '#2c3e50';
      
      if (searchQuery) {
        // Use the class node's opacity category
        dataPropNodeOpacity = getSearchOpacity(classId, matchingNodeIds, neighborNodeIds);
        if (dataPropNodeOpacity < 1.0) {
          dataPropBackgroundColor = applyOpacityToColor('#e8f4f8', dataPropNodeOpacity);
          dataPropBorderColor = applyOpacityToColor('#4a90a4', dataPropNodeOpacity);
          dataPropFontColor = applyOpacityToColor('#2c3e50', dataPropNodeOpacity);
        }
      }
      
      // Debug: Log the actual label being set for the node
      console.log(`[DEBUG] Setting data property node label: propertyName="${dataProp.propertyName}", classId="${classId}", rangeLabel="${rangeLabel}", rangeUri="${dp?.range ?? 'N/A'}"`);
        
      const dataPropNode: Record<string, unknown> = {
        id: dataProp.id,
        label: wrapText(rangeLabel, wrapChars),
        shape: 'box',
        size: 15,
        color: { background: dataPropBackgroundColor, border: dataPropBorderColor },
        font: { size: dataPropertyFontSize, color: dataPropFontColor },
        margin: 4,
        physics: false,
        x: finalDataPropPos.x,
        y: finalDataPropPos.y,
        ...(dp?.comment && { title: dp.comment }),
      };
      
      // Apply opacity property if less than 1.0
      if (dataPropNodeOpacity < 1.0) {
        dataPropNode.opacity = dataPropNodeOpacity;
      }
      
      dataPropertyNodes.push(dataPropNode);
        
      propIndex++;
      
      // Format the property label for the edge (wrapped if needed)
      const edgeLabel = wrapText(dataProp.label, wrapChars);
      
      // Apply search transparency if search query is active
      // Data property edges inherit opacity from their associated class node
      let dataPropEdgeColor = '#4a90a4';
      let dataPropEdgeFontColor = '#666';
      
      if (searchQuery) {
        // Use the class node's opacity category
        const dataPropEdgeOpacity = getSearchOpacity(classId, matchingNodeIds, neighborNodeIds);
        if (dataPropEdgeOpacity < 1.0) {
          dataPropEdgeColor = applyOpacityToColor('#4a90a4', dataPropEdgeOpacity);
          dataPropEdgeFontColor = applyOpacityToColor('#666', dataPropEdgeOpacity);
        }
      }
      
      // Debug: Log the actual label being set for the edge
      console.log(`[DEBUG] Setting data property edge label: propertyName="${dataProp.propertyName}", classId="${classId}", edgeLabel="${edgeLabel}", isRestriction=${dataProp.isRestriction}`);
      
      // Create edge - thicker for restrictions, thinner dashed for normal
      // Arrow points from class (domain) to data property node (range type)
      if (dataProp.isRestriction) {
        dataPropertyEdges.push({
          id: `${classId}->${dataProp.id}:dataproprestrict`,
          from: classId,
          to: dataProp.id,
          arrows: 'to',
          label: edgeLabel,
          font: { size: relationshipFontSize, color: dataPropEdgeFontColor },
          color: { color: dataPropEdgeColor, highlight: dataPropEdgeColor },
          dashes: false, // Solid line
          width: 3, // Thicker line for restrictions
        });
      } else {
        dataPropertyEdges.push({
          id: `${classId}->${dataProp.id}:dataprop`,
          from: classId,
          to: dataProp.id,
          arrows: 'to',
          label: edgeLabel,
          font: { size: relationshipFontSize, color: dataPropEdgeFontColor },
          color: { color: dataPropEdgeColor, highlight: dataPropEdgeColor },
          dashes: [5, 5], // Dashed line
          width: 1, // Thinner line for normal data properties
        });
      }
    });
  });
  

  // Debug: Check describes edges before mapping to vis-network format
  const describesEdgesBeforeMapping = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  console.log(`[DEBUG] Describes edges before mapping to vis-network: ${describesEdgesBeforeMapping.length}`, describesEdgesBeforeMapping);
  
  const edges = filteredEdges.map((e) => {
    const style = edgeStyleConfig[e.type] || {
      showLabel: true,
      color: getDefaultColor(),
      lineType: 'solid' as BorderLineType,
    };
    const edgeComment = getRelationshipComment(e.type, objectProperties);
    
    // Styling based on whether edge is from restriction or domain/range
    // Thick continuous line for restrictions, thin dashed line for normal object properties
    const isRestriction = e.isRestriction ?? false;
    const width = isRestriction ? 3 : 1; // Thick for restrictions, thin for normal
    const dashes = isRestriction ? false : [5, 5]; // Continuous for restrictions, dashed for normal
    
    // Apply search transparency if search query is active
    let edgeColor = style.color;
    let edgeFontColor = '#2c3e50';
    
    if (searchQuery) {
      const edgeId = `${e.from}->${e.to}:${e.type}`;
      // Determine edge opacity based on whether it's matching, neighbor, or other
      let edgeOpacity = 1.0;
      if (matchingEdgeIds.has(edgeId)) {
        edgeOpacity = 1.0; // Matching edge
      } else if (neighborEdgeIds.has(edgeId)) {
        edgeOpacity = 0.65; // Neighbor edge
      } else {
        // Check if either endpoint is matching or neighbor
        const fromOpacity = getSearchOpacity(e.from, matchingNodeIds, neighborNodeIds);
        const toOpacity = getSearchOpacity(e.to, matchingNodeIds, neighborNodeIds);
        edgeOpacity = Math.max(fromOpacity, toOpacity); // Use the higher opacity of the two endpoints
      }
      
      if (edgeOpacity < 1.0) {
        edgeColor = applyOpacityToColor(style.color, edgeOpacity);
        edgeFontColor = applyOpacityToColor('#2c3e50', edgeOpacity);
      }
    }
    
    // Debug: Log describes edge mapping
    if (e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')) {
      console.log(`[DEBUG] Mapping describes edge to vis-network:`, {
        from: e.from,
        to: e.to,
        type: e.type,
        style: style,
        edgeId: `${e.from}->${e.to}:${e.type}`,
        isRestriction: isRestriction,
      });
    }
    
    return {
      id: `${e.from}->${e.to}:${e.type}`,
      from: e.from,
      to: e.to,
      arrows: 'to',
      label: style.showLabel ? getEdgeDisplayLabel(e, objectProperties, externalOntologyReferences) : '',
      font: { size: relationshipFontSize, color: edgeFontColor },
      color: { color: edgeColor, highlight: edgeColor },
      dashes,
      width,
      ...(edgeComment && { title: edgeComment }),
    };
  });
  
  // Debug: Check describes edges after mapping
  const describesEdgesAfterMapping = edges.filter((e) => 
    (e.id as string).includes('describes')
  );
  console.log(`[DEBUG] Describes edges after mapping to vis-network: ${describesEdgesAfterMapping.length}`, describesEdgesAfterMapping);

  // Deduplicate edges by id (same from, to, and type)
  const edgeMap = new Map<string, Record<string, unknown>>();
  edges.forEach((edgeObj) => {
    const edgeId = edgeObj.id as string;
    if (!edgeMap.has(edgeId)) {
      edgeMap.set(edgeId, edgeObj as Record<string, unknown>);
    } else {
      // Duplicate edge found - log it
      console.warn('Duplicate edge detected:', edgeId, edgeObj);
    }
  });
  const uniqueEdges = Array.from(edgeMap.values());
  
  // Assign smooth curves to overlapping edges (same node pair) to avoid label/line overlap
  const pairToEdges = new Map<string, Array<Record<string, unknown>>>();
  uniqueEdges.forEach((edgeObj) => {
    const pairKey = [edgeObj.from, edgeObj.to].sort().join('|');
    if (!pairToEdges.has(pairKey)) pairToEdges.set(pairKey, []);
    pairToEdges.get(pairKey)!.push(edgeObj);
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
  // Combine regular edges with data property edges (use deduplicated edges)
  const allEdges = [...uniqueEdges, ...dataPropertyEdges];
  
  // Debug: Final check for describes edges
  const describesEdgesFinal = allEdges.filter((e) => 
    (e.id as string).includes('describes')
  );
  console.log(`[DEBUG] ===== FINAL: Describes edges in allEdges: ${describesEdgesFinal.length} =====`);
  if (describesEdgesFinal.length > 0) {
    console.log('[DEBUG] ✓ Describes edges will be rendered:', describesEdgesFinal);
  } else {
    console.warn('[DEBUG] ⚠ NO describes edges in final allEdges - edge will NOT appear in graph!');
    console.log('[DEBUG] Summary of filtering:');
    console.log(`  - Total edges in rawData.edges: ${rawData.edges.length}`);
    console.log(`  - Describes edges in rawData.edges: ${rawData.edges.filter((e) => e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')).length}`);
    console.log(`  - Filtered edges after node filtering: ${filteredEdges.length}`);
    console.log(`  - Edges after style filtering: ${filteredEdges.length}`);
    console.log(`  - Edges mapped to vis-network: ${edges.length}`);
    console.log(`  - Unique edges (after deduplication): ${uniqueEdges.length}`);
  }

  return {
    nodes: new DataSet(allNodes),
    edges: new DataSet(allEdges),
  };
}

function updateSelectionInfoDisplay(net: Network): void {
  const nodeIds = net.getSelectedNodes().map(String);
  if (nodeIds.length === 0) {
    updateStatusBarSelection('');
  } else if (nodeIds.length === 1) {
    const node = rawData.nodes.find((n) => n.id === nodeIds[0]);
    updateStatusBarSelection(` | Selected: ${node?.label ?? nodeIds[0]} | Labellable: ${node?.labellableRoot ?? 'N/A'}`);
  } else {
    updateStatusBarSelection(` | Selected: ${nodeIds.length} nodes`);
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
  /** Node/edge under cursor at right mousedown (so context menu uses exact click target, not mouseup). */
  let rightClickNodeId: string | null = null;
  let rightClickEdgeId: string | null = null;

  // Prevent browser's default context menu on the container
  container.oncontextmenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };
  
  // Also add event listener to catch contextmenu events (more reliable)
  container.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true); // Use capture phase to catch early

  const getContainerCoords = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: MouseEvent) => {
    const target = e.target as Node;
    // Check if click is within the container (including canvas elements)
    if (!container.contains(target) && !container.isSameNode(target)) {
      // Also check if the target is a child of the container's canvas
      const canvas = container.querySelector('canvas');
      if (!canvas || !canvas.contains(target)) return;
    }
    const coords = getContainerCoords(e);
    if (e.button === RIGHT_BUTTON) {
      // Check if clicking on a node or edge
      const nodeAt = net.getNodeAt(coords);
      const edgeAt = net.getEdgeAt(coords);
      
      // If clicking on node/edge, don't start panning; store target for context menu (exact click position)
      if (nodeAt != null || edgeAt != null) {
        rightPanStart = null;
        rightClickNodeId = nodeAt != null ? String(nodeAt) : null;
        rightClickEdgeId = edgeAt != null ? String(edgeAt) : null;
        return;
      }
      rightClickNodeId = null;
      rightClickEdgeId = null;

      // Otherwise, start panning on empty canvas
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
    if (e.button === RIGHT_BUTTON) {
      const target = e.target as Node;
      const isInContainer = container.contains(target) || container.isSameNode(target) || 
                           (container.querySelector('canvas')?.contains(target) ?? false);
      
      // Prevent browser's default context menu
      if (isInContainer) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      // Check if we were panning (rightPanStart exists) or if we should show context menu
      if (!rightPanStart && isInContainer) {
        // Show context menu; use node/edge stored at mousedown so target is exact (e.g. data property node)
        showContextMenu(e, net, container, rightClickNodeId, rightClickEdgeId);
      }
      rightPanStart = null;
      rightClickNodeId = null;
      rightClickEdgeId = null;
    }
  };

  const handleMouseLeave = () => {
    rightPanStart = null;
  };

  // Prevent browser context menu on container and all its children (including canvas)
  const handleContextMenu = (e: MouseEvent) => {
    const target = e.target as Node;
    if (container.contains(target) || container.isSameNode(target)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  };
  
  container.addEventListener('contextmenu', handleContextMenu, true); // Capture phase
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
    // Don't interfere with manipulation UI unless we're in add node mode
    if (target.closest?.('.vis-manipulation') && !addNodeMode) return;
    
    // Only handle clicks on the canvas itself when in add node mode
    if (!addNodeMode) return;
    
    // Check if click is on the network canvas (not on UI elements)
    if (!container.contains(target) && !target.closest('#network')) return;
    
    const rect = container.getBoundingClientRect();
    const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const nodeAt = net.getNodeAt(domPos);
    if (nodeAt != null) {
      // Clicked on a node, exit add node mode
      addNodeMode = false;
      return;
    }
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
      const selectedIds = net.getSelectedNodes().map(String);
      if (selectedIds.length > 1 && selectedIds.includes(nodeId)) {
        showMultiEditModal(selectedIds);
      } else {
        openEditModalForNode(nodeId);
      }
      return;
    }
    const edgeAt = net.getEdgeAt(domPos);
    if (edgeAt != null) {
      openEditModalForEdge(String(edgeAt));
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
    if (addNodeMode && !clickedNode) {
      const srcEvent = params.event?.srcEvent;
      const pointer = params.event?.pointer;
      
      // Try to get position from srcEvent first, then from pointer
      let domPos: { x: number; y: number } | null = null;
      if (srcEvent && container) {
        const rect = container.getBoundingClientRect();
        domPos = { x: srcEvent.clientX - rect.left, y: srcEvent.clientY - rect.top };
      } else if (pointer?.DOM) {
        domPos = pointer.DOM;
      }
      
      if (domPos) {
        const nodeAt = net.getNodeAt(domPos);
        if (nodeAt == null) {
          const canvasPos = net.DOMtoCanvas(domPos);
          showAddNodeModal(canvasPos.x, canvasPos.y);
          return; // Return early to prevent other handlers
        }
      }
      return;
    }

    // If in add node mode and a node is clicked, exit add node mode
    if (addNodeMode && clickedNode) {
      addNodeMode = false;
      return;
    }

    // If not in add node mode and no node clicked, don't do anything
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


function updateSaveButtonVisibility(): void {
  const group = document.getElementById('saveGroup');
  if (group) {
    group.style.display = hasUnsavedChanges ? 'inline-flex' : 'none';
  }
}

function updateFilePathDisplay(): void {
  updateStatusBarFilePath(loadedFilePath);
}

function showRenameModal(
  nodeId: string,
  currentLabel: string,
  _labellableRoot: boolean | null
): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const titleEl = modal.querySelector('h3');
  if (titleEl) titleEl.textContent = 'Edit node';
  modal.dataset.mode = 'single';
  delete modal.dataset.nodeIds;
  input.value = currentLabel;
  input.disabled = false;
  input.style.color = '';
  input.dataset.nodeId = nodeId;
  const renameDupErr = document.getElementById('renameDuplicateError') as HTMLElement;
  if (renameDupErr) { renameDupErr.style.display = 'none'; renameDupErr.textContent = ''; }
  refreshRenameModalFromInput();
  const node = rawData.nodes.find((n) => n.id === nodeId);
  const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
  if (commentInput) commentInput.value = node?.comment ?? '';

  const renameIdentifierLabel = document.getElementById('renameIdentifierLabel');
  const renameIdentifier = document.getElementById('renameIdentifier');
  if (renameIdentifierLabel) (renameIdentifierLabel as HTMLElement).style.display = '';
  if (renameIdentifier) (renameIdentifier as HTMLElement).style.display = '';
  renameModalExampleImageUris = node?.exampleImages ?? [];
  const exampleImagesContainer = document.getElementById('renameExampleImagesSection');
  if (exampleImagesContainer && ttlStore) {
    exampleImagesContainer.style.display = 'block';
    initExampleImagesSection(exampleImagesContainer, {
      nodeId,
      isLocal: !!fileHandle,
      initialUris: renameModalExampleImageUris,
      onAddImage: async (file: File) => {
        const dir = await getOrRequestImageDirectory(fileHandle);
        if (!dir || !ttlStore) return null;
        const relativePath = getSafeExampleImageFileName(nodeId, renameModalExampleImageUris, file.name);
        await writeExampleImageFile(dir, relativePath, file);
        // Do not mutate the store here; confirmRename will apply the final list on Save.
        // Otherwise cancelling the modal would leave phantom image refs in the store.
        return relativePath;
      },
      onDelete: () => {},
      onOpen: (uri: string) => openExampleImageUri(uri, getCachedImageDirectory()),
      onUrisChange: (uris: string[]) => { renameModalExampleImageUris = uris; },
    });
  } else if (exampleImagesContainer) {
    exampleImagesContainer.style.display = 'none';
  }
  
  // Render annotation properties
  const annotPropsSection = document.getElementById('renameAnnotationPropsSection');
  if (annotPropsSection) {
    if (annotationProperties.length === 0) {
      annotPropsSection.style.display = 'none';
    } else {
      annotPropsSection.style.display = 'block';
      nodeModalFormUi.renderRenameModalAnnotationPropsList(nodeId, node, annotationProperties);
    }
  }
  
  const dataPropsSection = document.getElementById('renameDataPropsSection');
  if (dataPropsSection) {
    if (dataProperties.length === 0) {
      dataPropsSection.style.display = 'none';
    } else {
      dataPropsSection.style.display = 'block';
      renameModalInitialDataProps = node?.dataPropertyRestrictions ? [...node.dataPropertyRestrictions] : [];
      renameModalDataPropertyRestrictions = node?.dataPropertyRestrictions ? [...node.dataPropertyRestrictions] : [];
      nodeModalFormUi.renderRenameModalDataPropsList(renameModalDataPropertyRestrictions, dataProperties, onRemoveRenameDataProp);
      nodeModalFormUi.updateRenameDataPropAddButtonState();
    }
  }
  modal.style.display = 'flex';
  input.focus();
  input.select();
}

function showMultiEditModal(nodeIds: string[]): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  modal.dataset.mode = 'multi';
  modal.dataset.nodeIds = JSON.stringify(nodeIds);
  delete input.dataset.nodeId;
  input.value = 'multiple nodes selected';
  input.disabled = true;
  input.style.color = '#999';
  const nodes = nodeIds.map((id) => rawData.nodes.find((n) => n.id === id)).filter(Boolean) as GraphNode[];
  const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
  const comments = nodes.map((n) => n.comment ?? '').filter((c) => c);
  if (commentInput) {
    commentInput.value = comments.length > 0 && comments.every((c) => c === comments[0]) ? comments[0] : '';
    commentInput.disabled = false;
  }
  const annotPropsSection = document.getElementById('renameAnnotationPropsSection');
  if (annotPropsSection) annotPropsSection.style.display = 'none';
  const dataPropsSection = document.getElementById('renameDataPropsSection');
  if (dataPropsSection) dataPropsSection.style.display = 'none';
  const exampleImagesSection = document.getElementById('renameExampleImagesSection');
  if (exampleImagesSection) exampleImagesSection.style.display = 'none';
  const renameIdentifierLabel = document.getElementById('renameIdentifierLabel');
  const renameIdentifier = document.getElementById('renameIdentifier');
  if (renameIdentifierLabel) (renameIdentifierLabel as HTMLElement).style.display = 'none';
  if (renameIdentifier) (renameIdentifier as HTMLElement).style.display = 'none';
  modal.style.display = 'flex';
  commentInput?.focus();
}

// hideRenameModal moved to ui/modals.ts

let addNodeSearchTimeout: ReturnType<typeof setTimeout> | null = null;
let selectedExternalClass: ExternalClassInfo | null = null;

function onRemoveRenameDataProp(name: string): void {
  renameModalDataPropertyRestrictions = renameModalDataPropertyRestrictions.filter((r) => r.propertyName !== name);
  nodeModalFormUi.renderRenameModalDataPropsList(renameModalDataPropertyRestrictions, dataProperties, onRemoveRenameDataProp);
}
function onRemoveAddNodeDataProp(name: string): void {
  addNodeDataPropertyRestrictions = addNodeDataPropertyRestrictions.filter((r) => r.propertyName !== name);
  nodeModalFormUi.renderAddNodeDataPropsList(addNodeDataPropertyRestrictions, dataProperties, onRemoveAddNodeDataProp);
}
function refreshRenameModalFromInput(): void {
  const modal = document.getElementById('renameModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const nodeId = input?.dataset.nodeId ?? '';
  nodeModalFormUi.syncRenameModal({ store: ttlStore, nodeId, label: input?.value?.trim() ?? '', existingIds: new Set(rawData.nodes.map((n) => n.id)) });
}
function refreshAddNodeOkButton(): void {
  const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
  const customTabContent = document.getElementById('addNodeCustomTab');
  const isCustomTab = customTabContent && customTabContent.style.display !== 'none';
  nodeModalFormUi.syncAddNodeModal({
    store: ttlStore,
    existingIds: new Set(rawData.nodes.map((n) => n.id)),
    label: customInput?.value?.trim() ?? '',
    externalLabel: selectedExternalClass?.label ?? null,
    isCustomTab: !!isCustomTab,
  });
}

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
  const addNodeComment = document.getElementById('addNodeComment') as HTMLTextAreaElement;
  if (addNodeComment) addNodeComment.value = '';
  const dupErr = document.getElementById('addNodeDuplicateError') as HTMLElement;
  const extDupErr = document.getElementById('addNodeExternalDuplicateError') as HTMLElement;
  if (dupErr) { dupErr.style.display = 'none'; dupErr.textContent = ''; }
  if (extDupErr) { extDupErr.style.display = 'none'; extDupErr.textContent = ''; }
  addNodeExampleImageUris = [];
  addNodeDataPropertyRestrictions = [];
  const addNodeAnnotationPropsSection = document.getElementById('addNodeAnnotationPropsSection');
  if (addNodeAnnotationPropsSection) {
    if (annotationProperties.length === 0) {
      addNodeAnnotationPropsSection.style.display = 'none';
    } else {
      addNodeAnnotationPropsSection.style.display = 'block';
      nodeModalFormUi.renderAddNodeAnnotationPropsList(annotationProperties);
    }
  }
  const addNodeDataPropsSection = document.getElementById('addNodeDataPropsSection');
  if (addNodeDataPropsSection) {
    if (dataProperties.length === 0) {
      addNodeDataPropsSection.style.display = 'none';
    } else {
      addNodeDataPropsSection.style.display = 'block';
      nodeModalFormUi.renderAddNodeDataPropsList(addNodeDataPropertyRestrictions, dataProperties, onRemoveAddNodeDataProp);
    }
  }
  const addNodeExampleImagesContainer = document.getElementById('addNodeExampleImagesSection');
  if (addNodeExampleImagesContainer && ttlStore) {
    addNodeExampleImagesContainer.style.display = 'block';
    initExampleImagesSection(addNodeExampleImagesContainer, {
      nodeId: '__new',
      isLocal: !!fileHandle,
      initialUris: [],
      onAddImage: async (file: File) => {
        const dir = await getOrRequestImageDirectory(fileHandle);
        if (!dir || !ttlStore) return null;
        const relativePath = getSafeExampleImageFileName('__new', addNodeExampleImageUris, file.name);
        await writeExampleImageFile(dir, relativePath, file);
        return relativePath;
      },
      onDelete: () => {},
      onOpen: (uri: string) => openExampleImageUri(uri, getCachedImageDirectory()),
      onUrisChange: (uris: string[]) => { addNodeExampleImageUris = uris; },
    });
  }
  const resultsDiv = document.getElementById('addNodeExternalResults');
  const descDiv = document.getElementById('addNodeExternalDescription');
  if (resultsDiv) resultsDiv.style.display = 'none';
  if (descDiv) descDiv.style.display = 'none';
  
  okBtn.disabled = true;
  modal.style.display = 'flex';
  if (customInput) customInput.focus();
}

// hideAddNodeModal wrapper - state cleanup still needed in main.ts
function hideAddNodeModalWithCleanup(): void {
  pendingAddNodePosition = null;
  addNodeMode = false;
  selectedExternalClass = null;
  addNodeExampleImageUris = [];
  addNodeDataPropertyRestrictions = [];
  if (addNodeSearchTimeout) {
    clearTimeout(addNodeSearchTimeout);
    addNodeSearchTimeout = null;
  }
  hideAddNodeModal();
}

async function handleExternalClassSearch(query: string): Promise<void> {
  const resultsDiv = document.getElementById('addNodeExternalResults');
  const descDiv = document.getElementById('addNodeExternalDescription');
  
  if (!query.trim()) {
    if (resultsDiv) resultsDiv.style.display = 'none';
    if (descDiv) descDiv.style.display = 'none';
    selectedExternalClass = null;
    refreshAddNodeOkButton();
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
    refreshAddNodeOkButton();
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
          refreshAddNodeOkButton();
        });
      });
    }
    if (descDiv) descDiv.style.display = 'none';
    selectedExternalClass = results[0]; // Auto-select first result
    }
    
    refreshAddNodeOkButton();
  } catch (err) {
    console.error('Search error:', err);
    if (resultsDiv) {
      resultsDiv.innerHTML = '<div style="padding: 8px; color: #d32f2f; font-size: 11px;">Error searching external ontologies. Check console for details.</div>';
      resultsDiv.style.display = 'block';
    }
    if (descDiv) descDiv.style.display = 'none';
    selectedExternalClass = null;
    refreshAddNodeOkButton();
  }
}

function confirmAddNode(): void {
  if (!pendingAddNodePosition) return;
  const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
  const customTabContent = document.getElementById('addNodeCustomTab');
  const isCustomTab = customTabContent && customTabContent.style.display !== 'none';
  const dupErr = document.getElementById('addNodeDuplicateError') as HTMLElement;
  const extDupErr = document.getElementById('addNodeExternalDuplicateError') as HTMLElement;

  const { x, y } = pendingAddNodePosition;

  if (isCustomTab) {
    const label = customInput?.value?.trim();
    if (!label) return;
    if (!ttlStore) return;
    const displayLabel = label.trim() || 'New class';
    const id = addNodeToStore(ttlStore, displayLabel);
    if (!id) {
      if (dupErr) {
        dupErr.textContent = ADD_NODE_DUPLICATE_MESSAGE;
        dupErr.style.display = 'block';
      }
      return;
    }
    const node: GraphNode = {
      id,
      label: displayLabel,
      labellableRoot: null,
      ...(x != null && y != null && { x, y }),
    };
    rawData.nodes.push(node);
    const commentInput = document.getElementById('addNodeComment') as HTMLTextAreaElement;
    const newComment = commentInput?.value?.trim() ?? '';
    const annotationValues: Record<string, boolean | string | null> = {};
    annotationProperties.forEach((ap) => {
      if (ap.isBoolean) {
        const checkbox = document.getElementById(`addNodeAnnotProp_${ap.name}`) as HTMLInputElement;
        annotationValues[ap.name] = checkbox ? (checkbox.indeterminate ? null : checkbox.checked) : null;
      } else {
        const inputEl = document.getElementById(`addNodeAnnotProp_${ap.name}`) as HTMLInputElement;
        annotationValues[ap.name] = inputEl?.value?.trim() || null;
      }
    });
    const addNodeFormData: NodeFormData = {
      comment: newComment,
      exampleImageUris: addNodeExampleImageUris,
      annotationValues,
      dataPropertyRestrictions: addNodeDataPropertyRestrictions,
    };
    const baseIri = getClassNamespace(ttlStore) ?? getMainOntologyBase(ttlStore) ?? BASE_IRI;
    applyNodeFormToStore(id, addNodeFormData, ttlStore, node, baseIri, annotationProperties);
    pushUndoable(
      () => {
        for (const r of addNodeFormData.dataPropertyRestrictions) {
          removeDataPropertyRestrictionFromClass(ttlStore!, id, r.propertyName);
        }
        removeNodeFromStore(ttlStore!, id);
        const i = rawData.nodes.findIndex((n) => n.id === id);
        if (i >= 0) rawData.nodes.splice(i, 1);
      },
      () => {
        addNodeToStore(ttlStore!, displayLabel, id);
        rawData.nodes.push(node);
        applyNodeFormToStore(id, addNodeFormData, ttlStore!, node, baseIri, annotationProperties);
      }
    );
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    applyFilter(true);
    hideAddNodeModalWithCleanup();
    return;
  }

  // Add from external ontology
  if (!selectedExternalClass || !ttlStore) return;
  const label = selectedExternalClass.label;
  const comment = selectedExternalClass.comment
    ? `${selectedExternalClass.comment}\n\n(Imported from ${selectedExternalClass.ontologyUrl})`
    : `(Imported from ${selectedExternalClass.ontologyUrl})`;

  const result = addNewNodeAtPosition(x, y, label);
  if (result === null) {
    if (extDupErr) {
      extDupErr.textContent = ADD_NODE_DUPLICATE_MESSAGE;
      extDupErr.style.display = 'block';
    }
    return;
  }
  if (comment) {
    updateCommentInStore(ttlStore, result.id, comment);
    const node = rawData.nodes.find((n) => n.id === result.id);
    if (node) node.comment = comment;
  }
  applyFilter(true);
  hideAddNodeModalWithCleanup();
}

// Relationship utility functions moved to ui/relationshipUtils.ts

let selectedEdgeType: string | null = null;
let selectedExternalObjectProperty: ExternalObjectPropertyInfo | null = null;

// Wrapper for updateEditEdgeCommentDisplay that updates the DOM
function updateEditEdgeCommentDisplayLocal(): void {
  const typeInput = document.getElementById('editEdgeType') as HTMLInputElement;
  const commentEl = document.getElementById('editEdgeComment') as HTMLElement;
  if (!typeInput || !commentEl) return;
  
  const comment = updateEditEdgeCommentDisplay(
    selectedEdgeType,
    selectedExternalObjectProperty,
    typeInput.value,
    objectProperties
  );
  
  if (comment) {
    commentEl.textContent = comment;
    commentEl.style.display = 'block';
  } else {
    commentEl.textContent = '';
    commentEl.style.display = 'none';
  }
}

async function updateEditEdgeTypeSearch(query: string): Promise<void> {
  const resultsDiv = document.getElementById('editEdgeTypeResults');
  const typeInput = document.getElementById('editEdgeType') as HTMLInputElement;
  if (!resultsDiv || !typeInput) return;
  
  const q = query.toLowerCase().trim();
  if (q.length < 1) {
    resultsDiv.innerHTML = '';
    resultsDiv.style.display = 'none';
    hideRelationshipTooltip();
    selectedEdgeType = null;
    selectedExternalObjectProperty = null;
    updateEditEdgeCommentDisplayLocal();
    return;
  }
  
  // Search local object properties
  const allTypes = getAllEdgeTypes(rawData, objectProperties);
  const localMatches: Array<{ type: string; label: string; displayLabel: string; comment: string | null; isExternal: boolean; externalProp: ExternalObjectPropertyInfo | null }> = allTypes.filter((t) => {
    const label = getRelationshipLabel(t, objectProperties, externalOntologyReferences);
    const displayLabel = formatRelationshipLabelWithPrefix(t, label, externalOntologyReferences);
    return label.toLowerCase().includes(q) || 
           displayLabel.toLowerCase().includes(q) ||
           t.toLowerCase().includes(q);
  }).map((t) => {
    const comment = getRelationshipComment(t, objectProperties);
    return {
      type: t,
      label: getRelationshipLabel(t, objectProperties, externalOntologyReferences),
      displayLabel: formatRelationshipLabelWithPrefix(t, getRelationshipLabel(t, objectProperties, externalOntologyReferences), externalOntologyReferences),
      comment: comment || null,
      isExternal: false,
      externalProp: null as ExternalObjectPropertyInfo | null,
    };
  });
  
  // Search external object properties
  let externalMatches: Array<{ type: string; label: string; displayLabel: string; comment: string | null; isExternal: boolean; externalProp: ExternalObjectPropertyInfo | null }> = [];
  if (externalOntologyReferences.length > 0) {
    try {
      console.log(`Searching external object properties for "${query}" across ${externalOntologyReferences.length} reference(s):`, externalOntologyReferences.map(r => r.url));
      const externalProps = await searchExternalObjectProperties(query, externalOntologyReferences);
      console.log(`Found ${externalProps.length} external object properties matching "${query}"`);
      externalMatches = externalProps.map((op) => {
        const displayLabel = op.prefix ? `${op.prefix}: ${op.label}` : op.label;
        console.log(`External property: ${op.uri} -> ${displayLabel}`);
        return {
          type: op.uri, // Use full URI for external properties
          label: op.label,
          displayLabel,
          comment: op.comment || null,
          isExternal: true,
          externalProp: op,
        };
      });
    } catch (err) {
      console.error('Error searching external object properties:', err);
    }
  } else {
    console.log('No external ontology references loaded, skipping external object property search');
  }
  
  // Combine and sort matches (local first, then external)
  const allMatches = [...localMatches, ...externalMatches];
  
  if (allMatches.length === 0) {
    resultsDiv.innerHTML = '<div style="padding: 8px; color: #999;">No matches</div>';
    resultsDiv.style.display = 'block';
    selectedEdgeType = null;
    selectedExternalObjectProperty = null;
  } else if (allMatches.length === 1) {
    // Auto-select single match
    const match = allMatches[0];
    if (match.isExternal && match.externalProp) {
      selectedExternalObjectProperty = match.externalProp;
      selectedEdgeType = match.type; // Store the URI
    } else {
      selectedEdgeType = match.type;
      selectedExternalObjectProperty = null;
    }
    typeInput.value = match.displayLabel;
    resultsDiv.style.display = 'none';
    updateEditEdgeCommentDisplayLocal();
  } else {
    // Match dropdown width to input field width and align it properly
    // The dropdown is positioned absolutely within the label (which has position: relative)
    // The input field starts after the "Relationship: " text, so we need to align with it
    const labelElement = typeInput.closest('label');
    if (labelElement) {
      // Use getBoundingClientRect to get accurate positioning
      // Then calculate relative to the label
      const labelRect = labelElement.getBoundingClientRect();
      const inputRect = typeInput.getBoundingClientRect();
      
      // Calculate input position relative to label
      const inputLeftRelative = inputRect.left - labelRect.left;
      const inputWidth = inputRect.width;
      
      // Set dropdown width to match input width and position it to align with input
      // Add 60px offset to the right to fix alignment
      resultsDiv.style.width = `${inputWidth}px`;
      resultsDiv.style.left = `${inputLeftRelative + 60}px`;
    } else {
      // Fallback: match input width
      const inputRect = typeInput.getBoundingClientRect();
      resultsDiv.style.width = `${inputRect.width}px`;
      resultsDiv.style.left = '0';
    }
    
    resultsDiv.innerHTML = allMatches.map((match, idx) => {
      const source = match.isExternal ? '<span style="font-size: 9px; color: #999; margin-left: 4px;">(external)</span>' : '';
      const comment = match.comment || '';
      // Add title attribute for native browser tooltip, and data attribute for custom tooltip
      const titleAttr = comment ? `title="${comment.replace(/"/g, '&quot;')}"` : '';
      return `<div class="edit-edge-type-result" data-index="${idx}" data-comment="${comment.replace(/"/g, '&quot;')}" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; position: relative; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;" ${titleAttr}>${match.displayLabel}${source}</div>`;
    }).join('');
    resultsDiv.style.display = 'block';
    
    // Add click handlers and hover tooltips
    resultsDiv.querySelectorAll('.edit-edge-type-result').forEach((el) => {
      const resultEl = el as HTMLElement;
      const idx = parseInt(resultEl.dataset.index || '0', 10);
      const match = allMatches[idx];
      const comment = match.comment;
      
      // Hover handlers for background color and tooltip
      resultEl.addEventListener('mouseenter', () => {
        resultEl.style.background = '#f0f7ff';
        // Show tooltip if comment exists
        if (comment) {
          showRelationshipTooltip(resultEl, comment);
        }
      });
      
      resultEl.addEventListener('mouseleave', () => {
        resultEl.style.background = 'transparent';
        hideRelationshipTooltip();
      });
      
      // Click handler
      resultEl.addEventListener('click', () => {
        if (match.isExternal && match.externalProp) {
          selectedExternalObjectProperty = match.externalProp;
          selectedEdgeType = match.type; // Store the URI
        } else {
          selectedEdgeType = match.type;
          selectedExternalObjectProperty = null;
        }
        typeInput.value = match.displayLabel;
        resultsDiv.style.display = 'none';
        hideRelationshipTooltip();
        updateEditEdgeCommentDisplayLocal();
      });
    });
  }
}

/** Open the appropriate edit modal for a node (class rename, data property restriction, or normal data property). */
function openEditModalForNode(nodeId: string): void {
  // Handle data property restriction nodes
  if (nodeId.startsWith('__dataproprestrict__')) {
    const match = nodeId.match(/^__dataproprestrict__(.+)__(.+)$/);
    if (match) {
      const [, classId, propertyName] = match;
      showEditEdgeModal(nodeId, classId, 'dataprop');
      return;
    }
  }
  // Handle normal data property nodes (not restrictions)
  if (nodeId.startsWith('__dataprop__')) {
    const match = nodeId.match(/^__dataprop__(.+)__(.+)$/);
    if (match) {
      const [, classId, propertyName] = match;
      showEditDataPropertyModal(propertyName);
      return;
    }
  }
  // Handle regular class nodes
  const node = rawData.nodes.find((n) => n.id === nodeId);
  if (node) {
    showRenameModal(nodeId, node.label, node.labellableRoot);
  }
}

/** Open the appropriate edit modal for an edge (object property or data property). Normalizes dataproprestrict -> dataprop. */
function openEditModalForEdge(edgeId: string): void {
  const edgeIdStr = String(edgeId);
  const arrowIndex = edgeIdStr.indexOf('->');
  if (arrowIndex === -1) return;
  const from = edgeIdStr.substring(0, arrowIndex);
  const afterArrow = edgeIdStr.substring(arrowIndex + 2);
  const colonIndex = afterArrow.indexOf(':');
  if (colonIndex === -1) return;
  const to = afterArrow.substring(0, colonIndex);
  const type = afterArrow.substring(colonIndex + 1);
  const edgeType = type === 'dataproprestrict' || type === 'dataprop' ? 'dataprop' : type;
  
  // For data property edges, extract the property name and open the data property modal
  // Edge direction: classId -> dataProp.id (arrow points to range type node)
  if (edgeType === 'dataprop') {
    // Parse the 'to' node ID to extract property name (since arrow now points to the data property node)
    // Pattern: __dataproprestrict__${classId}__${propertyName} or __dataprop__${classId}__${propertyName}
    let match = to.match(/^__dataproprestrict__(.+)__(.+)$/);
    if (!match) {
      match = to.match(/^__dataprop__(.+)__(.+)$/);
    }
    if (match) {
      const [, , propertyName] = match;
      showEditDataPropertyModal(propertyName);
      return;
    }
  }
  
  showEditEdgeModal(from, to, edgeType);
}

function showEditEdgeModal(edgeFrom: string, edgeTo: string, edgeType: string): void {
  const modal = document.getElementById('editEdgeModal');
  if (!modal) {
    console.error('[showEditEdgeModal] editEdgeModal element not found!');
    return;
  }
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap')!;
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;

  const isDataPropertyEdge = edgeType === 'dataprop';
  
  if (isDataPropertyEdge) {
    // For data property edges, parse the data property node ID to get the class and property
    // Handle both restriction nodes (__dataproprestrict__) and generic property nodes (__dataprop__)
    let match = edgeFrom.match(/^__dataproprestrict__(.+)__(.+)$/);
    if (!match) {
      match = edgeFrom.match(/^__dataprop__(.+)__(.+)$/);
      // For normal data properties (not restrictions), open the "Edit Data Property" modal instead
      if (match) {
        const [, classId, propertyName] = match;
        hideEditEdgeModalWithCleanup();
        showEditDataPropertyModal(propertyName);
        return;
      }
      hideEditEdgeModalWithCleanup();
      return;
    }
    const [, classId, propertyName] = match;
    
    modal.dataset.mode = 'edit';
    modal.dataset.oldFrom = edgeFrom;
    modal.dataset.oldTo = edgeTo;
    modal.dataset.oldType = edgeType;
    modal.dataset.dataPropertyName = propertyName;
    modal.dataset.classId = classId;
    
    const classNode = rawData.nodes.find((n) => n.id === classId);
    const restriction = classNode?.dataPropertyRestrictions?.find((r) => r.propertyName === propertyName);
    
    // For data properties, show the data property name and class, but disable editing
    fromSel.disabled = true;
    toSel.disabled = true;
    const typeInput = document.getElementById('editEdgeType') as HTMLInputElement;
    if (typeInput) {
      typeInput.disabled = true;
      typeInput.value = 'dataprop (data property)';
      selectedEdgeType = 'dataprop';
      selectedExternalObjectProperty = null;
    }
    
    // Constrain select widths to prevent modal from expanding too wide
    fromSel.style.maxWidth = '350px';
    toSel.style.maxWidth = '350px';
    if (typeInput) {
      typeInput.style.maxWidth = '350px';
    }
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
    // Find all matching edges first
    const allMatchingEdges = rawData.edges.filter((e) => e.from === edgeFrom && e.to === edgeTo && e.type === edgeType);
    
    // ALWAYS prioritize restriction edges - they have the actual cardinality constraints
    let edge = allMatchingEdges.find((e) => e.isRestriction === true);
    if (!edge && allMatchingEdges.length > 0) {
      // Fall back to any matching edge if no restriction edge found
      edge = allMatchingEdges[0];
      console.warn('[DEBUG] No restriction edge found, using fallback:', {
        edgeFrom,
        edgeTo,
        edgeType,
        allMatchingEdges,
        selectedEdge: edge,
      });
    } else if (!edge) {
      console.error('[DEBUG] No matching edge found at all:', {
        edgeFrom,
        edgeTo,
        edgeType,
        allEdgesWithType: rawData.edges.filter((e) => e.type === edgeType).slice(0, 5),
      });
    }
    
    // Debug: Log edge lookup - ALWAYS log, not just when multiple edges
    console.log('[DEBUG] Edge lookup result:', {
      edgeFrom,
      edgeTo,
      edgeType,
      allMatchingEdgesCount: allMatchingEdges.length,
      allMatchingEdges,
      selectedEdge: edge,
      selectedEdgeIsRestriction: edge?.isRestriction,
      selectedEdgeMinCard: edge?.minCardinality,
      selectedEdgeMaxCard: edge?.maxCardinality,
    });

    modal.dataset.mode = 'edit';
    modal.dataset.oldFrom = edgeFrom;
    modal.dataset.oldTo = edgeTo;
    modal.dataset.oldType = edgeType;
    delete modal.dataset.dataPropertyName;
    delete modal.dataset.classId;
    
    fromSel.disabled = false;
    toSel.disabled = false;
    const typeInputEdit = document.getElementById('editEdgeType') as HTMLInputElement;
    if (typeInputEdit) {
      typeInputEdit.disabled = false;
    }
    
    // Reset max-width for regular edges (let them size naturally)
    fromSel.style.maxWidth = '';
    toSel.style.maxWidth = '';
    if (typeInputEdit) {
      typeInputEdit.style.maxWidth = '';
    }
    const modalContent = modal.querySelector('.modal-content') as HTMLElement;
    if (modalContent) {
      modalContent.style.maxWidth = '';
    }
    
    fromSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeFrom ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, externalOntologyReferences)}</option>`).join('');
    toSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, externalOntologyReferences)}</option>`).join('');
    if (typeInputEdit) {
      const label = getRelationshipLabel(edgeType, objectProperties, externalOntologyReferences);
      const displayLabel = formatRelationshipLabelWithPrefix(edgeType, label, externalOntologyReferences);
      typeInputEdit.value = displayLabel;
      selectedEdgeType = edgeType;
      selectedExternalObjectProperty = null;
    }

    // Debug: Log edge lookup for troubleshooting
    console.log('[DEBUG] showEditEdgeModal - edge lookup:', {
      edgeFrom,
      edgeTo,
      edgeType,
      foundEdge: edge,
      allMatchingEdges: rawData.edges.filter((e) => e.from === edgeFrom && e.to === edgeTo && e.type === edgeType),
    });
    
    // Set cardinality values - handle null/undefined correctly
    if (edge?.minCardinality != null && edge.minCardinality !== undefined) {
      minCardInput.value = String(edge.minCardinality);
    } else {
      minCardInput.value = '';
    }
    if (edge?.maxCardinality != null && edge.maxCardinality !== undefined) {
      maxCardInput.value = String(edge.maxCardinality);
    } else {
      maxCardInput.value = '';
    }
    
    // Set isRestriction checkbox - check if this is a restriction edge
    const isRestrictionCb = document.getElementById('editEdgeIsRestriction') as HTMLInputElement;
    if (isRestrictionCb) {
      // Check if this is a restriction edge - prioritize explicit isRestriction flag
      const isRestriction = edge?.isRestriction === true;
      isRestrictionCb.checked = isRestriction;
      console.log('[DEBUG] showEditEdgeModal - restriction checkbox:', {
        isRestriction,
        edgeIsRestriction: edge?.isRestriction,
        minCardinality: edge?.minCardinality,
        maxCardinality: edge?.maxCardinality,
        edgeType,
      });
    }
    
    // Show cardinality section only if this is a restriction (cardinality only makes sense for restrictions)
    cardWrap.style.display = isRestrictionCb?.checked === true ? 'block' : 'none';

    updateEditEdgeCommentDisplayLocal();
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
  fromSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === from ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, externalOntologyReferences)}</option>`).join('');
  toSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === to ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, externalOntologyReferences)}</option>`).join('');
  const typeInputAdd = document.getElementById('editEdgeType') as HTMLInputElement;
  if (typeInputAdd) {
    const defaultType = 'subClassOf';
    const label = getRelationshipLabel(defaultType, objectProperties, externalOntologyReferences);
    const displayLabel = formatRelationshipLabelWithPrefix(defaultType, label, externalOntologyReferences);
    typeInputAdd.value = displayLabel;
    selectedEdgeType = defaultType;
    selectedExternalObjectProperty = null;
  }

  minCardInput.value = '';
  maxCardInput.value = '';
  const defaultTypeAdd = 'subClassOf';
  
  // Reset isRestriction checkbox - default to true (restriction) for non-subClassOf edges
  const isRestrictionCb = document.getElementById('editEdgeIsRestriction') as HTMLInputElement;
  if (isRestrictionCb) {
    isRestrictionCb.checked = defaultTypeAdd !== 'subClassOf';
  }
  
  // Show cardinality section only if this is a restriction (cardinality only makes sense for restrictions)
  cardWrap.style.display = isRestrictionCb?.checked === true ? 'block' : 'none';

  updateEditEdgeCommentDisplayLocal();
  modal.querySelector('h3')!.textContent = 'Add edge';
  modal.style.display = 'flex';
}

// hideEditEdgeModal wrapper - state cleanup still needed in main.ts
function hideEditEdgeModalWithCleanup(): void {
  if (pendingEditEdgeCallback) {
    pendingEditEdgeCallback(null);
    pendingEditEdgeCallback = null;
  }
  if (pendingAddEdgeData) {
    pendingAddEdgeData.callback(null);
    pendingAddEdgeData = null;
  }
  hideEditEdgeModal();
}

// getCardinalityFromEditModal moved to ui/modals.ts

function confirmEditEdge(): void {
  const modal = document.getElementById('editEdgeModal')!;
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const typeInput = document.getElementById('editEdgeType') as HTMLInputElement;
  const mode = modal.dataset.mode;
  const cardinality = getCardinalityFromEditModal();
  
  // Check if we have a selected external object property
  let newType: string | null = null;
  if (selectedExternalObjectProperty) {
    newType = selectedExternalObjectProperty.uri; // Use full URI for external properties
  } else if (selectedEdgeType) {
    newType = selectedEdgeType;
  } else if (typeInput?.value.trim()) {
    // Try to find in local types
    const found = getAllEdgeTypes(rawData, objectProperties).find(t => {
      const label = getRelationshipLabel(t, objectProperties, externalOntologyReferences);
      const displayLabel = formatRelationshipLabelWithPrefix(t, label, externalOntologyReferences);
      return displayLabel === typeInput.value.trim() || label === typeInput.value.trim() || t === typeInput.value.trim();
    });
    if (found) {
      newType = found;
    } else {
      // If not found locally, it might be an external property that was typed manually
      // We'll need to search for it
      alert('Please select a relationship type from the search results.');
      return;
    }
  }
  
  if (!newType) {
    alert('Please select a valid relationship type.');
    return;
  }

  if (mode === 'add' && pendingAddEdgeData) {
    const { from, to, callback } = pendingAddEdgeData;
    if (!ttlStore) {
      hideEditEdgeModalWithCleanup();
      return;
    }
    
    // Get isRestriction checkbox value - cardinality only applies to restrictions
    const isRestrictionCb = document.getElementById('editEdgeIsRestriction') as HTMLInputElement;
    const isRestriction = isRestrictionCb?.checked ?? false;
    
    // Only include cardinality if this is a restriction
    const card = isRestriction ? cardinality : undefined;
    const ok = addEdgeToStore(ttlStore, from, to, newType, card);
    if (!ok) {
      alert('Failed to add edge. An edge may already exist between these nodes.');
      hideEditEdgeModalWithCleanup();
      return;
    }
    
    const newEdge: import('./types').GraphEdge = { 
      from, 
      to, 
      type: newType,
      isRestriction: isRestriction
    };
    if (card && isRestriction) {
      newEdge.minCardinality = card.minCardinality ?? undefined;
      newEdge.maxCardinality = card.maxCardinality ?? undefined;
    }
    rawData.edges.push(newEdge);
    
    // If this is an external object property, add it to objectProperties array
    if (selectedExternalObjectProperty) {
      const existing = objectProperties.find((op) => op.name === newType);
      if (!existing) {
        objectProperties.push({
          name: newType, // Store the full URI as the name
          label: selectedExternalObjectProperty.label,
          hasCardinality: selectedExternalObjectProperty.hasCardinality ?? true,
          comment: selectedExternalObjectProperty.comment || null,
        });
        objectProperties.sort((a, b) => a.name.localeCompare(b.name));
        // Re-initialize the edge styles menu to include the new property
        const edgeStylesContent = document.getElementById('edgeStylesContent');
        if (edgeStylesContent) {
          initEdgeStylesMenu(edgeStylesContent, applyFilter);
        }
      }
      selectedExternalObjectProperty = null;
    }
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
    hideEditEdgeModalWithCleanup();
    // Clean up unused external properties and update edge styles menu
    objectProperties = cleanupUnusedExternalProperties(rawData, objectProperties);
    const edgeStylesContent = document.getElementById('edgeStylesContent');
    if (edgeStylesContent) {
      initEdgeStylesMenu(edgeStylesContent, applyFilter);
    }
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
      hideEditEdgeModalWithCleanup();
      return;
    }
    
    const oldMin = restriction.minCardinality ?? null;
    const oldMax = restriction.maxCardinality ?? null;
    const newMin = cardinality?.minCardinality ?? null;
    const newMax = cardinality?.maxCardinality ?? null;
    
    const sameCardinality = oldMin === newMin && oldMax === newMax;
    if (sameCardinality) {
      hideEditEdgeModalWithCleanup();
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
    hideEditEdgeModalWithCleanup();
    applyFilter(true);
    return;
  }
  
  const newFrom = fromSel.value;
  const newTo = toSel.value;
  const oldEdge = rawData.edges.find((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
  
  // Get isRestriction checkbox value - cardinality only applies to restrictions
  const isRestrictionCb = document.getElementById('editEdgeIsRestriction') as HTMLInputElement;
  const isRestriction = isRestrictionCb?.checked ?? false;
  
  // Only include cardinality if this is a restriction
  const card = isRestriction ? cardinality : undefined;
  const oldWasRestriction = oldEdge?.isRestriction === true;
  const sameEdge = oldFrom === newFrom && oldTo === newTo && oldType === newType &&
    oldWasRestriction === isRestriction &&
    (card?.minCardinality ?? null) === (oldEdge?.minCardinality ?? null) &&
    (card?.maxCardinality ?? null) === (oldEdge?.maxCardinality ?? null);
  if (!ttlStore || sameEdge) {
    hideEditEdgeModalWithCleanup();
    return;
  }
  let removeOk = removeEdgeFromStore(ttlStore, oldFrom, oldTo, oldType);
  // Edge may exist only in rawData (e.g. from object property domain/range) with no restriction in store
  if (!removeOk && oldEdge) {
    removeOk = true; // Proceed: we will remove from rawData and add the new restriction to the store
  }
  if (!removeOk) {
    hideEditEdgeModalWithCleanup();
    return;
  }
  const addOk = addEdgeToStore(ttlStore, newFrom, newTo, newType, card);
  if (!addOk) {
    addEdgeToStore(ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
    alert('Failed to update edge.');
    hideEditEdgeModalWithCleanup();
    return;
  }
  const idx = rawData.edges.findIndex((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
  if (idx >= 0) rawData.edges.splice(idx, 1);
  
  const newEdge: import('./types').GraphEdge = { 
    from: newFrom, 
    to: newTo, 
    type: newType,
    isRestriction: isRestriction
  };
  if (card && isRestriction) {
    newEdge.minCardinality = card.minCardinality ?? undefined;
    newEdge.maxCardinality = card.maxCardinality ?? undefined;
  }
  rawData.edges.push(newEdge);
  
  // If this is an external object property, add it to objectProperties array
  if (selectedExternalObjectProperty && newType !== oldType) {
    const existing = objectProperties.find((op) => op.name === newType);
    if (!existing) {
      objectProperties.push({
        name: newType, // Store the full URI as the name
        label: selectedExternalObjectProperty.label,
        hasCardinality: selectedExternalObjectProperty.hasCardinality ?? true,
        comment: selectedExternalObjectProperty.comment || null,
      });
      objectProperties.sort((a, b) => a.name.localeCompare(b.name));
      // Re-initialize the edge styles menu to include the new property
      const edgeStylesContent = document.getElementById('edgeStylesContent');
      if (edgeStylesContent) {
        initEdgeStylesMenu(edgeStylesContent, applyFilter);
      }
    }
    selectedExternalObjectProperty = null;
  }
  
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
  // Clean up unused external properties and update edge styles menu
  objectProperties = cleanupUnusedExternalProperties(rawData, objectProperties);
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  if (edgeStylesContent) {
    initEdgeStylesMenu(edgeStylesContent, applyFilter);
  }
  hideEditEdgeModalWithCleanup();
  applyFilter(true);
}

function confirmRename(): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const mode = modal.dataset.mode;

  if (mode === 'multi') {
    const nodeIdsJson = modal.dataset.nodeIds;
    if (!nodeIdsJson || !ttlStore) {
      hideRenameModal();
      return;
    }
    const nodeIds: string[] = JSON.parse(nodeIdsJson);
    const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
    const newComment = commentInput?.value?.trim() ?? '';
    // For multi-edit, we only support comment changes for now
    // Annotation properties would need more complex UI
    const oldVals = nodeIds.map((id) => {
      const n = rawData.nodes.find((x) => x.id === id);
      return { id, comment: n?.comment ?? '' };
    });
    let anyChanged = false;
    for (const nodeId of nodeIds) {
      const node = rawData.nodes.find((n) => n.id === nodeId);
      if (node && (node.comment ?? '') !== newComment) {
        node.comment = newComment || undefined;
        updateCommentInStore(ttlStore, nodeId, newComment || null);
        anyChanged = true;
      }
    }
    if (anyChanged) {
      pushUndoable(
        () => {
          oldVals.forEach(({ id, comment }) => {
            const n = rawData.nodes.find((x) => x.id === id);
            if (n && ttlStore) {
              n.comment = comment || undefined;
              updateCommentInStore(ttlStore, id, comment || null);
            }
          });
        },
        () => {
          nodeIds.forEach((id) => {
            const n = rawData.nodes.find((x) => x.id === id);
            if (n && ttlStore) {
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

  const existingIds = new Set(rawData.nodes.map((n) => n.id));
  if (isDuplicateIdentifierForRename(newLabel, existingIds, nodeId)) {
    const dupErr = document.getElementById('renameDuplicateError') as HTMLElement;
    if (dupErr) {
      dupErr.textContent = ADD_NODE_DUPLICATE_MESSAGE;
      dupErr.style.display = 'block';
    }
    const okBtn = document.getElementById('renameConfirm') as HTMLButtonElement;
    if (okBtn) okBtn.disabled = true;
    return;
  }

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
  
  // Collect annotation property changes
  const oldAnnotationValues: Record<string, boolean | string | null> = {};
  const newAnnotationValues: Record<string, boolean | string | null> = {};
  let annotationPropsChanged = false;
  
  annotationProperties.forEach((ap) => {
    const oldValue = node.annotations?.[ap.name] ?? null;
    oldAnnotationValues[ap.name] = oldValue;
    
    if (ap.isBoolean) {
      const checkbox = document.getElementById(`renameAnnotProp_${ap.name}`) as HTMLInputElement;
      if (checkbox) {
        const newValue = checkbox.indeterminate ? null : checkbox.checked;
        newAnnotationValues[ap.name] = newValue;
        if (oldValue !== newValue) {
          annotationPropsChanged = true;
        }
      }
    } else {
      const inputEl = document.getElementById(`renameAnnotProp_${ap.name}`) as HTMLInputElement;
      if (inputEl) {
        const newValue = inputEl.value.trim() || null;
        newAnnotationValues[ap.name] = newValue;
        if (oldValue !== newValue) {
          annotationPropsChanged = true;
        }
      }
    }
  });

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

  const oldExampleImages = node.exampleImages ?? [];
  const newExampleImages = renameModalExampleImageUris;
  const exampleImagesEqual =
    oldExampleImages.length === newExampleImages.length &&
    oldExampleImages.every((u, i) => u === newExampleImages[i]);
  const exampleImagesChanged = !exampleImagesEqual;

  if (!labelChanged && !annotationPropsChanged && !commentChanged && !dataPropsChanged && !exampleImagesChanged) {
    hideRenameModal();
    return;
  }

  const oldLabel = node.label;
  const oldAnnotationValuesCopy = { ...oldAnnotationValues };
  const oldDataProps = [...(node.dataPropertyRestrictions ?? [])];
  const baseIri = ttlStore ? (getClassNamespace(ttlStore) ?? getMainOntologyBase(ttlStore) ?? BASE_IRI) : BASE_IRI;

  const newFormData: NodeFormData = {
    comment: newComment,
    exampleImageUris: newExampleImages,
    annotationValues: {},
    dataPropertyRestrictions: currentDataProps,
  };
  annotationProperties.forEach((ap) => {
    newFormData.annotationValues[ap.name] = newAnnotationValues[ap.name] ?? oldAnnotationValues[ap.name] ?? null;
  });
  const oldFormData: NodeFormData = {
    comment: oldComment,
    exampleImageUris: oldExampleImages,
    annotationValues: oldAnnotationValuesCopy,
    dataPropertyRestrictions: oldDataProps,
  };

  if (labelChanged) {
    node.label = newLabel;
    if (ttlStore) updateLabelInStore(ttlStore, nodeId, newLabel);
  }

  if (ttlStore) {
    applyNodeFormToStore(nodeId, newFormData, ttlStore, node, baseIri, annotationProperties);
  } else {
    node.comment = newFormData.comment.trim() || undefined;
    node.exampleImages = newFormData.exampleImageUris.length > 0 ? newFormData.exampleImageUris : undefined;
    node.dataPropertyRestrictions = [...currentDataProps];
  }

  pushUndoable(
    () => {
      if (labelChanged) {
        node.label = oldLabel;
        if (ttlStore) updateLabelInStore(ttlStore, nodeId, oldLabel);
      }
      if (ttlStore) {
        applyNodeFormToStore(nodeId, oldFormData, ttlStore, node, baseIri, annotationProperties);
      } else {
        node.comment = oldFormData.comment.trim() || undefined;
        node.exampleImages = oldFormData.exampleImageUris.length > 0 ? oldFormData.exampleImageUris : undefined;
        node.dataPropertyRestrictions = [...oldDataProps];
      }
    },
    () => {
      if (labelChanged) {
        node.label = newLabel;
        if (ttlStore) updateLabelInStore(ttlStore, nodeId, newLabel);
      }
      if (ttlStore) {
        applyNodeFormToStore(nodeId, newFormData, ttlStore, node, baseIri, annotationProperties);
      } else {
        node.comment = newFormData.comment.trim() || undefined;
        node.exampleImages = newFormData.exampleImageUris.length > 0 ? newFormData.exampleImageUris : undefined;
        node.dataPropertyRestrictions = [...currentDataProps];
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
      // Ensure filename has .ttl extension
      let downloadName = loadedFileName ?? 'ontology.ttl';
      if (!downloadName.toLowerCase().endsWith('.ttl') && !downloadName.toLowerCase().endsWith('.turtle')) {
        downloadName = `${downloadName}.ttl`;
      }
      a.download = downloadName;
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
        <button type="button" id="openOntologyBtn" class="primary" style="width: fit-content; display: flex; align-items: center; gap: 8px;">
          <img src="${import.meta.env.BASE_URL}OntoCanvas.png" alt="OntoCanvas" style="width: 20px; height: 20px;" />
          Open ontology
        </button>
        <input type="file" id="fileInput" accept=".ttl,.turtle" style="display: none;" />
      </div>
      <div id="vizControls" style="display: none;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Layout:</strong>
        <select id="layoutMode">
          <option value="hierarchical01">Hierarchical 01</option>
          <option value="hierarchical02">Hierarchical 02</option>
          <option value="hierarchical03">Hierarchical 03</option>
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
            <strong style="font-size: 12px;">Nodes text wrap:</strong>
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
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Data properties font size</strong>
            <input type="number" id="dataPropertyFontSize" min="8" max="48" value="18" style="width: 45px; margin-left: 6px;">
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
      <span id="undoRedoGroup" style="gap: 4px; align-items: center; display: inline-flex; flex-direction: column;">
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
      <span id="displayConfigGroup" style="display: none; gap: 4px; align-items: center; flex-direction: column;">
        <button type="button" id="saveDisplayConfig" title="Save display config to a .display.json file (e.g. next to your ontology)">Save display config</button>
        <button type="button" id="loadDisplayConfig" title="Load display config from a .display.json file">Load display config</button>
        <button type="button" id="resetDisplayConfig" title="Reset display config and regenerate layout from scratch">Reset display config</button>
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
      <span id="versionDisplay" style="margin-right: 12px; font-size: 11px; color: #666;"></span>
      Nodes: <span id="nodeCount">0</span> / Edges: <span id="edgeCount">0</span>
      <span id="filePathDisplay" style="margin-left: 24px; font-size: 11px;"></span>
      <span id="edgeColorsLegend" style="margin-left: 24px; font-size: 11px;"></span>
      <span id="selectionInfo"></span>
    </div>
    <div id="renameModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit node</h3>
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
          <span style="font-size: 12px;">Label:</span>
          <input type="text" id="renameInput" style="flex: 1;" />
        </label>
        <p id="renameIdentifierLabel" style="font-size: 11px; color: #666; margin-bottom: 4px;">Identifier (derived from label):</p>
        <p id="renameIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin-bottom: 8px;"></p>
        <p id="renameDuplicateError" style="display: none; color: #c00; font-size: 12px; margin: 6px 0 0 0;"></p>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="renameComment" rows="3" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div id="renameExampleImagesSection"></div>
        <div id="renameAnnotationPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
          <strong style="font-size: 12px;">Set annotation properties</strong>
          <div id="renameAnnotationPropsList" style="margin-top: 8px;"></div>
        </div>
        <div id="renameDataPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <strong style="font-size: 12px;">Assign data property restriction</strong>
            <span id="dataPropRestrictionInfoIcon" style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; position: relative;" title="Data Property Restriction: A data property restriction allows you to specify constraints on how a data property can be used with a specific class. You can set minimum and maximum cardinality (how many times the property can appear) for instances of this class. Note: To add a new Data Property to your ontology, go to the 'Data Properties' menu in the top bar.">ℹ️</span>
          </div>
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
          <p id="addNodeIdentifierLabel" style="font-size: 11px; color: #666; margin: 6px 0 4px 0;">Identifier (derived from label):</p>
          <p id="addNodeIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin: 0 0 8px 0;"></p>
          <p id="addNodeDuplicateError" style="display: none; color: #c00; font-size: 12px; margin: 6px 0 0 0;"></p>
          <label style="display: block; margin-top: 10px;">
            <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
            <textarea id="addNodeComment" rows="3" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
          </label>
          <div id="addNodeExampleImagesSection"></div>
          <div id="addNodeAnnotationPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
            <strong style="font-size: 12px;">Set annotation properties</strong>
            <div id="addNodeAnnotationPropsList" style="margin-top: 8px;"></div>
          </div>
          <div id="addNodeDataPropsSection" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 12px;">Assign data property restriction</strong>
              <span id="addNodeDataPropRestrictionInfoIcon" style="cursor: help; color: #3498db; font-size: 14px;" title="Data Property Restriction: set min/max cardinality for this class.">ⓘ</span>
            </div>
            <div id="addNodeDataPropsList" style="margin-top: 6px; margin-bottom: 8px; font-size: 11px;"></div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <select id="addNodeDataPropSelect" style="padding: 4px 8px; font-size: 11px; min-width: 120px;">
                <option value="">-- data property --</option>
              </select>
              <span style="font-size: 11px;">Min:</span>
              <input type="number" id="addNodeDataPropMin" min="0" placeholder="0" style="width: 48px; padding: 4px; font-size: 11px;">
              <span style="font-size: 11px;">Max:</span>
              <input type="number" id="addNodeDataPropMax" min="0" placeholder="*" style="width: 48px; padding: 4px; font-size: 11px;" title="Leave empty for unbounded">
              <button type="button" id="addNodeDataPropAdd" style="font-size: 11px; padding: 4px 8px; display: none;" disabled>Add</button>
            </div>
          </div>
        </div>
        <div id="addNodeExternalTabContent" class="add-node-tab-content" style="display: none;">
          <label>Search class: <input type="text" id="addNodeExternalInput" placeholder="Type to search referenced ontologies..." /></label>
          <p id="addNodeExternalDuplicateError" style="display: none; color: #c00; font-size: 12px; margin: 6px 0 0 0;"></p>
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
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The human-readable name. The ontology identifier (local name) is derived in camelCase and shown below.">ⓘ</span>
          <input type="text" id="addRelTypeLabel" placeholder="e.g. contains" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <p id="addRelTypeIdentifierLabel" style="font-size: 11px; color: #666; margin: 6px 0 4px 0;">Identifier (derived from label):</p>
        <p id="addRelTypeIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin: 0 0 8px 0;"></p>
        <p id="addRelTypeLabelValidation" style="font-size: 11px; margin-top: 4px; margin-bottom: 0; display: none;"></p>
        <label style="display: flex; align-items: center; margin-top: 10px; gap: 6px;">
          <input type="checkbox" id="addRelTypeHasCardinality" checked /> 
          <span>Has cardinality</span>
          <span style="cursor: help; color: #666; font-size: 14px; line-height: 1;" title="When checked, edges of this type can specify min/max cardinality (e.g. &quot;contains [0..3]&quot;).">ⓘ</span>
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="addRelTypeComment" rows="2" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Domain (rdfs:domain)</span>
          <div style="position: relative;">
            <input type="text" id="addRelTypeDomain" placeholder="Type to search or enter class..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="addRelTypeDomainResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range)</span>
          <div style="position: relative;">
            <input type="text" id="addRelTypeRange" placeholder="Type to search or enter class..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="addRelTypeRangeResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Defined by (rdfs:isDefinedBy, optional URI)</span>
          <input type="text" id="addRelTypeIsDefinedBy" placeholder="e.g. https://www.opengis.net/ont/geosparql#" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <div style="margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Subproperty of (rdfs:subPropertyOf, optional)</span>
          <div style="position: relative;">
            <input type="text" id="addRelTypeSubPropertyOf" placeholder="Type to search or enter object property..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="addRelTypeSubPropertyOfResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="addRelTypeCancel">Cancel</button>
          <button type="button" id="addRelTypeConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="editRelationshipTypeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit object property</h3>
        <p id="editRelTypeName" style="font-size: 11px; color: #666; margin-bottom: 4px;"></p>
        <p id="editRelTypeIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin-bottom: 8px;"></p>
        <p id="editRelTypeLabelValidation" style="font-size: 11px; margin-top: 4px; margin-bottom: 0; display: none;"></p>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The human-readable name of the property. Setting it automatically derives the ontology identifier (local name) in camelCase; the identifier is shown above and used in the ontology URI.">ⓘ</span>
          <input type="text" id="editRelTypeLabel" placeholder="e.g. contains" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="editRelTypeComment" rows="3" placeholder="Optional description" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Domain (rdfs:domain)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The class that is the subject of this property in the ontology (global domain). This is not a restriction on a specific edge. To add a restriction (e.g. cardinality or target class) for a specific relationship in the graph, select that edge in the graph and edit its properties.">ⓘ</span>
          <div style="position: relative;">
            <input type="text" id="editRelTypeDomain" placeholder="Type to search or enter class..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="editRelTypeDomainResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The class that is the object of this property in the ontology (global range). This is not a restriction on a specific edge. To add a restriction for a specific relationship in the graph, select that edge in the graph and edit its properties.">ⓘ</span>
          <div style="position: relative;">
            <input type="text" id="editRelTypeRange" placeholder="Type to search or enter class..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="editRelTypeRangeResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Defined by (rdfs:isDefinedBy)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The URI of the ontology that defines this property (e.g. an external or imported vocabulary). Setting it marks the property as imported: its label cannot be edited here, and it may be displayed with a prefix (e.g. geo:hasGeometry) in the Object Properties list.">ⓘ</span>
          <input type="text" id="editRelTypeDefinedBy" placeholder="e.g. https://www.opengis.net/ont/geosparql#" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </div>
        <div style="margin-top: 12px;">
          <span style="font-size: 11px; color: #666;">Subproperty of (rdfs:subPropertyOf)</span>
          <span style="cursor: help; color: #3498db; font-size: 14px; line-height: 1; margin-left: 4px; vertical-align: middle;" title="The parent object property in the RDFS/OWL hierarchy. This property will be inferred as a subproperty of the one you select (e.g. for specializing relationships).">ⓘ</span>
          <div style="position: relative;">
            <input type="text" id="editRelTypeSubPropertyOf" placeholder="Type to search or enter object property..." autocomplete="off" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
            <div id="editRelTypeSubPropertyOfResults" style="max-height: 160px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; margin-top: 2px; display: none; background: #fff; position: absolute; z-index: 1000; left: 0; right: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></div>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editRelTypeCancel">Cancel</button>
          <button type="button" id="editRelTypeConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="addDataPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add data property</h3>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="addDataPropLabel" placeholder="e.g. refers to drawing ID" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <p id="addDataPropIdentifierLabel" style="font-size: 11px; color: #666; margin: 6px 0 4px 0;">Identifier (derived from label):</p>
        <p id="addDataPropIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin: 0 0 8px 0;"></p>
        <p id="addDataPropLabelValidation" style="font-size: 11px; margin-top: 4px; margin-bottom: 0; display: none;"></p>
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
        <p id="editDataPropName" style="font-size: 11px; color: #666; margin-bottom: 4px;"></p>
        <p id="editDataPropIdentifier" style="font-size: 11px; color: #333; font-family: Consolas, monospace; word-break: break-all; margin-bottom: 8px;"></p>
        <p id="editDataPropLabelValidation" style="font-size: 11px; margin-top: 4px; margin-bottom: 0; display: none;"></p>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="editDataPropLabel" placeholder="e.g. refers to drawing ID" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Comment (rdfs:comment)</span>
          <textarea id="editDataPropComment" rows="2" placeholder="Optional" style="width: 100%; margin-top: 4px; padding: 8px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; resize: vertical;"></textarea>
        </label>
        <div style="margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Defined by (rdfs:isDefinedBy)</span>
          <input type="text" id="editDataPropDefinedBy" placeholder="e.g. https://w3id.org/dano#" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </div>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range datatype)</span>
          <select id="editDataPropRange" style="display: block; margin-top: 4px; padding: 8px; width: 100%; box-sizing: border-box;"></select>
        </label>
        <div style="margin-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 11px; color: #666; font-weight: bold;">Domains (rdfs:domain)</span>
            <button type="button" id="editDataPropAddDomain" style="padding: 4px 8px; font-size: 11px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Add domain</button>
          </div>
          <div id="editDataPropDomainsList" style="min-height: 40px; border: 1px solid #ddd; border-radius: 4px; padding: 8px; background: #f9f9f9;"></div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editDataPropCancel">Cancel</button>
          <button type="button" id="editDataPropConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="addAnnotationPropertyModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add annotation property</h3>
        <label style="display: block; margin-top: 8px;">
          <span style="font-size: 11px; color: #666;">Label (rdfs:label)</span>
          <input type="text" id="addAnnotationPropLabel" placeholder="e.g. isVisible" style="width: 100%; margin-top: 4px; padding: 8px; box-sizing: border-box;" />
        </label>
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range datatype)</span>
          <select id="addAnnotationPropRange" style="display: block; margin-top: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
            <option value="">No range (untyped)</option>
          </select>
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
        <label style="display: block; margin-top: 10px;">
          <span style="font-size: 11px; color: #666;">Range (rdfs:range datatype)</span>
          <select id="editAnnotationPropRange" style="display: block; margin-top: 4px; padding: 8px; width: 100%; box-sizing: border-box;">
            <option value="">No range (untyped)</option>
          </select>
        </label>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editAnnotationPropCancel">Cancel</button>
          <button type="button" id="editAnnotationPropConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
    <div id="editEdgeModal" class="modal" style="display: none;">
      <div class="modal-content" style="max-width: 500px; width: 90vw;">
        <h3>Edit edge</h3>
        <label style="position: relative; display: block;">Relationship: <input type="text" id="editEdgeType" placeholder="Type to search relationships..." autocomplete="off" style="width: 100%; padding: 8px; box-sizing: border-box;"></label>
        <div id="editEdgeTypeResults" style="max-height: 200px; overflow-y: auto; overflow-x: hidden; border: 1px solid #ddd; border-radius: 4px; margin-top: 4px; display: none; background: #fff; position: absolute; z-index: 1000; width: 100%; box-sizing: border-box; left: 0; word-wrap: break-word; overflow-wrap: break-word;"></div>
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
        <label style="display: flex; align-items: center; gap: 6px; margin-top: 12px;">
          <input type="checkbox" id="editEdgeIsRestriction" />
          <span style="font-size: 12px;">OWL restriction</span>
          <span style="cursor: help; color: #666; font-size: 14px; line-height: 1;" title="OWL Restriction: An OWL restriction defines constraints on how an object property can be used with a specific class. It allows you to specify cardinality constraints (min/max) that apply to instances of that class. When checked, creates an OWL restriction (displayed as a thick continuous line). When unchecked, creates a normal object property connection (displayed as a dashed line).">ⓘ</span>
        </label>
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
    <div id="loadingModal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: none; justify-content: center; align-items: center; z-index: 20000;">
      <div style="background: white; border-radius: 8px; padding: 32px; text-align: center; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);">
        <div style="font-size: 18px; font-weight: 600; margin-bottom: 16px;">Loading ontology...</div>
        <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      </div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
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
    
    // Debug: Check if describes edge exists in rawData.edges after parsing
    const describesEdgesInRawData = rawData.edges.filter((e) => 
      e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
    );
    console.log('[DEBUG] After parsing - describes edges in rawData.edges:', describesEdgesInRawData.length, describesEdgesInRawData);
    console.log('[DEBUG] All edges in rawData.edges:', rawData.edges.length);
    console.log('[DEBUG] All node IDs in rawData.nodes:', rawData.nodes.map((n) => n.id));
    
    loadedFileName = fileName ?? null;
    loadedFilePath = pathHint ?? fileName ?? null;
    fileHandle = handle ?? null;
    if (!fileHandle) clearCachedImageDirectory();
    hasUnsavedChanges = false;
    clearUndoRedo();
    updateFilePathDisplay();
    
    // Update status bar with the new store (defer to avoid blocking)
    setTimeout(() => {
      updateStatusBar(ttlStore);
    }, 0);
    
    if (handle && fileName) {
      saveLastFileToIndexedDB(handle, fileName, pathHint ?? fileName).catch(() => {});
    }
    updateSaveButtonVisibility();

    vizControls.style.display = 'contents';
    const displayConfigGroup = document.getElementById('displayConfigGroup');
    if (displayConfigGroup) {
      displayConfigGroup.style.display = 'inline-flex';
      displayConfigGroup.style.flexDirection = 'column';
    }
    const externalRefsGroup = document.getElementById('externalRefsGroup');
    if (externalRefsGroup) externalRefsGroup.style.display = 'inline-flex';
    
    // Extract external references from owl:imports in the ontology
    const extractedRefs = extractExternalRefsFromStore(ttlStore);
    console.log('Extracted external references from ontology:', extractedRefs);
    
    // Extract prefixes from @prefix declarations in the TTL
    const prefixMap = extractPrefixesFromTtl(ttlString);
    console.log('Extracted prefixes from TTL:', prefixMap);
    
    // Enhance extracted refs with prefixes from TTL
    for (const ref of extractedRefs) {
      const urlWithoutHash = ref.url.endsWith('#') ? ref.url.slice(0, -1) : ref.url;
      console.log(`Matching ref URL: ${ref.url} (normalized: ${urlWithoutHash})`);
      // Find matching prefix in TTL
      for (const [prefix, url] of Object.entries(prefixMap)) {
        const urlStr = String(url);
        const prefixUrlWithoutHash = urlStr.endsWith('#') ? urlStr.slice(0, -1) : urlStr;
        console.log(`  Comparing with prefix ${prefix}: ${urlStr} (normalized: ${prefixUrlWithoutHash})`);
        if (urlWithoutHash === prefixUrlWithoutHash) {
          console.log(`  ✓ Match found! Setting prefix to ${prefix}`);
          ref.prefix = prefix;
          ref.usePrefix = true;
          break;
        }
      }
      if (!ref.prefix) {
        console.log(`  ✗ No matching prefix found for ${ref.url}`);
      }
    }
    
    // Load external references from IndexedDB and merge with extracted ones
    const dbRefs = await loadExternalRefsFromIndexedDB(loadedFilePath, loadedFileName);
    console.log('Loaded external references from IndexedDB:', dbRefs);
    
    // Merge: use DB refs if they exist, otherwise use extracted ones
    // For each extracted ref, check if there's a DB ref with the same URL
    const mergedRefs: ExternalOntologyReference[] = [];
    const seenUrls = new Set<string>();
    
    // First add DB refs (they have user preferences like prefix)
    for (const dbRef of dbRefs) {
      const normalizedUrl = dbRef.url.endsWith('#') ? dbRef.url.slice(0, -1) : dbRef.url;
      mergedRefs.push(dbRef);
      seenUrls.add(normalizedUrl);
    }
    
    // Then add extracted refs that aren't in DB
    for (const extRef of extractedRefs) {
      const normalizedUrl = extRef.url.endsWith('#') ? extRef.url.slice(0, -1) : extRef.url;
      if (!seenUrls.has(normalizedUrl)) {
        mergedRefs.push(extRef);
        seenUrls.add(normalizedUrl);
      }
    }
    
    // Add refs from TTL @prefix so inlined externals (e.g. geo:) get a prefix even without owl:imports
    const mainBase = getMainOntologyBase(ttlStore);
    for (const [prefix, url] of Object.entries(prefixMap)) {
      const urlStr = String(url);
      const normalized = urlStr.endsWith('#') ? urlStr.slice(0, -1) : urlStr;
      const mainNormalized = mainBase != null ? (mainBase.endsWith('#') ? mainBase.slice(0, -1) : mainBase) : '';
      if (normalized !== mainNormalized && !seenUrls.has(normalized)) {
        mergedRefs.push({ url: urlStr.endsWith('#') ? urlStr : urlStr + '#', usePrefix: true, prefix });
        seenUrls.add(normalized);
      }
    }
    
    externalOntologyReferences = mergedRefs;
    console.log('Final merged external references:', externalOntologyReferences);
    console.log(`Total external references: ${externalOntologyReferences.length}`);
    for (const ref of externalOntologyReferences) {
      console.log(`  - ${ref.url} (prefix: ${ref.prefix || 'none'}, usePrefix: ${ref.usePrefix})`);
    }
    
    // Pre-fetch and cache external ontology classes and object properties (non-blocking)
    if (externalOntologyReferences.length > 0) {
      preloadExternalOntologyClasses(externalOntologyReferences).catch((err) => {
        console.error('Failed to pre-load external ontologies:', err);
      });
    }
    
    // Extract external object properties from edges that use full URIs
    // This ensures external properties appear in the Object Properties menu
    // Create basic entries immediately without any network requests to avoid blocking
    const edgeTypes = getEdgeTypes(rawData.edges);
    for (const edgeType of edgeTypes) {
      if ((edgeType.startsWith('http://') || edgeType.startsWith('https://'))) {
        // Check if this property already exists (either as full URI or as local name)
        const localName = extractLocalName(edgeType);
        const existingByUri = objectProperties.find((op) => op.name === edgeType);
        const existingByLocalName = objectProperties.find((op) => op.name === localName);
        
        // If it exists as local name, update it to use the full URI to avoid duplicates
        if (existingByLocalName && !existingByUri) {
          existingByLocalName.name = edgeType;
        }
        
        // Only add if it doesn't exist yet - create basic entry immediately (no network requests)
        if (!existingByUri && !existingByLocalName) {
          objectProperties.push({
            name: edgeType,
            label: extractLocalName(edgeType),
            hasCardinality: true,
            comment: null,
          });
        }
      }
    }
    objectProperties.sort((a, b) => a.name.localeCompare(b.name));

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
    const displayConfig = await loadDisplayConfigFromIndexedDB(loadedFilePath, loadedFileName);
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
  
  // Clear stored node positions when switching layouts
  // This ensures the new layout algorithm's positions are used
  const layoutAlgorithm = getLayoutAlgorithm(layoutMode);
  if (layoutAlgorithm || layoutMode === 'force') {
    // Switching to a layout that computes positions - clear stored positions
    rawData.nodes.forEach((node) => {
      delete node.x;
      delete node.y;
    });
  }
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
  const dataPropertyFontSize =
    parseInt(
      (document.getElementById('dataPropertyFontSize') as HTMLInputElement).value,
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
    dataPropertyFontSize,
    searchQuery: searchEl?.value ?? '',
    includeNeighbors: neighborsEl?.checked ?? true,
    edgeStyleConfig: getEdgeStyleConfig(edgeStylesContent, rawData, objectProperties, externalOntologyReferences),
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
    editEdge: {
      editWithoutDrag: (
        edgeData: { id?: string; from: string; to: string },
        callback: (data: { from: string; to: string } | null) => void
      ) => {
        const edgeId = edgeData.id ?? '';
        // Edge ID format: "from->to:type"
        // But type can contain ":" (e.g., "https://w3id.org/dano#contains")
        // So we need to split on "->" first, then split the second part on ":" from the left (only the first ":")
        const arrowIndex = edgeId.indexOf('->');
        if (arrowIndex === -1 || !ttlStore) {
          callback(null);
          return;
        }
        const from = edgeId.substring(0, arrowIndex);
        const afterArrow = edgeId.substring(arrowIndex + 2);
        const colonIndex = afterArrow.indexOf(':');
        if (colonIndex === -1) {
          callback(null);
          return;
        }
        const to = afterArrow.substring(0, colonIndex);
        const type = afterArrow.substring(colonIndex + 1);
        
        // Debug: Log edge click
        console.log('[DEBUG] Edge clicked for editing:', { edgeId, from, to, type });
        
        // Debug: Check what edges exist in rawData for this match
        const matchingEdges = rawData.edges.filter((e) => e.from === from && e.to === to && e.type === type);
        console.log('[DEBUG] All matching edges in rawData:', {
          from,
          to,
          type,
          matchingEdges,
          allEdgesWithType: rawData.edges.filter((e) => e.type === type).slice(0, 5),
        });
        
        pendingEditEdgeCallback = callback;
        showEditEdgeModal(from, to, type);
      },
    },
    deleteNode: false,
    deleteEdge: false,
  };

  const networkContainer = document.getElementById('network')!;
  
  // Update status bar with node/edge counts
  updateNodeEdgeCounts(data.nodes.length, data.edges.length);
  
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
    } else if (layoutMode === 'hierarchical01' || layoutMode === 'hierarchical02' || layoutMode === 'hierarchical03') {
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
    } else if (layoutMode === 'hierarchical01' || layoutMode === 'hierarchical02' || layoutMode === 'hierarchical03') {
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
    
    // Initialize context menu
    if (ttlStore) {
      initContextMenu(
        network,
        networkContainer,
        ttlStore,
        rawData,
        (addedEdges, failedEdges) => {
          // On paste callback - add to undo stack
          if (addedEdges.length > 0) {
            pushUndoable(
              () => {
                // Undo: remove pasted edges
                addedEdges.forEach((edge) => {
                  removeEdgeFromStore(ttlStore!, edge.from, edge.to, edge.type);
                  const idx = rawData.edges.findIndex(
                    (e) => e.from === edge.from && e.to === edge.to && e.type === edge.type
                  );
                  if (idx >= 0) rawData.edges.splice(idx, 1);
                });
                applyFilter(true);
              },
              () => {
                // Redo: re-add pasted edges
                addedEdges.forEach((edge) => {
                  const card = rawData.edges.find(
                    (e) => e.from === edge.from && e.to === edge.to && e.type === edge.type
                  );
                  const cardinality = card
                    ? {
                        minCardinality: card.minCardinality ?? null,
                        maxCardinality: card.maxCardinality ?? null,
                      }
                    : undefined;
                  addEdgeToStore(ttlStore!, edge.from, edge.to, edge.type, cardinality);
                  if (!card) {
                    rawData.edges.push({
                      from: edge.from,
                      to: edge.to,
                      type: edge.type,
                      minCardinality: cardinality?.minCardinality,
                      maxCardinality: cardinality?.maxCardinality,
                    });
                  }
                });
                applyFilter(true);
              }
            );
            applyFilter(true);
            hasUnsavedChanges = true;
          }
        },
        (count) => {
          // On copy callback - just log or show notification
          console.log(`Copied ${count} relationship(s)`);
        },
        (nodeId) => openEditModalForNode(nodeId),
        (edgeId) => openEditModalForEdge(edgeId)
      );
      
      // Update context menu data after initialization
      updateContextMenuData(ttlStore, rawData);
    }
    
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
      if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0] as string;
        const selectedIds = network.getSelectedNodes().map(String);
        if (selectedIds.length > 1 && selectedIds.includes(clickedNodeId)) {
          showMultiEditModal(selectedIds);
        } else {
          openEditModalForNode(clickedNodeId);
        }
        return;
      }
      if (params.edges.length > 0) {
        openEditModalForEdge(params.edges[0] as string);
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

// External refs functions moved to ui/externalRefs.ts

/**
 * Load ontology from a file.
 */
async function loadFromFile(): Promise<void> {
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  if (!fileInput) return;

  if ('showOpenFilePicker' in window) {
    showLoadingModal();
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
      hideLoadingModal();
    } catch (err) {
      hideLoadingModal();
      if ((err as Error).name !== 'AbortError') {
        const errorMsg = document.getElementById('errorMsg') as HTMLElement;
        errorMsg.textContent = `Failed to open file: ${err instanceof Error ? err.message : String(err)}`;
        errorMsg.style.display = 'block';
      }
    }
  } else {
    fileInput.click();
  }
}

/**
 * Load ontology from a URL.
 */
async function loadFromUrl(url: string): Promise<void> {
  const errorMsg = document.getElementById('errorMsg') as HTMLElement;
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';

  showLoadingModal();
  try {
    const ttl = await fetchOntologyFromUrl(url);

    // Extract filename from URL
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    let fileName = pathParts[pathParts.length - 1] || 'ontology.ttl';
    
    // Ensure filename has .ttl extension
    if (!fileName.toLowerCase().endsWith('.ttl') && !fileName.toLowerCase().endsWith('.turtle')) {
      fileName = `${fileName}.ttl`;
    }

    // Save last opened URL (non-blocking)
    saveLastUrlToIndexedDB(url, fileName).catch(() => {});

    await loadTtlAndRender(ttl, fileName, null, url);
    hideLoadingModal();
  } catch (err) {
    hideLoadingModal();
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to load ontology from URL:', err);
    errorMsg.textContent = `Failed to load from URL: ${errorMessage}`;
    errorMsg.style.display = 'block';
  }
}

/**
 * Load the last opened file.
 */
async function loadLastOpenedFile(): Promise<void> {
    const stored = await getLastFileFromIndexedDB();
    if (!stored) {
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = 'No previously opened file found.';
    errorMsg.style.display = 'block';
      return;
    }
    showLoadingModal();
    try {
      const perm = await stored.handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const requested = await stored.handle.requestPermission({ mode: 'readwrite' });
        if (requested !== 'granted') {
          hideLoadingModal();
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
      hideLoadingModal();
    } catch (err) {
      hideLoadingModal();
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to load file: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
}

/**
 * Load the last opened URL.
 */
async function loadLastOpenedUrl(): Promise<void> {
  const stored = await getLastUrlFromIndexedDB();
  if (!stored) {
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = 'No previously opened URL found.';
    errorMsg.style.display = 'block';
    return;
  }
  try {
    await loadFromUrl(stored.url);
  } catch (err) {
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = `Failed to load from URL: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}

function setupEventListeners(): void {
  // Initialize status bar after DOM is ready
  initStatusBar();
  
  // Initialize version display
  const versionDisplay = document.getElementById('versionDisplay');
  if (versionDisplay) {
    versionDisplay.textContent = `OntoCanvas v${getAppVersion()} |`;
  }
  
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;

  // Open ontology button
  const openOntologyBtn = document.getElementById('openOntologyBtn');
  openOntologyBtn?.addEventListener('click', () => {
    showOpenOntologyModal();
  });

  // Initialize the open ontology modal
      initOpenOntologyModal(
        loadFromFile,
        loadFromUrl,
        loadLastOpenedFile,
        loadLastOpenedUrl
      );

  // File input change handler (for fallback when showOpenFilePicker is not available)
  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    showLoadingModal();
    try {
      const ttl = await file.text();
      await loadTtlAndRender(ttl, file.name, null);
      hideLoadingModal();
    } catch (err) {
      hideLoadingModal();
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to read file: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
    fileInput.value = '';
  });

  document.getElementById('layoutMode')?.addEventListener('change', () => applyFilter());

  const externalRefsCallbacks: ExternalRefsModalCallbacks = {
    onUpdate: () => {
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    },
    onSave: () => {
      // Additional save logic if needed
    },
  };
  
  document.getElementById('manageExternalRefs')?.addEventListener('click', () => {
    showExternalRefsModal(externalOntologyReferences, externalRefsCallbacks, loadedFilePath, loadedFileName);
  });
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
        
        for (const quad of quads as Array<{ predicate: { value?: string }; object: { value?: string } }>) {
          const pred = quad.predicate;
          if (pred.value === VANN_PREFERRED_PREFIX) {
            const obj = quad.object;
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
      const externalRefsCallbacks: ExternalRefsModalCallbacks = {
        onUpdate: () => {
          hasUnsavedChanges = true;
          updateSaveButtonVisibility();
        },
        onSave: () => {
          // Additional save logic if needed
        },
      };
      renderExternalRefsList(externalOntologyReferences, externalRefsCallbacks, loadedFilePath, loadedFileName);
      await saveExternalRefsToIndexedDB(externalOntologyReferences, loadedFilePath, loadedFileName);
      
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

  document.getElementById('wrapChars')?.addEventListener('input', () => applyFilter());
  document.getElementById('wrapChars')?.addEventListener('change', () => applyFilter());
  document.getElementById('minFontSize')?.addEventListener('input', () => applyFilter());
  document.getElementById('minFontSize')?.addEventListener('change', () => applyFilter());
  document.getElementById('maxFontSize')?.addEventListener('input', () => applyFilter());
  document.getElementById('maxFontSize')?.addEventListener('change', () => applyFilter());
  document.getElementById('relationshipFontSize')?.addEventListener('input', () => applyFilter());
  document.getElementById('relationshipFontSize')?.addEventListener('change', () => applyFilter());
  document
    .getElementById('searchIncludeNeighbors')
    ?.addEventListener('change', () => applyFilter());
  document.getElementById('undoBtn')?.addEventListener('click', performUndo);
  document.getElementById('redoBtn')?.addEventListener('click', performRedo);
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
    selectedEdgeType = null;
    selectedExternalObjectProperty = null;
    
    // Debounce search
    editEdgeTypeSearchTimeout = setTimeout(() => {
      updateEditEdgeTypeSearch(query).catch((err) => {
        console.error('Error in edge type search:', err);
      });
    }, 150);
    
    // Also update comment display immediately if we have a selected type
    if (selectedEdgeType) {
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
  
  // Update cardinality display when edge type changes
  document.getElementById('editEdgeType')?.addEventListener('focusout', () => {
    const cardWrap = document.getElementById('editEdgeCardinalityWrap');
    if (cardWrap && selectedEdgeType) {
      cardWrap.style.display = selectedEdgeType !== 'subClassOf' && getPropertyHasCardinality(selectedEdgeType, objectProperties, selectedExternalObjectProperty) ? 'block' : 'none';
    }
    updateEditEdgeCommentDisplayLocal();
  });
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
  document.getElementById('resetView')?.addEventListener('click', () => {
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'hierarchical01';
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
    const types = getAllRelationshipTypes(rawData, objectProperties);
    const defaultColors = getDefaultEdgeColors(types);
    types.forEach((type) => {
      const colorEl = document.querySelector(`.edge-color-picker[data-type="${type}"]`) as HTMLInputElement;
      if (colorEl) colorEl.value = defaultColors[type] ?? getDefaultColor();
    });
    updateEdgeColorsLegend(rawData, objectProperties, externalOntologyReferences);
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
      saveDisplayConfigToIndexedDB(config, loadedFilePath, loadedFileName).catch(() => {});
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
        saveDisplayConfigToIndexedDB(config, loadedFilePath, loadedFileName).catch(() => {});
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

  document.getElementById('resetDisplayConfig')?.addEventListener('click', async () => {
    if (rawData.nodes.length === 0) return;
    
    // Clear all node positions
    rawData.nodes.forEach((node) => {
      delete node.x;
      delete node.y;
    });
    
    // Delete display config from IndexedDB
    await deleteDisplayConfigFromIndexedDB(loadedFilePath, loadedFileName).catch(() => {});
    
    // Regenerate layout by applying filter
    applyFilter();
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
  document.getElementById('renameInput')?.addEventListener('input', refreshRenameModalFromInput);
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
    if (minCardinality !== undefined && maxCardinality !== undefined && minCardinality! > maxCardinality!) return;
    renameModalDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    nodeModalFormUi.renderRenameModalDataPropsList(renameModalDataPropertyRestrictions, dataProperties, onRemoveRenameDataProp);
    if (minEl) minEl.value = '';
    if (maxEl) maxEl.value = '';
  });
  document.getElementById('renameDataPropSelect')?.addEventListener('change', () => {
    nodeModalFormUi.updateRenameDataPropAddButtonState();
  });
  document.getElementById('addNodeDataPropAdd')?.addEventListener('click', () => {
    const selectEl = document.getElementById('addNodeDataPropSelect') as HTMLSelectElement;
    const minEl = document.getElementById('addNodeDataPropMin') as HTMLInputElement;
    const maxEl = document.getElementById('addNodeDataPropMax') as HTMLInputElement;
    const propName = selectEl?.value?.trim();
    if (!propName) return;
    const min = minEl?.value?.trim();
    const max = maxEl?.value?.trim();
    const minCardinality = min === '' ? undefined : parseInt(min, 10);
    const maxCardinality = max === '' ? undefined : parseInt(max, 10);
    if (min !== '' && (Number.isNaN(minCardinality!) || minCardinality! < 0)) return;
    if (max !== '' && (Number.isNaN(maxCardinality!) || maxCardinality! < 0)) return;
    if (minCardinality !== undefined && maxCardinality !== undefined && minCardinality! > maxCardinality!) return;
    addNodeDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    nodeModalFormUi.renderAddNodeDataPropsList(addNodeDataPropertyRestrictions, dataProperties, onRemoveAddNodeDataProp);
    if (minEl) minEl.value = '';
    if (maxEl) maxEl.value = '';
  });
  document.getElementById('addNodeDataPropSelect')?.addEventListener('change', () => {
    nodeModalFormUi.updateAddNodeDataPropAddButtonState();
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
      
      refreshAddNodeOkButton();
    });
  });
  
  document.getElementById('addNodeInput')?.addEventListener('input', refreshAddNodeOkButton);
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
    
    refreshAddNodeOkButton();
  });
  
  document.getElementById('addNodeCancel')?.addEventListener('click', hideAddNodeModal);
  document.getElementById('addNodeConfirm')?.addEventListener('click', confirmAddNode);
  document.getElementById('addNodeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#addNodeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') {
        const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
        if (okBtn && !okBtn.disabled) confirmAddNode();
      } else {
        hideAddNodeModalWithCleanup();
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

renderApp();
setupEventListeners();
// Check for URL parameter and load ontology if present, otherwise show modal
setTimeout(async () => {
  const loadedFromParam = await handleUrlParameterLoad(loadFromUrl, showOpenOntologyModal);
  if (!loadedFromParam) {
    // No URL parameter found, show modal as usual
    showOpenOntologyModal();
  }
}, 100);

// Test hook for browser automation (e.g. Playwright). Exposes programmatic control for E2E tests.
(window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ = {
  /** Hide the open-ontology modal so tests can use the file input. */
  hideOpenOntologyModal: (): void => hideOpenOntologyModal(),
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
  /** Find edge by from/to labels and type. Returns edge ID for use with editEdge. */
  findEdgeByLabels: (fromLabel: string, toLabel: string, typeLabel?: string): string | null => {
    const fromNode = rawData.nodes.find((n) => (n.label || n.id) === fromLabel);
    const toNode = rawData.nodes.find((n) => (n.label || n.id) === toLabel);
    if (!fromNode || !toNode) return null;
    
    const edge = rawData.edges.find((e) => {
      if (e.from !== fromNode.id || e.to !== toNode.id) return false;
      if (typeLabel) {
        const edgeTypeLabel = getRelationshipLabel(e.type, objectProperties, externalOntologyReferences);
        return edgeTypeLabel === typeLabel || e.type.includes(typeLabel);
      }
      return true;
    });
    
    if (!edge) return null;
    return `${edge.from}->${edge.to}:${edge.type}`;
  },
  /** Get edge data from rawData by edge ID. */
  getEdgeData: (edgeId: string): { from: string; to: string; type: string; isRestriction?: boolean; minCardinality?: number | null; maxCardinality?: number | null } | null => {
    // Parse edge ID: "from->to:type"
    const arrowIndex = edgeId.indexOf('->');
    if (arrowIndex === -1) return null;
    const from = edgeId.substring(0, arrowIndex);
    const afterArrow = edgeId.substring(arrowIndex + 2);
    const colonIndex = afterArrow.indexOf(':');
    if (colonIndex === -1) return null;
    const to = afterArrow.substring(0, colonIndex);
    const type = afterArrow.substring(colonIndex + 1);
    
    const edge = rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
    if (!edge) return null;
    
    return {
      from: edge.from,
      to: edge.to,
      type: edge.type,
      isRestriction: edge.isRestriction,
      minCardinality: edge.minCardinality,
      maxCardinality: edge.maxCardinality,
    };
  },
  /** Trigger edit edge modal programmatically. */
  editEdge: (edgeId: string): boolean => {
    const arrowIndex = edgeId.indexOf('->');
    if (arrowIndex === -1) return false;
    const from = edgeId.substring(0, arrowIndex);
    const afterArrow = edgeId.substring(arrowIndex + 2);
    const colonIndex = afterArrow.indexOf(':');
    if (colonIndex === -1) return false;
    const to = afterArrow.substring(0, colonIndex);
    const type = afterArrow.substring(colonIndex + 1);
    
    showEditEdgeModal(from, to, type);
    return true;
  },
  /** Get Edit Edge modal values. */
  getEditEdgeModalValues: (): { minCardinality: string; maxCardinality: string; isRestrictionChecked: boolean } | null => {
    const modal = document.getElementById('editEdgeModal');
    if (!modal || modal.style.display === 'none') return null;

    const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
    const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;
    const isRestrictionCb = document.getElementById('editEdgeIsRestriction') as HTMLInputElement;

    return {
      minCardinality: minCardInput?.value || '',
      maxCardinality: maxCardInput?.value || '',
      isRestrictionChecked: isRestrictionCb?.checked || false,
    };
  },
  /** Open Add Node modal (for E2E). */
  openAddNodeModal: (x?: number, y?: number): void => {
    showAddNodeModal(x ?? 100, y ?? 100);
  },
  /** Get Add Node modal state: OK disabled, duplicate error visible/text (for E2E). */
  getAddNodeModalState: (): { okDisabled: boolean; duplicateErrorVisible: boolean; duplicateErrorText: string } => {
    const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
    const dupErr = document.getElementById('addNodeDuplicateError') as HTMLElement;
    return {
      okDisabled: okBtn?.disabled ?? true,
      duplicateErrorVisible: dupErr ? dupErr.style.display !== 'none' : false,
      duplicateErrorText: dupErr?.textContent?.trim() ?? '',
    };
  },
  /** Open edit modal for a node (class rename or data property restriction). For E2E. */
  openEditModalForNode,
  /** Open edit modal for an edge (object or data property). For E2E. */
  openEditModalForEdge,
  /** Get Edit Edge modal title (e.g. "Edit data property restriction"). */
  getEditEdgeModalTitle: (): string | null => {
    const modal = document.getElementById('editEdgeModal');
    if (!modal || modal.style.display === 'none') return null;
    const h3 = modal.querySelector('h3');
    return h3?.textContent?.trim() ?? null;
  },
  /** Open Edit data property modal by property name (from Data Properties menu). */
  openEditDataPropertyModal: (name: string): void => {
    showEditDataPropertyModal(name);
  },
  /** Get data property info by name (for E2E domain assertions). */
  getDataPropertyByName: (name: string): { domains: string[]; uri?: string } | null => {
    const dp = dataProperties.find((p) => p.name === name);
    if (!dp) return null;
    return { domains: dp.domains ?? [], uri: dp.uri };
  },
  /** Serialized TTL from current store (for E2E). */
  getSerializedTurtle: async (): Promise<string | null> => {
    if (!ttlStore) return null;
    return storeToTurtle(ttlStore, externalOntologyReferences);
  },
  /** Open Add Object Property modal (for E2E). */
  openAddObjectPropertyModal: (): void => {
    document.getElementById('addRelationshipTypeBtn')?.click();
  },
  /** Get Add Object Property modal state (for E2E). */
  getAddObjectPropertyModalState: (): { okDisabled: boolean; validationText: string } => {
    const modal = document.getElementById('addRelationshipTypeModal');
    if (!modal || (modal as HTMLElement).style.display === 'none') {
      return { okDisabled: true, validationText: '' };
    }
    const okBtn = document.getElementById('addRelTypeConfirm') as HTMLButtonElement;
    const validationEl = document.getElementById('addRelTypeLabelValidation') as HTMLElement;
    return {
      okDisabled: okBtn?.disabled ?? true,
      validationText: validationEl?.textContent?.trim() ?? '',
    };
  },
  /** Get Object Properties list text (for E2E). */
  getObjectPropertiesListText: (): string => {
    const el = document.getElementById('edgeStylesContent');
    return el?.textContent?.trim() ?? '';
  },
  /** Open Edit Object Property modal by type (for E2E). */
  openEditObjectPropertyModal: (type: string): void => {
    const edgeStylesContent = document.getElementById('edgeStylesContent');
    if (edgeStylesContent) showEditRelationshipTypeModal(type, edgeStylesContent as HTMLElement, applyFilter);
  },
  /** Get Edit Object Property identifier text (for E2E - assert no #Ontology#). */
  getEditObjectPropertyIdentifierText: (): string | null => {
    const modal = document.getElementById('editRelationshipTypeModal');
    if (!modal || (modal as HTMLElement).style.display === 'none') return null;
    const el = document.getElementById('editRelTypeIdentifier');
    return el?.textContent?.trim() ?? null;
  },
  /** Get rendered node label by node ID (for E2E - to verify actual displayed label). */
  getRenderedNodeLabel: (nodeId: string): string | null => {
    if (!network) return null;
    try {
      // Access the network's internal data structure
      const networkAny = network as any;
      const nodes = networkAny.body?.data?.nodes;
      if (!nodes) return null;
      const node = nodes.get(nodeId);
      return node?.label ?? null;
    } catch (e) {
      console.error('[getRenderedNodeLabel] Error accessing network data:', e);
      return null;
    }
  },
  /** Get rendered edge label by edge ID (for E2E - to verify actual displayed label). */
  getRenderedEdgeLabel: (edgeId: string): string | null => {
    if (!network) return null;
    try {
      // Access the network's internal data structure
      const networkAny = network as any;
      const edges = networkAny.body?.data?.edges;
      if (!edges) return null;
      const edge = edges.get(edgeId);
      return edge?.label ?? null;
    } catch (e) {
      console.error('[getRenderedEdgeLabel] Error accessing network data:', e);
      return null;
    }
  },
};
