/**
 * The app's mutable state, moved out of main.ts (#175). One object per concern, so a module that needs state imports
 * only the objects it uses. Each field keeps the name and type it had as a top-level `let` in main.ts.
 */

import type { ExternalClassInfo, ExternalObjectPropertyInfo } from '../externalOntologySearch';
import type { BadgeFontRatios } from '../graph/classExpressionOverlay';
import type { OutlineTargets } from '../graph/searchOutline';
import { DEFAULT_HIERARCHY_TYPES } from '../layouts/hierarchyRules';
import type { PropertyLists, ImportedOntology } from '../lib/importedDeclarations';
import type { SuggestionSource } from '../lib/searchSuggestions';
import type { OriginalFileCache } from '../rdf/sourcePreservation';
import type { ExternalOntologyReference, SerializerType, ExternalNodeLayout } from '../storage/types';
import type { GraphData, GraphNode, AnnotationPropertyInfo, ObjectPropertyInfo, DataPropertyInfo, BorderLineType, DataPropertyRestriction } from '../types';
import type { Network } from 'vis-network/esnext';

/** One step of undo and redo. */
export type UndoableAction = { undo: () => void; redo: () => void };

export const session = {
  externalOntologyReferences: [] as ExternalOntologyReference[],
  rawData: { nodes: [], edges: [] } as GraphData,
  /** Last expanded graph data (local + external nodes) used to build the network. Used by Edit Edge modal for From/To dropdowns. */
  currentGraphDataForBuild: null as GraphData | null,
  /** External class URIs we have seen in this session (from store or added by user). Not removed when user deletes an external node, so "Add from referenced ontology" still finds them. Cleared on load. */
  knownExternalClassUris: new Set() as Set<string>,
  /** External nodes the user added via "Add from referenced ontology" (not from domain/range). Kept so they get correct external styling (opacity, tooltip). Cleared on load; removed when user deletes that node. */
  userAddedExternalNodes: [] as GraphNode[],
  annotationProperties: [] as AnnotationPropertyInfo[],
  objectProperties: [] as ObjectPropertyInfo[],
  dataProperties: [] as DataPropertyInfo[],
  ttlStore: null as import('n3').Store | null,
  /** The prefixes the open file declares (for the query panel). */
  currentPrefixMap: {} as Record<string, string>,
  /** The individuals drawn in the graph, over the class graph (#209). */
  individualsLayer: null as import('../abox/individualsLayer').IndividualsLayer | null,
  sidePanel: null as { refresh(): void; addDataUrls(urls: string[]): Promise<void>; openIndividuals(): void } | null,
  /** What the loaded ontology's imports declare, once read (#104). The property lists are rebuilt from the store
   * after some edits; this is merged back in each time. */
  importedDeclarations: null as PropertyLists | null,
  /** The loaded ontology's imports that could be read (#131), and whether they are still being read. */
  importedOntologies: [] as ImportedOntology[],
  importsBeingRead: false,
  /** For each import that was read, the newer release found for it, if any (#132). */
  importNewerVersions: new Map<string, string | null>(),
};

export const fileState = {
  loadedFileName: null as string | null,
  loadedFilePath: null as string | null,
  fileHandle: null as FileSystemFileHandle | null,
  originalTtlString: null as string | null, // Store original TTL to preserve format
  originalFileCache: null as OriginalFileCache | null, // Store original file cache for source preservation
  currentSerializerType: 'custom' as SerializerType, // Default to custom for TTL files
  isTtlFile: false as boolean, // Track if current file is TTL
  hasUnsavedChanges: false,
  skipSlowOperationsForTests: false,
};

