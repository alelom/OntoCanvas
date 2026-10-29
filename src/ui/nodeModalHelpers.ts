/**
 * Helpers of the node modals: the multi-edit modal, refreshing the rename and add-node dialogs, and removing a data
 * property from them. Moved out of main.ts (#175).
 */
import { session, editState } from '../state/appState';
import type { GraphNode } from '../types';
import { hideAddNodeModal } from './modals';
import * as nodeModalFormUi from './nodeModalFormUi';
import { setRenameModalTipButtonVisible } from './renameModalHeaderIcons';

export function showMultiEditModal(nodeIds: string[]): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  modal.dataset.mode = 'multi';
  modal.dataset.nodeIds = JSON.stringify(nodeIds);
  delete input.dataset.nodeId;
  input.value = 'multiple nodes selected';
  input.disabled = true;
  input.style.color = '#999';
  const nodes = nodeIds.map((id) => session.rawData.nodes.find((n) => n.id === id)).filter(Boolean) as GraphNode[];
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
  const renameIdentifierLabel = document.getElementById('renameIdentifierLabel');
  const renameIdentifier = document.getElementById('renameIdentifier');
  if (renameIdentifierLabel) (renameIdentifierLabel as HTMLElement).style.display = 'none';
  if (renameIdentifier) (renameIdentifier as HTMLElement).style.display = 'none';
  setRenameModalTipButtonVisible(false);
  modal.style.display = 'flex';
  commentInput?.focus();
}

export function onRemoveRenameDataProp(name: string): void {
  editState.renameModalDataPropertyRestrictions = editState.renameModalDataPropertyRestrictions.filter((r) => r.propertyName !== name);
  nodeModalFormUi.renderRenameModalDataPropsList(editState.renameModalDataPropertyRestrictions, session.dataProperties, onRemoveRenameDataProp);
}

export function onRemoveAddNodeDataProp(name: string): void {
  editState.addNodeDataPropertyRestrictions = editState.addNodeDataPropertyRestrictions.filter((r) => r.propertyName !== name);
  nodeModalFormUi.renderAddNodeDataPropsList(editState.addNodeDataPropertyRestrictions, session.dataProperties, onRemoveAddNodeDataProp);
}

export function refreshRenameModalFromInput(): void {
  const modal = document.getElementById('renameModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const nodeId = input?.dataset.nodeId ?? '';
  nodeModalFormUi.syncRenameModal({ store: session.ttlStore, nodeId, label: input?.value?.trim() ?? '' });
}

export function refreshAddNodeOkButton(): void {
  const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
  const customTabContent = document.getElementById('addNodeCustomTab');
  const isCustomTab = customTabContent && customTabContent.style.display !== 'none';
  const allNodeIds = (session.currentGraphDataForBuild?.nodes ?? session.rawData.nodes).map((n) => n.id);
  nodeModalFormUi.syncAddNodeModal({
    store: session.ttlStore,
    existingIds: new Set(allNodeIds),
    label: customInput?.value?.trim() ?? '',
    externalLabel: editState.selectedExternalClass?.label ?? null,
    externalClassUri: editState.selectedExternalClass?.uri ?? null,
    isCustomTab: !!isCustomTab,
  });
}

// hideAddNodeModal wrapper - state cleanup still needed in main.ts
export function hideAddNodeModalWithCleanup(): void {
  editState.pendingAddNodePosition = null;
  editState.addNodeMode = false;
  editState.addNodeModalShowing = false;
  editState.selectedExternalClass = null;
  editState.addNodeAnnotationValues = {};
  editState.addNodeDataPropertyRestrictions = [];
  if (editState.addNodeSearchTimeout) {
    clearTimeout(editState.addNodeSearchTimeout);
    editState.addNodeSearchTimeout = null;
  }
  hideAddNodeModal();
}
