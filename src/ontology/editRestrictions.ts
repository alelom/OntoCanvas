/**
 * Editing restrictions in the store: finding, adding and removing the restriction blank nodes of a class, and the data property restrictions. Moved out of src/parser.ts unchanged (#193, step 4e).
 */

import { BASE_IRI, OWL, OWL_ON_DATA_RANGE, RDF, RDFS, XSD, XSD_NS } from './vocab';
import { DataFactory, Store } from 'n3';
import type { DataPropertyRestriction } from '../types';
import type { RdfTerm } from '../rdf/classExpressions';
import { classUriForName } from '../graph/classNodeIds';
import { extractLocalName } from '../utils/localName';
import { findRestrictionBlanks, readRestrictionCardinality, removeRestrictionBlank } from '../rdf/restrictions';
import { getDataProperties } from './readDataProperties';
import { getObjectPropertyUriFromStore } from './editObjectProperties';
import { resolveClassBase, toClassUri } from './editClasses';

export function findRestrictionBlank(
  store: Store,
  classLocalName: string,
  propertyLocalName: string,
  targetLocalName: string
): import('n3').BlankNode | null {
  const base = resolveClassBase(store);
  const classUri = base + classLocalName;
  const subClassQuads = store.getQuads(
    DataFactory.namedNode(classUri),
    DataFactory.namedNode(RDFS + 'subClassOf'),
    null,
    null
  );
  const propUri = getObjectPropertyUriFromStore(store, propertyLocalName);
  const targetUri = base + targetLocalName;
  for (const q of subClassQuads) {
    const obj = q.object;
    if (obj.termType !== 'BlankNode') continue;
    const onProp = store.getQuads(obj, DataFactory.namedNode(OWL + 'onProperty'), null, null)[0];
    const someFrom = store.getQuads(obj, DataFactory.namedNode(OWL + 'someValuesFrom'), null, null)[0];
    const onCls = store.getQuads(obj, DataFactory.namedNode(OWL + 'onClass'), null, null)[0];
    const targetQuad = someFrom ?? onCls;
    if (!onProp || !targetQuad) continue;
    const onPropObj = onProp.object as { value?: string };
    const targetObj = targetQuad.object as { value?: string };
    if (onPropObj?.value !== propUri || targetObj?.value !== targetUri) continue;
    return obj as import('n3').BlankNode;
  }
  return null;
}

/** Resolve class URI from store by local name (use actual subject from loaded ontology). */
function getClassUriFromStore(store: Store, classLocalName: string): string {
  return classUriForName(store, classLocalName) ?? toClassUri(classLocalName);
}

function findDataRestrictionBlank(
  store: Store,
  classLocalName: string,
  dataPropName: string
): import('n3').BlankNode | null {
  const classUri = getClassUriFromStore(store, classLocalName);
  const dataPropQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  let propUri = BASE_IRI + dataPropName;
  for (const q of dataPropQuads) {
    if (q.subject.termType === 'NamedNode' && extractLocalName((q.subject as { value: string }).value) === dataPropName) {
      propUri = (q.subject as { value: string }).value;
      break;
    }
  }
  const subClassQuads = store.getQuads(
    DataFactory.namedNode(classUri),
    DataFactory.namedNode(RDFS + 'subClassOf'),
    null,
    null
  );
  for (const q of subClassQuads) {
    const obj = q.object;
    if (obj.termType !== 'BlankNode') continue;
    const onProp = store.getQuads(obj, DataFactory.namedNode(OWL + 'onProperty'), null, null)[0];
    const onDataRange = store.getQuads(obj, DataFactory.namedNode(OWL_ON_DATA_RANGE), null, null)[0];
    if (!onProp || !onDataRange) continue;
    if ((onProp.object as { value: string }).value !== propUri) continue;
    return obj as import('n3').BlankNode;
  }
  return null;
}

/**
 * Add a data property restriction to a class (owl:Restriction with owl:onDataRange).
 *
 * `onDataRange` is the data range this restriction already asserts, when there is one. A cardinality
 * edit is implemented as remove-then-re-add, so without it the asserted datatype would be replaced
 * by one derived from the property's rdfs:range — writing a type the document never stated.
 * Returns true on success.
 */
