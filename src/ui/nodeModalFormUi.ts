/**
 * Node modal UI: sync identifier/duplicate state and render data/annotation prop lists.
 * Stateless; data and callbacks passed from main.
 */

import type { Store } from 'n3';
import {
  updateIdentifierDisplay,
  isDuplicateIdentifier,
  ADD_NODE_DUPLICATE_MESSAGE,
} from './nodeModalForm';
import type { DataPropertyRestriction, DataPropertyInfo, AnnotationPropertyInfo, GraphNode } from '../types';
import { initAnnotationValuesSection } from './annotationValuesSection';
import { groupMenuEntries } from './propertyMenuGroups';
import { renderMenuGroups } from './propertyMenuGroupsDom';

export { ADD_NODE_DUPLICATE_MESSAGE };

/** Host hooks for rendering textual (multi-value) annotation properties in a node modal. */
export interface AnnotationPropsListDeps {
  /** Initial values for a textual annotation property (read from the store; [] for a new node). */
  getInitialValues: (ap: AnnotationPropertyInfo) => string[];
  /** Report a textual property's edited values so the host can persist them on confirm. */
  onTextualValuesChange: (propName: string, values: string[]) => void;
  /** Open a link value (e.g. in a new tab). */
  onOpenLink: (value: string) => void;
  /** How the property is grouped, as in the Annotation Properties menu (#141, #137). */
  groupFacts: (ap: AnnotationPropertyInfo) => { source: string | null; unused: boolean; deprecated: boolean };
  /** The name shown, as in the menu (`skos:altLabel`); its local name when not given. */
  displayName?: (ap: AnnotationPropertyInfo) => string;
}

/** The list scrolls rather than pushing the rest of the dialog down (#141). */
const LIST_MAX_HEIGHT = '260px';

/** One annotation property row: boolean -> checkbox; textual -> multi-value section. */
function createAnnotationPropItem(
  ap: AnnotationPropertyInfo,
  currentBooleanValue: boolean | string | null | undefined,
  idPrefix: string,
  deps: AnnotationPropsListDeps
): HTMLElement {
  const item = document.createElement('div');

  if (ap.isBoolean) {
    item.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 4px;';
    const label = document.createElement('span');
    label.className = 'prop-name';
    label.style.cssText = 'font-size: 11px; font-weight: bold; min-width: 120px;';
    label.textContent = deps.displayName?.(ap) ?? ap.name;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `${idPrefix}${ap.name}`;
    checkbox.checked = currentBooleanValue === true;
    checkbox.indeterminate = currentBooleanValue === null || currentBooleanValue === undefined;
    checkbox.style.cssText = 'margin: 0; vertical-align: middle;';
    item.appendChild(label);
    item.appendChild(checkbox);
    return item;
  }

  item.style.cssText = 'margin-bottom: 10px; padding: 4px;';
  const label = document.createElement('div');
  label.className = 'prop-name';
  label.style.cssText = 'font-size: 11px; font-weight: bold; margin-bottom: 4px;';
  label.textContent = (deps.displayName?.(ap) ?? ap.name) + ':';
  if (ap.comment) label.title = ap.comment;
  item.appendChild(label);

  const valuesContainer = document.createElement('div');
  item.appendChild(valuesContainer);

  initAnnotationValuesSection(valuesContainer, {
    propertyName: ap.name,
    comment: ap.comment,
    initialValues: deps.getInitialValues(ap),
    onChange: (values) => deps.onTextualValuesChange(ap.name, values),
    onOpen: deps.onOpenLink,
  });
  return item;
}

/**
 * Fill a "Set annotation properties" list (#141): scrollable, grouped like the Annotation Properties menu (own
 * first, others by source, those used on no class last, deprecated ones marked); a group holding a value set on
 * this class starts open.
 */
function renderAnnotationPropsGroups(
  listEl: HTMLElement,
  annotationProperties: AnnotationPropertyInfo[],
  currentBooleanValue: (ap: AnnotationPropertyInfo) => boolean | string | null | undefined,
  idPrefix: string,
  deps: AnnotationPropsListDeps
): void {
  listEl.style.maxHeight = LIST_MAX_HEIGHT;
  listEl.style.overflowY = 'auto';
  const entries = annotationProperties.map((ap) => ({ item: ap, ...deps.groupFacts(ap) }));
  renderMenuGroups(listEl, groupMenuEntries(entries), ({ item }) => createAnnotationPropItem(item, currentBooleanValue(item), idPrefix, deps));
}

