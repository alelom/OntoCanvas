/**
 * Editing the edges between classes in the store: changing, adding and removing one. Moved out of src/parser.ts unchanged (#193, step 4f).
 */

import { DataFactory, Store } from 'n3';
import { RDFS } from './vocab';
import { addRestrictionToStore, findRestrictionBlank } from './editRestrictions';
import { debugError, debugLog, isDebugMode } from '../utils/debug';
import { getObjectPropertyUriFromStore } from './editObjectProperties';
import { resolveClassBase } from './editClasses';

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
