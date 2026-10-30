/**
 * Redraws the graph after a change or a filter: rebuilds the data, lays it out and wires the canvas.
 * Moved out of main.ts (#175).
 */
import { getLayoutAlgorithm } from '../graph';
import { getAsyncLayoutAlgorithm } from '../layouts';
import { removeEdgeFromStore, addEdgeToStore } from '../ontology/editEdges';
import { canvasState, session, editState, fileState } from '../state/appState';
import type { GraphData } from '../types';
import { showAddEdgeModal } from '../ui/addEdgeModal';
import { showAddNodeModal } from '../ui/addNodeModal';
import { getAnnotationStyleConfig } from '../ui/annotationPropertiesMenu';
import { updateContextMenuData, initContextMenu } from '../ui/contextMenu';
import { getEdgeStyleConfig, updateEdgeColorsLegend } from '../ui/edgeStyleUtils';
import { showEditEdgeModal, openEditModalForNode, openEditModalForEdge } from '../ui/editModals';
import { getNetworkOptions } from '../ui/networkConfig';
import { showMultiEditModal } from '../ui/nodeModalHelpers';
import { getSearchScope } from '../ui/searchOptions';
import { updateSelectionInfoDisplay } from '../ui/selectionInfo';
import { updateNodeEdgeCounts } from '../ui/statusBar';
import { beginViewSettle, viewSettled } from '../ui/viewSettle';
import { isDebugMode, debugLog } from '../utils/debug';
import { parseEdgeId } from '../utils/edgeId';
import { isEmbedded, getShouldShowTopMenu } from '../utils/embedMode';
import { scheduleDisplayConfigSave, flushDisplayConfigSave } from '../workflows/displayConfigSave';
import { forgetNodePositions } from '../workflows/nodePositions';
import { openExternalOntology } from '../workflows/openExternalTab';
import { pushUndoable } from '../workflows/undoRedo';
import { buildNetworkData } from './buildNetworkData';
import { addIndividualsToNetworkData, classNodesByUri } from './individualsOverlay';
import { isIndividualNodeId } from '../abox/individualsLayer';
import { setupDragCoupling } from './dataPropertyDragCoupling';
import { expandWithExternalRefs } from './externalExpansion';
import { setupNetworkSelectionAndNavigation } from './networkSelection';
import { persistNodePositionsFromNetwork } from './persistNodePositions';
import { withThingNode } from './thingNode';
import { Network } from 'vis-network/esnext';

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
  if (session.individualsLayer) addIndividualsToNetworkData(data, session.individualsLayer, classNodesByUri(graphDataForBuild.nodes), { relax: canvasState.relaxIndividuals });
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
        if (isIndividualNodeId(clickedNodeId)) return;
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
