/**
 * Editing classes in the store: their labels, comments and labellable flag, adding and removing a class, and the helpers that resolve the URI of a class. Moved out of src/parser.ts unchanged (#193, step 4a).
 */

import { BASE_IRI, OWL, OWL_THING_URI, RDF, RDFS } from './vocab';
import { DataFactory, Store } from 'n3';
import { classUriForName } from '../graph/classNodeIds';
import { extractLocalName } from '../utils/localName';
import { getClassNamespace, getMainOntologyBase } from './ontologyBase';
import { labelToCamelCaseIdentifier } from '../lib/identifierFromLabel';

/**
 * Update rdfs:label for a class in the store. localName is the class id (e.g. "FacadeCladding").
 */
export function updateLabelInStore(
  store: Store,
  localName: string,
  newLabel: string
): boolean {
  const target = classUriForName(store, localName); // resolved once, not per class (#164)
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (subj.value !== target) continue; // only the class the name stands for (#164)

    const labelQuads = store.getQuads(subj, RDFS + 'label', null, null);
    const graph = labelQuads[0]?.graph ?? DataFactory.defaultGraph();
    for (const lq of labelQuads) {
      store.removeQuad(lq);
    }
    store.addQuad(
      subj,
      DataFactory.namedNode(RDFS + 'label'),
      DataFactory.literal(newLabel),
      graph
    );
    return true;
  }
  return false;
}

function findLabellablePredicate(store: Store): string | null {
  for (const q of store) {
    if (q.predicate.value.endsWith('labellableRoot')) {
      return q.predicate.value;
    }
  }
  return null;
}

/**
 * Update rdfs:comment for a class in the store.
 */
export function updateCommentInStore(
  store: Store,
  localName: string,
  comment: string | null
): boolean {
  const target = classUriForName(store, localName); // resolved once, not per class (#164)
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  const commentPred = DataFactory.namedNode(RDFS + 'comment');
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (subj.value !== target) continue; // only the class the name stands for (#164)

    const commentQuads = store.getQuads(subj, commentPred, null, null);
    const graph = commentQuads[0]?.graph ?? store.getQuads(subj, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
    for (const cq of commentQuads) store.removeQuad(cq);
    if (comment !== null && comment.trim() !== '') {
      store.addQuad(subj, commentPred, DataFactory.literal(comment.trim()), graph);
    }
    return true;
  }
  return false;
}

/**
 * Update labellableRoot for a class in the store.
 */
export function updateLabellableInStore(
  store: Store,
  localName: string,
  labellable: boolean
): boolean {
  const target = classUriForName(store, localName); // resolved once, not per class (#164)
  const XSD = 'http://www.w3.org/2001/XMLSchema#';
  const predUri = findLabellablePredicate(store);
  const labellablePredicate = predUri
    ? DataFactory.namedNode(predUri)
    : DataFactory.namedNode('http://example.org/aec-drawing-ontology#labellableRoot');

  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (subj.value !== target) continue; // only the class the name stands for (#164)

    const outQuads = store.getQuads(subj, null, null, null);
    for (const oq of outQuads) {
      if (oq.predicate.value.endsWith('labellableRoot')) {
        store.removeQuad(oq);
      }
    }
    const graph = store.getQuads(subj, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
    store.addQuad(
      subj,
      labellablePredicate,
      DataFactory.literal(String(labellable), DataFactory.namedNode(XSD + 'boolean')),
      graph
    );
    return true;
  }
  return false;
}

export function toClassUri(localName: string): string {
  return BASE_IRI + localName;
}

/**
 * Resolve the namespace to use for class URIs from the loaded store, so edge/restriction/node
 * operations target the ontology's actual namespace instead of the hardcoded BASE_IRI default.
 * Falls back to BASE_IRI for empty ontologies. For files whose class namespace already equals
 * BASE_IRI this returns BASE_IRI unchanged (no behaviour change).
 */
export function resolveClassBase(store: Store): string {
  let base = getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI;
  if (!base.endsWith('#') && !base.endsWith('/')) base += '#';
  return base;
}

/**
 * Derive the identifier that would be used for a new node with the given label.
 * Used by the editor to validate before adding. Must stay in sync with addNodeToStore.
 */
export function deriveNewNodeIdentifier(label: string): string {
  // Class names are UpperCamelCase in OWL ("Drawing element" -> DrawingElement); properties are lowerCamelCase (#146).
  const camel = labelToCamelCaseIdentifier(label);
  const raw = (camel ? camel.charAt(0).toUpperCase() + camel.slice(1) : '') || extractLocalName(label) || 'NewClass';
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(raw) ? raw : 'NewClass';
}

/**
 * Add a new OWL class (node) to the store.
 * Returns the new localName, or null if a node with that identifier already exists.
 */
export function addNodeToStore(
  store: Store,
  label: string,
  localName?: string
): string | null {
  const existingIdsLower = new Set<string>();
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType === 'NamedNode') {
      existingIdsLower.add(extractLocalName((subj as { value: string }).value).toLowerCase());
    }
  }
  const id = localName ?? deriveNewNodeIdentifier(label);
  if (existingIdsLower.has(id.toLowerCase())) return null;
  // Derive the namespace from the loaded ontology so the new class lands in the same
  // namespace as its siblings (and serializes with the file's prefix), instead of the
  // hardcoded BASE_IRI default which would force an out-of-namespace full URI.
  let baseIri = getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI;
  if (!baseIri.endsWith('#') && !baseIri.endsWith('/')) baseIri += '#';
  const subjUri = baseIri + id;
  const subject = DataFactory.namedNode(subjUri);
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || id), graph);
  return id;
}

/**
 * Remove a node (OWL class) from the store.
 * Also removes any domain/range quads that reference this node.
 */
export function removeNodeFromStore(store: Store, localName: string): boolean {
  const subjUri = classUriForName(store, localName) ?? resolveClassBase(store) + localName; // the class the name stands for (#164)
  const subject = DataFactory.namedNode(subjUri);
  
  // Remove all quads where this node is the subject
  const quads = store.getQuads(subject, null, null, null);
  for (const q of quads) store.removeQuad(q);
  
  // Remove all domain/range quads where this node is the object
  // This ensures that when a node is deleted, properties no longer reference it
  const domainQuads = store.getQuads(null, DataFactory.namedNode(RDFS + 'domain'), subject, null);
  for (const q of domainQuads) store.removeQuad(q);
  const rangeQuads = store.getQuads(null, DataFactory.namedNode(RDFS + 'range'), subject, null);
  for (const q of rangeQuads) store.removeQuad(q);
  
  return quads.length > 0 || domainQuads.length > 0 || rangeQuads.length > 0;
}

/**
 * Resolve a class local name to full URI (from store or BASE_IRI).
 */
export function resolveClassUri(store: Store, localName: string): string {
  if (!localName || localName.trim() === '') return OWL_THING_URI;
  return classUriForName(store, localName.trim()) ?? BASE_IRI + localName.trim();
}

/**
 * Whether the user typed owl:Thing (in any of the forms the class field accepts) to assert the
 * universal domain or range deliberately, as opposed to leaving the field blank.
 */
export function namesOwlThing(value: string): boolean {
  const v = value.trim();
  return v === 'Thing' || v === 'owl:Thing' || v === OWL_THING_URI;
}
