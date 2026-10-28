/**
 * Editing data properties in the store: adding, removing, renaming and changing them. Moved out of src/parser.ts unchanged (#193, step 4c).
 */

import { BASE_IRI, OWL, RDF, RDFS, namespaceFromUri } from './vocab';
import { DataFactory, Store } from 'n3';
import type { RdfTerm } from '../rdf/classExpressions';
import { classUriForName } from '../graph/classNodeIds';
import { debugWarn } from '../utils/debug';
import { extractLocalName } from '../utils/localName';
import { getClassNamespace, getDataProperties, getMainOntologyBase } from './readOntology';
import { labelToCamelCaseIdentifier } from '../lib/identifierFromLabel';
import { removeBlankNodeClosure } from '../rdf/blankNodes';

/**
 * Add a new data property (owl:DatatypeProperty) to the store.
 * Returns the property localName, or null on failure.
 * @param rangeUri Full URI of the datatype range (e.g. http://www.w3.org/2001/XMLSchema#string). null means no range.
 */
export function addDataPropertyToStore(
  store: Store,
  label: string,
  rangeUri: string | null,
  localName?: string
): string | null {
  const existingNames = new Set(getDataProperties(store).map((dp) => dp.name));
  let name = localName ?? (labelToCamelCaseIdentifier(label) || extractLocalName(label) || 'newDataProperty').replace(/\s+/g, '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) name = 'newDataProperty';
  const baseName = name;
  let n = 0;
  while (existingNames.has(name)) {
    name = `${baseName}${++n}`;
  }
  const ns = getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI;
  const base = ns.endsWith('#') ? ns : ns + '#';
  const subjUri = base + name;
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'DatatypeProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  // No domain is asserted on creation. A new property applies to nothing in particular yet, and
  // writing rdfs:domain owl:Thing would state a claim the author never made - the same defect
  // fixed on the update path, where clearing every domain now removes every domain triple.
  if (rangeUri != null && rangeUri.trim() !== '') {
    store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(rangeUri.trim()), graph);
  }
  return name;
}

/** Resolve data property name to full URI from store. */
function getDataPropertyUriFromStore(store: Store, name: string): string {
  if (name.startsWith('http://') || name.startsWith('https://')) return name;
  const dps = getDataProperties(store);
  const dp = dps.find((p) => p.name === name || p.uri === name);
  return dp?.uri ?? BASE_IRI + name;
}

/**
 * Update rdfs:label for a data property in the store.
 */
