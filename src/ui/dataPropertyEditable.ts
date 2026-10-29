/**
 * Which parts of the edit data property modal can be edited, depending on where the property is defined.
 * Moved out of main.ts (#175).
 */
import { getMainOntologyBase } from '../ontology/ontologyBase';
import { session } from '../state/appState';
import { getDefiningOntologyFromUri } from '../workflows/propertyLists';
import { showWarningIconPopover, updateEditDataPropIdentifierAndValidation } from './dataPropertyForm';
import { isUriFromExternalOntology } from './externalRefs';

// Update editable state when isDefinedBy changes
export function updateDataPropEditableState(): void {
  const modal = document.getElementById('editDataPropertyModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  const name = (modal as HTMLElement).dataset.dataPropName;
  if (!name) return;
  const definedByInput = document.getElementById('editDataPropDefinedBy') as HTMLInputElement;
  const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
  const commentInput = document.getElementById('editDataPropComment') as HTMLTextAreaElement;
  const rangeSel = document.getElementById('editDataPropRange') as HTMLSelectElement;
  const dp = session.dataProperties.find((p) => p.name === name);
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const newDefinedBy = definedByInput?.value?.trim() || null;
  // Check if imported: use newDefinedBy if present, otherwise check if URI belongs to external ontology
  const isImported = dp ? (newDefinedBy ? isUriFromExternalOntology(dp.uri, newDefinedBy, session.externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, session.externalOntologyReferences, mainBase)) : false;
  
  // Update warning icon in header
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  const header = modalContent?.querySelector('.modal-header') as HTMLElement;
  const headerIcons = header?.querySelector('.modal-header-icons') as HTMLElement;
  let warningIcon = headerIcons?.querySelector('.imported-warning-icon') as HTMLElement;
  if (isImported && headerIcons) {
    const ontologyUrl = newDefinedBy || (dp?.uri ? getDefiningOntologyFromUri(dp.uri, session.externalOntologyReferences) : 'an external ontology');
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
  
  // Update input states
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
  
  updateEditDataPropIdentifierAndValidation();
}