export function updateRenameDataPropAddButtonState(): void {
  const selectEl = document.getElementById('renameDataPropSelect') as HTMLSelectElement;
  const addBtn = document.getElementById('renameDataPropAdd') as HTMLButtonElement;
  if (!selectEl || !addBtn) return;
  const hasSelection = selectEl.value.trim() !== '';
  addBtn.disabled = !hasSelection;
  addBtn.style.display = hasSelection ? '' : 'none';
}

export function updateAddNodeDataPropAddButtonState(): void {
  const selectEl = document.getElementById('addNodeDataPropSelect') as HTMLSelectElement;
  const addBtn = document.getElementById('addNodeDataPropAdd') as HTMLButtonElement;
  if (!selectEl || !addBtn) return;
  const hasSelection = selectEl.value.trim() !== '';
  addBtn.disabled = !hasSelection;
  addBtn.style.display = hasSelection ? '' : 'none';
}

export function renderRenameModalDataPropsList(
  restrictions: DataPropertyRestriction[],
  dataProperties: DataPropertyInfo[],
  onRemove: (propertyName: string) => void
): void {
  const listEl = document.getElementById('renameDataPropsList');
  const selectEl = document.getElementById('renameDataPropSelect') as HTMLSelectElement;
  if (!listEl || !selectEl) return;
  const assignedNames = new Set(restrictions.map((r) => r.propertyName));
  listEl.innerHTML = restrictions
    .map((r) => {
      const dp = dataProperties.find((p) => p.name === r.propertyName);
      const label = dp?.label ?? r.propertyName;
      const card =
        r.minCardinality != null || r.maxCardinality != null
          ? ` [${r.minCardinality ?? 0}..${r.maxCardinality ?? '*'}]`
          : '';
      return `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
        <span>${label}${card}</span>
        <button type="button" class="rename-data-prop-remove" data-name="${r.propertyName}" style="font-size: 11px; padding: 2px 6px;">Remove</button>
      </div>`;
    })
    .join('');
  selectEl.innerHTML = '<option value="">-- data property --</option>' + dataProperties.filter((p) => !assignedNames.has(p.name)).map((p) => `<option value="${p.name}">${p.label}</option>`).join('');
  updateRenameDataPropAddButtonState();
  (listEl as HTMLElement & { _renameDataPropOnRemove?: (name: string) => void })._renameDataPropOnRemove = onRemove;
  if (!(listEl as HTMLElement & { _renameDataPropDelegationBound?: boolean })._renameDataPropDelegationBound) {
    (listEl as HTMLElement & { _renameDataPropDelegationBound?: boolean })._renameDataPropDelegationBound = true;
    listEl.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest('.rename-data-prop-remove');
      if (!btn) return;
      const name = (btn as HTMLElement).dataset.name;
      const cb = (listEl as HTMLElement & { _renameDataPropOnRemove?: (name: string) => void })._renameDataPropOnRemove;
      if (name && typeof cb === 'function') cb(name);
    });
  }
}

export function renderRenameModalAnnotationPropsList(
  _nodeId: string,
  node: GraphNode | undefined,
  annotationProperties: AnnotationPropertyInfo[],
  deps: AnnotationPropsListDeps
): void {
  const listEl = document.getElementById('renameAnnotationPropsList');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (annotationProperties.length === 0) {
    listEl.innerHTML = '<div style="font-size: 11px; color: #666;">No annotation properties defined.</div>';
    return;
  }
  renderAnnotationPropsGroups(listEl, annotationProperties, (ap) => node?.annotations?.[ap.name], 'renameAnnotProp_', deps);
}

export function renderAddNodeAnnotationPropsList(
  annotationProperties: AnnotationPropertyInfo[],
  deps: AnnotationPropsListDeps
): void {
  const listEl = document.getElementById('addNodeAnnotationPropsList');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (annotationProperties.length === 0) {
    listEl.innerHTML = '<div style="font-size: 11px; color: #666;">No annotation properties defined.</div>';
    return;
  }
  renderAnnotationPropsGroups(listEl, annotationProperties, () => null, 'addNodeAnnotProp_', deps);
}

