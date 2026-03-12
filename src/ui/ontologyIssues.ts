import { Store, DataFactory } from 'n3';
import { getAnnotationProperties, extractLocalName, getMainOntologyBase, getClassNamespace } from '../parser';
import type { AnnotationPropertyInfo } from '../types';
import { getExampleImageUrisForClass } from '../lib/exampleImageStore';
import { resolveImageUrl, isImageUrlReachable } from '../lib/exampleImageUrlValidation';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const BASE_IRI = 'http://example.org/aec-drawing-ontology#';

export interface OntologyIssue {
  type: 'unused_annotation_property' | 'unreachable_example_image';
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
  
  // Get the actual ontology base IRI from the store
  const mainBase = getMainOntologyBase(store);
  const classNs = getClassNamespace(store);
  const actualBase = mainBase || classNs || BASE_IRI;
  
  // Add annotation property URIs from the annotationProperties list
  // This ensures we catch all variations of the URI (from store, from base IRI, etc.)
  for (const ap of annotationProperties) {
    // Use the annotation property's actual URI if available (this is the most reliable)
    if (ap.uri) {
      apUriToName.set(ap.uri, ap.name);
    }
    // Also add constructed URI from actual base IRI (in case URI format differs)
    const baseUri = actualBase + ap.name;
    apUriToName.set(baseUri, ap.name);
    // Also add with the name as-is (in case it's already a full URI)
    if (ap.name.startsWith('http://') || ap.name.startsWith('https://')) {
      apUriToName.set(ap.name, ap.name);
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
      // Also mark all URI variations for this annotation property as used
      const apName = apUriToName.get(predVal);
      if (apName) {
        // Mark all URIs for this annotation property name as used
        for (const [uri, name] of apUriToName) {
          if (name === apName) {
            usedApUris.add(uri);
          }
        }
      }
    }
  }
  
  // Find unused annotation properties - deduplicate by name
  const reportedNames = new Set<string>();
  for (const [apUri, apName] of apUriToName) {
    if (!usedApUris.has(apUri) && !reportedNames.has(apName)) {
      // Check if this annotation property is in our list
      const ap = annotationProperties.find(p => p.name === apName);
      if (ap) {
        reportedNames.add(apName);
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
 * Detect unreachable example image URLs.
 * Checks all classes with example images and validates each URL.
 */
async function detectUnreachableExampleImages(
  store: Store,
  ontologyLocation: string | null
): Promise<OntologyIssue[]> {
  const issues: OntologyIssue[] = [];
  
  const mainBase = getMainOntologyBase(store);
  const classNs = getClassNamespace(store);
  const baseIri = classNs ?? mainBase ?? BASE_IRI;

  // Get all classes
  const classQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), null);
  
  for (const classQuad of classQuads) {
    if (classQuad.subject.termType !== 'NamedNode') continue;
    
    const classUri = (classQuad.subject as { value: string }).value;
    const classLocalName = extractLocalName(classUri);
    
    // Get example images for this class
    const imageUris = getExampleImageUrisForClass(store, classLocalName, baseIri);
    
    // Check each image URL
    for (const imageUri of imageUris) {
      const resolvedUrl = resolveImageUrl(imageUri, ontologyLocation);
      if (!resolvedUrl) {
        // Can't resolve relative URL
        issues.push({
          type: 'unreachable_example_image',
          severity: 'warning',
          message: `Example image URL "${imageUri}" cannot be resolved (relative URLs require ontology to be loaded from a URL)`,
          elementName: classLocalName,
          elementType: 'Class',
        });
        continue;
      }

      // Check reachability
      const isReachable = await isImageUrlReachable(resolvedUrl);
      if (!isReachable) {
        issues.push({
          type: 'unreachable_example_image',
          severity: 'warning',
          message: `Example image URL "${imageUri}" is not reachable`,
          elementName: classLocalName,
          elementType: 'Class',
        });
      }
    }
  }

  return issues;
}

/**
 * Detect all ontology issues.
 * Now includes async checks for unreachable example images.
 */
export async function detectOntologyIssues(
  store: Store | null,
  ontologyLocation: string | null = null
): Promise<OntologyIssue[]> {
  if (!store) return [];

  const issues: OntologyIssue[] = [];

  // Detect unused annotation properties (synchronous)
  issues.push(...detectUnusedAnnotationProperties(store));

  // Detect unreachable example images (async)
  const imageIssues = await detectUnreachableExampleImages(store, ontologyLocation);
  issues.push(...imageIssues);

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
    case 'unreachable_example_image':
      return 'Unreachable Example Images';
    default:
      return 'Other Issues';
  }
}
