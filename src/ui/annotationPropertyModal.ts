/**
 * The annotation property UI: the edit modal and the edit and add handlers.
 * Moved out of main.ts (#175).
 */
import { annotationUsages } from '../lib/annotationUsages';
import { XSD_RANGE_OPTIONS } from '../lib/dataPropertyDisplay';
import { getMainOntologyBase } from '../ontology/ontologyBase';
import { extractLocalName } from '../utils/localName';
import { updateAnnotationPropertyLabelInStore, updateAnnotationPropertyCommentInStore, updateAnnotationPropertyRangeInStore, addAnnotationPropertyToStore } from '../ontology/editAnnotationProperties';
import { actions } from '../state/actions';
import { session, fileState, initFlags } from '../state/appState';
import { scheduleDisplayConfigSave } from '../workflows/displayConfigSave';
import { getDefiningOntologyFromUri } from '../workflows/propertyLists';
import { pushUndoable } from '../workflows/undoRedo';
import { type AnnotationPropsMenuDeps, initAnnotationPropsMenu } from './annotationPropertiesMenu';
import { fillUsagesSection } from './annotationUsagesView';
import { XSD_NS } from './constants';
import { showWarningIconPopover } from './dataPropertyForm';
import { isUriFromExternalOntology, getPrefixForUri } from './externalRefs';
import { updateSaveButtonVisibility } from './fileBar';

export function initEditAnnotationPropertyHandlers(): void {
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

export function showEditAnnotationPropertyModal(name: string): void {
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

export function initAddAnnotationPropertyHandlers(_annotationPropsContent?: HTMLElement): void {
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

/** Build the dependency bundle the annotation-properties menu needs (injected, so the menu
 * module stays decoupled from main.ts globals). */
export function getAnnotationPropsMenuDeps(): AnnotationPropsMenuDeps {
  return {
    getAnnotationProperties: () => session.annotationProperties,
    setAnnotationProperties: (props) => {
      session.annotationProperties = props;
    },
    getTtlStore: () => session.ttlStore,
    getExternalRefs: () => session.externalOntologyReferences,
    onApply: () => actions.applyFilter(),
    showEditModal: (name) => showEditAnnotationPropertyModal(name),
    markUnsaved: () => {
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    },
    scheduleSave: () => scheduleDisplayConfigSave(),
    pushUndoable: (undo, redo) => pushUndoable(undo, redo),
  };
}
