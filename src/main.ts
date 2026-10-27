import { DataSet } from 'vis-data/esnext';
import { Network } from 'vis-network/esnext';
import 'vis-network/styles/vis-network.css';
import {
  updateLabelInStore,
  updateCommentInStore,
  addEdgeToStore,
  addRestrictionToStore,
  removeEdgeFromStore,
  removeRestrictionEdgeFromStore,
  removeRestrictionFromStore,
  addNodeToStore,
  removeNodeFromStore,
  getMainOntologyBase,
  getClassNamespace,
  renameDataPropertyInStore,
  BASE_IRI,
  addDataPropertyToStore,
  removeDataPropertyFromStore,
  updateDataPropertyLabelInStore,
  updateDataPropertyCommentInStore,
  updateDataPropertyRangeInStore,
  updateDataPropertyDomainsInStore,
  updateDataPropertyIsDefinedByInStore,
  addDataPropertyRestrictionToClass,
  removeDataPropertyRestrictionFromClass,
  getDataPropertyRestrictionsForClass,
  addAnnotationPropertyToStore,
  updateAnnotationPropertyLabelInStore,
  updateAnnotationPropertyCommentInStore,
  updateAnnotationPropertyRangeInStore,
  storeToTurtle,
  extractLocalName,
} from './parser';
import { getAnnotationValuesForClass } from './lib/annotationValues';
import {
  isDuplicateIdentifierForRename,
  ADD_NODE_DUPLICATE_MESSAGE,
  applyNodeFormToStore,
  type NodeFormData,
} from './ui/nodeModalForm';
import { editNodeProperties } from './workflows/editNodeProperties';
import * as nodeModalFormUi from './ui/nodeModalFormUi';
import { initLayoutModeHint } from './ui/layoutModeHint';
import { DataFactory, type Term } from 'n3';
import {
  preloadExternalOntologyClasses,
  fetchExternalOntologyTtl,
  servedFrom,
  getReferencedExternalClassesFromStore,
} from './externalOntologySearch';
import type { GraphData, GraphEdge, GraphNode, DataPropertyInfo, BorderLineType } from './types';
import { attachClassExpressionMarks } from './ui/classExpressionInteraction';
import { hideEdgeLinesUnderNodes } from './ui/edgeNodeClipping';
import { firstDataPropertyRowOffset } from './graph/dataPropertyRows';
import { buildSearchVocabulary } from './ui/searchVocabulary';
import { buildSearchSuggestions } from './lib/searchSuggestions';
import { outlineTargets } from './graph/searchOutline';
import { attachSearchOutline } from './ui/searchOutlineOverlay';
import { findClassExpressionGroupForEdge, showEditEdgeClassExpressionNotice } from './ui/editEdgeClassExpressionNotice';
import { showEditEdgeRestrictionNotice } from './ui/editEdgeRestrictionNotice';
import { showDataRangeNotice } from './ui/dataRangeNotice';
import { edgeLock, type EdgeLock } from './lib/edgeEditability';
import { showCanvasTooltip, hideCanvasTooltip, pickTooltip } from './ui/canvasTooltip';
import { resolveExampleImages } from './lib/exampleImages';
import { withThingNode, OWL_THING_URI, splitThingBoxSelection, thingBoxId } from './graph/thingNode';
import { forgetOntologyDirectory } from './lib/ontologyDirectory';
import { snapshotStore, diffStore, revertStoreChange, reapplyStoreChange, snapshotGraph, restoreGraph } from './lib/storeChange';

/** Overlay renderer for anonymous class expressions (union domains etc.). See issue #59. */
import {
  type DisplayConfig,
  type ExternalOntologyReference,
  type ExternalNodeLayout,
  type SerializerType,
  loadDisplayConfigFromIndexedDB,
  saveDisplayConfigToIndexedDB,
  deleteDisplayConfigFromIndexedDB,
  loadExternalRefsFromIndexedDB,
  saveExternalRefsToIndexedDB,
  getLastFileFromIndexedDB,
  saveLastFileToIndexedDB,
  getLastUrlFromIndexedDB,
  saveLastUrlToIndexedDB,
  addRecentlyOpenedToIndexedDB,
  type RecentlyOpenedEntry,
  loadSerializerConfigFromIndexedDB,
  saveSerializerConfigToIndexedDB,
} from './storage';
import { expandWithExternalRefs } from './graph/externalExpansion';
import { isDefinedElsewhere } from './graph/definedElsewhere';
import { loadImportedOntologies, readImportedDeclarations, mergeImportedDeclarations, mergeChangesWhatIsDrawn } from './lib/importedDeclarations';
import { beginImportsSettle, importsSettled } from './ui/importsSettle';
import { escapeHtml } from './utils/escapeHtml';
import { getOntologyInfo } from './ui/ontologyInfo';
import { REPO_URL } from './utils/siteInfo';
import { session, fileState, canvasState, editState, initFlags } from './state/appState';
import { installTestLogCapture } from './e2e/testLogCapture';
import { renderApp } from './ui/appShell';
import { importedNoteForNode, importedNoteForRelationship, importedNoteForDataProperty, importedNoteFont, importedNoteFontSize, importedNoteWrapChars, labelWithImportedNote } from './ui/importedNote';

import { removeExternalClassReferencesFromStore } from './graph/removeExternalReferences';
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
  getLayoutAlgorithm,
  resolveLayoutMode,
  SELF_CONTAINED_LAYOUT_MODES,
} from './graph';

import { placeUnsavedNodes } from './layouts/placeUnsaved';
import type { LayeredModelOptions } from './layouts/layeredModel';
import { definitionParents } from './lib/definitionParents';
import { getAsyncLayoutAlgorithm, DEFAULT_LAYOUT_MODE, type AsyncLayoutAlgorithm } from './layouts';
import {
  computeSearchSets,
  getNodeSearchOpacity as getSearchOpacity,
  getDataPropertySearchOpacity,
  getEdgeSearchOpacity,
  scopeDimsGraph,
  scopeIncludesNeighbours,
  type SearchScope,
} from './lib/searchHighlight';
import { attachPopover, DEFAULT_SEARCH_SCOPE, getSearchScope, setSearchScope } from './ui/searchOptions';
import { setupDragCoupling } from './graph/dataPropertyDragCoupling';
import { persistNodePositionsFromNetwork } from './graph/persistNodePositions';
import { isDebugMode, debugLog, debugWarn, debugError } from './utils/debug';
import {
  initStatusBar,
  updateStatusBar,
  updateNodeEdgeCounts,
  updateOntologyInfoDisplay,
  updateOntologyVersionDisplay,
  updateAvailableVersions,
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
import { findVersions } from './lib/ontologyVersions';
import { browserVersionSources } from './lib/versionSources';
import { recallSeenVersions, rememberSeenVersions } from './lib/seenVersions';

import { attachEditorTestHook } from './e2e/editorTestHook';
import {
  initOpenOntologyModal,
  showOpenOntologyModal,
  hideOpenOntologyModal,
} from './ui/openOntologyModal';
import { openOnStartup } from './ui/startupOpen';
import { debounced } from './utils/debounced';
import { beginViewSettle, viewSettled } from './ui/viewSettle';
import { handleUrlParameterLoad } from './lib/urlParamLoader';
import { clearOntologyParamsFromAddressBar, setOntologyUrlParamInAddressBar, displayConfigBaseName, getAllDisplayFileUrls } from './utils/urlParams';
import { latestDisplayConfigSource } from './lib/displayConfigFallback';
import { showWarningBar, hideWarningBar } from './ui/warningBar';
import { groupMenuEntries } from './ui/propertyMenuGroups';
import { renderMenuGroups } from './ui/propertyMenuGroupsDom';
import { propertySource } from './ui/propertyMenuFacts';
import { annotationUsages } from './lib/annotationUsages';
import { fillUsagesSection } from './ui/annotationUsagesView';

import {
  extractUsedNamespaceRefsFromStore,
  formatNodeLabelWithPrefix,
  formatRelationshipLabelWithPrefix,
  renderExternalRefsList,
  refreshExternalRefsList,
  setImportVersionLookup,
  setImportedPrefixes,
  showExternalRefsModal,
  hideExternalRefsModal,
  sortExternalRefsByUrl,
  type ExternalRefsModalCallbacks,
  getPrefixForUri,
  isUriFromExternalOntology,
  getOpacityForExternalOntology,
  getNodeOntologyUrl,
} from './ui/externalRefs';
import {
  initRenameModalHeaderIcons,
} from './ui/renameModalHeaderIcons';
import { getAppVersion } from './utils/version';
import { getShouldShowTopMenu, isEmbedded } from './utils/embedMode';
import { defaultMaxFontSize, fontSettingRatios, nodeFontRatio } from './ui/fontSizeDefaults';
import {
  getAllRelationshipTypes,
  colourableRelationshipTypes,
  cleanupUnusedExternalProperties,
  getRelationshipLabel,
  getEdgeDisplayLabel,
  getRelationshipComment,
  getAllEdgeTypes,
  hideRelationshipTooltip,
} from './ui/relationshipUtils';
import {
  hideRenameModal,
  getCardinalityFromEditModal,
  showLoadingModal,
  hideLoadingModal,
} from './ui/modals';
import {
  BORDER_LINE_OPTIONS,
  renderLineTypeSvg,
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

import { applyAnnotationPropertyOrder } from './lib/annotationStyle';
import { DATA_PROPERTY_FILL, DEFAULT_BOOL_COLORS, DEFAULT_TEXT_COLOR, RELATIONSHIP_LABEL_BG_RGB, type AnnotationStyleConfig } from './ui/constants';
import { readableTextColor } from './lib/textContrast';
import {
  DATA_PROPERTY_RANGE_OPTIONS,
  XSD_RANGE_OPTIONS,
  appliesToClass,
  describeRange,
  domainAttachment,
  UNATTACHED_DOMAIN_NOTE,
  unattachedDataPropertyNodeId,
} from './lib/dataPropertyDisplay';
import { boundsOf, layoutUnattachedNodes, rowSpacingFor } from './graph/unattachedDataPropertyLayout';
import {
  initAnnotationPropsMenu,
  getAnnotationStyleConfig,
  applyAnnotationStyleConfigToDom,
  type AnnotationPropsMenuDeps,
} from './ui/annotationPropertiesMenu';


import './style.css';


import { updateFilePathDisplay, updateSaveButtonVisibility, updateSerializerDropdown } from './ui/fileBar';

import { collectDisplayConfig, loadDisplayConfigFromLocalFile } from './workflows/displayConfigFiles';
import { applyOpacityToColor, findShownEdge, getEdgeIdAtLabelPoint, revealNodeInView } from './graph/canvasHelpers';
import { setHierarchyTypes, setStackLeaves } from './workflows/layoutOptions';
import { currentDataProperties, findImportsNewerVersions, getDefiningOntologyFromUri } from './workflows/propertyLists';
import { renderDomainsList, showWarningIconPopover, updateAddDataPropIdentifierAndValidation, updateEditDataPropIdentifierAndValidation } from './ui/dataPropertyForm';
import { hideAddNodeModalWithCleanup, onRemoveAddNodeDataProp, onRemoveRenameDataProp, refreshAddNodeOkButton, refreshRenameModalFromInput, showMultiEditModal } from './ui/nodeModalHelpers';
import { hideEditEdgeModalWithCleanup, updateEditEdgeCommentDisplayLocal } from './ui/edgeModalHelpers';
import { firstDisplayConfig, flushDisplayConfigSave, scheduleDisplayConfigSave } from './workflows/displayConfigSave';
import { clearPositionsBeforeLayout, forgetNodePositions, restoreNodePositions } from './workflows/nodePositions';
import { registerActions } from './state/actions';
import { clearUndoRedo, performRedo, performUndo, pushUndoable } from './workflows/undoRedo';
import { getNodeStyleFromAnnotations, shouldShowNodeByAnnotations } from './lib/annotationNodeStyle';
import { openExternalOntology } from './workflows/openExternalTab';
import { saveTtl } from './workflows/saveTtlFlow';



import { applyDisplayConfig } from './workflows/displayConfigApply';
import { updateDataPropEditableState } from './ui/dataPropertyEditable';
import { handleExternalClassSearch, showAddNodeModal } from './ui/addNodeModal';
import { showRenameModal } from './ui/renameModal';
import { showAddEdgeModal } from './ui/addEdgeModal';
import { updateEditEdgeTypeSearch, updateEditEdgeTypeSections } from './ui/editEdgeTypeSearch';
import { resolveTerm, updateSelectionInfoDisplay } from './ui/selectionInfo';
import { initAddRelationshipTypeHandlers, initEdgeStylesMenu, showEditRelationshipTypeModal } from './ui/relationshipTypeModal';
// Removed updateLoadLastOpenedButton - now handled by openOntologyModal


/** Why a locked edge can't be deleted, for the alert listing them. */
const EDGE_LOCK_REASON: Record<EdgeLock, string> = {
  restriction: 'an OWL restriction',
  classExpression: 'drawn from a class expression',
  externalTarget: 'a restriction on an imported class',
};


function performDeleteSelection(): boolean {
  debugLog(`[DELETE] performDeleteSelection called`);
  if (!canvasState.network || !session.ttlStore) {
    debugLog(`[DELETE] Early return: network or ttlStore not available`);
    return false;
  }
  // Embedded mode is read-only.
  if (isEmbedded()) return false;
  const activeEl = document.activeElement as HTMLElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
    debugLog(`[DELETE] Early return: active element is input/textarea/contentEditable:`, activeEl.tagName);
    return false;
  }
  const selectedNodeIds = canvasState.network.getSelectedNodes().map(String);
  const selectedEdgeIds = canvasState.network.getSelectedEdges().map(String);
  debugLog(`[DELETE] Selected nodes: ${selectedNodeIds.length}, Selected edges: ${selectedEdgeIds.length}`);
  debugLog(`[DELETE] Selected edge IDs:`, selectedEdgeIds);
  if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) {
    debugLog(`[DELETE] Early return: no selection`);
    return false;
  }
  // A data property drawn once under owl:Thing (#80) stands for the property itself: deleting its box deletes
  // the property, after a confirmation. Every selected box is deleted that way; mixed with anything else the
  // selection is refused rather than partly ignored.
  const { names: thingProperties, others: otherSelectedNodeIds } = splitThingBoxSelection(selectedNodeIds);
  if (thingProperties.length > 0) {
    // Selecting a box also selects its own edge to owl:Thing; that one is part of the box.
    const thingBoxIds = new Set(thingProperties.map(thingBoxId));
    const otherSelectedEdgeIds = selectedEdgeIds.filter((id) => {
      const edge = parseEdgeId(id);
      return !edge || !(thingBoxIds.has(edge.from) || thingBoxIds.has(edge.to));
    });
    if (otherSelectedNodeIds.length > 0 || otherSelectedEdgeIds.length > 0) {
      alert('Select the data property boxes under owl:Thing on their own to delete them: they delete the property itself, not just a box.');
      return true;
    }
    for (const name of thingProperties) deleteDataPropertyWithConfirm(name);
    return true;
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
        const classNode = session.rawData.nodes.find((n) => n.id === classId);
        if (classNode?.dataPropertyRestrictions?.some((r) => r.propertyName === propertyName)) {
          dataPropertyRestrictionsToRemove.push({ classId, propertyName });
        }
      }
    } else {
      edgesToRemove.push({ from, to, type });
    }
  }

  const nodesToRemove = selectedNodeIds.filter((id) => session.rawData.nodes.some((n) => n.id === id));
  // owl:Thing, drawn for the data properties of every class (#80), is not an imported class to remove.
  const externalNodeIdsToRemove = selectedNodeIds.filter(
    (id) => id !== OWL_THING_URI && (id.startsWith('http://') || id.startsWith('https://')) && !session.rawData.nodes.some((n) => n.id === id)
  );
  const connectedEdges = session.rawData.edges.filter(
    (e) => nodesToRemove.includes(e.from) || nodesToRemove.includes(e.to)
  );
  const edgesConnectedToExternal = session.rawData.edges.filter(
    (e) => externalNodeIdsToRemove.includes(e.from) || externalNodeIdsToRemove.includes(e.to)
  );

  // Undo puts back exactly what this delete changes in the store and the graph (#77). Rebuilding through the
  // writers restored only part of a class (its label) and would turn read-only restriction kinds into ∃.
  const storeBefore = snapshotStore(session.ttlStore);
  const graphBefore = snapshotGraph(session.rawData);
  const userAddedBefore = [...session.userAddedExternalNodes];

  // Remove edges BEFORE nodes. Restriction-based edges (contains, partOf) require the node's
  // subClassOf quads to still exist for removeEdgeFromStore to find and remove them.
  // Note: rawData.edges contains at most one edge per from/to/type combination.
  debugLog(`[DELETE] Starting edge deletion. edgesToRemove: ${edgesToRemove.length} edges`);
  const readOnlyEdgesKept: string[] = [];
  for (const { from, to, type } of edgesToRemove) {
    debugLog(`[DELETE] Processing edge deletion: ${from} -> ${to} : ${type}`);
    const edge = findShownEdge(from, to, type);
    // Edges the editor can't write back: restriction kinds other than ∃/onClass (removeEdgeFromStore would
    // remove the wrong triples; #63), edges drawn from a class
    // expression (removing one would drop the range or domain every member shares; #58), and restrictions on
    // an imported class (#99).
    const lock = edge ? edgeLock(edge) : null;
    if (lock) {
      if (nodesToRemove.includes(from) || nodesToRemove.includes(to)) continue; // goes with its class, below
      readOnlyEdgesKept.push(`${from} → ${to} (${type}): ${EDGE_LOCK_REASON[lock]}`);
      continue;
    }
    debugLog(`[DELETE] Found edge in rawData:`, edge ? { from: edge.from, to: edge.to, type: edge.type, isRestriction: edge.isRestriction } : 'NOT FOUND');
    // Del key deletion should remove both restriction and domain/range
    try {
      debugLog(`[DELETE] Calling removeEdgeFromStore for: ${from} -> ${to} : ${type}`);
      removeEdgeFromStore(session.ttlStore, from, to, type);
      debugLog(`[DELETE] removeEdgeFromStore succeeded for: ${from} -> ${to} : ${type}`);
      // Successfully removed from store - remove from rawData
      const idx = session.rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      debugLog(`[DELETE] Edge index in rawData: ${idx}`);
      if (idx >= 0) {
        session.rawData.edges.splice(idx, 1);
        debugLog(`[DELETE] Removed edge from rawData. Remaining edges: ${session.rawData.edges.length}`);
      } else {
        debugWarn(`[DELETE] WARNING: Edge not found in rawData at index ${idx} for: ${from} -> ${to} : ${type}`);
      }
    } catch (err) {
      // Edge not found in store (may only exist in rawData from domain/range)
      // Still remove from rawData
      debugError(`[DELETE] EXCEPTION removing edge from store: ${from} -> ${to} : ${type}`);
      debugError(`[DELETE] Exception message: ${err instanceof Error ? err.message : String(err)}`);
      debugError(`[DELETE] Exception stack:`, err instanceof Error ? err.stack : 'No stack trace');
      const idx = session.rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      debugLog(`[DELETE] Exception case - edge index in rawData: ${idx}`);
      if (idx >= 0) {
        const edge = session.rawData.edges[idx];
        debugLog(`[DELETE] Removing edge from rawData despite exception:`, { from: edge.from, to: edge.to, type: edge.type });
        session.rawData.edges.splice(idx, 1);
        debugLog(`[DELETE] Removed edge from rawData after exception. Remaining edges: ${session.rawData.edges.length}`);
      } else {
        debugWarn(`[DELETE] WARNING: Edge not found in rawData at index ${idx} after exception for: ${from} -> ${to} : ${type}`);
      }
    }
  }
  debugLog(`[DELETE] Finished edge deletion. Remaining edges in rawData: ${session.rawData.edges.length}`);
  if (readOnlyEdgesKept.length > 0) {
    alert(`These relationships can't be deleted in the editor yet (adjust them in the ontology source):\n${readOnlyEdgesKept.join('\n')}`);
  }

  for (const { from, to, type } of connectedEdges) {
    const edge = session.rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
    const lock = edge ? edgeLock(edge) : null;
    if (lock === 'classExpression') {
      // Leave the expression and the property's domain/range to removeNodeFromStore, which drops only the
      // axioms naming the deleted class; removeEdgeFromStore would drop the range all members share (#58).
      const idx = session.rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx < 0) continue;
      const [removedEdge] = session.rawData.edges.splice(idx, 1);
      // A restriction drawn for the expression's pair names the deleted class inside its blank node, which
      // removeNodeFromStore doesn't reach: remove just the restriction.
      if (removedEdge.isRestriction) removeRestrictionEdgeFromStore(session.ttlStore, from, to, type);
      continue;
    }
    if (lock === 'restriction') {
      // Deleting its class takes a read-only restriction with it: remove exactly its restriction(s) (#63).
      removeRestrictionEdgeFromStore(session.ttlStore, from, to, type);
      const idx = session.rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) session.rawData.edges.splice(idx, 1);
      continue;
    }
    if (edgesToRemove.some((e) => e.from === from && e.to === to && e.type === type)) continue;
    try {
      removeEdgeFromStore(session.ttlStore, from, to, type);
      // Successfully removed from store - remove from rawData
      const idx = session.rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) session.rawData.edges.splice(idx, 1);
    } catch (err) {
      // Edge not found in store (may only exist in rawData from domain/range)
      // Still remove from rawData
      debugWarn(`Failed to remove connected edge from store: ${err instanceof Error ? err.message : String(err)}`);
      const idx = session.rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) session.rawData.edges.splice(idx, 1);
    }
  }

  // Handle data property restriction deletions
  for (const { classId, propertyName } of dataPropertyRestrictionsToRemove) {
    const classNode = session.rawData.nodes.find((n) => n.id === classId);
    const restriction = classNode?.dataPropertyRestrictions?.find((r) => r.propertyName === propertyName);
    if (!classNode || !restriction) continue;
    removeDataPropertyRestrictionFromClass(session.ttlStore, classId, propertyName);
    const nodeIndex = session.rawData.nodes.findIndex((n) => n.id === classId);
    if (nodeIndex >= 0) {
      session.rawData.nodes[nodeIndex].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(session.ttlStore, classId);
    }
  }

  for (const nodeId of nodesToRemove) {
    const node = session.rawData.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    removeNodeFromStore(session.ttlStore, nodeId);
    const idx = session.rawData.nodes.findIndex((n) => n.id === nodeId);
    if (idx >= 0) session.rawData.nodes.splice(idx, 1);
  }

  session.userAddedExternalNodes = session.userAddedExternalNodes.filter((n) => !externalNodeIdsToRemove.includes(n.id));

  for (const externalId of externalNodeIdsToRemove) {
    removeExternalClassReferencesFromStore(session.ttlStore, externalId);
    for (const e of edgesConnectedToExternal.filter((e) => e.from === externalId || e.to === externalId)) {
      const idx = session.rawData.edges.findIndex((ed) => ed.from === e.from && ed.to === e.to && ed.type === e.type);
      if (idx >= 0) session.rawData.edges.splice(idx, 1);
    }
  }

  const storeChange = diffStore(storeBefore, session.ttlStore);
  const graphAfter = snapshotGraph(session.rawData);
  const userAddedAfter = [...session.userAddedExternalNodes];
  // A node added from a referenced ontology with no relationship lives only in userAddedExternalNodes: deleting
  // it changes neither the store nor the graph data, but is still a change (#107 review).
  const graphChanged =
    graphAfter.nodes.length !== graphBefore.nodes.length ||
    graphAfter.edges.length !== graphBefore.edges.length ||
    userAddedAfter.length !== userAddedBefore.length;
  if (storeChange.removed.length === 0 && storeChange.added.length === 0 && !graphChanged) return false;

  // Clear search so children of deleted nodes remain visible (they were shown as neighbors)
  const searchEl = document.getElementById('searchQuery') as HTMLInputElement | null;
  if (searchEl?.value.trim()) {
    searchEl.value = '';
    document.getElementById('searchAutocomplete')?.classList.remove('visible');
  }

  pushUndoable(
    () => {
      revertStoreChange(session.ttlStore!, storeChange);
      restoreGraph(session.rawData, graphBefore);
      session.userAddedExternalNodes = [...userAddedBefore];
    },
    () => {
      reapplyStoreChange(session.ttlStore!, storeChange);
      restoreGraph(session.rawData, graphAfter);
      session.userAddedExternalNodes = [...userAddedAfter];
    }
  );
  fileState.hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  // Clean up unused external properties and update edge styles menu
  session.objectProperties = cleanupUnusedExternalProperties(session.rawData, session.objectProperties);
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  if (edgeStylesContent) {
    initEdgeStylesMenu(edgeStylesContent, applyFilter);
  }
  debugLog(`[DELETE] About to call applyFilter. rawData.edges count: ${session.rawData.edges.length}`);
  debugLog(`[DELETE] rawData.edges:`, session.rawData.edges.map(e => `${e.from}->${e.to}:${e.type}`));
  applyFilter(true);
  debugLog(`[DELETE] After applyFilter. rawData.edges count: ${session.rawData.edges.length}`);
  debugLog(`[DELETE] rawData.edges after filter:`, session.rawData.edges.map(e => `${e.from}->${e.to}:${e.type}`));
  canvasState.network.unselectAll();
  return true;
}
const SPACING = getSpacing();

