/**
 * The relationship type UI: the edit and add handlers, the edit modal and the edge styles menu.
 * Moved out of main.ts (#175).
 */
import { getDefaultEdgeColors, getDefaultColor } from '../graph';
import { getDisplayBase } from '../lib/displayBase';
import { validateLabelForIdentifier, labelToCamelCaseIdentifier, validateLabelForIdentifierWithUniqueness } from '../lib/identifierFromLabel';
import { extractLocalName, renameObjectPropertyInStore, updateObjectPropertyLabelInStore, updateObjectPropertyCommentInStore, updateObjectPropertyDomainRangeInStore, namesOwlThing, updateObjectPropertySubPropertyOfInStore, updateObjectPropertyIsDefinedByInStore, getMainOntologyBase, removeObjectPropertyFromStore, addObjectPropertyToStore } from '../parser';
import { actions } from '../state/actions';
import { initFlags, session, fileState, canvasState } from '../state/appState';
import type { ObjectPropertyInfo } from '../types';
import { isDebugMode, debugLog } from '../utils/debug';
import { escapeHtml } from '../utils/escapeHtml';
import { forgetNodePositions } from '../workflows/nodePositions';
import { currentObjectProperties, getDefiningOntologyFromUri } from '../workflows/propertyLists';
import { showWarningIconPopover } from './dataPropertyForm';
import { updateEdgeColorsLegend } from './edgeStyleUtils';
import { isUriFromExternalOntology, getPrefixForUri, formatRelationshipLabelWithPrefix } from './externalRefs';
import { updateSaveButtonVisibility } from './fileBar';
import { propertySource } from './propertyMenuFacts';
import { groupMenuEntries } from './propertyMenuGroups';
import { renderMenuGroups } from './propertyMenuGroupsDom';
import { setupClassSelector, setupPropertySelector, updateEditRelTypeIdentifierAndValidation, updateAddRelTypeIdentifierAndValidation } from './relationshipTypeForm';
import { cleanupUnusedExternalProperties, getAllRelationshipTypes, colourableRelationshipTypes, getRelationshipLabel } from './relationshipUtils';