export function updateDataPropertyLabelInStore(
  store: Store,
  propertyName: string,
  newLabel: string
): boolean {
  const propUri = getDataPropertyUriFromStore(store, propertyName);
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
 * Update rdfs:comment for a data property in the store.
 */
export function updateDataPropertyCommentInStore(
  store: Store,
  propertyName: string,
  comment: string | null
): boolean {
  const propUri = getDataPropertyUriFromStore(store, propertyName);
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
 * Update rdfs:isDefinedBy for a data property in the store.
 */
export function updateDataPropertyIsDefinedByInStore(
  store: Store,
  propertyName: string,
  uri: string | null
): boolean {
  const propUri = getDataPropertyUriFromStore(store, propertyName);
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
 * Update rdfs:range for a data property in the store.
 * @param rangeUri Full datatype URI, or null to assert no range at all (removes the triple).
 */
export function updateDataPropertyRangeInStore(
  store: Store,
  propertyName: string,
  rangeUri: string | null
): boolean {
  const propUri = getDataPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  // An unknown name resolves to BASE_IRI + name, so without this the writer would assert a range on
  // a subject the ontology has never heard of and report success for it.
  const subjectQuads = store.getQuads(subject, null, null, null);
  if (subjectQuads.length === 0) return false;
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const rangeQuads = store.getQuads(subject, rangePred, null, null);
  const graph = rangeQuads[0]?.graph ?? subjectQuads[0]?.graph ?? DataFactory.defaultGraph();
  for (const rq of rangeQuads) {
    store.removeQuad(rq);
    // An anonymous range (datatype restriction with facets, datatype union, …) goes with it entirely,
    // rather than staying behind as stray blank-node triples (#63).
    if (store.getQuads(null, null, rq.object, null).length === 0) removeBlankNodeClosure(store, rq.object as RdfTerm);
  }
  if (rangeUri) {
    store.addQuad(subject, rangePred, DataFactory.namedNode(rangeUri), graph);
  }
  return true;
}

/**
 * Update data property domains in the store.
 * An empty domains array asserts no domain at all (all rdfs:domain triples are removed).
 * Otherwise, removes all existing domain quads and adds new ones for each domain.
 */
export function updateDataPropertyDomainsInStore(
  store: Store,
  propertyName: string,
  domains: string[]
): boolean {
  // Find the property URI (could be from base IRI or external)
  let propUri: string | null = null;
  const dpQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  for (const q of dpQuads) {
    if (q.subject.termType === 'NamedNode') {
      const currentUri = (q.subject as { value: string }).value;
      if (extractLocalName(currentUri) === propertyName) {
        propUri = currentUri;
        break;
      }
    }
  }
  
  if (!propUri) {
    debugWarn(`Data property URI for "${propertyName}" not found in store.`);
    return false;
  }
  
  const subject = DataFactory.namedNode(propUri);
  const domainPred = DataFactory.namedNode(RDFS + 'domain');
  const existingDomainQuads = store.getQuads(subject, domainPred, null, null);
  const graph = existingDomainQuads[0]?.graph ?? DataFactory.defaultGraph();
  
  // Remove all existing domain quads
  for (const dq of existingDomainQuads) {
    store.removeQuad(dq);
  }
  
  // An empty domain list means the property asserts no domain. Leave it that way rather than
  // writing rdfs:domain owl:Thing, which would put a claim in the file the user never made.
  if (domains.length === 0) {
    return true;
  } else {
    // Add each domain
    for (const domainName of domains) {
      // Try to find the domain URI (could be base IRI or external)
      let domainUri: string | null = classUriForName(store, domainName);
      
      // If not found, assume it's from base IRI
      if (!domainUri) {
        domainUri = BASE_IRI + domainName;
      }
      
      store.addQuad(subject, domainPred, DataFactory.namedNode(domainUri), graph);
    }
  }
  
  return true;
}

/**
 * Remove a data property from the store.
 */
export function removeDataPropertyFromStore(store: Store, propertyName: string): boolean {
  // First try the base IRI
  let propUri = BASE_IRI + propertyName;
  let subject = DataFactory.namedNode(propUri);
  let quads = store.getQuads(subject, null, null, null);
  
  // If not found, search for any DatatypeProperty with this local name
  if (quads.length === 0) {
    const dpQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
    for (const q of dpQuads) {
      if (q.subject.termType === 'NamedNode') {
        const subjUri = (q.subject as { value: string }).value;
        if (extractLocalName(subjUri) === propertyName) {
          propUri = subjUri;
          subject = DataFactory.namedNode(propUri);
          quads = store.getQuads(subject, null, null, null);
          break;
        }
      }
    }
  }
  
  if (quads.length === 0) return false;
  for (const q of quads) store.removeQuad(q);
  return true;
}

/**
 * Rename a data property in the store (change its subject URI).
 * @param oldSubjectUri Full URI of the property (e.g. from DataPropertyInfo.uri).
 * @param newLocalName New local name (identifier) for the property.
 * @returns true if rename succeeded.
 */
export function renameDataPropertyInStore(
  store: Store,
  oldSubjectUri: string,
  newLocalName: string
): boolean {
  if (!newLocalName || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newLocalName)) return false;
  // A rename changes only the local name, never the namespace: keep the term's own namespace.
  // getClassNamespace() returns whichever owl:Class quad comes back first, which in a document
  // that declares external typing stubs (e.g. a local prov:Agent) can be an external namespace,
  // reassigning a local property into someone else's vocabulary (issue #33). Fall back to the
  // document's own ontology base, then BASE_IRI, only when the old URI has no namespace.
  const existingNs = namespaceFromUri(oldSubjectUri);
  const ns = existingNs ?? getMainOntologyBase(store) ?? getClassNamespace(store) ?? BASE_IRI;
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
