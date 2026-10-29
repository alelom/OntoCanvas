/**
 * The data property modals and menu: editing, deleting with confirmation, and the menu of data properties.
 * Moved out of main.ts (#175).
 */
import { revealNodeInView } from '../graph/canvasHelpers';
import { DATA_PROPERTY_RANGE_OPTIONS, domainAttachment, unattachedDataPropertyNodeId, describeRange } from '../lib/dataPropertyDisplay';
import { IDENTIFIER_CAPTION } from '../lib/identifierDisplay';
import { validateLabelForIdentifier, labelToCamelCaseIdentifier } from '../lib/identifierFromLabel';
import { getMainOntologyBase } from '../ontology/ontologyBase';
import { extractLocalName } from '../utils/localName';
import { renameDataPropertyInStore, updateDataPropertyLabelInStore, updateDataPropertyCommentInStore, updateDataPropertyRangeInStore, updateDataPropertyDomainsInStore, updateDataPropertyIsDefinedByInStore, removeDataPropertyFromStore } from '../ontology/editDataProperties';
import { removeDataPropertyRestrictionFromClass, getDataPropertyRestrictionsForClass } from '../ontology/editRestrictions';
import { actions } from '../state/actions';
import { session, initFlags, fileState } from '../state/appState';
import type { DataPropertyInfo } from '../types';
import { escapeHtml } from '../utils/escapeHtml';
import { getDefiningOntologyFromUri, currentDataProperties } from '../workflows/propertyLists';
import { updateDataPropEditableState } from './dataPropertyEditable';
import { showWarningIconPopover, renderDomainsList, updateEditDataPropIdentifierAndValidation } from './dataPropertyForm';
import { showDataRangeNotice } from './dataRangeNotice';
import { isUriFromExternalOntology, getPrefixForUri } from './externalRefs';
import { updateSaveButtonVisibility } from './fileBar';
import { propertySource } from './propertyMenuFacts';
import { groupMenuEntries } from './propertyMenuGroups';
import { renderMenuGroups } from './propertyMenuGroupsDom';

export function initDataPropsMenu(dataPropsContent: HTMLElement): void {
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
export function deleteDataPropertyWithConfirm(name: string): void {
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
    actions.applyFilter(true); // Refresh the graph to reflect the deletion
  }
  
  if (!removed && wasInArray) {
    console.warn(`Data property "${name}" was in the list but not found in store. It may have been from an external ontology or already deleted.`);
  }
}

export function initEditDataPropertyHandlers(): void {
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
    actions.applyFilter(true);
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

export function showEditDataPropertyModal(name: string): void {
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
  
  if (nameEl) nameEl.textContent = IDENTIFIER_CAPTION;
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
