import { DataFactory, Store } from 'n3';
import type { Quad as N3Quad } from 'n3';
import type { DataPropertyRestriction } from './types';
import { isDebugMode, debugLog, debugWarn, debugError } from './utils/debug';
import { reconstructFromOriginalText, detectPropertyLevelChanges, performTargetedLineReplacement, isSimplePropertyChange, extractPropertyLines, type OriginalFileCache, type StatementBlock } from './rdf/sourcePreservation';
import { parseTurtleBase, parseTurtlePrefixes, resolveTurtlePrefixedName } from './rdf/turtlePrefixes';
import { serializeStoreWithRdflib } from './rdf/rdflibSerializer';
import { hasUndefinedBlankNodeRefs } from './turtlePostProcess';
import { blankNodeClosureQuads, blockStructurallyChanged } from './rdf/blankNodes';
import { currentSplitShares } from './rdf/splitSubjects';
import { extractLocalName } from './utils/localName';
import { type RdfTerm } from './rdf/classExpressions';
import { classUriForName } from './graph/classNodeIds';
import { findRestrictionBlanks, readRestrictionCardinality, removeRestrictionBlank } from './rdf/restrictions';
import { BASE_IRI, OWL, OWL_ON_DATA_RANGE, RDF, RDFS, XSD, XSD_NS, namespaceFromUri } from './ontology/vocab';
import { getDataProperties } from './ontology/readOntology';
import { toClassUri, resolveClassBase } from './ontology/editClasses';
import { getObjectPropertyUriFromStore } from './ontology/editObjectProperties';
export { addObjectPropertyToStore, updateObjectPropertyLabelInStore, updateObjectPropertyCommentInStore, updateObjectPropertyDomainRangeInStore, updateObjectPropertySubPropertyOfInStore, updateObjectPropertyIsDefinedByInStore, renameObjectPropertyInStore, removeObjectPropertyFromStore } from './ontology/editObjectProperties';
export { addDataPropertyToStore, updateDataPropertyLabelInStore, updateDataPropertyCommentInStore, updateDataPropertyIsDefinedByInStore, updateDataPropertyRangeInStore, updateDataPropertyDomainsInStore, removeDataPropertyFromStore, renameDataPropertyInStore } from './ontology/editDataProperties';
export { updateAnnotationPropertyValueInStore, addAnnotationPropertyToStore, updateAnnotationPropertyLabelInStore, updateAnnotationPropertyCommentInStore, updateAnnotationPropertyIsBooleanInStore, updateAnnotationPropertyRangeInStore, getAnnotationPropertyUriFromStore, removeAnnotationPropertyFromStore } from './ontology/editAnnotationProperties';
export { updateLabelInStore, updateCommentInStore, updateLabellableInStore, deriveNewNodeIdentifier, addNodeToStore, removeNodeFromStore, namesOwlThing } from './ontology/editClasses';
export { quadsToParseResult, parseTtlToGraph, parseRdfToGraph } from './ontology/buildGraph';
export type { ParseResult, ParseRdfToGraphOptions } from './ontology/buildGraph';
export { getMainOntologyBase, getClassNamespace, getObjectProperties, getAnnotationProperties, getDataProperties } from './ontology/readOntology';

// Re-exported so the modules that import them from here keep working until they import src/ontology/vocab directly (#193).
export { BASE_IRI, namespaceFromUri };

// Re-export for convenience
export { extractLocalName, extractLocalName as extractLocalNameFromUri };

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

/**
 * Update an edge in the store when reconnecting (moving arrow head or tail to a different node).
 * Supports subClassOf (direct rdfs:subClassOf quads) and partOf/contains (OWL restrictions).
 */
export function updateEdgeInStore(
  store: Store,
  oldFrom: string,
  oldTo: string,
  edgeType: string,
  newFrom: string,
  newTo: string,
  cardinality?: { minCardinality?: number | null; maxCardinality?: number | null }
): boolean {
  const base = resolveClassBase(store);
  if (edgeType === 'subClassOf') {
    const subjUri = base + oldFrom;
    const objUri = base + oldTo;
    const subClassOfPred = DataFactory.namedNode(RDFS + 'subClassOf');
    const quads = store.getQuads(
      DataFactory.namedNode(subjUri),
      subClassOfPred,
      DataFactory.namedNode(objUri),
      null
    );
    if (quads.length === 0) return false;
    const graph = quads[0].graph ?? DataFactory.defaultGraph();
    for (const q of quads) store.removeQuad(q);
    store.addQuad(
      DataFactory.namedNode(base + newFrom),
      subClassOfPred,
      DataFactory.namedNode(base + newTo),
      graph
    );
    return true;
  }
  // Restriction-based edges
  if (edgeType !== 'subClassOf') {
    try {
      removeEdgeFromStore(store, oldFrom, oldTo, edgeType);
    } catch (err) {
      // Edge not found in store - cannot update
      return false;
    }
    return addEdgeToStore(store, newFrom, newTo, edgeType, cardinality);
  }
  return false;
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
 * Add an edge completely to the store. Adds both the OWL restriction (if applicable) and the domain/range definition.
 * Supports subClassOf (direct quad) and partOf/contains (OWL restrictions).
 * Cardinality is optional; when provided, uses qualified cardinality (owl:onClass + min/maxQualifiedCardinality).
 * 
 * For non-subClassOf edges, this function:
 * 1. Adds the domain/range definition to the property (if not already present)
 * 2. Adds the OWL restriction (blank node)
 * 
 * @throws Error if edge already exists or cannot be added
 */
export function addEdgeToStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string,
  cardinality?: { minCardinality?: number | null; maxCardinality?: number | null }
): boolean {
  if (edgeType === 'subClassOf') {
    // subClassOf doesn't have domain/range, just add the direct relationship
    try {
      addRestrictionToStore(store, from, to, edgeType, cardinality);
      return true;
    } catch (err) {
      return false;
    }
  }
  
  // For non-subClassOf edges, we need to add both domain/range and restriction
  // First, ensure domain/range exists on the property
  const propUri = getObjectPropertyUriFromStore(store, edgeType);
  if (!propUri) {
    // Property doesn't exist - cannot add edge
    return false;
  }
  
  const propNode = DataFactory.namedNode(propUri);
  const base = resolveClassBase(store);
  const fromUri = base + from;
  const toUri = base + to;
  const fromUriNode = DataFactory.namedNode(fromUri);
  const toUriNode = DataFactory.namedNode(toUri);
  
  // CRITICAL FIX: Check if domain/range already exists for THIS specific from/to combination
  // to prevent duplicates during undo. Only add domain/range if they don't exist.
  const domainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), fromUriNode, null);
  const rangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), toUriNode, null);
  
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  
  // CRITICAL: Only add domain if it doesn't exist for this specific class
  // This prevents expandWithExternalRefs from creating edges for all domain/range combinations
  if (domainQuads.length === 0) {
    store.addQuad(propNode, DataFactory.namedNode(RDFS + 'domain'), fromUriNode, graph);
  }
  
  // CRITICAL: Only add range if it doesn't exist for this specific class
  // This prevents expandWithExternalRefs from creating edges for all domain/range combinations
  if (rangeQuads.length === 0) {
    store.addQuad(propNode, DataFactory.namedNode(RDFS + 'range'), toUriNode, graph);
  }
  
  // Now add the restriction
  try {
    addRestrictionToStore(store, from, to, edgeType, cardinality);
    return true;
  } catch (err) {
    // If restriction addition fails, we should rollback domain/range addition
    // But since domain/range can be shared by multiple edges, we don't rollback
    // The caller should handle this appropriately
    return false;
  }
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

