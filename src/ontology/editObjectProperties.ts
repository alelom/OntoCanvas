/**
 * Editing object properties in the store: adding, removing, renaming and changing them. Moved out of src/parser.ts unchanged (#193, step 4d).
 */

import { BASE_IRI, HAS_CARDINALITY_PROP, OWL, OWL_THING_URI, RDF, RDFS, XSD, namespaceFromUri } from './vocab';
import { DataFactory, Store } from 'n3';
import { ensureHasCardinalityAnnotationProperty } from './editAnnotationProperties';
import { extractLocalName } from '../utils/localName';
import { getClassNamespace, getMainOntologyBase } from './ontologyBase';
import { getObjectProperties } from './readObjectProperties';
import { labelToCamelCaseIdentifier } from '../lib/identifierFromLabel';
import { namesOwlThing, resolveClassUri } from './editClasses';

/** Resolve object property name to full URI from store (so loaded ontologies use their base). */
export function getObjectPropertyUriFromStore(store: Store, name: string): string {
  if (name.startsWith('http://') || name.startsWith('https://')) return name;
  const ops = getObjectProperties(store);
  const op = ops.find((p) => p.name === name || p.uri === name);
  if (!op || !op.uri) {
    // Fallback to BASE_IRI if property not found (for backward compatibility)
    // Note: This may fail if the property is from an imported ontology
    return BASE_IRI + name;
  }
  return op.uri;
}

/**
 * Add a new object property (relationship type) to the store.
 * Returns the property localName, or null on failure.
 * Optional: comment, isDefinedBy (URI), subPropertyOf (name or URI), domain (class local name), range (class local name).
 */
export function addObjectPropertyToStore(
  store: Store,
  label: string,
  hasCardinality: boolean,
  localName?: string,
  options?: { comment?: string | null; isDefinedBy?: string | null; subPropertyOf?: string | null; domain?: string | null; range?: string | null }
): string | null {
  const existingNames = new Set(getObjectProperties(store).map((op) => op.name));
  let name = localName ?? (labelToCamelCaseIdentifier(label) || extractLocalName(label) || 'newProperty').replace(/\s+/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) name = 'newProperty';
  const baseName = name;
  let n = 0;
  while (existingNames.has(name)) {
    name = `${baseName}${++n}`;
  }
  ensureHasCardinalityAnnotationProperty(store);
  const ns = getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI;
  const base = ns.endsWith('#') ? ns : ns + '#';
  const subjUri = base + name;
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'ObjectProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  // A domain or range is written only when one was given. A blank field asserts nothing, and
  // filling it with owl:Thing would put a claim in the file the author never made.
  const domainInput = options?.domain?.trim() ?? '';
  const rangeInput = options?.range?.trim() ?? '';
  if (domainInput) {
    const domainUri = namesOwlThing(domainInput) ? OWL_THING_URI : resolveClassUri(store, domainInput);
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'domain'), DataFactory.namedNode(domainUri), graph);
  }
  if (rangeInput) {
    const rangeUri = namesOwlThing(rangeInput) ? OWL_THING_URI : resolveClassUri(store, rangeInput);
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(rangeUri), graph);
  }
  store.addQuad(
    subject,
    DataFactory.namedNode(HAS_CARDINALITY_PROP),
    DataFactory.literal(String(hasCardinality), DataFactory.namedNode(XSD + 'boolean')),
    graph
  );
  if (options?.comment != null && options.comment.trim() !== '') {
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'comment'), DataFactory.literal(options.comment.trim()), graph);
  }
  if (options?.isDefinedBy != null && options.isDefinedBy.trim() !== '' && options.isDefinedBy.trim().startsWith('http')) {
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'isDefinedBy'), DataFactory.namedNode(options.isDefinedBy.trim()), graph);
  }
  if (options?.subPropertyOf != null && options.subPropertyOf.trim() !== '') {
    const parentUri = resolveObjectPropertyUri(store, options.subPropertyOf.trim());
    if (parentUri) store.addQuad(subject, DataFactory.namedNode(RDFS + 'subPropertyOf'), DataFactory.namedNode(parentUri), graph);
  }
  return name;
}