export function initEditRelationshipTypeHandlers(edgeStylesContent: HTMLElement, onApply: () => void): void {
  if (initFlags.editRelationshipTypeHandlersInitialized) return;
  initFlags.editRelationshipTypeHandlersInitialized = true;
  setupClassSelector('editRelTypeDomain', 'editRelTypeDomainResults');
  setupClassSelector('editRelTypeRange', 'editRelTypeRangeResults');
  setupPropertySelector('editRelTypeSubPropertyOf', 'editRelTypeSubPropertyOfResults');
  document.getElementById('editRelTypeLabel')?.addEventListener('input', updateEditRelTypeIdentifierAndValidation);
  document.getElementById('editRelTypeCancel')?.addEventListener('click', () => {
    document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
  });
  document.getElementById('editRelTypeConfirm')?.addEventListener('click', () => {
    const modal = document.getElementById('editRelationshipTypeModal') as HTMLElement;
    const type = modal.dataset.type!;
    const labelInput = document.getElementById('editRelTypeLabel') as HTMLInputElement;
    const commentInput = document.getElementById('editRelTypeComment') as HTMLTextAreaElement;
    const domainInput = document.getElementById('editRelTypeDomain') as HTMLInputElement;
    const rangeInput = document.getElementById('editRelTypeRange') as HTMLInputElement;
    const subPropertyOfInput = document.getElementById('editRelTypeSubPropertyOf') as HTMLInputElement;
    const definedByInput = document.getElementById('editRelTypeDefinedBy') as HTMLInputElement;
    const newLabel = labelInput?.value?.trim() ?? '';
    const newComment = commentInput?.value?.trim() ?? '';
    const newDomain = domainInput?.value?.trim() ?? '';
    const newRange = rangeInput?.value?.trim() ?? '';
    const newSubPropertyOf = subPropertyOfInput?.value?.trim() ?? '';
    const newDefinedBy = definedByInput?.value?.trim() ?? null;
    if (!session.ttlStore) return;
    const op = session.objectProperties.find((p) => p.name === type);
    if (!op) return;
    const isImported = !!op.isDefinedBy;
    if (!isImported && !newLabel) return;
    if (!isImported) {
      const validation = validateLabelForIdentifier(newLabel);
      if (!validation.valid) return;
    }
    const oldLabel = op.label;
    const oldComment = op.comment ?? '';
    const oldDomain = op.domain ?? (op.hasGlobalDomain ? 'owl:Thing' : '');
    const oldRange = op.range ?? (op.hasGlobalRange ? 'owl:Thing' : '');
    const oldSubPropertyOf = op.subPropertyOf ?? '';
    const oldDefinedBy = op.isDefinedBy ?? '';
    const labelChanged = oldLabel !== newLabel;
    const commentChanged = oldComment !== newComment;
    const domainChanged = oldDomain !== newDomain;
    const rangeChanged = oldRange !== newRange;
    const subPropertyOfChanged = oldSubPropertyOf !== newSubPropertyOf;
    const definedByChanged = (oldDefinedBy || '') !== (newDefinedBy || '');
    // The identifier is derived from the label and has no input of its own, so it can only
    // change as a consequence of a label edit. Deriving it when the label is untouched
    // spuriously renames terms whose label diverges from their local name (issue #33).
    const derivedId = !isImported && newLabel && labelChanged ? labelToCamelCaseIdentifier(newLabel) : null;
    const identifierChanged = !!derivedId && derivedId !== (op.uri ? extractLocalName(op.uri) : op.name);
    if (!labelChanged && !commentChanged && !domainChanged && !rangeChanged && !subPropertyOfChanged && !definedByChanged && !identifierChanged) {
      document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
      return;
    }
    let effectiveType = type;
    if (identifierChanged && op.uri && !op.isDefinedBy) {
      const renamed = renameObjectPropertyInStore(session.ttlStore, op.uri, derivedId!);
      if (renamed) {
        for (const e of session.rawData.edges) {
          if (e.type === type) e.type = derivedId!;
        }
        session.objectProperties = currentObjectProperties(session.ttlStore);
        session.objectProperties = cleanupUnusedExternalProperties(session.rawData, session.objectProperties);
        effectiveType = derivedId!;
      }
    }
    if (labelChanged) {
      updateObjectPropertyLabelInStore(session.ttlStore, effectiveType, newLabel);
      const o = session.objectProperties.find((p) => p.name === effectiveType);
      if (o) o.label = newLabel;
    }
    if (commentChanged) {
      updateObjectPropertyCommentInStore(session.ttlStore, effectiveType, newComment || null);
      const o = session.objectProperties.find((p) => p.name === effectiveType);
      if (o) o.comment = newComment || undefined;
    }
    if (domainChanged || rangeChanged) {
      updateObjectPropertyDomainRangeInStore(
        session.ttlStore,
        effectiveType,
        newDomain ? newDomain : null,
        newRange ? newRange : null
      );
      const o = session.objectProperties.find((p) => p.name === effectiveType);
      if (o) {
        // Same predicate the store writer uses, so the in-memory view cannot disagree with what
        // was written: the class field also accepts the full owl#Thing URI.
        o.hasGlobalDomain = namesOwlThing(newDomain);
        o.hasGlobalRange = namesOwlThing(newRange);
        o.domain = o.hasGlobalDomain ? undefined : newDomain || undefined;
        o.range = o.hasGlobalRange ? undefined : newRange || undefined;
      }
    }
    if (subPropertyOfChanged) {
      updateObjectPropertySubPropertyOfInStore(session.ttlStore, effectiveType, newSubPropertyOf ? newSubPropertyOf : null);
      const o = session.objectProperties.find((p) => p.name === effectiveType);
      if (o) o.subPropertyOf = newSubPropertyOf || undefined;
    }
    if (definedByChanged) {
      updateObjectPropertyIsDefinedByInStore(session.ttlStore, effectiveType, newDefinedBy && newDefinedBy.startsWith('http') ? newDefinedBy : null);
      const o = session.objectProperties.find((p) => p.name === effectiveType);
      if (o) o.isDefinedBy = (newDefinedBy && newDefinedBy.startsWith('http') ? newDefinedBy : null) ?? undefined;
    }
    fileState.hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    initEdgeStylesMenu(edgeStylesContent, onApply);
    updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences);
    actions.applyFilter(true);
    document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
  });
  document.getElementById('editRelationshipTypeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#editRelationshipTypeModal') && e.key === 'Escape') {
      document.getElementById('editRelationshipTypeModal')!.style.display = 'none';
      e.preventDefault();
    }
  });
}

