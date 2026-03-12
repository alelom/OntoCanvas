/**
 * Workflow for editing node properties (label, comment, annotations, etc.)
 * Pure business logic - no DOM, no undo/redo, no UI state
 * Mutates store and node in-place
 */

import type { Store } from 'n3';
import type { GraphNode, AnnotationPropertyInfo } from '../types';
import type { NodeFormData } from '../ui/nodeModalForm';
import { updateLabelInStore, getClassNamespace, getMainOntologyBase, BASE_IRI } from '../parser';
import { applyNodeFormToStore, isDuplicateIdentifierForRename } from '../ui/nodeModalForm';
import { debugLog, debugWarn } from '../utils/debug';

export interface EditNodePropertiesParams {
  store: Store; // Required (no null handling)
  nodeId: string; // Local name (e.g., "DrawingElement")
  node: GraphNode; // Will be mutated in place
  newLabel: string;
  formData: NodeFormData; // comment, annotations, dataPropertyRestrictions, exampleImages
  annotationProperties: AnnotationPropertyInfo[];
  existingNodeIds: Set<string>; // For duplicate validation
}

export interface EditNodePropertiesResult {
  success: boolean;
  error?: string;
}

/**
 * Edit node properties (label, comment, annotations, etc.)
 * Pure business logic - no DOM, no undo/redo, no UI state
 * Mutates store and node in-place
 */
export function editNodeProperties(params: EditNodePropertiesParams): EditNodePropertiesResult {
  const { store, nodeId, node, newLabel, formData, annotationProperties, existingNodeIds } = params;
  
  debugLog('[editNodeProperties] Starting edit for node:', nodeId, 'new label:', newLabel);
  
  // 1. Validation: Check for duplicate identifier
  const labelChanged = node.label !== newLabel;
  if (labelChanged) {
    const isDuplicate = isDuplicateIdentifierForRename(newLabel, existingNodeIds, nodeId);
    if (isDuplicate) {
      debugWarn('[editNodeProperties] Duplicate identifier detected:', newLabel);
      return {
        success: false,
        error: 'A node with this identifier already exists'
      };
    }
  }
  
  // 2. Calculate baseIri (same logic as GUI)
  const baseIri = getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI;
  debugLog('[editNodeProperties] Using baseIri:', baseIri);
  
  // 3. Update label if changed
  if (labelChanged) {
    const updateResult = updateLabelInStore(store, nodeId, newLabel);
    if (!updateResult) {
      debugWarn('[editNodeProperties] Failed to update label in store');
      return {
        success: false,
        error: 'Failed to update label in store'
      };
    }
    node.label = newLabel;
    debugLog('[editNodeProperties] Label updated:', newLabel);
  }
  
  // 4. Apply form data (comment, annotations, dataPropertyRestrictions, exampleImages)
  applyNodeFormToStore(nodeId, formData, store, node, baseIri, annotationProperties);
  debugLog('[editNodeProperties] Form data applied');
  
  return {
    success: true
  };
}
