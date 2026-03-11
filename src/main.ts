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
  addRestrictionToStore,
  removeEdgeFromStore,
  removeRestrictionFromStore,
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
  getReferencedExternalClassesFromStore,
  getStubExternalClassForUri,
  type ExternalClassInfo,
  type ExternalObjectPropertyInfo,
} from './externalOntologySearch';
import type { GraphData, GraphEdge, GraphNode, DataPropertyRestriction, DataPropertyInfo, AnnotationPropertyInfo, ObjectPropertyInfo, BorderLineType } from './types';
import {
  type DisplayConfig,
  type ExternalOntologyReference,
  type ExternalNodeLayout,
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
import { expandWithExternalRefs } from './graph/externalExpansion';
import {
  getQuadsRemovedForExternalClass,
  removeExternalClassReferencesFromStore,
  restoreQuadsToStore,
} from './graph/removeExternalReferences';
import { parseEdgeId } from './utils/edgeId';
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
import { setupDragCoupling } from './graph/dataPropertyDragCoupling';
import { persistNodePositionsFromNetwork } from './graph/persistNodePositions';
import { isDebugMode, debugLog, debugWarn, debugError } from './utils/debug';
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
import { attachEditorTestHook } from './e2e/editorTestHook';
import {
  initOpenOntologyModal,
  showOpenOntologyModal,
  hideOpenOntologyModal,
} from './ui/openOntologyModal';
import { handleUrlParameterLoad } from './lib/urlParamLoader';
import {
  extractExternalRefsFromStore,
  extractUsedNamespaceRefsFromStore,
  extractPrefixesFromTtl,
  formatNodeLabelWithPrefix,
  formatRelationshipLabelWithPrefix,
  renderExternalRefsList,
  showExternalRefsModal,
  hideExternalRefsModal,
  sortExternalRefsByUrl,
  type ExternalRefsModalCallbacks,
  getPrefixForUri,
  isUriFromExternalOntology,
  getOpacityForExternalOntology,
} from './ui/externalRefs';
import {
  initRenameModalHeaderIcons,
  setRenameModalTipButtonVisible,
} from './ui/renameModalHeaderIcons';
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
import { handleUrlLoadFailure } from './lib/urlLoadFailureHandler';
import { loadOntologyFromContent } from './lib/loadOntology';
import { validateOntologyStructure, formatValidationErrors } from './lib/ontologyValidation';
import { showValidationErrorModal } from './ui/validationErrorModal';
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
  
  // Get positions from network if available (most up-to-date), otherwise from rawData
  if (network) {
    const networkPositions = network.getPositions();
    Object.entries(networkPositions).forEach(([id, pos]) => {
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        nodePositions[id] = { x: pos.x, y: pos.y };
        // Also update rawData to keep it in sync
        const node = rawData.nodes.find((n) => n.id === id);
        if (node) {
          node.x = pos.x;
          node.y = pos.y;
        }
      }
    });
  } else {
    // Fallback to rawData positions if network not available
    rawData.nodes.forEach((n) => {
      if (n.x != null && n.y != null) nodePositions[n.id] = { x: n.x, y: n.y };
    });
  }
  const displayExternalRefEl = document.getElementById('displayExternalRefs') as HTMLInputElement | null;
  const externalNodeLayoutEl = document.getElementById('externalNodeLayout') as HTMLSelectElement | null;
  return {
    version: DISPLAY_CONFIG_VERSION,
    nodePositions,
    edgeStyleConfig: edgeStylesContent ? getEdgeStyleConfig(edgeStylesContent, rawData, objectProperties, externalOntologyReferences) : {},
    wrapChars: parseInt((document.getElementById('wrapChars') as HTMLInputElement)?.value, 10) || 12,
    minFontSize: parseInt((document.getElementById('minFontSize') as HTMLInputElement)?.value, 10) || 20,
    maxFontSize: parseInt((document.getElementById('maxFontSize') as HTMLInputElement)?.value, 10) || 70,
    relationshipFontSize: parseInt((document.getElementById('relationshipFontSize') as HTMLInputElement)?.value, 10) || 18,
    dataPropertyFontSize: parseInt((document.getElementById('dataPropertyFontSize') as HTMLInputElement)?.value, 10) || 12,
    layoutMode: (document.getElementById('layoutMode') as HTMLSelectElement)?.value || 'hierarchical03',
    searchQuery: (document.getElementById('searchQuery') as HTMLInputElement)?.value ?? '',
    includeNeighbors: (document.getElementById('searchIncludeNeighbors') as HTMLInputElement)?.checked ?? true,
    annotationStyleConfig: annotationPropsContent ? getAnnotationStyleConfig(annotationPropsContent) : undefined,
    viewState: network
      ? { scale: network.getScale(), position: network.getViewPosition() }
      : undefined,
    displayExternalReferences: displayExternalRefEl?.checked ?? displayExternalReferences,
    externalNodeLayout: (externalNodeLayoutEl?.value as ExternalNodeLayout) ?? externalNodeLayout,
  };
}

