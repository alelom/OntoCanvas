/**
 * The Rename and Add node modals.
 * Moved out of eventListeners.ts (#198).
 */
import { session, editState } from '../../state/appState';
import { handleExternalClassSearch } from '../addNodeModal';
import { hideRenameModal } from '../modals';
import { confirmRename, confirmAddNode } from '../nodeConfirms';
import * as nodeModalFormUi from '../nodeModalFormUi';
import { refreshRenameModalFromInput, onRemoveRenameDataProp, onRemoveAddNodeDataProp, refreshAddNodeOkButton, hideAddNodeModalWithCleanup } from '../nodeModalHelpers';
import { initRenameModalHeaderIcons } from '../renameModalHeaderIcons';

export function wireNodeModals(): void {
  document.getElementById('renameCancel')?.addEventListener('click', hideRenameModal);
  document.getElementById('renameConfirm')?.addEventListener('click', confirmRename);
  document.getElementById('renameInput')?.addEventListener('input', refreshRenameModalFromInput);
  document.getElementById('renameDataPropAdd')?.addEventListener('click', () => {
    const modal = document.getElementById('renameModal')!;
    if (modal.dataset.mode !== 'single') return;
    const selectEl = document.getElementById('renameDataPropSelect') as HTMLSelectElement;
    const minEl = document.getElementById('renameDataPropMin') as HTMLInputElement;
    const maxEl = document.getElementById('renameDataPropMax') as HTMLInputElement;
    const propName = selectEl?.value?.trim();
    if (!propName) return;
    const min = minEl?.value?.trim();
    const max = maxEl?.value?.trim();
    const minCardinality = min === '' ? undefined : parseInt(min, 10);
    const maxCardinality = max === '' ? undefined : parseInt(max, 10);
    if (min !== '' && (Number.isNaN(minCardinality!) || minCardinality! < 0)) return;
    if (max !== '' && (Number.isNaN(maxCardinality!) || maxCardinality! < 0)) return;
    if (minCardinality !== undefined && maxCardinality !== undefined && minCardinality! > maxCardinality!) return;
    editState.renameModalDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    nodeModalFormUi.renderRenameModalDataPropsList(editState.renameModalDataPropertyRestrictions, session.dataProperties, onRemoveRenameDataProp);
    if (minEl) minEl.value = '';
    if (maxEl) maxEl.value = '';
  });
  document.getElementById('renameDataPropSelect')?.addEventListener('change', () => {
    nodeModalFormUi.updateRenameDataPropAddButtonState();
  });
  document.getElementById('addNodeDataPropAdd')?.addEventListener('click', () => {
    const selectEl = document.getElementById('addNodeDataPropSelect') as HTMLSelectElement;
    const minEl = document.getElementById('addNodeDataPropMin') as HTMLInputElement;
    const maxEl = document.getElementById('addNodeDataPropMax') as HTMLInputElement;
    const propName = selectEl?.value?.trim();
    if (!propName) return;
    const min = minEl?.value?.trim();
    const max = maxEl?.value?.trim();
    const minCardinality = min === '' ? undefined : parseInt(min, 10);
    const maxCardinality = max === '' ? undefined : parseInt(max, 10);
    if (min !== '' && (Number.isNaN(minCardinality!) || minCardinality! < 0)) return;
    if (max !== '' && (Number.isNaN(maxCardinality!) || maxCardinality! < 0)) return;
    if (minCardinality !== undefined && maxCardinality !== undefined && minCardinality! > maxCardinality!) return;
    editState.addNodeDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    nodeModalFormUi.renderAddNodeDataPropsList(editState.addNodeDataPropertyRestrictions, session.dataProperties, onRemoveAddNodeDataProp);
    if (minEl) minEl.value = '';
    if (maxEl) maxEl.value = '';
  });
  document.getElementById('addNodeDataPropSelect')?.addEventListener('change', () => {
    nodeModalFormUi.updateAddNodeDataPropAddButtonState();
  });
  document.getElementById('renameModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#renameModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') confirmRename();
      else hideRenameModal();
      e.preventDefault();
    }
  });
  document.getElementById('renameModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'renameModal') hideRenameModal();
  });
  const renameModalEl = document.getElementById('renameModal');
  if (renameModalEl) initRenameModalHeaderIcons(renameModalEl);

  // Tab switching
  document.querySelectorAll('.add-node-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;
      if (!tabName) return;
      
      // Update tab styles
      document.querySelectorAll('.add-node-tab').forEach((t) => {
        (t as HTMLElement).classList.remove('active');
        (t as HTMLElement).style.borderBottomColor = 'transparent';
        (t as HTMLElement).style.fontWeight = 'normal';
        (t as HTMLElement).style.color = '#666';
      });
      (tab as HTMLElement).classList.add('active');
      (tab as HTMLElement).style.borderBottomColor = '#3498db';
      (tab as HTMLElement).style.fontWeight = 'bold';
      (tab as HTMLElement).style.color = '#000';
      
      // Show/hide tab content
      const customTabContent = document.getElementById('addNodeCustomTab');
      const externalTabContent = document.getElementById('addNodeExternalTabContent');
      if (tabName === 'custom') {
        if (customTabContent) customTabContent.style.display = 'block';
        if (externalTabContent) externalTabContent.style.display = 'none';
        const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
        if (customInput) customInput.focus();
      } else {
        if (customTabContent) customTabContent.style.display = 'none';
        if (externalTabContent) externalTabContent.style.display = 'block';
        const externalInput = document.getElementById('addNodeExternalInput') as HTMLInputElement;
        if (externalInput) externalInput.focus();
      }
      
      refreshAddNodeOkButton();
    });
  });
  
  document.getElementById('addNodeInput')?.addEventListener('input', refreshAddNodeOkButton);
  document.getElementById('addNodeExternalInput')?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.trim();
    
    // Clear previous timeout
    if (editState.addNodeSearchTimeout) {
      clearTimeout(editState.addNodeSearchTimeout);
    }
    
    // Debounce search
    editState.addNodeSearchTimeout = setTimeout(() => {
      handleExternalClassSearch(query).catch((err) => {
        console.error('Search error:', err);
      });
    }, 300);
    
    refreshAddNodeOkButton();
  });
  
  document.getElementById('addNodeCancel')?.addEventListener('click', hideAddNodeModalWithCleanup);
  document.getElementById('addNodeConfirm')?.addEventListener('click', confirmAddNode);
  document.getElementById('addNodeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#addNodeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') {
        const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
        if (okBtn && !okBtn.disabled) confirmAddNode();
      } else {
        hideAddNodeModalWithCleanup();
      }
      e.preventDefault();
    }
  });
  document.getElementById('addNodeModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'addNodeModal') hideAddNodeModalWithCleanup();
  });
}
