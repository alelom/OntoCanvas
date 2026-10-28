/**
 * The handlers of the add data property modal.
 * Moved out of main.ts (#175).
 */
import { revealNodeInView } from '../graph/canvasHelpers';
import { DATA_PROPERTY_RANGE_OPTIONS, unattachedDataPropertyNodeId } from '../lib/dataPropertyDisplay';
import { validateLabelForIdentifierWithUniqueness } from '../lib/identifierFromLabel';
import { addDataPropertyToStore } from '../ontology/editDataProperties';
import { actions } from '../state/actions';
import { initFlags, session, fileState } from '../state/appState';
import { currentDataProperties } from '../workflows/propertyLists';
import { updateAddDataPropIdentifierAndValidation } from './dataPropertyForm';
import { updateSaveButtonVisibility } from './fileBar';

export function initAddDataPropertyHandlers(_dataPropsContent?: HTMLElement): void {
  if (initFlags.addDataPropertyHandlersInitialized) return;
  initFlags.addDataPropertyHandlersInitialized = true;
  const labelInput = document.getElementById('addDataPropLabel') as HTMLInputElement;
  const rangeSel = document.getElementById('addDataPropRange') as HTMLSelectElement;
  if (rangeSel) {
    // Consistent with the edit modal and the annotation modal: a new property must be allowed to
    // assert no range, otherwise the typing-stub pattern cannot be authored here at all.
    const rangeOptions = [{ value: '', label: 'No range asserted' }, ...DATA_PROPERTY_RANGE_OPTIONS];
    rangeSel.innerHTML = rangeOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
  }
  if (labelInput) {
    labelInput.addEventListener('input', updateAddDataPropIdentifierAndValidation);
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('addDataPropConfirm')?.click();
    });
  }
  document.getElementById('addDataPropertyBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('addDataPropertyModal')!;
    const li = document.getElementById('addDataPropLabel') as HTMLInputElement;
    const okBtn = document.getElementById('addDataPropConfirm') as HTMLButtonElement;
    const labelValidationEl = document.getElementById('addDataPropLabelValidation') as HTMLElement;
    li.value = '';
    if (labelValidationEl) {
      labelValidationEl.style.display = 'none';
      labelValidationEl.textContent = '';
    }
    okBtn.disabled = true;
    const identifierEl = document.getElementById('addDataPropIdentifier') as HTMLElement;
    if (identifierEl) identifierEl.textContent = '';
    li.focus();
    modal.style.display = 'flex';
  });
  document.getElementById('addDataPropCancel')?.addEventListener('click', () => {
    document.getElementById('addDataPropertyModal')!.style.display = 'none';
  });
  document.getElementById('addDataPropConfirm')?.addEventListener('click', () => {
    const li = document.getElementById('addDataPropLabel') as HTMLInputElement;
    const rangeEl = document.getElementById('addDataPropRange') as HTMLSelectElement;
    const labelValidationEl = document.getElementById('addDataPropLabelValidation') as HTMLElement;
    const label = li.value.trim();
    const rangeUri = rangeEl?.value ? rangeEl.value : null;
    if (!session.ttlStore) return;
    const existingNames = new Set(session.dataProperties.map((dp) => dp.name));
    const validation = validateLabelForIdentifierWithUniqueness(label, existingNames, {
      duplicateMessage: 'A data property with this identifier already exists.',
    });
    if (!validation.valid || !validation.identifier) {
      if (labelValidationEl) {
        labelValidationEl.style.display = 'block';
        labelValidationEl.style.color = '#c0392b';
        labelValidationEl.textContent = validation.error ?? 'Label is required.';
      }
      return;
    }
    const name = addDataPropertyToStore(session.ttlStore, label, rangeUri, validation.identifier);
    if (name) {
      session.dataProperties = currentDataProperties(session.ttlStore);
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      const content = document.getElementById('dataPropsContent');
      if (content) actions.initDataPropsMenu(content);
      actions.applyFilter(true);
      // The modal asks for no domain, so the property is always free-standing and lands below the
      // class graph - outside the viewport applyFilter just restored. Show the user what they made.
      revealNodeInView(unattachedDataPropertyNodeId(name));
      document.getElementById('addDataPropertyModal')!.style.display = 'none';
    }
  });
}
