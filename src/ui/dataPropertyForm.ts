/**
 * Parts of the data property forms: the identifier checks of the add and edit forms, the list of domains, and the
 * warning icon popover. Moved out of main.ts (#175).
 */
import { getDisplayBase } from '../lib/displayBase';
import { validateLabelForIdentifier } from '../lib/identifierFromLabel';
import { propertyIdentifierLine } from '../lib/identifierDisplay';
import { getMainOntologyBase } from '../ontology/ontologyBase';
import { session } from '../state/appState';
import { updateAddDataPropIdentifierAndValidation as updateAddDataPropIdentifierAndValidationFromModal } from './dataPropertyModal';
import { isUriFromExternalOntology, importedIdentifier } from './externalRefs';

// Helper to show warning icon popover (similar to rename modal popover)
export function showWarningIconPopover(anchor: HTMLElement, message: string, modal: HTMLElement): void {
  const modalContent = modal.querySelector('.modal-content') as HTMLElement;
  if (!modalContent) return;
  
  // Get or create popover element
  let popover = modalContent.querySelector('.warning-icon-popover') as HTMLElement;
  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'warning-icon-popover rename-popover';
    popover.setAttribute('role', 'tooltip');
    modalContent.appendChild(popover);
  }
  
  // Position and show popover
  const rect = anchor.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.left = `${rect.left}px`;
  popover.style.top = `${rect.bottom + 6}px`;
  popover.style.maxWidth = 'min(320px, calc(100vw - 24px))';
  popover.textContent = message;
  
  // Prefer opening above if too close to bottom
  const popoverHeight = 80;
  if (rect.bottom + popoverHeight + 8 > window.innerHeight && rect.top - popoverHeight - 8 > 0) {
    popover.style.top = `${rect.top - popoverHeight - 8}px`;
  }
  
  popover.classList.add('rename-popover-visible');
  
  // Hide popover when clicking outside
  const hidePopover = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.warning-icon-popover') && !target.closest('.imported-warning-icon')) {
      popover.classList.remove('rename-popover-visible');
      document.removeEventListener('click', hidePopover);
    }
  };
  
  // Use setTimeout to avoid immediate hiding
  setTimeout(() => {
    document.addEventListener('click', hidePopover);
  }, 0);
}

export function updateEditDataPropIdentifierAndValidation(): void {
  const modal = document.getElementById('editDataPropertyModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  const name = (modal as HTMLElement).dataset.dataPropName;
  if (!name) return;
  const labelInput = document.getElementById('editDataPropLabel') as HTMLInputElement;
  const identifierEl = document.getElementById('editDataPropIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('editDataPropLabelValidation') as HTMLElement;
  const okBtn = document.getElementById('editDataPropConfirm') as HTMLButtonElement;
  const definedByInput = document.getElementById('editDataPropDefinedBy') as HTMLInputElement;
  const dp = session.dataProperties.find((p) => p.name === name);
  const baseWithHash = getDisplayBase(session.ttlStore);
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const newDefinedBy = definedByInput?.value?.trim() || null;
  // Check if imported: use newDefinedBy if present, otherwise check if URI belongs to external ontology
  const isImported = dp ? (newDefinedBy ? isUriFromExternalOntology(dp.uri, newDefinedBy, session.externalOntologyReferences, mainBase) : isUriFromExternalOntology(dp.uri, null, session.externalOntologyReferences, mainBase)) : false;
  const lbl = labelInput?.value?.trim() ?? '';
  if (identifierEl) {
    if (isImported) {
      // Shown as prefix:name, as for object properties (#101)
      identifierEl.textContent = dp?.uri
        ? importedIdentifier(dp.uri, newDefinedBy ?? dp.isDefinedBy, session.externalOntologyReferences, mainBase)
        : baseWithHash + (dp?.name ?? name);
    } else {
      // The property's real IRI, until a changed label gives it another name (#146).
      const line = propertyIdentifierLine({ iri: dp?.uri ?? baseWithHash + (dp?.name ?? name), originalLabel: dp?.label, newLabel: lbl });
      identifierEl.textContent = line.text;
      const captionEl = document.getElementById('editDataPropName');
      if (captionEl) captionEl.textContent = line.caption;
    }
  }
  if (labelValidationEl && okBtn) {
    if (isImported) {
      labelValidationEl.style.display = 'none';
      okBtn.disabled = false;
      return;
    }
    if (!lbl) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#c0392b';
      labelValidationEl.textContent = 'Label is required.';
      okBtn.disabled = true;
      return;
    }
    const result = validateLabelForIdentifier(lbl);
    if (!result.valid) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#c0392b';
      labelValidationEl.textContent = result.error ?? 'Invalid label.';
      okBtn.disabled = true;
      return;
    }
    if (result.warning) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#b8860b';
      labelValidationEl.textContent = result.warning;
    } else {
      labelValidationEl.style.display = 'none';
      labelValidationEl.textContent = '';
    }
    okBtn.disabled = false;
  }
}

/**
 * Render the domain list of a data property. An asserted `rdfs:domain owl:Thing` and no asserted
 * domain at all are different facts, so they get different rows rather than both showing owl:Thing.
 */
export function renderDomainsList(domainsListEl: HTMLElement, domains: string[], hasGlobalDomain = false): void {
  domainsListEl.innerHTML = '';
  
  if (domains.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px; margin-bottom: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;';
    emptyItem.innerHTML = hasGlobalDomain
      ? `<span style="font-size: 11px; font-family: Consolas, monospace;">owl:Thing</span>
         <span style="font-size: 10px; color: #999;">(asserted - all classes)</span>`
      : `<span style="font-size: 11px; color: #999; font-style: italic;">No domain asserted</span>
         <span style="font-size: 10px; color: #999;">(not attached to any class)</span>`;
    domainsListEl.appendChild(emptyItem);
  } else {
    // Show custom domains with delete buttons
    domains.forEach((domainName) => {
      const domainItem = document.createElement('div');
      domainItem.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 6px; margin-bottom: 4px; background: #fff; border: 1px solid #ddd; border-radius: 4px;';
      domainItem.innerHTML = `
        <span style="font-size: 11px; font-family: Consolas, monospace;">${domainName}</span>
        <button type="button" class="domain-delete-btn" data-domain="${domainName}" title="Delete domain" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>
      `;
      domainsListEl.appendChild(domainItem);
    });
  }
  
  // Add delete button handlers
  domainsListEl.querySelectorAll('.domain-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const domainName = (btn as HTMLElement).dataset.domain!;
      const modal = document.getElementById('editDataPropertyModal')!;
      const name = (modal as HTMLElement).dataset.dataPropName!;
      const dp = session.dataProperties.find((p) => p.name === name);
      if (!dp) return;
      
      // Remove domain from array
      const newDomains = dp.domains.filter((d) => d !== domainName);
      dp.domains = newDomains;
      
      // Re-render list
      renderDomainsList(domainsListEl, newDomains, dp.hasGlobalDomain);
    });
  });
}

export function updateAddDataPropIdentifierAndValidation(): void {
  updateAddDataPropIdentifierAndValidationFromModal(session.ttlStore, session.dataProperties);
}
