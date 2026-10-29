/**
 * Confirming the add node and rename modals: validating, writing to the store, and redrawing.
 * Moved out of main.ts (#175).
 */
import { getAnnotationValuesForClass } from '../lib/annotationValues';
import { addNodeToStore, removeNodeFromStore, updateCommentInStore, updateLabelInStore } from '../ontology/editClasses';
import { getClassNamespace, getMainOntologyBase } from '../ontology/ontologyBase';
import { BASE_IRI } from '../ontology/vocab';
import { removeDataPropertyRestrictionFromClass } from '../ontology/editRestrictions';
import { actions } from '../state/actions';
import { editState, session, fileState, canvasState } from '../state/appState';
import type { GraphNode } from '../types';
import { editNodeProperties } from '../workflows/editNodeProperties';
import { pushUndoable } from '../workflows/undoRedo';
import { updateSaveButtonVisibility } from './fileBar';
import { hideRenameModal } from './modals';
import { ADD_NODE_DUPLICATE_MESSAGE, type NodeFormData, applyNodeFormToStore } from './nodeModalForm';
import { hideAddNodeModalWithCleanup } from './nodeModalHelpers';

export function confirmAddNode(): void {
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
    actions.applyFilter(true);
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
  actions.applyFilter(true);
  hideAddNodeModalWithCleanup();
}

export function confirmRename(): void {
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
    actions.applyFilter(true);
    return;
  }

  const nodeId = input.dataset.nodeId;
  const newLabel = input.value.trim();
  if (!nodeId || !newLabel) return;

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
  actions.applyFilter(true);
}
