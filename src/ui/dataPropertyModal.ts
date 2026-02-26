/**
 * Data property modal: identifier display and validation for Add data property.
 */

import type { Store } from 'n3';
import type { DataPropertyInfo } from '../types';
import { getDisplayBase } from '../lib/displayBase';
import { labelToCamelCaseIdentifier, validateLabelForIdentifierWithUniqueness } from '../lib/identifierFromLabel';

export function updateAddDataPropIdentifierAndValidation(
  store: Store | null,
  dataProperties: DataPropertyInfo[]
): void {
  const labelInput = document.getElementById('addDataPropLabel') as HTMLInputElement;
  const identifierEl = document.getElementById('addDataPropIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('addDataPropLabelValidation') as HTMLElement;
  const okBtn = document.getElementById('addDataPropConfirm') as HTMLButtonElement;
  const lbl = labelInput?.value?.trim() ?? '';
  const baseWithHash = getDisplayBase(store);
  if (identifierEl) {
    const derived = labelToCamelCaseIdentifier(lbl) || '';
    identifierEl.textContent = derived ? (derived.startsWith('http') ? derived : baseWithHash + derived) : '';
  }
  if (labelValidationEl && okBtn) {
    if (!lbl) {
      labelValidationEl.style.display = 'block';
      labelValidationEl.style.color = '#c0392b';
      labelValidationEl.textContent = 'Label is required.';
      okBtn.disabled = true;
      return;
    }
    const existingNames = new Set(dataProperties.map((dp) => dp.name));
    const result = validateLabelForIdentifierWithUniqueness(lbl, existingNames, {
      duplicateMessage: 'A data property with this identifier already exists.',
    });
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