/**
 * Update rdfs:label for an object property in the store.
 * Returns false for subClassOf or if property not found.
 */
export function updateObjectPropertyLabelInStore(
  store: Store,
  propertyName: string,
  newLabel: string
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
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
 * Update rdfs:comment for an object property in the store.
 * Returns false for subClassOf (standard RDFS property) or if property not found.
 */
export function updateObjectPropertyCommentInStore(
  store: Store,
  propertyName: string,
  comment: string | null
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
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
 * Update rdfs:domain and rdfs:range for an object property in the store.
 * domainName/rangeName are class local names. Null or empty removes the triple entirely: a blank
 * field means the ontology asserts nothing, which is not the same as asserting owl:Thing. Pass
 * "owl:Thing" to assert the universal domain or range on purpose.
 * Returns false for subClassOf or if property not found.
 */
export function updateObjectPropertyDomainRangeInStore(
  store: Store,
  propertyName: string,
  domainName: string | null,
  rangeName: string | null
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;

  const domainPred = DataFactory.namedNode(RDFS + 'domain');
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const domainQuads = store.getQuads(subject, domainPred, null, null);
  const rangeQuads = store.getQuads(subject, rangePred, null, null);
  const graph = domainQuads[0]?.graph ?? rangeQuads[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();

  for (const dq of domainQuads) store.removeQuad(dq);
  for (const rq of rangeQuads) store.removeQuad(rq);

  if (domainName?.trim()) {
    const domainUri = namesOwlThing(domainName) ? OWL_THING_URI : resolveClassUri(store, domainName);
    store.addQuad(subject, domainPred, DataFactory.namedNode(domainUri), graph);
  }
  if (rangeName?.trim()) {
    const rangeUri = namesOwlThing(rangeName) ? OWL_THING_URI : resolveClassUri(store, rangeName);
    store.addQuad(subject, rangePred, DataFactory.namedNode(rangeUri), graph);
  }
  return true;
}

/**
 * Resolve object property name or URI to full URI (from store or BASE_IRI).
 */
function resolveObjectPropertyUri(store: Store, nameOrUri: string): string {
  if (!nameOrUri || !nameOrUri.trim()) return '';
  const trimmed = nameOrUri.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const ops = getObjectProperties(store);
  for (const op of ops) {
    if (op.uri === trimmed || op.name === trimmed) return op.uri ?? BASE_IRI + trimmed;
  }
  return BASE_IRI + trimmed;
}

/**
 * Update rdfs:subPropertyOf for an object property in the store.
 * parentNameOrUri: object property local name or full URI; null/empty removes the triple.
 * Returns false for subClassOf or if property not found.
 */
export function updateObjectPropertySubPropertyOfInStore(
  store: Store,
  propertyName: string,
  parentNameOrUri: string | null
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;

  const pred = DataFactory.namedNode(RDFS + 'subPropertyOf');
  const existing = store.getQuads(subject, pred, null, null);
  const graph = existing[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existing) store.removeQuad(q);
  if (parentNameOrUri != null && parentNameOrUri.trim() !== '') {
    const parentUri = resolveObjectPropertyUri(store, parentNameOrUri);
    if (parentUri) store.addQuad(subject, pred, DataFactory.namedNode(parentUri), graph);
  }
  return true;
}

/**
 * Update rdfs:isDefinedBy for an object property in the store.
 * uri: full URI of the defining ontology; null/empty removes the triple.
 * Returns false for subClassOf or if property not found.
 */
export function updateObjectPropertyIsDefinedByInStore(
  store: Store,
  propertyName: string,
  uri: string | null
): boolean {
  if (propertyName === 'subClassOf') return false;
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;

  const pred = DataFactory.namedNode(RDFS + 'isDefinedBy');
  const existing = store.getQuads(subject, pred, null, null);
  const graph = existing[0]?.graph ?? quads[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of existing) store.removeQuad(q);
  if (uri != null && uri.trim() !== '' && uri.trim().startsWith('http')) {
    store.addQuad(subject, pred, DataFactory.namedNode(uri.trim()), graph);
  }
  return true;
}

/**
 * Rename an object property in the store (change its subject URI).
 * Updates all quads that have the old subject or old URI as object (e.g. rdfs:subPropertyOf).
 * @param oldSubjectUri Full URI of the property (e.g. from ObjectPropertyInfo.uri).
 * @param newLocalName New local name (identifier) for the property.
 * @returns true if rename succeeded.
 */
export function renameObjectPropertyInStore(
  store: Store,
  oldSubjectUri: string,
  newLocalName: string
): boolean {
  if (!newLocalName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newLocalName)) return false;
  // A rename changes only the local name, never the namespace: keep the term's own, as renaming a data property does (#33).
  // The ontology's base is only for a URI with no namespace, and it is not the namespace of every term: an ontology IRI
  // without the term namespace is common, and the Edit dialog shows the IRI the rename will give (#202).
  const ns = namespaceFromUri(oldSubjectUri) ?? getMainOntologyBase(store) ?? BASE_IRI;
  const base = ns.endsWith('#') || ns.endsWith('/') ? ns : ns + '#';
  const newUri = base + newLocalName;
  if (oldSubjectUri === newUri) return true;
  const oldSubject = DataFactory.namedNode(oldSubjectUri);
  const newSubject = DataFactory.namedNode(newUri);
  const quadsWithOldSubject = store.getQuads(oldSubject, null, null, null);
  const quadsWithOldObject = store.getQuads(null, null, oldSubject, null);
  const graph = quadsWithOldSubject[0]?.graph ?? quadsWithOldObject[0]?.graph ?? DataFactory.defaultGraph();
  for (const q of quadsWithOldSubject) {
    store.addQuad(
      newSubject,
      q.predicate,
      q.object,
      q.graph.termType === 'DefaultGraph' ? graph : q.graph
    );
  }
  for (const q of quadsWithOldObject) {
    store.addQuad(
      q.subject,
      q.predicate,
      newSubject,
      q.graph.termType === 'DefaultGraph' ? graph : q.graph
    );
  }
  for (const q of quadsWithOldSubject) store.removeQuad(q);
  for (const q of quadsWithOldObject) store.removeQuad(q);
  return true;
}

/**
 * Remove an object property from the store and all edges that use it.
 * Returns the number of edges removed, or -1 on failure.
 * Does not remove subClassOf (it is not an object property).
 */
export function removeObjectPropertyFromStore(store: Store, propertyName: string): number {
  if (propertyName === 'subClassOf') return -1;
  // From the store, so a local name resolves in an ontology outside the default namespace (#87).
  const propUri = getObjectPropertyUriFromStore(store, propertyName);
  const propNode = DataFactory.namedNode(propUri);
  const onPropertyPred = DataFactory.namedNode(OWL + 'onProperty');
  const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
  let removed = 0;
  const blanksToRemove: import('n3').BlankNode[] = [];
  for (const q of store.getQuads(null, onPropertyPred, propNode, null)) {
    if (q.subject.termType === 'BlankNode') blanksToRemove.push(q.subject as import('n3').BlankNode);
  }
  for (const blank of blanksToRemove) {
    const fromQuads = store.getQuads(null, subClassOfPred, blank, null);
    for (const fq of fromQuads) {
      store.removeQuad(fq);
      removed++;
    }
    for (const bq of store.getQuads(blank, null, null, null)) store.removeQuad(bq);
    for (const oq of store.getQuads(null, null, blank, null)) store.removeQuad(oq);
  }
  const subject = DataFactory.namedNode(propUri);
  for (const q of store.getQuads(subject, null, null, null)) store.removeQuad(q);
  return removed;
}