export function addDataPropertyRestrictionToClass(
  store: Store,
  classLocalName: string,
  dataPropName: string,
  cardinality?: { minCardinality?: number | null; maxCardinality?: number | null },
  onDataRange?: string | null
): boolean {
  if (findDataRestrictionBlank(store, classLocalName, dataPropName)) return false;
  const dataProps = getDataProperties(store);
  const dp = dataProps.find((p) => p.name === dataPropName);
  // owl:onDataRange is mandatory on a qualified restriction, so an unconstrained property has to
  // name some data range. rdfs:Literal is the honest one: it is the OWL meaning of "any literal".
  // Defaulting to xsd:string here would write a datatype the ontology never asserted into the file.
  const rangeUri = onDataRange ?? dp?.range ?? RDFS + 'Literal';
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  const classUri = getClassUriFromStore(store, classLocalName);
  const dataPropQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  let propUri = BASE_IRI + dataPropName;
  for (const q of dataPropQuads) {
    if (q.subject.termType === 'NamedNode' && extractLocalName((q.subject as { value: string }).value) === dataPropName) {
      propUri = (q.subject as { value: string }).value;
      break;
    }
  }
  const blank = DataFactory.blankNode();
  const min = cardinality?.minCardinality;
  const max = cardinality?.maxCardinality;
  store.addQuad(DataFactory.namedNode(classUri), DataFactory.namedNode(RDFS + 'subClassOf'), blank, graph);
  store.addQuad(blank, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Restriction'), graph);
  store.addQuad(blank, DataFactory.namedNode(OWL + 'onProperty'), DataFactory.namedNode(propUri), graph);
  store.addQuad(blank, DataFactory.namedNode(OWL_ON_DATA_RANGE), DataFactory.namedNode(rangeUri), graph);
  // owl:onDataRange goes with the qualified forms in OWL 2 (#75); the reader accepts both forms.
  const addCount = (pred: string, n: number) =>
    store.addQuad(blank, DataFactory.namedNode(OWL + pred), DataFactory.literal(n, DataFactory.namedNode(XSD_NS + 'nonNegativeInteger')), graph);
  if (min != null && max != null && min === max) {
    addCount('qualifiedCardinality', min);
  } else {
    if (min != null) addCount('minQualifiedCardinality', min);
    if (max != null) addCount('maxQualifiedCardinality', max);
  }
  return true;
}

/**
 * Remove a data property restriction from a class.
 */
export function removeDataPropertyRestrictionFromClass(
  store: Store,
  classLocalName: string,
  dataPropName: string
): boolean {
  const blank = findDataRestrictionBlank(store, classLocalName, dataPropName);
  if (!blank) return false;
  const classUri = getClassUriFromStore(store, classLocalName);
  const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
  for (const q of store.getQuads(DataFactory.namedNode(classUri), subClassOfPred, blank, null)) store.removeQuad(q);
  for (const q of store.getQuads(blank, null, null, null)) store.removeQuad(q);
  for (const q of store.getQuads(null, null, blank, null)) store.removeQuad(q);
  return true;
}

/**
 * Read data property restrictions for a class from the store (same structure as parsed).
 */
export function getDataPropertyRestrictionsForClass(
  store: Store,
  classLocalName: string
): DataPropertyRestriction[] {
  const classUri = getClassUriFromStore(store, classLocalName);
  const result: DataPropertyRestriction[] = [];
  const subClassQuads = store.getQuads(DataFactory.namedNode(classUri), DataFactory.namedNode(RDFS + 'subClassOf'), null, null);
  for (const q of subClassQuads) {
    const obj = q.object;
    if (obj.termType !== 'BlankNode') continue;
    const onProp = store.getQuads(obj, DataFactory.namedNode(OWL + 'onProperty'), null, null)[0];
    const onDataRange = store.getQuads(obj, DataFactory.namedNode(OWL_ON_DATA_RANGE), null, null)[0];
    if (!onProp || !onDataRange) continue;
    const propName = extractLocalName((onProp.object as { value: string }).value);
    // Qualified (OWL 2, the form used with owl:onDataRange) or unqualified cardinality (#63).
    const { min: minCard, max: maxCard } = readRestrictionCardinality(store, obj as RdfTerm);
    result.push({
      propertyName: propName,
      minCardinality: minCard ?? undefined,
      maxCardinality: maxCard ?? undefined,
      onDataRange: (onDataRange.object as { value?: string }).value,
    });
  }
  return result;
}

/**
 * Add only the OWL restriction to the store, leaving domain/range intact.
 * The edge will be visible as a restriction edge.
 * Called when adding a restriction to an existing domain/range edge.
 * 
 * @throws Error if restriction already exists or cannot be added
 */
export function addRestrictionToStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string,
  cardinality?: { minCardinality?: number | null; maxCardinality?: number | null }
): void {
  const base = resolveClassBase(store);
  if (edgeType === 'subClassOf') {
    // subClassOf is not a restriction, it's a direct relationship
    const subjUri = base + from;
    const objUri = base + to;
    const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
    const existing = store.getQuads(
      DataFactory.namedNode(subjUri),
      subClassOfPred,
      DataFactory.namedNode(objUri),
      null
    );
    if (existing.length > 0) {
      throw new Error(`Cannot add subClassOf edge: ${from} -> ${to} (already exists in store)`);
    }
    const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
    store.addQuad(
      DataFactory.namedNode(subjUri),
      subClassOfPred,
      DataFactory.namedNode(objUri),
      graph
    );
    return;
  }
  
  // Any edge type other than subClassOf is stored as an OWL restriction
  if (edgeType !== 'subClassOf') {
    if (findRestrictionBlank(store, from, edgeType, to)) {
      throw new Error(`Cannot add restriction: ${from} -> ${to} : ${edgeType} (restriction already exists in store)`);
    }
    const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
    const blank = DataFactory.blankNode();
    const fromUri = DataFactory.namedNode(base + from);
    const propUri = DataFactory.namedNode(getObjectPropertyUriFromStore(store, edgeType));
    const toUri = DataFactory.namedNode(base + to);
    const restrictionType = DataFactory.namedNode(OWL + 'Restriction');
    const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
    const onPropertyPred = DataFactory.namedNode(OWL + 'onProperty');
    const rdfType = DataFactory.namedNode(RDF + 'type');

    store.addQuad(fromUri, subClassOfPred, blank, graph);
    store.addQuad(blank, rdfType, restrictionType, graph);
    store.addQuad(blank, onPropertyPred, propUri, graph);

    const min = cardinality?.minCardinality;
    const max = cardinality?.maxCardinality;
    const hasCardinality = min != null || max != null;

    if (hasCardinality) {
      store.addQuad(blank, DataFactory.namedNode(OWL + 'onClass'), toUri, graph);
      if (min != null && max != null && min === max) {
        store.addQuad(blank, DataFactory.namedNode(OWL + 'qualifiedCardinality'), DataFactory.literal(min, DataFactory.namedNode(XSD + 'nonNegativeInteger')), graph);
      } else {
        if (min != null) {
          store.addQuad(blank, DataFactory.namedNode(OWL + 'minQualifiedCardinality'), DataFactory.literal(min, DataFactory.namedNode(XSD + 'nonNegativeInteger')), graph);
        }
        if (max != null) {
          store.addQuad(blank, DataFactory.namedNode(OWL + 'maxQualifiedCardinality'), DataFactory.literal(max, DataFactory.namedNode(XSD + 'nonNegativeInteger')), graph);
        }
      }
    } else {
      store.addQuad(blank, DataFactory.namedNode(OWL + 'someValuesFrom'), toUri, graph);
    }
    return;
  }
  
  throw new Error(`Unsupported edge type: ${edgeType}`);
}