/**
 * Remove an edge completely from the store. Removes both the restriction (if it exists) and
 * the domain/range definition. The edge will no longer appear in the graph.
 * 
 * Called when:
 * - User deletes a selected edge by pressing Del key
 * - Domain/range are deleted from the Edit Edge or Edit Object Property modals
 * 
 * Supports subClassOf (direct quads) and any restriction-backed edge type.
 * Note: rawData.edges contains at most one edge per from/to/type combination.
 * Note: edgeType should be a full URI (especially for imported ontologies to avoid name conflicts).
 * 
 * @throws Error if domain/range cannot be found or removed (e.g., nodes deleted, property not found)
 */
export function removeEdgeFromStore(
  store: Store,
  from: string,
  to: string,
  edgeType: string
): void {
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] removeEdgeFromStore called: ${from} -> ${to} : ${edgeType}`);
  }
  
  const base = resolveClassBase(store);
  if (edgeType === 'subClassOf') {
    const subjUri = base + from;
    const objUri = base + to;
    const quads = store.getQuads(
      DataFactory.namedNode(subjUri),
      DataFactory.namedNode(RDFS + 'subClassOf'),
      DataFactory.namedNode(objUri),
      null
    );
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] subClassOf: found ${quads.length} quads`);
    }
    if (quads.length === 0) {
      throw new Error(`Cannot remove subClassOf edge: ${from} -> ${to} (not found in store)`);
    }
    for (const q of quads) store.removeQuad(q);
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] subClassOf: removed ${quads.length} quads successfully`);
    }
    return;
  }
  
  // Remove restriction if it exists
  const blank = findRestrictionBlank(store, from, edgeType, to);
  const restrictionRemoved = !!blank; // Track whether a restriction was found and removed
  if (blank) {
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] Found restriction blank node: ${blank.value}`);
    }
    const fromUri = DataFactory.namedNode(base + from);
    const subClassOfQuads = store.getQuads(fromUri, DataFactory.namedNode(RDFS + 'subClassOf'), blank, null);
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] Removing ${subClassOfQuads.length} subClassOf quads pointing to restriction`);
    }
    for (const q of subClassOfQuads) store.removeQuad(q);
    const blankQuads = store.getQuads(blank, null, null, null);
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] Removing ${blankQuads.length} quads from restriction blank node`);
    }
    for (const q of blankQuads) store.removeQuad(q);
    const blankAsObjQuads = store.getQuads(null, null, blank, null);
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] Removing ${blankAsObjQuads.length} quads with restriction as object`);
    }
    for (const q of blankAsObjQuads) store.removeQuad(q);
  } else {
    if (isDebugMode()) {
      debugLog(`[DELETE EDGE] No restriction found for ${from} -> ${to} : ${edgeType}`);
    }
  }
  
  // Always remove domain/range definition to completely remove the edge
  // Domain/range quads are on the property, not the nodes, so we can remove them even if nodes don't exist
  const fromUri = base + from;
  const toUri = base + to;
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] Resolving property URI for edgeType: ${edgeType}`);
    debugLog(`[DELETE EDGE] From URI: ${fromUri}, To URI: ${toUri}`);
  }
  
  // Resolve property URI from store to handle different namespaces
  // Note: edgeType should ideally be a full URI (especially for imported ontologies to avoid name conflicts),
  // but we support local names for backward compatibility
  const propUri = getObjectPropertyUriFromStore(store, edgeType);
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] Resolved property URI: ${propUri}`);
  }
  if (!propUri) {
    throw new Error(`Cannot resolve property URI for edge type: ${edgeType}`);
  }
  
  const propNode = DataFactory.namedNode(propUri);
  const fromUriNode = DataFactory.namedNode(fromUri);
  const toUriNode = DataFactory.namedNode(toUri);
  
  // Remove the specific domain/range pair
  const domainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), fromUriNode, null);
  const rangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), toUriNode, null);
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] Found ${domainQuads.length} domain quads and ${rangeQuads.length} range quads`);
  }
  
  if (!restrictionRemoved && domainQuads.length === 0 && rangeQuads.length === 0) {
    if (isDebugMode()) {
      debugError(`[DELETE EDGE] ERROR: No domain/range quads found for ${from} -> ${to} : ${edgeType}`);
      debugError(`[DELETE EDGE] Property URI: ${propUri}, From URI: ${fromUri}, To URI: ${toUri}`);
      // Log all domain/range quads for this property to help debug
      const allDomainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), null, null);
      const allRangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), null, null);
      debugError(
        `[DELETE EDGE] All domain quads for property: ${allDomainQuads.length}`,
        allDomainQuads.map(q => ({ domain: q.object.value })),
      );
      debugError(
        `[DELETE EDGE] All range quads for property: ${allRangeQuads.length}`,
        allRangeQuads.map(q => ({ range: q.object.value })),
      );
    }
    throw new Error(`Cannot remove edge: domain/range definition not found for ${from} -> ${to} : ${edgeType}`);
  }
  
  // Remove domain if it matches
  for (const q of domainQuads) {
    store.removeQuad(q);
  }
  // Remove range if it matches
  for (const q of rangeQuads) {
    store.removeQuad(q);
  }
  if (isDebugMode()) {
    debugLog(`[DELETE EDGE] Successfully removed ${domainQuads.length} domain quads and ${rangeQuads.length} range quads`);
  }
}

/**
 * Serialize the store to Turtle string with section dividers and spacing.
 * @param originalTtlString Optional original TTL string to preserve format (colon vs base notation)
 * @param originalFileCache Optional original file cache for source preservation (idempotent round-trips)
 * @param useCacheBasedReconstruction If true and cache is available, use cache-based reconstruction (default: false)
 */
import type { SerializerType } from './storage';

// Re-export for convenience
export type { SerializerType };

export async function storeToTurtle(
  store: Store,
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>,
  originalTtlString?: string,
  originalFileCache?: OriginalFileCache,
  serializerType: SerializerType = 'rdflib'
): Promise<string> {
  // Custom serializer uses cache-based reconstruction with line-level tracking
  if (serializerType === 'custom') {
    if (!originalFileCache || originalFileCache.format !== 'turtle') {
      throw new Error(
        'Custom TTL Serializer requires original file cache. ' +
        'Please ensure the file was loaded as a Turtle (.ttl) file with position tracking enabled.'
      );
    }
    debugLog('[storeToTurtle] Using custom TTL serializer with cache-based reconstruction, cache has', originalFileCache.statementBlocks.length, 'blocks');
    const custom = await reconstructFromCache(store, originalFileCache, externalRefs);
    // Safety net (#64): if the custom serializer ever emits a dangling "_:df_x" reference, the blank
    // node it named has been dropped. Rather than lose data, fall back to rdflib (which keeps it, at
    // the cost of reformatting the file). Class expressions in domain/range no longer need it (#65),
    // and a dangling label the file already had is kept as it was, not a loss (#124).
    if (hasUndefinedBlankNodeRefs(custom, originalFileCache.content)) {
      debugWarn('[storeToTurtle] Custom serialization produced an undefined blank-node reference; ' +
        'falling back to rdflib to avoid data loss. See issue #64.');
      return serializeStoreWithRdflib(store, { externalRefs, originalTtlString });
    }
    return custom;
  }

  // Default: Use rdflib serialization
  debugLog('[storeToTurtle] Using rdflib serialization');
  return serializeStoreWithRdflib(store, {
    externalRefs,
    originalTtlString,
  });
}

/**
 * Reconstruct Turtle from cache with modifications detected from store
 */