export function showEditRelationshipTypeModal(type: string, edgeStylesContent: HTMLElement, onApply: () => void): void {
  // Declared only in an import (#104): editing it would write it into this ontology.
  if (session.objectProperties.find((p) => p.name === type || p.uri === type)?.contextOnly) return;
  initEditRelationshipTypeHandlers(edgeStylesContent, onApply);
  const modal = document.getElementById('editRelationshipTypeModal')!;
  modal.dataset.type = type;
  const nameEl = document.getElementById('editRelTypeName') as HTMLElement;
  const labelInput = document.getElementById('editRelTypeLabel') as HTMLInputElement;
  const commentInput = document.getElementById('editRelTypeComment') as HTMLTextAreaElement;
  const domainInput = document.getElementById('editRelTypeDomain') as HTMLInputElement;
  const rangeInput = document.getElementById('editRelTypeRange') as HTMLInputElement;
  const domainResults = document.getElementById('editRelTypeDomainResults');
  const rangeResults = document.getElementById('editRelTypeRangeResults');
  const subPropertyOfInput = document.getElementById('editRelTypeSubPropertyOf') as HTMLInputElement;
  const subPropertyOfResults = document.getElementById('editRelTypeSubPropertyOfResults');
  // Find property by name or URI (type might be full URI for external properties)
  const op = session.objectProperties.find((p) => p.name === type || p.uri === type || (type.startsWith('http') && p.uri === type));
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  // Check if imported: use isDefinedBy if present and valid URL, otherwise check if URI belongs to external ontology
  const hasValidDefinedBy = op?.isDefinedBy && (op.isDefinedBy.startsWith('http://') || op.isDefinedBy.startsWith('https://'));
  const isImported = op ? (hasValidDefinedBy ? isUriFromExternalOntology(op.uri, op.isDefinedBy, session.externalOntologyReferences, mainBase) : isUriFromExternalOntology(op.uri, null, session.externalOntologyReferences, mainBase)) : false;
  
  // Add/update warning icon if imported - place it in header aligned with h3
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  const h3 = modalContent?.querySelector('h3') as HTMLElement;
  
  // Ensure header structure exists (similar to rename modal)
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
  if (isImported && headerIcons) {
    const ontologyUrl = hasValidDefinedBy ? op?.isDefinedBy : (op?.uri ? getDefiningOntologyFromUri(op.uri, session.externalOntologyReferences) : 'an external ontology');
    const warningMessage = `This object property is defined in the external ontology ${ontologyUrl}, so it must be edited by opening that ontology instead.`;
    
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
  
  if (labelInput) labelInput.value = op?.label ?? type;
  if (commentInput) commentInput.value = op?.comment ?? '';
  // An asserted owl:Thing is shown as such, so the user can see it and delete it if they want the
  // property to assert no domain. A blank field means the ontology asserts nothing.
  if (domainInput) domainInput.value = op?.domain ?? (op?.hasGlobalDomain ? 'owl:Thing' : '');
  if (rangeInput) rangeInput.value = op?.range ?? (op?.hasGlobalRange ? 'owl:Thing' : '');
  if (subPropertyOfInput) {
    const subUri = op?.subPropertyOf ?? '';
    if (subUri) {
      const parentOp = session.objectProperties.find((p) => p.uri === subUri || p.name === subUri);
      subPropertyOfInput.value = parentOp ? parentOp.name : subUri;
    } else {
      subPropertyOfInput.value = '';
    }
  }
  const definedByInput = document.getElementById('editRelTypeDefinedBy') as HTMLInputElement;
  const identifierEl = document.getElementById('editRelTypeIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('editRelTypeLabelValidation') as HTMLElement;
  const baseWithHash = getDisplayBase(session.ttlStore);
  if (nameEl) nameEl.textContent = 'Identifier (derived from label):';
  if (identifierEl) {
    if (isImported && op) {
      // For imported properties, show with prefix format (e.g., "base:connectsTo")
      const label = op.label || extractLocalName(op.uri || op.name || type);
      const prefix = getPrefixForUri(op.uri, op.isDefinedBy, session.externalOntologyReferences, mainBase);
      if (prefix) {
        identifierEl.textContent = `${prefix}:${label}`;
      } else {
        const currentId = op.uri ?? op.name ?? type;
        identifierEl.textContent = (currentId.startsWith('http') ? currentId : baseWithHash + currentId);
      }
    } else {
      const currentId = op?.uri ?? baseWithHash + (op?.name ?? type);
      identifierEl.textContent = (currentId.startsWith('http') ? currentId : baseWithHash + currentId);
    }
  }
  if (definedByInput) {
    definedByInput.value = op?.isDefinedBy ?? '';
    // Always disable definedBy field
    definedByInput.disabled = true;
    definedByInput.style.opacity = '0.5';
    definedByInput.title = 'This field cannot be edited.';
  }
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
  if (domainInput) {
    domainInput.disabled = isImported;
    domainInput.style.opacity = isImported ? '0.5' : '1';
  }
  if (rangeInput) {
    rangeInput.disabled = isImported;
    rangeInput.style.opacity = isImported ? '0.5' : '1';
  }
  if (subPropertyOfInput) {
    subPropertyOfInput.disabled = isImported;
    subPropertyOfInput.style.opacity = isImported ? '0.5' : '1';
  }
  if (labelValidationEl) {
    labelValidationEl.style.display = 'none';
    labelValidationEl.textContent = '';
  }
  updateEditRelTypeIdentifierAndValidation();
  if (domainResults) (domainResults as HTMLElement).style.display = 'none';
  if (rangeResults) (rangeResults as HTMLElement).style.display = 'none';
  if (subPropertyOfResults) (subPropertyOfResults as HTMLElement).style.display = 'none';
  modal.style.display = 'flex';
  labelInput?.focus();
}

export function initEdgeStylesMenu(
  edgeStylesContent: HTMLElement,
  onApply: () => void,
  options: { preserveStyles?: boolean } = {}
): void {
  // When the menu is only being extended (imports read, #104), what the user or a saved config set stays.
  const preserved = new Map<string, { show: boolean; showLabel: boolean; color: string }>();
  if (options.preserveStyles) {
    edgeStylesContent.querySelectorAll<HTMLInputElement>('.edge-show-cb').forEach((showCb) => {
      const type = showCb.dataset.type!;
      const escaped = CSS.escape(type);
      preserved.set(type, {
        show: showCb.checked,
        showLabel: !!edgeStylesContent.querySelector<HTMLInputElement>(`.edge-label-cb[data-type="${escaped}"]`)?.checked,
        color: edgeStylesContent.querySelector<HTMLInputElement>(`.edge-color-picker[data-type="${escaped}"]`)?.value ?? '',
      });
    });
  }
  edgeStylesContent.innerHTML = '';
  const types = getAllRelationshipTypes(session.rawData, session.objectProperties);
  // Get default colors for all types (distributed across spectrum)
  const defaultColors = getDefaultEdgeColors(colourableRelationshipTypes(types, session.objectProperties));
  /** The object property a relationship type stands for: by name, URI, or local name of its URI. */
  const findOp = (type: string): ObjectPropertyInfo | undefined => session.objectProperties.find((p) => {
    // Direct match by name or URI
    if (p.name === type || p.uri === type) return true;
    
    // If type is a full URI, check if it matches p.uri or p.name (both should be full URI for external)
    if (type.startsWith('http://') || type.startsWith('https://')) {
      if (p.uri === type || p.name === type) return true;
      // Also check if p.uri or p.name contains the type (for partial matches)
      if (p.uri && (type.includes(p.uri) || p.uri.includes(type))) return true;
      if (p.name && p.name.startsWith('http') && (type.includes(p.name) || p.name.includes(type))) return true;
    }
    
    // If type is a local name, extract local name from p.uri or p.name and compare
    if (!type.startsWith('http://') && !type.startsWith('https://')) {
      // Extract local name from URI
      if (p.uri) {
        const uriLocalName = p.uri.includes('#') ? p.uri.split('#').pop() : p.uri.split('/').pop();
        if (uriLocalName === type) return true;
      }
      // Extract local name from name (if name is a full URI)
      if (p.name && (p.name.startsWith('http://') || p.name.startsWith('https://'))) {
        const nameLocalName = p.name.includes('#') ? p.name.split('#').pop() : p.name.split('/').pop();
        if (nameLocalName === type) return true;
      }
      // Direct match if p.name is the local name
      if (p.name === type && !p.name.startsWith('http://') && !p.name.startsWith('https://')) return true;
    }
    
    return false;
  });
  const rowFor = (type: string): HTMLElement => {
    // Get default color - use the generated color directly
    const color = defaultColors[type] || getDefaultColor();
    const isEditable = type !== 'subClassOf';
    const editBtn = isEditable
      ? `<button type="button" class="edge-edit-btn" data-type="${type}" title="Edit object property (name, comment)" style="background: none; border: none; cursor: pointer; padding: 2px; color: #3498db; font-size: 14px; transform: scaleX(-1);">✎</button>`
      : '';
    const deleteBtn = isEditable
      ? `<button type="button" class="edge-delete-btn" data-type="${type}" title="Delete this object property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>`
      : '';
    // subClassOf label should be unchecked by default
    const labelChecked = type === 'subClassOf' ? '' : 'checked';
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
    // HTML attributes can contain # without escaping, but we need to escape quotes
    const htmlEscapedType = type.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const baseLabel = getRelationshipLabel(type, session.objectProperties, session.externalOntologyReferences);
    // Find property by name, URI, or local name extracted from URI
    // For external properties, name should be full URI (after parser fix), and type might be full URI or local name
    const op = findOp(type);
    const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
    // Use op.uri or op.name (if full URI) for prefix detection, otherwise use type
    // This ensures imported properties get their prefix even if type is a local name
    const propertyNameForPrefix = op?.uri || (op?.name && (op.name.startsWith('http://') || op.name.startsWith('https://')) ? op.name : null) || type;
    
    // Debug: Log prefix detection for connectsTo (only in debug mode)
    if (isDebugMode() && (type.includes('connects') || (op && (op.name?.includes('connects') || op.uri?.includes('connects'))))) {
      debugLog('[PREFIX DEBUG]', {
        type,
        opFound: !!op,
        opName: op?.name,
        opUri: op?.uri,
        opIsDefinedBy: op?.isDefinedBy,
        propertyNameForPrefix,
        baseLabel,
        externalRefs: session.externalOntologyReferences.map(r => ({ url: r.url, prefix: r.prefix, usePrefix: r.usePrefix })),
      });
    }
    
    const displayLabel = formatRelationshipLabelWithPrefix(propertyNameForPrefix, baseLabel, session.externalOntologyReferences, op, mainBase);
    row.innerHTML = `
      <span class="prop-name" style="font-weight: bold; font-family: Consolas, monospace; font-size: 12px; min-width: 100px;">${escapeHtml(displayLabel)}</span>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-show-cb" data-type="${htmlEscapedType}" checked>
        <span>Show</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-label-cb" data-type="${htmlEscapedType}" ${labelChecked}>
        <span>Label</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;" title="Makes the tiers of the hierarchical layouts: the source above the target (a superclass above its subclasses). Changing it lays the graph out again.">
        <input type="checkbox" class="edge-tier-cb" data-type="${htmlEscapedType}" ${canvasState.hierarchyTypes.has(type) ? 'checked' : ''}>
        <span>Tiers</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 11px;">Color:</span>
        <input type="color" class="edge-color-picker" data-type="${htmlEscapedType}" value="${color}" style="width: 28px; height: 22px; padding: 0; border: 1px solid #ccc; cursor: pointer;">
      </label>
      ${editBtn.replace(`data-type="${type}"`, `data-type="${htmlEscapedType}"`)}
      ${deleteBtn.replace(`data-type="${type}"`, `data-type="${htmlEscapedType}"`)}
    `;
    // A property declared only in an import is not in this file: there is nothing to edit or delete (#104).
    if (op?.contextOnly) row.querySelectorAll('.edge-edit-btn, .edge-delete-btn').forEach((btn) => btn.remove());
    const before = preserved.get(type);
    if (before) {
      (row.querySelector('.edge-show-cb') as HTMLInputElement).checked = before.show;
      (row.querySelector('.edge-label-cb') as HTMLInputElement).checked = before.showLabel;
      if (before.color) (row.querySelector('.edge-color-picker') as HTMLInputElement).value = before.color;
    }
    return row;
  };
  // The ontology's own properties first, the imported ones in a collapsed group below (#137); a group holding a
  // hidden relationship type starts open, so what hides it is never hidden itself.
  const mainBaseForGroups = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const entries = types.map((type) => {
    const op = findOp(type);
    return {
      item: { type, comment: op?.comment },
      source: propertySource(op ?? { uri: /^https?:\/\//.test(type) ? type : null }, session.externalOntologyReferences, mainBaseForGroups),
      deprecated: !!op?.deprecated,
    };
  });
  renderMenuGroups(edgeStylesContent, groupMenuEntries(entries), ({ item }) => rowFor(item.type));
  edgeStylesContent
    .querySelectorAll('.edge-show-cb, .edge-label-cb, .edge-color-picker')
    .forEach((el) => el.addEventListener('change', () => { onApply(); updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences); }));
  edgeStylesContent.querySelectorAll<HTMLInputElement>('.edge-tier-cb').forEach((cb) =>
    cb.addEventListener('change', () => {
      if (cb.checked) canvasState.hierarchyTypes.add(cb.dataset.type!);
      else canvasState.hierarchyTypes.delete(cb.dataset.type!);
      forgetNodePositions();
      onApply();
    })
  );
  edgeStylesContent.querySelectorAll('.edge-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.type!;
      showEditRelationshipTypeModal(type, edgeStylesContent, onApply);
    });
  });
  edgeStylesContent.querySelectorAll('.edge-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = (btn as HTMLElement).dataset.type!;
      const count = session.rawData.edges.filter((e) => e.type === type).length;
      const msg =
        count === 0
          ? `Delete object property "${type}"?`
          : `You're going to delete ${count} edge${count === 1 ? '' : 's'} by deleting this object property. Are you sure?`;
      if (!confirm(msg)) return;
      if (!session.ttlStore) return;
      const removed = removeObjectPropertyFromStore(session.ttlStore, type);
      if (removed >= 0) {
        session.rawData.edges = session.rawData.edges.filter((e) => e.type !== type);
        session.objectProperties = session.objectProperties.filter((op) => op.name !== type);
        // Clean up unused external properties
        session.objectProperties = cleanupUnusedExternalProperties(session.rawData, session.objectProperties);
        fileState.hasUnsavedChanges = true;
        updateSaveButtonVisibility();
        initEdgeStylesMenu(edgeStylesContent, onApply);
        actions.applyFilter(true);
      }
    });
  });
  updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences);
}