/**
 * Remove only the OWL restriction from the store, leaving the domain/range definition intact.
 * The edge will remain visible as a non-restriction edge (from domain/range).
 * Called from the Edit Edge modal when unchecking "is restriction".
 * 
 * @throws Error if the restriction cannot be found or removed
 */
export function removeRestrictionFromStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string
): void {
  const base = resolveClassBase(store);
  if (edgeType === 'subClassOf') {
    // subClassOf is not a restriction, it's a direct relationship
    const subjUri = base + from;
    const objUri = base + to;
    const quads = store.getQuads(
      DataFactory.namedNode(subjUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      DataFactory.namedNode(objUri),
      null
    );
    if (quads.length === 0) {
      throw new Error(`Cannot remove subClassOf edge: ${from} -> ${to} (not found in store)`);
    }
    for (const q of quads) store.removeQuad(q);
    return;
  }

  // Find and remove the restriction blank node
  const blank = findRestrictionBlank(store, from, edgeType, to);
  if (!blank) {
    throw new Error(`Cannot remove restriction: ${from} -> ${to} : ${edgeType} (restriction not found in store)`);
  }

  // Restriction exists - remove it
  const fromUri = DataFactory.namedNode(base + from);
  const subClassOfQuads = store.getQuads(fromUri, DataFactory.namedNode(RDFS + 'subClassOf'), blank, null);
  for (const q of subClassOfQuads) store.removeQuad(q);
  const blankQuads = store.getQuads(blank, null, null, null);
  for (const q of blankQuads) store.removeQuad(q);
  const blankAsObjQuads = store.getQuads(null, null, blank, null);
  for (const q of blankAsObjQuads) store.removeQuad(q);
}

/**
 * Remove the OWL restriction(s) drawn as the edge from→to for `edgeType` — any kind (∃ ∀ ∋ ⟲,
 * qualified or unqualified cardinality; see src/rdf/restrictions.ts) — leaving the property's
 * domain/range alone. Used when a class is deleted, so its read-only restriction edges (which
 * removeEdgeFromStore, knowing only ∃/onClass, would mishandle) go cleanly. Returns how many were removed.
 */
export function removeRestrictionEdgeFromStore(store: Store, from: string, to: string, edgeType: string): number {
  // Restriction edges name both ends by local name; a class may be declared outside the main namespace.
  const base = resolveClassBase(store);
  const uriOf = (name: string) =>
    /^https?:\/\//.test(name) ? name : classUriForName(store, name) ?? base + name;
  const propUri = getObjectPropertyUriFromStore(store, edgeType);
  if (!propUri) return 0;
  const subjectUri = uriOf(from);
  const blanks = findRestrictionBlanks(store, subjectUri, propUri, uriOf(to));
  for (const blank of blanks) removeRestrictionBlank(store, subjectUri, blank);
  return blanks.length;
}
