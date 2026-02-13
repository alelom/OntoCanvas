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
 * Optimized to iterate through quads only once.
 */
function detectUnusedAnnotationProperties(store: Store): OntologyIssue[] {
  const issues: OntologyIssue[] = [];
  const annotationProperties = getAnnotationProperties(store);
  
  if (annotationProperties.length === 0) {
    return issues;
  }
  
  // Get all annotation property URIs - build a map from URI to annotation property name
  const apUriToName = new Map<string, string>();
  const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
  for (const q of apQuads) {
    if (q.subject.termType === 'NamedNode') {
      const uri = (q.subject as { value: string }).value;
      const localName = extractLocalName(uri);
      apUriToName.set(uri, localName);
    }
  }
  
  // Also add base IRI versions for annotation properties that weren't found above
  for (const ap of annotationProperties) {
    const baseUri = BASE_IRI + ap.name;
    if (!apUriToName.has(baseUri)) {
      apUriToName.set(baseUri, ap.name);
    }
  }
  
  // Build a set of all annotation property URIs for quick lookup
  const allApUris = new Set(apUriToName.keys());
  
  // Iterate through all quads ONCE to find which annotation properties are used
  const usedApUris = new Set<string>();
  for (const q of store) {
    const pred = q.predicate as { value?: string; id?: string };
    const predVal = pred?.value ?? pred?.id;
    if (predVal && allApUris.has(predVal)) {
      usedApUris.add(predVal);
    }
  }
  
  // Find unused annotation properties
  for (const [apUri, apName] of apUriToName) {
    if (!usedApUris.has(apUri)) {
      // Check if this annotation property is in our list
      const ap = annotationProperties.find(p => p.name === apName);
      if (ap) {
        issues.push({
          type: 'unused_annotation_property',
          severity: 'warning',
          message: `Annotation property "${apName}" is defined but never used`,
          elementName: apName,
          elementType: 'Annotation Property',
        });
      }
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