export function renderAddNodeDataPropsList(
  restrictions: DataPropertyRestriction[],
  dataProperties: DataPropertyInfo[],
  onRemove: (propertyName: string) => void
): void {
  const listEl = document.getElementById('addNodeDataPropsList');
  const selectEl = document.getElementById('addNodeDataPropSelect') as HTMLSelectElement;
  if (!listEl || !selectEl) return;
  const assignedNames = new Set(restrictions.map((r) => r.propertyName));
  listEl.innerHTML = restrictions
    .map((r) => {
      const dp = dataProperties.find((p) => p.name === r.propertyName);
      const label = dp?.label ?? r.propertyName;
      const card =
        r.minCardinality != null || r.maxCardinality != null
          ? ` [${r.minCardinality ?? 0}..${r.maxCardinality ?? '*'}]`
          : '';
      return `<div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
        <span>${label}${card}</span>
        <button type="button" class="add-node-data-prop-remove" data-name="${r.propertyName}" style="font-size: 11px; padding: 2px 6px;">Remove</button>
      </div>`;
    })
    .join('');
  selectEl.innerHTML = '<option value="">-- data property --</option>' + dataProperties.filter((p) => !assignedNames.has(p.name)).map((p) => `<option value="${p.name}">${p.label}</option>`).join('');
  updateAddNodeDataPropAddButtonState();
  (listEl as HTMLElement & { _addNodeDataPropOnRemove?: (name: string) => void })._addNodeDataPropOnRemove = onRemove;
  if (!(listEl as HTMLElement & { _addNodeDataPropDelegationBound?: boolean })._addNodeDataPropDelegationBound) {
    (listEl as HTMLElement & { _addNodeDataPropDelegationBound?: boolean })._addNodeDataPropDelegationBound = true;
    listEl.addEventListener('click', (e: Event) => {
      const btn = (e.target as HTMLElement).closest('.add-node-data-prop-remove');
      if (!btn) return;
      const name = (btn as HTMLElement).dataset.name;
      const cb = (listEl as HTMLElement & { _addNodeDataPropOnRemove?: (name: string) => void })._addNodeDataPropOnRemove;
      if (name && typeof cb === 'function') cb(name);
    });
  }
}

export interface SyncRenameModalParams {
  store: Store | null | undefined;
  nodeId: string;
  label: string;
}

/** Update the rename modal: the class's real IRI, and no duplicate error: a label never changes the IRI (#146). Only runs when modal is visible in single mode. */
export function syncRenameModal(params: SyncRenameModalParams): void {
  const { store, nodeId, label } = params;
  const modal = document.getElementById('renameModal');
  if (!modal || (modal as HTMLElement).style.display === 'none') return;
  if (modal.dataset.mode !== 'single') return;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  if (!input || input.dataset.nodeId !== nodeId) return;
  updateIdentifierDisplay('rename', label, store, nodeId);
  const okBtn = document.getElementById('renameConfirm') as HTMLButtonElement;
  const dupErr = document.getElementById('renameDuplicateError') as HTMLElement;
  if (dupErr) {
    dupErr.style.display = 'none';
    dupErr.textContent = '';
  }
  if (okBtn) okBtn.disabled = false;
}

export interface SyncAddNodeModalParams {
  store: Store | null | undefined;
  existingIds: Set<string>;
  label: string;
  externalLabel: string | null;
  /** When on external tab, the selected class URI; used to detect duplicate when that node already exists in the graph. */
  externalClassUri?: string | null;
  isCustomTab: boolean;
}

/** Update add-node modal identifier, duplicate errors, and OK button state. */
export function syncAddNodeModal(params: SyncAddNodeModalParams): void {
  const { store, existingIds, label, externalLabel, externalClassUri, isCustomTab } = params;
  const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
  const dupErr = document.getElementById('addNodeDuplicateError') as HTMLElement;
  const extDupErr = document.getElementById('addNodeExternalDuplicateError') as HTMLElement;

  if (dupErr) dupErr.style.display = 'none';
  if (extDupErr) extDupErr.style.display = 'none';

  if (isCustomTab) {
    updateIdentifierDisplay('addNode', label, store);
    if (!label) {
      if (okBtn) okBtn.disabled = true;
      return;
    }
    if (isDuplicateIdentifier(label, existingIds)) {
      if (dupErr) {
        dupErr.textContent = ADD_NODE_DUPLICATE_MESSAGE;
        dupErr.style.display = 'block';
      }
      if (okBtn) okBtn.disabled = true;
      return;
    }
    if (okBtn) okBtn.disabled = false;
  } else {
    if (!externalLabel) {
      if (okBtn) okBtn.disabled = true;
      return;
    }
    if (externalClassUri && existingIds.has(externalClassUri)) {
      if (extDupErr) {
        extDupErr.textContent = ADD_NODE_DUPLICATE_MESSAGE;
        extDupErr.style.display = 'block';
      }
      if (okBtn) okBtn.disabled = true;
      return;
    }
    if (isDuplicateIdentifier(externalLabel, existingIds)) {
      if (extDupErr) {
        extDupErr.textContent = ADD_NODE_DUPLICATE_MESSAGE;
        extDupErr.style.display = 'block';
      }
      if (okBtn) okBtn.disabled = true;
      return;
    }
    if (okBtn) okBtn.disabled = false;
  }
}
