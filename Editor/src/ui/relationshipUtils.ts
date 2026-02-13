import type { GraphEdge, GraphData } from '../types';
import type { ExternalOntologyReference } from '../storage';
import type { ExternalObjectPropertyInfo } from '../externalOntologySearch';
import { getEdgeTypes } from '../graph';
import { extractLocalName } from '../parser';
import { formatRelationshipLabelWithPrefix } from './externalRefs';

export const SUBCLASSOF_COMMENT = 'Classification or sub-typing relationship';

export interface ObjectPropertyInfo {
  name: string;
  label: string;
  hasCardinality: boolean;
  comment?: string | null;
}

/**
 * Get all relationship types that are actually in use in the graph.
 * For external properties (URIs), only include them if they're used in edges.
 */
export function getAllRelationshipTypes(
  rawData: GraphData,
  objectProperties: ObjectPropertyInfo[]
): string[] {
  const edgeTypes = getEdgeTypes(rawData.edges);
  const usedTypes = new Set<string>(edgeTypes);
  
  // Include subClassOf always
  usedTypes.add('subClassOf');
  
  // Include local properties (not URIs) from objectProperties
  const localProps = objectProperties
    .filter((op) => !op.name.startsWith('http://') && !op.name.startsWith('https://'))
    .map((op) => op.name);
  localProps.forEach((prop) => usedTypes.add(prop));
  
  // Include external properties (URIs) only if they're used in edges
  const externalProps = objectProperties
    .filter((op) => (op.name.startsWith('http://') || op.name.startsWith('https://')) && usedTypes.has(op.name))
    .map((op) => op.name);
  externalProps.forEach((prop) => usedTypes.add(prop));
  
  return Array.from(usedTypes).sort();
}

/**
 * Remove unused external object properties from the objectProperties array.
 * External properties (URIs) should only be kept if they're used in edges.
 */
export function cleanupUnusedExternalProperties(
  rawData: GraphData,
  objectProperties: ObjectPropertyInfo[]
): ObjectPropertyInfo[] {
  const edgeTypes = new Set(getEdgeTypes(rawData.edges));
  const beforeCount = objectProperties.length;
  
  const filtered = objectProperties.filter((op) => {
    // Keep local properties (not URIs)
    if (!op.name.startsWith('http://') && !op.name.startsWith('https://')) {
      return true;
    }
    // For external properties (URIs), only keep if used in edges
    return edgeTypes.has(op.name);
  });
  
  const afterCount = filtered.length;
  if (beforeCount !== afterCount) {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  }
  
  return filtered;
}

/**
 * Get the label for a relationship type
 */
export function getRelationshipLabel(
  type: string,
  objectProperties: ObjectPropertyInfo[],
  externalOntologyReferences: ExternalOntologyReference[]
): string {
  if (type === 'subClassOf') return 'subClassOf';
  const op = objectProperties.find((p) => p.name === type);
  if (op) return op.label;
  // If not found in objectProperties, it might be an external property URI
  // Try to extract a meaningful label from the URI
  if (type.startsWith('http://') || type.startsWith('https://')) {
    // Check if we can find it in external references
    for (const ref of externalOntologyReferences) {
      if (type.startsWith(ref.url) || ref.url.endsWith('#') && type.startsWith(ref.url.slice(0, -1))) {
        const localName = extractLocalName(type);
        return localName;
      }
    }
    return extractLocalName(type);
  }
  return type;
}

/** Format edge label for graph display, using relationship label and optional cardinality. */
export function getEdgeDisplayLabel(
  edge: GraphEdge,
  objectProperties: ObjectPropertyInfo[],
  externalOntologyReferences: ExternalOntologyReference[]
): string {
  const baseLabel = getRelationshipLabel(edge.type, objectProperties, externalOntologyReferences);
  const min = edge.minCardinality;
  const max = edge.maxCardinality;
  if (min == null && max == null) return baseLabel;
  const minStr = min != null ? String(min) : '0';
  const maxStr = max != null ? String(max) : '*';
  return `${baseLabel} [${minStr}..${maxStr}]`;
}

