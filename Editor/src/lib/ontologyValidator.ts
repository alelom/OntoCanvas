import type { Store } from 'n3';
import { DataFactory } from 'n3';
import type { CopiedRelationship } from './relationshipClipboard';
import type { GraphData } from '../types';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const BASE_IRI = 'http://example.org/aec-drawing-ontology#';

/**
 * Result of validation for a single relationship.
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Convert local name to full class URI.
 */
function toClassUri(localName: string): string {
  if (localName.startsWith('http://') || localName.startsWith('https://')) {
    return localName;
  }
  return BASE_IRI + localName;
}

/**
 * Get property URI from edge type (handles both local and external properties).
 */
function getPropertyUri(edgeType: string): string {
  if (edgeType.startsWith('http://') || edgeType.startsWith('https://')) {
    return edgeType;
  }
  return BASE_IRI + edgeType;
}

/**
 * Check if a class is a subclass of another class (directly or transitively).
 */
function isSubClassOf(store: Store, classUri: string, superClassUri: string): boolean {
  if (classUri === superClassUri) return true;
  
  const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
  const classNode = DataFactory.namedNode(classUri);
  const superClassNode = DataFactory.namedNode(superClassUri);
  
  // Check direct subclass
  const directQuads = store.getQuads(classNode, subClassOfPred, superClassNode, null);
  if (directQuads.length > 0) return true;
  
  // Check transitive (find all superclasses and check if any match)
  const superClassQuads = store.getQuads(classNode, subClassOfPred, null, null);
  for (const quad of superClassQuads) {
    const superClass = quad.object;
    if (superClass.termType === 'NamedNode' && superClass.value) {
      if (isSubClassOf(store, superClass.value, superClassUri)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Validate a single relationship can be pasted to a target node.
 * Checks for duplicates and domain/range constraints.
 */
export function validateRelationship(
  edge: CopiedRelationship,
  targetNodeId: string,
  sourceNodeId: string,
  store: Store,
  rawData: GraphData
): ValidationResult {
  // Check for duplicate edge
  const duplicate = rawData.edges.find(
    (e) => e.from === sourceNodeId && e.to === targetNodeId && e.type === edge.type
  );
  
  if (duplicate) {
    return {
      valid: false,
      reason: 'An edge with this relationship type already exists between these nodes',
    };
  }

  const OWL_THING = OWL + 'Thing';

  // Check domain constraints (source node must be compatible with property domain)
  const propUri = getPropertyUri(edge.type);
  const propNode = DataFactory.namedNode(propUri);
  const domainPred = DataFactory.namedNode(RDFS + 'domain');
  
  const domainQuads = store.getQuads(propNode, domainPred, null, null);
  if (domainQuads.length > 0) {
    const sourceUri = toClassUri(sourceNodeId);
    let domainMatch = false;
    
    for (const quad of domainQuads) {
      const domain = quad.object;
      if (domain.termType === 'NamedNode' && domain.value) {
        const domainUri = domain.value;
        // Special case: owl:Thing is the top-level class, all classes satisfy it
        if (domainUri === OWL_THING) {
          domainMatch = true;
          break;
        }
        // Check if source node is the domain class or a subclass of it
        if (sourceUri === domainUri || isSubClassOf(store, sourceUri, domainUri)) {
          domainMatch = true;
          break;
        }
      }
    }
    
    if (!domainMatch) {
      return {
        valid: false,
        reason: `Source node does not satisfy domain constraint for relationship type "${edge.type}"`,
      };
    }
  }

  // Check range constraints (target node must be compatible with property range)
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const rangeQuads = store.getQuads(propNode, rangePred, null, null);
  
  if (rangeQuads.length > 0) {
    const targetUri = toClassUri(targetNodeId);
    let rangeMatch = false;
    
    for (const quad of rangeQuads) {
      const range = quad.object;
      if (range.termType === 'NamedNode' && range.value) {
        const rangeUri = range.value;
        // Special case: owl:Thing is the top-level class, all classes satisfy it
        if (rangeUri === OWL_THING) {
          rangeMatch = true;
          break;
        }
        // Check if target node is the range class or a subclass of it
        if (targetUri === rangeUri || isSubClassOf(store, targetUri, rangeUri)) {
          rangeMatch = true;
          break;
        }
      }
    }
    
    if (!rangeMatch) {
      return {
        valid: false,
        reason: `Target node does not satisfy range constraint for relationship type "${edge.type}"`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate all relationships before pasting.
 * Returns array of validation results, one per relationship.
 */
export function validateAllRelationships(
  relationships: CopiedRelationship[],
  targetNodeId: string,
  store: Store,
  rawData: GraphData
): ValidationResult[] {
  return relationships.map((rel) => 
    validateRelationship(rel, targetNodeId, rel.from, store, rawData)
  );
}
