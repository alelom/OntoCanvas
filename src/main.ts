import { Network } from 'vis-network/esnext';
import 'vis-network/styles/vis-network.css';
import {
  addEdgeToStore,
  removeEdgeFromStore,
  storeToTurtle,
} from './parser';
import type { GraphData } from './types';
import { withThingNode } from './graph/thingNode';

/** Overlay renderer for anonymous class expressions (union domains etc.). See issue #59. */
import { expandWithExternalRefs } from './graph/externalExpansion';
import { session, fileState, canvasState, editState } from './state/appState';
import { installTestLogCapture } from './e2e/testLogCapture';
import { renderApp } from './ui/appShell';

import { parseEdgeId } from './utils/edgeId';
import {
  getLayoutAlgorithm,
} from './graph';

import { getAsyncLayoutAlgorithm } from './layouts';
import { getSearchScope } from './ui/searchOptions';
import { setupDragCoupling } from './graph/dataPropertyDragCoupling';
import { persistNodePositionsFromNetwork } from './graph/persistNodePositions';
import { isDebugMode, debugLog } from './utils/debug';
import {
  updateNodeEdgeCounts,
} from './ui/statusBar';
import {
  initContextMenu,
  showContextMenu,
  updateContextMenuData,
  setTermUriResolver,
  setVersionPinnedUriResolver,
} from './ui/contextMenu';
import { versionPinnedUri } from './lib/versionPinnedUri';
import { readOntologyVersion, bareIri } from './lib/ontologyVersion';

import { attachEditorTestHook } from './e2e/editorTestHook';
import {
  showOpenOntologyModal,
  hideOpenOntologyModal,
} from './ui/openOntologyModal';
import { openOnStartup } from './ui/startupOpen';
import { beginViewSettle, viewSettled } from './ui/viewSettle';
import { handleUrlParameterLoad } from './lib/urlParamLoader';

import {
  setImportVersionLookup,
} from './ui/externalRefs';
import { getShouldShowTopMenu, isEmbedded } from './utils/embedMode';
import {
  getRelationshipLabel,
} from './ui/relationshipUtils';
import {
  getEdgeStyleConfig,
  updateEdgeColorsLegend,
} from './ui/edgeStyleUtils';
import { getNetworkOptions } from './ui/networkConfig';

import {
  getAnnotationStyleConfig,
} from './ui/annotationPropertiesMenu';


import './style.css';


import { updateSaveButtonVisibility, updateSerializerDropdown } from './ui/fileBar';

import { showMultiEditModal } from './ui/nodeModalHelpers';
import { flushDisplayConfigSave, scheduleDisplayConfigSave } from './workflows/displayConfigSave';
import { forgetNodePositions } from './workflows/nodePositions';
import { registerActions } from './state/actions';
import { performRedo, performUndo, pushUndoable } from './workflows/undoRedo';
import { openExternalOntology } from './workflows/openExternalTab';
import { saveTtl } from './workflows/saveTtlFlow';



import { showAddNodeModal } from './ui/addNodeModal';
import { showAddEdgeModal } from './ui/addEdgeModal';
import { resolveTerm, updateSelectionInfoDisplay } from './ui/selectionInfo';
import { showEditRelationshipTypeModal } from './ui/relationshipTypeModal';
import { performDeleteSelection } from './workflows/deleteSelection';
import { loadFromUrl, loadTtlAndRender } from './workflows/loadOntologyFlow';
import { setupEventListeners } from './ui/eventListeners';
import { deleteDataPropertyWithConfirm, initDataPropsMenu, showEditDataPropertyModal } from './ui/dataPropertyModals';
import { openEditModalForEdge, openEditModalForNode, showEditEdgeModal } from './ui/editModals';
import { setupNetworkSelectionAndNavigation } from './graph/networkSelection';
import { buildNetworkData } from './graph/buildNetworkData';
// Removed updateLoadLastOpenedButton - now handled by openOntologyModal



// Relationship utility functions moved to ui/relationshipUtils.ts








setTermUriResolver((kind, id) => resolveTerm(kind, id)?.uri ?? null);
setVersionPinnedUriResolver((kind, id) =>
  versionPinnedUri(resolveTerm(kind, id)?.uri ?? null, session.ttlStore ? readOntologyVersion(session.ttlStore) : null)
);


