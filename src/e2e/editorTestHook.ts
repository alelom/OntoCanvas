/**
 * E2E test hook: programmatic control for browser automation (e.g. Playwright).
 * This file is the only place that defines and attaches __EDITOR_TEST__ to the window.
 * Implementation code (e.g. main.ts) must not contain E2E-specific logic; it only calls attachEditorTestHook with dependencies.
 */
import type { Network } from 'vis-network/esnext';
import type { Store } from 'n3';
import type { GraphData, GraphEdge, ObjectPropertyInfo, DataPropertyInfo } from '../types';
import type { ExternalOntologyReference } from '../storage';
import { parseEdgeId } from '../utils/edgeId';

/** Use getters for state that is set after app init (e.g. when a file is loaded) so the hook always sees current values. */
export interface EditorTestDeps {
  hideOpenOntologyModal: () => void;
  getRawData: () => GraphData;
  getNetwork: () => Network | null;
  showContextMenu: (event: MouseEvent, network: Network, container: HTMLElement, nodeId?: string | null, edgeId?: string | null) => void;
  performDeleteSelection: () => boolean;
  performUndo: () => void;
  performRedo: () => void;
  getUndoStack: () => unknown[];
  getRelationshipLabel: (type: string, objectProperties: ObjectPropertyInfo[], externalOntologyReferences: ExternalOntologyReference[]) => string;
  getObjectProperties: () => ObjectPropertyInfo[];
  getExternalOntologyReferences: () => ExternalOntologyReference[];
  openEditModalForNode: (nodeId: string) => void;
  openEditModalForEdge: (edgeId: string) => void;
  showEditEdgeModal: (from: string, to: string, type: string) => void;
  showAddEdgeModal: (from: string, to: string, callback: (data: { from: string; to: string; id?: string } | null) => void) => void;
  showAddNodeModal: (x: number, y: number) => void;
  showEditDataPropertyModal: (name: string) => void;
  getDataProperties: () => DataPropertyInfo[];
  getAnnotationProperties: () => Array<{ name: string; isBoolean: boolean; range: string | null | undefined; uri?: string; isDefinedBy?: string }>;
  getTtlStore: () => Store | null;
  storeToTurtle: (store: Store, externalOntologyReferences?: ExternalOntologyReference[], originalTtlString?: string) => Promise<string>;
  applyFilter: (preservePositions: boolean) => void;
  showEditRelationshipTypeModal: (type: string, edgeStylesContent: HTMLElement, onApply: () => void) => void;
  debugLog: (...args: unknown[]) => void;
  addTestLog: (message: string) => void;
  getTestLogs: () => string[];
  isDebugMode: () => boolean;
  saveTtl: () => Promise<void>;
  setHasUnsavedChanges: (value: boolean) => void;
  updateSaveButtonVisibility: () => void;
  getHasUnsavedChanges: () => boolean;
  loadTtlDirectly: (ttlString: string, fileName?: string, pathHint?: string) => Promise<void>;
}

/**
 * Attach the editor test hook to window.__EDITOR_TEST__. Call this once from the app entry (e.g. main.ts) after all deps are available.
 */