export function initAddRelationshipTypeHandlers(edgeStylesContent: HTMLElement): void {
  if (initFlags.addRelationshipTypeHandlersInitialized) return;
  initFlags.addRelationshipTypeHandlersInitialized = true;
  setupClassSelector('addRelTypeDomain', 'addRelTypeDomainResults');
  setupClassSelector('addRelTypeRange', 'addRelTypeRangeResults');
  setupPropertySelector('addRelTypeSubPropertyOf', 'addRelTypeSubPropertyOfResults', () => null);
  const labelInput = document.getElementById('addRelTypeLabel') as HTMLInputElement;
  if (labelInput) {
    labelInput.addEventListener('input', updateAddRelTypeIdentifierAndValidation);
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('addRelTypeConfirm')?.click();
    });
  }
  document.getElementById('addRelationshipTypeBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('addRelationshipTypeModal')!;
    const li = document.getElementById('addRelTypeLabel') as HTMLInputElement;
    const hasCardCb = document.getElementById('addRelTypeHasCardinality') as HTMLInputElement;
    const commentInput = document.getElementById('addRelTypeComment') as HTMLTextAreaElement;
    const domainInput = document.getElementById('addRelTypeDomain') as HTMLInputElement;
    const rangeInput = document.getElementById('addRelTypeRange') as HTMLInputElement;
    const isDefinedByInput = document.getElementById('addRelTypeIsDefinedBy') as HTMLInputElement;
    const subPropertyOfInput = document.getElementById('addRelTypeSubPropertyOf') as HTMLInputElement;
    const okBtn = document.getElementById('addRelTypeConfirm') as HTMLButtonElement;
    const labelValidationEl = document.getElementById('addRelTypeLabelValidation') as HTMLElement;
    li.value = '';
    hasCardCb.checked = true;
    if (commentInput) commentInput.value = '';
    if (domainInput) domainInput.value = '';
    if (rangeInput) rangeInput.value = '';
    if (isDefinedByInput) isDefinedByInput.value = '';
    if (subPropertyOfInput) subPropertyOfInput.value = '';
    if (labelValidationEl) {
      labelValidationEl.style.display = 'none';
      labelValidationEl.textContent = '';
    }
    okBtn.disabled = true;
    const identifierEl = document.getElementById('addRelTypeIdentifier') as HTMLElement;
    if (identifierEl) identifierEl.textContent = '';
    li.focus();
    modal.style.display = 'flex';
  });
  document.getElementById('addRelTypeCancel')?.addEventListener('click', () => {
    document.getElementById('addRelationshipTypeModal')!.style.display = 'none';
  });
  document.getElementById('addRelTypeConfirm')?.addEventListener('click', () => {
    const li = document.getElementById('addRelTypeLabel') as HTMLInputElement;
    const hasCardCb = document.getElementById('addRelTypeHasCardinality') as HTMLInputElement;
    const commentInput = document.getElementById('addRelTypeComment') as HTMLTextAreaElement;
    const domainInput = document.getElementById('addRelTypeDomain') as HTMLInputElement;
    const rangeInput = document.getElementById('addRelTypeRange') as HTMLInputElement;
    const isDefinedByInput = document.getElementById('addRelTypeIsDefinedBy') as HTMLInputElement;
    const subPropertyOfInput = document.getElementById('addRelTypeSubPropertyOf') as HTMLInputElement;
    const labelValidationEl = document.getElementById('addRelTypeLabelValidation') as HTMLElement;
    const label = li.value.trim();
    if (!session.ttlStore) return;
    const existingNames = new Set(session.objectProperties.map((op) => extractLocalName(op.name) || op.name));
    const validation = validateLabelForIdentifierWithUniqueness(label, existingNames, {
      duplicateMessage: 'An object property with this identifier already exists.',
    });
    if (!validation.valid || !validation.identifier) {
      if (labelValidationEl) {
        labelValidationEl.style.display = 'block';
        labelValidationEl.style.color = '#c0392b';
        labelValidationEl.textContent = validation.error ?? 'Label is required.';
      }
      return;
    }
    const comment = commentInput?.value?.trim() ?? null;
    const domain = domainInput?.value?.trim() ?? null;
    const range = rangeInput?.value?.trim() ?? null;
    const isDefinedBy = isDefinedByInput?.value?.trim() ?? null;
    const subPropertyOf = subPropertyOfInput?.value?.trim() ?? null;
    const name = addObjectPropertyToStore(session.ttlStore, label, hasCardCb.checked, validation.identifier, {
      comment: comment || undefined,
      isDefinedBy: isDefinedBy || undefined,
      subPropertyOf: subPropertyOf || undefined,
      domain: domain || undefined,
      range: range || undefined,
    });
    if (name) {
      session.objectProperties = currentObjectProperties(session.ttlStore);
      session.objectProperties = cleanupUnusedExternalProperties(session.rawData, session.objectProperties);
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      initEdgeStylesMenu(edgeStylesContent, actions.applyFilter);
      updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences);
      actions.applyFilter(true);
      document.getElementById('addRelationshipTypeModal')!.style.display = 'none';
    }
  });
}