// hideRenameModal moved to ui/modals.ts



// Relationship utility functions moved to ui/relationshipUtils.ts


// getCardinalityFromEditModal moved to ui/modals.ts



/** What the imports dialog shows of an import's version (#131); null for a reference that is not an import. */
setImportVersionLookup((url) => {
  if (!session.ttlStore) return null;
  const isImport = session.ttlStore.getQuads(null, 'http://www.w3.org/2002/07/owl#imports', null, null).some((q) => bareIri(q.object.value) === bareIri(url));
  if (!isImport) return null;
  const imported = session.importedOntologies.find((o) => bareIri(o.url) === bareIri(url));
  if (imported) return { state: 'read', version: readOntologyVersion(imported.store), newer: session.importNewerVersions.get(imported.url) };
  return session.importsBeingRead ? { state: 'reading' } : { state: 'unread' };
});



export function applyFilter(preserveView = false): void {
  // Don't return early - we need to initialize the network even with no nodes
  // so that Add node/Add edge buttons and double-click work

  let savedScale: number | null = null;
  let savedPosition: { x: number; y: number } | null = null;
  if (preserveView && canvasState.network) {
    savedScale = canvasState.network.getScale();
    savedPosition = canvasState.network.getViewPosition();
  }

  const layoutMode = (document.getElementById('layoutMode') as HTMLSelectElement)
    .value;
  
  // Clear stored node positions ONLY when switching to a different layout mode
  // This ensures the new layout algorithm's positions are used, but preserves
  // positions when just applying filters or reloading
  const layoutModeChanged = canvasState.lastLayoutMode !== null && canvasState.lastLayoutMode !== layoutMode;
  if (layoutModeChanged) {
    const layoutAlgorithm = getLayoutAlgorithm(layoutMode) ?? getAsyncLayoutAlgorithm(layoutMode);
    if (layoutAlgorithm || layoutMode === 'force') {
      // Switching to a layout that computes positions - clear stored positions
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog(`[DISPLAY CONFIG] Layout mode changed from ${canvasState.lastLayoutMode} to ${layoutMode}, clearing node positions`);
      }
      forgetNodePositions();
    }
  }
  canvasState.lastLayoutMode = layoutMode;
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
  const exactMatchEl = document.getElementById(
    'searchExactMatch'
  ) as HTMLInputElement;
  const edgeStylesContent = document.getElementById('edgeStylesContent')!;

  const annotationPropsContent = document.getElementById('annotationPropsContent');
  // Get edge style config from DOM (user's current checkbox states)
  const domEdgeStyleConfig = getEdgeStyleConfig(edgeStylesContent, session.rawData, session.objectProperties, session.externalOntologyReferences);
  
  // Merge with loaded edge style config (from display config file) if present
  // DOM checkboxes take precedence over loaded config (user interaction overrides saved state)
  // Loaded config is used as fallback for edge types not yet in the DOM
  const mergedEdgeStyleConfig = canvasState.loadedEdgeStyleConfig ? { ...canvasState.loadedEdgeStyleConfig } : {};
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
    searchScope: getSearchScope(),
    exactMatch: exactMatchEl?.checked ?? true,
    edgeStyleConfig: mergedEdgeStyleConfig,
    annotationStyleConfig: getAnnotationStyleConfig(annotationPropsContent, session.annotationProperties),
    layoutMode,
  };

  let graphDataForBuild: GraphData = session.rawData;
  if (canvasState.displayExternalReferences && session.ttlStore && session.externalOntologyReferences.length > 0) {
    graphDataForBuild = expandWithExternalRefs(session.rawData, session.ttlStore, session.externalOntologyReferences, {
      displayExternalReferences: canvasState.displayExternalReferences,
      externalNodeLayout: canvasState.externalNodeLayout,
      nodePositions: canvasState.loadedNodePositions ?? undefined,
    });
    
    // CRITICAL FIX: Deduplicate edges after expansion to prevent duplicates during undo
    // This catches any edges that expandWithExternalRefs might have created that already exist
    // Build a comprehensive deduplication map that handles all format variations
    const seenEdges = new Map<string, boolean>();
    graphDataForBuild.edges = graphDataForBuild.edges.filter((edge) => {
      // Build all possible keys for this edge (accounting for URI/local name variations)
      const keys = new Set<string>();
      keys.add(`${edge.from}||${edge.to}||${edge.type}`);
      
      // Add variations with op.uri and op.name
      const op = session.objectProperties.find((p) => p.name === edge.type || p.uri === edge.type);
      if (op) {
        if (op.name) keys.add(`${edge.from}||${edge.to}||${op.name}`);
        if (op.uri) keys.add(`${edge.from}||${edge.to}||${op.uri}`);
      }
      
      // Check if any of these keys have been seen
      for (const key of keys) {
        if (seenEdges.has(key)) {
          return false; // Skip duplicate
        }
      }
      
      // Mark all keys as seen
      for (const key of keys) {
        seenEdges.set(key, true);
      }
      
      return true;
    });
  }
  for (const n of session.userAddedExternalNodes) {
    if (!graphDataForBuild.nodes.some((nn) => nn.id === n.id)) {
      graphDataForBuild.nodes.push({ ...n });
    }
  }
  graphDataForBuild = withThingNode(graphDataForBuild, session.dataProperties, canvasState.clusterThingDataProperties);
  session.currentGraphDataForBuild = graphDataForBuild;
  const data = buildNetworkData(currentFilter, graphDataForBuild);
  if (canvasState.network && session.ttlStore) {
    updateContextMenuData(session.ttlStore, graphDataForBuild, session.externalOntologyReferences, openExternalOntology);
  }
  const options = getNetworkOptions(layoutMode, { embedded: isEmbedded() });

  scheduleDisplayConfigSave();

  const manipulationOptions = {
    enabled: true,
    initiallyActive: true,
    addNode: (
      nodeData: { x?: number; y?: number },
      callback: (data: { id: string; label: string; x?: number; y?: number } | null) => void
    ) => {
      if (editState.addNodeModalShowing) {
        callback(null);
        return;
      }
      // Get coordinates from nodeData, or use network view position if not provided
      let x = nodeData.x ?? 0;
      let y = nodeData.y ?? 0;
      // If coordinates are 0 or not provided, use the center of the view
      if ((x === 0 && y === 0) || (x === undefined && y === undefined)) {
        if (canvasState.network) {
          const viewPos = canvasState.network.getViewPosition();
          x = viewPos.x;
          y = viewPos.y;
        }
      }
      showAddNodeModal(x, y);
      editState.addNodeMode = false; // Reset after showing modal
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
        if (!parsed || !session.ttlStore) {
          callback(null);
          return;
        }
        const { from, to, type } = parsed;

        // Debug: Log edge click
        debugLog('[DEBUG] Edge clicked for editing:', { edgeId, from, to, type });
        
        // Debug: Check what edges exist in rawData for this match
        const matchingEdges = session.rawData.edges.filter((e) => e.from === from && e.to === to && e.type === type);
        debugLog('[DEBUG] All matching edges in rawData:', {
          from,
          to,
          type,
          matchingEdges,
          allEdgesWithType: session.rawData.edges.filter((e) => e.type === type).slice(0, 5),
        });
        
        editState.pendingEditEdgeCallback = callback;
        showEditEdgeModal(from, to, type);
      },
    },
    deleteNode: false,
    deleteEdge: false,
  };

  // In embed mode, disable manipulation UI entirely (no X, Edit, Add Node/Edge). Covers both a real
  // iframe (top menu hidden) and the ?embed flag.
  const manipulationToUse = getShouldShowTopMenu() && !isEmbedded()
    ? manipulationOptions
    : { enabled: false as const };

  const networkContainer = document.getElementById('network')!;
  
  // Update status bar with node/edge counts
  updateNodeEdgeCounts(data.nodes.length, data.edges.length);
  // Legend must use displayed edges (graphDataForBuild) so domain/range edges from expandWithExternalRefs appear
  updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences, graphDataForBuild.edges);

  // The view keeps moving until this render's fit (or restored position) is applied (#93).
  const settleToken = beginViewSettle();
  if (canvasState.network) {
    canvasState.network.setData(data);
    canvasState.network.setOptions({
      ...options,
      manipulation: manipulationToUse,
      width: '100%',
      height: '100%',
    });
    const w = networkContainer.clientWidth;
    const h = networkContainer.clientHeight;
    if (w > 0 && h > 0) canvasState.network.setSize(`${w}px`, `${h}px`);
    if (preserveView && savedScale !== null && savedPosition !== null) {
      requestAnimationFrame(() => {
        canvasState.network?.moveTo({
          position: savedPosition!,
          scale: savedScale!,
          animation: false,
        });
        viewSettled(settleToken);
      });
    } else if (layoutMode === 'force') {
      canvasState.network.once('stabilizationIterationsDone', () => {
        canvasState.network!.fit();
        viewSettled(settleToken);
      });
    } else {
      // Computed (physics-disabled) layouts: fit once positions are applied.
      setTimeout(() => {
        canvasState.network!.fit();
        viewSettled(settleToken);
      }, 100);
    }
  } else {
    const opts = {
      ...options,
      manipulation: manipulationToUse,
      width: '100%',
      height: '100%',
    };
    canvasState.network = new Network(networkContainer, data, opts);
    if (layoutMode === 'force') {
      canvasState.network.once('stabilizationIterationsDone', () => {
        canvasState.network!.fit();
        viewSettled(settleToken);
      });
    } else {
      // Computed (physics-disabled) layouts: fit once positions are applied.
      setTimeout(() => {
        canvasState.network!.fit();
        viewSettled(settleToken);
      }, 100);
    }
    // Resize network when container size changes (e.g. flex layout settling)
    const resizeNetwork = () => {
      if (canvasState.network && networkContainer) {
        const w = networkContainer.clientWidth;
        const h = networkContainer.clientHeight;
        if (w > 0 && h > 0) {
          canvasState.network.setSize(`${w}px`, `${h}px`);
          canvasState.network.redraw();
        }
      }
    };
    const ro = new ResizeObserver(resizeNetwork);
    ro.observe(networkContainer);
    resizeNetwork(); // Initial size
    setupNetworkSelectionAndNavigation(canvasState.network, networkContainer);
    
    // Initialize context menu
    if (session.ttlStore) {
      initContextMenu(
        canvasState.network,
        networkContainer,
        session.ttlStore,
        session.rawData,
        (addedEdges, _failedEdges) => {
          // On paste callback - add to undo stack
          if (addedEdges.length > 0) {
            pushUndoable(
              () => {
                // Undo: remove pasted edges
                addedEdges.forEach((edge) => {
                  try {
                    removeEdgeFromStore(session.ttlStore!, edge.from, edge.to, edge.type);
                  } catch (err) {
                    console.warn(`Undo: Failed to remove pasted edge from store: ${err instanceof Error ? err.message : String(err)}`);
                  }
                  const idx = session.rawData.edges.findIndex(
                    (e) => e.from === edge.from && e.to === edge.to && e.type === edge.type
                  );
                  if (idx >= 0) session.rawData.edges.splice(idx, 1);
                });
                applyFilter(true);
              },
              () => {
                // Redo: re-add pasted edges
                addedEdges.forEach((edge) => {
                  const card = session.rawData.edges.find(
                    (e) => e.from === edge.from && e.to === edge.to && e.type === edge.type
                  );
                  const cardinality = card
                    ? {
                        minCardinality: card.minCardinality ?? null,
                        maxCardinality: card.maxCardinality ?? null,
                      }
                    : undefined;
                  addEdgeToStore(session.ttlStore!, edge.from, edge.to, edge.type, cardinality);
                  if (!card) {
                    session.rawData.edges.push({
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
            fileState.hasUnsavedChanges = true;
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
          if (canvasState.network) updateSelectionInfoDisplay(canvasState.network);
        }
      );
      
      // Update context menu data after initialization (use graphDataForBuild so external nodes are included)
      updateContextMenuData(session.ttlStore, graphDataForBuild, session.externalOntologyReferences, openExternalOntology);
    }
    
    canvasState.network.on('click', () => {
      if (canvasState.network) updateSelectionInfoDisplay(canvasState.network);
    });
    // Dragging a node arranges the graph: from then on the browser keeps its positions between visits.
    canvasState.network.on('dragEnd', (params?: { nodes?: unknown[] }) => {
      if (params?.nodes?.length) canvasState.positionsArranged = true;
    });
    setupDragCoupling(canvasState.network as unknown as Parameters<typeof setupDragCoupling>[0], {
      onDragEnd: () => {
        if (!canvasState.network) return;
        persistNodePositionsFromNetwork(canvasState.network, session.rawData, scheduleDisplayConfigSave);
        flushDisplayConfigSave();
      },
    });
    canvasState.network.on('doubleClick', (params: { nodes: string[]; edges: string[] }) => {
      if (!canvasState.network) return;
      if (isEmbedded()) return; // read-only in embedded mode
      if (params.nodes.length > 0) {
        const clickedNodeId = params.nodes[0] as string;
        if (clickedNodeId.startsWith('http://') || clickedNodeId.startsWith('https://')) {
          return;
        }
        const selectedIds = canvasState.network.getSelectedNodes().map(String);
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

registerActions({ applyFilter, initDataPropsMenu, deleteDataPropertyWithConfirm });
renderApp();
const appEl = document.getElementById('app');
if (appEl && (!getShouldShowTopMenu() || isEmbedded())) {
  appEl.classList.add('embed-no-menu');
  document.body.classList.add('embed-no-menu');
}
// Embedded (iframe or ?embed): compact, read-only view. Hide the edges legend (CSS), show the
// "Open in a new tab" button. Editing is gated in the handlers via isEmbedded().
if (isEmbedded()) {
  document.body.classList.add('ontocanvas-embedded');
  const openBtn = document.getElementById('openInNewTab');
  if (openBtn) openBtn.style.display = '';
}
setupEventListeners();
// Update serializer dropdown after DOM is ready (in case it was rendered)
if (isDebugMode()) {
  setTimeout(() => updateSerializerDropdown(), 0);
}
// Load the ontology named by the URL parameter, otherwise show the "Open ontology" dialog — unless an
// ontology was loaded meanwhile, which the dialog would otherwise cover.
setTimeout(() => {
  void openOnStartup({
    loadFromUrlParameter: () =>
      handleUrlParameterLoad(
        loadFromUrl,
        async (content: string, fileName: string, pathHint: string) => {
          await loadTtlAndRender(content, fileName, null, pathHint);
        },
        showOpenOntologyModal,
        hideOpenOntologyModal
      ),
    hasOntology: () => session.ttlStore !== null,
    showOpenOntologyModal,
  });
}, 100);

// Capture tagged console output for the E2E tests (see src/e2e/testLogCapture.ts).
const { addTestLog, getTestLogs } = installTestLogCapture(isDebugMode);

// E2E test hook: attach programmatic control for browser automation (e.g. Playwright).
attachEditorTestHook({
  hideOpenOntologyModal,
  getRawData: () => session.rawData,
  getNetwork: () => canvasState.network,
  showContextMenu,
  performDeleteSelection,
  performUndo,
  performRedo,
  getUndoStack: () => editState.undoStack,
  getRelationshipLabel,
  getObjectProperties: () => session.objectProperties,
  getExternalOntologyReferences: () => session.externalOntologyReferences,
  openEditModalForNode,
  openEditModalForEdge,
  showEditEdgeModal,
  showAddEdgeModal,
  showAddNodeModal,
  showEditDataPropertyModal,
  getDataProperties: () => session.dataProperties,
  getAnnotationProperties: () => session.annotationProperties,
  getTtlStore: () => session.ttlStore,
  storeToTurtle,
  applyFilter,
  showEditRelationshipTypeModal,
  debugLog,
  addTestLog,
  getTestLogs,
  isDebugMode,
  saveTtl,
  setHasUnsavedChanges: (value: boolean) => { fileState.hasUnsavedChanges = value; },
  updateSaveButtonVisibility,
  getHasUnsavedChanges: () => fileState.hasUnsavedChanges,
  loadTtlDirectly: async (ttlString: string, fileName?: string, pathHint?: string) => {
    // For tests: call loadTtlAndRender directly, bypassing file input UI
    // Set loadedFilePath/loadedFileName so IndexedDB operations use the right keys
    // Enable test mode to skip slow operations (IndexedDB, rendering delays)
    fileState.loadedFilePath = pathHint ?? fileName ?? null;
    fileState.loadedFileName = fileName ?? null;
    fileState.skipSlowOperationsForTests = true;
    try {
      await loadTtlAndRender(ttlString, fileName, null, pathHint);
    } finally {
      fileState.skipSlowOperationsForTests = false;
    }
  },
});
