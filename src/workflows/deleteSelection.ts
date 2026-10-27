/**
 * Deleting what is selected on the canvas: nodes, edges and data properties, with the checks that lock some of them.
 * Moved out of main.ts (#175).
 */
import { findShownEdge } from '../graph/canvasHelpers';
import { removeExternalClassReferencesFromStore } from '../graph/removeExternalReferences';
import { splitThingBoxSelection, thingBoxId, OWL_THING_URI } from '../graph/thingNode';
import { edgeLock, EDGE_LOCK_REASON } from '../lib/edgeEditability';
import { snapshotStore, snapshotGraph, diffStore, revertStoreChange, restoreGraph, reapplyStoreChange } from '../lib/storeChange';
import { removeEdgeFromStore, removeRestrictionEdgeFromStore, removeDataPropertyRestrictionFromClass, getDataPropertyRestrictionsForClass, removeNodeFromStore } from '../parser';
import { actions } from '../state/actions';
import { canvasState, session, fileState } from '../state/appState';
import { updateSaveButtonVisibility } from '../ui/fileBar';
import { initEdgeStylesMenu } from '../ui/relationshipTypeModal';
import { cleanupUnusedExternalProperties } from '../ui/relationshipUtils';
import { debugLog, debugWarn, debugError } from '../utils/debug';
import { parseEdgeId } from '../utils/edgeId';
import { isEmbedded } from '../utils/embedMode';
import { pushUndoable } from './undoRedo';

export function performDeleteSelection(): boolean {
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
    for (const name of thingProperties) actions.deleteDataPropertyWithConfirm(name);
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
    initEdgeStylesMenu(edgeStylesContent, actions.applyFilter);
  }
  debugLog(`[DELETE] About to call applyFilter. rawData.edges count: ${session.rawData.edges.length}`);
  debugLog(`[DELETE] rawData.edges:`, session.rawData.edges.map(e => `${e.from}->${e.to}:${e.type}`));
  actions.applyFilter(true);
  debugLog(`[DELETE] After applyFilter. rawData.edges count: ${session.rawData.edges.length}`);
  debugLog(`[DELETE] rawData.edges after filter:`, session.rawData.edges.map(e => `${e.from}->${e.to}:${e.type}`));
  canvasState.network.unselectAll();
  return true;
}
