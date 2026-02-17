/**
 * Shared node form logic for Edit Node (rename) and Add Node modals.
 * Identifier display, duplicate check, and apply form to store.
 */

import type { Store } from 'n3';
import {
  deriveNewNodeIdentifier,
  getClassNamespace,
  getMainOntologyBase,
  BASE_IRI,
  updateCommentInStore,
  updateAnnotationPropertyValueInStore,
  addDataPropertyRestrictionToClass,
  removeDataPropertyRestrictionFromClass,
  getDataPropertyRestrictionsForClass,
} from '../parser';
import {
  ensureExampleImageAnnotationProperty,
  setExampleImageUrisForClass,
} from '../lib/exampleImageStore';
import type { GraphNode, DataPropertyRestriction, AnnotationPropertyInfo } from '../types';

export const ADD_NODE_DUPLICATE_MESSAGE = 'A node with the same identifier already exists.';

export type NodeFormKind = 'rename' | 'addNode';

const IDENTIFIER_ELEMENT_IDS: Record<NodeFormKind, string> = {
  rename: 'renameIdentifier',
  addNode: 'addNodeIdentifier',
};

/**
 * Get display text for the derived identifier (base IRI + id).
 */
function getDisplayBase(store: Store | null | undefined): string {
  const displayBase = store
    ? getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI
    : BASE_IRI;
  return displayBase.endsWith('#') ? displayBase : displayBase + '#';
}

/**
 * Update the "Identifier (derived from label)" element for the given form.
 * For rename, fallbackId is the current node id when label is empty.
 */
export function updateIdentifierDisplay(
  formKind: NodeFormKind,
  label: string,
  store?: Store | null,
  fallbackId?: string
): void {
  const el = document.getElementById(IDENTIFIER_ELEMENT_IDS[formKind]) as HTMLElement | null;
  if (!el) return;
  const trimmed = (label ?? '').trim();
  const derived = trimmed
    ? deriveNewNodeIdentifier(trimmed)
    : (fallbackId ?? '');
  const baseWithHash = getDisplayBase(store);
  el.textContent = derived.startsWith('http') ? derived : baseWithHash + derived;
}

/**
 * Returns true if the label would derive to an identifier that already exists (case-insensitive).
 */
export function isDuplicateIdentifier(
  label: string,
  existingIds: Set<string>
): boolean {
  const trimmed = (label ?? '').trim();
  if (!trimmed) return false;
  const id = deriveNewNodeIdentifier(trimmed);
  const existingLower = new Set([...existingIds].map((x) => x.toLowerCase()));
  return existingLower.has(id.toLowerCase());
}

/**
 * Returns true if the label would derive to an identifier that clashes with another node (case-insensitive).
 * Used when renaming: excludes currentNodeId so the current node's own id is not treated as a duplicate.
 */
export function isDuplicateIdentifierForRename(
  label: string,
  existingIds: Set<string>,
  currentNodeId: string
): boolean {
  const trimmed = (label ?? '').trim();
  if (!trimmed) return false;
  const currentLower = currentNodeId.toLowerCase();
  const others = new Set([...existingIds].filter((id) => id.toLowerCase() !== currentLower));
  return isDuplicateIdentifier(label, others);
}

/** Form data for a node (comment, example images, annotation values, data property restrictions). */
export interface NodeFormData {
  comment: string;
  exampleImageUris: string[];
  annotationValues: Record<string, boolean | string | null>;
  dataPropertyRestrictions: DataPropertyRestriction[];
}

/**
 * Apply form data to a node: update store and mutate the rawData node.
 * Used by both confirmRename and confirmAddNode (custom).
 */
export function applyNodeFormToStore(
  nodeId: string,
  formData: NodeFormData,
  store: Store,
  node: GraphNode,
  baseIri: string,
  annotationProperties: AnnotationPropertyInfo[]
): void {
  node.comment = formData.comment.trim() || undefined;
  updateCommentInStore(store, nodeId, formData.comment.trim() || null);

  if (formData.exampleImageUris.length > 0) {
    ensureExampleImageAnnotationProperty(store, baseIri);
    setExampleImageUrisForClass(store, nodeId, formData.exampleImageUris, baseIri);
    node.exampleImages = formData.exampleImageUris;
  } else {
    setExampleImageUrisForClass(store, nodeId, [], baseIri);
    node.exampleImages = undefined;
  }

  for (const ap of annotationProperties) {
    const newValue = formData.annotationValues[ap.name] ?? null;
    if (!node.annotations) node.annotations = {};
    node.annotations[ap.name] = newValue;
    if (ap.name === 'labellableRoot') {
      node.labellableRoot = typeof newValue === 'boolean' ? newValue : null;
    }
    updateAnnotationPropertyValueInStore(store, nodeId, ap.name, newValue, ap.isBoolean);
  }

  const current = getDataPropertyRestrictionsForClass(store, nodeId);
  const toRemove = current.filter(
    (i) =>
      !formData.dataPropertyRestrictions.some(
        (c) =>
          c.propertyName === i.propertyName &&
          c.minCardinality === i.minCardinality &&
          c.maxCardinality === i.maxCardinality
      )
  );
  const toAdd = formData.dataPropertyRestrictions.filter(
    (c) =>
      !current.some(
        (i) =>
          i.propertyName === c.propertyName &&
          i.minCardinality === c.minCardinality &&
          i.maxCardinality === c.maxCardinality
      )
  );
  for (const r of toRemove) removeDataPropertyRestrictionFromClass(store, nodeId, r.propertyName);
  for (const r of toAdd) {
    addDataPropertyRestrictionToClass(store, nodeId, r.propertyName, {
      minCardinality: r.minCardinality ?? undefined,
      maxCardinality: r.maxCardinality ?? undefined,
    });
  }
  node.dataPropertyRestrictions = getDataPropertyRestrictionsForClass(store, nodeId);
}
