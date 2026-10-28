/**
 * The rename (edit class properties) modal.
 * Moved out of main.ts (#175).
 */
import { isDefinedElsewhere } from '../graph/definedElsewhere';
import { getMainOntologyBase } from '../ontology/readOntology';
import { session, editState, fileState } from '../state/appState';
import { buildAnnotationPropsDeps } from '../workflows/propertyLists';
import { isUriFromExternalOntology, getNodeOntologyUrl } from './externalRefs';
import * as nodeModalFormUi from './nodeModalFormUi';
import { refreshRenameModalFromInput, onRemoveRenameDataProp } from './nodeModalHelpers';
import { setRenameModalTipButtonVisible } from './renameModalHeaderIcons';

export function showRenameModal(
  nodeId: string,
  currentLabel: string,
  _labellableRoot: boolean | null
): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const titleEl = modal.querySelector('h3');
  if (titleEl) titleEl.textContent = 'Edit class properties';
  modal.dataset.mode = 'single';
  delete modal.dataset.nodeIds;
  input.value = currentLabel;
  input.disabled = false;
  input.style.color = '';
  input.dataset.nodeId = nodeId;
  const renameDupErr = document.getElementById('renameDuplicateError') as HTMLElement;
  if (renameDupErr) { renameDupErr.style.display = 'none'; renameDupErr.textContent = ''; }
  refreshRenameModalFromInput();
  const node = session.rawData.nodes.find((n) => n.id === nodeId);
  const isExternal = node?.isExternal && node?.externalOntologyUrl;
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  // A class declared locally but defined elsewhere (rdfs:isDefinedBy → another ontology) is
  // read-only here too — its real definition lives in the source ontology.
  const definedElsewhere = !!node && isDefinedElsewhere(node, mainBase);
  const isImported = !!(isExternal || definedElsewhere || (node && node.externalOntologyUrl && isUriFromExternalOntology(node.id, node.externalOntologyUrl, session.externalOntologyReferences, mainBase)));
  
  // Add/update warning icon if imported - place it in header aligned with h3
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;

  // Use the existing rename-modal-header structure (the HTML already has this)
  let header = modalContent?.querySelector('.rename-modal-header') as HTMLElement;
  // The header already exists in the HTML, so we don't need to create it
  // Just get the header icons container
  const headerIcons = header?.querySelector('.rename-modal-header-icons') as HTMLElement || 
                      header?.querySelector('#renameModalHeaderIcons') as HTMLElement ||
                      modalContent?.querySelector('#renameModalHeaderIcons') as HTMLElement;
  let warningIcon = headerIcons?.querySelector('.imported-warning-icon') as HTMLElement;
  if (isImported && headerIcons) {
    if (!warningIcon) {
      warningIcon = document.createElement('span');
      warningIcon.className = 'imported-warning-icon warning-icon-pulse';
      warningIcon.textContent = '⚠️';
      warningIcon.style.cssText = 'cursor: pointer; font-size: 16px; line-height: 1; padding: 2px 4px; border-radius: 4px; user-select: none;';
      warningIcon.setAttribute('role', 'button');
      warningIcon.setAttribute('tabindex', '0');
      headerIcons.appendChild(warningIcon);
    } else {
      warningIcon.style.display = 'inline';
      warningIcon.classList.add('warning-icon-pulse');
    }
    const ontologyUrl = node?.externalOntologyUrl || node?.isDefinedBy || (node ? getNodeOntologyUrl(node) : null) || 'an external ontology';
    warningIcon.title = `This class is defined in the external ontology ${ontologyUrl}, so it must be edited by opening that ontology instead.`;
  } else if (warningIcon) {
    warningIcon.style.display = 'none';
    warningIcon.classList.remove('warning-icon-pulse');
  }
  
  const commentInput = document.getElementById('renameComment') as HTMLTextAreaElement;
  if (commentInput) {
    commentInput.value = node?.comment ?? '';
    commentInput.disabled = isImported;
    commentInput.style.opacity = isImported ? '0.5' : '1';
    commentInput.title = isImported ? 'Comment cannot be changed for imported classes.' : '';
  }
  if (input) {
    input.disabled = isImported;
    input.style.opacity = isImported ? '0.5' : '1';
    input.title = isImported ? 'Label cannot be changed for imported classes.' : '';
  }

  const renameIdentifierLabel = document.getElementById('renameIdentifierLabel');
  const renameIdentifier = document.getElementById('renameIdentifier');
  if (renameIdentifierLabel) (renameIdentifierLabel as HTMLElement).style.display = '';
  if (renameIdentifier) (renameIdentifier as HTMLElement).style.display = '';
  editState.renameModalAnnotationValues = {};
  setRenameModalTipButtonVisible(!fileState.fileHandle);

  // Render annotation properties
  const annotPropsSection = document.getElementById('renameAnnotationPropsSection');
  if (annotPropsSection) {
    if (session.annotationProperties.length === 0) {
      annotPropsSection.style.display = 'none';
    } else {
      annotPropsSection.style.display = 'block';
      editState.renameModalAnnotationValues = {};
      nodeModalFormUi.renderRenameModalAnnotationPropsList(
        nodeId,
        node,
        session.annotationProperties,
        buildAnnotationPropsDeps(nodeId, editState.renameModalAnnotationValues)
      );
    }
  }
  
  const dataPropsSection = document.getElementById('renameDataPropsSection');
  if (dataPropsSection) {
    if (session.dataProperties.length === 0) {
      dataPropsSection.style.display = 'none';
    } else {
      dataPropsSection.style.display = 'block';
      editState.renameModalInitialDataProps = node?.dataPropertyRestrictions ? [...node.dataPropertyRestrictions] : [];
      editState.renameModalDataPropertyRestrictions = node?.dataPropertyRestrictions ? [...node.dataPropertyRestrictions] : [];
      nodeModalFormUi.renderRenameModalDataPropsList(editState.renameModalDataPropertyRestrictions, session.dataProperties, onRemoveRenameDataProp);
      nodeModalFormUi.updateRenameDataPropAddButtonState();
    }
  }

  // Read-only parity: an imported / defined-elsewhere class cannot have its annotation or
  // data-property assignments changed either (mirrors the label/comment gating above).
  for (const section of [annotPropsSection, dataPropsSection]) {
    if (!section) continue;
    section.style.opacity = isImported ? '0.5' : '';
    section.title = isImported ? 'Cannot be changed for classes defined in another ontology.' : '';
    section.querySelectorAll('input, select, textarea, button').forEach((el) => {
      (el as HTMLInputElement).disabled = isImported;
    });
  }
  // Restore the correct add-button state for editable classes (it was just blanket-enabled above).
  if (!isImported) nodeModalFormUi.updateRenameDataPropAddButtonState();

  modal.style.display = 'flex';
  refreshRenameModalFromInput();
  input.focus();
  input.select();
}