function applyDisplayConfig(config: DisplayConfig): void {
  displayExternalReferences = config.displayExternalReferences ?? true;
  externalNodeLayout = (config.externalNodeLayout as ExternalNodeLayout) ?? 'auto';
  loadedNodePositions = config.nodePositions ?? null;
  const displayExternalRefEl = document.getElementById('displayExternalRefs') as HTMLInputElement | null;
  const externalNodeLayoutEl = document.getElementById('externalNodeLayout') as HTMLSelectElement | null;
  if (displayExternalRefEl) displayExternalRefEl.checked = displayExternalReferences;
  if (externalNodeLayoutEl) externalNodeLayoutEl.value = externalNodeLayout;

  // Define edgeStyleConfig first before using it
  const edgeStyleConfig = config.edgeStyleConfig || {};
  
  debugLog('[DISPLAY CONFIG] Applying display config...');
  debugLog('[DISPLAY CONFIG] Edge style config keys:', Object.keys(edgeStyleConfig));
  debugLog('[DISPLAY CONFIG] Edge style config:', edgeStyleConfig);
  
  // Log all edge types in rawData
  const allEdgeTypesInData = getEdgeTypes(rawData.edges);
  debugLog('[DISPLAY CONFIG] All edge types in rawData.edges:', allEdgeTypesInData);
  debugLog('[DISPLAY CONFIG] Total edges in rawData.edges:', rawData.edges.length);
  
  // Check for describes edges specifically
  const describesEdgesInData = rawData.edges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || 
    e.type.includes('describes') ||
    e.type.toLowerCase().includes('describes')
  );
  debugLog('[DISPLAY CONFIG] Describes edges in rawData.edges:', describesEdgesInData.length);
  if (describesEdgesInData.length > 0) {
    debugLog('[DISPLAY CONFIG] Describes edge types found:', [...new Set(describesEdgesInData.map(e => e.type))]);
    debugLog('[DISPLAY CONFIG] Sample describes edges:', describesEdgesInData.slice(0, 3));
  }
  
  // Check if edge types in config match edge types in data
  const configEdgeTypes = Object.keys(edgeStyleConfig);
  debugLog('[DISPLAY CONFIG] Edge types in config:', configEdgeTypes);
  
  const matchingTypes = configEdgeTypes.filter(type => allEdgeTypesInData.includes(type));
  const missingTypes = configEdgeTypes.filter(type => !allEdgeTypesInData.includes(type));
  debugLog('[DISPLAY CONFIG] Matching edge types (in both config and data):', matchingTypes);
  debugLog('[DISPLAY CONFIG] Missing edge types (in config but not in data):', missingTypes);
  
  // Check for potential matches with different formats (e.g., local name vs full URI)
  missingTypes.forEach(configType => {
    const potentialMatches = allEdgeTypesInData.filter(dataType => 
      dataType.includes(configType) || 
      configType.includes(dataType) ||
      dataType.endsWith('#' + configType) ||
      configType.endsWith('#' + dataType) ||
      extractLocalName(dataType) === configType ||
      extractLocalName(configType) === dataType
    );
    if (potentialMatches.length > 0) {
      debugWarn(`[DISPLAY CONFIG] ⚠ Edge type "${configType}" in config might match:`, potentialMatches);
    }
  });
  
  // Apply node positions with upgrade/migration support
  let matchedNodes = 0;
  let unmatchedNodes = 0;
  const nodePositions = config.nodePositions || {};
  
  Object.entries(nodePositions).forEach(([id, pos]) => {
    // First try exact ID match
    let node = rawData.nodes.find((n) => n.id === id);
    
    // If not found, try matching by label (for upgraded ontologies where IDs might have changed)
    if (!node) {
      // Try to find by label - useful when ontology structure changed but labels are similar
      const configLabel = id; // In old configs, ID might actually be a label
      node = rawData.nodes.find((n) => 
        n.label === configLabel || 
        n.id === configLabel ||
        (n.label && n.label.toLowerCase() === configLabel.toLowerCase())
      );
    }
    
    if (node) {
      node.x = pos.x;
      node.y = pos.y;
      matchedNodes++;
    } else {
      unmatchedNodes++;
    }
  });
  
  if (unmatchedNodes > 0) {
    debugLog(`[DISPLAY CONFIG] Applied positions for ${matchedNodes} nodes, ${unmatchedNodes} nodes from config not found in current ontology (likely due to ontology changes)`);
  } else {
    debugLog(`[DISPLAY CONFIG] Applied positions for ${matchedNodes} nodes`);
  }
  (document.getElementById('wrapChars') as HTMLInputElement).value = String(config.wrapChars ?? 12);
  (document.getElementById('minFontSize') as HTMLInputElement).value = String(config.minFontSize ?? 20);
  (document.getElementById('maxFontSize') as HTMLInputElement).value = String(config.maxFontSize ?? 70);
  (document.getElementById('relationshipFontSize') as HTMLInputElement).value = String(config.relationshipFontSize ?? 18);
  (document.getElementById('dataPropertyFontSize') as HTMLInputElement).value = String(config.dataPropertyFontSize ?? 12);
  // Handle backward compatibility: 'weighted' maps to 'hierarchical01'
  const layoutMode = config.layoutMode ?? 'hierarchical03';
  const normalizedLayoutMode = layoutMode === 'weighted' ? 'hierarchical01' : layoutMode;
  (document.getElementById('layoutMode') as HTMLSelectElement).value = normalizedLayoutMode;
  const searchQueryEl = document.getElementById('searchQuery') as HTMLInputElement;
  if (searchQueryEl) {
    searchQueryEl.value = config.searchQuery ?? '';
    // Trigger input event to update styling (outline, background, clear button)
    // Use requestAnimationFrame to ensure event listeners are set up
    requestAnimationFrame(() => {
      searchQueryEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  (document.getElementById('searchIncludeNeighbors') as HTMLInputElement).checked = config.includeNeighbors ?? true;
  
  // Store the loaded edge style config so it can be merged when building the filter
  // This ensures edge types that don't have checkboxes yet are still applied
  // Convert old config format if needed (handle missing lineType)
  const upgradedEdgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: BorderLineType }> = {};
  Object.keys(edgeStyleConfig).forEach((type) => {
    const c = edgeStyleConfig[type];
    if (c) {
      upgradedEdgeStyleConfig[type] = {
        show: c.show !== false,
        showLabel: c.showLabel !== false,
        color: c.color || getDefaultColor(),
        lineType: c.lineType || 'solid', // Default to solid if missing
      };
    }
  });
  loadedEdgeStyleConfig = upgradedEdgeStyleConfig;
  
  // Debug logging (only in debug mode)
  if (isDebugMode()) {
    debugLog(`[DISPLAY CONFIG] Stored edge style config for ${Object.keys(upgradedEdgeStyleConfig).length} edge types`);
  }
  
  if (document.getElementById('edgeStylesContent')) {
    const edgeStylesContent = document.getElementById('edgeStylesContent')!;
    const types = getAllRelationshipTypes(rawData, objectProperties);
    const defaultColors = getDefaultEdgeColors(types);
    let appliedToCheckboxes = 0;
    Object.keys(upgradedEdgeStyleConfig).forEach((type) => {
      const c = upgradedEdgeStyleConfig[type];
      if (c) {
        // CSS-escape the type to handle special characters like #, :, etc.
        const escapedType = CSS.escape(type);
        const showCb = edgeStylesContent.querySelector(`.edge-show-cb[data-type="${escapedType}"]`) as HTMLInputElement | null;
        const labelCb = edgeStylesContent.querySelector(`.edge-label-cb[data-type="${escapedType}"]`) as HTMLInputElement | null;
        const colorEl = edgeStylesContent.querySelector(`.edge-color-picker[data-type="${escapedType}"]`) as HTMLInputElement | null;
        if (showCb) {
          showCb.checked = c.show;
          appliedToCheckboxes++;
        }
        if (labelCb) {
          labelCb.checked = c.showLabel;
        }
        if (colorEl) {
          // Use saved color if available, otherwise use default color for this type
          colorEl.value = c.color || defaultColors[type] || getDefaultColor();
        }
      }
    });
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog(`[DISPLAY CONFIG] Applied edge styles to ${appliedToCheckboxes} checkboxes in DOM`);
    }
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
/** Edge style config loaded from display config file (takes precedence over DOM checkboxes) */
let loadedEdgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: BorderLineType }> | null = null;
/** Node positions from display config (used when expanding external refs so external node positions are restored). */
let loadedNodePositions: Record<string, { x: number; y: number }> | null = null;
/** Track the last layout mode to detect when it changes */
let lastLayoutMode: string | null = null;
/** Whether to display nodes from external ontologies (object property domain/range). Default ON. */
let displayExternalReferences = true;
/** Layout of external nodes: auto or always right/top/bottom/left of connected local node. */
let externalNodeLayout: ExternalNodeLayout = 'auto';

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
/** Last expanded graph data (local + external nodes) used to build the network. Used by Edit Edge modal for From/To dropdowns. */
let currentGraphDataForBuild: GraphData | null = null;
/** External class URIs we have seen in this session (from store or added by user). Not removed when user deletes an external node, so "Add from referenced ontology" still finds them. Cleared on load. */
let knownExternalClassUris: Set<string> = new Set();
/** External nodes the user added via "Add from referenced ontology" (not from domain/range). Kept so they get correct external styling (opacity, tooltip). Cleared on load; removed when user deletes that node. */
let userAddedExternalNodes: GraphNode[] = [];
let annotationProperties: AnnotationPropertyInfo[] = [];
let objectProperties: ObjectPropertyInfo[] = [];
let dataProperties: DataPropertyInfo[] = [];
let network: Network | null = null;
let addNodeMode = false;
let pendingAddNodePosition: { x: number; y: number } | null = null;
/** Must be reset to false when add-node modal closes (OK/Cancel/backdrop) so toolbar→canvas click can open modal again. */
let addNodeModalShowing = false;
let ttlStore: import('n3').Store | null = null;
let loadedFileName: string | null = null;
let loadedFilePath: string | null = null;
let fileHandle: FileSystemFileHandle | null = null;
let hasUnsavedChanges = false;
let originalTtlString: string | null = null; // Store original TTL to preserve format
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
  debugLog(`[DELETE] performDeleteSelection called`);
  if (!network || !ttlStore) {
    debugLog(`[DELETE] Early return: network or ttlStore not available`);
    return false;
  }
  const activeEl = document.activeElement as HTMLElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
    debugLog(`[DELETE] Early return: active element is input/textarea/contentEditable:`, activeEl.tagName);
    return false;
  }
  const selectedNodeIds = network.getSelectedNodes().map(String);
  const selectedEdgeIds = network.getSelectedEdges().map(String);
  debugLog(`[DELETE] Selected nodes: ${selectedNodeIds.length}, Selected edges: ${selectedEdgeIds.length}`);
  debugLog(`[DELETE] Selected edge IDs:`, selectedEdgeIds);
  if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) {
    debugLog(`[DELETE] Early return: no selection`);
    return false;
  }

  const edgesToRemove: { from: string; to: string; type: string }[] = [];
  const dataPropertyRestrictionsToRemove: { classId: string; propertyName: string }[] = [];
  for (const edgeId of selectedEdgeIds) {
    const parsed = parseEdgeId(edgeId);
    if (!parsed) continue;
    const { from, to, type } = parsed;
    // Check if this is a data property edge
    if (type === 'dataprop' || type === 'dataproprestrict') {
      let dpMatch = from.match(/^__dataproprestrict__(.+)__(.+)$/);
      if (!dpMatch) {
        dpMatch = from.match(/^__dataprop__(.+)__(.+)$/);
      }
      if (dpMatch) {
        const [, classId, propertyName] = dpMatch;
        const classNode = rawData.nodes.find((n) => n.id === classId);
        if (classNode?.dataPropertyRestrictions?.some((r) => r.propertyName === propertyName)) {
          dataPropertyRestrictionsToRemove.push({ classId, propertyName });
        }
      }
    } else {
      edgesToRemove.push({ from, to, type });
    }
  }

  const nodesToRemove = selectedNodeIds.filter((id) => rawData.nodes.some((n) => n.id === id));
  const externalNodeIdsToRemove = selectedNodeIds.filter(
    (id) => (id.startsWith('http://') || id.startsWith('https://')) && !rawData.nodes.some((n) => n.id === id)
  );
  const connectedEdges = rawData.edges.filter(
    (e) => nodesToRemove.includes(e.from) || nodesToRemove.includes(e.to)
  );
  const edgesConnectedToExternal = rawData.edges.filter(
    (e) => externalNodeIdsToRemove.includes(e.from) || externalNodeIdsToRemove.includes(e.to)
  );

  const nodeUndoActions: Array<() => void> = [];
  const nodeRedoActions: Array<() => void> = [];
  const edgeUndoActions: Array<() => void> = [];
  const edgeRedoActions: Array<() => void> = [];
  const dataPropUndoActions: Array<() => void> = [];
  const dataPropRedoActions: Array<() => void> = [];

  // Remove edges BEFORE nodes. Restriction-based edges (contains, partOf) require the node's
  // subClassOf quads to still exist for removeEdgeFromStore to find and remove them.
  // Note: rawData.edges contains at most one edge per from/to/type combination.
  debugLog(`[DELETE] Starting edge deletion. edgesToRemove: ${edgesToRemove.length} edges`);
  for (const { from, to, type } of edgesToRemove) {
    debugLog(`[DELETE] Processing edge deletion: ${from} -> ${to} : ${type}`);
    const edge = rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
    debugLog(`[DELETE] Found edge in rawData:`, edge ? { from: edge.from, to: edge.to, type: edge.type, isRestriction: edge.isRestriction } : 'NOT FOUND');
    const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
    // Del key deletion should remove both restriction and domain/range
    try {
      debugLog(`[DELETE] Calling removeEdgeFromStore for: ${from} -> ${to} : ${type}`);
      removeEdgeFromStore(ttlStore, from, to, type);
      debugLog(`[DELETE] removeEdgeFromStore succeeded for: ${from} -> ${to} : ${type}`);
      // Successfully removed from store - remove from rawData
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      debugLog(`[DELETE] Edge index in rawData: ${idx}`);
      if (idx >= 0) {
        rawData.edges.splice(idx, 1);
        debugLog(`[DELETE] Removed edge from rawData. Remaining edges: ${rawData.edges.length}`);
      } else {
        debugWarn(`[DELETE] WARNING: Edge not found in rawData at index ${idx} for: ${from} -> ${to} : ${type}`);
      }
      edgeUndoActions.push(() => {
        addEdgeToStore(ttlStore!, from, to, type, card);
        rawData.edges.push(edge ?? { from, to, type });
      });
      edgeRedoActions.push(() => {
        // Del key deletion should remove both restriction and domain/range
        removeEdgeFromStore(ttlStore!, from, to, type);
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
        if (i >= 0) rawData.edges.splice(i, 1);
      });
    } catch (err) {
      // Edge not found in store (may only exist in rawData from domain/range)
      // Still remove from rawData
      debugError(`[DELETE] EXCEPTION removing edge from store: ${from} -> ${to} : ${type}`);
      debugError(`[DELETE] Exception message: ${err instanceof Error ? err.message : String(err)}`);
      debugError(`[DELETE] Exception stack:`, err instanceof Error ? err.stack : 'No stack trace');
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      debugLog(`[DELETE] Exception case - edge index in rawData: ${idx}`);
      if (idx >= 0) {
        const edge = rawData.edges[idx];
        debugLog(`[DELETE] Removing edge from rawData despite exception:`, { from: edge.from, to: edge.to, type: edge.type });
        const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
        rawData.edges.splice(idx, 1);
        debugLog(`[DELETE] Removed edge from rawData after exception. Remaining edges: ${rawData.edges.length}`);
        edgeUndoActions.push(() => {
          addEdgeToStore(ttlStore!, from, to, type, card);
          rawData.edges.push(edge);
        });
        edgeRedoActions.push(() => {
          // Del key deletion should remove both restriction and domain/range
          try {
            removeEdgeFromStore(ttlStore!, from, to, type);
          } catch {
            // Ignore errors in redo
          }
          const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
          if (i >= 0) rawData.edges.splice(i, 1);
        });
      } else {
        debugWarn(`[DELETE] WARNING: Edge not found in rawData at index ${idx} after exception for: ${from} -> ${to} : ${type}`);
      }
    }
  }
  debugLog(`[DELETE] Finished edge deletion. Remaining edges in rawData: ${rawData.edges.length}`);

  for (const { from, to, type } of connectedEdges) {
    if (edgesToRemove.some((e) => e.from === from && e.to === to && e.type === type)) continue;
    const edge = rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
    const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
    try {
      removeEdgeFromStore(ttlStore, from, to, type);
      // Successfully removed from store - remove from rawData
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) rawData.edges.splice(idx, 1);
      edgeUndoActions.push(() => {
        addEdgeToStore(ttlStore!, from, to, type, card);
        rawData.edges.push(edge ?? { from, to, type });
      });
      edgeRedoActions.push(() => {
        // Del key deletion should remove both restriction and domain/range
        removeEdgeFromStore(ttlStore!, from, to, type);
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
        if (i >= 0) rawData.edges.splice(i, 1);
      });
    } catch (err) {
      // Edge not found in store (may only exist in rawData from domain/range)
      // Still remove from rawData
      debugWarn(`Failed to remove connected edge from store: ${err instanceof Error ? err.message : String(err)}`);
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
          // Del key deletion should remove both restriction and domain/range
          try {
            removeEdgeFromStore(ttlStore!, from, to, type);
          } catch {
            // Ignore errors in redo
          }
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

  const externalUndoActions: (() => void)[] = [];
  const externalRedoActions: (() => void)[] = [];

  const userAddedBeingRemoved = userAddedExternalNodes.filter((n) => externalNodeIdsToRemove.includes(n.id));
  userAddedExternalNodes = userAddedExternalNodes.filter((n) => !externalNodeIdsToRemove.includes(n.id));

  for (const externalId of externalNodeIdsToRemove) {
    const quadsToRestoreOnUndo = getQuadsRemovedForExternalClass(ttlStore, externalId);
    const edgesForThisExternal = edgesConnectedToExternal.filter(
      (e) => e.from === externalId || e.to === externalId
    );
    const edgesSnapshot = edgesForThisExternal.map((e) => ({ from: e.from, to: e.to, type: e.type }));
    const userAddedNode = userAddedBeingRemoved.find((n) => n.id === externalId);

    removeExternalClassReferencesFromStore(ttlStore, externalId);
    for (const e of edgesForThisExternal) {
      const idx = rawData.edges.findIndex((ed) => ed.from === e.from && ed.to === e.to && ed.type === e.type);
      if (idx >= 0) rawData.edges.splice(idx, 1);
    }

    externalUndoActions.push(() => {
      restoreQuadsToStore(ttlStore!, quadsToRestoreOnUndo);
      edgesSnapshot.forEach((e) => rawData.edges.push(e));
      if (userAddedNode) userAddedExternalNodes.push(userAddedNode);
    });
    externalRedoActions.push(() => {
      removeExternalClassReferencesFromStore(ttlStore!, externalId);
      edgesSnapshot.forEach((e) => {
        const idx = rawData.edges.findIndex((ed) => ed.from === e.from && ed.to === e.to && ed.type === e.type);
        if (idx >= 0) rawData.edges.splice(idx, 1);
      });
      if (userAddedNode) userAddedExternalNodes = userAddedExternalNodes.filter((nn) => nn.id !== externalId);
    });
  }

  const hasActions =
    nodeUndoActions.length +
    edgeUndoActions.length +
    dataPropUndoActions.length +
    externalUndoActions.length >
    0;
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
      externalUndoActions.forEach((a) => a());
    },
    () => {
      edgeRedoActions.forEach((a) => a());
      nodeRedoActions.forEach((a) => a());
      dataPropRedoActions.forEach((a) => a());
      externalRedoActions.forEach((a) => a());
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
  debugLog(`[DELETE] About to call applyFilter. rawData.edges count: ${rawData.edges.length}`);
  debugLog(`[DELETE] rawData.edges:`, rawData.edges.map(e => `${e.from}->${e.to}:${e.type}`));
  applyFilter(true);
  debugLog(`[DELETE] After applyFilter. rawData.edges count: ${rawData.edges.length}`);
  debugLog(`[DELETE] rawData.edges after filter:`, rawData.edges.map(e => `${e.from}->${e.to}:${e.type}`));
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
    const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
    const filtered = q
      ? types.filter((t) => {
          const baseLabel = getRelationshipLabel(t, objectProperties, externalOntologyReferences);
          const op = objectProperties.find((p) => p.name === t || p.uri === t);
          const display = formatRelationshipLabelWithPrefix(t, baseLabel, externalOntologyReferences, op, mainBase);
          return t.toLowerCase().includes(q) || baseLabel.toLowerCase().includes(q) || display.toLowerCase().includes(q);
        })
      : types;
    const limit = 50;
    resultsDiv.innerHTML = '';
    filtered.slice(0, limit).forEach((type) => {
      const baseLabel = getRelationshipLabel(type, objectProperties, externalOntologyReferences);
      const op = objectProperties.find((p) => p.name === type || p.uri === type);
      const display = formatRelationshipLabelWithPrefix(type, baseLabel, externalOntologyReferences, op, mainBase);
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
  const op = objectProperties.find((p) => p.name === type || p.uri === type);
  const baseWithHash = getDisplayBase(ttlStore);
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  const hasValidDefinedBy = op?.isDefinedBy && (op.isDefinedBy.startsWith('http://') || op.isDefinedBy.startsWith('https://'));
  const isImported = op ? (hasValidDefinedBy ? isUriFromExternalOntology(op.uri, op.isDefinedBy, externalOntologyReferences, mainBase) : isUriFromExternalOntology(op.uri, null, externalOntologyReferences, mainBase)) : false;
  const lbl = labelInput?.value?.trim() ?? '';
  if (identifierEl) {
    if (isImported && op) {
      // For imported properties, show with prefix format (e.g., "base:connectsTo")
      const label = op.label || extractLocalName(op.uri || op.name || type);
      const prefix = getPrefixForUri(op.uri, op.isDefinedBy, externalOntologyReferences, mainBase);
      if (prefix) {
        identifierEl.textContent = `${prefix}:${label}`;
      } else {
        identifierEl.textContent = op.uri ?? baseWithHash + (op.name ?? type);
      }
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
  // Find property by name or URI (type might be full URI for external properties)
  const op = objectProperties.find((p) => p.name === type || p.uri === type || (type.startsWith('http') && p.uri === type));
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  // Check if imported: use isDefinedBy if present and valid URL, otherwise check if URI belongs to external ontology
  const hasValidDefinedBy = op?.isDefinedBy && (op.isDefinedBy.startsWith('http://') || op.isDefinedBy.startsWith('https://'));
  const isImported = op ? (hasValidDefinedBy ? isUriFromExternalOntology(op.uri, op.isDefinedBy, externalOntologyReferences, mainBase) : isUriFromExternalOntology(op.uri, null, externalOntologyReferences, mainBase)) : false;
  
  // Add/update warning icon if imported - place it in header aligned with h3
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  const h3 = modalContent?.querySelector('h3') as HTMLElement;
  
  // Ensure header structure exists (similar to rename modal)
  let header = modalContent?.querySelector('.modal-header') as HTMLElement;
  if (!header && h3 && h3.parentNode) {
    // Create header wrapper
    header = document.createElement('div');
    header.className = 'modal-header';
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px;';
    
    // Create icons container
    const headerIcons = document.createElement('div');
    headerIcons.className = 'modal-header-icons';
    headerIcons.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';
    
    // Insert header before h3, then move h3 and add icons
    h3.parentNode.insertBefore(header, h3);
    header.appendChild(h3);
    header.appendChild(headerIcons);
    h3.style.margin = '0'; // Remove default margin since header handles spacing
  }
  
  const headerIcons = header?.querySelector('.modal-header-icons') as HTMLElement;
  let warningIcon = headerIcons?.querySelector('.imported-warning-icon') as HTMLElement;
  if (isImported && headerIcons) {
    const ontologyUrl = hasValidDefinedBy ? op.isDefinedBy : (op.uri ? getDefiningOntologyFromUri(op.uri, externalOntologyReferences) : 'an external ontology');
    const warningMessage = `This object property is defined in the external ontology ${ontologyUrl}, so it must be edited by opening that ontology instead.`;
    
    if (!warningIcon) {
      warningIcon = document.createElement('span');
      warningIcon.className = 'imported-warning-icon warning-icon-pulse';
      warningIcon.textContent = '⚠️';
      warningIcon.style.cssText = 'cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px; user-select: none;';
      warningIcon.setAttribute('role', 'button');
      warningIcon.setAttribute('tabindex', '0');
      warningIcon.title = warningMessage;
      
      // Add click handler to show popover
      warningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showWarningIconPopover(warningIcon, warningMessage, modal);
      });
      warningIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWarningIconPopover(warningIcon, warningMessage, modal);
        }
      });
      
      headerIcons.appendChild(warningIcon);
    } else {
      warningIcon.style.display = 'inline';
      warningIcon.classList.add('warning-icon-pulse');
      warningIcon.title = warningMessage;
      // Update click handler with new message by cloning to remove old listeners
      const oldIcon = warningIcon;
      const newWarningIcon = oldIcon.cloneNode(true) as HTMLElement;
      oldIcon.parentNode?.replaceChild(newWarningIcon, oldIcon);
      newWarningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showWarningIconPopover(newWarningIcon, warningMessage, modal);
      });
      newWarningIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWarningIconPopover(newWarningIcon, warningMessage, modal);
        }
      });
      warningIcon = newWarningIcon;
    }
  } else if (warningIcon) {
    warningIcon.style.display = 'none';
    warningIcon.classList.remove('warning-icon-pulse');
  }
  
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
  if (nameEl) nameEl.textContent = 'Identifier (derived from label):';
  if (identifierEl) {
    if (isImported && op) {
      // For imported properties, show with prefix format (e.g., "base:connectsTo")
      const label = op.label || extractLocalName(op.uri || op.name || type);
      const prefix = getPrefixForUri(op.uri, op.isDefinedBy, externalOntologyReferences, mainBase);
      if (prefix) {
        identifierEl.textContent = `${prefix}:${label}`;
      } else {
        const currentId = op.uri ?? op.name ?? type;
        identifierEl.textContent = (currentId.startsWith('http') ? currentId : baseWithHash + currentId);
      }
    } else {
      const currentId = op?.uri ?? baseWithHash + (op?.name ?? type);
      identifierEl.textContent = (currentId.startsWith('http') ? currentId : baseWithHash + currentId);
    }
  }
  if (definedByInput) {
    definedByInput.value = op?.isDefinedBy ?? '';
    // Always disable definedBy field
    definedByInput.disabled = true;
    definedByInput.style.opacity = '0.5';
    definedByInput.title = 'This field cannot be edited.';
  }
  if (labelInput) {
    labelInput.disabled = isImported;
    labelInput.style.opacity = isImported ? '0.5' : '1';
    labelInput.title = isImported ? 'Label cannot be changed for imported properties.' : '';
  }
  if (commentInput) {
    commentInput.disabled = isImported;
    commentInput.style.opacity = isImported ? '0.5' : '1';
    commentInput.title = isImported ? 'Comment cannot be changed for imported properties.' : '';
  }
  if (domainInput) {
    domainInput.disabled = isImported;
    domainInput.style.opacity = isImported ? '0.5' : '1';
  }
  if (rangeInput) {
    rangeInput.disabled = isImported;
    rangeInput.style.opacity = isImported ? '0.5' : '1';
  }
  if (subPropertyOfInput) {
    subPropertyOfInput.disabled = isImported;
    subPropertyOfInput.style.opacity = isImported ? '0.5' : '1';
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
    // subClassOf label should be unchecked by default
    const labelChecked = type === 'subClassOf' ? '' : 'checked';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
    // HTML attributes can contain # without escaping, but we need to escape quotes
    const htmlEscapedType = type.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const baseLabel = getRelationshipLabel(type, objectProperties, externalOntologyReferences);
    // Find property by name, URI, or local name extracted from URI
    // For external properties, name should be full URI (after parser fix), and type might be full URI or local name
    let op = objectProperties.find((p) => {
      // Direct match by name or URI
      if (p.name === type || p.uri === type) return true;
      
      // If type is a full URI, check if it matches p.uri or p.name (both should be full URI for external)
      if (type.startsWith('http://') || type.startsWith('https://')) {
        if (p.uri === type || p.name === type) return true;
        // Also check if p.uri or p.name contains the type (for partial matches)
        if (p.uri && (type.includes(p.uri) || p.uri.includes(type))) return true;
        if (p.name && p.name.startsWith('http') && (type.includes(p.name) || p.name.includes(type))) return true;
      }
      
      // If type is a local name, extract local name from p.uri or p.name and compare
      if (!type.startsWith('http://') && !type.startsWith('https://')) {
        // Extract local name from URI
        if (p.uri) {
          const uriLocalName = p.uri.includes('#') ? p.uri.split('#').pop() : p.uri.split('/').pop();
          if (uriLocalName === type) return true;
        }
        // Extract local name from name (if name is a full URI)
        if (p.name && (p.name.startsWith('http://') || p.name.startsWith('https://'))) {
          const nameLocalName = p.name.includes('#') ? p.name.split('#').pop() : p.name.split('/').pop();
          if (nameLocalName === type) return true;
        }
        // Direct match if p.name is the local name
        if (p.name === type && !p.name.startsWith('http://') && !p.name.startsWith('https://')) return true;
      }
      
      return false;
    });
    const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
    // Use op.uri or op.name (if full URI) for prefix detection, otherwise use type
    // This ensures imported properties get their prefix even if type is a local name
    const propertyNameForPrefix = op?.uri || (op?.name && (op.name.startsWith('http://') || op.name.startsWith('https://')) ? op.name : null) || type;
    
    // Debug: Log prefix detection for connectsTo (only in debug mode)
    if (isDebugMode() && (type.includes('connects') || (op && (op.name?.includes('connects') || op.uri?.includes('connects'))))) {
      debugLog('[PREFIX DEBUG]', {
        type,
        opFound: !!op,
        opName: op?.name,
        opUri: op?.uri,
        opIsDefinedBy: op?.isDefinedBy,
        propertyNameForPrefix,
        baseLabel,
        externalRefs: externalOntologyReferences.map(r => ({ url: r.url, prefix: r.prefix, usePrefix: r.usePrefix })),
      });
    }
    
    const displayLabel = formatRelationshipLabelWithPrefix(propertyNameForPrefix, baseLabel, externalOntologyReferences, op, mainBase);
    row.innerHTML = `
      <span style="font-weight: bold; font-family: Consolas, monospace; font-size: 12px; min-width: 100px;">${displayLabel}</span>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-show-cb" data-type="${htmlEscapedType}" checked>
        <span>Show</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-label-cb" data-type="${htmlEscapedType}" ${labelChecked}>
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
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  
  // Helper to format property name with prefix
  const formatPropName = (dp: DataPropertyInfo): string => {
    const prefix = getPrefixForUri(dp.uri, dp.isDefinedBy, externalOntologyReferences, mainBase);
    return prefix ? `${prefix}:${dp.label}` : dp.label;
  };
  
  dataProperties.forEach((dp) => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
    const propDisplayName = formatPropName(dp);
    row.innerHTML = `
      <span style="font-weight: bold; font-family: Consolas, monospace; font-size: 12px; min-width: 100px;">${propDisplayName}</span>
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

// Helper to get defining ontology from URI
function getDefiningOntologyFromUri(uri: string | null | undefined, externalOntologyReferences: ExternalOntologyReference[]): string {
  if (!uri) return 'an external ontology';
  for (const ref of externalOntologyReferences) {
    const refUrl = ref.url.endsWith('#') ? ref.url.slice(0, -1) : ref.url;
    if (uri.startsWith(refUrl) || uri.startsWith(refUrl + '#')) {
      return ref.url;
    }
  }
  return 'an external ontology';
}

// Helper to show warning icon popover (similar to rename modal popover)
function showWarningIconPopover(anchor: HTMLElement, message: string, modal: HTMLElement): void {
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  if (!modalContent) return;
  
  // Get or create popover element
  let popover = modalContent.querySelector('.warning-icon-popover') as HTMLElement;
  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'warning-icon-popover rename-popover';
    popover.setAttribute('role', 'tooltip');
    modalContent.appendChild(popover);
  }
  
  // Position and show popover
  const rect = anchor.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.left = `${rect.left}px`;
  popover.style.top = `${rect.bottom + 6}px`;
  popover.style.maxWidth = 'min(320px, calc(100vw - 24px))';
  popover.textContent = message;
  
  // Prefer opening above if too close to bottom
  const popoverHeight = 80;
  if (rect.bottom + popoverHeight + 8 > window.innerHeight && rect.top - popoverHeight - 8 > 0) {
    popover.style.top = `${rect.top - popoverHeight - 8}px`;
  }
  
  popover.classList.add('rename-popover-visible');
  
  // Hide popover when clicking outside
  const hidePopover = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.warning-icon-popover') && !target.closest('.imported-warning-icon')) {
      popover.classList.remove('rename-popover-visible');
      document.removeEventListener('click', hidePopover);
    }
  };
  
  // Use setTimeout to avoid immediate hiding
  setTimeout(() => {
    document.addEventListener('click', hidePopover);
  }, 0);
}

