/**
 * Confirming the edit edge modal: validating, writing to the store, and redrawing.
 * Moved out of main.ts (#175).
 */
import { findShownEdge } from '../graph/canvasHelpers';
import { edgeLock } from '../lib/edgeEditability';
import { getMainOntologyBase, addEdgeToStore, removeEdgeFromStore, removeDataPropertyRestrictionFromClass, addDataPropertyRestrictionToClass, getDataPropertyRestrictionsForClass, removeRestrictionFromStore, addRestrictionToStore } from '../parser';
import { actions } from '../state/actions';
import { editState, session, fileState } from '../state/appState';
import { pushUndoable } from '../workflows/undoRedo';
import { hideEditEdgeModalWithCleanup } from './edgeModalHelpers';
import { formatRelationshipLabelWithPrefix } from './externalRefs';
import { updateSaveButtonVisibility } from './fileBar';
import { getCardinalityFromEditModal } from './modals';
import { initEdgeStylesMenu } from './relationshipTypeModal';
import { getAllEdgeTypes, getRelationshipLabel, cleanupUnusedExternalProperties } from './relationshipUtils';

export function confirmEditEdge(): void {
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

    const newEdge: import('../types').GraphEdge = { 
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
          initEdgeStylesMenu(edgeStylesContent, actions.applyFilter);
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
      initEdgeStylesMenu(edgeStylesContent, actions.applyFilter);
    }
    actions.applyFilter(true);
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
    actions.applyFilter(true);
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
  const newEdge: import('../types').GraphEdge = { 
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
        initEdgeStylesMenu(edgeStylesContent, actions.applyFilter);
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
      const restoredEdge: import('../types').GraphEdge = { 
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
    initEdgeStylesMenu(edgeStylesContent, actions.applyFilter);
  }
  hideEditEdgeModalWithCleanup();
  actions.applyFilter(true);
}