async function reconstructFromCache(
  store: Store,
  cache: OriginalFileCache,
  _externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>
): Promise<string> {
  debugLog('[reconstructFromCache] Starting reconstruction, cache has', cache.statementBlocks.length, 'blocks');
  debugLog('[PERF] reconstructFromCache START');
  
  // Use the quadToBlockMap to find which block each quad belongs to
  // Then compare current store quads with original block quads
  
  // Build a map of current quads by subject
  const currentQuadsBySubject = new Map<string, N3Quad[]>();
  for (const quad of store) {
    if (quad.subject.termType === 'NamedNode') {
      const subjectUri = (quad.subject as { value: string }).value;
      const list = currentQuadsBySubject.get(subjectUri) || [];
      list.push(quad as N3Quad);
      currentQuadsBySubject.set(subjectUri, list);
    }
  }
  
  // Every prefix the file declares, from every header block. Missing one is not cosmetic: a
  // subject whose prefix cannot be resolved looks absent from the document and gets appended again.
  // The same goes for the base that relative IRIs like `<#Term>` resolve against (#122).
  const prefixMap = new Map<string, string>();
  let base: string | null = null;
  if (cache.headerSection) {
    for (const block of cache.headerSection.blocks) {
      if (block.originalText) parseTurtlePrefixes(block.originalText, prefixMap);
      if (block.originalText) base = parseTurtleBase(block.originalText, base);
    }
  }
  
  const resolvePrefixedName = (prefixedName: string): string | null => {
    const resolved = resolveTurtlePrefixedName(prefixedName, prefixMap, base);
    if (resolved === null) {
      debugWarn('[reconstructFromCache] Failed to resolve prefixed name:', prefixedName);
      return null;
    }
    debugLog('[reconstructFromCache] Resolved prefixed name:', prefixedName, '->', resolved);
    return resolved;
  };
  
  // Detect modifications by comparing current store with cache
  const modifiedBlocks: StatementBlock[] = [];
  // Blocks that are structurally unchanged (used to suppress false-positive property-level
  // "changes" caused by blank-node id drift — see filtering below). By block, not by subject: a
  // subject can be described in several statements, and only one of them may have changed (#118).
  const structurallyUnchangedBlocks = new Set<StatementBlock>();
  // For a subject described in several statements, the triples each statement holds now (#118).
  const splitShares = currentSplitShares(store, cache.statementBlocks);

  const blockCheckStart = Date.now();
  debugLog('[PERF] Starting block check loop, blocks:', cache.statementBlocks.length);
  
  // For each block, check if its quads have changed
  for (let i = 0; i < cache.statementBlocks.length; i++) {
    const block = cache.statementBlocks[i];
    if (i % 10 === 0) {
      debugLog('[PERF] Processing block', i, 'of', cache.statementBlocks.length, 'elapsed:', Date.now() - blockCheckStart, 'ms');
    }
    if (block.type === 'Header') continue; // Header blocks don't change
    
    if (block.subject && block.subject.includes('DrawingSheet')) {
      debugLog('[reconstructFromCache] Processing DrawingSheet block, subject:', block.subject, 'type:', block.type);
    }
    
    // Get current quads for this block's subject
    let currentQuads: N3Quad[] = [];
    let effectiveSubjectUri: string | null = null;
    if (block.subject) {
      const resolvedUri = resolvePrefixedName(block.subject);
      if (resolvedUri) {
        effectiveSubjectUri = resolvedUri;
        currentQuads = currentQuadsBySubject.get(resolvedUri) || [];
        // When parser base IRI differs from file @prefix (e.g. path vs ontology URI), store may key by different subject URI; match by local name
        if (currentQuads.length === 0) {
          const localName = extractLocalName(resolvedUri);
          for (const [subjectUri, quads] of currentQuadsBySubject.entries()) {
            if (extractLocalName(subjectUri) === localName) {
              effectiveSubjectUri = subjectUri;
              currentQuads = quads;
              debugLog('[reconstructFromCache] Block subject:', block.subject, 'matched by local name to', subjectUri, 'found', quads.length, 'quads');
              break;
            }
          }
        }
        debugLog('[reconstructFromCache] Block subject:', block.subject, 'resolved to:', resolvedUri, 'found', currentQuads.length, 'quads');
        if (block.subject === ':TestClass') {
          debugLog('[reconstructFromCache] TestClass - currentQuads.length:', currentQuads.length);
          currentQuads.forEach((q, i) => {
            const pred = (q.predicate as { value: string }).value;
            const obj = q.object.termType === 'Literal' 
              ? `"${(q.object as { value: string }).value}"` 
              : (q.object as { value: string }).value;
            debugLog(`[reconstructFromCache] TestClass - quad[${i}]: ${pred} -> ${obj}`);
          });
        }
        
        // For blocks with rdfs:subClassOf quads (typically Class blocks, but also check for Other blocks),
        // include blank node restriction quads
        // These are connected via rdfs:subClassOf where the class is subject and blank node is object
        // CRITICAL: We need to collect blank node quads from the CURRENT store, not just from block.quads
        // This ensures that even if blank node IDs changed after re-parsing, we still get all the quads
        // Check if this block has rdfs:subClassOf quads with blank nodes (regardless of block type)
        // Use effectiveSubjectUri (store's subject URI) so we find quads when base IRI differed at parse time
        const classSubject = DataFactory.namedNode(effectiveSubjectUri!);
        const subClassOfQuads = store.getQuads(classSubject, DataFactory.namedNode(RDFS + 'subClassOf'), null, null);
        const hasSubClassOfWithBlanks = subClassOfQuads.some(q => q.object.termType === 'BlankNode');
        
        if (block.subject && block.subject.includes('DrawingSheet')) {
          debugLog('[reconstructFromCache] DrawingSheet - subClassOfQuads.length:', subClassOfQuads.length);
          debugLog('[reconstructFromCache] DrawingSheet - hasSubClassOfWithBlanks:', hasSubClassOfWithBlanks);
          debugLog('[reconstructFromCache] DrawingSheet - block.type:', block.type);
        }
        
        if (block.type === 'Class' || hasSubClassOfWithBlanks) {
          const restrictionBlankNodes = new Set<string>();
          if (block.subject && block.subject.includes('DrawingSheet')) {
            debugLog('[reconstructFromCache] DrawingSheet - Entering blank node collection block');
          }
          
          // Find all blank nodes referenced in subClassOf quads
          // Note: subClassOf quads are already in currentQuads (from currentQuadsBySubject)
          // So we only need to add the blank node quads themselves
          for (const subClassQuad of subClassOfQuads) {
            if (subClassQuad.object.termType === 'BlankNode') {
              const blankId = (subClassQuad.object as { id: string }).id;
              // Normalize blank node ID - remove _: prefix if present
              const normalizedBlankId = blankId.startsWith('_:') ? blankId.slice(2) : blankId;
              restrictionBlankNodes.add(normalizedBlankId);
              debugLog('[reconstructFromCache] Found blank node in subClassOf:', blankId, 'normalized:', normalizedBlankId);
              if (block.subject && block.subject.includes('DrawingSheet')) {
                debugLog('[reconstructFromCache] DrawingSheet - Found blank node in subClassOf quad:', blankId, 'normalized:', normalizedBlankId);
                // Check if we can find quads for this blank node in the store
                const testBlankNode = DataFactory.blankNode(normalizedBlankId);
                const testQuads = store.getQuads(testBlankNode, null, null, null);
                debugLog('[reconstructFromCache] DrawingSheet - Store has', testQuads.length, 'quads for blank node', normalizedBlankId);
                if (testQuads.length > 0) {
                  debugLog('[reconstructFromCache] DrawingSheet - First quad predicate:', (testQuads[0].predicate as { value: string }).value);
                } else {
                  debugLog('[reconstructFromCache] DrawingSheet - WARNING: No quads found for blank node', normalizedBlankId);
                }
              }
            }
          }
          
          // Also check original block.quads for blank nodes that might not be in current store
          // (this handles cases where blank node IDs changed but structure is the same)
          if (block.quads && block.quads.length > 0) {
            for (const origQuad of block.quads) {
              if (origQuad.object && (origQuad.object as { termType?: string }).termType === 'BlankNode') {
                // Try to find a matching blank node in current store by checking all subClassOf quads
                // This is a fallback to ensure we don't lose blank nodes when IDs change
                for (const subClassQuad of subClassOfQuads) {
                  if (subClassQuad.object.termType === 'BlankNode') {
                    const currentBlankId = (subClassQuad.object as { id: string }).id;
                    // If we haven't already added this blank node, add it
                    if (!restrictionBlankNodes.has(currentBlankId)) {
                      restrictionBlankNodes.add(currentBlankId);
                    }
                  }
                }
              }
            }
          }
          
          // Get all quads for each restriction blank node
          // CRITICAL: These quads are where the blank node is the SUBJECT (e.g., _:blank1 rdf:type owl:Restriction)
          // We need these to build inline forms, so we MUST add them even if they seem like duplicates
          // Use a Set to track quad signatures and avoid duplicates, but be careful with blank node IDs
          const quadSignatures = new Set<string>();
          for (const q of currentQuads) {
            const subjSig = q.subject.termType === 'NamedNode' ? q.subject.value : q.subject.termType === 'BlankNode' ? (q.subject as { id: string }).id : '';
            const objSig = q.object.termType === 'NamedNode' ? q.object.value : q.object.termType === 'Literal' ? `"${(q.object as { value: string }).value}"` : q.object.termType === 'BlankNode' ? (q.object as { id: string }).id : '';
            const sig = `${subjSig}|${q.predicate.value}|${objSig}`;
            quadSignatures.add(sig);
          }
          
          debugLog('[reconstructFromCache] Collecting blank node quads for', restrictionBlankNodes.size, 'blank nodes, currentQuads:', currentQuads.length);
          if (block.subject && block.subject.includes('DrawingSheet')) {
            debugLog('[reconstructFromCache] DrawingSheet - restrictionBlankNodes:', Array.from(restrictionBlankNodes));
          }
          for (const blankId of restrictionBlankNodes) {
            // CRITICAL: blankId is already normalized (no _: prefix) from the loop above
            // DataFactory.blankNode expects just the ID part (without _: prefix)
            const blankNode = DataFactory.blankNode(blankId);
            const blankQuads = store.getQuads(blankNode, null, null, null);
            debugLog('[reconstructFromCache] Blank node', blankId, 'has', blankQuads.length, 'quads (where blank is SUBJECT)');
            if (block.subject && block.subject.includes('DrawingSheet')) {
              debugLog('[reconstructFromCache] DrawingSheet - blank node', blankId, '- found', blankQuads.length, 'quads from store');
              if (blankQuads.length === 0) {
                debugLog('[reconstructFromCache] DrawingSheet - WARNING: No quads found for blank node', blankId);
                // Try alternative ID formats
                const altId1 = `_:${blankId}`;
                debugLog('[reconstructFromCache] DrawingSheet - Trying alternative ID:', altId1);
                const blankNodeAlt1 = DataFactory.blankNode(blankId); // Already normalized, no need to slice
                const blankQuadsAlt1 = store.getQuads(blankNodeAlt1, null, null, null);
                debugLog('[reconstructFromCache] DrawingSheet - alt1 quads:', blankQuadsAlt1.length);
              } else {
                debugLog('[reconstructFromCache] DrawingSheet - Successfully found', blankQuads.length, 'quads for blank node', blankId);
              }
            }
            
            // Only add quads that aren't already in currentQuads (avoid duplicates)
            let addedCount = 0;
            
            // If no quads found, try with _: prefix
            if (blankQuads.length === 0 && !blankId.startsWith('_:')) {
              const blankNodeWithPrefix = DataFactory.blankNode(`_:${blankId}`);
              const blankQuadsWithPrefix = store.getQuads(blankNodeWithPrefix, null, null, null);
              debugLog('[reconstructFromCache] Tried with _: prefix, found', blankQuadsWithPrefix.length, 'quads');
              if (blankQuadsWithPrefix.length > 0) {
                // Use the quads found with prefix
                for (const blankQuad of blankQuadsWithPrefix) {
                  const subjSig = (blankQuad.subject as { id: string }).id;
                  const objSig = blankQuad.object.termType === 'NamedNode' ? blankQuad.object.value : blankQuad.object.termType === 'Literal' ? `"${(blankQuad.object as { value: string }).value}"` : blankQuad.object.termType === 'BlankNode' ? (blankQuad.object as { id: string }).id : '';
                  const sig = `${subjSig}|${blankQuad.predicate.value}|${objSig}`;
                  if (!quadSignatures.has(sig)) {
                    currentQuads.push(blankQuad);
                    quadSignatures.add(sig);
                    addedCount++;
                    debugLog('[reconstructFromCache] Added quad:', blankQuad.predicate.value, '->', objSig.substring(0, 50));
                  }
                }
                debugLog('[reconstructFromCache] Added', addedCount, 'quads for restriction blank node:', blankId, '(total currentQuads now:', currentQuads.length, ')');
                continue;
              }
            }
            for (const blankQuad of blankQuads) {
              const subjSig = (blankQuad.subject as { id: string }).id;
              const objSig = blankQuad.object.termType === 'NamedNode' ? blankQuad.object.value : blankQuad.object.termType === 'Literal' ? `"${(blankQuad.object as { value: string }).value}"` : blankQuad.object.termType === 'BlankNode' ? (blankQuad.object as { id: string }).id : '';
              const sig = `${subjSig}|${blankQuad.predicate.value}|${objSig}`;
              if (!quadSignatures.has(sig)) {
                currentQuads.push(blankQuad);
                quadSignatures.add(sig);
                addedCount++;
                debugLog('[reconstructFromCache] Added quad:', blankQuad.predicate.value, '->', objSig.substring(0, 50));
                if (block.subject && block.subject.includes('DrawingSheet')) {
                  debugLog('[reconstructFromCache] DrawingSheet - Added blank node quad:', (blankQuad.predicate as { value: string }).value);
                }
              } else {
                debugLog('[reconstructFromCache] Skipped duplicate quad:', sig.substring(0, 100));
              }
            }
            debugLog('[reconstructFromCache] Added', addedCount, 'quads for restriction blank node:', blankId, '(total currentQuads now:', currentQuads.length, ')');
            if (block.subject && block.subject.includes('DrawingSheet')) {
              debugLog('[reconstructFromCache] DrawingSheet - After adding blank node quads, currentQuads.length:', currentQuads.length);
              const blankAsSubject = currentQuads.filter(q => q.subject.termType === 'BlankNode').length;
              debugLog('[reconstructFromCache] DrawingSheet - Blank nodes as subjects in currentQuads:', blankAsSubject);
            }
            
            // Validation: ensure blank node has required properties
            const blankQuadsForValidation = blankQuads.length > 0 ? blankQuads : (blankId.startsWith('_:') ? store.getQuads(DataFactory.blankNode(blankId.slice(2)), null, null, null) : store.getQuads(DataFactory.blankNode(`_:${blankId}`), null, null, null));
            const hasOnProperty = blankQuadsForValidation.some(q => (q.predicate as { value: string }).value.includes('onProperty'));
            const hasOnClass = blankQuadsForValidation.some(q => (q.predicate as { value: string }).value.includes('onClass'));
            const hasRestrictionType = blankQuadsForValidation.some(q => (q.predicate as { value: string }).value.includes('type') && q.object.termType === 'NamedNode' && (q.object as { value: string }).value.includes('Restriction'));
            if (!hasOnProperty || !hasOnClass || !hasRestrictionType) {
              debugLog('[reconstructFromCache] WARNING: Blank node', blankId, 'missing required properties - onProperty:', hasOnProperty, 'onClass:', hasOnClass, 'type:', hasRestrictionType);
            }
          }
          
          // Validation: ensure we collected blank node quads
          const blankNodeQuadsAsSubjects = currentQuads.filter(q => q.subject.termType === 'BlankNode').length;
          if (restrictionBlankNodes.size > 0 && blankNodeQuadsAsSubjects === 0) {
            debugLog('[reconstructFromCache] ERROR: Found', restrictionBlankNodes.size, 'restriction blank nodes but NO quads where blank nodes are subjects!');
            debugLog('[reconstructFromCache] This will cause buildInlineForms to create empty forms [ ]');
          } else if (restrictionBlankNodes.size > 0) {
            debugLog('[reconstructFromCache] SUCCESS: Collected', blankNodeQuadsAsSubjects, 'quads where blank nodes are subjects for', restrictionBlankNodes.size, 'restriction blank nodes');
          }
          
          // Specific diagnostic for DrawingSheet class
          if (block.subject && (block.subject.includes('DrawingSheet') || block.subject.includes('Drawing'))) {
            debugLog('[reconstructFromCache] DIAGNOSTIC - DrawingSheet block (main path):', {
              subject: block.subject,
              resolvedUri: resolvedUri,
              quadsBefore: currentQuadsBySubject.get(resolvedUri)?.length || 0,
              quadsAfter: currentQuads.length,
              blankNodeCount: restrictionBlankNodes.size,
              blankNodeIds: Array.from(restrictionBlankNodes),
              blankNodeQuadsAsSubjects: blankNodeQuadsAsSubjects
            });
          }
        }
      } else {
        debugWarn('[reconstructFromCache] Failed to resolve block subject:', block.subject, 'block type:', block.type);
        // Fallback: try to find by local name if prefix resolution fails
        const localName = block.subject.startsWith(':') 
          ? block.subject.slice(1) 
          : block.subject.includes(':') 
            ? block.subject.split(':').pop() 
            : block.subject.replace(/^:/, '');
        
        debugLog('[reconstructFromCache] Trying fallback match by local name:', localName);
        // Search all subjects for matching local name
        for (const [subjectUri, quads] of currentQuadsBySubject.entries()) {
          if (extractLocalName(subjectUri) === localName) {
            currentQuads = quads;
            debugLog('[reconstructFromCache] Found match by local name:', subjectUri, 'with', quads.length, 'quads');
            
            // Also include restriction blank node quads for blocks with rdfs:subClassOf
            const classSubject = DataFactory.namedNode(subjectUri);
            const subClassOfQuads = store.getQuads(classSubject, DataFactory.namedNode(RDFS + 'subClassOf'), null, null);
            const hasSubClassOfWithBlanks = subClassOfQuads.some(q => q.object.termType === 'BlankNode');
            
            if (block.type === 'Class' || hasSubClassOfWithBlanks) {
              const quadsBeforeBlankNodes = currentQuads.length;
              const restrictionBlankNodes = new Set<string>();
              
              debugLog('[reconstructFromCache] Class block:', block.subject, 'found', subClassOfQuads.length, 'rdfs:subClassOf quads');
              
              for (const subClassQuad of subClassOfQuads) {
                if (subClassQuad.object.termType === 'BlankNode') {
                  const blankId = (subClassQuad.object as { id: string }).id;
                  // Normalize blank node ID - remove _: prefix if present
                  const normalizedBlankId = blankId.startsWith('_:') ? blankId.slice(2) : blankId;
                  restrictionBlankNodes.add(normalizedBlankId);
                  // Include the subClassOf quad itself (connects class to blank node)
                  currentQuads.push(subClassQuad);
                  debugLog('[reconstructFromCache] Found restriction blank node:', blankId, 'normalized:', normalizedBlankId, 'for class:', block.subject);
                }
              }
              
              debugLog('[reconstructFromCache] Total restriction blank nodes found:', restrictionBlankNodes.size, 'for class:', block.subject);
              
              // Log blank node IDs found vs expected (from original block.quads)
              const originalBlankNodeIds = new Set<string>();
              for (const q of block.quads) {
                if (q.object.termType === 'BlankNode') {
                  const origBlankId = (q.object as unknown as { id: string }).id;
                  originalBlankNodeIds.add(origBlankId);
                }
                if (q.subject.termType === 'BlankNode') {
                  const origBlankId = (q.subject as unknown as { id: string }).id;
                  originalBlankNodeIds.add(origBlankId);
                }
              }
              debugLog('[reconstructFromCache] Original block had', originalBlankNodeIds.size, 'blank node IDs:', Array.from(originalBlankNodeIds));
              debugLog('[reconstructFromCache] Current store has', restrictionBlankNodes.size, 'blank node IDs:', Array.from(restrictionBlankNodes));
              
              // Use deduplication logic similar to main path
              const quadSignatures = new Set<string>();
              for (const q of currentQuads) {
                const subjSig = q.subject.termType === 'NamedNode' ? q.subject.value : q.subject.termType === 'BlankNode' ? (q.subject as { id: string }).id : '';
                const objSig = q.object.termType === 'NamedNode' ? q.object.value : q.object.termType === 'Literal' ? `"${(q.object as { value: string }).value}"` : q.object.termType === 'BlankNode' ? (q.object as { id: string }).id : '';
                const sig = `${subjSig}|${q.predicate.value}|${objSig}`;
                quadSignatures.add(sig);
              }
              
              debugLog('[reconstructFromCache] Collecting blank node quads for', restrictionBlankNodes.size, 'blank nodes, currentQuads:', currentQuads.length);
              for (const blankId of restrictionBlankNodes) {
                // CRITICAL: blankId is already normalized (no _: prefix) from the loop above
                // DataFactory.blankNode expects just the ID part (without _: prefix)
                const blankNode = DataFactory.blankNode(blankId);
                let blankQuads = store.getQuads(blankNode, null, null, null);
                debugLog('[reconstructFromCache] Blank node', blankId, 'has', blankQuads.length, 'quads (where blank is SUBJECT)');
                
                // If no quads found, try with _: prefix (shouldn't happen if normalized correctly)
                if (blankQuads.length === 0) {
                  const blankNodeWithPrefix = DataFactory.blankNode(`_:${blankId}`);
                  const blankQuadsWithPrefix = store.getQuads(blankNodeWithPrefix, null, null, null);
                  debugLog('[reconstructFromCache] Tried with _: prefix, found', blankQuadsWithPrefix.length, 'quads');
                  if (blankQuadsWithPrefix.length > 0) {
                    blankQuads = blankQuadsWithPrefix;
                  }
                }
                
                // Only add quads that aren't already in currentQuads (avoid duplicates)
                let addedCount = 0;
                for (const blankQuad of blankQuads) {
                  const subjSig = (blankQuad.subject as { id: string }).id;
                  const objSig = blankQuad.object.termType === 'NamedNode' ? blankQuad.object.value : blankQuad.object.termType === 'Literal' ? `"${(blankQuad.object as { value: string }).value}"` : blankQuad.object.termType === 'BlankNode' ? (blankQuad.object as { id: string }).id : '';
                  const sig = `${subjSig}|${blankQuad.predicate.value}|${objSig}`;
                  if (!quadSignatures.has(sig)) {
                    currentQuads.push(blankQuad);
                    quadSignatures.add(sig);
                    addedCount++;
                    debugLog('[reconstructFromCache] Added quad:', blankQuad.predicate.value, '->', objSig.substring(0, 50));
                  } else {
                    debugLog('[reconstructFromCache] Skipped duplicate quad:', sig.substring(0, 100));
                  }
                }
                debugLog('[reconstructFromCache] Added', addedCount, 'quads for restriction blank node:', blankId, '(total currentQuads now:', currentQuads.length, ')');
                
                // Log what properties this blank node has
                const blankNodeProps = blankQuads.map(q => {
                  const pred = (q.predicate as { value: string }).value;
                  const predLocal = pred.split('#').pop()?.split('/').pop() || pred;
                  return predLocal;
                });
                debugLog('[reconstructFromCache] Blank node', blankId, 'has properties:', blankNodeProps);
                
                // Validation: ensure blank node has required properties
                const hasOnProperty = blankQuads.some(q => (q.predicate as { value: string }).value.includes('onProperty'));
                const hasOnClass = blankQuads.some(q => (q.predicate as { value: string }).value.includes('onClass'));
                const hasRestrictionType = blankQuads.some(q => (q.predicate as { value: string }).value.includes('type') && q.object.termType === 'NamedNode' && (q.object as { value: string }).value.includes('Restriction'));
                if (!hasOnProperty || !hasOnClass || !hasRestrictionType) {
                  debugLog('[reconstructFromCache] WARNING: Blank node', blankId, 'missing required properties - onProperty:', hasOnProperty, 'onClass:', hasOnClass, 'type:', hasRestrictionType);
                }
              }
              
              const quadsAfterBlankNodes = currentQuads.length;
              debugLog('[reconstructFromCache] Quads count - before blank nodes:', quadsBeforeBlankNodes, 'after:', quadsAfterBlankNodes, 'added:', quadsAfterBlankNodes - quadsBeforeBlankNodes);
              
              // Validation: ensure we collected blank node quads
              const blankNodeQuadsAsSubjects = currentQuads.filter(q => q.subject.termType === 'BlankNode').length;
              if (restrictionBlankNodes.size > 0 && blankNodeQuadsAsSubjects === 0) {
                debugLog('[reconstructFromCache] ERROR: Found', restrictionBlankNodes.size, 'restriction blank nodes but NO quads where blank nodes are subjects!');
                debugLog('[reconstructFromCache] This will cause buildInlineForms to create empty forms [ ]');
              } else if (restrictionBlankNodes.size > 0) {
                debugLog('[reconstructFromCache] SUCCESS: Collected', blankNodeQuadsAsSubjects, 'quads where blank nodes are subjects for', restrictionBlankNodes.size, 'restriction blank nodes');
              }
              
              // Specific diagnostic for DrawingSheet class
              if (block.subject && (block.subject.includes('DrawingSheet') || block.subject.includes('Drawing'))) {
                debugLog('[reconstructFromCache] DIAGNOSTIC - DrawingSheet block:', {
                  subject: block.subject,
                  quadsBefore: quadsBeforeBlankNodes,
                  quadsAfter: quadsAfterBlankNodes,
                  blankNodeCount: restrictionBlankNodes.size,
                  blankNodeIds: Array.from(restrictionBlankNodes),
                  expectedBlankNodes: originalBlankNodeIds.size,
                  blankNodeQuadsAsSubjects: blankNodeQuadsAsSubjects
                });
              }
            }
            break;
          }
        }
        if (currentQuads.length === 0) {
          debugWarn('[reconstructFromCache] No quads found even with fallback for:', block.subject);
        }
      }
    } else {
      debugLog('[reconstructFromCache] Block has no subject, type:', block.type);
    }
    
    // CRITICAL: For class blocks, we MUST always include blank node quads in currentQuads
    // even if the block wasn't modified, because blank node IDs may have changed after re-parsing
    // This ensures that when we serialize, we have all the quads, including blank node quads
    // The blank node quads are already collected above for class blocks, so currentQuads should have them
    
    const share = splitShares.get(block);
    if (share) currentQuads = share as N3Quad[];

    // Every block, not only classes, can point at a blank node: a property's domain or range can be
    // a class expression holding an RDF list (#65). Take the whole structure, list nodes included,
    // as the cache side does; otherwise an unchanged block reads as changed and is re-serialized.
    currentQuads = [...currentQuads, ...(blankNodeClosureQuads(currentQuads as never, (b) => store.getQuads(b, null, null, null)) as N3Quad[])];

    // Compare quads - check if they're different
    // IMPORTANT: Compare BEFORE updating block.quads, otherwise isModified will always be false
    const originalQuads = [...block.quads]; // Create a copy to avoid mutation issues
    const isModified = quadsAreDifferent(originalQuads as N3Quad[], currentQuads);
    
    if (block.subject && (block.subject.includes('DrawingElement') || block.subject.includes('Drawing'))) {
      debugLog('[reconstructFromCache] DrawingElement block check:', {
        subject: block.subject,
        originalQuadsCount: originalQuads.length,
        currentQuadsCount: currentQuads.length,
        isModified
      });
      // Log label quads specifically
      const originalLabelQuads = originalQuads.filter(q => q.predicate.value.includes('label'));
      const currentLabelQuads = currentQuads.filter(q => q.predicate.value.includes('label'));
      debugLog('[reconstructFromCache] Label quads - original:', originalLabelQuads.map(q => q.object.value), 'current:', currentLabelQuads.map(q => q.object.value));
    }
    
    // Deletion: the block's subject existed in the original file but now has no quads in the
    // store (the entity was removed, e.g. a deleted class). The quad-collection above already
    // tried both the resolved URI and a local-name fallback, so an empty currentQuads here
    // means genuine absence. Mark the block deleted; otherwise an emptied block would be
    // re-emitted verbatim (the class would "come back" after saving).
    if (block.subject && originalQuads.length > 0 && currentQuads.length === 0) {
      modifiedBlocks.push({ ...block, quads: [], isDeleted: true });
      debugLog('[reconstructFromCache] Block marked as deleted (subject removed from store):', block.subject, 'type:', block.type);
      continue;
    }

    // Check if block has blank node quads (where blank node is subject or object).
    const hasBlankNodeQuads = currentQuads.some(
      q => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode'
    );

    // Decide whether this block genuinely changed.
    //
    // For blocks WITHOUT blank nodes, quadsAreDifferent (isModified) is exact.
    //
    // For blocks WITH blank nodes (e.g. classes with rdfs:subClassOf [ owl:Restriction … ]),
    // quadsAreDifferent is unreliable: it signs blank nodes by raw id, and blank-node ids
    // drift between the cache parse and the store parse, so an UNCHANGED restriction block
    // looks "modified". Previously such blocks were unconditionally re-serialized, which
    // reflowed multi-line subClassOf lists, reordered restriction properties, rewrote
    // `rdf:type`→`a`, and normalized typed literals — i.e. it thrashed unedited blocks.
    // Use a blank-node-identity-insensitive structural comparison instead, so only blocks
    // that actually changed are re-serialized; unchanged blocks keep their original text.
    const changed = hasBlankNodeQuads
      ? blockStructurallyChanged(originalQuads as N3Quad[], currentQuads)
      : isModified;

    if (changed) {
      const modifiedBlock: StatementBlock = {
        ...block,
        quads: currentQuads, // Use currentQuads which includes updated label and all blank node quads
        isModified: true
      };
      modifiedBlocks.push(modifiedBlock);
      debugLog('[reconstructFromCache] Block marked as modified:', block.subject, 'type:', block.type);
    } else {
      // Block is structurally unchanged. Remember its subject so we can drop any
      // false-positive property-level changes detected on it (blank-node id drift).
      structurallyUnchangedBlocks.add(block);
      if (block.type === 'Class' && currentQuads.length > 0) {
        // For unchanged class blocks, still refresh block.quads with currentQuads for consistency.
        block.quads = currentQuads;
      }
    }
  }

  // Detect NEW subjects: named subjects present in the store but absent from every cache block.
  // These are entities the user added (e.g. a new class). Emit them as isNew blocks so
  // reconstructFromOriginalText inserts them into the appropriate section instead of dropping them.
  const cacheSubjectUris = new Set<string>();
  for (const b of cache.statementBlocks) {
    if (b.type === 'Header' || !b.subject) continue;
    const uri = resolvePrefixedName(b.subject);
    if (uri) cacheSubjectUris.add(uri);
  }
  /** Render a full URI in prefixed form using the file's prefixes (longest namespace wins). */
  const toPrefixedSubject = (uri: string): string => {
    let best: string | null = null;
    let bestNsLen = -1;
    for (const [prefix, ns] of prefixMap) {
      if (uri.startsWith(ns) && ns.length > bestNsLen) {
        best = `${prefix}:${uri.slice(ns.length)}`;
        bestNsLen = ns.length;
      }
    }
    return best ?? `<${uri}>`;
  };
  const detectTypeFromQuads = (quads: N3Quad[]): StatementBlock['type'] => {
    for (const q of quads) {
      if ((q.predicate as { value: string }).value !== RDF + 'type') continue;
      const o = (q.object as { value: string }).value;
      if (o === OWL + 'Class') return 'Class';
      if (o === OWL + 'ObjectProperty') return 'ObjectProperty';
      if (o === OWL + 'DatatypeProperty') return 'DatatypeProperty';
      if (o === OWL + 'AnnotationProperty') return 'AnnotationProperty';
      if (o === OWL + 'Ontology') return 'Ontology';
    }
    return 'Other';
  };
  const newBlocks: StatementBlock[] = [];
  for (const [subjectUri, subjectQuads] of currentQuadsBySubject) {
    if (cacheSubjectUris.has(subjectUri)) continue;
    const newBlock: StatementBlock = {
      type: detectTypeFromQuads(subjectQuads),
      position: { start: 0, end: 0, startLine: 0, endLine: 0 },
      originalText: '',
      quads: [...subjectQuads],
      subject: toPrefixedSubject(subjectUri),
      isModified: false,
      isNew: true,
      isDeleted: false,
    };
    newBlocks.push(newBlock);
    modifiedBlocks.push(newBlock);
    debugLog('[reconstructFromCache] New subject detected, will insert block:', newBlock.subject, 'type:', newBlock.type);
  }

  // Try line-level replacement first for simple changes
  const propertyLevelChanges = detectPropertyLevelChanges(store, cache);
  // Suppress false-positive changes on structurally-unchanged blocks. detectPropertyLevelChanges
  // signs blank nodes in a way that is sensitive to id drift, so an unchanged class with an
  // inline rdfs:subClassOf restriction can be falsely reported as changed. Such a false positive
  // on a blank-node property would otherwise disable targeted line replacement for the WHOLE
  // file, forcing the genuinely-edited (simple) block through full re-serialization (which
  // rewrites rdf:type→a, normalizes typed literals, reorders/reflows). Drop them here.
  if (structurallyUnchangedBlocks.size > 0) {
    for (const propLine of [...propertyLevelChanges.keys()]) {
      const owner = cache.statementBlocks.find(
        b => b.position.start <= propLine.position.start && b.position.end >= propLine.position.end
      );
      if (owner && structurallyUnchangedBlocks.has(owner)) {
        propertyLevelChanges.delete(propLine);
        debugLog('[reconstructFromCache] Dropped false-positive change on unchanged block:', owner.subject, propLine.predicate);
      }
    }
  }
  debugLog('[reconstructFromCache] detectPropertyLevelChanges returned', propertyLevelChanges.size, 'changes');
  if (propertyLevelChanges.size > 0) {
    for (const [propLine] of propertyLevelChanges.entries()) {
      debugLog('[reconstructFromCache] Property change:', propLine.predicate, 'at line', propLine.lineNumbers[0]);
    }
  }
  
  // Check if all changes are simple (can use targeted line replacement)
  const allChangesSimple = propertyLevelChanges.size > 0 && 
    Array.from(propertyLevelChanges.values()).every(changeSet => 
      isSimplePropertyChange(changeSet.propertyLine, changeSet)
    );
  
  // CRITICAL: We can only use targeted replacement for blocks that don't have blank node properties.
  // Targeted replacement only replaces individual lines and cannot preserve multi-line blank node structures.
  // However, we can use targeted replacement for SOME blocks even if OTHER blocks have blank nodes.
  // So we need to check each block individually and only disable targeted replacement for blocks with blank nodes.
  // New blocks must be inserted by the block-level reconstruction path; the targeted
  // line-replacement path only edits existing lines and would silently drop them.
  let canUseTargetedReplacement = allChangesSimple && propertyLevelChanges.size > 0 && newBlocks.length === 0;
  if (canUseTargetedReplacement) {
    // Check which blocks have changes and which ones have blank node properties
    const blocksWithChanges = new Set<StatementBlock>();
    const blocksWithBlankNodes = new Set<StatementBlock>();
    
    for (const changeSet of propertyLevelChanges.values()) {
      // Find which block this property line belongs to
      for (const block of cache.statementBlocks) {
        if (block.position.start <= changeSet.propertyLine.position.start && 
            block.position.end >= changeSet.propertyLine.position.end) {
          blocksWithChanges.add(block);
          break;
        }
      }
    }
    
    // For each block with changes, check if it has any blank node properties
    for (const block of blocksWithChanges) {
      // Check if block has any property lines with blank nodes (multi-line properties)
      try {
        const propertyLines = extractPropertyLines(block, cache);
        const hasBlankNodeProperties = propertyLines.some(propLine => 
          propLine.isMultiLine || propLine.quads.some(q => q.object.termType === 'BlankNode')
        );
        if (hasBlankNodeProperties) {
          debugLog('[reconstructFromCache] Block', block.subject, 'has blank node properties, will use block-level serialization for this block');
          blocksWithBlankNodes.add(block);
        }
      } catch (error) {
        // If property line extraction fails, fall back to block-level for this block
        debugWarn('[reconstructFromCache] Failed to extract property lines for', block.subject, ', will use block-level serialization:', error);
        blocksWithBlankNodes.add(block);
      }
    }
    
    // Only use targeted replacement if NO blocks with changes have blank nodes
    // If some blocks have blank nodes, we'll use a hybrid approach: targeted for simple blocks, block-level for blank node blocks
    if (blocksWithBlankNodes.size > 0) {
      debugLog('[reconstructFromCache] Some blocks have blank nodes, using hybrid approach');
      // For now, disable targeted replacement entirely if any block has blank nodes
      // TODO: Implement hybrid approach where we use targeted replacement for simple blocks and block-level for blank node blocks
      canUseTargetedReplacement = false;
    }
  }
  
  if (canUseTargetedReplacement) {
    debugLog('[reconstructFromCache] All changes are simple and no blank node properties, using targeted line replacement');
    debugLog('[reconstructFromCache] Using targeted replacement with', propertyLevelChanges.size, 'property changes');
    try {
      const result = performTargetedLineReplacement(cache, propertyLevelChanges);
      debugLog('[reconstructFromCache] Targeted replacement result length:', result.length);
      debugLog('[reconstructFromCache] Targeted replacement result (first 300 chars):', result.substring(0, 300));
      debugLog('[reconstructFromCache] Result === cache.content?', result === cache.content);
      if (result === cache.content) {
        debugWarn('[reconstructFromCache] Targeted replacement returned unchanged content, falling back to block-level');
        // Fall through to block-level
      } else {
        return result;
      }
    } catch (error) {
      debugWarn('[reconstructFromCache] Targeted line replacement failed, falling back to block-level:', error);
      // Fall through to block-level reconstruction
    }
  } else {
    debugLog('[reconstructFromCache] Cannot use targeted replacement (complex changes or blank node properties), using block-level serialization');
    debugLog('[reconstructFromCache] Using block-level serialization, modifiedBlocks:', modifiedBlocks.length);
  }
  
  // Reconstruct from original with modifications (block-level)
  debugLog('[reconstructFromCache] Found', modifiedBlocks.length, 'modified blocks out of', cache.statementBlocks.length, 'total blocks');
  if (modifiedBlocks.length > 0) {
    debugLog('[reconstructFromCache] Modified block subjects:', modifiedBlocks.map(b => b.subject).filter(Boolean));
    // Debug: Check DrawingSheet block quads
    const drawingSheetBlock = modifiedBlocks.find(b => b.subject && b.subject.includes('DrawingSheet'));
    if (drawingSheetBlock) {
      debugLog('[reconstructFromCache] DrawingSheet block in modifiedBlocks - quads count:', drawingSheetBlock.quads.length);
      const subClassOfQuads = drawingSheetBlock.quads.filter(q => (q.predicate as { value: string }).value.includes('subClassOf'));
      debugLog('[reconstructFromCache] DrawingSheet block - rdfs:subClassOf quads:', subClassOfQuads.length);
      const typeQuads = drawingSheetBlock.quads.filter(q => (q.predicate as { value: string }).value.includes('type') && (q.object as { value?: string }).value?.includes('Class'));
      debugLog('[reconstructFromCache] DrawingSheet block - rdf:type owl:Class quads:', typeQuads.length);
    }
    const result = await reconstructFromOriginalText(cache, modifiedBlocks);
    
    // SAFETY CHECK: Verify result doesn't contain corrupted "wl:" prefix
    // If "wl:" appears and there's no @prefix wl: declaration, it's corruption
    // Since we've verified there's no @prefix wl:, it's safe to replace ALL "wl:" with "owl:"
    // (The "wl:" in "owl:" will be unaffected since we're replacing the whole "wl:" string)
    if (result.includes('wl:')) {
      const hasWlPrefix = result.match(/@prefix\s+wl:/);
      if (!hasWlPrefix) {
        // "wl:" appears but there's no @prefix wl: declaration - this is corruption
        console.warn('[reconstructFromCache] SAFETY CHECK: Detected "wl:" corruption, fixing');
        
        // CRITICAL: We must NOT replace "wl:" that's part of "owl:" (would turn "owl:" into "oowl:")
        // Strategy: Use placeholder to protect "owl:" during replacement
        // 1. Temporarily replace all "owl:" with a unique placeholder
        const placeholder = '__OWL_PLACEHOLDER_XYZ__';
        let fixed = result.replace(/owl:/g, placeholder);
        
        // Debug: Check how many "wl:" we have after protecting "owl:"
        const wlCountAfterProtect = (fixed.match(/wl:/g) || []).length;
        console.warn('[reconstructFromCache] After protecting "owl:", found', wlCountAfterProtect, 'standalone "wl:" occurrences');
        
        // 2. Now safely replace all "wl:" with "owl:" (no risk of matching "owl:")
        fixed = fixed.replace(/wl:/g, 'owl:');
        
        // 3. Restore "owl:" from placeholder
        const placeholderRegex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        fixed = fixed.replace(placeholderRegex, 'owl:');
        
        // Verify the fix worked - check for standalone "wl:" (not part of "owl:")
        const remainingWl = fixed.match(/(^|@prefix\s|\s|[^o])(wl:)/g);
        if (remainingWl && remainingWl.length > 0 && !fixed.match(/@prefix\s+wl:/)) {
          console.error('[reconstructFromCache] WARNING: Fix incomplete, still have', remainingWl.length, 'standalone "wl:" occurrences, trying again');
          // Last resort: try one more time with the placeholder approach
          fixed = fixed.replace(/owl:/g, placeholder);
          fixed = fixed.replace(/wl:/g, 'owl:');
          fixed = fixed.replace(placeholderRegex, 'owl:');
          
          // Final check
          const finalWl = fixed.match(/(^|@prefix\s|\s|[^o])(wl:)/g);
          if (finalWl && finalWl.length > 0) {
            console.error('[reconstructFromCache] ERROR: Fix failed, still have', finalWl.length, 'standalone "wl:" occurrences after second attempt');
          }
        }
        
        console.warn('[reconstructFromCache] SAFETY CHECK: Fixed corruption');
        return fixed;
      }
    }
    
    return result;
  }
  
  // No modifications - return original
  debugLog('[reconstructFromCache] No modifications detected, returning original content');
  return cache.content;
}

