import { Store } from 'n3';
import { getAnnotationProperties, extractLocalName } from '../parser';
import type { AnnotationPropertyInfo } from '../types';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const BASE_IRI = 'http://example.org/aec-drawing-ontology#';

export interface OntologyIssue {
  type: 'unused_annotation_property';
  severity: 'warning' | 'error';
  message: string;
  elementName: string;
  elementType: string;
}

/**
 * Detect unused annotation properties in the ontology.
 * An annotation property is considered unused if it's defined but never used as a predicate.
 */
function detectUnusedAnnotationProperties(store: Store): OntologyIssue[] {
  const issues: OntologyIssue[] = [];
  const annotationProperties = getAnnotationProperties(store);
  
  // Get all annotation property URIs
  const apUris = new Set<string>();
  for (const ap of annotationProperties) {
    // Try to find the full URI
    const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
    for (const q of apQuads) {
      if (q.subject.termType === 'NamedNode') {
        const uri = (q.subject as { value: string }).value;
        if (extractLocalName(uri) === ap.name) {
          apUris.add(uri);
          break;
        }
      }
    }
    // If not found, assume base IRI
    if (!apUris.has(BASE_IRI + ap.name)) {
      apUris.add(BASE_IRI + ap.name);
    }
  }
  
  // Check if each annotation property is used as a predicate
  for (const ap of annotationProperties) {
    let isUsed = false;
    const apUri = Array.from(apUris).find(uri => extractLocalName(uri) === ap.name) || BASE_IRI + ap.name;
    
    // Check all quads to see if this property is used as a predicate
    for (const q of store) {
      const pred = q.predicate as { value?: string; id?: string };
      const predVal = pred?.value ?? pred?.id;
      if (predVal === apUri) {
        isUsed = true;
        break;
      }
    }
    
    if (!isUsed) {
      issues.push({
        type: 'unused_annotation_property',
        severity: 'warning',
        message: `Annotation property "${ap.name}" is defined but never used`,
        elementName: ap.name,
        elementType: 'Annotation Property',
      });
    }
  }
  
  return issues;
}

/**
 * Detect all ontology issues.
 */
export function detectOntologyIssues(store: Store | null): OntologyIssue[] {
  if (!store) return [];
  
  const issues: OntologyIssue[] = [];
  
  // Detect unused annotation properties
  issues.push(...detectUnusedAnnotationProperties(store));
  
  // Future: Add more issue detection functions here
  
  return issues;
}

/**
 * Group issues by type for display.
 */
export function groupIssuesByType(issues: OntologyIssue[]): Record<string, OntologyIssue[]> {
  const grouped: Record<string, OntologyIssue[]> = {};
  for (const issue of issues) {
    if (!grouped[issue.type]) {
      grouped[issue.type] = [];
    }
    grouped[issue.type].push(issue);
  }
  return grouped;
}

/**
 * Get a human-readable label for an issue type.
 */
export function getIssueTypeLabel(type: string): string {
  switch (type) {
    case 'unused_annotation_property':
      return 'Unused Elements';
    default:
      return 'Other Issues';
  }
}