// Relationship utility functions moved to ui/relationshipUtils.ts




const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';

function initDataPropsMenu(dataPropsContent: HTMLElement): void {
  dataPropsContent.innerHTML = '';
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  
  // Helper to format property name with prefix
  const formatPropName = (dp: DataPropertyInfo): string => {
    const prefix = getPrefixForUri(dp.uri, dp.isDefinedBy, session.externalOntologyReferences, mainBase);
    return prefix ? `${prefix}:${dp.label}` : dp.label;
  };
  
  // The ontology's own properties first, the imported ones in a collapsed group below (#137).
  const entries = session.dataProperties.map((dp) => ({
    item: dp,
    source: propertySource(dp, session.externalOntologyReferences, mainBase),
    deprecated: !!dp.deprecated,
  }));
  renderMenuGroups(dataPropsContent, groupMenuEntries(entries), ({ item: dp }) => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
    const propDisplayName = formatPropName(dp);
    const rangeDisplay = describeRange(dp);
    const rangeStyle = rangeDisplay.source === 'asserted' ? 'color: #666;' : 'color: #999; font-style: italic;';
    row.innerHTML = `
      <span class="prop-name" style="font-weight: bold; font-family: Consolas, monospace; font-size: 12px; min-width: 100px;">${escapeHtml(propDisplayName)}</span>
      <span style="font-size: 11px; ${rangeStyle}" title="${escapeHtml(rangeDisplay.tooltipNote)}">${escapeHtml(rangeDisplay.menuLabel)}</span>
      ${dp.contextOnly ? '' : `<button type="button" class="data-prop-edit-btn" data-name="${escapeHtml(dp.name)}" title="Edit data property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #3498db; font-size: 14px; transform: scaleX(-1);">✎</button>
      <button type="button" class="data-prop-delete-btn" data-name="${escapeHtml(dp.name)}" title="Delete this data property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>`}
    `;
    return row;
  });
  dataPropsContent.querySelectorAll('.data-prop-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.name!;
      showEditDataPropertyModal(name);
    });
  });
  dataPropsContent.querySelectorAll('.data-prop-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteDataPropertyWithConfirm((btn as HTMLElement).dataset.name!));
  });
}

/** Delete a data property after a confirmation (and a second one when restrictions use it): from the Data
 * Properties menu, or from its box under owl:Thing (#80). */
function deleteDataPropertyWithConfirm(name: string): void {
  const dataPropsContent = document.getElementById('dataPropsContent') as HTMLElement;
  if (!confirm(`Delete data property "${name}"?`)) return;
  if (!session.ttlStore) return;
  
  // Check if this property is used in any restrictions
  const restrictionsUsingProperty = session.rawData.nodes.filter((n) =>
    n.dataPropertyRestrictions?.some((r) => r.propertyName === name)
  );
  
  if (restrictionsUsingProperty.length > 0) {
    const classNames = restrictionsUsingProperty.map((n) => n.label || n.id).join(', ');
    if (!confirm(`This property is used in restrictions on: ${classNames}\n\nDelete anyway? This will also remove all restrictions using this property.`)) {
      return;
    }
    
    // Remove all restrictions using this property
    for (const node of restrictionsUsingProperty) {
      removeDataPropertyRestrictionFromClass(session.ttlStore, node.id, name);
      const nodeIndex = session.rawData.nodes.findIndex((n) => n.id === node.id);
      if (nodeIndex >= 0) {
        session.rawData.nodes[nodeIndex].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(session.ttlStore, node.id);
      }
    }
  }
  
  // Try to remove from store
  const removed = removeDataPropertyFromStore(session.ttlStore, name);
  
  // Always remove from the array and refresh UI, even if store removal failed
  // (the property might have been from an external ontology or already deleted)
  const wasInArray = session.dataProperties.some((dp) => dp.name === name);
  if (wasInArray) {
    session.dataProperties = session.dataProperties.filter((dp) => dp.name !== name);
    fileState.hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    initDataPropsMenu(dataPropsContent);
    applyFilter(true); // Refresh the graph to reflect the deletion
  }
  
  if (!removed && wasInArray) {
    console.warn(`Data property "${name}" was in the list but not found in store. It may have been from an external ontology or already deleted.`);
  }
}


function initEditDataPropertyHandlers(): void {
  if (initFlags.editDataPropertyHandlersInitialized) return;
  initFlags.editDataPropertyHandlersInitialized = true;
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
    // The empty option is "No range asserted", which must stay null rather than becoming a datatype.
    const newRange = rangeSel?.value ? rangeSel.value : null;
    const newDefinedBy = definedByInput?.value?.trim() ?? null;
    if (!session.ttlStore) return;
    let dp = session.dataProperties.find((p) => p.name === name);
    if (!dp) return;
    const isImported = !!dp.isDefinedBy;
    if (!isImported && !newLabel) return;
    if (!isImported) {
      const validation = validateLabelForIdentifier(newLabel);
      if (!validation.valid) return;
    }
    const labelChanged = dp.label !== newLabel;
    // The identifier is derived from the label and has no input of its own, so it can only
    // change as a consequence of a label edit. Deriving it when the label is untouched
    // spuriously renames terms whose label diverges from their local name (issue #33).
    const derivedId = !isImported && newLabel && labelChanged ? labelToCamelCaseIdentifier(newLabel) : null;
    const currentLocalName = dp.uri ? extractLocalName(dp.uri) : dp.name;
    const identifierChanged = !!derivedId && derivedId !== currentLocalName;
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
      const renamed = renameDataPropertyInStore(session.ttlStore, dp.uri, derivedId!);
      if (renamed) {
        session.dataProperties = currentDataProperties(session.ttlStore);
        name = derivedId!;
        (modal as HTMLElement).dataset.dataPropName = name;
        dp = session.dataProperties.find((p) => p.name === name)!;
      }
    }
    if (labelChanged) {
      updateDataPropertyLabelInStore(session.ttlStore, name, newLabel);
      dp.label = newLabel;
    }
    if (commentChanged) {
      updateDataPropertyCommentInStore(session.ttlStore, name, newComment || null);
      dp.comment = newComment || undefined;
    }
    if (rangeChanged) {
      updateDataPropertyRangeInStore(session.ttlStore, name, newRange);
      dp.range = newRange;
    }
    if (domainsChanged) {
      updateDataPropertyDomainsInStore(session.ttlStore, name, currentDomains);
    }
    if (definedByChanged) {
      updateDataPropertyIsDefinedByInStore(session.ttlStore, name, newDefinedBy && newDefinedBy.startsWith('http') ? newDefinedBy : null);
      dp.isDefinedBy = (newDefinedBy && newDefinedBy.startsWith('http') ? newDefinedBy : null) ?? undefined;
    }
    fileState.hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    session.dataProperties = currentDataProperties(session.ttlStore);
    applyFilter(true);
    // Deleting the last domain moves the property off its class and into the free-standing band,
    // which is usually off-screen. Follow it there rather than leaving the user on an empty edit.
    if (domainsChanged && domainAttachment(session.dataProperties.find((p) => p.name === name) ?? dp) === 'unattached') {
      revealNodeInView(unattachedDataPropertyNodeId(name));
    }
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
    const dp = session.dataProperties.find((p) => p.name === name);
    if (!dp) return;
    
    // Get available classes (not already added as domains)
    const availableClasses = session.rawData.nodes
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
        renderDomainsList(domainsListEl, dp.domains, dp.hasGlobalDomain);
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

function showEditDataPropertyModal(name: string): void {
  // Declared only in an import (#104): editing it would write it into this ontology.
  if (session.dataProperties.find((p) => p.name === name)?.contextOnly) return;
  initEditDataPropertyHandlers();
  const modal = document.getElementById('editDataPropertyModal')!;
  (modal as HTMLElement).dataset.dataPropName = name;
  const nameEl = document.getElementById('editDataPropName') as HTMLElement;
  const labelValidationEl = document.getElementById('editDataPropLabelValidation') as HTMLElement;
  const definedByInput = document.getElementById('editDataPropDefinedBy') as HTMLInputElement;
  const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
  const commentInput = document.getElementById('editDataPropComment') as HTMLTextAreaElement;
  const rangeSel = document.getElementById('editDataPropRange') as HTMLSelectElement;
  const domainsListEl = document.getElementById('editDataPropDomainsList') as HTMLElement;
  const dp = session.dataProperties.find((p) => p.name === name);
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  // Check if imported: use isDefinedBy if present, otherwise check if URI belongs to external ontology
  const isImported = dp ? (dp.isDefinedBy ? isUriFromExternalOntology(dp.uri, dp.isDefinedBy, session.externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, session.externalOntologyReferences, mainBase)) : false;
  
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
  
  if (isImported && headerIcons) {
    const ontologyUrl = hasValidDefinedBy ? dp?.isDefinedBy : (dp?.uri ? getDefiningOntologyFromUri(dp.uri, session.externalOntologyReferences) : 'an external ontology');
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
  // "No range asserted" must be selectable, otherwise opening the modal on a typing stub silently
  // pre-selects xsd:string and saving writes a datatype the ontology never declared.
  const rangeOptions = [{ value: '', label: 'No range asserted' }, ...DATA_PROPERTY_RANGE_OPTIONS];
  if (dp?.range && !rangeOptions.some((o) => o.value === dp.range)) {
    rangeOptions.push({ value: dp.range, label: dp.range.includes('#') ? dp.range.split('#').pop()! : dp.range });
  }
  const selectedRange = dp?.range ?? '';
  rangeSel.innerHTML = rangeOptions.map((opt) => `<option value="${opt.value}"${selectedRange === opt.value ? ' selected' : ''}>${opt.label}</option>`).join('');
  rangeSel.disabled = isImported;
  rangeSel.style.opacity = isImported ? '0.5' : '1';
  rangeSel.title = isImported ? 'Range cannot be changed for imported properties.' : '';
  // An anonymous data range (facets, datatype union, …) can't be shown in the dropdown: spell it out (#63).
  showDataRangeNotice(rangeSel, dp?.rangeExpression);
  const originalDomains = dp ? [...(dp.domains || [])] : [];
  (modal as HTMLElement).dataset.originalDomains = JSON.stringify(originalDomains);
  if (domainsListEl && dp) {
    renderDomainsList(domainsListEl, dp.domains || [], dp.hasGlobalDomain);
  }
  modal.style.display = 'flex';
  // After showing the modal: the update skips a hidden one. It also sets the identifier (#101).
  updateEditDataPropIdentifierAndValidation();
  labelInput?.focus();
}


function initEditAnnotationPropertyHandlers(): void {
  if (initFlags.editAnnotationPropertyHandlersInitialized) return;
  initFlags.editAnnotationPropertyHandlersInitialized = true;
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
    if (!newLabel || !session.ttlStore) return;
    const ap = session.annotationProperties.find((p) => p.name === name);
    if (!ap) return;
    const labelChanged = (ap.name !== newLabel && ap.name !== extractLocalName(newLabel));
    const commentChanged = false; // We don't track comments in annotationProperties array
    const rangeChanged = (ap.range ?? null) !== (newRange || null);
    if (!labelChanged && !commentChanged && !rangeChanged) {
      document.getElementById('editAnnotationPropertyModal')!.style.display = 'none';
      return;
    }
    if (labelChanged) {
      updateAnnotationPropertyLabelInStore(session.ttlStore, name, newLabel);
      // Update the name if it changed (based on label)
      const newName = extractLocalName(newLabel) || name;
      if (newName !== name) {
        // Name changed, need to update the array
        session.annotationProperties = session.annotationProperties.filter((p) => p.name !== name);
        session.annotationProperties.push({ name: newName, isBoolean: ap.isBoolean, range: ap.range });
        session.annotationProperties.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // Just update the label in the existing entry
        const idx = session.annotationProperties.findIndex((p) => p.name === name);
        if (idx >= 0) {
          // Label is stored as name, so we don't need to update it
        }
      }
    }
    if (commentChanged || commentInput?.value.trim()) {
      updateAnnotationPropertyCommentInStore(session.ttlStore, name, newComment || null);
    }
    if (rangeChanged) {
      updateAnnotationPropertyRangeInStore(session.ttlStore, name, newRange || null);
      const idx = session.annotationProperties.findIndex((p) => p.name === name);
      if (idx >= 0) {
        session.annotationProperties[idx].range = newRange || null;
        // Update isBoolean for backward compatibility
        session.annotationProperties[idx].isBoolean = newRange === XSD_NS + 'boolean' || newRange?.endsWith('#boolean') || false;
      }
    }
    fileState.hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    const annotationPropsContent = document.getElementById('annotationPropsContent');
    if (annotationPropsContent) initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
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
  const ap = session.annotationProperties.find((p) => p.name === name);
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const isImported = ap ? isUriFromExternalOntology(ap.uri, ap.isDefinedBy, session.externalOntologyReferences, mainBase) : false;
  
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
    const ontologyUrl = ap?.isDefinedBy || (ap?.uri ? getDefiningOntologyFromUri(ap.uri, session.externalOntologyReferences) : 'an external ontology');
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
    const prefix = ap ? getPrefixForUri(ap.uri, ap.isDefinedBy, session.externalOntologyReferences, mainBase) : null;
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
    if (session.ttlStore && ap?.uri) {
      const propUri = ap.uri;
      const labelQuads = session.ttlStore.getQuads(propUri as any, 'http://www.w3.org/2000/01/rdf-schema#label', null, null);
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
    if (session.ttlStore && ap?.uri) {
      const propUri = ap.uri;
      const commentQuads = session.ttlStore.getQuads(propUri as any, 'http://www.w3.org/2000/01/rdf-schema#comment', null, null);
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
  
  // Populate range dropdown (XSD datatypes only - rdfs:Literal is a data-property range)
  if (rangeSel) {
    const rangeOptions = [
      { value: '', label: 'No range (untyped)' },
      ...XSD_RANGE_OPTIONS,
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

  // Where it is used (#139), collapsed.
  const usagesSection = document.getElementById('editAnnotationPropUsages') as HTMLDetailsElement | null;
  if (usagesSection) fillUsagesSection(usagesSection, session.ttlStore && ap?.uri ? annotationUsages(session.ttlStore, ap.uri) : []);

  modal.style.display = 'flex';
  labelInput?.focus();
}


function initAddAnnotationPropertyHandlers(_annotationPropsContent?: HTMLElement): void {
  if (initFlags.addAnnotationPropertyHandlersInitialized) return;
  initFlags.addAnnotationPropertyHandlersInitialized = true;
  const labelInput = document.getElementById('addAnnotationPropLabel') as HTMLInputElement;
  const rangeSel = document.getElementById('addAnnotationPropRange') as HTMLSelectElement;
  
  // Populate range dropdown with XSD types
  if (rangeSel) {
    const rangeOptions = [
      { value: '', label: 'No range (untyped)' },
      ...XSD_RANGE_OPTIONS,
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
    if (!label || !session.ttlStore) return;
    const name = addAnnotationPropertyToStore(session.ttlStore, label, range);
    if (name) {
      const isBoolean = range === XSD_NS + 'boolean' || range?.endsWith('#boolean') || false;
      session.annotationProperties.push({ name, isBoolean, range });
      session.annotationProperties.sort((a, b) => a.name.localeCompare(b.name));
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      const content = document.getElementById('annotationPropsContent');
      if (content) initAnnotationPropsMenu(content, getAnnotationPropsMenuDeps());
    }
    document.getElementById('addAnnotationPropertyModal')!.style.display = 'none';
  });
}


function initAddDataPropertyHandlers(_dataPropsContent?: HTMLElement): void {
  if (initFlags.addDataPropertyHandlersInitialized) return;
  initFlags.addDataPropertyHandlersInitialized = true;
  const labelInput = document.getElementById('addDataPropLabel') as HTMLInputElement;
  const rangeSel = document.getElementById('addDataPropRange') as HTMLSelectElement;
  if (rangeSel) {
    // Consistent with the edit modal and the annotation modal: a new property must be allowed to
    // assert no range, otherwise the typing-stub pattern cannot be authored here at all.
    const rangeOptions = [{ value: '', label: 'No range asserted' }, ...DATA_PROPERTY_RANGE_OPTIONS];
    rangeSel.innerHTML = rangeOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
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
    const rangeUri = rangeEl?.value ? rangeEl.value : null;
    if (!session.ttlStore) return;
    const existingNames = new Set(session.dataProperties.map((dp) => dp.name));
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
    const name = addDataPropertyToStore(session.ttlStore, label, rangeUri, validation.identifier);
    if (name) {
      session.dataProperties = currentDataProperties(session.ttlStore);
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      const content = document.getElementById('dataPropsContent');
      if (content) initDataPropsMenu(content);
      applyFilter(true);
      // The modal asks for no domain, so the property is always free-standing and lands below the
      // class graph - outside the viewport applyFilter just restored. Show the user what they made.
      revealNodeInView(unattachedDataPropertyNodeId(name));
      document.getElementById('addDataPropertyModal')!.style.display = 'none';
    }
  });
}

/** Build the dependency bundle the annotation-properties menu needs (injected, so the menu
 * module stays decoupled from main.ts globals). */
function getAnnotationPropsMenuDeps(): AnnotationPropsMenuDeps {
  return {
    getAnnotationProperties: () => session.annotationProperties,
    setAnnotationProperties: (props) => {
      session.annotationProperties = props;
    },
    getTtlStore: () => session.ttlStore,
    getExternalRefs: () => session.externalOntologyReferences,
    onApply: () => applyFilter(),
    showEditModal: (name) => showEditAnnotationPropertyModal(name),
    markUnsaved: () => {
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    },
    scheduleSave: () => scheduleDisplayConfigSave(),
    pushUndoable: (undo, redo) => pushUndoable(undo, redo),
  };
}

/**
 * Get opacity value based on search category.
 * @param nodeId Node ID to check
 * @param matchingIds Set of matching node IDs
 * @param neighborIds Set of neighbor node IDs
 * @returns Opacity value: 1.0 for matching, 0.65 for neighbors, 0.08 for others (minimum 5%)
 */
function buildNetworkData(
  filter: {
    wrapChars: number;
    minFontSize: number;
    maxFontSize: number;
    relationshipFontSize: number;
    dataPropertyFontSize?: number;
    searchQuery: string;
    searchScope: SearchScope;
    exactMatch: boolean;
    edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string }>;
    annotationStyleConfig: AnnotationStyleConfig;
    layoutMode: string;
  },
  graphData?: GraphData
): { nodes: DataSet<any>; edges: DataSet<any> } {
  // The example images a node or edge shows in its tooltip (#142), resolved against where the ontology was opened from.
  const hoverImages = (values: string[] | undefined): { exampleImages?: string[] } =>
    values?.length ? { exampleImages: resolveExampleImages(values, fileState.loadedFilePath) } : {};
  const data = graphData ?? session.rawData;
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

  const matchQuery = (filter.searchQuery || '').trim();
  // What the search finds (matchQuery) vs whether it fades the rest (searchQuery, used by every
  // opacity branch below): "Highlight matches in whole graph" only outlines, it fades nothing (#85).
  const searchQuery = scopeDimsGraph(filter.searchScope) ? matchQuery : '';
  // Search highlighting sets (matching nodes/edges + first-ring neighbours). Neighbours are only
  // populated for the "matches and their neighbours" scope, and the traversal stops at the first ring.
  // Data properties, prefixed names (foaf:member) and labels are searchable too (#81).
  const searchVocabulary = buildSearchVocabulary({
    nodes: filteredNodes,
    edgeTypes: getEdgeTypes(filteredEdges),
    objectProperties: session.objectProperties,
    dataProperties: session.dataProperties,
    externalOntologyReferences: session.externalOntologyReferences,
    mainOntologyBase: session.ttlStore ? getMainOntologyBase(session.ttlStore) : null,
  });
  // The suggestions offer exactly what is drawn — including referenced external classes such as
  // skos:Concept, which aren't among the ontology's own classes (rawData.nodes).
  canvasState.searchSuggestionSources = searchVocabulary.sources;
  const searchSets = computeSearchSets(
    filteredNodes,
    filteredEdges,
    matchQuery,
    scopeIncludesNeighbours(filter.searchScope),
    filter.exactMatch,
    { ...searchVocabulary.extras, dataProperties: searchVocabulary.dataProperties }
  );
  const { matchingNodeIds, neighborNodeIds } = searchSets;
  // What the pulsing search outline surrounds: direct matches only (#84).
  canvasState.searchOutlineTargets = outlineTargets(searchSets, matchQuery);

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
  
  // Debug: Log all edges before style filtering for edge-style-test
  const edgeStyleTestEdges = filteredEdges.filter((e) => 
    e.type.includes('edge-style-test') || e.type === 'subClassOf' || e.type === 'hasProperty' || e.type === 'contains'
  );
  if (edgeStyleTestEdges.length > 0) {
    debugLog('[DEBUG] Edge-style-test edges before style filtering:', edgeStyleTestEdges.map((e) => ({ from: e.from, to: e.to, type: e.type })));
  }
  
  filteredEdges = filteredEdges.filter((e) => {
    // Try direct lookup first
    let style = edgeStyleConfig[e.type];
    
    // If not found, try to find a matching config entry by checking:
    // 1. If type is a full URI, try local name
    // 2. If type is a local name, try full URI
    // 3. Try finding any config key that matches (by local name extraction)
    if (!style) {
      const typeLocalName = e.type.includes('#') ? e.type.split('#').pop() : 
                           (e.type.includes('/') ? e.type.split('/').pop() : e.type);
      
      // Try local name if type is a full URI
      if (e.type.startsWith('http://') || e.type.startsWith('https://')) {
        if (typeLocalName && typeLocalName !== e.type) {
          style = edgeStyleConfig[typeLocalName];
        }
      }
      
      // Try full URI if type is a local name
      if (!style && !e.type.startsWith('http://') && !e.type.startsWith('https://')) {
        const matchingKey = Object.keys(edgeStyleConfig).find(key => {
          if (key.startsWith('http://') || key.startsWith('https://')) {
            const keyLocalName = key.includes('#') ? key.split('#').pop() : 
                               (key.includes('/') ? key.split('/').pop() : key);
            return keyLocalName === e.type;
          }
          return false;
        });
        if (matchingKey) {
          style = edgeStyleConfig[matchingKey];
        }
      }
      
      // As a last resort, try finding any key that has the same local name
      if (!style && typeLocalName && typeLocalName !== e.type) {
        const matchingKey = Object.keys(edgeStyleConfig).find(key => {
          const keyLocalName = key.includes('#') ? key.split('#').pop() : 
                             (key.includes('/') ? key.split('/').pop() : key);
          return keyLocalName === typeLocalName;
        });
        if (matchingKey) {
          style = edgeStyleConfig[matchingKey];
        }
      }
    }
    
    // If no style config found after all matching attempts, default to showing
    // This ensures edges are visible by default even if config entry is missing
    // CRITICAL: If style is undefined (no config entry found), default to showing
    // This handles cases where edge types exist in rawData but don't have config entries yet
    const shouldShow = style === undefined ? true : (style.show !== false);
    
    // Debug: Log edge-style-test edges that are being filtered
    if (e.type.includes('edge-style-test') || e.type === 'subClassOf' || e.type === 'hasProperty' || e.type === 'contains') {
      debugLog(`[DEBUG] Edge-style-test edge filtering: ${e.from} -> ${e.to} (${e.type})`, {
        hasStyle: !!style,
        styleShow: style?.show,
        shouldShow,
        configKeys: Object.keys(edgeStyleConfig).filter(k => k.includes('hasProperty') || k.includes('contains') || k === 'subClassOf'),
      });
    }
    
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
    
    // Debug: Log edge-style-test edges that are being filtered
    if (e.type.includes('edge-style-test') || e.type === 'subClassOf' || e.type === 'hasProperty' || e.type === 'contains') {
      if (!shouldShow) {
        debugWarn(`[DEBUG] Edge-style-test edge filtered out: ${e.from} -> ${e.to} (${e.type}), style:`, style);
      } else {
        debugLog(`[DEBUG] Edge-style-test edge kept: ${e.from} -> ${e.to} (${e.type}), style:`, style);
      }
    }
    
    return shouldShow;
  });
  
  // Debug: Log all edges after style filtering for edge-style-test
  const edgeStyleTestEdgesAfter = filteredEdges.filter((e) => 
    e.type.includes('edge-style-test') || e.type === 'subClassOf' || e.type === 'hasProperty' || e.type === 'contains'
  );
  if (edgeStyleTestEdgesAfter.length !== edgeStyleTestEdges.length) {
    debugWarn(`[DEBUG] Edge-style-test edges after style filtering: ${edgeStyleTestEdgesAfter.length} (was ${edgeStyleTestEdges.length})`, 
      edgeStyleTestEdgesAfter.map((e) => ({ from: e.from, to: e.to, type: e.type })));
  }
  
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
  // Classes defined by owl:equivalentClass rank below the named classes of their definition (#160), in the layout
  // and in the depth that sets font sizes.
  const definitions = session.ttlStore ? definitionParents(session.ttlStore, nodeIds) : [];
  const layoutOptions = { hierarchyTypes: canvasState.hierarchyTypes, definitions, stackLeaves: canvasState.stackLeaves };
  const definitionEdges: GraphEdge[] = canvasState.hierarchyTypes.has('subClassOf')
    ? definitions.map(({ cls, parent }) => ({ from: cls, to: parent, type: 'subClassOf' }))
    : [];
  const { depth, maxDepth } = computeNodeDepths(nodeIds, [...filteredEdges, ...definitionEdges], canvasState.hierarchyTypes);
  // Class-expression badges are sized with the display fonts (relative to their defaults); nodes by depth,
  // as they are drawn (roots follow Max, the deepest nodes Min).
  const fontSettings = { minFontSize, maxFontSize, relationshipFontSize, dataPropertyFontSize };
  const nodeCountForDefaults = session.rawData?.nodes?.length ?? 0;
  canvasState.classExpressionFontRatios = {
    ...fontSettingRatios(fontSettings, nodeCountForDefaults),
    byNode: Object.fromEntries(
      [...nodeIds].map((id) => [id, nodeFontRatio(fontSettings, depth[id] ?? 0, maxDepth, nodeCountForDefaults)]),
    ),
  };

  // The small "(defined by: …)" line above the label of imported classes and relationships (#111).
  const mainBaseForNotes = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const importedNoteBox = (n: GraphNode, fontSize: number) => {
    const text = importedNoteForNode(n, session.externalOntologyReferences, mainBaseForNotes);
    return text ? { text, fontSize: importedNoteFontSize(fontSize) } : undefined;
  };

  let nodePositions: Record<string, { x: number; y: number }> = {};
  
  // First, preserve any existing positions from rawData (loaded from config or set by drag)
  filteredNodes.forEach((n) => {
    if (n.x != null && n.y != null) {
      nodePositions[n.id] = { x: n.x, y: n.y };
    }
  });
  
  // Use layout registry for hierarchical layouts
  // Only compute positions for nodes that don't already have positions
  // An asynchronous layout (ELK, #153) shows the default layout until its own positions arrive.
  const asyncLayout = getAsyncLayoutAlgorithm(layoutMode);
  const layoutAlgorithm = getLayoutAlgorithm(layoutMode) ?? (asyncLayout ? getLayoutAlgorithm(DEFAULT_LAYOUT_MODE) : null);
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
        estimateNodeDimensions(n.label, wrapChars, fontSize, importedNoteBox(n, fontSize))
      );
    });
    
    // Compute layout for all nodes (algorithm needs full graph context)
    const computedPositions = layoutAlgorithm(
      nodeIds,
      filteredEdges,
      SPACING,
      nodeDimensions,
      layoutOptions
    );
    // The layered / relationship-aware modes produce an already-overlap-free (or
    // force-managed) layout; running resolveOverlaps would re-separate interleaved root
    // subtrees and re-inflate the width into the wide "ribbon" we are avoiding. Skip it.
    const resolvedPositions =
      SELF_CONTAINED_LAYOUT_MODES.has(layoutMode)
        ? computedPositions
        : resolveOverlaps(
            computedPositions,
            nodeIds,
            filteredEdges,
            nodeDimensions,
            { minPadding: 8 }
          );
    
    // Nodes without a position go near their placed neighbours, at the offset the layout gives them (#152).
    const fallbackSize = { width: SPACING * 0.45, height: SPACING * 0.3 };
    const sizeOf = (id: string) => nodeDimensions.get(id) ?? fallbackSize;
    const placedBefore = { ...nodePositions };
    const unsavedPositions = placeUnsavedNodes(placedBefore, resolvedPositions, filteredEdges, sizeOf);
    if (asyncLayout) {
      // Shown, not kept: the asynchronous layout's positions replace them when they arrive.
      Object.entries(unsavedPositions).forEach(([id, pos]) => {
        if (nodesToLayout.has(id)) nodePositions[id] = pos;
      });
      runAsyncLayout(asyncLayout, layoutMode, nodeIds, filteredEdges, nodeDimensions, layoutOptions, nodesToLayout, placedBefore, sizeOf, unsavedPositions);
    }
    Object.entries(asyncLayout ? {} : unsavedPositions).forEach(([id, pos]) => {
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

  const mainBaseForNodes = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
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
        externalRefs: session.externalOntologyReferences.map(r => ({ url: r.url, prefix: r.prefix, usePrefix: r.usePrefix })),
      });
    }
    // The label is just the name: an imported term's defining ontology is in the note above it, and a built-in
    // term such as owl:Thing needs no prefix (#111).
    const importedNote = importedNoteForNode(n, session.externalOntologyReferences, mainBaseForNodes);
    const displayLabel = n.label;
    
    // Apply search transparency if search query is active; external nodes use configured opacity.
    // A class declared locally but defined elsewhere (rdfs:isDefinedBy → another ontology) is
    // treated like an import: dimmed with the defining ontology's opacity.
    const isExternal = (n as GraphNode & { isExternal?: boolean; externalOntologyUrl?: string }).isExternal;
    const definedElsewhere = isDefinedElsewhere(n, mainBaseForNodes);
    const isExternalLike = !!isExternal || definedElsewhere;
    const externalUrl =
      (n as GraphNode & { externalOntologyUrl?: string }).externalOntologyUrl ??
      (definedElsewhere ? getNodeOntologyUrl(n) ?? undefined : undefined);
    const baseOpacity = isExternalLike ? getOpacityForExternalOntology(externalUrl, session.externalOntologyReferences) : 1.0;
    let nodeOpacity = baseOpacity;
    let backgroundColor = style.background;
    let borderColor = style.border;
    let fontColor = readableTextColor(style.background);
    
    if (searchQuery) {
      const searchOpacity = getSearchOpacity(n.id, matchingNodeIds, neighborNodeIds);
      nodeOpacity = isExternalLike ? searchOpacity * baseOpacity : searchOpacity;
      if (nodeOpacity < 1.0) {
        backgroundColor = applyOpacityToColor(style.background, nodeOpacity);
        borderColor = applyOpacityToColor(style.border, nodeOpacity);
        fontColor = applyOpacityToColor(readableTextColor(style.background, { opacity: nodeOpacity }), nodeOpacity);
      }
    } else if (isExternalLike) {
      backgroundColor = applyOpacityToColor(style.background, baseOpacity);
      borderColor = applyOpacityToColor(style.border, baseOpacity);
      fontColor = applyOpacityToColor(readableTextColor(style.background, { opacity: baseOpacity }), baseOpacity);
    }
    
    const node: Record<string, unknown> = {
      id: n.id,
      label: importedNote ? labelWithImportedNote(wrapText(displayLabel, wrapChars), importedNote, importedNoteWrapChars(wrapChars, fontSize)) : wrapText(displayLabel, wrapChars),
      labellableRoot: n.labellableRoot,
      color: { background: backgroundColor, border: borderColor },
      font: { size: fontSize, color: fontColor, ...(importedNote && importedNoteFont(fontSize, fontColor)) },
      ...(style.shapeProperties && { shapeProperties: style.shapeProperties }),
      ...((): { title?: string } => {
        // Lead with a source note (like external "(Imported from …)"), then the rdfs:comment.
        const extUrl = (n as GraphNode & { externalOntologyUrl?: string }).externalOntologyUrl;
        const note =
          (n as GraphNode & { isExternal?: boolean }).isExternal && extUrl
            ? `(Imported from ${extUrl})`
            : definedElsewhere && externalUrl
              ? `(Defined by ${externalUrl})`
              : undefined;
        const title = note
          ? (n.comment ? `${note}\n\n${n.comment}` : note)
          : n.comment ?? undefined;
        return title ? { title } : {};
      })(),
      ...hoverImages(n.exampleImages),
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
  
  // Track which data properties are already displayed as restrictions, keyed by class and by
  // property name on its own (a property placed by any restriction is not floating).
  const displayedAsRestriction = new Set<string>();
  const restrictedPropertyNames = new Set<string>();
  
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
    // Estimate from the label as drawn (prefix included), or imported classes come out a line short (#72).
    const note = importedNoteBox(n, fontSize);
    nodeDimensionsMap.set(n.id, estimateNodeDimensions(n.label, wrapChars, fontSize, note));
  });
  
  // Group data properties by their parent class node for better layout
  const dataPropsByClass = new Map<string, Array<{ id: string; label: string; isRestriction: boolean; propertyName: string; onDataRange?: string }>>();
  
  // First, collect all data property restrictions
  filteredNodes.forEach((n) => {
    const restrictions = n.dataPropertyRestrictions;
    if (restrictions && restrictions.length > 0) {
      if (!dataPropsByClass.has(n.id)) {
        dataPropsByClass.set(n.id, []);
      }
      restrictions.forEach((restriction) => {
        const dp = session.dataProperties.find((p) => p.name === restriction.propertyName);
        const label = dp?.label ?? restriction.propertyName;
        const cardLabel =
          restriction.minCardinality != null || restriction.maxCardinality != null
            ? ` [${restriction.minCardinality ?? 0}..${restriction.maxCardinality ?? '*'}]`
            : '';
        const dataPropNodeId = `__dataproprestrict__${n.id}__${restriction.propertyName}`;
        displayedAsRestriction.add(`${n.id}__${restriction.propertyName}`);
        restrictedPropertyNames.add(restriction.propertyName);
        dataPropsByClass.get(n.id)!.push({
          id: dataPropNodeId,
          label: label + cardLabel,
          isRestriction: true,
          propertyName: restriction.propertyName,
          onDataRange: restriction.onDataRange,
        });
      });
    }
  });
  
  // Then, collect generic data properties. Properties that assert no rdfs:domain are not attached
  // to any class here; they are drawn free-standing further below, unless a restriction already
  // puts them on a class — that restriction is an assertion, so the node is not floating.
  const unattachedDataProps = session.dataProperties.filter(
    (dp) => !dp.contextOnly && domainAttachment(dp) === 'unattached' && !restrictedPropertyNames.has(dp.name)
  );
  session.dataProperties.forEach((dp) => {
    if (dp.contextOnly) return; // declared only in an import (#104): listed in the menu, never drawn
    filteredNodes.forEach((n) => {
      if (displayedAsRestriction.has(`${n.id}__${dp.name}`)) return;
      if (!appliesToClass(dp, n.id, canvasState.clusterThingDataProperties)) return;
      
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
    // First row below the class, leaving a minimum visible edge so arrowheads stay outside it (#72).
    const baseYOffset = firstDataPropertyRowOffset(classNodeHeight, dataPropertyFontSize);
    
    let propIndex = 0;
    let currentY = classPos.y + baseYOffset;
    let rowIndex = 0;
    
    dataProps.forEach((dataProp) => {
      
      // Check if we need to start a new row
      if (propIndex > 0 && propertiesPerRow.length > 0) {
        let propsInPreviousRows = 0;
        for (let i = 0; i < rowIndex; i++) {
          propsInPreviousRows += propertiesPerRow[i];
        }
        if (propIndex >= propsInPreviousRows + propertiesPerRow[rowIndex]) {
          // Move to next row
          rowIndex++;
          currentY = classPos.y + baseYOffset + (rowIndex * (verticalOffset * 2)); // Alternate Y position
        }
      }
      
      
      // Actually, let me recalculate this more simply
      let rowStartIndex = 0;
      for (let i = 0; i < rowIndex; i++) {
        rowStartIndex += propertiesPerRow[i];
      }
      
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
      
      const dp = session.dataProperties.find((p) => p.name === dataProp.propertyName);
      
      // An unasserted rdfs:range contributes no suffix, so it cannot be read as a declared datatype.
      const rangeDisplay = describeRange(dp, dataProp.onDataRange);
      
      // Check if data property is imported and get its opacity
      // Use isDefinedBy if present, otherwise check if URI belongs to external ontology
      const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
      const isDataPropImported = dp ? (dp.isDefinedBy ? isUriFromExternalOntology(dp.uri, dp.isDefinedBy, session.externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, session.externalOntologyReferences, mainBase)) : false;
      // Get the defining ontology URL for opacity lookup
      const definingOntologyUrl = dp?.isDefinedBy || (dp?.uri ? getDefiningOntologyFromUri(dp.uri, session.externalOntologyReferences) : null);
      const baseDataPropOpacity = isDataPropImported ? getOpacityForExternalOntology(definingOntologyUrl, session.externalOntologyReferences) : 1.0;
      
      // Apply search transparency if search query is active
      // Data property nodes use imported opacity if applicable, otherwise inherit from class node
      let dataPropNodeOpacity = baseDataPropOpacity;
      let dataPropBackgroundColor = DATA_PROPERTY_FILL;
      let dataPropBorderColor = '#4a90a4';
      let dataPropFontColor = readableTextColor(DATA_PROPERTY_FILL);
      
      if (searchQuery) {
        // Full when this property matched (#81), otherwise the class node's opacity category; times the
        // base opacity if imported
        const searchOpacity = getDataPropertySearchOpacity(dataProp.propertyName, classId, searchSets, searchQuery);
        dataPropNodeOpacity = isDataPropImported ? searchOpacity * baseDataPropOpacity : searchOpacity;
        if (dataPropNodeOpacity < 1.0) {
          dataPropBackgroundColor = applyOpacityToColor(DATA_PROPERTY_FILL, dataPropNodeOpacity);
          dataPropBorderColor = applyOpacityToColor('#4a90a4', dataPropNodeOpacity);
          dataPropFontColor = applyOpacityToColor(readableTextColor(DATA_PROPERTY_FILL, { opacity: dataPropNodeOpacity }), dataPropNodeOpacity);
        }
      } else if (isDataPropImported) {
        // Apply imported opacity
        dataPropBackgroundColor = applyOpacityToColor(DATA_PROPERTY_FILL, baseDataPropOpacity);
        dataPropBorderColor = applyOpacityToColor('#4a90a4', baseDataPropOpacity);
        dataPropFontColor = applyOpacityToColor(readableTextColor(DATA_PROPERTY_FILL, { opacity: baseDataPropOpacity }), baseDataPropOpacity);
      }
      
      // Get prefix for data property if it's imported
      const dataPropPrefix = dp ? getPrefixForUri(dp.uri, dp.isDefinedBy, session.externalOntologyReferences, mainBase) : null;
      // The label is just the name: an imported property's defining ontology is in the note above it (#111).
      const dataPropNote = importedNoteForDataProperty(dp, session.externalOntologyReferences, mainBase);
      const dataPropDisplayLabel = dataProp.label;
      
      // A data property whose domain/range is an anonymous class expression is marked with a small
      // badge (∪ ∩ ¬ {}) overlapping its stub node (classExpressionOverlayRenderer, which owns the
      // hover/click too) — the label stays the plain property name, so nothing is added here. #59-#62
      // Format the node label as "prefix:property label (datatype)" - e.g., "dpbase:createdDate (xsd:dateTime)"
      const nodeLabel = `${dataPropDisplayLabel}${rangeDisplay.labelSuffix}`;
      
      // Build tooltip: include comment if present, and add import hint if imported
      let tooltip = dp?.comment || '';
      if (dp?.rangeExpression) {
        tooltip = tooltip ? `${tooltip}\n\nRange: ${dp.rangeExpression}` : `Range: ${dp.rangeExpression}`;
      }
      if (rangeDisplay.source !== 'asserted') {
        tooltip = tooltip ? `${tooltip}\n\n${rangeDisplay.tooltipNote}` : rangeDisplay.tooltipNote;
      }
      if (isDataPropImported && definingOntologyUrl) {
        const importHint = `(Imported from ${definingOntologyUrl})`;
        tooltip = tooltip ? `${tooltip}\n\n${importHint}` : importHint;
      }

      // Debug: Log the actual label being set for the node
      debugLog(`[DEBUG] Setting data property node label: propertyName="${dataProp.propertyName}", classId="${classId}", nodeLabel="${nodeLabel}", prefix="${dataPropPrefix}", isImported="${isDataPropImported}", tooltip="${tooltip}"`);
        
      const dataPropNode: Record<string, unknown> = {
        id: dataProp.id,
        label: dataPropNote ? labelWithImportedNote(wrapText(nodeLabel, wrapChars), dataPropNote, importedNoteWrapChars(wrapChars, dataPropertyFontSize)) : wrapText(nodeLabel, wrapChars),
        shape: 'box',
        size: 15,
        color: { background: dataPropBackgroundColor, border: dataPropBorderColor },
        font: { size: dataPropertyFontSize, color: dataPropFontColor, ...(dataPropNote && importedNoteFont(dataPropertyFontSize, dataPropFontColor)) },
        margin: 4,
        physics: false,
        x: finalDataPropPos.x,
        y: finalDataPropPos.y,
        ...(tooltip && { title: tooltip }),
        ...hoverImages(dp?.exampleImages),
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
        // Same as the box it leads to (#81)
        const dataPropEdgeOpacity = getDataPropertySearchOpacity(dataProp.propertyName, classId, searchSets, searchQuery);
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

  // Data properties that assert no rdfs:domain belong to no class, so they get their own band below
  // the graph with no edge to anything. Drawing them on a class would state a domain the ontology
  // never asserted - which is how a domainless property used to end up hanging off skos:Concept.
  if (unattachedDataProps.length > 0) {
    const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
    const entries = unattachedDataProps.map((dp) => {
      const rangeDisplay = describeRange(dp);
      const note = importedNoteForDataProperty(dp, session.externalOntologyReferences, mainBase);
      const label = `${dp.label}${rangeDisplay.labelSuffix}`;
      const definingOntologyUrl = dp.isDefinedBy || (dp.uri ? getDefiningOntologyFromUri(dp.uri, session.externalOntologyReferences) : null);
      const isImported = isUriFromExternalOntology(dp.uri, dp.isDefinedBy ?? null, session.externalOntologyReferences, mainBase);
      const notes = [
        rangeDisplay.source === 'asserted' ? null : rangeDisplay.tooltipNote,
        UNATTACHED_DOMAIN_NOTE,
        isImported && definingOntologyUrl ? `(Imported from ${definingOntologyUrl})` : null,
      ];
      const tooltip = [dp.comment || null, ...notes].filter(Boolean).join('\n\n');
      // These nodes stand outside the class graph, so they have no class to take a search category
      // or an external-ontology fade from - both have to be resolved from the property itself.
      const importedOpacity = isImported
        ? getOpacityForExternalOntology(definingOntologyUrl, session.externalOntologyReferences)
        : 1.0;
      const opacity =
        getDataPropertySearchOpacity(dp.name, null, searchSets, searchQuery) * importedOpacity;
      return { dp, label, tooltip, opacity, note };
    });

    const classPositions = filteredNodes
      .map((n) => (n.x != null && n.y != null ? { x: n.x, y: n.y } : nodePositions[n.id]))
      .filter((p): p is { x: number; y: number } => !!p);
    // Measure the label as it is drawn - wrapped - not by its raw character count. A label wrapping
    // to three lines was being laid out as one long, one-line-tall box, which both inflated the
    // widths (forcing rows earlier than needed) and let the rows it created overlap vertically.
    const dimensions = entries.map((e) =>
      estimateNodeDimensions(e.label, wrapChars, dataPropertyFontSize, e.note ? { text: e.note, fontSize: importedNoteFontSize(dataPropertyFontSize) } : undefined)
    );
    const positions = layoutUnattachedNodes(
      dimensions.map((d) => d.width),
      boundsOf(classPositions),
      { rowSpacing: rowSpacingFor(dimensions.map((d) => d.height)) }
    );

    entries.forEach((entry, i) => {
      const pos = positions[i];
      const faded = entry.opacity < 1.0;
      dataPropertyNodes.push({
        id: unattachedDataPropertyNodeId(entry.dp.name),
        label: entry.note ? labelWithImportedNote(wrapText(entry.label, wrapChars), entry.note, importedNoteWrapChars(wrapChars, dataPropertyFontSize)) : wrapText(entry.label, wrapChars),
        shape: 'box',
        size: 15,
        color: {
          background: faded ? applyOpacityToColor(DATA_PROPERTY_FILL, entry.opacity) : DATA_PROPERTY_FILL,
          border: faded ? applyOpacityToColor('#4a90a4', entry.opacity) : '#4a90a4',
        },
        font: ((color: string) => ({
          size: dataPropertyFontSize,
          color,
          ...(entry.note && importedNoteFont(dataPropertyFontSize, color)),
        }))(
          faded
            ? applyOpacityToColor(readableTextColor(DATA_PROPERTY_FILL, { opacity: entry.opacity }), entry.opacity)
            : readableTextColor(DATA_PROPERTY_FILL)
        ),
        margin: 4,
        physics: false,
        // Dashed border marks these as unattached, matching the absence of a connecting edge.
        shapeProperties: { borderDashes: [4, 3] },
        x: pos.x,
        y: pos.y,
        ...(faded && { opacity: entry.opacity }),
        ...(entry.tooltip && { title: entry.tooltip }),
        ...hoverImages(entry.dp.exampleImages),
      });
    });
  }

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
    const edgeComment = getRelationshipComment(e.type, session.objectProperties);
    // Relationships defined in another ontology carry the same small note as imported classes (#111).
    const importedEdgeNote = style.showLabel ? importedNoteForRelationship(e.type, session.objectProperties, session.externalOntologyReferences, mainBaseForNotes) : null;
    const edgeLabelText = style.showLabel ? getEdgeDisplayLabel(e, session.objectProperties, session.externalOntologyReferences) : '';
    
    // Styling based on whether edge is from restriction or domain/range
    // Thick continuous line for restrictions, thin dashed line for normal object properties
    const isRestriction = e.isRestriction ?? false;
    const width = isRestriction ? 3 : 1; // Thick for restrictions, thin for normal
    const dashes = isRestriction ? false : [5, 5]; // Continuous for restrictions, dashed for normal
    
    // Apply search transparency if search query is active
    let edgeColor = style.color;
    let edgeFontColor = '#2c3e50';
    // Solid light-grey box behind the label, 50% opacity — dimmed with the edge under search.
    let labelBgAlpha = 0.5;

    if (searchQuery) {
      // An edge is full-opacity only when it matched directly or joins two matched nodes.
      // Edges merely departing from a matched node toward a non-neighbour are dimmed; edges
      // to first-ring neighbours are shown dimmed-but-visible only in the neighbours scope.
      const edgeOpacity = getEdgeSearchOpacity(
        e.from,
        e.to,
        e.type,
        searchSets,
        scopeIncludesNeighbours(filter.searchScope)
      );
      if (edgeOpacity < 1.0) {
        edgeColor = applyOpacityToColor(style.color, edgeOpacity);
        edgeFontColor = applyOpacityToColor('#2c3e50', edgeOpacity);
        labelBgAlpha = 0.5 * edgeOpacity;
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
      label: importedEdgeNote ? labelWithImportedNote(edgeLabelText, importedEdgeNote) : edgeLabelText,
      font: {
        size: relationshipFontSize,
        color: edgeFontColor,
        ...(importedEdgeNote && importedNoteFont(relationshipFontSize, edgeFontColor)),
        ...(style.showLabel && { background: `rgba(${RELATIONSHIP_LABEL_BG_RGB}, ${labelBgAlpha})` }),
      },
      color: { color: edgeColor, highlight: edgeColor },
      dashes,
      width,
      ...(edgeComment && { title: edgeComment }),
      ...hoverImages(session.objectProperties.find((p) => p.name === e.type)?.exampleImages),
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
  // CRITICAL: Also check for format variations (URI vs local name) to catch duplicates
  const edgeMap = new Map<string, Record<string, unknown>>();
  const seenEdgeKeys = new Set<string>();
  
  edges.forEach((edgeObj) => {
    const edgeId = edgeObj.id as string;
    const from = edgeObj.from as string;
    const to = edgeObj.to as string;
    // Extract type from edge ID if not present in edge object
    // Edge ID format: `${from}->${to}:${type}`
    let type = (edgeObj as { type?: string }).type as string;
    if (!type && edgeId.includes(':')) {
      const parts = edgeId.split(':');
      if (parts.length > 1) {
        type = parts.slice(1).join(':'); // Handle types that contain colons
      }
    }
    
    // Build all possible keys for this edge (accounting for URI/local name variations)
    const keys = new Set<string>();
    keys.add(edgeId); // Exact match
    keys.add(`${from}->${to}:${type}`); // Also add without the exact ID format
    
    // Extract local names for from/to
    const fromLocal = from.includes('#') ? from.split('#').pop() : from.includes('/') ? from.split('/').pop() : from;
    const toLocal = to.includes('#') ? to.split('#').pop() : to.includes('/') ? to.split('/').pop() : to;
    
    // Add variations with op.uri and op.name
    const op = session.objectProperties.find((p) => p.name === type || p.uri === type);
    if (op) {
      if (op.name && op.name !== type) {
        keys.add(`${from}->${to}:${op.name}`);
        if (fromLocal !== from) keys.add(`${fromLocal}->${to}:${op.name}`);
        if (toLocal !== to) keys.add(`${from}->${toLocal}:${op.name}`);
        if (fromLocal !== from && toLocal !== to) keys.add(`${fromLocal}->${toLocal}:${op.name}`);
      }
      if (op.uri && op.uri !== type) {
        keys.add(`${from}->${to}:${op.uri}`);
        if (fromLocal !== from) keys.add(`${fromLocal}->${to}:${op.uri}`);
        if (toLocal !== to) keys.add(`${from}->${toLocal}:${op.uri}`);
        if (fromLocal !== from && toLocal !== to) keys.add(`${fromLocal}->${toLocal}:${op.uri}`);
      }
    }
    
    // Add variations for from/to using local names
    if (fromLocal !== from) {
      keys.add(`${fromLocal}->${to}:${type}`);
      if (op) {
        if (op.name) keys.add(`${fromLocal}->${to}:${op.name}`);
        if (op.uri) keys.add(`${fromLocal}->${to}:${op.uri}`);
      }
    }
    if (toLocal !== to) {
      keys.add(`${from}->${toLocal}:${type}`);
      if (op) {
        if (op.name) keys.add(`${from}->${toLocal}:${op.name}`);
        if (op.uri) keys.add(`${from}->${toLocal}:${op.uri}`);
      }
    }
    if (fromLocal !== from && toLocal !== to) {
      keys.add(`${fromLocal}->${toLocal}:${type}`);
      if (op) {
        if (op.name) keys.add(`${fromLocal}->${toLocal}:${op.name}`);
        if (op.uri) keys.add(`${fromLocal}->${toLocal}:${op.uri}`);
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
      edgeMap.set(edgeId, edgeObj as Record<string, unknown>);
    } else {
      // Duplicate edge found - log it
      debugWarn('Duplicate edge detected (format variation):', edgeId, edgeObj);
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

setTermUriResolver((kind, id) => resolveTerm(kind, id)?.uri ?? null);
setVersionPinnedUriResolver((kind, id) =>
  versionPinnedUri(resolveTerm(kind, id)?.uri ?? null, session.ttlStore ? readOntologyVersion(session.ttlStore) : null)
);

function setupNetworkSelectionAndNavigation(
  net: Network,
  container: HTMLElement
): void {
  // Draw anonymous class-expression marks (∪ ∩ ¬ {}) on top of the graph.
  const classExprMarks = attachClassExpressionMarks(
    net as unknown as Parameters<typeof attachClassExpressionMarks>[0],
    () => session.rawData?.classExpressions ?? [],
    () => canvasState.classExpressionFontRatios,
  );
  // Edge lines stop at node outlines, even under semi-transparent (imported) nodes (#71).
  hideEdgeLinesUnderNodes(net);
  // A pulsing outline around what the search matched, in an SVG layer that follows the view (#84).
  attachSearchOutline(net as unknown as Parameters<typeof attachSearchOutline>[0], container, () => canvasState.searchOutlineTargets);
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
      // Check if clicking on a node or edge (line, or — falling back — the edge's label box)
      const nodeAt = net.getNodeAt(coords);
      const edgeAt = net.getEdgeAt(coords) ?? (nodeAt == null ? getEdgeIdAtLabelPoint(net, coords) : null);

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
      hideCanvasTooltip(true);
      return;
    }

    // One tooltip for whatever is under the cursor: edge label, class-expression mark, node or edge line (#109).
    const target = e.target as Node;
    const overContainer =
      container.contains(target) || (container.querySelector('canvas')?.contains(target) ?? false);
    if (!overContainer) {
      hideCanvasTooltip();
      return;
    }
    const body = (net as unknown as { body?: { nodes?: Record<string, { options?: { title?: unknown } }>; edges?: Record<string, { options?: { title?: unknown } }> } }).body;
    const titleOf = (item: { options?: { title?: unknown } } | undefined) =>
      typeof item?.options?.title === 'string' ? item.options.title : null;
    // The example images (#142) are kept on the data records, which vis-network does not copy into its options.
    const records = (net as unknown as { body?: { data?: Record<'nodes' | 'edges', { get(id: string): { exampleImages?: string[] } | null }> } }).body?.data;
    const contentOf = (kind: 'nodes' | 'edges', id: string) => ({
      text: titleOf(body?.[kind]?.[id]) ?? '',
      images: records?.[kind]?.get(id)?.exampleImages,
    });
    const labelEdgeId = getEdgeIdAtLabelPoint(net, coords);
    const nodeId = net.getNodeAt(coords);
    const lineEdgeId = nodeId === undefined ? net.getEdgeAt(coords) : undefined;
    const content = pickTooltip({
      edgeLabel: labelEdgeId ? contentOf('edges', labelEdgeId) : null,
      // A class-expression mark (∪ ∩ ¬ {}) or connector explains the expression and how to edit it.
      expressionMark: classExprMarks.tooltipAt(net.DOMtoCanvas(coords)),
      node: nodeId !== undefined ? contentOf('nodes', String(nodeId)) : null,
      edgeLine: lineEdgeId !== undefined ? contentOf('edges', String(lineEdgeId)) : null,
    });
    if (content) showCanvasTooltip(content, e.clientX, e.clientY);
    else hideCanvasTooltip();
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
      
      // Check if we were panning (rightPanStart exists) or if we should show context menu.
      // In read-only embedded mode the menu is reduced to the read-only "Copy URI".
      if (!rightPanStart && isInContainer) {
        // Show context menu; use node/edge stored at mousedown so target is exact (e.g. data property node)
        showContextMenu(e, net, container, rightClickNodeId, rightClickEdgeId, { copyOnly: isEmbedded() });
      }
      rightPanStart = null;
      rightClickNodeId = null;
      rightClickEdgeId = null;
    }
  };

  const handleMouseLeave = () => {
    rightPanStart = null;
    hideCanvasTooltip();
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
    if (!canvasState.network) return;
    const target = e.target as HTMLElement;
    // When clicking Add node button, let vis-network's manipulation UI handle it
    // It will call our addNode handler when canvas is clicked
    if (target.closest?.('.vis-add')) {
      editState.addNodeMode = true;
      // Don't prevent default - let vis-network handle it
      return;
    }
    // Don't interfere with manipulation UI unless we're in add node mode
    if (target.closest?.('.vis-manipulation') && !editState.addNodeMode) return;
    
    // Only handle clicks on the canvas itself when in add node mode
    if (!editState.addNodeMode) return;
    
    // Check if click is on the network canvas (not on UI elements)
    // Allow clicks on the network container or its children
    const isNetworkClick = container.contains(target) || target.closest('#network') || target.id === 'network';
    if (!isNetworkClick) return;
    
    const rect = container.getBoundingClientRect();
    const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const nodeAt = net.getNodeAt(domPos);
    if (nodeAt != null) {
      // Clicked on a node, exit add node mode
      editState.addNodeMode = false;
      return;
    }
    const canvasPos = net.DOMtoCanvas(domPos);
    showAddNodeModal(canvasPos.x, canvasPos.y);
    editState.addNodeMode = false; // Reset after showing modal
  };

  const handleNativeDblclick = (e: MouseEvent) => {
    if (!session.ttlStore || !canvasState.network) return;
    // Embedded mode is read-only: no edit modals, and no create-node on empty-canvas double-click.
    if (isEmbedded()) return;
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
    const edgeAt = net.getEdgeAt(domPos) ?? getEdgeIdAtLabelPoint(net, domPos);
    if (edgeAt != null) {
      openEditModalForEdge(String(edgeAt));
      return;
    }
    const canvasPos = net.DOMtoCanvas(domPos);
    showAddNodeModal(canvasPos.x, canvasPos.y);
  };

  container.addEventListener('click', handleNativeClick, true);
  container.addEventListener('dblclick', handleNativeDblclick, true);

  net.on('click', (params: { nodes: string[]; edges: string[]; pointer?: { DOM?: { x: number; y: number } }; event?: { srcEvent?: MouseEvent } }) => {
    const clickedNode = params.nodes[0] as string | undefined;
    const ctrlKey = params.event?.srcEvent?.ctrlKey ?? false;

    // A click on a class-expression mark opens its details. Checked before node handling so a
    // data-property badge (which overlaps its stub node) wins over selecting the node underneath.
    if (!editState.addNodeMode && container) {
      let dom = params.pointer?.DOM ?? null;
      if (!dom && params.event?.srcEvent) {
        const rect = container.getBoundingClientRect();
        dom = { x: params.event.srcEvent.clientX - rect.left, y: params.event.srcEvent.clientY - rect.top };
      }
      if (dom && classExprMarks.openAt(net.DOMtoCanvas(dom))) return;
    }

    // If in add node mode and no node clicked, show the add node modal
    if (editState.addNodeMode && !clickedNode) {
      const srcEvent = params.event?.srcEvent;
      const pointer = params.pointer;

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
    if (editState.addNodeMode && clickedNode) {
      editState.addNodeMode = false;
      return;
    }

    // If not in add node mode and no node clicked: vis-network selects an edge only when its line
    // is clicked, so if nothing was hit, try selecting an edge by its label box.
    if (!clickedNode) {
      if ((params.edges?.length ?? 0) === 0) {
        // vis-network exposes the pointer at params.pointer.DOM (container-relative). Fall back to
        // the raw source event if needed.
        let domPos = params.pointer?.DOM ?? null;
        if (!domPos && params.event?.srcEvent && container) {
          const rect = container.getBoundingClientRect();
          domPos = { x: params.event.srcEvent.clientX - rect.left, y: params.event.srcEvent.clientY - rect.top };
        }
        if (domPos) {
          const edgeId = getEdgeIdAtLabelPoint(net, domPos);
          if (edgeId) {
            net.setSelection({ nodes: [], edges: [edgeId] }, { unselectAll: true, highlightEdges: true });
            updateSelectionInfoDisplay(net);
          }
          // (A union-mark click was already handled before node selection, above.)
        }
      }
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


// hideRenameModal moved to ui/modals.ts



function confirmAddNode(): void {
  if (!editState.pendingAddNodePosition) return;
  const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
  const customTabContent = document.getElementById('addNodeCustomTab');
  const isCustomTab = customTabContent && customTabContent.style.display !== 'none';
  const dupErr = document.getElementById('addNodeDuplicateError') as HTMLElement;
  const extDupErr = document.getElementById('addNodeExternalDuplicateError') as HTMLElement;

  const { x, y } = editState.pendingAddNodePosition;

  if (isCustomTab) {
    const label = customInput?.value?.trim();
    if (!label) return;
    if (!session.ttlStore) return;
    const displayLabel = label.trim() || 'New class';
    const id = addNodeToStore(session.ttlStore, displayLabel);
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
    session.rawData.nodes.push(node);
    const commentInput = document.getElementById('addNodeComment') as HTMLTextAreaElement;
    const newComment = commentInput?.value?.trim() ?? '';
    const annotationValues: Record<string, boolean | string | null> = {};
    session.annotationProperties.forEach((ap) => {
      if (ap.isBoolean) {
        const checkbox = document.getElementById(`addNodeAnnotProp_${ap.name}`) as HTMLInputElement;
        annotationValues[ap.name] = checkbox ? (checkbox.indeterminate ? null : checkbox.checked) : null;
      }
    });
    const addNodeFormData: NodeFormData = {
      comment: newComment,
      annotationValues,
      textualAnnotationValues: { ...editState.addNodeAnnotationValues },
      dataPropertyRestrictions: editState.addNodeDataPropertyRestrictions,
    };
    const baseIri = getClassNamespace(session.ttlStore) ?? getMainOntologyBase(session.ttlStore) ?? BASE_IRI;
    applyNodeFormToStore(id, addNodeFormData, session.ttlStore, node, baseIri, session.annotationProperties);
    pushUndoable(
      () => {
        for (const r of addNodeFormData.dataPropertyRestrictions) {
          removeDataPropertyRestrictionFromClass(session.ttlStore!, id, r.propertyName);
        }
        removeNodeFromStore(session.ttlStore!, id);
        const i = session.rawData.nodes.findIndex((n) => n.id === id);
        if (i >= 0) session.rawData.nodes.splice(i, 1);
      },
      () => {
        addNodeToStore(session.ttlStore!, displayLabel, id);
        session.rawData.nodes.push(node);
        applyNodeFormToStore(id, addNodeFormData, session.ttlStore!, node, baseIri, session.annotationProperties);
      }
    );
    fileState.hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    applyFilter(true);
    hideAddNodeModalWithCleanup();
    return;
  }

  // Add from external ontology: add as external node (correct opacity/tooltip), not a new local class
  if (!editState.selectedExternalClass || !session.ttlStore) return;
  session.knownExternalClassUris.add(editState.selectedExternalClass.uri);
  const label = editState.selectedExternalClass.label;
  const uri = editState.selectedExternalClass.uri;

  const existingIds = new Set((session.currentGraphDataForBuild?.nodes ?? session.rawData.nodes).map((n) => n.id));
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
    externalOntologyUrl: editState.selectedExternalClass.ontologyUrl,
    comment: editState.selectedExternalClass.comment
      ? `${editState.selectedExternalClass.comment}\n\n(Imported from ${editState.selectedExternalClass.ontologyUrl})`
      : `(Imported from ${editState.selectedExternalClass.ontologyUrl})`,
    ...(x != null && y != null && { x, y }),
  };
  session.userAddedExternalNodes.push(externalNode);
  if (canvasState.loadedNodePositions) {
    canvasState.loadedNodePositions[uri] = { x: x ?? 0, y: y ?? 0 };
  } else {
    canvasState.loadedNodePositions = { [uri]: { x: x ?? 0, y: y ?? 0 } };
  }
  applyFilter(true);
  hideAddNodeModalWithCleanup();
}

// Relationship utility functions moved to ui/relationshipUtils.ts


/** Open the appropriate edit modal for a node (class rename, data property restriction, or normal data property). */
function openEditModalForNode(nodeId: string): void {
  // Handle data property restriction nodes
  if (nodeId.startsWith('__dataproprestrict__')) {
    const match = nodeId.match(/^__dataproprestrict__(.+)__(.+)$/);
    if (match) {
      const [, classId] = match;
      showEditEdgeModal(nodeId, classId, 'dataprop');
      return;
    }
  }
  // Handle normal data property nodes (not restrictions)
  if (nodeId.startsWith('__dataprop__')) {
    const match = nodeId.match(/^__dataprop__(.+)__(.+)$/);
    if (match) {
      const [, , propertyName] = match;
      showEditDataPropertyModal(propertyName);
      return;
    }
  }
  // Handle regular class nodes
  const node = session.rawData.nodes.find((n) => n.id === nodeId);
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
  const cardWrap = document.getElementById('editEdgeCardinalityWrap')!;
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;

  // Cleared up-front; each branch re-shows it if this edge's domain belongs to a union (owl:unionOf).
  showEditEdgeClassExpressionNotice(modal, null);
  // Likewise the restriction detail, which also unlocks a form a read-only restriction locked (#63).
  showEditEdgeRestrictionNotice(modal, null, '');

  const isDataPropertyEdge = edgeType === 'dataprop';

  if (isDataPropertyEdge) {
    // For data property edges, parse the data property node ID to get the class and property
    // Handle both restriction nodes (__dataproprestrict__) and generic property nodes (__dataprop__)
    let match = edgeFrom.match(/^__dataproprestrict__(.+)__(.+)$/);
    if (!match) {
      match = edgeFrom.match(/^__dataprop__(.+)__(.+)$/);
      // For normal data properties (not restrictions), open the "Edit Data Property" modal instead
      if (match) {
        const [, , propertyName] = match;
        hideEditEdgeModalWithCleanup();
        showEditDataPropertyModal(propertyName);
        return;
      }
      hideEditEdgeModalWithCleanup();
      return;
    }
    const [, classId, propertyName] = match;

    showEditEdgeClassExpressionNotice(modal, findClassExpressionGroupForEdge(session.rawData.classExpressions, classId, classId, propertyName));

    modal.dataset.mode = 'edit';
    modal.dataset.oldFrom = edgeFrom;
    modal.dataset.oldTo = edgeTo;
    modal.dataset.oldType = edgeType;
    modal.dataset.dataPropertyName = propertyName;
    modal.dataset.classId = classId;
    
    const classNode = session.rawData.nodes.find((n) => n.id === classId);
    const restriction = classNode?.dataPropertyRestrictions?.find((r) => r.propertyName === propertyName);
    
    // For data properties, show the data property name and class, but disable editing
    fromSel.disabled = true;
    toSel.disabled = true;
    const typeInput = document.getElementById('editEdgeType') as HTMLInputElement;
    if (typeInput) {
      typeInput.disabled = true;
      typeInput.value = 'dataprop (data property)';
      editState.selectedEdgeType = 'dataprop';
      editState.selectedExternalObjectProperty = null;
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
    const dp = session.dataProperties.find((p) => p.name === propertyName);
    const dpLabel = dp?.label ?? propertyName;
    fromSel.innerHTML = `<option value="${edgeFrom}" selected>${dpLabel} (data property)</option>`;
    toSel.innerHTML = session.rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${n.label}</option>`).join('');
    
    
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
    const isThisEdge = (e: GraphEdge) => e.from === edgeFrom && e.to === edgeTo && e.type === edgeType;
    let allMatchingEdges = session.rawData.edges.filter(isThisEdge);
    // An edge only the external expansion draws (#99)
    if (allMatchingEdges.length === 0) allMatchingEdges = session.currentGraphDataForBuild?.edges.filter(isThisEdge) ?? [];
    
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
        allEdgesWithType: session.rawData.edges.filter((e) => e.type === edgeType).slice(0, 5),
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
    
    const nodesForDropdown = session.currentGraphDataForBuild?.nodes ?? session.rawData.nodes;
    fromSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === edgeFrom ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, session.externalOntologyReferences)}</option>`).join('');
    toSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, session.externalOntologyReferences)}</option>`).join('');
    if (typeInputEdit) {
      const label = getRelationshipLabel(edgeType, session.objectProperties, session.externalOntologyReferences);
      // Find property by name, URI, or full URI string (edgeType might be local name or full URI for imported properties)
      // Try multiple matching strategies:
      // 1. Exact match by name
      // 2. Exact match by URI
      // 3. If edgeType is a local name, check if any property's URI ends with it
      // 4. If edgeType is a full URI, check if any property's URI matches it
      let op = session.objectProperties.find((p) => p.name === edgeType || p.uri === edgeType);
      if (!op && !edgeType.startsWith('http')) {
        // edgeType is likely a local name, try to find by URI ending
        op = session.objectProperties.find((p) => {
          if (!p.uri) return false;
          const uriLocalName = p.uri.includes('#') ? p.uri.split('#').pop() : p.uri.split('/').pop();
          return uriLocalName === edgeType || p.uri.endsWith('#' + edgeType) || p.uri.endsWith('/' + edgeType);
        });
      }
      if (!op && edgeType.startsWith('http')) {
        // edgeType is a full URI, try to find by URI matching
        op = session.objectProperties.find((p) => {
          if (!p.uri) return false;
          return p.uri === edgeType || edgeType.includes(p.uri) || p.uri.includes(edgeType);
        });
      }
      const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
      const displayLabel = formatRelationshipLabelWithPrefix(edgeType, label, session.externalOntologyReferences, op, mainBase);
      typeInputEdit.value = displayLabel;
      editState.selectedEdgeType = edgeType;
      editState.selectedExternalObjectProperty = null;
    }

    // Debug: Log edge lookup for troubleshooting
    debugLog('[DEBUG] showEditEdgeModal - edge lookup:', {
      edgeFrom,
      edgeTo,
      edgeType,
      foundEdge: edge,
      allMatchingEdges: session.rawData.edges.filter((e) => e.from === edgeFrom && e.to === edgeTo && e.type === edgeType),
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

    // Locked from where the parser drew the edge, not from whether a mark is drawn for it (#58).
    const propertyLabel = getRelationshipLabel(edgeType, session.objectProperties, session.externalOntologyReferences);
    const lock = edge ? edgeLock(edge) : null;
    const lockedByExpression = lock === 'classExpression';
    showEditEdgeClassExpressionNotice(
      modal,
      findClassExpressionGroupForEdge(session.rawData.classExpressions, edgeFrom, edgeTo, edgeType),
      lockedByExpression ? propertyLabel : undefined,
    );
    showEditEdgeRestrictionNotice(modal, edge ?? null, propertyLabel, lockedByExpression || lock === 'externalTarget');

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
  if (editState.selectedExternalObjectProperty) {
    newType = editState.selectedExternalObjectProperty.uri; // Use full URI for external properties
  } else if (editState.selectedEdgeType) {
    newType = editState.selectedEdgeType;
  } else if (typeInput?.value.trim()) {
    // Try to find in local types
    const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
    const found = getAllEdgeTypes(session.rawData, session.objectProperties).find(t => {
      const label = getRelationshipLabel(t, session.objectProperties, session.externalOntologyReferences);
      const op = session.objectProperties.find((p) => p.name === t || p.uri === t);
      const displayLabel = formatRelationshipLabelWithPrefix(t, label, session.externalOntologyReferences, op, mainBase);
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

  if (mode === 'add' && editState.pendingAddEdgeData) {
    const { from, to, callback } = editState.pendingAddEdgeData;
    if (!session.ttlStore) {
      hideEditEdgeModalWithCleanup();
      return;
    }
    
    // Get isRestriction checkbox value - cardinality only applies to restrictions
    const isRestrictionCb = document.getElementById('editEdgeIsRestriction') as HTMLInputElement;
    const isRestriction = isRestrictionCb?.checked ?? false;
    
    // Only include cardinality if this is a restriction
    const card = isRestriction ? cardinality : undefined;
    const ok = addEdgeToStore(session.ttlStore, from, to, newType, card);
    if (!ok) {
      alert('Failed to add edge. An edge may already exist between these nodes.');
      hideEditEdgeModalWithCleanup();
      return;
    }

    // Use canonical type (URI when available) so rawData key matches expandWithExternalRefs and we don't get duplicate edges
    const op = session.objectProperties.find((p) => p.name === newType || p.uri === newType);
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
    session.rawData.edges.push(newEdge);
    
    // If this is an external object property, add it to objectProperties array
    if (editState.selectedExternalObjectProperty) {
      const existing = session.objectProperties.find((o) => o.name === newType);
      if (!existing) {
        session.objectProperties.push({
          name: newType, // Store the full URI as the name
          label: editState.selectedExternalObjectProperty.label,
          hasCardinality: editState.selectedExternalObjectProperty.hasCardinality ?? true,
          comment: editState.selectedExternalObjectProperty.comment || null,
        });
        session.objectProperties.sort((a, b) => a.name.localeCompare(b.name));
        // Re-initialize the edge styles menu to include the new property
        const edgeStylesContent = document.getElementById('edgeStylesContent');
        if (edgeStylesContent) {
          initEdgeStylesMenu(edgeStylesContent, applyFilter);
        }
      }
      editState.selectedExternalObjectProperty = null;
    }
    pushUndoable(
      () => {
        try {
          removeEdgeFromStore(session.ttlStore!, from, to, newType);
        } catch (err) {
          console.warn(`Undo: Failed to remove edge from store: ${err instanceof Error ? err.message : String(err)}`);
        }
        const i = session.rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === canonicalType);
        if (i >= 0) session.rawData.edges.splice(i, 1);
      },
      () => {
        addEdgeToStore(session.ttlStore!, from, to, newType, card);
        session.rawData.edges.push(newEdge);
      }
    );
    fileState.hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    callback({ from, to, id: `${from}->${to}:${canonicalType}` });
    editState.pendingAddEdgeData = null;
    hideEditEdgeModalWithCleanup();
    // Clean up unused external properties and update edge styles menu
    session.objectProperties = cleanupUnusedExternalProperties(session.rawData, session.objectProperties);
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
    const classNode = session.rawData.nodes.find((n) => n.id === classId);
    const restriction = classNode?.dataPropertyRestrictions?.find((r) => r.propertyName === propertyName);
    
    if (!session.ttlStore || !classNode || !restriction) {
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
    removeDataPropertyRestrictionFromClass(session.ttlStore, classId, propertyName);
    addDataPropertyRestrictionToClass(session.ttlStore, classId, propertyName, { minCardinality: newMin ?? undefined, maxCardinality: newMax ?? undefined }, restriction.onDataRange);
    
    // Update in rawData
    const nodeIndex = session.rawData.nodes.findIndex((n) => n.id === classId);
    if (nodeIndex >= 0) {
      session.rawData.nodes[nodeIndex].dataPropertyRestrictions = getDataPropertyRestrictionsForClass(session.ttlStore, classId);
    }
    
    fileState.hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    hideEditEdgeModalWithCleanup();
    applyFilter(true);
    return;
  }
  
  const newFrom = fromSel.value;
  const newTo = toSel.value;
  const oldEdge = findShownEdge(oldFrom, oldTo, oldType);
  // A read-only edge (the form is locked, but Enter could still submit): never write it back (#58, #63).
  if (oldEdge && edgeLock(oldEdge)) {
    hideEditEdgeModalWithCleanup();
    return;
  }
  
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
  if (!session.ttlStore || sameEdge) {
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
      removeRestrictionFromStore(session.ttlStore, oldFrom, oldTo, oldType);
      onlyRemovedRestriction = true;
    } else if (!oldWasRestriction && isRestriction && !isChangingEdge) {
      // Checking "is restriction" on existing domain/range edge (not changing from/to/type)
      // Don't remove anything - domain/range already exists, we just need to add restriction
      onlyRemovedRestriction = true; // No removal needed, but domain/range exists
      // Skip removal - nothing to remove
    } else if (isChangingEdge || (oldWasRestriction && isRestriction)) {
      // Changing from/to/type OR changing restriction properties - remove edge completely
      removeEdgeFromStore(session.ttlStore, oldFrom, oldTo, oldType);
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
        addRestrictionToStore(session.ttlStore, newFrom, newTo, newType, card);
      } catch (err) {
        // If restriction addition fails (e.g., domain/range doesn't exist), try adding complete edge
        const addOk = addEdgeToStore(session.ttlStore, newFrom, newTo, newType, card);
        if (!addOk) {
          // Restore the old restriction if adding new one failed
          if (oldWasRestriction) {
            try {
              addRestrictionToStore(session.ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
            } catch {
              addEdgeToStore(session.ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
            }
          }
          alert('Failed to update edge.');
          hideEditEdgeModalWithCleanup();
          return;
        }
      }
    } else {
      // Removed edge completely or changing from/to/type - need to add complete edge (domain/range + restriction)
      const addOk = addEdgeToStore(session.ttlStore, newFrom, newTo, newType, card);
      if (!addOk) {
        // Restore the old restriction if adding new one failed
        if (oldWasRestriction) {
          try {
            addRestrictionToStore(session.ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
          } catch {
            // If restoration fails, try adding complete edge
            addEdgeToStore(session.ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
          }
        }
        alert('Failed to update edge.');
        hideEditEdgeModalWithCleanup();
        return;
      }
    }
  }
  
  // Update rawData - remove old edge and add new one
  const idx = session.rawData.edges.findIndex((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
  if (idx >= 0) session.rawData.edges.splice(idx, 1);
  
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
  session.rawData.edges.push(newEdge);
  
  // If this is an external object property, add it to objectProperties array
  if (editState.selectedExternalObjectProperty && newType !== oldType) {
    const existing = session.objectProperties.find((op) => op.name === newType);
    if (!existing) {
      session.objectProperties.push({
        name: newType, // Store the full URI as the name
        label: editState.selectedExternalObjectProperty.label,
        hasCardinality: editState.selectedExternalObjectProperty.hasCardinality ?? true,
        comment: editState.selectedExternalObjectProperty.comment || null,
      });
      session.objectProperties.sort((a, b) => a.name.localeCompare(b.name));
      // Re-initialize the edge styles menu to include the new property
      const edgeStylesContent = document.getElementById('edgeStylesContent');
      if (edgeStylesContent) {
        initEdgeStylesMenu(edgeStylesContent, applyFilter);
      }
    }
    editState.selectedExternalObjectProperty = null;
  }
  
  const oldCard = { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null };
  pushUndoable(
    () => {
      // Undo: restore old edge state
      // Remove new edge completely
      try {
        removeEdgeFromStore(session.ttlStore!, newFrom, newTo, newType);
      } catch (err) {
        console.warn(`Undo: Failed to remove new edge from store: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Restore old edge
      if (oldWasRestriction) {
        addEdgeToStore(session.ttlStore!, oldFrom, oldTo, oldType, oldCard);
      }
      const i = session.rawData.edges.findIndex((e) => e.from === newFrom && e.to === newTo && e.type === newType);
      if (i >= 0) session.rawData.edges.splice(i, 1);
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
      session.rawData.edges.push(restoredEdge);
    },
    () => {
      // Redo: apply new edge state again
      // Remove old edge completely
      try {
        if (oldWasRestriction && !isRestriction) {
          // Was unchecking restriction - remove restriction only
          removeRestrictionFromStore(session.ttlStore!, oldFrom, oldTo, oldType);
        } else {
          // Was changing other properties or checking restriction - remove edge completely
          removeEdgeFromStore(session.ttlStore!, oldFrom, oldTo, oldType);
        }
      } catch (err) {
        console.warn(`Redo: Failed to remove old edge from store: ${err instanceof Error ? err.message : String(err)}`);
      }
      // Add new edge
      if (isRestriction) {
        addEdgeToStore(session.ttlStore!, newFrom, newTo, newType, card);
      }
      const i = session.rawData.edges.findIndex((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
      if (i >= 0) session.rawData.edges.splice(i, 1);
      session.rawData.edges.push(newEdge);
    }
  );
  fileState.hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  // Clean up unused external properties and update edge styles menu
  session.objectProperties = cleanupUnusedExternalProperties(session.rawData, session.objectProperties);
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
    if (!nodeIdsJson || !session.ttlStore) {
      hideRenameModal();
      return;
    }
    const nodeIds: string[] = JSON.parse(nodeIdsJson);
    const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
    const newComment = commentInput?.value?.trim() ?? '';
    // For multi-edit, we only support comment changes for now
    // Annotation properties would need more complex UI
    const oldVals = nodeIds.map((id) => {
      const n = session.rawData.nodes.find((x) => x.id === id);
      return { id, comment: n?.comment ?? '' };
    });
    let anyChanged = false;
    for (const nodeId of nodeIds) {
      const node = session.rawData.nodes.find((n) => n.id === nodeId);
      if (node && (node.comment ?? '') !== newComment) {
        node.comment = newComment || undefined;
        updateCommentInStore(session.ttlStore, nodeId, newComment || null);
        anyChanged = true;
      }
    }
    if (anyChanged) {
      pushUndoable(
        () => {
          oldVals.forEach(({ id, comment }) => {
            const n = session.rawData.nodes.find((x) => x.id === id);
            if (n && session.ttlStore) {
              n.comment = comment || undefined;
              updateCommentInStore(session.ttlStore, id, comment || null);
            }
          });
        },
        () => {
          nodeIds.forEach((id) => {
            const n = session.rawData.nodes.find((x) => x.id === id);
            if (n && session.ttlStore) {
              n.comment = newComment || undefined;
              updateCommentInStore(session.ttlStore, id, newComment || null);
            }
          });
        }
      );
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    }
    hideRenameModal();
    applyFilter(true);
    return;
  }

  const nodeId = input.dataset.nodeId;
  const newLabel = input.value.trim();
  if (!nodeId || !newLabel) return;

  const existingIds = new Set(session.rawData.nodes.map((n) => n.id));
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

  const nodeIndex = session.rawData.nodes.findIndex((n) => n.id === nodeId);
  if (nodeIndex < 0) {
    hideRenameModal();
    return;
  }
  const node = session.rawData.nodes[nodeIndex];

  const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
  const newComment = commentInput?.value?.trim() ?? '';
  const oldComment = node.comment ?? '';
  const commentChanged = oldComment !== newComment;

  const labelChanged = node.label !== newLabel;
  
  // Collect annotation property changes. Boolean properties use a checkbox; textual properties
  // use the multi-value editor (values tracked in renameModalAnnotationValues).
  const oldAnnotationValues: Record<string, boolean | string | null> = {};
  const newAnnotationValues: Record<string, boolean | string | null> = {};
  const oldTextualValues: Record<string, string[]> = {};
  const newTextualValues: Record<string, string[]> = {};
  let annotationPropsChanged = false;

  session.annotationProperties.forEach((ap) => {
    if (ap.isBoolean) {
      const oldValue = (node.annotations?.[ap.name] ?? null) as boolean | null;
      oldAnnotationValues[ap.name] = oldValue;
      const checkbox = document.getElementById(`renameAnnotProp_${ap.name}`) as HTMLInputElement;
      if (checkbox) {
        const newValue = checkbox.indeterminate ? null : checkbox.checked;
        newAnnotationValues[ap.name] = newValue;
        if (oldValue !== newValue) annotationPropsChanged = true;
      }
    } else {
      const propUri = ap.uri ?? BASE_IRI.replace(/#?$/, '#') + ap.name;
      const oldVals = session.ttlStore ? getAnnotationValuesForClass(session.ttlStore, nodeId, propUri) : [];
      const newVals = editState.renameModalAnnotationValues[ap.name] ?? oldVals;
      oldTextualValues[ap.name] = oldVals;
      newTextualValues[ap.name] = newVals;
      const equal = oldVals.length === newVals.length && oldVals.every((v, i) => v === newVals[i]);
      if (!equal) annotationPropsChanged = true;
    }
  });

  const initialDataProps = editState.renameModalInitialDataProps ?? [];
  const currentDataProps = editState.renameModalDataPropertyRestrictions;
  const dataPropsEqual =
    initialDataProps.length === currentDataProps.length &&
    initialDataProps.every((a) => {
      const b = currentDataProps.find((c) => c.propertyName === a.propertyName);
      return b && a.minCardinality === b.minCardinality && a.maxCardinality === b.maxCardinality;
    }) &&
    currentDataProps.every((b) => initialDataProps.some((a) => a.propertyName === b.propertyName));
  const dataPropsChanged = !dataPropsEqual;

  if (!labelChanged && !annotationPropsChanged && !commentChanged && !dataPropsChanged) {
    hideRenameModal();
    return;
  }

  const oldLabel = node.label;
  const oldAnnotationValuesCopy = { ...oldAnnotationValues };
  const oldDataProps = [...(node.dataPropertyRestrictions ?? [])];

  const newFormData: NodeFormData = {
    comment: newComment,
    annotationValues: {},
    textualAnnotationValues: newTextualValues,
    dataPropertyRestrictions: currentDataProps,
  };
  session.annotationProperties.forEach((ap) => {
    if (ap.isBoolean) {
      newFormData.annotationValues[ap.name] = newAnnotationValues[ap.name] ?? oldAnnotationValues[ap.name] ?? null;
    }
  });
  const oldFormData: NodeFormData = {
    comment: oldComment,
    annotationValues: oldAnnotationValuesCopy,
    textualAnnotationValues: oldTextualValues,
    dataPropertyRestrictions: oldDataProps,
  };

  // Calculate baseIri for undo/redo callbacks
  const baseIri = session.ttlStore ? (getClassNamespace(session.ttlStore) ?? getMainOntologyBase(session.ttlStore) ?? BASE_IRI) : BASE_IRI;

  // Use workflow function if store is available, otherwise use fallback
  if (session.ttlStore) {
    const result = editNodeProperties({
      store: session.ttlStore,
      nodeId,
      node,
      newLabel,
      formData: newFormData,
      annotationProperties: session.annotationProperties,
      existingNodeIds: new Set(session.rawData.nodes.map(n => n.id))
    });

    if (!result.success) {
      const dupErr = document.getElementById('renameDuplicateError') as HTMLElement;
      if (dupErr) {
        dupErr.textContent = result.error || 'Failed to update node';
        dupErr.style.display = 'block';
      }
      const okBtn = document.getElementById('renameConfirm') as HTMLButtonElement;
      if (okBtn) okBtn.disabled = true;
      return;
    }
  } else {
    // Fallback for when store is not available (shouldn't happen in normal flow)
    if (labelChanged) {
      node.label = newLabel;
    }
    node.comment = newFormData.comment.trim() || undefined;
    node.exampleImages = newFormData.textualAnnotationValues?.exampleImage?.length ? [...newFormData.textualAnnotationValues.exampleImage] : undefined;
    node.dataPropertyRestrictions = [...currentDataProps];
  }

  pushUndoable(
    () => {
      if (labelChanged) {
        node.label = oldLabel;
        if (session.ttlStore) updateLabelInStore(session.ttlStore, nodeId, oldLabel);
      }
      if (session.ttlStore) {
        applyNodeFormToStore(nodeId, oldFormData, session.ttlStore, node, baseIri, session.annotationProperties);
      } else {
        node.comment = oldFormData.comment.trim() || undefined;
        node.exampleImages = oldFormData.textualAnnotationValues?.exampleImage?.length ? [...oldFormData.textualAnnotationValues.exampleImage] : undefined;
        node.dataPropertyRestrictions = [...oldDataProps];
      }
    },
    () => {
      if (labelChanged) {
        node.label = newLabel;
        if (session.ttlStore) updateLabelInStore(session.ttlStore, nodeId, newLabel);
      }
      if (session.ttlStore) {
        applyNodeFormToStore(nodeId, newFormData, session.ttlStore, node, baseIri, session.annotationProperties);
      } else {
        node.comment = newFormData.comment.trim() || undefined;
        node.exampleImages = newFormData.textualAnnotationValues?.exampleImage?.length ? [...newFormData.textualAnnotationValues.exampleImage] : undefined;
        node.dataPropertyRestrictions = [...currentDataProps];
      }
    }
  );

  fileState.hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  hideRenameModal();
  applyFilter(true);
}



/** What the imports dialog shows of an import's version (#131); null for a reference that is not an import. */
setImportVersionLookup((url) => {
  if (!session.ttlStore) return null;
  const isImport = session.ttlStore.getQuads(null, 'http://www.w3.org/2002/07/owl#imports', null, null).some((q) => bareIri(q.object.value) === bareIri(url));
  if (!isImport) return null;
  const imported = session.importedOntologies.find((o) => bareIri(o.url) === bareIri(url));
  if (imported) return { state: 'read', version: readOntologyVersion(imported.store), newer: session.importNewerVersions.get(imported.url) };
  return session.importsBeingRead ? { state: 'reading' } : { state: 'unread' };
});

/** How long, and how large (in bytes), one imported ontology may be when it is read in the background (#104). */
const IMPORT_READ_TIMEOUT_MS = 8000;
const IMPORT_READ_MAX_BYTES = 5_000_000;

/** Re-render the property menus after the declarations of the imports were merged in (#104). The edge
 * styles already set are kept; the annotation menu keeps its own. */
function refreshPropertyMenus(): void {
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  if (edgeStylesContent) initEdgeStylesMenu(edgeStylesContent, applyFilter, { preserveStyles: true });
  const dataPropsContent = document.getElementById('dataPropsContent');
  if (dataPropsContent) initDataPropsMenu(dataPropsContent);
  const annotationPropsContent = document.getElementById('annotationPropsContent');
  if (annotationPropsContent) initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
}

/**
 * Read what the loaded ontology's imports declare, in the background, and merge it into the property lists
 * and menus as read-only context (#104). Best effort: an import that can't be fetched (CORS, offline) is
 * skipped and nothing changes. The loaded store is never touched, so saving is unaffected. Nothing happens
 * if another ontology was opened in the meantime.
 */
function startLoadingImportedDeclarations(store: NonNullable<typeof session.ttlStore>): void {
  beginImportsSettle();
  session.importedOntologies = [];
  setImportedPrefixes({});
  session.importNewerVersions = new Map();
  session.importsBeingRead = true;
  void (async () => {
    try {
      // Background reads are bounded: a slow or huge import is given up on, not waited for (and not kept).
      const imported = await loadImportedOntologies(store, (url) =>
        fetchExternalOntologyTtl(url, { timeoutMs: IMPORT_READ_TIMEOUT_MS, maxBytes: IMPORT_READ_MAX_BYTES, fetchStandardVocabularies: true })
      );
      if (store !== session.ttlStore || imported.length === 0) return;
      session.importedOntologies = imported;
      // Prefixes the imports declare name the namespaces they bring in (PROV through aec_provenance, #137).
      setImportedPrefixes(Object.assign({}, ...imported.map((o) => o.prefixes ?? {})));
      session.importedDeclarations = readImportedDeclarations(imported);
      const before = { objectProperties: session.objectProperties, dataProperties: session.dataProperties, annotationProperties: session.annotationProperties };
      const merged = mergeImportedDeclarations(before, session.importedDeclarations);
      session.objectProperties = merged.objectProperties;
      session.dataProperties = merged.dataProperties;
      session.annotationProperties = merged.annotationProperties;
      refreshPropertyMenus();
      // Redrawing clears the user's selection, so only do it when the labels or ranges of properties the file
      // uses came from an import; properties added as context are never drawn.
      if (mergeChangesWhatIsDrawn(before, merged)) applyFilter(true);
    } catch (err) {
      debugWarn('Could not read the declarations of the imports:', err);
    } finally {
      if (store === session.ttlStore) {
        session.importsBeingRead = false;
        refreshExternalRefsList();
        importsSettled();
        void findImportsNewerVersions(store);
      }
    }
  })();
}

/**
 * Look, in the background, for the other versions of the loaded ontology (#132), and offer them in the bottom bar
 * (#133). Choosing one opens it, after asking when there are unsaved edits. The versions seen are remembered for
 * the tab, so an older version still offers the later ones. Not offered when embedded: the view is read-only there.
 */
function startFindingVersions(store: NonNullable<typeof session.ttlStore>, loadedUrl: string | null): void {
  updateAvailableVersions(null, () => {});
  const ontologyIri = readOntologyVersion(store)?.ontologyIri;
  if (isEmbedded() || !ontologyIri) return;
  void findVersions(store, loadedUrl, browserVersionSources, recallSeenVersions(ontologyIri)).then((available) => {
    if (store !== session.ttlStore) return;
    rememberSeenVersions(ontologyIri, available.entries);
    updateAvailableVersions(available, (entry) => {
      if (!entry.url) return;
      if (fileState.hasUnsavedChanges && !confirm(`Open version ${entry.version}? Your unsaved changes will be lost.`)) return;
      void loadFromUrl(entry.url);
    });
  });
}

async function loadTtlAndRender(
  ttlString: string,
  fileName?: string,
  handle?: FileSystemFileHandle | null,
  pathHint?: string
): Promise<void> {
  // The view is unsettled from the start of a load, not only once its render begins: the new store is set
  // before rendering, and the previous render's "settled" must not count for this load (#93).
  beginViewSettle();
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
    fileState.originalTtlString = ttlString;
    
    const pathForParse = pathHint ?? fileName ?? '';
    const { parseResult, prefixMap, extractedRefs } = await loadOntologyFromContent(ttlString, pathForParse);
    const { graphData, store, annotationProperties: annotationProps, objectProperties: objectProps, dataProperties: dataProps, originalFileCache: cache } = parseResult;
    
    // Store the store early so tests can detect when parsing is complete
    session.ttlStore = store;
    // A loaded ontology is never left under the "Open ontology" dialog, whichever way it arrived — including
    // one loaded while start-up was still deciding whether to show that dialog.
    hideOpenOntologyModal();

    // Store original file cache for source preservation
    fileState.originalFileCache = cache ?? null;
    
    // Detect if file is TTL and load serializer config
    const isTurtle = pathForParse.toLowerCase().endsWith('.ttl') || 
                     pathForParse.toLowerCase().endsWith('.turtle') ||
                     (!pathForParse && cache?.format === 'turtle');
    fileState.isTtlFile = isTurtle;
    
    // Load serializer config from IndexedDB
    if (isTurtle && !fileState.skipSlowOperationsForTests) {
      const savedConfig = await loadSerializerConfigFromIndexedDB(fileState.loadedFilePath, fileState.loadedFileName);
      if (savedConfig) {
        fileState.currentSerializerType = savedConfig.serializerType;
      } else {
        // Default to 'custom' for TTL files
        fileState.currentSerializerType = 'custom';
      }
    } else {
      // Non-TTL files: default to rdflib (dropdown will be hidden)
      fileState.currentSerializerType = 'rdflib';
    }
    
    // Update dropdown visibility and state (call after cache is set)
    updateSerializerDropdown();
    
    // Merge external refs early so we can detect used annotation properties before processing nodes
    // Skip IndexedDB operations in test mode for faster execution
    const dbRefs = fileState.skipSlowOperationsForTests ? [] : await loadExternalRefsFromIndexedDB(fileState.loadedFilePath, fileState.loadedFileName);
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
    
    session.externalOntologyReferences = mergedRefs;
    
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
      const isExternal = isUriFromExternalOntology(predUri, null, session.externalOntologyReferences, mainBaseForAnnotProps);
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
            const definingOntology = getDefiningOntologyFromUri(fullUri, session.externalOntologyReferences);
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
      
      const outQuads = store.getQuads(subj as unknown as Term, null, null, null);
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

    session.rawData = graphData;
    clearPositionsBeforeLayout();
    canvasState.positionsArranged = false;
    session.annotationProperties = annotationProps;
    session.objectProperties = objectProps;
    session.dataProperties = dataProps;
    session.importedDeclarations = null; // those of the previous ontology's imports
    // ttlStore already set earlier after parsing (for faster test detection)
    session.knownExternalClassUris = new Set();
    session.userAddedExternalNodes = [];

    fileState.loadedFileName = fileName ?? null;
    fileState.loadedFilePath = pathHint ?? fileName ?? null;
    fileState.fileHandle = handle ?? null;
    forgetOntologyDirectory(); // another ontology, maybe in another folder (#103)
fileState.hasUnsavedChanges = false;
    clearUndoRedo();
    updateFilePathDisplay();

    canvasState.loadedEdgeStyleConfig = null;

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
      showWarningBar('The current file defines no classes, so the canvas is empty.');
    } else {
      hideWarningBar();
    }

    setTimeout(() => {
      updateStatusBar(session.ttlStore, pathHint ?? fileName ?? null);
      updateOntologyInfoDisplay(session.ttlStore ? getOntologyInfo(session.ttlStore, prefixMap) : null);
      updateOntologyVersionDisplay(session.ttlStore ? readOntologyVersion(session.ttlStore) : null);
      if (session.ttlStore) startFindingVersions(session.ttlStore, pathHint && /^https?:\/\//i.test(pathHint) ? pathHint : null);
    }, 0);

    if (handle && fileName) {
      saveLastFileToIndexedDB(handle, pathHint ?? fileName).catch(() => {});
      addRecentlyOpenedToIndexedDB({
        kind: 'file',
        handle,
        pathHint: pathHint ?? fileName,
        name: fileName,
        openedAt: Date.now(),
      }).catch(() => {});
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

    debugLog('[DEBUG] After parsing - describes edges in rawData.edges:', session.rawData.edges.filter((e) => e.type.includes('describes')).length);
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog('Extracted external references from ontology:', extractedRefs);
      debugLog('Extracted prefixes:', prefixMap);
    }

    // Note: External references are already merged earlier (before node re-processing)
    // This ensures external ontology references are available when detecting used annotation properties
    
    // Add refs from namespaces used in the store (e.g. DANO loaded as RDF/XML has no owl:imports and no TTL prefixes)
    const mainBaseForNamespaceRefs = getMainOntologyBase(session.ttlStore);
    for (const ref of extractUsedNamespaceRefsFromStore(session.ttlStore, mainBaseForNamespaceRefs)) {
      const normalized = ref.url.endsWith('#') ? ref.url.slice(0, -1) : ref.url.replace(/\/$/, '');
      if (!seenUrls.has(normalized)) {
        mergedRefs.push(ref);
        seenUrls.add(normalized);
      }
    }

    sortExternalRefsByUrl(mergedRefs);
    session.externalOntologyReferences = mergedRefs;

    sortExternalRefsByUrl(mergedRefs);
    session.externalOntologyReferences = mergedRefs;
    // Debug logging removed - use debugLog if needed in future
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog(`Total external references: ${session.externalOntologyReferences.length}`);
      for (const ref of session.externalOntologyReferences) {
        debugLog(`  - ${ref.url} (prefix: ${ref.prefix || 'none'}, usePrefix: ${ref.usePrefix})`);
      }
    }

    const mainBaseForSeed = getMainOntologyBase(session.ttlStore);
    if (mainBaseForSeed && session.externalOntologyReferences.length > 0) {
      const refed = getReferencedExternalClassesFromStore(session.ttlStore, mainBaseForSeed, session.externalOntologyReferences);
      refed.forEach((c) => session.knownExternalClassUris.add(c.uri));
    }

    // Pre-fetch and cache external ontology classes and object properties (non-blocking)
    // Failures are expected (CORS, 404, etc.) and are handled silently unless in debug mode
    if (session.externalOntologyReferences.length > 0) {
      preloadExternalOntologyClasses(session.externalOntologyReferences).catch((err) => {
        // Only log in debug mode - failures are expected for many external ontologies
        if (isDebugMode()) {
          debugWarn('Failed to pre-load external ontologies:', err);
        }
      });
    }
    
    // Extract external object properties from edges that use full URIs
    // This ensures external properties appear in the Object Properties menu
    // Create basic entries immediately without any network requests to avoid blocking
    const edgeTypes = getEdgeTypes(session.rawData.edges);
    for (const edgeType of edgeTypes) {
      if ((edgeType.startsWith('http://') || edgeType.startsWith('https://'))) {
        // Check if this property already exists (either as full URI or as local name)
        const localName = extractLocalName(edgeType);
        const existingByUri = session.objectProperties.find((op) => op.name === edgeType);
        const existingByLocalName = session.objectProperties.find((op) => op.name === localName);
        
        // If it exists as local name, update it to use the full URI to avoid duplicates
        if (existingByLocalName && !existingByUri) {
          existingByLocalName.name = edgeType;
        }
        
        // Only add if it doesn't exist yet - create basic entry immediately (no network requests)
        if (!existingByUri && !existingByLocalName) {
          session.objectProperties.push({
            name: edgeType,
            label: extractLocalName(edgeType),
            hasCardinality: true,
            comment: null,
          });
        }
      }
    }
    session.objectProperties.sort((a, b) => a.name.localeCompare(b.name));

    // Note: Used annotation properties are already detected and added earlier (before node re-processing)
    // This ensures imported annotation properties like core:labellableRoot are available when nodes are processed
    session.annotationProperties.sort((a, b) => a.name.localeCompare(b.name));

    const edgeStylesContent = document.getElementById('edgeStylesContent')!;
    const annotationPropsContent = document.getElementById('annotationPropsContent');
    initEdgeStylesMenu(edgeStylesContent, applyFilter);
    const dataPropsContent = document.getElementById('dataPropsContent');
    if (dataPropsContent) initDataPropsMenu(dataPropsContent);
    if (annotationPropsContent) initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
    initAddRelationshipTypeHandlers(edgeStylesContent);
    initAddDataPropertyHandlers(dataPropsContent ?? undefined);
    initAddAnnotationPropertyHandlers(annotationPropsContent ?? undefined);

    let savedViewState: { scale: number; position: { x: number; y: number } } | null = null;
    // Skip IndexedDB operations in test mode for faster execution
    const displayConfig = fileState.skipSlowOperationsForTests ? null : await loadDisplayConfigFromIndexedDB(fileState.loadedFilePath, fileState.loadedFileName);

    // Apply the saved annotation-property priority order (drives styling precedence) and restore
    // saved per-property colours into the freshly rendered menu. The menu was rendered above with
    // alphabetical order + default colours; this overrides both from the saved display config.
    if (displayConfig && annotationPropsContent) {
      session.annotationProperties = applyAnnotationPropertyOrder(session.annotationProperties, displayConfig.annotationPropertyOrder);
      initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
      applyAnnotationStyleConfigToDom(
        annotationPropsContent,
        displayConfig.annotationStyleConfig as AnnotationStyleConfig | undefined,
        session.annotationProperties
      );
    }

    // Set lastLayoutMode BEFORE applying config to prevent clearing positions.
    // Resolve to the default DAG layout when the config's mode no longer exists (issue #19).
    canvasState.lastLayoutMode = resolveLayoutMode(displayConfig?.layoutMode);
    
    if (displayConfig) {
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog('[DISPLAY CONFIG] Loading display config from IndexedDB for:', fileState.loadedFileName);
        debugLog('[DISPLAY CONFIG] Config has', Object.keys(displayConfig.nodePositions || {}).length, 'node positions');
        debugLog('[DISPLAY CONFIG] Config has', Object.keys(displayConfig.edgeStyleConfig || {}).length, 'edge style configs');
      }
      // Store the edge style config so it can be merged when building the filter
      canvasState.loadedEdgeStyleConfig = displayConfig.edgeStyleConfig || null;
      applyDisplayConfig(displayConfig);
      if (displayConfig.viewState) savedViewState = displayConfig.viewState;
    } else {
      // No saved config: default the "Max" node font size to a value scaled to the ontology size
      // (fewer nodes → smaller Max, gentler root→leaf gap). See issue #44.
      const maxFontEl = document.getElementById('maxFontSize') as HTMLInputElement | null;
      if (maxFontEl) maxFontEl.value = String(defaultMaxFontSize(session.rawData?.nodes?.length ?? 0));
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog('[DISPLAY CONFIG] No display config found in IndexedDB for:', fileState.loadedFileName);
      }
    }

    // Allow layout to settle after vizControls appears, then render
    // Skip double requestAnimationFrame in test mode for faster execution
    if (fileState.skipSlowOperationsForTests) {
      applyFilter();
      if (canvasState.network && savedViewState) {
        canvasState.network.moveTo({
          scale: savedViewState.scale,
          position: savedViewState.position,
          animation: false,
        });
      }
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyFilter();
          if (canvasState.network && savedViewState) {
            canvasState.network.moveTo({
              scale: savedViewState.scale,
              position: savedViewState.position,
              animation: false,
            });
          }
        });
      });
    }
    startLoadingImportedDeclarations(store);
  } catch (err) {
    errorMsg.textContent = `Parse error: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}


/**
 * Runs an asynchronous layout (ELK, #153) and keeps its positions for the nodes that had none, then redraws. Only
 * the latest run counts, and only while its layout is still the chosen one. If it fails (e.g. elkjs can't be
 * loaded), the positions shown meanwhile are kept.
 */
function runAsyncLayout(
  layout: AsyncLayoutAlgorithm,
  mode: string,
  nodeIds: Set<string>,
  edges: GraphEdge[],
  nodeDimensions: Map<string, { width: number; height: number }>,
  layoutOptions: LayeredModelOptions,
  toPlace: Set<string>,
  placedBefore: Record<string, { x: number; y: number }>,
  sizeOf: (id: string) => { width: number; height: number },
  shown: Record<string, { x: number; y: number }>
): void {
  const run = ++canvasState.asyncLayoutRun;
  const keep = (positions: Record<string, { x: number; y: number }>) => {
    if (run !== canvasState.asyncLayoutRun || (document.getElementById('layoutMode') as HTMLSelectElement).value !== mode) return;
    let changed = false;
    for (const [id, pos] of Object.entries(positions)) {
      if (!toPlace.has(id)) continue;
      const node = session.rawData.nodes.find((n) => n.id === id);
      if (node && (node.x != null || node.y != null)) continue;
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
      } else {
        canvasState.loadedNodePositions = { ...(canvasState.loadedNodePositions ?? {}), [id]: pos };
      }
      changed = true;
    }
    if (changed) applyFilter(true);
  };
  layout(nodeIds, edges, SPACING, nodeDimensions, layoutOptions)
    .then((computed) => keep(placeUnsavedNodes(placedBefore, computed, edges, sizeOf)))
    .catch((err) => {
      debugError(`[LAYOUT] ${mode} failed; keeping the default layout`, err);
      keep(shown);
    });
}

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
        canvasState.loadedEdgeStyleConfig = localDisplayConfig.edgeStyleConfig || null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            applyDisplayConfig(localDisplayConfig);
            applyFilter();
            if (canvasState.network && localDisplayConfig.viewState) {
              canvasState.network.moveTo({
                scale: localDisplayConfig.viewState.scale,
                position: localDisplayConfig.viewState.position,
                animation: false,
              });
            }
            saveDisplayConfigToIndexedDB(localDisplayConfig, pathHint, file.name).catch(() => {});
          });
        });
      }
      
      clearOntologyParamsFromAddressBar();
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
    addRecentlyOpenedToIndexedDB({ kind: 'url', url, name: fileName, openedAt: Date.now() }).catch(() => {});

    // Next to the file the URL was finally served from first: a version IRI redirects to its release (#136).
    let urlDisplayConfig = await firstDisplayConfig(getAllDisplayFileUrls(url, servedFrom(url)));

    await loadTtlAndRender(ttl, fileName, null, url);
    setOntologyUrlParamInAddressBar(url);

    // A version opened without a config of its own borrows the latest version's, and says so (#136).
    const latestSource = !urlDisplayConfig && session.ttlStore ? latestDisplayConfigSource(url, readOntologyVersion(session.ttlStore)) : null;
    if (latestSource && (await fetchExternalOntologyTtl(latestSource, { timeoutMs: IMPORT_READ_TIMEOUT_MS }))) {
      urlDisplayConfig = await firstDisplayConfig(getAllDisplayFileUrls(latestSource, servedFrom(latestSource)));
      if (urlDisplayConfig) {
        showWarningBar('This version has no display settings of its own: the layout and colours of the latest version are used, so terms added or removed since may be placed oddly.');
      }
    }

    if (urlDisplayConfig) {
      canvasState.loadedEdgeStyleConfig = urlDisplayConfig.edgeStyleConfig || null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyDisplayConfig(urlDisplayConfig!);
          applyFilter();
          if (canvasState.network && urlDisplayConfig!.viewState) {
            canvasState.network.moveTo({
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
 * Load an ontology from a previously-granted file handle (requesting permission again if
 * needed), and apply its sibling .display.json config if present. Shared by "Load last opened
 * file" and reopening an entry from the "Previously opened" history.
 */
async function loadOntologyFromFileHandle(handle: FileSystemFileHandle, storedPathHint?: string): Promise<void> {
  showLoadingModal();
  try {
    // The File System Access permission API is not yet in the TS DOM lib.
    const handleWithPerms = handle as unknown as {
      queryPermission(descriptor: { mode: string }): Promise<PermissionState>;
      requestPermission(descriptor: { mode: string }): Promise<PermissionState>;
    };
    const perm = await handleWithPerms.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const requested = await handleWithPerms.requestPermission({ mode: 'readwrite' });
      if (requested !== 'granted') {
        hideLoadingModal();
        const errorMsg = document.getElementById('errorMsg') as HTMLElement;
        errorMsg.textContent = 'Permission to access file was denied.';
        errorMsg.style.display = 'block';
        return;
      }
    }
    const file = await handle.getFile();
    const ttl = await file.text();
    const pathHint = (file as File & { path?: string }).path ?? storedPathHint ?? file.name;
    await loadTtlAndRender(ttl, file.name, handle, pathHint);

    // Try to load display config from sibling .display.json file
    const localDisplayConfig = await loadDisplayConfigFromLocalFile(handle, file.name);
    if (localDisplayConfig) {
      canvasState.loadedEdgeStyleConfig = localDisplayConfig.edgeStyleConfig || null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyDisplayConfig(localDisplayConfig);
          applyFilter();
          if (canvasState.network && localDisplayConfig.viewState) {
            canvasState.network.moveTo({
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
  await loadOntologyFromFileHandle(stored.handle, stored.pathHint);
}

/**
 * Reopen an entry from the "Previously opened" history (file or URL).
 */
async function loadFromRecentEntry(entry: RecentlyOpenedEntry): Promise<void> {
  if (entry.kind === 'url') {
    await loadFromUrl(entry.url);
  } else {
    await loadOntologyFromFileHandle(entry.handle, entry.pathHint);
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
  
  // Initialize version display (clickable link to repo)
  const versionDisplay = document.getElementById('versionDisplay');
  if (versionDisplay) {
    versionDisplay.innerHTML = `<a href="${REPO_URL}" target="_blank" rel="noopener noreferrer" class="version-link" title="OntoCanvas on GitHub">OntoCanvas v${getAppVersion()}</a>`;
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
        loadLastOpenedUrl,
        loadFromRecentEntry
      );

  // File input change handler (for fallback when showOpenFilePicker is not available)
  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    showLoadingModal();
    try {
      const ttl = await file.text();
      await loadTtlAndRender(ttl, file.name, null);
      clearOntologyParamsFromAddressBar();
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
  document.getElementById('restorePositions')?.addEventListener('click', restoreNodePositions);

  const externalRefsCallbacks: ExternalRefsModalCallbacks = {
    onUpdate: () => {
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      // Refresh all UI elements that display prefixes
      if (session.ttlStore) {
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
          initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
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
    showExternalRefsModal(session.externalOntologyReferences, externalRefsCallbacks, fileState.loadedFilePath, fileState.loadedFileName);
    const displayEl = document.getElementById('displayExternalRefs') as HTMLInputElement | null;
    const layoutEl = document.getElementById('externalNodeLayout') as HTMLSelectElement | null;
    if (displayEl) displayEl.checked = canvasState.displayExternalReferences;
    if (layoutEl) layoutEl.value = canvasState.externalNodeLayout;
  });
  document.getElementById('stackLeaves')?.addEventListener('change', (e) => {
    setStackLeaves((e.target as HTMLInputElement).checked);
    forgetNodePositions();
    applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('clusterThingDataProps')?.addEventListener('change', (e) => {
    canvasState.clusterThingDataProperties = (e.target as HTMLInputElement).checked;
    applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('displayExternalRefs')?.addEventListener('change', (e) => {
    canvasState.displayExternalReferences = (e.target as HTMLInputElement).checked;
    applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('externalNodeLayout')?.addEventListener('change', (e) => {
    canvasState.externalNodeLayout = (e.target as HTMLSelectElement).value as ExternalNodeLayout;
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
    if (session.externalOntologyReferences.some((ref) => ref.url === url)) {
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
      session.externalOntologyReferences.push(newRef);
      sortExternalRefsByUrl(session.externalOntologyReferences);

      urlInput.value = '';
      const externalRefsCallbacks: ExternalRefsModalCallbacks = {
        onUpdate: () => {
          fileState.hasUnsavedChanges = true;
          updateSaveButtonVisibility();
        },
        onSave: () => {
          // Additional save logic if needed
        },
      };
      renderExternalRefsList(session.externalOntologyReferences, externalRefsCallbacks, fileState.loadedFilePath, fileState.loadedFileName);
      await saveExternalRefsToIndexedDB(session.externalOntologyReferences, fileState.loadedFilePath, fileState.loadedFileName);
      
      // Pre-fetch the newly added ontology
      try {
        await preloadExternalOntologyClasses([newRef]);
      } catch (err) {
        console.warn(`Failed to pre-load newly added ontology ${newRef.url}:`, err);
      }
      
      fileState.hasUnsavedChanges = true;
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

  for (const name of ['textDisplay', 'searchOptions']) {
    const wrap = document.getElementById(`${name}Wrap`);
    const toggle = document.getElementById(`${name}Toggle`);
    const popup = document.getElementById(`${name}Popup`);
    if (wrap && toggle && popup) attachPopover(wrap, toggle, popup);
  }

  // Layout-mode hint popup (describes the logic of each layout mode).
  initLayoutModeHint();

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
    .querySelectorAll('input[name="searchScope"]')
    .forEach((radio) => radio.addEventListener('change', () => applyFilter()));
  document
    .getElementById('searchExactMatch')
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
    editState.selectedEdgeType = null;
    editState.selectedExternalObjectProperty = null;
    
    // Debounce search
    editEdgeTypeSearchTimeout = setTimeout(() => {
      updateEditEdgeTypeSearch(query).catch((err) => {
        console.error('Error in edge type search:', err);
      });
    }, 150);
    
    // Also update comment display immediately if we have a selected type
    if (editState.selectedEdgeType) {
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
  
  // Keep the sections in step with the type on leaving the field too (a no-op once a type was chosen).
  document.getElementById('editEdgeType')?.addEventListener('focusout', updateEditEdgeTypeSections);
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
  document.getElementById('openInNewTab')?.addEventListener('click', () => {
    const params = new URLSearchParams(window.location.search);
    const onto = params.get('onto');
    const base = window.location.origin + window.location.pathname;
    // Open the same ontology in a full, non-embedded OntoCanvas tab (drop the embed flag).
    const url = onto ? `${base}?onto=${encodeURIComponent(onto)}` : base;
    window.open(url, '_blank', 'noopener');
  });
  document.getElementById('resetView')?.addEventListener('click', () => {
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'hierarchical-dag';
    (document.getElementById('wrapChars') as HTMLInputElement).value = '12';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = String(defaultMaxFontSize(session.rawData?.nodes?.length ?? 0));
    (document.getElementById('relationshipFontSize') as HTMLInputElement).value = '18';
    (document.getElementById('searchQuery') as HTMLInputElement).value = '';
    setSearchScope(DEFAULT_SEARCH_SCOPE);
    (document.getElementById('searchExactMatch') as HTMLInputElement).checked = true;
    document.getElementById('searchAutocomplete')?.classList.remove('visible');
    for (const id of ['textDisplayPopup', 'searchOptionsPopup']) {
      const popup = document.getElementById(id);
      if (popup) popup.style.display = 'none';
    }
    document.querySelectorAll('.edge-show-cb').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.edge-label-cb').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    const types = getAllRelationshipTypes(session.rawData, session.objectProperties);
    const defaultColors = getDefaultEdgeColors(colourableRelationshipTypes(types, session.objectProperties));
    types.forEach((type) => {
      const colorEl = document.querySelector(`.edge-color-picker[data-type="${type}"]`) as HTMLInputElement;
      if (colorEl) colorEl.value = defaultColors[type] ?? getDefaultColor();
    });
    updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences);
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
    canvasState.network?.fit();
  });
  document.getElementById('saveChanges')?.addEventListener('click', saveTtl);
  
  // Serializer dropdown change handler (DEV mode only)
  const serializerSelect = document.getElementById('serializerSelect') as HTMLSelectElement;
  if (serializerSelect) {
    serializerSelect.addEventListener('change', async (e) => {
      const newType = (e.target as HTMLSelectElement).value as SerializerType;
      fileState.currentSerializerType = newType;
      
      // Save to IndexedDB
      if (fileState.isTtlFile && !fileState.skipSlowOperationsForTests) {
        await saveSerializerConfigToIndexedDB(
          { serializerType: newType },
          fileState.loadedFilePath,
          fileState.loadedFileName
        );
      }
      
      debugLog('[serializerSelect] Changed to:', newType);
    });
  }

  document.getElementById('saveDisplayConfig')?.addEventListener('click', async () => {
    if (session.rawData.nodes.length === 0) return;
    if (canvasState.network) {
      const positions = canvasState.network.getPositions();
      Object.entries(positions).forEach(([id, pos]) => {
        const node = session.rawData.nodes.find((n) => n.id === id);
        if (node && pos) {
          node.x = pos.x;
          node.y = pos.y;
        }
      });
    }
    const config = collectDisplayConfig();
    if (!config) return;
    const baseName = displayConfigBaseName(fileState.loadedFileName || fileState.loadedFilePath || 'ontology');
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
    if (!file || session.rawData.nodes.length === 0) return;
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
      if (canvasState.network && config.viewState) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            canvasState.network?.moveTo({
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
        saveDisplayConfigToIndexedDB(upgradedConfig, fileState.loadedFilePath, fileState.loadedFileName).catch(() => {});
      }
    } catch (err) {
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to load display config: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
  });

  document.getElementById('loadDisplayConfig')?.addEventListener('click', async () => {
    if (session.rawData.nodes.length === 0) return;
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
        if (canvasState.network && config.viewState) {
          canvasState.network.moveTo({
            scale: config.viewState.scale,
            position: config.viewState.position,
            animation: false,
          });
        }
        saveDisplayConfigToIndexedDB(config, fileState.loadedFilePath, fileState.loadedFileName).catch(() => {});
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
    if (session.rawData.nodes.length === 0) return;
    
    forgetNodePositions();
    setHierarchyTypes(undefined);
    setStackLeaves(true);
    
    // Reset all display settings to defaults
    (document.getElementById('wrapChars') as HTMLInputElement).value = '12';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = '70';
    (document.getElementById('relationshipFontSize') as HTMLInputElement).value = '18';
    (document.getElementById('dataPropertyFontSize') as HTMLInputElement).value = '12';
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'hierarchical-dag';
    (document.getElementById('searchQuery') as HTMLInputElement).value = '';
    setSearchScope(DEFAULT_SEARCH_SCOPE);
    (document.getElementById('searchExactMatch') as HTMLInputElement).checked = true;

    // Clear loaded edge style config (so it doesn't override DOM checkboxes)
    canvasState.loadedEdgeStyleConfig = null;
    
    // Reset Object Property display settings to defaults
    // Reinitialize the edge styles menu which will reset all checkboxes to default values
    const edgeStylesContent = document.getElementById('edgeStylesContent');
    if (edgeStylesContent) {
      initEdgeStylesMenu(edgeStylesContent, applyFilter);
      updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences);
    }
    
    // Delete display config from IndexedDB
    await deleteDisplayConfigFromIndexedDB(fileState.loadedFilePath, fileState.loadedFileName).catch(() => {});
    
    // Reset lastLayoutMode to prevent position clearing on first applyFilter
    canvasState.lastLayoutMode = 'hierarchical-dag';
    
    // Regenerate layout by applying filter
    applyFilter();
  });

  const redrawNetworkOnMenuToggle = (): void => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (canvasState.network) {
          const nc = document.getElementById('network');
          if (nc) {
            const w = nc.clientWidth;
            const h = nc.clientHeight;
            if (w > 0 && h > 0) {
              canvasState.network.setSize(`${w}px`, `${h}px`);
              canvasState.network.redraw();
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
    editState.renameModalDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    nodeModalFormUi.renderRenameModalDataPropsList(editState.renameModalDataPropertyRestrictions, session.dataProperties, onRemoveRenameDataProp);
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
    editState.addNodeDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    nodeModalFormUi.renderAddNodeDataPropsList(editState.addNodeDataPropertyRestrictions, session.dataProperties, onRemoveAddNodeDataProp);
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
    if (editState.addNodeSearchTimeout) {
      clearTimeout(editState.addNodeSearchTimeout);
    }
    
    // Debounce search
    editState.addNodeSearchTimeout = setTimeout(() => {
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
        if (activeEl?.id === 'searchQuery' && canvasState.network?.getSelectedNodes().length) {
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
    // Escape cancels a pending update, or the suggestions would reopen after being dismissed (#93).
    const suggestionsUpdate = debounced(updateSearchAutocomplete, 150);
    searchInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') suggestionsUpdate.cancel();
    });
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
      suggestionsUpdate.schedule();
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
  // Relationships, classes and data properties as drawn by the last render, shown by prefixed name
  // (foaf:member) with the full IRI as a tooltip (#81).
  const suggestions = buildSearchSuggestions(query, canvasState.searchSuggestionSources);
  list.innerHTML = '';
  list.classList.remove('visible');
  list.dataset.highlight = '-1';
  suggestions.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.dataset.value = s.value;
    div.title = s.title;
    // Built with textContent: labels come from the loaded ontology and must not be read as HTML.
    div.textContent = s.display;
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = `(${s.hint})`;
    div.appendChild(hint);
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

registerActions({ applyFilter });
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
