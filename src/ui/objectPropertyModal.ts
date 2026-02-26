/**
 * Object property modal: identifier display and validation for Add (and optionally Edit) object property.
 */

import type { Store } from 'n3';
import type { ObjectPropertyInfo } from '../types';
import { extractLocalName } from '../parser';
import { getDisplayBase } from '../lib/displayBase';
import { labelToCamelCaseIdentifier, validateLabelForIdentifierWithUniqueness } from '../lib/identifierFromLabel';

export function updateAddRelTypeIdentifierAndValidation(
  store: Store | null,
  objectProperties: ObjectPropertyInfo[]
): void {
  const labelInput = document.getElementById('addRelTypeLabel') as HTMLInputElement;
  const identifierEl = document.getElementById('addRelTypeIdentifier') as HTMLElement;
  const labelValidationEl = document.getElementById('addRelTypeLabelValidation') as HTMLElement;
  const okBtn = document.getElementById('addRelTypeConfirm') as HTMLButtonElement;
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
    const existingNames = new Set(objectProperties.map((op) => extractLocalName(op.name) || op.name));
    const result = validateLabelForIdentifierWithUniqueness(lbl, existingNames, {
      duplicateMessage: 'An object property with this identifier already exists.',
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