// Update editable state when isDefinedBy changes
function updateDataPropEditableState(): void {
  const modal = document.getElementById('editDataPropertyModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  const name = (modal as HTMLElement).dataset.dataPropName;
  if (!name) return;
  const definedByInput = document.getElementById('editDataPropDefinedBy') as HTMLInputElement;
  const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
  const commentInput = document.getElementById('editDataPropComment') as HTMLTextAreaElement;
  const rangeSel = document.getElementById('editDataPropRange') as HTMLSelectElement;
  const dp = dataProperties.find((p) => p.name === name);
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  const newDefinedBy = definedByInput?.value?.trim() || null;
  // Check if imported: use newDefinedBy if present, otherwise check if URI belongs to external ontology
  const isImported = dp ? (newDefinedBy ? isUriFromExternalOntology(dp.uri, newDefinedBy, externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, externalOntologyReferences, mainBase)) : false;
  
  // Update warning icon in header
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  const header = modalContent?.querySelector('.modal-header') as HTMLElement;
  const headerIcons = header?.querySelector('.modal-header-icons') as HTMLElement;
  let warningIcon = headerIcons?.querySelector('.imported-warning-icon') as HTMLElement;
  const hasValidDefinedBy = newDefinedBy && (newDefinedBy.startsWith('http://') || newDefinedBy.startsWith('https://'));
  const isImportedWithValidUrl = isImported && hasValidDefinedBy;
  
  if (isImported && headerIcons) {
    const ontologyUrl = newDefinedBy || (dp?.uri ? getDefiningOntologyFromUri(dp.uri, externalOntologyReferences) : 'an external ontology');
    const warningMessage = `This data property is defined in the external ontology ${ontologyUrl}, so it must be edited by opening that ontology instead.`;
    
    if (!warningIcon) {
      warningIcon = document.createElement('span');
      warningIcon.className = 'imported-warning-icon warning-icon-pulse';
      warningIcon.textContent = '⚠️';
      warningIcon.style.cssText = 'cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px; user-select: none;';
      warningIcon.setAttribute('role', 'button');
      warningIcon.setAttribute('tabindex', '0');
      warningIcon.title = warningMessage;
      
      // Add click handler to show popover
      warningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showWarningIconPopover(warningIcon, warningMessage, modal);
      });
      warningIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWarningIconPopover(warningIcon, warningMessage, modal);
        }
      });
      
      headerIcons.appendChild(warningIcon);
    } else {
      warningIcon.style.display = 'inline';
      warningIcon.classList.add('warning-icon-pulse');
      warningIcon.title = warningMessage;
      // Update click handler with new message by cloning to remove old listeners
      const oldIcon = warningIcon;
      const newWarningIcon = oldIcon.cloneNode(true) as HTMLElement;
      oldIcon.parentNode?.replaceChild(newWarningIcon, oldIcon);
      newWarningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showWarningIconPopover(newWarningIcon, warningMessage, modal);
      });
      newWarningIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWarningIconPopover(newWarningIcon, warningMessage, modal);
        }
      });
      warningIcon = newWarningIcon;
    }
  } else if (warningIcon) {
    warningIcon.style.display = 'none';
    warningIcon.classList.remove('warning-icon-pulse');
  }
  
  // Update input states
  if (labelInput) {
    labelInput.disabled = isImported;
    labelInput.style.opacity = isImported ? '0.5' : '1';
    labelInput.title = isImported ? 'Label cannot be changed for imported properties.' : '';
  }
  if (commentInput) {
    commentInput.disabled = isImported;
    commentInput.style.opacity = isImported ? '0.5' : '1';
    commentInput.title = isImported ? 'Comment cannot be changed for imported properties.' : '';
  }
  if (rangeSel) {
    rangeSel.disabled = isImported;
    rangeSel.style.opacity = isImported ? '0.5' : '1';
    rangeSel.title = isImported ? 'Range cannot be changed for imported properties.' : '';
  }
  
  updateEditDataPropIdentifierAndValidation();
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
  const definedByInput = document.getElementById('editDataPropDefinedBy') as HTMLInputElement;
  const dp = dataProperties.find((p) => p.name === name);
  const baseWithHash = getDisplayBase(ttlStore);
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  const newDefinedBy = definedByInput?.value?.trim() || null;
  // Check if imported: use newDefinedBy if present, otherwise check if URI belongs to external ontology
  const isImported = dp ? (newDefinedBy ? isUriFromExternalOntology(dp.uri, newDefinedBy, externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, externalOntologyReferences, mainBase)) : false;
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
  document.getElementById('editDataPropDefinedBy')?.addEventListener('input', updateDataPropEditableState);
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
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  // Check if imported: use isDefinedBy if present, otherwise check if URI belongs to external ontology
  const isImported = dp ? (dp.isDefinedBy ? isUriFromExternalOntology(dp.uri, dp.isDefinedBy, externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, externalOntologyReferences, mainBase)) : false;
  
  // Add/update warning icon if imported - place it in header aligned with h3
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  const h3 = modalContent?.querySelector('h3') as HTMLElement;
  
  // Ensure header structure exists (similar to editRelationshipTypeModal)
  let header = modalContent?.querySelector('.modal-header') as HTMLElement;
  if (!header && h3 && h3.parentNode) {
    // Create header wrapper
    header = document.createElement('div');
    header.className = 'modal-header';
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px;';
    
    // Create icons container
    const headerIcons = document.createElement('div');
    headerIcons.className = 'modal-header-icons';
    headerIcons.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';
    
    // Insert header before h3, then move h3 and add icons
    h3.parentNode.insertBefore(header, h3);
    header.appendChild(h3);
    header.appendChild(headerIcons);
    h3.style.margin = '0'; // Remove default margin since header handles spacing
  }
  
  const headerIcons = header?.querySelector('.modal-header-icons') as HTMLElement;
  let warningIcon = headerIcons?.querySelector('.imported-warning-icon') as HTMLElement;
  const hasValidDefinedBy = dp?.isDefinedBy && (dp.isDefinedBy.startsWith('http://') || dp.isDefinedBy.startsWith('https://'));
  const isImportedWithValidUrl = isImported && hasValidDefinedBy;
  
  if (isImported && headerIcons) {
    const ontologyUrl = hasValidDefinedBy ? dp.isDefinedBy : (dp.uri ? getDefiningOntologyFromUri(dp.uri, externalOntologyReferences) : 'an external ontology');
    const warningMessage = `This data property is defined in the external ontology ${ontologyUrl}, so it must be edited by opening that ontology instead.`;
    
    if (!warningIcon) {
      warningIcon = document.createElement('span');
      warningIcon.className = 'imported-warning-icon warning-icon-pulse';
      warningIcon.textContent = '⚠️';
      warningIcon.style.cssText = 'cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px; user-select: none;';
      warningIcon.setAttribute('role', 'button');
      warningIcon.setAttribute('tabindex', '0');
      warningIcon.title = warningMessage;
      
      // Add click handler to show popover
      warningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showWarningIconPopover(warningIcon, warningMessage, modal);
      });
      warningIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWarningIconPopover(warningIcon, warningMessage, modal);
        }
      });
      
      headerIcons.appendChild(warningIcon);
    } else {
      warningIcon.style.display = 'inline';
      warningIcon.classList.add('warning-icon-pulse');
      warningIcon.title = warningMessage;
      // Update click handler with new message by cloning to remove old listeners
      const oldIcon = warningIcon;
      const newWarningIcon = oldIcon.cloneNode(true) as HTMLElement;
      oldIcon.parentNode?.replaceChild(newWarningIcon, oldIcon);
      newWarningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showWarningIconPopover(newWarningIcon, warningMessage, modal);
      });
      newWarningIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWarningIconPopover(newWarningIcon, warningMessage, modal);
        }
      });
      warningIcon = newWarningIcon;
    }
  } else if (warningIcon) {
    warningIcon.style.display = 'none';
    warningIcon.classList.remove('warning-icon-pulse');
  }
  
  if (nameEl) nameEl.textContent = 'Identifier (derived from label):';
  if (identifierEl) {
    const fullUri = dp?.uri ?? baseWithHash + (dp?.name ?? name);
    identifierEl.textContent = fullUri;
  }
  if (labelValidationEl) {
    labelValidationEl.style.display = 'none';
    labelValidationEl.textContent = '';
  }
  if (definedByInput) {
    definedByInput.value = dp?.isDefinedBy ?? '';
    // Add listener to update editable state when isDefinedBy changes
    definedByInput.removeEventListener('input', updateDataPropEditableState);
    definedByInput.addEventListener('input', updateDataPropEditableState);
  }
  if (labelInput) {
    labelInput.value = dp?.label ?? name;
    labelInput.disabled = isImported;
    labelInput.style.opacity = isImported ? '0.5' : '1';
    labelInput.title = isImported ? 'Label cannot be changed for imported properties.' : '';
  }
  if (commentInput) {
    commentInput.value = dp?.comment ?? '';
    commentInput.disabled = isImported;
    commentInput.style.opacity = isImported ? '0.5' : '1';
    commentInput.title = isImported ? 'Comment cannot be changed for imported properties.' : '';
  }
  const rangeOptions = [...DATA_PROPERTY_RANGE_OPTIONS];
  if (dp?.range && !rangeOptions.some((o) => o.value === dp.range)) {
    rangeOptions.push({ value: dp.range, label: dp.range.includes('#') ? dp.range.split('#').pop()! : dp.range });
  }
  rangeSel.innerHTML = rangeOptions.map((opt) => `<option value="${opt.value}"${dp?.range === opt.value ? ' selected' : ''}>${opt.label}</option>`).join('');
  rangeSel.disabled = isImported;
  rangeSel.style.opacity = isImported ? '0.5' : '1';
  rangeSel.title = isImported ? 'Range cannot be changed for imported properties.' : '';
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
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  const isImported = ap ? isUriFromExternalOntology(ap.uri, ap.isDefinedBy, externalOntologyReferences, mainBase) : false;
  
  // Add/update warning icon if imported - place it in header aligned with h3
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  const h3 = modalContent?.querySelector('h3') as HTMLElement;
  
  // Ensure header structure exists (similar to editRelationshipTypeModal and editDataPropertyModal)
  let header = modalContent?.querySelector('.modal-header') as HTMLElement;
  if (!header && h3 && h3.parentNode) {
    // Create header wrapper
    header = document.createElement('div');
    header.className = 'modal-header';
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px;';
    
    // Create icons container
    const headerIcons = document.createElement('div');
    headerIcons.className = 'modal-header-icons';
    headerIcons.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';
    
    // Insert header before h3, then move h3 and add icons
    h3.parentNode.insertBefore(header, h3);
    header.appendChild(h3);
    header.appendChild(headerIcons);
    h3.style.margin = '0'; // Remove default margin since header handles spacing
  }
  
  const headerIcons = header?.querySelector('.modal-header-icons') as HTMLElement;
  let warningIcon = headerIcons?.querySelector('.imported-warning-icon') as HTMLElement;
  const hasValidDefinedBy = ap?.isDefinedBy && (ap.isDefinedBy.startsWith('http://') || ap.isDefinedBy.startsWith('https://'));
  const isImportedWithValidUrl = isImported && hasValidDefinedBy;
  
  if (isImportedWithValidUrl && headerIcons) {
    const ontologyUrl = ap.isDefinedBy || (ap.uri ? getDefiningOntologyFromUri(ap.uri, externalOntologyReferences) : 'an external ontology');
    const warningMessage = `This annotation property is defined in the external ontology ${ontologyUrl !== 'an external ontology' ? ontologyUrl : ''}, so it must be edited by opening that ontology instead.`;
    
    if (!warningIcon) {
      warningIcon = document.createElement('span');
      warningIcon.className = 'imported-warning-icon warning-icon-pulse';
      warningIcon.textContent = '⚠️';
      warningIcon.style.cssText = 'cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px; user-select: none;';
      warningIcon.setAttribute('role', 'button');
      warningIcon.setAttribute('tabindex', '0');
      warningIcon.title = warningMessage;
      
      // Add click handler to show popover
      warningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showWarningIconPopover(warningIcon, warningMessage, modal);
      });
      warningIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWarningIconPopover(warningIcon, warningMessage, modal);
        }
      });
      
      headerIcons.appendChild(warningIcon);
    } else {
      warningIcon.style.display = 'inline';
      warningIcon.classList.add('warning-icon-pulse');
      warningIcon.title = warningMessage;
      // Update click handler with new message by cloning to remove old listeners
      const oldIcon = warningIcon;
      const newWarningIcon = oldIcon.cloneNode(true) as HTMLElement;
      oldIcon.parentNode?.replaceChild(newWarningIcon, oldIcon);
      newWarningIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showWarningIconPopover(newWarningIcon, warningMessage, modal);
      });
      newWarningIcon.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showWarningIconPopover(newWarningIcon, warningMessage, modal);
        }
      });
      warningIcon = newWarningIcon;
    }
  } else if (warningIcon) {
    warningIcon.style.display = 'none';
    warningIcon.classList.remove('warning-icon-pulse');
  }
  
  if (nameEl) {
    const prefix = ap ? getPrefixForUri(ap.uri, ap.isDefinedBy, externalOntologyReferences, mainBase) : null;
    const displayName = prefix ? `${prefix}:${name}` : name;
    nameEl.textContent = `Identifier: ${displayName} (used in ontology)`;
  }
  
  // Disable inputs if imported
  if (labelInput) {
    labelInput.disabled = isImported;
    labelInput.style.opacity = isImported ? '0.5' : '1';
    labelInput.title = isImported ? 'Label cannot be changed for imported properties.' : '';
  }
  if (commentInput) {
    commentInput.disabled = isImported;
    commentInput.style.opacity = isImported ? '0.5' : '1';
    commentInput.title = isImported ? 'Comment cannot be changed for imported properties.' : '';
  }
  if (rangeSel) {
    rangeSel.disabled = isImported;
    rangeSel.style.opacity = isImported ? '0.5' : '1';
    rangeSel.title = isImported ? 'Range cannot be changed for imported properties.' : '';
  }
  // Get label from store - annotation properties may have rdfs:label
  if (labelInput) {
    if (ttlStore && ap?.uri) {
      const propUri = ap.uri;
      const labelQuads = ttlStore.getQuads(propUri as any, 'http://www.w3.org/2000/01/rdf-schema#label', null, null);
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
    if (ttlStore && ap?.uri) {
      const propUri = ap.uri;
      const commentQuads = ttlStore.getQuads(propUri as any, 'http://www.w3.org/2000/01/rdf-schema#comment', null, null);
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
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  
  // Helper to format property name with prefix
  const formatPropName = (ap: AnnotationPropertyInfo): string => {
    const prefix = getPrefixForUri(ap.uri, ap.isDefinedBy, externalOntologyReferences, mainBase);
    return prefix ? `${prefix}:${ap.name}` : ap.name;
  };
  
  const boolProps = annotationProperties.filter((ap) => ap.isBoolean);
  const textProps = annotationProperties.filter((ap) => !ap.isBoolean);

  if (boolProps.length > 0) {
    const boolSection = document.createElement('div');
    boolSection.style.marginBottom = '12px';
    boolSection.innerHTML = '<strong style="font-size: 11px;">Boolean properties</strong>';
    boolProps.forEach((ap) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin: 8px 0; padding: 8px; background: #f9f9f9; border-radius: 4px;';
      const propDisplayName = formatPropName(ap);
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
          <div style="font-weight: bold; font-family: Consolas, monospace; font-size: 11px; flex: 1;">${propDisplayName}</div>
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
      const propDisplayName = formatPropName(ap);
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          <div style="font-weight: bold; font-family: Consolas, monospace; font-size: 11px; flex: 1;">${propDisplayName}</div>
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
 * @returns Opacity value: 1.0 for matching, 0.65 for neighbors, 0.08 for others (minimum 5%)
 */
function getSearchOpacity(nodeId: string, matchingIds: Set<string>, neighborIds: Set<string>): number {
  if (matchingIds.has(nodeId)) {
    return 1.0; // 100% opacity for matching
  }
  if (neighborIds.has(nodeId)) {
    return 0.65; // 60-70% opacity for neighbors (using 65%)
  }
  return 0.08; // 8% opacity for others (increased transparency distance, minimum 5%)
}

function buildNetworkData(
  filter: {
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
  },
  graphData?: GraphData
): { nodes: DataSet; edges: DataSet } {
  const data = graphData ?? rawData;
  let filteredNodes = data.nodes.filter((n) =>
    shouldShowNodeByAnnotations(n, filter.annotationStyleConfig)
  );
  let nodeIds = new Set(filteredNodes.map((n) => n.id));
  
  // Extract edgeStyleConfig from filter first
  const edgeStyleConfig = filter.edgeStyleConfig;
  
  // Debug: Check for describes edges before filtering (only if they exist or are expected)
  const describesEdgesBeforeFilter = data.edges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  // Only log if describes edges exist or if they're referenced in the edge style config
  const hasDescribesInConfig = Object.keys(edgeStyleConfig).some(type => 
    type.includes('describes') || type === 'https://w3id.org/dano#describes'
  );
  if (describesEdgesBeforeFilter.length > 0 || hasDescribesInConfig) {
    if (describesEdgesBeforeFilter.length > 0) {
      debugLog('[DEBUG] Describes edges in rawData.edges before filtering:', describesEdgesBeforeFilter);
      debugLog('[DEBUG] Available node IDs in filteredNodes:', Array.from(nodeIds));
      describesEdgesBeforeFilter.forEach((e) => {
        const fromExists = nodeIds.has(e.from);
        const toExists = nodeIds.has(e.to);
        debugLog(`[DEBUG] Describes edge: from="${e.from}" (exists: ${fromExists}), to="${e.to}" (exists: ${toExists}), type="${e.type}"`);
        if (!fromExists || !toExists) {
          debugWarn(`[DEBUG] ⚠ Describes edge will be filtered out - missing nodes`);
          if (!fromExists) debugWarn(`[DEBUG]   Missing from node: "${e.from}"`);
          if (!toExists) debugWarn(`[DEBUG]   Missing to node: "${e.to}"`);
        }
      });
    } else if (hasDescribesInConfig) {
      debugWarn('[DEBUG] ⚠ Display config references "describes" edges but none found in rawData.edges');
    }
  }
  
  // Debug: Check for edges with external property URIs before filtering
  const externalEdgesBeforeFilter = data.edges.filter((e) => 
    (e.type.startsWith('http://') || e.type.startsWith('https://')) &&
    (e.type.includes('describes') || e.type.includes('dano'))
  );
  if (externalEdgesBeforeFilter.length > 0) {
    debugLog('[DEBUG] External property edges in data.edges:', externalEdgesBeforeFilter);
    debugLog('[DEBUG] Available node IDs:', Array.from(nodeIds));
    externalEdgesBeforeFilter.forEach((e) => {
      debugLog(`[DEBUG] Edge ${e.type}: from="${e.from}" (exists: ${nodeIds.has(e.from)}), to="${e.to}" (exists: ${nodeIds.has(e.to)})`);
    });
  }
  
  let filteredEdges = data.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
  );
  
  // Debug: Check describes edges after node filtering (only if they exist)
  const describesEdgesAfterNodeFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesAfterNodeFilter.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges after node filtering: ${describesEdgesAfterNodeFilter.length}`, describesEdgesAfterNodeFilter);
  }

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

  // edgeStyleConfig is already defined above at the start of the function
  
  // Debug: Check describes edges before style filtering (only if they exist)
  const describesEdgesBeforeStyleFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesBeforeStyleFilter.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges before style filtering: ${describesEdgesBeforeStyleFilter.length}`, describesEdgesBeforeStyleFilter);
  }
  
  // Debug: Check edge style config for describes
  const describesEdgeType = describesEdgesBeforeStyleFilter.length > 0 ? describesEdgesBeforeStyleFilter[0].type : null;
  if (describesEdgeType) {
    const describesStyle = edgeStyleConfig[describesEdgeType];
    debugLog(`[DEBUG] Edge style config for "${describesEdgeType}":`, describesStyle);
    debugLog(`[DEBUG] All edge style config keys:`, Object.keys(edgeStyleConfig));
  }
  
  // Debug: Log edges with external property URIs
  const externalEdges = filteredEdges.filter((e) => e.type.startsWith('http://') || e.type.startsWith('https://'));
  if (externalEdges.length > 0) {
    debugLog('[DEBUG] External property edges found:', externalEdges.map((e) => ({ from: e.from, to: e.to, type: e.type })));
    debugLog('[DEBUG] Edge style config keys:', Object.keys(edgeStyleConfig));
  }
  
  filteredEdges = filteredEdges.filter((e) => {
    const style = edgeStyleConfig[e.type];
    const shouldShow = !style || style.show !== false;
    
    // Debug: Specifically log describes edge filtering
    if (e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')) {
      debugLog(`[DEBUG] Describes edge style check:`, {
        type: e.type,
        style: style,
        shouldShow: shouldShow,
        showValue: style?.show,
      });
      if (!shouldShow) {
        debugWarn(`[DEBUG] ⚠ Describes edge filtered out by style config:`, style);
      }
    }
    
    if (!shouldShow && (e.type.startsWith('http://') || e.type.startsWith('https://'))) {
      debugWarn(`[DEBUG] External edge filtered out: ${e.type}, style:`, style);
    }
    return shouldShow;
  });
  
  // Debug: Check describes edges after style filtering (only if they exist)
  const describesEdgesAfterStyleFilter = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesAfterStyleFilter.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges after style filtering: ${describesEdgesAfterStyleFilter.length}`, describesEdgesAfterStyleFilter);
  }

  const layoutMode = filter.layoutMode;
  const wrapChars = filter.wrapChars ?? 12;
  const minFontSize = Math.max(8, Math.min(96, filter.minFontSize ?? 20));
  const maxFontSize = Math.max(minFontSize, Math.min(96, filter.maxFontSize ?? 70));
  const relationshipFontSize = Math.max(8, Math.min(48, filter.relationshipFontSize ?? 18));
  const dataPropertyFontSize = Math.max(8, Math.min(48, filter.dataPropertyFontSize ?? 12));
  const { depth, maxDepth } = computeNodeDepths(nodeIds, filteredEdges);

  let nodePositions: Record<string, { x: number; y: number }> = {};
  
  // First, preserve any existing positions from rawData (loaded from config or set by drag)
  filteredNodes.forEach((n) => {
    if (n.x != null && n.y != null) {
      nodePositions[n.id] = { x: n.x, y: n.y };
    }
  });
  
  // Use layout registry for hierarchical layouts
  // Only compute positions for nodes that don't already have positions
  const layoutAlgorithm = getLayoutAlgorithm(layoutMode);
  const nodesWithoutPositions = filteredNodes.filter((n) => !(n.x != null && n.y != null));
  
  if (layoutAlgorithm && nodesWithoutPositions.length > 0) {
    // Only compute layout for nodes without positions
    const nodesToLayout = new Set(nodesWithoutPositions.map((n) => n.id));
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
    
    // Compute layout for all nodes (algorithm needs full graph context)
    const computedPositions = layoutAlgorithm(
      nodeIds,
      filteredEdges,
      SPACING,
      nodeDimensions
    );
    const resolvedPositions = resolveOverlaps(
      computedPositions,
      nodeIds,
      filteredEdges,
      nodeDimensions,
      { minPadding: 8 }
    );
    
    // Only use computed positions for nodes that don't already have positions
    Object.entries(resolvedPositions).forEach(([id, pos]) => {
      if (nodesToLayout.has(id) && !nodePositions[id]) {
        nodePositions[id] = pos;
        // Also update data (rawData or expanded) to keep it in sync
        const node = data.nodes.find((n) => n.id === id);
        if (node) {
          node.x = pos.x;
          node.y = pos.y;
        }
      }
    });
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
    // Debug: Log node info before formatting label
    if (isDebugMode() && (n.id?.includes('BaseEntity') || n.label?.includes('Base Entity'))) {
      debugLog('[PREFIX DEBUG] Formatting label for node:', {
        id: n.id,
        label: n.label,
        isExternal: (n as GraphNode & { isExternal?: boolean }).isExternal,
        externalOntologyUrl: (n as GraphNode & { externalOntologyUrl?: string }).externalOntologyUrl,
        externalRefs: externalOntologyReferences.map(r => ({ url: r.url, prefix: r.prefix, usePrefix: r.usePrefix })),
      });
    }
    const displayLabel = formatNodeLabelWithPrefix(n, externalOntologyReferences);
    
    // Apply search transparency if search query is active; external nodes use configured opacity
    const isExternal = (n as GraphNode & { isExternal?: boolean; externalOntologyUrl?: string }).isExternal;
    const externalUrl = (n as GraphNode & { externalOntologyUrl?: string }).externalOntologyUrl;
    const baseOpacity = isExternal ? getOpacityForExternalOntology(externalUrl, externalOntologyReferences) : 1.0;
    let nodeOpacity = baseOpacity;
    let backgroundColor = style.background;
    let borderColor = style.border;
    let fontColor = '#2c3e50';
    
    if (searchQuery) {
      const searchOpacity = getSearchOpacity(n.id, matchingNodeIds, neighborNodeIds);
      nodeOpacity = isExternal ? searchOpacity * baseOpacity : searchOpacity;
      if (nodeOpacity < 1.0) {
        backgroundColor = applyOpacityToColor(style.background, nodeOpacity);
        borderColor = applyOpacityToColor(style.border, nodeOpacity);
        fontColor = applyOpacityToColor('#2c3e50', nodeOpacity);
      }
    } else if (isExternal) {
      backgroundColor = applyOpacityToColor(style.background, baseOpacity);
      borderColor = applyOpacityToColor(style.border, baseOpacity);
      fontColor = applyOpacityToColor('#2c3e50', baseOpacity);
    }
    
    const node: Record<string, unknown> = {
      id: n.id,
      label: wrapText(displayLabel, wrapChars),
      labellableRoot: n.labellableRoot,
      color: { background: backgroundColor, border: borderColor },
      font: { size: fontSize, color: fontColor },
      ...(style.shapeProperties && { shapeProperties: style.shapeProperties }),
      ...((): { title?: string } => {
        const title =
          n.comment ??
          ((n as GraphNode & { isExternal?: boolean; externalOntologyUrl?: string }).isExternal &&
          (n as GraphNode & { externalOntologyUrl?: string }).externalOntologyUrl
            ? `(Imported from ${(n as GraphNode & { externalOntologyUrl: string }).externalOntologyUrl})`
            : undefined);
        return title ? { title } : {};
      })(),
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
      
      // Check if data property is imported and get its opacity
      // Use isDefinedBy if present, otherwise check if URI belongs to external ontology
      const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
      const isDataPropImported = dp ? (dp.isDefinedBy ? isUriFromExternalOntology(dp.uri, dp.isDefinedBy, externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, externalOntologyReferences, mainBase)) : false;
      // Get the defining ontology URL for opacity lookup
      const definingOntologyUrl = dp?.isDefinedBy || (dp?.uri ? getDefiningOntologyFromUri(dp.uri, externalOntologyReferences) : null);
      const baseDataPropOpacity = isDataPropImported ? getOpacityForExternalOntology(definingOntologyUrl, externalOntologyReferences) : 1.0;
      
      // Apply search transparency if search query is active
      // Data property nodes use imported opacity if applicable, otherwise inherit from class node
      let dataPropNodeOpacity = baseDataPropOpacity;
      let dataPropBackgroundColor = '#e8f4f8';
      let dataPropBorderColor = '#4a90a4';
      let dataPropFontColor = '#2c3e50';
      
      if (searchQuery) {
        // Use the class node's opacity category, but multiply by base opacity if imported
        const searchOpacity = getSearchOpacity(classId, matchingNodeIds, neighborNodeIds);
        dataPropNodeOpacity = isDataPropImported ? searchOpacity * baseDataPropOpacity : searchOpacity;
        if (dataPropNodeOpacity < 1.0) {
          dataPropBackgroundColor = applyOpacityToColor('#e8f4f8', dataPropNodeOpacity);
          dataPropBorderColor = applyOpacityToColor('#4a90a4', dataPropNodeOpacity);
          dataPropFontColor = applyOpacityToColor('#2c3e50', dataPropNodeOpacity);
        }
      } else if (isDataPropImported) {
        // Apply imported opacity
        dataPropBackgroundColor = applyOpacityToColor('#e8f4f8', baseDataPropOpacity);
        dataPropBorderColor = applyOpacityToColor('#4a90a4', baseDataPropOpacity);
        dataPropFontColor = applyOpacityToColor('#2c3e50', baseDataPropOpacity);
      }
      
      // Get prefix for data property if it's imported
      const dataPropPrefix = dp ? getPrefixForUri(dp.uri, dp.isDefinedBy, externalOntologyReferences, mainBase) : null;
      const dataPropDisplayLabel = dataPropPrefix ? `${dataPropPrefix}:${dataProp.label}` : dataProp.label;
      
      // Format the node label as "prefix:property label (datatype)" - e.g., "dpbase:createdDate (xsd:dateTime)"
      const nodeLabel = `${dataPropDisplayLabel} (${rangeLabel})`;
      
      // Build tooltip: include comment if present, and add import hint if imported
      let tooltip = dp?.comment || '';
      if (isDataPropImported && definingOntologyUrl) {
        const importHint = `(Imported from ${definingOntologyUrl})`;
        tooltip = tooltip ? `${tooltip}\n\n${importHint}` : importHint;
      }
      
      // Debug: Log the actual label being set for the node
      debugLog(`[DEBUG] Setting data property node label: propertyName="${dataProp.propertyName}", classId="${classId}", nodeLabel="${nodeLabel}", prefix="${dataPropPrefix}", isImported="${isDataPropImported}", tooltip="${tooltip}"`);
        
      const dataPropNode: Record<string, unknown> = {
        id: dataProp.id,
        label: wrapText(nodeLabel, wrapChars),
        shape: 'box',
        size: 15,
        color: { background: dataPropBackgroundColor, border: dataPropBorderColor },
        font: { size: dataPropertyFontSize, color: dataPropFontColor },
        margin: 4,
        physics: false,
        x: finalDataPropPos.x,
        y: finalDataPropPos.y,
        ...(tooltip && { title: tooltip }),
      };
      
      // Apply opacity property if less than 1.0
      if (dataPropNodeOpacity < 1.0) {
        dataPropNode.opacity = dataPropNodeOpacity;
      }
      
      dataPropertyNodes.push(dataPropNode);
        
      propIndex++;
      
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
      
      // Create edge - no label (label is now in the node)
      // Arrow points from class (domain) to data property node (range type)
      if (dataProp.isRestriction) {
        dataPropertyEdges.push({
          id: `${classId}->${dataProp.id}:dataproprestrict`,
          from: classId,
          to: dataProp.id,
          arrows: 'to',
          label: '', // No label on edge - label is in the node
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
          label: '', // No label on edge - label is in the node
          font: { size: relationshipFontSize, color: dataPropEdgeFontColor },
          color: { color: dataPropEdgeColor, highlight: dataPropEdgeColor },
          dashes: [5, 5], // Dashed line
          width: 1, // Thinner line for normal data properties
        });
      }
    });
  });
  

  // Debug: Check describes edges before mapping to vis-network format (only if they exist)
  const describesEdgesBeforeMapping = filteredEdges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || e.type.includes('describes')
  );
  if (describesEdgesBeforeMapping.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges before mapping to vis-network: ${describesEdgesBeforeMapping.length}`, describesEdgesBeforeMapping);
  }
  
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
      debugLog(`[DEBUG] Mapping describes edge to vis-network:`, {
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
  
  // Debug: Check describes edges after mapping (only if they exist)
  const describesEdgesAfterMapping = edges.filter((e) => 
    (e.id as string).includes('describes')
  );
  if (describesEdgesAfterMapping.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] Describes edges after mapping to vis-network: ${describesEdgesAfterMapping.length}`, describesEdgesAfterMapping);
  }

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
  
  // Separate self-loops (from === to) from regular edges
  const selfLoops: Array<Record<string, unknown>> = [];
  const regularEdges: Array<Record<string, unknown>> = [];
  uniqueEdges.forEach((edgeObj) => {
    if (edgeObj.from === edgeObj.to) {
      selfLoops.push(edgeObj);
    } else {
      regularEdges.push(edgeObj);
    }
  });

  // Handle multiple self-loops on the same node - space them out using different sizes and angles
  // When multiple object properties have the same domain and range (self-loops), they overlap completely.
  // We use different selfReference.size values to create concentric loops that don't overlap.
  // The spacing scales with relationshipFontSize to prevent label overlap with larger fonts.
  const nodeToSelfLoops = new Map<string, Array<Record<string, unknown>>>();
  selfLoops.forEach((edgeObj) => {
    const nodeId = edgeObj.from as string;
    if (!nodeToSelfLoops.has(nodeId)) nodeToSelfLoops.set(nodeId, []);
    nodeToSelfLoops.get(nodeId)!.push(edgeObj);
  });
  nodeToSelfLoops.forEach((list) => {
    if (list.length >= 2) {
      // For multiple self-loops, space them out using different sizes to create concentric circles
      // Scale spacing with relationshipFontSize to accommodate larger labels
      // Base size: 2x font size (minimum 30) to ensure adequate spacing
      // Increment: 1.5x font size (minimum 20) to maintain proportional spacing
      const baseSize = Math.max(30, relationshipFontSize * 2);
      const sizeIncrement = Math.max(20, relationshipFontSize * 1.5);
      
      list.forEach((edgeObj, i) => {
        // Distribute angles evenly around the node (0 to 2π)
        const angleStep = (2 * Math.PI) / list.length;
        const angle = i * angleStep;
        
        // Use new selfReference format (replaces deprecated selfReferenceSize and selfReferenceAngle)
        edgeObj.selfReference = {
          size: baseSize + i * sizeIncrement,
          angle: angle,
        };
      });
    } else if (list.length === 1) {
      // Single self-loop - scale with font size (minimum 30)
      // Use default angle (Math.PI / 4) as suggested in the deprecation warning
      list[0].selfReference = {
        size: Math.max(30, relationshipFontSize * 2),
        angle: Math.PI / 4,
      };
    }
  });

  // Assign smooth curves to overlapping edges (same node pair) to avoid label/line overlap
  const pairToEdges = new Map<string, Array<Record<string, unknown>>>();
  regularEdges.forEach((edgeObj) => {
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

  // Combine regular edges with self-loops
  const processedEdges = [...regularEdges, ...selfLoops];

  // Combine regular nodes with data property nodes
  const allNodes = [...nodes, ...dataPropertyNodes];
  // Combine processed edges (regular + self-loops) with data property edges
  const allEdges = [...processedEdges, ...dataPropertyEdges];
  
  // Debug: Final check for describes edges
  const describesEdgesFinal = allEdges.filter((e) => 
    (e.id as string).includes('describes')
  );
  // Only log final describes edges summary if they exist or were expected
  if (describesEdgesFinal.length > 0 || describesEdgesBeforeFilter.length > 0) {
    debugLog(`[DEBUG] ===== FINAL: Describes edges in allEdges: ${describesEdgesFinal.length} =====`);
    if (describesEdgesFinal.length > 0) {
      debugLog('[DEBUG] ✓ Describes edges will be rendered:', describesEdgesFinal);
    } else if (describesEdgesBeforeFilter.length > 0) {
      // Only warn if we had describes edges that got filtered out
      debugWarn('[DEBUG] ⚠ NO describes edges in final allEdges - edge will NOT appear in graph!');
      debugLog('[DEBUG] Summary of filtering:');
      debugLog(`  - Total edges in data.edges: ${data.edges.length}`);
      debugLog(`  - Describes edges in data.edges: ${describesEdgesBeforeFilter.length}`);
      debugLog(`  - Filtered edges after node filtering: ${filteredEdges.length}`);
      debugLog(`  - Edges after style filtering: ${filteredEdges.length}`);
      debugLog(`  - Edges mapped to vis-network: ${edges.length}`);
      debugLog(`  - Unique edges (after deduplication): ${uniqueEdges.length}`);
    }
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
    // Allow clicks even when ttlStore is null (e.g., empty ontology) - network should still work
    if (!network) return;
    const target = e.target as HTMLElement;
    // When clicking Add node button, let vis-network's manipulation UI handle it
    // It will call our addNode handler when canvas is clicked
    if (target.closest?.('.vis-add')) {
      addNodeMode = true;
      // Don't prevent default - let vis-network handle it
      return;
    }
    // Don't interfere with manipulation UI unless we're in add node mode
    if (target.closest?.('.vis-manipulation') && !addNodeMode) return;
    
    // Only handle clicks on the canvas itself when in add node mode
    if (!addNodeMode) return;
    
    // Check if click is on the network canvas (not on UI elements)
    // Allow clicks on the network container or its children
    const isNetworkClick = container.contains(target) || target.closest('#network') || target.id === 'network';
    if (!isNetworkClick) return;
    
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
    addNodeMode = false; // Reset after showing modal
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
  if (titleEl) titleEl.textContent = 'Edit class properties';
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
  const isExternal = node?.isExternal && node?.externalOntologyUrl;
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  const isImported = isExternal || (node && node.externalOntologyUrl && isUriFromExternalOntology(node.id, node.externalOntologyUrl, externalOntologyReferences, mainBase));
  
  // Add/update warning icon if imported - place it in header aligned with h3
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  const h3 = modalContent?.querySelector('h3') as HTMLElement;
  
  // Use the existing rename-modal-header structure (the HTML already has this)
  let header = modalContent?.querySelector('.rename-modal-header') as HTMLElement;
  // The header already exists in the HTML, so we don't need to create it
  // Just get the header icons container
  const headerIcons = header?.querySelector('.rename-modal-header-icons') as HTMLElement || 
                      header?.querySelector('#renameModalHeaderIcons') as HTMLElement ||
                      modalContent?.querySelector('#renameModalHeaderIcons') as HTMLElement;
  let warningIcon = headerIcons?.querySelector('.imported-warning-icon') as HTMLElement;
  if (isImported && headerIcons) {
    if (!warningIcon) {
      warningIcon = document.createElement('span');
      warningIcon.className = 'imported-warning-icon warning-icon-pulse';
      warningIcon.textContent = '⚠️';
      warningIcon.style.cssText = 'cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px; user-select: none;';
      warningIcon.setAttribute('role', 'button');
      warningIcon.setAttribute('tabindex', '0');
      headerIcons.appendChild(warningIcon);
    } else {
      warningIcon.style.display = 'inline';
      warningIcon.classList.add('warning-icon-pulse');
    }
    const ontologyUrl = node?.externalOntologyUrl || 'an external ontology';
    warningIcon.title = `This class is defined in the external ontology ${ontologyUrl}, so it must be edited by opening that ontology instead.`;
  } else if (warningIcon) {
    warningIcon.style.display = 'none';
    warningIcon.classList.remove('warning-icon-pulse');
  }
  
  const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
  if (commentInput) {
    commentInput.value = node?.comment ?? '';
    commentInput.disabled = isImported;
    commentInput.style.opacity = isImported ? '0.5' : '1';
    commentInput.title = isImported ? 'Comment cannot be changed for imported classes.' : '';
  }
  if (input) {
    input.disabled = isImported;
    input.style.opacity = isImported ? '0.5' : '1';
    input.title = isImported ? 'Label cannot be changed for imported classes.' : '';
  }

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
  setRenameModalTipButtonVisible(!fileHandle);

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
  setRenameModalTipButtonVisible(false);
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
  const allNodeIds = (currentGraphDataForBuild?.nodes ?? rawData.nodes).map((n) => n.id);
  nodeModalFormUi.syncAddNodeModal({
    store: ttlStore,
    existingIds: new Set(allNodeIds),
    label: customInput?.value?.trim() ?? '',
    externalLabel: selectedExternalClass?.label ?? null,
    externalClassUri: selectedExternalClass?.uri ?? null,
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
  addNodeModalShowing = false;
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
  // Debug logging (only in debug mode)
  if (isDebugMode()) {
    debugLog('Search query:', query);
    debugLog('External references:', externalOntologyReferences);
  }
  
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
    const queryLower = query.toLowerCase().trim();
    const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
    const referencedFromStore = ttlStore && mainBase
      ? getReferencedExternalClassesFromStore(ttlStore, mainBase, externalOntologyReferences)
      : [];
    referencedFromStore.forEach((c) => knownExternalClassUris.add(c.uri));
    const stubs: ExternalClassInfo[] = [];
    for (const uri of knownExternalClassUris) {
      if (referencedFromStore.some((c) => c.uri === uri)) continue;
      const stub = getStubExternalClassForUri(uri, externalOntologyReferences);
      if (stub) stubs.push(stub);
    }
    const combined = [...referencedFromStore, ...stubs];
    const referencedMatches = combined.filter((cls) => {
      const localNameLower = cls.localName.toLowerCase();
      const labelLower = cls.label.toLowerCase();
      return localNameLower.includes(queryLower) || labelLower.includes(queryLower);
    });
    const fetched = await searchExternalClasses(query, externalOntologyReferences);
    const seenUris = new Set(referencedMatches.map((c) => c.uri));
    const fromFetched = fetched.filter((c) => !seenUris.has(c.uri));
    fromFetched.forEach((c) => seenUris.add(c.uri));
    const results = [...referencedMatches, ...fromFetched];
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog('Search results:', results);
    }

    const existingNodeIds = new Set((currentGraphDataForBuild?.nodes ?? rawData.nodes).map((n) => n.id));
    const ALREADY_IN_GRAPH_MSG = 'The node related to this class is already existing in the editor canvas.';
    const alreadyInGraphHtml = (msg: string) =>
      `<div style="font-size: 11px; color: #b8860b; margin-top: 4px; font-weight: 500;">${msg}</div>`;

    if (results.length === 0) {
      if (resultsDiv) {
        resultsDiv.innerHTML = '<div style="padding: 8px; color: #666; font-size: 11px;">No classes found</div>';
        resultsDiv.style.display = 'block';
      }
      if (descDiv) descDiv.style.display = 'none';
      selectedExternalClass = null;
    } else if (results.length === 1) {
      const match = results[0];
      selectedExternalClass = match;
      if (descDiv) {
        const alreadyInGraph = existingNodeIds.has(match.uri);
        descDiv.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 4px;">${match.label}${match.prefix ? ` (${match.prefix}:${match.localName})` : ''}</div>
          ${match.comment ? `<div style="margin-top: 4px;">${match.comment}</div>` : ''}
          <div style="margin-top: 4px; font-size: 10px; color: #999;">From: ${match.ontologyUrl}</div>
          ${alreadyInGraph ? alreadyInGraphHtml(ALREADY_IN_GRAPH_MSG) : ''}
        `;
        descDiv.style.display = 'block';
      }
      if (resultsDiv) resultsDiv.style.display = 'none';
    } else {
    if (resultsDiv) {
      resultsDiv.innerHTML = results.map((cls, idx) => {
        const alreadyInGraph = existingNodeIds.has(cls.uri);
        return `
        <div class="external-class-result" data-index="${idx}" style="padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; ${idx === 0 ? 'background: #f0f7ff;' : ''}${alreadyInGraph ? ' opacity: 0.75;' : ''}" onmouseover="this.style.background='#f0f7ff'" onmouseout="this.style.background='${idx === 0 ? '#f0f7ff' : 'transparent'}'">
          <div style="font-weight: bold;">${cls.label}${cls.prefix ? ` (${cls.prefix}:${cls.localName})` : ''}</div>
          ${cls.comment ? `<div style="font-size: 10px; color: #666; margin-top: 2px;">${cls.comment.substring(0, 100)}${cls.comment.length > 100 ? '...' : ''}</div>` : ''}
          <div style="font-size: 9px; color: #999; margin-top: 2px;">From: ${cls.ontologyUrl}</div>
          ${alreadyInGraph ? alreadyInGraphHtml(ALREADY_IN_GRAPH_MSG) : ''}
        </div>
      `;
      }).join('');
      resultsDiv.style.display = 'block';

      resultsDiv.querySelectorAll('.external-class-result').forEach((el, idx) => {
        el.addEventListener('click', () => {
          selectedExternalClass = results[idx];
          if (descDiv) {
            const r = results[idx];
            const alreadyInGraph = existingNodeIds.has(r.uri);
            descDiv.innerHTML = `
              <div style="font-weight: bold; margin-bottom: 4px;">${r.label}${r.prefix ? ` (${r.prefix}:${r.localName})` : ''}</div>
              ${r.comment ? `<div style="margin-top: 4px;">${r.comment}</div>` : ''}
              <div style="margin-top: 4px; font-size: 10px; color: #999;">From: ${r.ontologyUrl}</div>
              ${alreadyInGraph ? alreadyInGraphHtml(ALREADY_IN_GRAPH_MSG) : ''}
            `;
            descDiv.style.display = 'block';
          }
          if (resultsDiv) resultsDiv.style.display = 'none';
          refreshAddNodeOkButton();
        });
      });
    }
    if (descDiv) descDiv.style.display = 'none';
    selectedExternalClass = results[0];
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

  // Add from external ontology: add as external node (correct opacity/tooltip), not a new local class
  if (!selectedExternalClass || !ttlStore) return;
  knownExternalClassUris.add(selectedExternalClass.uri);
  const label = selectedExternalClass.label;
  const uri = selectedExternalClass.uri;

  const existingIds = new Set((currentGraphDataForBuild?.nodes ?? rawData.nodes).map((n) => n.id));
  if (existingIds.has(uri)) {
    if (extDupErr) {
      extDupErr.textContent = ADD_NODE_DUPLICATE_MESSAGE;
      extDupErr.style.display = 'block';
    }
    return;
  }

  const externalNode: GraphNode = {
    id: uri,
    label,
    labellableRoot: null,
    isExternal: true,
    externalOntologyUrl: selectedExternalClass.ontologyUrl,
    comment: selectedExternalClass.comment
      ? `${selectedExternalClass.comment}\n\n(Imported from ${selectedExternalClass.ontologyUrl})`
      : `(Imported from ${selectedExternalClass.ontologyUrl})`,
    ...(x != null && y != null && { x, y }),
  };
  userAddedExternalNodes.push(externalNode);
  if (loadedNodePositions) {
    loadedNodePositions[uri] = { x: x ?? 0, y: y ?? 0 };
  } else {
    loadedNodePositions = { [uri]: { x: x ?? 0, y: y ?? 0 } };
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
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
  const localMatches: Array<{ type: string; label: string; displayLabel: string; comment: string | null; isExternal: boolean; externalProp: ExternalObjectPropertyInfo | null }> = allTypes.filter((t) => {
    const label = getRelationshipLabel(t, objectProperties, externalOntologyReferences);
    const op = objectProperties.find((p) => p.name === t || p.uri === t);
    const displayLabel = formatRelationshipLabelWithPrefix(t, label, externalOntologyReferences, op, mainBase);
    return label.toLowerCase().includes(q) || 
           displayLabel.toLowerCase().includes(q) ||
           t.toLowerCase().includes(q);
  }).map((t) => {
    const comment = getRelationshipComment(t, objectProperties);
    const op = objectProperties.find((p) => p.name === t || p.uri === t);
    const label = getRelationshipLabel(t, objectProperties, externalOntologyReferences);
    return {
      type: t,
      label: label,
      displayLabel: formatRelationshipLabelWithPrefix(t, label, externalOntologyReferences, op, mainBase),
      comment: comment || null,
      isExternal: false,
      externalProp: null as ExternalObjectPropertyInfo | null,
    };
  });
  
  // Search external object properties
  let externalMatches: Array<{ type: string; label: string; displayLabel: string; comment: string | null; isExternal: boolean; externalProp: ExternalObjectPropertyInfo | null }> = [];
  if (externalOntologyReferences.length > 0) {
    try {
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog(`Searching external object properties for "${query}" across ${externalOntologyReferences.length} reference(s):`, externalOntologyReferences.map(r => r.url));
      }
      const externalProps = await searchExternalObjectProperties(query, externalOntologyReferences);
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog(`Found ${externalProps.length} external object properties matching "${query}"`);
      }
      externalMatches = externalProps.map((op) => {
        const displayLabel = op.prefix ? `${op.prefix}: ${op.label}` : op.label;
        // Debug logging (only in debug mode)
        if (isDebugMode()) {
          debugLog(`External property: ${op.uri} -> ${displayLabel}`);
        }
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
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog('No external ontology references loaded, skipping external object property search');
    }
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
  const parsed = parseEdgeId(edgeId);
  if (!parsed) return;
  const { from, to, type } = parsed;
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
      debugWarn('[DEBUG] No restriction edge found, using fallback:', {
        edgeFrom,
        edgeTo,
        edgeType,
        allMatchingEdges,
        selectedEdge: edge,
      });
    } else if (!edge) {
      debugError('[DEBUG] No matching edge found at all:', {
        edgeFrom,
        edgeTo,
        edgeType,
        allEdgesWithType: rawData.edges.filter((e) => e.type === edgeType).slice(0, 5),
      });
    }
    
    // Debug: Log edge lookup - ALWAYS log, not just when multiple edges
    debugLog('[DEBUG] Edge lookup result:', {
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
    
    const nodesForDropdown = currentGraphDataForBuild?.nodes ?? rawData.nodes;
    fromSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === edgeFrom ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, externalOntologyReferences)}</option>`).join('');
    toSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, externalOntologyReferences)}</option>`).join('');
    if (typeInputEdit) {
      const label = getRelationshipLabel(edgeType, objectProperties, externalOntologyReferences);
      // Find property by name, URI, or full URI string (edgeType might be local name or full URI for imported properties)
      // Try multiple matching strategies:
      // 1. Exact match by name
      // 2. Exact match by URI
      // 3. If edgeType is a local name, check if any property's URI ends with it
      // 4. If edgeType is a full URI, check if any property's URI matches it
      let op = objectProperties.find((p) => p.name === edgeType || p.uri === edgeType);
      if (!op && !edgeType.startsWith('http')) {
        // edgeType is likely a local name, try to find by URI ending
        op = objectProperties.find((p) => {
          if (!p.uri) return false;
          const uriLocalName = p.uri.includes('#') ? p.uri.split('#').pop() : p.uri.split('/').pop();
          return uriLocalName === edgeType || p.uri.endsWith('#' + edgeType) || p.uri.endsWith('/' + edgeType);
        });
      }
      if (!op && edgeType.startsWith('http')) {
        // edgeType is a full URI, try to find by URI matching
        op = objectProperties.find((p) => {
          if (!p.uri) return false;
          return p.uri === edgeType || edgeType.includes(p.uri) || p.uri.includes(edgeType);
        });
      }
      const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
      const displayLabel = formatRelationshipLabelWithPrefix(edgeType, label, externalOntologyReferences, op, mainBase);
      typeInputEdit.value = displayLabel;
      selectedEdgeType = edgeType;
      selectedExternalObjectProperty = null;
    }

    // Debug: Log edge lookup for troubleshooting
    debugLog('[DEBUG] showEditEdgeModal - edge lookup:', {
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
      debugLog('[DEBUG] showEditEdgeModal - restriction checkbox:', {
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
  // Use same node list as Edit Edge modal so user-added external nodes (full URI id) appear and pre-select correctly
  const nodesForDropdown = currentGraphDataForBuild?.nodes ?? rawData.nodes;
  fromSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === from ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, externalOntologyReferences)}</option>`).join('');
  toSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === to ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, externalOntologyReferences)}</option>`).join('');
  const typeInputAdd = document.getElementById('editEdgeType') as HTMLInputElement;
  if (typeInputAdd) {
    const defaultType = 'subClassOf';
    const label = getRelationshipLabel(defaultType, objectProperties, externalOntologyReferences);
    const op = objectProperties.find((p) => p.name === defaultType || p.uri === defaultType);
    const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
    const displayLabel = formatRelationshipLabelWithPrefix(defaultType, label, externalOntologyReferences, op, mainBase);
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
    const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;
    const found = getAllEdgeTypes(rawData, objectProperties).find(t => {
      const label = getRelationshipLabel(t, objectProperties, externalOntologyReferences);
      const op = objectProperties.find((p) => p.name === t || p.uri === t);
      const displayLabel = formatRelationshipLabelWithPrefix(t, label, externalOntologyReferences, op, mainBase);
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

    // Use canonical type (URI when available) so rawData key matches expandWithExternalRefs and we don't get duplicate edges
    const op = objectProperties.find((p) => p.name === newType || p.uri === newType);
    const canonicalType = op?.uri ?? newType;

    const newEdge: import('./types').GraphEdge = { 
      from, 
      to, 
      type: canonicalType,
      isRestriction: isRestriction
    };
    if (card && isRestriction) {
      newEdge.minCardinality = card.minCardinality ?? undefined;
      newEdge.maxCardinality = card.maxCardinality ?? undefined;
    }
    rawData.edges.push(newEdge);
    
    // If this is an external object property, add it to objectProperties array
    if (selectedExternalObjectProperty) {
      const existing = objectProperties.find((o) => o.name === newType);
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
        try {
          removeEdgeFromStore(ttlStore!, from, to, newType);
        } catch (err) {
          console.warn(`Undo: Failed to remove edge from store: ${err instanceof Error ? err.message : String(err)}`);
        }
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === canonicalType);
        if (i >= 0) rawData.edges.splice(i, 1);
      },
      () => {
        addEdgeToStore(ttlStore!, from, to, newType, card);
        rawData.edges.push(newEdge);
      }
    );
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    callback({ from, to, id: `${from}->${to}:${canonicalType}` });
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
  // Track what we removed to determine what to add back
  let onlyRemovedRestriction = false;
  const isChangingEdge = oldFrom !== newFrom || oldTo !== newTo || oldType !== newType;
  
  // When unchecking "is restriction", only remove the restriction, not the domain/range
  // When checking "is restriction" or changing other properties, remove both restriction and domain/range
  try {
    if (oldWasRestriction && !isRestriction) {
      // Unchecking "is restriction" - only remove restriction, edge remains as domain/range
      removeRestrictionFromStore(ttlStore, oldFrom, oldTo, oldType);
      onlyRemovedRestriction = true;
    } else if (!oldWasRestriction && isRestriction && !isChangingEdge) {
      // Checking "is restriction" on existing domain/range edge (not changing from/to/type)
      // Don't remove anything - domain/range already exists, we just need to add restriction
      onlyRemovedRestriction = true; // No removal needed, but domain/range exists
      // Skip removal - nothing to remove
    } else if (isChangingEdge || (oldWasRestriction && isRestriction)) {
      // Changing from/to/type OR changing restriction properties - remove edge completely
      removeEdgeFromStore(ttlStore, oldFrom, oldTo, oldType);
      onlyRemovedRestriction = false;
    }
    // If !oldWasRestriction && !isRestriction && !isChangingEdge: no change, nothing to do (handled by sameEdge check above)
  } catch (err) {
    // Edge may exist only in rawData (e.g. from object property domain/range) with no restriction in store)
    // Proceed: we will remove from rawData and add the new restriction to the store
    console.warn(`Failed to remove edge from store: ${err instanceof Error ? err.message : String(err)}`);
    if (!oldEdge) {
      hideEditEdgeModalWithCleanup();
      return;
    }
    // Assume we need to add complete edge if removal failed
    onlyRemovedRestriction = false;
  }
  
  // Only add restriction if isRestriction is true, otherwise the domain/range edge will remain visible
  if (isRestriction) {
    // If we only removed the restriction (or didn't remove anything because domain/range exists),
    // and we're not changing from/to/type, domain/range should still exist, so just add the restriction
    if (onlyRemovedRestriction && !isChangingEdge) {
      try {
        addRestrictionToStore(ttlStore, newFrom, newTo, newType, card);
      } catch (err) {
        // If restriction addition fails (e.g., domain/range doesn't exist), try adding complete edge
        const addOk = addEdgeToStore(ttlStore, newFrom, newTo, newType, card);
        if (!addOk) {
          // Restore the old restriction if adding new one failed
          if (oldWasRestriction) {
            try {
              addRestrictionToStore(ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
            } catch {
              addEdgeToStore(ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
            }
          }
          alert('Failed to update edge.');
          hideEditEdgeModalWithCleanup();
          return;
        }
      }
    } else {
      // Removed edge completely or changing from/to/type - need to add complete edge (domain/range + restriction)
      const addOk = addEdgeToStore(ttlStore, newFrom, newTo, newType, card);
      if (!addOk) {
        // Restore the old restriction if adding new one failed
        if (oldWasRestriction) {
          try {
            addRestrictionToStore(ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
          } catch {
            // If restoration fails, try adding complete edge
            addEdgeToStore(ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
          }
        }
        alert('Failed to update edge.');
        hideEditEdgeModalWithCleanup();
        return;
      }
    }
  }
  
  // Update rawData - remove old edge and add new one
  const idx = rawData.edges.findIndex((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
  if (idx >= 0) rawData.edges.splice(idx, 1);
  
  // Always add the edge back to rawData with the correct isRestriction flag
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
      // Undo: restore old edge state
      // Remove new edge completely
      try {
        removeEdgeFromStore(ttlStore!, newFrom, newTo, newType);
      } catch (err) {
        console.warn(`Undo: Failed to remove new edge from store: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Restore old edge
      if (oldWasRestriction) {
        addEdgeToStore(ttlStore!, oldFrom, oldTo, oldType, oldCard);
      }
      const i = rawData.edges.findIndex((e) => e.from === newFrom && e.to === newTo && e.type === newType);
      if (i >= 0) rawData.edges.splice(i, 1);
      const restoredEdge: import('./types').GraphEdge = { 
        from: oldFrom, 
        to: oldTo, 
        type: oldType,
        isRestriction: oldWasRestriction
      };
      if (oldWasRestriction && (oldCard.minCardinality != null || oldCard.maxCardinality != null)) {
        restoredEdge.minCardinality = oldCard.minCardinality ?? undefined;
        restoredEdge.maxCardinality = oldCard.maxCardinality ?? undefined;
      }
      rawData.edges.push(restoredEdge);
    },
    () => {
      // Redo: apply new edge state again
      // Remove old edge completely
      try {
        if (oldWasRestriction && !isRestriction) {
          // Was unchecking restriction - remove restriction only
          removeRestrictionFromStore(ttlStore!, oldFrom, oldTo, oldType);
        } else {
          // Was changing other properties or checking restriction - remove edge completely
          removeEdgeFromStore(ttlStore!, oldFrom, oldTo, oldType);
        }
      } catch (err) {
        console.warn(`Redo: Failed to remove old edge from store: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Add new edge
      if (isRestriction) {
        addEdgeToStore(ttlStore!, newFrom, newTo, newType, card);
      }
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
  if (!ttlStore) {
    debugError('[saveTtl] No ttlStore available');
    return;
  }
  const overwriteCb = document.getElementById('overwriteFile') as HTMLInputElement | null;
  const doOverwrite = overwriteCb?.checked === true && fileHandle;
  try {
    debugLog('[saveTtl] Starting save, doOverwrite:', doOverwrite);
    const ttlString = await storeToTurtle(ttlStore, externalOntologyReferences, originalTtlString ?? undefined);
    debugLog('[saveTtl] Got ttlString, length:', ttlString.length);
    if (doOverwrite) {
      if (!fileHandle) {
        throw new Error('File handle not available for overwrite');
      }
      const writable = await fileHandle.createWritable();
      await writable.write(ttlString);
      await writable.close();
      // Update originalTtlString to the newly saved content for idempotent round trips
      // This ensures that subsequent saves use the saved format as the reference
      originalTtlString = ttlString;
      debugLog('[saveTtl] File overwritten successfully');
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
      debugLog('[saveTtl] File download triggered');
    }
    hasUnsavedChanges = false;
    updateSaveButtonVisibility();
    debugLog('[saveTtl] Save completed successfully');
  } catch (err) {
    debugError('[saveTtl] Error during save:', err);
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    if (errorMsg) {
      errorMsg.textContent = `Save error: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
    // Re-throw to ensure the error is visible
    throw err;
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
        <input type="file" id="fileInput" accept=".ttl,.turtle,.owl,.rdf,.rdfxml,.jsonld,.json" style="display: none;" />
        <button type="button" id="manageExternalRefs" title="Manage external ontology references" style="width: fit-content; margin-top: 4px;">Manage external references</button>
      </div>
      <div id="vizControls" style="display: none;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Display options:</strong>
        <select id="layoutMode">
          <option value="hierarchical03">Hierarchical 01</option>
          <option value="hierarchical02">Hierarchical 02</option>
          <option value="hierarchical01">Hierarchical 03</option>
          <option value="force">Force-directed</option>
        </select>
        <div id="textDisplayWrap" style="position: relative; display: inline-block; margin-top: 4px;">
          <button type="button" id="textDisplayToggle" style="cursor: pointer; font-weight: bold; font-size: 12px;">Text display options</button>
        <div id="textDisplayPopup" style="position: absolute; top: 100%; left: 0; margin-top: 4px; padding: 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; display: none; min-width: 280px;">
          <div style="margin-bottom: 10px;">
            <strong style="font-size: 12px;">Nodes text wrap:</strong>
            <input type="number" id="wrapChars" min="1" max="50" value="12" style="width: 50px; margin-left: 6px;">
            <span style="font-size: 11px;">chars</span>
          </div>
          <div>
            <strong style="font-size: 12px;">Node font size (px)</strong>
            <div style="margin-top: 6px;">
              <span style="font-size: 11px;">Min (leaves)</span>
              <input type="number" id="minFontSize" min="8" max="96" value="20" style="width: 45px; margin-left: 6px;">
              <span style="font-size: 11px; margin-left: 8px;">Max (roots)</span>
              <input type="number" id="maxFontSize" min="8" max="96" value="70" style="width: 45px; margin-left: 6px;">
            </div>
          </div>
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Relationships font size</strong>
            <input type="number" id="relationshipFontSize" min="8" max="48" value="18" style="width: 45px; margin-left: 6px;">
            <span style="font-size: 11px;">px</span>
          </div>
          <div style="margin-top: 10px;">
            <strong style="font-size: 12px;">Data properties font size</strong>
            <input type="number" id="dataPropertyFontSize" min="8" max="48" value="12" style="width: 45px; margin-left: 6px;">
            <span style="font-size: 11px;">px</span>
          </div>
        </div>
      </div>
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
      <div>
        <strong>Search:</strong>
        <div id="searchWrap" style="position: relative; display: inline-block;">
          <input type="text" id="searchQuery" placeholder="Node or relationship..." autocomplete="off" style="width: 180px; padding-right: 24px; box-sizing: border-box;">
          <button type="button" id="searchClearBtn" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px 4px; color: #666; font-size: 16px; line-height: 1; display: none; z-index: 10;" title="Clear search" onmouseover="this.style.color='#333'" onmouseout="this.style.color='#666'">×</button>
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
      </div>
      <div id="errorMsg" class="error" style="display: none;"></div>
      <div id="warningMsg" class="warning" style="display: none;">
        <span id="warningMsgText"></span>
        <button id="warningMsgClose" type="button" title="Dismiss warning">×</button>
      </div>
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
        <div class="rename-modal-header">
          <h3>Edit class properties</h3>
          <div id="renameModalHeaderIcons" class="rename-modal-header-icons">
            <span id="renameModalTipBtn" class="rename-modal-header-icon" style="display: none;" role="button" tabindex="0" title="Tip">💡</span>
            <span id="renameModalInfoBtn" class="rename-modal-header-icon" role="button" tabindex="0" title="About this modal">ℹ️</span>
          </div>
        </div>
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
        <div style="margin-bottom: 12px; padding: 10px; background: #f0f8ff; border-radius: 4px;">
          <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
            <input type="checkbox" id="displayExternalRefs" checked>
            Display external references in graph
          </label>
          <div style="margin-top: 8px; font-size: 12px;">
            <label for="externalNodeLayout">External node layout:</label>
            <select id="externalNodeLayout" style="margin-left: 6px; padding: 4px;">
              <option value="auto">Auto-layout</option>
              <option value="right">Always right</option>
              <option value="top">Always top</option>
              <option value="bottom">Always bottom</option>
              <option value="left">Always left</option>
            </select>
          </div>
        </div>
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
  const warningMsg = document.getElementById('warningMsg') as HTMLElement;
  const vizControls = document.getElementById('vizControls') as HTMLElement;
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';
  errorMsg.innerHTML = '';
  errorMsg.style.cursor = '';
  warningMsg.style.display = 'none';

  try {
    // Store original TTL string to preserve format when saving
    originalTtlString = ttlString;
    
    const pathForParse = pathHint ?? fileName ?? '';
    const { parseResult, prefixMap, extractedRefs } = await loadOntologyFromContent(ttlString, pathForParse);
    const { graphData, store, annotationProperties: annotationProps, objectProperties: objectProps, dataProperties: dataProps } = parseResult;
    
    // Merge external refs early so we can detect used annotation properties before processing nodes
    const dbRefs = await loadExternalRefsFromIndexedDB(loadedFilePath, loadedFileName);
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
    const mainBaseForPrefixes = getMainOntologyBase(store);
    for (const [prefix, url] of Object.entries(prefixMap)) {
      const urlStr = String(url);
      const normalizedUrl = (urlStr.endsWith('#') ? urlStr.slice(0, -1) : urlStr).replace(/\/$/, '');
      const mainNormalized = mainBaseForPrefixes ? (mainBaseForPrefixes.endsWith('#') ? mainBaseForPrefixes.slice(0, -1) : mainBaseForPrefixes).replace(/\/$/, '') : '';
      
      // Skip if this prefix matches the main ontology base
      if (normalizedUrl === mainNormalized) continue;
      
      if (!seenUrls.has(normalizedUrl)) {
        mergedRefs.push({ url: urlStr, prefix, usePrefix: true });
        seenUrls.add(normalizedUrl);
      } else {
        // Update existing ref with prefix if not set
        const existingRef = mergedRefs.find(r => {
          const rUrl = (r.url.endsWith('#') ? r.url.slice(0, -1) : r.url).replace(/\/$/, '');
          return rUrl === normalizedUrl;
        });
        if (existingRef && !existingRef.prefix) {
          existingRef.prefix = prefix;
          existingRef.usePrefix = true;
        }
      }
    }
    
    externalOntologyReferences = mergedRefs;
    
    // Now detect used annotation properties BEFORE we process nodes for styling
    // This ensures imported annotation properties like core:labellableRoot are available
    const mainBaseForAnnotProps = getMainOntologyBase(store);
    const usedAnnotationProps = new Set<string>();
    const usedAnnotationPropsWithUri = new Map<string, string>(); // localName -> full URI
    const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
    const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';
    
    // Find all predicates used in the store that might be annotation properties
    for (const q of store) {
      const pred = q.predicate as { termType?: string; value?: string };
      if (pred.termType !== 'NamedNode') continue;
      const predUri = pred.value;
      if (!predUri) continue;
      
      // Skip standard RDF/OWL properties
      if (predUri.startsWith('http://www.w3.org/1999/02/22-rdf-syntax-ns#') ||
          predUri.startsWith('http://www.w3.org/2000/01/rdf-schema#') ||
          predUri.startsWith('http://www.w3.org/2002/07/owl#')) {
        continue;
      }
      
      // Check if this predicate is already in annotationProperties
      const localName = extractLocalName(predUri);
      const alreadyExists = annotationProps.some((ap) => ap.name === localName || ap.uri === predUri);
      if (alreadyExists) continue;
      
      // Check if this predicate belongs to an external ontology
      const isExternal = isUriFromExternalOntology(predUri, null, externalOntologyReferences, mainBaseForAnnotProps);
      if (isExternal) {
        usedAnnotationProps.add(localName);
        usedAnnotationPropsWithUri.set(localName, predUri);
      }
    }
    
    // Add used annotation properties that are from external ontologies to annotationProps
    for (const [localName, fullUri] of usedAnnotationPropsWithUri) {
      // Check if it's not already in the list
      if (!annotationProps.some((ap) => ap.name === localName || ap.uri === fullUri)) {
        // Try to get range from store (might be in parent ontology, but we can check)
        const { DataFactory } = await import('n3');
        let rangeQuads = store.getQuads(DataFactory.namedNode(fullUri), DataFactory.namedNode(RDFS_NS + 'range'), null, null);
        let range = rangeQuads.length > 0 ? (rangeQuads[0].object as { value?: string }).value ?? null : null;
        
        // If range is not in store, try to infer it from usage patterns
        if (!range) {
          const XSD_BOOLEAN_URI = XSD_NS + 'boolean';
          const usedWithBoolean = store.getQuads(null, DataFactory.namedNode(fullUri), null, null).some((q) => {
            const obj = q.object;
            if (obj.termType === 'Literal') {
              const objLit = obj as { datatype?: { value?: string }; value?: string };
              const datatype = objLit.datatype?.value;
              if (datatype === XSD_BOOLEAN_URI || datatype?.endsWith('#boolean')) {
                return true;
              }
              const value = objLit.value;
              if (value === 'true' || value === 'false') {
                return true;
              }
            }
            return false;
          });
          
          if (usedWithBoolean) {
            range = XSD_BOOLEAN_URI;
          }
        }
        
        const isBoolean = range === XSD_NS + 'boolean' || range?.endsWith('#boolean') || false;
        
        // Get isDefinedBy if present
        const isDefinedByQuads = store.getQuads(DataFactory.namedNode(fullUri), DataFactory.namedNode(RDFS_NS + 'isDefinedBy'), null, null);
        let isDefinedBy: string | undefined = undefined;
        if (isDefinedByQuads.length > 0 && isDefinedByQuads[0].object.termType === 'NamedNode') {
          isDefinedBy = (isDefinedByQuads[0].object as { value?: string }).value ?? undefined;
        } else {
          // Extract base URL from the URI
          const hashIndex = fullUri.indexOf('#');
          const slashIndex = fullUri.lastIndexOf('/');
          if (hashIndex > -1) {
            isDefinedBy = fullUri.slice(0, hashIndex);
          } else if (slashIndex > -1) {
            isDefinedBy = fullUri.slice(0, slashIndex + 1);
          }
          if (!isDefinedBy) {
            const definingOntology = getDefiningOntologyFromUri(fullUri, externalOntologyReferences);
            isDefinedBy = definingOntology !== 'an external ontology' ? definingOntology : undefined;
          }
        }
        
        annotationProps.push({
          name: localName,
          isBoolean,
          range: range ?? null,
          uri: fullUri,
          isDefinedBy: isDefinedBy,
        });
      }
    }
    
    // Now re-process nodes to extract annotation values using the complete annotation properties list
    // This is necessary because imported annotation properties weren't available during initial parsing
    const RDF_NS_FOR_NODES = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    const OWL_NS_FOR_NODES = 'http://www.w3.org/2002/07/owl#';
    const updatedNodes = graphData.nodes.map(node => {
      // Find the subject for this node by matching local name
      const classQuads = store.getQuads(null, DataFactory.namedNode(RDF_NS_FOR_NODES + 'type'), DataFactory.namedNode(OWL_NS_FOR_NODES + 'Class'), null);
      let subj: { termType: string; value: string } | null = null;
      for (const q of classQuads) {
        const subject = q.subject as { termType?: string; value?: string };
        if (subject.termType === 'NamedNode' && subject.value) {
          const subjUri = subject.value;
          const localName = extractLocalName(subjUri);
          if (localName === node.id) {
            subj = subject as { termType: string; value: string };
            break;
          }
        }
      }
      
      if (!subj) return node;
      
      let labellableRoot: boolean | null = node.labellableRoot;
      const annotations: Record<string, string | boolean | null> = { ...(node.annotations || {}) };
      
      const outQuads = store.getQuads(subj, null, null, null);
      for (const oq of outQuads) {
        const predName = extractLocalName((oq.predicate as { value: string }).value);
        const isAnnotation = annotationProps.some((ap) => ap.name === predName);
        if (!isAnnotation) continue;
        const obj = oq.object;
        const apInfo = annotationProps.find((ap) => ap.name === predName);
        if (apInfo?.isBoolean) {
          const val = (obj as { value: unknown }).value;
          const str = String(val).toLowerCase();
          const b = val === true || str === 'true' ? true : val === false || str === 'false' ? false : null;
          annotations[predName] = b;
          if (predName === 'labellableRoot') labellableRoot = b;
        } else {
          annotations[predName] = (obj as { value: unknown }).value != null ? String((obj as { value: unknown }).value) : null;
        }
      }
      
      return {
        ...node,
        labellableRoot,
        annotations,
      };
    });
    
    graphData.nodes = updatedNodes;

    // Validate ontology structure before proceeding
    const validationResult = validateOntologyStructure(graphData.nodes, graphData.edges);
    if (!validationResult.isValid) {
      const errorCount = validationResult.errors.length;
      const warningCount = validationResult.warnings.length;
      let errorSummary = 'Cannot open ontology';
      if (errorCount > 0 && warningCount > 0) {
        errorSummary += `: ${errorCount} error${errorCount !== 1 ? 's' : ''} and ${warningCount} warning${warningCount !== 1 ? 's' : ''} found`;
      } else if (errorCount > 0) {
        errorSummary += `: ${errorCount} error${errorCount !== 1 ? 's' : ''} found`;
      } else if (warningCount > 0) {
        errorSummary += `: ${warningCount} warning${warningCount !== 1 ? 's' : ''} found`;
      }
      
      // Create clickable error message
      errorMsg.innerHTML = `<span style="cursor: pointer; text-decoration: underline;">${errorSummary}</span>`;
      errorMsg.style.display = 'block';
      errorMsg.style.cursor = 'pointer';
      // Remove any existing click listeners by cloning and replacing
      const newErrorMsg = errorMsg.cloneNode(true) as HTMLElement;
      errorMsg.parentNode?.replaceChild(newErrorMsg, errorMsg);
      const currentErrorMsg = document.getElementById('errorMsg') as HTMLElement;
      currentErrorMsg.addEventListener('click', () => {
        showValidationErrorModal(validationResult);
      });
      
      vizControls.style.display = 'none';
      // Also create plain text version for the error object
      const errorText = formatValidationErrors(validationResult);
      throw new Error(`Invalid ontology structure: ${errorText}`);
    }
    
    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      console.warn('Ontology validation warnings:', validationResult.warnings);
    }

    rawData = graphData;
    annotationProperties = annotationProps;
    objectProperties = objectProps;
    dataProperties = dataProps;
    ttlStore = store;
    knownExternalClassUris = new Set();
    userAddedExternalNodes = [];

    loadedFileName = fileName ?? null;
    loadedFilePath = pathHint ?? fileName ?? null;
    fileHandle = handle ?? null;
    if (!fileHandle) clearCachedImageDirectory();
    hasUnsavedChanges = false;
    clearUndoRedo();
    updateFilePathDisplay();

    loadedEdgeStyleConfig = null;

    // Check if ontology has no classes AND no edges (canvas is truly empty)
    // If there are edges (even connecting external nodes), the canvas is not empty
    // Also check if there are object properties with domain/range that would create edges
    // (even if those edges connect external nodes like owl:Thing)
    let hasObjectPropertiesWithDomainRange = false;
    if (graphData.nodes.length === 0 && graphData.edges.length === 0) {
      // Check if any object properties have domain/range defined (would create edges with external nodes)
      const { DataFactory } = await import('n3');
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
      for (const op of objectProps) {
        const propUri = op.uri ?? (op.name.startsWith('http://') || op.name.startsWith('https://') ? op.name : null);
        if (!propUri) continue;
        const propNode = DataFactory.namedNode(propUri);
        const domainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), null, null);
        const rangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), null, null);
        if (domainQuads.length > 0 && rangeQuads.length > 0) {
          hasObjectPropertiesWithDomainRange = true;
          break;
        }
      }
    }
    
    if (graphData.nodes.length === 0 && graphData.edges.length === 0 && !hasObjectPropertiesWithDomainRange) {
      const warningText = document.getElementById('warningMsgText') as HTMLElement;
      if (warningText) {
        warningText.textContent = 'The current file defines no classes, so the canvas is empty.';
      }
      warningMsg.style.display = 'flex';
      
      // Setup close button
      const closeBtn = document.getElementById('warningMsgClose') as HTMLElement;
      if (closeBtn) {
        // Remove any existing listeners by cloning
        const newCloseBtn = closeBtn.cloneNode(true) as HTMLElement;
        closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);
        const currentCloseBtn = document.getElementById('warningMsgClose') as HTMLElement;
        currentCloseBtn.addEventListener('click', () => {
          warningMsg.style.display = 'none';
        });
      }
    } else {
      warningMsg.style.display = 'none';
    }

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
    const manageExternalRefsBtn = document.getElementById('manageExternalRefs');
    if (manageExternalRefsBtn) manageExternalRefsBtn.style.display = 'inline-block';

    debugLog('[DEBUG] After parsing - describes edges in rawData.edges:', rawData.edges.filter((e) => e.type.includes('describes')).length);
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog('Extracted external references from ontology:', extractedRefs);
      debugLog('Extracted prefixes:', prefixMap);
    }

    // Note: External references are already merged earlier (before node re-processing)
    // This ensures external ontology references are available when detecting used annotation properties
    
    // Add refs from namespaces used in the store (e.g. DANO loaded as RDF/XML has no owl:imports and no TTL prefixes)
    const mainBaseForNamespaceRefs = getMainOntologyBase(ttlStore);
    for (const ref of extractUsedNamespaceRefsFromStore(ttlStore, mainBaseForNamespaceRefs)) {
      const normalized = ref.url.endsWith('#') ? ref.url.slice(0, -1) : ref.url.replace(/\/$/, '');
      if (!seenUrls.has(normalized)) {
        mergedRefs.push(ref);
        seenUrls.add(normalized);
      }
    }

    sortExternalRefsByUrl(mergedRefs);
    externalOntologyReferences = mergedRefs;

    sortExternalRefsByUrl(mergedRefs);
    externalOntologyReferences = mergedRefs;
    // Debug logging removed - use debugLog if needed in future
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog(`Total external references: ${externalOntologyReferences.length}`);
      for (const ref of externalOntologyReferences) {
        debugLog(`  - ${ref.url} (prefix: ${ref.prefix || 'none'}, usePrefix: ${ref.usePrefix})`);
      }
    }

    const mainBaseForSeed = getMainOntologyBase(ttlStore);
    if (mainBaseForSeed && externalOntologyReferences.length > 0) {
      const refed = getReferencedExternalClassesFromStore(ttlStore, mainBaseForSeed, externalOntologyReferences);
      refed.forEach((c) => knownExternalClassUris.add(c.uri));
    }

    // Pre-fetch and cache external ontology classes and object properties (non-blocking)
    // Failures are expected (CORS, 404, etc.) and are handled silently unless in debug mode
    if (externalOntologyReferences.length > 0) {
      preloadExternalOntologyClasses(externalOntologyReferences).catch((err) => {
        // Only log in debug mode - failures are expected for many external ontologies
        if (isDebugMode()) {
          debugWarn('Failed to pre-load external ontologies:', err);
        }
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

    // Note: Used annotation properties are already detected and added earlier (before node re-processing)
    // This ensures imported annotation properties like core:labellableRoot are available when nodes are processed
    annotationProperties.sort((a, b) => a.name.localeCompare(b.name));

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
    
    // Set lastLayoutMode BEFORE applying config to prevent clearing positions
    // Get layout mode from config or default
    const configLayoutMode = displayConfig?.layoutMode || 'hierarchical03';
    const normalizedConfigLayoutMode = configLayoutMode === 'weighted' ? 'hierarchical01' : configLayoutMode;
    lastLayoutMode = normalizedConfigLayoutMode;
    
    if (displayConfig) {
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog('[DISPLAY CONFIG] Loading display config from IndexedDB for:', loadedFileName);
        debugLog('[DISPLAY CONFIG] Config has', Object.keys(displayConfig.nodePositions || {}).length, 'node positions');
        debugLog('[DISPLAY CONFIG] Config has', Object.keys(displayConfig.edgeStyleConfig || {}).length, 'edge style configs');
      }
      // Store the edge style config so it can be merged when building the filter
      loadedEdgeStyleConfig = displayConfig.edgeStyleConfig || null;
      applyDisplayConfig(displayConfig);
      if (displayConfig.viewState) savedViewState = displayConfig.viewState;
    } else {
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog('[DISPLAY CONFIG] No display config found in IndexedDB for:', loadedFileName);
      }
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
  // Don't return early - we need to initialize the network even with no nodes
  // so that Add node/Add edge buttons and double-click work
  const hasNodes = rawData.nodes.length > 0;

  let savedScale: number | null = null;
  let savedPosition: { x: number; y: number } | null = null;
  if (preserveView && network) {
    savedScale = network.getScale();
    savedPosition = network.getViewPosition();
  }

  const layoutMode = (document.getElementById('layoutMode') as HTMLSelectElement)
    .value;
  
  // Clear stored node positions ONLY when switching to a different layout mode
  // This ensures the new layout algorithm's positions are used, but preserves
  // positions when just applying filters or reloading
  const layoutModeChanged = lastLayoutMode !== null && lastLayoutMode !== layoutMode;
  if (layoutModeChanged) {
    const layoutAlgorithm = getLayoutAlgorithm(layoutMode);
    if (layoutAlgorithm || layoutMode === 'force') {
      // Switching to a layout that computes positions - clear stored positions
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog(`[DISPLAY CONFIG] Layout mode changed from ${lastLayoutMode} to ${layoutMode}, clearing node positions`);
      }
      rawData.nodes.forEach((node) => {
        delete node.x;
        delete node.y;
      });
    }
  }
  lastLayoutMode = layoutMode;
  const wrapChars =
    parseInt(
      (document.getElementById('wrapChars') as HTMLInputElement).value,
      10
    ) || 12;
  const minFontSize =
    parseInt(
      (document.getElementById('minFontSize') as HTMLInputElement).value,
      10
    ) || 20;
  const maxFontSize =
    parseInt(
      (document.getElementById('maxFontSize') as HTMLInputElement).value,
      10
    ) || 70;
  const relationshipFontSize =
    parseInt(
      (document.getElementById('relationshipFontSize') as HTMLInputElement).value,
      10
    ) || 18;
  const dataPropertyFontSize =
    parseInt(
      (document.getElementById('dataPropertyFontSize') as HTMLInputElement).value,
      10
    ) || 12;
  const searchEl = document.getElementById('searchQuery') as HTMLInputElement;
  const neighborsEl = document.getElementById(
    'searchIncludeNeighbors'
  ) as HTMLInputElement;
  const edgeStylesContent = document.getElementById('edgeStylesContent')!;

  const annotationPropsContent = document.getElementById('annotationPropsContent');
  // Get edge style config from DOM (user's current checkbox states)
  const domEdgeStyleConfig = getEdgeStyleConfig(edgeStylesContent, rawData, objectProperties, externalOntologyReferences);
  
  // Merge with loaded edge style config (from display config file) if present
  // DOM checkboxes take precedence over loaded config (user interaction overrides saved state)
  // Loaded config is used as fallback for edge types not yet in the DOM
  const mergedEdgeStyleConfig = loadedEdgeStyleConfig ? { ...loadedEdgeStyleConfig } : {};
  // Override with DOM checkbox states (user's current selections)
  Object.keys(domEdgeStyleConfig).forEach((type) => {
    const domStyle = domEdgeStyleConfig[type];
    if (domStyle) {
      mergedEdgeStyleConfig[type] = {
        show: domStyle.show,
        showLabel: domStyle.showLabel,
        color: domStyle.color,
        lineType: domStyle.lineType ?? mergedEdgeStyleConfig[type]?.lineType ?? 'solid',
      };
    }
  });
  
  const currentFilter = {
    wrapChars,
    minFontSize,
    maxFontSize,
    relationshipFontSize,
    dataPropertyFontSize,
    searchQuery: searchEl?.value ?? '',
    includeNeighbors: neighborsEl?.checked ?? true,
    edgeStyleConfig: mergedEdgeStyleConfig,
    annotationStyleConfig: getAnnotationStyleConfig(annotationPropsContent),
    layoutMode,
  };

  let graphDataForBuild: GraphData = rawData;
  if (displayExternalReferences && ttlStore && externalOntologyReferences.length > 0) {
    graphDataForBuild = expandWithExternalRefs(rawData, ttlStore, externalOntologyReferences, {
      displayExternalReferences,
      externalNodeLayout,
      nodePositions: loadedNodePositions ?? undefined,
    });
  }
  for (const n of userAddedExternalNodes) {
    if (!graphDataForBuild.nodes.some((nn) => nn.id === n.id)) {
      graphDataForBuild.nodes.push({ ...n });
    }
  }
  currentGraphDataForBuild = graphDataForBuild;
  const data = buildNetworkData(currentFilter, graphDataForBuild);
  if (network && ttlStore) {
    updateContextMenuData(ttlStore, graphDataForBuild, externalOntologyReferences, (url) => {
      const base = window.location.origin + window.location.pathname;
      window.open(`${base}?onto=${encodeURIComponent(url)}`, '_blank');
    });
  }
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
      // Get coordinates from nodeData, or use network view position if not provided
      let x = nodeData.x ?? 0;
      let y = nodeData.y ?? 0;
      // If coordinates are 0 or not provided, use the center of the view
      if ((x === 0 && y === 0) || (x === undefined && y === undefined)) {
        if (network) {
          const viewPos = network.getViewPosition();
          x = viewPos.x;
          y = viewPos.y;
        }
      }
      showAddNodeModal(x, y);
      addNodeMode = false; // Reset after showing modal
      callback(null);
    },
    addEdge: (
      edgeData: { from: string; to: string },
      callback: (data: { from: string; to: string; id?: string } | null) => void
    ) => {
      const from = String(edgeData.from);
      const to = String(edgeData.to);
      if (from === to) {
        callback(null);
        return;
      }
      // Allow adding edges even when ttlStore is null (e.g., empty ontology)
      // The modal will handle the case where ttlStore is null
      showAddEdgeModal(from, to, callback);
    },
    editEdge: {
      editWithoutDrag: (
        edgeData: { id?: string; from: string; to: string },
        callback: (data: { from: string; to: string } | null) => void
      ) => {
        const edgeId = edgeData.id ?? '';
        const parsed = parseEdgeId(edgeId);
        if (!parsed || !ttlStore) {
          callback(null);
          return;
        }
        const { from, to, type } = parsed;

        // Debug: Log edge click
        debugLog('[DEBUG] Edge clicked for editing:', { edgeId, from, to, type });
        
        // Debug: Check what edges exist in rawData for this match
        const matchingEdges = rawData.edges.filter((e) => e.from === from && e.to === to && e.type === type);
        debugLog('[DEBUG] All matching edges in rawData:', {
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
  // Legend must use displayed edges (graphDataForBuild) so domain/range edges from expandWithExternalRefs appear
  updateEdgeColorsLegend(rawData, objectProperties, externalOntologyReferences, graphDataForBuild.edges);

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
                  try {
                    removeEdgeFromStore(ttlStore!, edge.from, edge.to, edge.type);
                  } catch (err) {
                    console.warn(`Undo: Failed to remove pasted edge from store: ${err instanceof Error ? err.message : String(err)}`);
                  }
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
          // Debug logging (only in debug mode)
        if (isDebugMode()) {
          debugLog(`Copied ${count} relationship(s)`);
        }
        },
        (nodeId) => openEditModalForNode(nodeId),
        (edgeId) => openEditModalForEdge(edgeId),
        () => {
          if (network) updateSelectionInfoDisplay(network);
        }
      );
      
      // Update context menu data after initialization (use graphDataForBuild so external nodes are included)
      updateContextMenuData(ttlStore, graphDataForBuild, externalOntologyReferences, async (url) => {
        // Import the local file opener module
        const { findMatchingLocalFile, openLocalFileInNewTab } = await import('./lib/localFileOpener');
        
        // For local development: try to find and open the local file directly if it exists
        // This avoids CORS issues when the external ontology URL matches a local file
        if (fileHandle && loadedFileName) {
          const localFile = await findMatchingLocalFile(fileHandle, loadedFileName, url);
          if (localFile) {
            // Found matching local file! Store it in IndexedDB and open in new tab
            const newTabUrl = await openLocalFileInNewTab(localFile);
            window.open(newTabUrl, '_blank');
            return;
          }
        }
        
        // Fallback: open via URL (works for production/published ontologies)
        const base = window.location.origin + window.location.pathname;
        window.open(`${base}?onto=${encodeURIComponent(url)}`, '_blank');
      });
    }
    
    network.on('click', () => {
      if (network) updateSelectionInfoDisplay(network);
    });
    setupDragCoupling(network, {
      onDragEnd: () => {
        if (!network) return;
        persistNodePositionsFromNetwork(network, rawData, scheduleDisplayConfigSave);
      },
    });
    network.on('doubleClick', (params: { nodes: string[]; edges: string[] }) => {
      if (!network) return;
      if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0] as string;
        if (clickedNodeId.startsWith('http://') || clickedNodeId.startsWith('https://')) {
          return;
        }
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
          types: [
            { accept: { 'text/turtle': ['.ttl', '.turtle'] }, description: 'Turtle' },
            { accept: { 'application/rdf+xml': ['.owl', '.rdf', '.rdfxml'] }, description: 'RDF/XML (OWL)' },
            { accept: { 'application/ld+json': ['.jsonld', '.json'] }, description: 'JSON-LD' },
          ],
          mode: 'readwrite',
        });
      const file = await handle.getFile();
      const ttl = await file.text();
      const pathHint = (file as File & { path?: string }).path ?? file.name;
      await loadTtlAndRender(ttl, file.name, handle, pathHint);
      
      // Try to load display config from sibling .display.json file
      const localDisplayConfig = await loadDisplayConfigFromLocalFile(handle, file.name);
      if (localDisplayConfig) {
        loadedEdgeStyleConfig = localDisplayConfig.edgeStyleConfig || null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            applyDisplayConfig(localDisplayConfig);
            applyFilter();
            if (network && localDisplayConfig.viewState) {
              network.moveTo({
                scale: localDisplayConfig.viewState.scale,
                position: localDisplayConfig.viewState.position,
                animation: false,
              });
            }
            saveDisplayConfigToIndexedDB(localDisplayConfig, pathHint, file.name).catch(() => {});
          });
        });
      }
      
      hideLoadingModal();
      hideOpenOntologyModal();
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
 * Attempt to load display config from a URL.
 * Returns the config if found, null otherwise (doesn't throw on 404).
 */
async function loadDisplayConfigFromUrl(displayUrl: string): Promise<DisplayConfig | null> {
  try {
    const response = await fetch(displayUrl);
    if (!response.ok) {
      // 404 or other error - display file doesn't exist, which is fine
      // Show a helpful warning message (not an error, since this is expected)
      // Note: The browser will also show a 404 error in the Network tab, but this warning
      // provides user-friendly context that this is expected behavior.
      if (response.status === 404) {
        // Use a single, clear warning message that's easy to spot
        console.warn(
          `[OntoCanvas] Display style file not found: ${displayUrl}`
        );
        console.warn(
          `We tried looking for an OntoCanvas display style file related to this ontology, but it could not be found. The ontology will load without custom styling.`
        );
      }
      return null;
    }
    const text = await response.text();
    const config = JSON.parse(text) as DisplayConfig;
    if (!config || typeof config !== 'object') {
      console.warn('Invalid display config format from URL:', displayUrl);
      return null;
    }
    // Validate version
    if (config.version !== DISPLAY_CONFIG_VERSION) {
      console.warn('Display config version mismatch:', displayUrl);
      return null;
    }
    return config;
  } catch (err) {
    // Network error or parse error - silently fail (display file is optional)
    // Only log in debug mode
    if (isDebugMode()) {
      debugWarn('Could not load display config from URL:', displayUrl, err);
    }
    return null;
  }
}

/**
 * Attempt to load display config from a sibling .display.json file in the same directory.
 * Returns the config if found, null otherwise (doesn't throw on errors).
 * Only works when File System Access API is available and fileHandle.getParent() is supported.
 */
async function loadDisplayConfigFromLocalFile(
  fileHandle: FileSystemFileHandle | null,
  fileName: string
): Promise<DisplayConfig | null> {
  if (!fileHandle) return null;
  
  // Check if getParent is available (Chrome/Edge support this)
  if (!('getParent' in fileHandle) || typeof (fileHandle as FileSystemFileHandle & { getParent?: () => Promise<FileSystemDirectoryHandle> }).getParent !== 'function') {
    return null;
  }

  try {
    // Get the parent directory
    const parent = await (fileHandle as FileSystemFileHandle & { getParent: () => Promise<FileSystemDirectoryHandle> }).getParent();
    
    // Extract base name from fileName (remove extension)
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
    const displayFileName = `${baseName}.display.json`;
    
    // Try to get the display config file
    try {
      const displayFileHandle = await parent.getFileHandle(displayFileName);
      const displayFile = await displayFileHandle.getFile();
      const text = await displayFile.text();
      const config = JSON.parse(text) as DisplayConfig;
      
      if (!config || typeof config !== 'object') {
        console.warn('Invalid display config format from local file:', displayFileName);
        return null;
      }
      
      // Validate version
      if (config.version !== DISPLAY_CONFIG_VERSION) {
        console.warn('Display config version mismatch:', displayFileName);
        return null;
      }
      
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog('[DISPLAY CONFIG] Loaded display config from local file:', displayFileName);
      }
      return config;
    } catch (fileErr) {
      // File doesn't exist or can't be read - this is fine, display config is optional
      if (isDebugMode()) {
        debugWarn('Could not load display config from local file:', displayFileName, fileErr);
      }
      return null;
    }
  } catch (err) {
    // Parent directory access failed - silently fail (display file is optional)
    if (isDebugMode()) {
      debugWarn('Could not access parent directory for display config:', err);
    }
    return null;
  }
}

/**
 * Load ontology from a URL.
 * On failure (CORS or other), shows a modal instead of the in-editor error bar.
 */
async function loadFromUrl(url: string): Promise<void> {
  showLoadingModal();
  try {
    const ttl = await fetchOntologyFromUrl(url);

    // Use URL path as filename for display; format is detected from URL for parsing
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1] || 'ontology.ttl';

    saveLastUrlToIndexedDB(url, fileName).catch(() => {});

    const { getAllDisplayFileUrls } = await import('./utils/urlParams');
    const displayUrls = getAllDisplayFileUrls(url);
    let urlDisplayConfig: DisplayConfig | null = null;
    
    // Try all possible display file URLs (primary first, then alternatives)
    for (const displayUrl of displayUrls) {
      urlDisplayConfig = await loadDisplayConfigFromUrl(displayUrl);
      if (urlDisplayConfig) {
        break; // Found it, stop trying alternatives
      }
    }

    await loadTtlAndRender(ttl, fileName, null, url);

    if (urlDisplayConfig) {
      loadedEdgeStyleConfig = urlDisplayConfig.edgeStyleConfig || null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyDisplayConfig(urlDisplayConfig!);
          applyFilter();
          if (network && urlDisplayConfig!.viewState) {
            network.moveTo({
              scale: urlDisplayConfig!.viewState.scale,
              position: urlDisplayConfig!.viewState.position,
              animation: false,
            });
          }
          saveDisplayConfigToIndexedDB(urlDisplayConfig!, url, fileName).catch(() => {});
        });
      });
    }

    hideLoadingModal();
  } catch (err) {
    hideLoadingModal();
    console.error('Failed to load ontology from URL:', err);
    handleUrlLoadFailure(url, err, { onOpenFile: loadFromFile });
  }
}

/**
 * Load the last opened file.
 */
async function loadLastOpenedFile(): Promise<void> {
    hideOpenOntologyModal();
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
      
      // Try to load display config from sibling .display.json file
      const localDisplayConfig = await loadDisplayConfigFromLocalFile(stored.handle, file.name);
      if (localDisplayConfig) {
        loadedEdgeStyleConfig = localDisplayConfig.edgeStyleConfig || null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            applyDisplayConfig(localDisplayConfig);
            applyFilter();
            if (network && localDisplayConfig.viewState) {
              network.moveTo({
                scale: localDisplayConfig.viewState.scale,
                position: localDisplayConfig.viewState.position,
                animation: false,
              });
            }
            saveDisplayConfigToIndexedDB(localDisplayConfig, pathHint, file.name).catch(() => {});
          });
        });
      }
      
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
  hideOpenOntologyModal();
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
      hideOpenOntologyModal();
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
      // Refresh all UI elements that display prefixes
      if (ttlStore) {
        const edgeStylesContent = document.getElementById('edgeStylesContent');
        if (edgeStylesContent) {
          initEdgeStylesMenu(edgeStylesContent, () => applyFilter(true));
        }
        const dataPropsContent = document.getElementById('dataPropsContent');
        if (dataPropsContent) {
          initDataPropsMenu(dataPropsContent);
        }
        const annotationPropsContent = document.getElementById('annotationPropsContent');
        if (annotationPropsContent) {
          initAnnotationPropsMenu(annotationPropsContent);
        }
        // Rebuild the graph to update class node labels
        applyFilter(true);
      }
    },
    onSave: () => {
      // Additional save logic if needed
    },
  };
  
  document.getElementById('manageExternalRefs')?.addEventListener('click', () => {
    showExternalRefsModal(externalOntologyReferences, externalRefsCallbacks, loadedFilePath, loadedFileName);
    const displayEl = document.getElementById('displayExternalRefs') as HTMLInputElement | null;
    const layoutEl = document.getElementById('externalNodeLayout') as HTMLSelectElement | null;
    if (displayEl) displayEl.checked = displayExternalReferences;
    if (layoutEl) layoutEl.value = externalNodeLayout;
  });
  document.getElementById('displayExternalRefs')?.addEventListener('change', (e) => {
    displayExternalReferences = (e.target as HTMLInputElement).checked;
    applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('externalNodeLayout')?.addEventListener('change', (e) => {
    externalNodeLayout = (e.target as HTMLSelectElement).value as ExternalNodeLayout;
    applyFilter(true);
    scheduleDisplayConfigSave();
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
      sortExternalRefsByUrl(externalOntologyReferences);

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
  document.getElementById('dataPropertyFontSize')?.addEventListener('input', () => applyFilter());
  document.getElementById('dataPropertyFontSize')?.addEventListener('change', () => applyFilter());
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
  document.getElementById('resetView')?.addEventListener('click', () => {
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'hierarchical03';
    (document.getElementById('wrapChars') as HTMLInputElement).value = '12';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = '70';
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
      console.log('[DISPLAY CONFIG] Loading display config from file:', file.name);
      const text = await file.text();
      const config = JSON.parse(text) as DisplayConfig;
      if (!config || typeof config !== 'object') throw new Error('Invalid config format');
      console.log('[DISPLAY CONFIG] Parsed config version:', config.version);
      console.log('[DISPLAY CONFIG] Config has edgeStyleConfig:', !!config.edgeStyleConfig);
      
      // Apply the display config (this will store edgeStyleConfig in loadedEdgeStyleConfig)
      applyDisplayConfig(config);
      
      // Force a re-render to apply the styles
      applyFilter();
      
      // Apply view state after a short delay to ensure network is ready
      if (network && config.viewState) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            network?.moveTo({
              scale: config.viewState!.scale,
              position: config.viewState!.position,
              animation: false,
            });
          });
        });
      }
      
      // Save the upgraded config back to IndexedDB
      const upgradedConfig = collectDisplayConfig();
      if (upgradedConfig) {
        saveDisplayConfigToIndexedDB(upgradedConfig, loadedFilePath, loadedFileName).catch(() => {});
      }
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
    
    // Reset all display settings to defaults
    (document.getElementById('wrapChars') as HTMLInputElement).value = '12';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = '70';
    (document.getElementById('relationshipFontSize') as HTMLInputElement).value = '18';
    (document.getElementById('dataPropertyFontSize') as HTMLInputElement).value = '12';
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'hierarchical03';
    (document.getElementById('searchQuery') as HTMLInputElement).value = '';
    (document.getElementById('searchIncludeNeighbors') as HTMLInputElement).checked = true;
    
    // Clear loaded edge style config (so it doesn't override DOM checkboxes)
    loadedEdgeStyleConfig = null;
    
    // Reset Object Property display settings to defaults
    // Reinitialize the edge styles menu which will reset all checkboxes to default values
    const edgeStylesContent = document.getElementById('edgeStylesContent');
    if (edgeStylesContent) {
      initEdgeStylesMenu(edgeStylesContent, applyFilter);
      updateEdgeColorsLegend(rawData, objectProperties, externalOntologyReferences);
    }
    
    // Delete display config from IndexedDB
    await deleteDisplayConfigFromIndexedDB(loadedFilePath, loadedFileName).catch(() => {});
    
    // Reset lastLayoutMode to prevent position clearing on first applyFilter
    lastLayoutMode = 'hierarchical03';
    
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
  const renameModalEl = document.getElementById('renameModal');
  if (renameModalEl) initRenameModalHeaderIcons(renameModalEl);

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
  
  document.getElementById('addNodeCancel')?.addEventListener('click', hideAddNodeModalWithCleanup);
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
    if ((e.target as HTMLElement).id === 'addNodeModal') hideAddNodeModalWithCleanup();
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
        debugLog(`[DELETE KEY] Delete/Backspace key pressed. Active element:`, activeEl?.id || activeEl?.tagName);
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
  const searchClearBtn = document.getElementById('searchClearBtn');
  if (searchInput && searchList) {
    let debounceTimer: number;
    let animationId: number | null = null;
    
    // Function to clear the search bar
    const clearSearch = () => {
      (searchInput as HTMLInputElement).value = '';
      updateSearchBarStyle();
      applyFilter();
      searchInput.focus();
    };
    
    // Add click handler for clear button
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearSearch();
      });
    }
    
    // Function to update search bar styling based on content
    const updateSearchBarStyle = () => {
      const hasText = (searchInput as HTMLInputElement).value.trim().length > 0;
      const inputEl = searchInput as HTMLElement;
      
      // Show/hide clear button
      if (searchClearBtn) {
        searchClearBtn.style.display = hasText ? 'block' : 'none';
      }
      
      if (hasText) {
        // Add more visible colored outline when search bar has text
        inputEl.style.outline = '3px solid #3498db';
        inputEl.style.outlineOffset = '2px';
        inputEl.style.borderRadius = '4px';
        // Add light yellow background to indicate active filtering
        inputEl.style.backgroundColor = '#fffacd'; // Light yellow (lemon chiffon)
        
        // Add pulsating animation - more visible with wider opacity range
        if (animationId === null) {
          let startTime: number | null = null;
          const animate = (timestamp: number) => {
            if (startTime === null) startTime = timestamp;
            const elapsed = timestamp - startTime;
            // Pulsate between 0.3 and 1.0 opacity, 1.5 second cycle (faster and more pronounced)
            const opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((elapsed / 1500) * 2 * Math.PI));
            inputEl.style.outlineColor = `rgba(52, 152, 219, ${opacity})`;
            // Also pulsate the outline width slightly for more visibility
            const widthMultiplier = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin((elapsed / 1500) * 2 * Math.PI));
            inputEl.style.outlineWidth = `${3 * widthMultiplier}px`;
            animationId = requestAnimationFrame(animate);
          };
          animationId = requestAnimationFrame(animate);
        }
      } else {
        // Remove outline, animation, and background when empty
        inputEl.style.outline = '';
        inputEl.style.outlineOffset = '';
        inputEl.style.backgroundColor = '';
        if (animationId !== null) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }
    };
    
    searchInput.addEventListener('input', () => {
      updateSearchBarStyle();
      applyFilter();
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(updateSearchAutocomplete, 150);
    });
    searchInput.addEventListener('focus', () => {
      updateSearchBarStyle();
      if ((searchInput as HTMLInputElement).value.trim()) updateSearchAutocomplete();
    });
    searchInput.addEventListener('blur', () => {
      // Keep outline and animation on blur if there's text
      const hasText = (searchInput as HTMLInputElement).value.trim().length > 0;
      if (hasText) {
        updateSearchBarStyle();
      }
    });
    
    // Initial check
    updateSearchBarStyle();
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
  const loadedFromParam = await handleUrlParameterLoad(
    loadFromUrl,
    async (content: string, fileName: string, pathHint: string) => {
      await loadTtlAndRender(content, fileName, null, pathHint);
    },
    showOpenOntologyModal,
    hideOpenOntologyModal
  );
  if (!loadedFromParam) {
    // No URL parameter found, show modal as usual
    showOpenOntologyModal();
  }
}, 100);

// Internal log collection for testing
const testLogs: string[] = [];
const MAX_TEST_LOGS = 1000;

function addTestLog(message: string): void {
  testLogs.push(`[${new Date().toISOString()}] ${message}`);
  if (testLogs.length > MAX_TEST_LOGS) {
    testLogs.shift(); // Remove oldest log
  }
  // Don't log to console here - let the console override handle it based on debug mode
}

/**
 * Safely stringify a value, handling circular structures and other edge cases.
 * Falls back to String() if JSON.stringify fails.
 */
function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    // Handle circular structures, DOM elements, vis-network objects, etc.
    try {
      return String(value);
    } catch {
      return '[Unable to stringify]';
    }
  }
}

/**
 * Check if a message string contains any test log tags.
 */
function hasTestLogTag(message: string): boolean {
  return message.includes('[DELETE]') || 
         message.includes('[GET EDGE DATA]') || 
         message.includes('[DELETE KEY]') || 
         message.includes('[DEBUG]') || 
         message.includes('[TEST]');
}

/**
 * Build message string from args only when needed (lazy evaluation).
 * This avoids overhead when debug mode is off and no tags are present.
 * First checks all string arguments for tags before doing expensive stringification.
 */
function buildMessageIfNeeded(args: unknown[]): string | null {
  // Quick check: scan all string args first (cheap operation)
  for (const arg of args) {
    if (typeof arg === 'string' && hasTestLogTag(arg)) {
      // Found a tag in a string arg, build full message
      return args.map(safeStringify).join(' ');
    }
  }
  
  // No tags found in string args, but might be in stringified non-string args
  // Only do expensive stringification if we have non-string args
  if (args.some(arg => typeof arg !== 'string')) {
    const message = args.map(safeStringify).join(' ');
    if (hasTestLogTag(message)) {
      return message;
    }
  }
  
  return null;
}

// Override console methods to capture test logs (always) but only log to console if debug mode is enabled
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
console.log = (...args: unknown[]) => {
  // Only build message string if we might need it (lazy evaluation)
  const message = buildMessageIfNeeded(args);
  // Always capture test logs for E2E testing
  if (message) {
    addTestLog(message);
  }
  // Only log to console if debug mode is enabled (for production performance)
  if (isDebugMode() || message) {
    originalConsoleLog.apply(console, args);
  }
};

console.error = (...args: unknown[]) => {
  // Only build message string if we might need it (lazy evaluation)
  const message = buildMessageIfNeeded(args);
  // Always capture test logs for E2E testing
  if (message) {
    addTestLog(message);
  }
  // Always log errors to console (even without debug mode)
  originalConsoleError.apply(console, args);
};

console.warn = (...args: unknown[]) => {
  // Only build message string if we might need it (lazy evaluation)
  const message = buildMessageIfNeeded(args);
  // Always capture test logs for E2E testing
  if (message) {
    addTestLog(message);
  }
  // Always log warnings to console (warnings are important user feedback)
  // This includes the display.json 404 warning which should always be visible
  originalConsoleWarn.apply(console, args);
};

// E2E test hook: attach programmatic control for browser automation (e.g. Playwright).
attachEditorTestHook({
  hideOpenOntologyModal,
  getRawData: () => rawData,
  getNetwork: () => network,
  showContextMenu,
  performDeleteSelection,
  performUndo,
  performRedo,
  getUndoStack: () => undoStack,
  getRelationshipLabel,
  getObjectProperties: () => objectProperties,
  getExternalOntologyReferences: () => externalOntologyReferences,
  openEditModalForNode,
  openEditModalForEdge,
  showEditEdgeModal,
  showAddEdgeModal,
  showAddNodeModal,
  showEditDataPropertyModal,
  getDataProperties: () => dataProperties,
  getAnnotationProperties: () => annotationProperties,
  getTtlStore: () => ttlStore,
  storeToTurtle,
  applyFilter,
  showEditRelationshipTypeModal,
  debugLog,
  addTestLog,
  getTestLogs: () => testLogs,
  isDebugMode,
  saveTtl,
  setHasUnsavedChanges: (value: boolean) => { hasUnsavedChanges = value; },
  updateSaveButtonVisibility,
});