/**
 * Compare two sets of quads to see if they're different
 * Handles blank nodes, literals, and named nodes correctly
 */
export function quadsAreDifferent(original: N3Quad[], current: N3Quad[]): boolean {
  // Compared as sets, not by count: a triple the source states twice (`owl:imports <x>` on two
  // lines) is one triple in the store, and the statement has not changed (#121).
  // Create a signature for each quad (subject, predicate, object)
  // Handle different term types correctly
  const createSignature = (q: N3Quad): string => {
    const subj = q.subject.termType === 'NamedNode' 
      ? (q.subject as { value: string }).value
      : q.subject.termType === 'BlankNode'
        ? `_:${(q.subject as { id: string }).id}`
        : '';
    const pred = (q.predicate as { value: string }).value;
    let obj: string;
    if (q.object.termType === 'NamedNode') {
      obj = (q.object as { value: string }).value;
    } else if (q.object.termType === 'BlankNode') {
      obj = `_:${(q.object as { id: string }).id}`;
    } else if (q.object.termType === 'Literal') {
      const lit = q.object as { value: string; datatype?: { value: string }; language?: string };
      obj = `"${lit.value}"${lit.language ? `@${lit.language}` : lit.datatype ? `^^${lit.datatype.value}` : ''}`;
    } else {
      obj = '';
    }
    return `${subj}|${pred}|${obj}`;
  };
  
  const originalSignatures = new Set(original.map(createSignature));
  const currentSignatures = new Set(current.map(createSignature));
  
  if (originalSignatures.size !== currentSignatures.size) {
    debugLog('[quadsAreDifferent] Different signature sizes:', originalSignatures.size, 'vs', currentSignatures.size);
    return true;
  }
  
  for (const sig of originalSignatures) {
    if (!currentSignatures.has(sig)) {
      debugLog('[quadsAreDifferent] Missing signature in current:', sig);
      // Log what's different
      const [, pred, obj] = sig.split('|');
      if (pred.includes('label')) {
        debugLog('[quadsAreDifferent] Label quad difference detected - original:', obj, 'current labels:', Array.from(currentSignatures).filter(s => s.split('|')[1].includes('label')).map(s => s.split('|')[2]));
      }
      return true;
    }
  }

  return false;
}