export const canvasState = {
  network: null as Network | null,
  /** Node positions from display config (used when expanding external refs so external node positions are restored). */
  loadedNodePositions: null as Record<string, { x: number; y: number }> | null,
  /** The positions shown before a layout change or a reset dropped them, until restored (#152). */
  positionsBeforeLayout: null as Record<string, { x: number; y: number }> | null,
  /** Whether those positions had been arranged by the user, for the browser's copy of the config. */
  arrangedBeforeLayout: false,
  /**
   * Whether the user has arranged the positions shown: dragged a node, or loaded a config with positions. Until then
   * they are a layout's, and the browser's copy of the config leaves them out.
   */
  positionsArranged: false,
  /** Track the last layout mode to detect when it changes */
  lastLayoutMode: null as string | null,
  /** Whether to display nodes from external ontologies (object property domain/range). Default ON. */
  displayExternalReferences: true,
  /** Draw data properties with domain owl:Thing once, under an owl:Thing node, rather than under every class (#80). */
  clusterThingDataProperties: true,
  /** Stack many leaf children in a block under their parent in the tiered layouts (#159). */
  stackLeaves: true,
  /** The relationships that make the tiers of the hierarchical layouts (#151), as edge types. */
  hierarchyTypes: new Set(DEFAULT_HIERARCHY_TYPES),
  /** Layout of external nodes: auto or always right/top/bottom/left of connected local node. */
  externalNodeLayout: 'auto' as ExternalNodeLayout,
  /** Edge style config loaded from display config file (takes precedence over DOM checkboxes) */
  loadedEdgeStyleConfig: null as Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: BorderLineType }> | null,
  asyncLayoutRun: 0,
  /** What the search bar can suggest: the terms the last render drew (set in buildNetworkData, #81). */
  searchSuggestionSources: [] as SuggestionSource[],
  /** What the search outline surrounds after the last render (set in buildNetworkData, #84). */
  searchOutlineTargets: { nodeIds: [], dataPropertyNames: [], edgeIds: [] } as OutlineTargets,
  /** Display font settings relative to their defaults, refreshed on each build; sizes class-expression badges. */
  classExpressionFontRatios: { node: 1, relationship: 1, dataProperty: 1 } as BadgeFontRatios,
  displayConfigSaveTimer: null as number | null,
};

export const editState = {
  undoStack: [] as UndoableAction[],
  redoStack: [] as UndoableAction[],
  addNodeMode: false,
  pendingAddNodePosition: null as { x: number; y: number } | null,
  /** Must be reset to false when add-node modal closes (OK/Cancel/backdrop) so toolbar→canvas click can open modal again. */
  addNodeModalShowing: false,
  pendingEditEdgeCallback: null as ((data: { from: string; to: string } | null) => void) | null,
  pendingAddEdgeData: null as { from: string; to: string; callback: (data: { from: string; to: string; id?: string } | null) => void } | null,
  /** Initial data property restrictions when rename modal was opened (single-node mode). */
  renameModalInitialDataProps: null as DataPropertyRestriction[] | null,
  /** Current data property restrictions while editing in rename modal (single-node mode). */
  renameModalDataPropertyRestrictions: [] as DataPropertyRestriction[],
  /** Textual annotation property values (by property name) while editing in the rename modal. */
  renameModalAnnotationValues: {} as Record<string, string[]>,
  /** Textual annotation property values (by property name) while adding a new node (custom tab). */
  addNodeAnnotationValues: {} as Record<string, string[]>,
  /** Data property restrictions while adding a new node (custom tab). */
  addNodeDataPropertyRestrictions: [] as DataPropertyRestriction[],
  selectedExternalClass: null as ExternalClassInfo | null,
  selectedEdgeType: null as string | null,
  selectedExternalObjectProperty: null as ExternalObjectPropertyInfo | null,
  addNodeSearchTimeout: null as ReturnType<typeof setTimeout> | null,
};

export const initFlags = {
  editRelationshipTypeHandlersInitialized: false,
  addRelationshipTypeHandlersInitialized: false,
  editDataPropertyHandlersInitialized: false,
  editAnnotationPropertyHandlersInitialized: false,
  addAnnotationPropertyHandlersInitialized: false,
  addDataPropertyHandlersInitialized: false,
};
