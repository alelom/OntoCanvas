/**
 * Editing annotation properties in the store: adding, removing and changing them, and the annotation values on a term. Moved out of src/parser.ts unchanged (#193, step 4b).
 */

import { BASE_IRI, HAS_CARDINALITY_PROP, OWL, RDF, RDFS, XSD, XSD_BOOLEAN } from './vocab';
import { DataFactory, Store } from 'n3';
import { classUriForName } from '../graph/classNodeIds';
import { extractLocalName } from '../utils/localName';
import { getAnnotationProperties } from './readAnnotationProperties';

/**
 * Update an annotation property value for a class node in the store.
 * For boolean properties, value should be boolean or null.
 * For non-boolean properties, value should be string or null.
 */
export function updateAnnotationPropertyValueInStore(
  store: Store,
  classLocalName: string,
  annotationPropertyName: string,
  value: boolean | string | null,
  isBoolean: boolean
): boolean {
  const target = classUriForName(store, classLocalName); // resolved once, not per class (#164)
  // Find the class subject
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  let classSubject: import('n3').NamedNode | null = null;
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (subj.value !== target) continue; // the class the name stands for (#164)
    classSubject = subj as import('n3').NamedNode;
    break;
  }
  
  if (!classSubject) return false;
  
  // Find the annotation property predicate URI
  let propUri: string | null = null;
  const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
  for (const q of apQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const currentUri = (subj as { value: string }).value;
    if (extractLocalName(currentUri) === annotationPropertyName) {
      propUri = currentUri;
      break;
    }
  }
  
  // If not found, assume it's from base IRI
  if (!propUri) {
    propUri = BASE_IRI + annotationPropertyName;
  }
  
  const predicate = DataFactory.namedNode(propUri);
  
  // Remove existing quads for this annotation property
  const existingQuads = store.getQuads(classSubject, predicate, null, null);
  const graph = existingQuads[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existingQuads) {
    store.removeQuad(q);
  }
  
  // Add new quad if value is not null
  if (value !== null) {
    if (isBoolean) {
      const boolValue = value === true || value === 'true';
      store.addQuad(
        classSubject,
        predicate,
        DataFactory.literal(String(boolValue), DataFactory.namedNode(XSD + 'boolean')),
        graph
      );
    } else {
      store.addQuad(
        classSubject,
        predicate,
        DataFactory.literal(String(value)),
        graph
      );
    }
  }
  
  return true;
}

export function ensureHasCardinalityAnnotationProperty(store: Store): void {
  const apUri = DataFactory.namedNode(HAS_CARDINALITY_PROP);
  const existing = store.getQuads(apUri, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), null);
  if (existing.length > 0) return;
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(apUri, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), graph);
  store.addQuad(apUri, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(XSD + 'boolean'), graph);
}

/**
 * Add a new annotation property (owl:AnnotationProperty) to the store.
 * Returns the property localName, or null on failure.
 * @param rangeUri Full URI of the datatype range (e.g. http://www.w3.org/2001/XMLSchema#boolean). null means no range.
 */
export function addAnnotationPropertyToStore(
  store: Store,
  label: string,
  rangeUri: string | null,
  localName?: string
): string | null {
  const existingNames = new Set(getAnnotationProperties(store).map((ap) => ap.name));
  let name = localName ?? (extractLocalName(label) || 'newAnnotationProperty').replace(/\s+/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) name = 'newAnnotationProperty';
  let base = name;
  let n = 0;
  while (existingNames.has(name)) {
    name = `${base}${++n}`;
  }
  const subjUri = BASE_IRI + name;
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  if (rangeUri) {
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(rangeUri), graph);
  }
  return name;
}

/**
 * Update rdfs:label for an annotation property in the store.
 */
export function updateAnnotationPropertyLabelInStore(
  store: Store,
  propertyName: string,
  newLabel: string
): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const labelPred = DataFactory.namedNode(RDFS + 'label');
  const labelQuads = store.getQuads(subject, labelPred, null, null);
  const graph = labelQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const lq of labelQuads) store.removeQuad(lq);
  store.addQuad(subject, labelPred, DataFactory.literal(newLabel.trim()), graph);
  return true;
}

/**
 * Update rdfs:comment for an annotation property in the store.
 */
export function updateAnnotationPropertyCommentInStore(
  store: Store,
  propertyName: string,
  comment: string | null
): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const commentPred = DataFactory.namedNode(RDFS + 'comment');
  const commentQuads = store.getQuads(subject, commentPred, null, null);
  const graph = commentQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const cq of commentQuads) store.removeQuad(cq);
  if (comment !== null && comment.trim() !== '') {
    store.addQuad(subject, commentPred, DataFactory.literal(comment.trim()), graph);
  }
  return true;
}

/**
 * Update whether an annotation property is boolean (rdfs:range xsd:boolean).
 * @deprecated Use updateAnnotationPropertyRangeInStore instead
 */
export function updateAnnotationPropertyIsBooleanInStore(
  store: Store,
  propertyName: string,
  isBoolean: boolean
): boolean {
  const rangeUri = isBoolean ? XSD_BOOLEAN : null;
  return updateAnnotationPropertyRangeInStore(store, propertyName, rangeUri);
}

/**
 * Update the range (rdfs:range) of an annotation property in the store.
 * @param rangeUri Full URI of the datatype (e.g. http://www.w3.org/2001/XMLSchema#boolean). null to remove range.
 */
export function updateAnnotationPropertyRangeInStore(
  store: Store,
  propertyName: string,
  rangeUri: string | null
): boolean {
  // Find the property URI (could be from base IRI or external)
  let propUri: string | null = null;
  const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
  for (const q of apQuads) {
    if (q.subject.termType === 'NamedNode') {
      const currentUri = (q.subject as { value: string }).value;
      if (extractLocalName(currentUri) === propertyName) {
        propUri = currentUri;
        break;
      }
    }
  }
  
  // If not found, assume it's from base IRI
  if (!propUri) {
    propUri = BASE_IRI + propertyName;
  }
  
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const rangeQuads = store.getQuads(subject, rangePred, null, null);
  const graph = rangeQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  
  // Remove existing range quads
  for (const rq of rangeQuads) store.removeQuad(rq);
  
  // Add new range if provided
  if (rangeUri) {
    store.addQuad(subject, rangePred, DataFactory.namedNode(rangeUri), graph);
  }
  return true;
}

/**
 * Remove an annotation property from the store.
 */
/**
 * Resolve an annotation property name to its full URI from the store.
 * Annotation properties loaded from a file (or imported) keep their own namespace, which is
 * usually NOT the default BASE_IRI, so we must look up the real URI rather than concatenating.
 */
export function getAnnotationPropertyUriFromStore(store: Store, name: string): string {
  if (name.startsWith('http://') || name.startsWith('https://')) return name;
  const aps = getAnnotationProperties(store);
  const ap = aps.find((p) => p.name === name || p.uri === name);
  return ap?.uri ?? BASE_IRI + name;
}

export function removeAnnotationPropertyFromStore(store: Store, propertyName: string): boolean {
  const propUri = getAnnotationPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  for (const q of quads) store.removeQuad(q);
  return true;
}
