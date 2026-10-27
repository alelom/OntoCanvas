/**
 * The class and property selectors of the relationship type forms, and the identifier checks of the add and edit forms.
 * Moved out of main.ts (#175).
 */
import { getDisplayBase } from '../lib/displayBase';
import { labelToCamelCaseIdentifier, validateLabelForIdentifier } from '../lib/identifierFromLabel';
import { getMainOntologyBase } from '../parser';
import { session } from '../state/appState';
import { formatRelationshipLabelWithPrefix, isUriFromExternalOntology, importedIdentifier } from './externalRefs';
import { updateAddRelTypeIdentifierAndValidation as updateAddRelTypeIdentifierAndValidationFromModal } from './objectPropertyModal';
import { getAllRelationshipTypes, getRelationshipLabel } from './relationshipUtils';

export function setupClassSelector(inputId: string, resultsId: string): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const resultsDiv = document.getElementById(resultsId) as HTMLElement;
  if (!input || !resultsDiv) return;
  let blurTimer: number | null = null;
  const showResults = (query: string) => {
    const q = (query || '').toLowerCase().trim();
    const nodes = session.rawData.nodes.slice();
    const filtered = q
      ? nodes.filter((n) => n.id.toLowerCase().includes(q) || (n.label && n.label.toLowerCase().includes(q)))
      : nodes;
    const limit = 50;
    resultsDiv.innerHTML = '';
    filtered.slice(0, limit).forEach((n) => {
      const div = document.createElement('div');
      div.className = 'rel-type-class-option';
      div.dataset.id = n.id;
      div.textContent = n.label || n.id;
      div.style.cssText = 'padding: 6px 8px; cursor: pointer; font-size: 12px; font-family: Consolas, monospace; border-bottom: 1px solid #eee;';
      resultsDiv.appendChild(div);
    });
    resultsDiv.style.display = filtered.length > 0 ? 'block' : 'none';
  };
  const hideResults = () => {
    resultsDiv.style.display = 'none';
  };
  input.addEventListener('focus', () => {
    if (blurTimer != null) clearTimeout(blurTimer);
    blurTimer = null;
    showResults(input.value);
  });
  input.addEventListener('input', () => showResults(input.value));
  input.addEventListener('blur', () => {
    blurTimer = window.setTimeout(hideResults, 200);
  });
  resultsDiv.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (blurTimer != null) clearTimeout(blurTimer);
    blurTimer = null;
  });
  resultsDiv.addEventListener('click', (e) => {
    const opt = (e.target as HTMLElement).closest('.rel-type-class-option');
    if (opt && opt instanceof HTMLElement && opt.dataset.id != null) {
      input.value = opt.dataset.id;
      hideResults();
      input.focus();
    }
  });
}

export function setupPropertySelector(inputId: string, resultsId: string, getExcludeType?: () => string | null): void {
  const input = document.getElementById(inputId) as HTMLInputElement;
  const resultsDiv = document.getElementById(resultsId) as HTMLElement;
  if (!input || !resultsDiv) return;
  let blurTimer: number | null = null;
  const showResults = (query: string) => {
    const excludeType = getExcludeType?.() ?? (document.getElementById('editRelationshipTypeModal') as HTMLElement)?.dataset?.type ?? null;
    const types = getAllRelationshipTypes(session.rawData, session.objectProperties).filter((t) => t !== excludeType && t !== 'subClassOf');
    const q = (query || '').toLowerCase().trim();
    const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
    const filtered = q
      ? types.filter((t) => {
          const baseLabel = getRelationshipLabel(t, session.objectProperties, session.externalOntologyReferences);
          const op = session.objectProperties.find((p) => p.name === t || p.uri === t);
          const display = formatRelationshipLabelWithPrefix(t, baseLabel, session.externalOntologyReferences, op, mainBase);
          return t.toLowerCase().includes(q) || baseLabel.toLowerCase().includes(q) || display.toLowerCase().includes(q);
        })
      : types;
    const limit = 50;
    resultsDiv.innerHTML = '';
    filtered.slice(0, limit).forEach((type) => {
      const baseLabel = getRelationshipLabel(type, session.objectProperties, session.externalOntologyReferences);
      const op = session.objectProperties.find((p) => p.name === type || p.uri === type);
      const display = formatRelationshipLabelWithPrefix(type, baseLabel, session.externalOntologyReferences, op, mainBase);
      const div = document.createElement('div');
      div.className = 'rel-type-property-option';
      div.dataset.type = type;
      div.textContent = display;
      div.style.cssText = 'padding: 6px 8px; cursor: pointer; font-size: 12px; font-family: Consolas, monospace; border-bottom: 1px solid #eee;';
      resultsDiv.appendChild(div);
    });
    resultsDiv.style.display = filtered.length > 0 ? 'block' : 'none';
  };
  const hideResults = () => {
    resultsDiv.style.display = 'none';
  };
  input.addEventListener('focus', () => {
    if (blurTimer != null) clearTimeout(blurTimer);
    blurTimer = null;
    showResults(input.value);
  });
  input.addEventListener('input', () => showResults(input.value));
  input.addEventListener('blur', () => {
    blurTimer = window.setTimeout(hideResults, 200);
  });
  resultsDiv.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (blurTimer != null) clearTimeout(blurTimer);
    blurTimer = null;
  });
  resultsDiv.addEventListener('click', (e) => {
    const opt = (e.target as HTMLElement).closest('.rel-type-property-option');
    if (opt && opt instanceof HTMLElement && opt.dataset.type != null) {
      input.value = opt.dataset.type;
      hideResults();
      input.focus();
    }
  });
}

export function updateEditRelTypeIdentifierAndValidation(): void {
  const modal = document.getElementById('editRelationshipTypeModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  const type = (modal as HTMLElement).dataset.type;
  if (!type) return;
  const labelInput = document.getElementById('editRelTypeLabel') as HTMLInputElement;
  const identifierEl = document.getElementById('editRelTypeIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('editRelTypeLabelValidation') as HTMLElement;
  const okBtn = document.getElementById('editRelTypeConfirm') as HTMLButtonElement;
  const op = session.objectProperties.find((p) => p.name === type || p.uri === type);
  const baseWithHash = getDisplayBase(session.ttlStore);
  const mainBase = session.ttlStore ? getMainOntologyBase(session.ttlStore) : null;
  const hasValidDefinedBy = op?.isDefinedBy && (op.isDefinedBy.startsWith('http://') || op.isDefinedBy.startsWith('https://'));
  const isImported = op ? (hasValidDefinedBy ? isUriFromExternalOntology(op.uri, op.isDefinedBy, session.externalOntologyReferences, mainBase) : isUriFromExternalOntology(op.uri, null, session.externalOntologyReferences, mainBase)) : false;
  const lbl = labelInput?.value?.trim() ?? '';
  if (identifierEl) {
    if (isImported && op) {
      // For imported properties, show with prefix format (e.g., "base:connectsTo")
      identifierEl.textContent = op.uri
        ? importedIdentifier(op.uri, op.isDefinedBy, session.externalOntologyReferences, mainBase)
        : baseWithHash + (op.name ?? type);
    } else {
      const derived = labelToCamelCaseIdentifier(lbl) || (op?.name ?? type);
      identifierEl.textContent = derived.startsWith('http') ? derived : baseWithHash + derived;
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

export function updateAddRelTypeIdentifierAndValidation(): void {
  updateAddRelTypeIdentifierAndValidationFromModal(session.ttlStore, session.objectProperties);
}
