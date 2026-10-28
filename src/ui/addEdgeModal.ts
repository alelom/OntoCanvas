/**
 * The add edge modal.
 * Moved out of main.ts (#175).
 */
import { getMainOntologyBase } from '../ontology/readOntology';
import { editState, session } from '../state/appState';
import { updateEditEdgeCommentDisplayLocal } from './edgeModalHelpers';
import { showEditEdgeClassExpressionNotice } from './editEdgeClassExpressionNotice';
import { showEditEdgeRestrictionNotice } from './editEdgeRestrictionNotice';
import { formatNodeLabelWithPrefix, formatRelationshipLabelWithPrefix } from './externalRefs';
import { getRelationshipLabel } from './relationshipUtils';

export function showAddEdgeModal(from: string, to: string, callback: (data: { from: string; to: string; id?: string } | null) => void): void {
  const modal = document.getElementById('editEdgeModal')!;
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap')!;
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;

  showEditEdgeClassExpressionNotice(modal, null);
  showEditEdgeRestrictionNotice(modal, null, '');
  modal.dataset.mode = 'add';
  editState.pendingAddEdgeData = { from, to, callback };
  fromSel.disabled = true;
  toSel.disabled = true;
  // Use same node list as Edit Edge modal so user-added external nodes (full URI id) appear and pre-select correctly
  const nodesForDropdown = session.currentGraphDataForBuild?.nodes ?? session.rawData.nodes;
  fromSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === from ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, session.externalOntologyReferences)}</option>`).join('');
  toSel.innerHTML = nodesForDropdown.map((n) => `<option value="${n.id}"${n.id === to ? ' selected' : ''}>${formatNodeLabelWithPrefix(n, session.externalOntologyReferences)}</option>`).join('');
  const typeInputAdd = document.getElementById('editEdgeType') as HTMLInputElement;
  if (typeInputAdd) {
    const defaultType = 'subClassOf';
    const label = getRelationshipLabel(defaultType, session.objectProperties, session.externalOntologyReferences);
    const op = session.objectProperties.find((p) => p.name === defaultType || p.uri === defaultType);
    const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
    const displayLabel = formatRelationshipLabelWithPrefix(defaultType, label, session.externalOntologyReferences, op, mainBase);
    typeInputAdd.value = displayLabel;
    editState.selectedEdgeType = defaultType;
    editState.selectedExternalObjectProperty = null;
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