/**
 * Get the comment for a relationship type
 */
export function getRelationshipComment(
  type: string,
  objectProperties: ObjectPropertyInfo[]
): string | null {
  if (type === 'subClassOf') return SUBCLASSOF_COMMENT;
  const op = objectProperties.find((p) => p.name === type);
  return op?.comment ?? null;
}

/**
 * Get all edge types (from properties and edges)
 */
export function getAllEdgeTypes(
  rawData: GraphData,
  objectProperties: ObjectPropertyInfo[]
): string[] {
  const fromProps = objectProperties.map((op) => op.name);
  const fromEdges = getEdgeTypes(rawData.edges);
  return [...new Set(['subClassOf', ...fromProps, ...fromEdges])].sort();
}

/**
 * Check if a property has cardinality support
 */
export function getPropertyHasCardinality(
  edgeType: string,
  objectProperties: ObjectPropertyInfo[],
  selectedExternalObjectProperty: ExternalObjectPropertyInfo | null
): boolean {
  if (edgeType === 'subClassOf') return false;
  // Check if it's an external object property
  if (selectedExternalObjectProperty) {
    return selectedExternalObjectProperty.hasCardinality ?? true;
  }
  // Check local object properties
  const op = objectProperties.find((p) => p.name === edgeType);
  return op?.hasCardinality ?? true;
}

/**
 * Update the comment display for the edit edge modal
 */
export function updateEditEdgeCommentDisplay(
  selectedEdgeType: string | null,
  selectedExternalObjectProperty: ExternalObjectPropertyInfo | null,
  typeInputValue: string,
  objectProperties: ObjectPropertyInfo[]
): string | null {
  let comment: string | null = null;
  if (selectedExternalObjectProperty) {
    comment = selectedExternalObjectProperty.comment || null;
  } else {
    const edgeType = selectedEdgeType || typeInputValue.trim();
    comment = edgeType ? getRelationshipComment(edgeType, objectProperties) : null;
  }
  return comment;
}

/**
 * Show a relationship tooltip
 */
let relationshipTooltip: HTMLElement | null = null;

export function showRelationshipTooltip(element: HTMLElement, comment: string): void {
  // Remove existing tooltip if any
  hideRelationshipTooltip();
  
  // Create tooltip element
  relationshipTooltip = document.createElement('div');
  relationshipTooltip.textContent = comment;
  relationshipTooltip.style.cssText = `
    position: absolute;
    background: #333;
    color: #fff;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 11px;
    line-height: 1.4;
    max-width: 300px;
    z-index: 10000;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    word-wrap: break-word;
  `;
  
  // Position tooltip relative to the element
  const rect = element.getBoundingClientRect();
  const resultsDiv = document.getElementById('editEdgeTypeResults');
  if (resultsDiv) {
    const resultsRect = resultsDiv.getBoundingClientRect();
    relationshipTooltip.style.left = `${rect.left - resultsRect.left + rect.width + 8}px`;
    relationshipTooltip.style.top = `${rect.top - resultsRect.top}px`;
    
    // Check if tooltip would go off screen, adjust if needed
    const tooltipWidth = 300; // max-width
    const tooltipRight = rect.right + tooltipWidth + 8;
    if (tooltipRight > window.innerWidth) {
      // Position on the left side instead
      relationshipTooltip.style.left = `${rect.left - resultsRect.left - tooltipWidth - 8}px`;
    }
    
    resultsDiv.appendChild(relationshipTooltip);
  }
}

/**
 * Hide the relationship tooltip
 */
export function hideRelationshipTooltip(): void {
  if (relationshipTooltip) {
    relationshipTooltip.remove();
    relationshipTooltip = null;
  }
}