export function attachEditorTestHook(deps: EditorTestDeps): void {
  const {
    hideOpenOntologyModal,
    getRawData,
    getNetwork,
    showContextMenu,
    performDeleteSelection,
    performUndo,
    performRedo,
    getUndoStack,
    getRelationshipLabel,
    getObjectProperties,
    getExternalOntologyReferences,
    openEditModalForNode,
    openEditModalForEdge,
    showEditEdgeModal,
    showAddEdgeModal,
    showAddNodeModal,
    showEditDataPropertyModal,
    getDataProperties,
    getAnnotationProperties,
    getTtlStore,
    storeToTurtle,
    applyFilter,
    showEditRelationshipTypeModal,
    debugLog,
    addTestLog,
    getTestLogs,
    isDebugMode,
    saveTtl,
    setHasUnsavedChanges,
    updateSaveButtonVisibility,
    getHasUnsavedChanges,
    loadTtlDirectly,
  } = deps;

  (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ = {
    hideOpenOntologyModal: (): void => hideOpenOntologyModal(),
    selectNodeByLabel: (label: string): boolean => {
      const rawData = getRawData();
      const network = getNetwork();
      const node = rawData.nodes.find((n) => (n.label || n.id) === label);
      if (node && network) {
        network.setSelection({ nodes: [node.id] });
        return true;
      }
      return false;
    },
    selectNodeById: (nodeId: string): boolean => {
      const network = getNetwork();
      if (!network) return false;
      network.setSelection({ nodes: [nodeId] });
      return network.getSelectedNodes().includes(nodeId);
    },
    selectEdgeById: (edgeId: string): boolean => {
      const network = getNetwork();
      if (!network) return false;
      network.setSelection({ edges: [edgeId] });
      setTimeout(() => {
        const selected = network.getSelectedEdges();
        if (isDebugMode()) {
          debugLog(`[SELECT EDGE] Selection result for ${edgeId}:`, { selected, includes: selected.includes(edgeId) });
        }
      }, 50);
      const selected = network.getSelectedEdges();
      return selected.includes(edgeId);
    },
    getSelectedEdges: (): string[] => {
      const network = getNetwork();
      if (!network) return [];
      return network.getSelectedEdges().map(String);
    },
    getSelectedNodes: (): string[] => {
      const network = getNetwork();
      if (!network) return [];
      return network.getSelectedNodes().map(String);
    },
    openContextMenuForNode: (nodeId: string): void => {
      const container = document.getElementById('network');
      const network = getNetwork();
      if (!container || !network) return;
      const ev = {
        clientX: 100,
        clientY: 100,
        preventDefault: () => {},
        stopPropagation: () => {},
        stopImmediatePropagation: () => {},
      } as MouseEvent;
      showContextMenu(ev, network, container, nodeId, null);
    },
    getNetwork: (): Network | null => getNetwork(),
    performDelete: (): boolean => performDeleteSelection(),
    performUndo: (): void => performUndo(),
    performRedo: (): void => performRedo(),
    getNodeIds: (): string[] => getRawData().nodes.map((n) => n.id),
    getNodeCount: (): number => getRawData().nodes.length,
    getRawDataEdges: (): GraphEdge[] => getRawData().edges,
    getUndoStackLength: (): number => getUndoStack().length,
    getVisibleNodeCount: (): number =>
      parseInt(document.getElementById('nodeCount')?.textContent ?? '0', 10) || 0,
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
    findEdgeByLabels: (fromLabel: string, toLabel: string, typeLabel?: string): string | null => {
      const rawData = getRawData();
      const fromNode = rawData.nodes.find((n) => (n.label || n.id) === fromLabel);
      const toNode = rawData.nodes.find((n) => (n.label || n.id) === toLabel);
      if (!fromNode || !toNode) return null;
      const objectProperties = getObjectProperties();
      const externalOntologyReferences = getExternalOntologyReferences();
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
    getEdgeData: (edgeId: string): { from: string; to: string; type: string; isRestriction?: boolean; minCardinality?: number | null; maxCardinality?: number | null } | null => {
      const rawData = getRawData();
      const parsed = parseEdgeId(edgeId);
      if (!parsed) return null;
      const { from, to, type } = parsed;
      debugLog(`[GET EDGE DATA] Looking for edge: ${from} -> ${to} : ${type}`);
      debugLog(`[GET EDGE DATA] rawData.edges count: ${rawData.edges.length}`);
      debugLog('[GET EDGE DATA] rawData.edges:', rawData.edges.map((e) => `${e.from}->${e.to}:${e.type}`));
      const edge = rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
      if (!edge) {
        debugLog('[GET EDGE DATA] Edge NOT FOUND in rawData');
        return null;
      }
      debugLog('[GET EDGE DATA] Edge FOUND:', { from: edge.from, to: edge.to, type: edge.type, isRestriction: edge.isRestriction });
      return {
        from: edge.from,
        to: edge.to,
        type: edge.type,
        isRestriction: edge.isRestriction,
        minCardinality: edge.minCardinality,
        maxCardinality: edge.maxCardinality,
      };
    },
    getAllEdges: (): Array<{ from: string; to: string; type: string; isRestriction?: boolean }> => {
      return getRawData().edges.map((e) => ({ from: e.from, to: e.to, type: e.type, isRestriction: e.isRestriction }));
    },
    getTestLogs: (filter?: string): string[] => {
      const logs = getTestLogs();
      if (filter) return logs.filter((log) => log.includes(filter));
      return [...logs];
    },
    saveTtl: (): Promise<void> => saveTtl(),
    setHasUnsavedChanges: (value: boolean): void => setHasUnsavedChanges(value),
    updateSaveButtonVisibility: (): void => updateSaveButtonVisibility(),
    loadTtlDirectly: async (ttlString: string, fileName?: string, pathHint?: string): Promise<void> => {
      await loadTtlDirectly(ttlString, fileName, pathHint);
    },
    getSaveButtonState: (): { visible: boolean; hasUnsavedChanges: boolean; ttlStoreExists: boolean } => {
      const saveGroup = document.getElementById('saveGroup');
      const isVisible = saveGroup ? window.getComputedStyle(saveGroup).display !== 'none' : false;
      const store = getTtlStore();
      return {
        visible: isVisible,
        hasUnsavedChanges: getHasUnsavedChanges(),
        ttlStoreExists: store !== null,
      };
    },
    clearTestLogs: (): void => {
      const logs = getTestLogs();
      logs.length = 0;
    },
    testLog: (message: string): void => {
      addTestLog(`[TEST] ${message}`);
    },
    editEdge: (edgeId: string): boolean => {
      const parsed = parseEdgeId(edgeId);
      if (!parsed) return false;
      showEditEdgeModal(parsed.from, parsed.to, parsed.type);
      return true;
    },
    getEditEdgeModalValues: (): { minCardinality: string; maxCardinality: string; isRestrictionChecked: boolean } | null => {
      const modal = document.getElementById('editEdgeModal');
      if (!modal || (modal as HTMLElement).style.display === 'none') return null;
      const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
      const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;
      const isRestrictionCb = document.getElementById('editEdgeIsRestriction') as HTMLInputElement;
      return {
        minCardinality: minCardInput?.value || '',
        maxCardinality: maxCardInput?.value || '',
        isRestrictionChecked: isRestrictionCb?.checked || false,
      };
    },
    openAddNodeModal: (x?: number, y?: number): void => {
      showAddNodeModal(x ?? 100, y ?? 100);
    },
    getAddNodeModalState: (): { okDisabled: boolean; duplicateErrorVisible: boolean; duplicateErrorText: string } => {
      const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
      const dupErr = document.getElementById('addNodeDuplicateError') as HTMLElement;
      return {
        okDisabled: okBtn?.disabled ?? true,
        duplicateErrorVisible: dupErr ? dupErr.style.display !== 'none' : false,
        duplicateErrorText: dupErr?.textContent?.trim() ?? '',
      };
    },
    openEditModalForNode,
    openRenameModal: openEditModalForNode, // Alias for backward compatibility with tests
    openEditModalForEdge,
    getEditEdgeModalTitle: (): string | null => {
      const modal = document.getElementById('editEdgeModal');
      if (!modal || (modal as HTMLElement).style.display === 'none') return null;
      const h3 = modal.querySelector('h3');
      return h3?.textContent?.trim() ?? null;
    },
    getEditEdgeModalFromToAndRelationship: (): { fromLabel: string; toLabel: string; relationshipValue: string } | null => {
      const modal = document.getElementById('editEdgeModal');
      if (!modal || (modal as HTMLElement).style.display === 'none') return null;
      const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement | null;
      const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement | null;
      const typeInput = document.getElementById('editEdgeType') as HTMLInputElement | null;
      if (!fromSel || !toSel || !typeInput) return null;
      const fromLabel = fromSel.options[fromSel.selectedIndex]?.text ?? '';
      const toLabel = toSel.options[toSel.selectedIndex]?.text ?? '';
      return { fromLabel, toLabel, relationshipValue: typeInput.value ?? '' };
    },
    openEditDataPropertyModal: (name: string): void => {
      showEditDataPropertyModal(name);
    },
    getDataPropertyByName: (name: string): { domains: string[]; uri?: string } | null => {
      const dp = getDataProperties().find((p) => p.name === name);
      if (!dp) return null;
      return { domains: dp.domains ?? [], uri: dp.uri };
    },
    getAnnotationProperties: (): Array<{ name: string; isBoolean: boolean; range: string | null | undefined; uri?: string; isDefinedBy?: string }> => {
      return getAnnotationProperties();
    },
    getSerializedTurtle: async (): Promise<string | null> => {
      const store = getTtlStore();
      if (!store) return null;
      return storeToTurtle(store, getExternalOntologyReferences());
    },
    openAddObjectPropertyModal: (): void => {
      document.getElementById('addRelationshipTypeBtn')?.click();
    },
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
    getObjectPropertiesListText: (): string => {
      const el = document.getElementById('edgeStylesContent');
      return el?.textContent?.trim() ?? '';
    },
    openEditObjectPropertyModal: (type: string): void => {
      const edgeStylesContent = document.getElementById('edgeStylesContent');
      if (edgeStylesContent) showEditRelationshipTypeModal(type, edgeStylesContent as HTMLElement, () => applyFilter(true));
    },
    getEditObjectPropertyIdentifierText: (): string | null => {
      const modal = document.getElementById('editRelationshipTypeModal');
      if (!modal || (modal as HTMLElement).style.display === 'none') return null;
      const el = document.getElementById('editRelTypeIdentifier');
      return el?.textContent?.trim() ?? null;
    },
    getRenderedNodeLabel: (nodeId: string): string | null => {
      const network = getNetwork();
      if (!network) return null;
      try {
        const networkAny = network as { body?: { data?: { nodes?: Map<string, { label?: string }> } } };
        const nodes = networkAny.body?.data?.nodes;
        if (!nodes) return null;
        const node = nodes.get(nodeId);
        return node?.label ?? null;
      } catch (e) {
        console.error('[getRenderedNodeLabel] Error accessing network data:', e);
        return null;
      }
    },
    getRenderedNodeOptions: (nodeId: string): { opacity?: number; title?: string } | null => {
      const network = getNetwork();
      if (!network) return null;
      try {
        const networkAny = network as {
          body?: { data?: { nodes?: Map<string, { opacity?: number; title?: string }> } };
        };
        const nodes = networkAny.body?.data?.nodes;
        if (!nodes) return null;
        const node = nodes.get(nodeId);
        if (!node) return null;
        return { opacity: node.opacity, title: node.title };
      } catch (e) {
        console.error('[getRenderedNodeOptions] Error accessing network data:', e);
        return null;
      }
    },
    getRenderedEdgeLabel: (edgeId: string): string | null => {
      const network = getNetwork();
      if (!network) return null;
      try {
        const networkAny = network as { body?: { data?: { edges?: Map<string, { label?: string }> } } };
        const edges = networkAny.body?.data?.edges;
        if (!edges) return null;
        const edge = edges.get(edgeId);
        return edge?.label ?? null;
      } catch (e) {
        console.error('[getRenderedEdgeLabel] Error accessing network data:', e);
        return null;
      }
    },
    showAddEdgeModalForTest: (from: string, to: string): void => {
      showAddEdgeModal(from, to, () => {});
    },
    getVisibleEdgeCount: (): number =>
      parseInt(document.getElementById('edgeCount')?.textContent ?? '0', 10) || 0,
    setEdgeTypeColor: (type: string, color: string): void => {
      const edgeStylesContent = document.getElementById('edgeStylesContent');
      if (!edgeStylesContent) return;
      const escapedType = CSS.escape(type);
      const colorEl = edgeStylesContent.querySelector(
        `.edge-color-picker[data-type="${escapedType}"]`
      ) as HTMLInputElement | null;
      if (colorEl) {
        colorEl.value = color;
        colorEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      applyFilter(true);
    },
    getRenderedEdgeOptions: (edgeId: string): { color?: string } | null => {
      const network = getNetwork();
      if (!network) return null;
      try {
        const networkAny = network as {
          body?: { data?: { edges?: Map<string, { color?: { color?: string } }> } };
        };
        const edges = networkAny.body?.data?.edges;
        if (!edges) return null;
        const edge = edges.get(edgeId);
        if (!edge?.color) return null;
        const c = edge.color as { color?: string };
        return { color: c.color ?? undefined };
      } catch (e) {
        console.error('[getRenderedEdgeOptions] Error accessing network data:', e);
        return null;
      }
    },
  };
}
