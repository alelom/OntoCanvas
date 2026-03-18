import { DataFactory, Parser, Store, BlankNode } from 'n3';
import type { Quad as N3Quad } from 'n3';
import { getExampleImageUrisForClass } from './lib/exampleImageStore';
import { labelToCamelCaseIdentifier } from './lib/identifierFromLabel';
import type { GraphData, GraphEdge, GraphNode, AnnotationPropertyInfo, ObjectPropertyInfo, DataPropertyInfo, DataPropertyRestriction } from './types';
import { isDebugMode, debugLog, debugWarn, debugError } from './utils/debug';
import { parseRdfToQuads } from './rdf/parseRdfToQuads';
import { parseTurtleWithPositions, reconstructFromOriginalText, detectPropertyLevelChanges, performTargetedLineReplacement, isSimplePropertyChange, extractPropertyLines, type OriginalFileCache, type StatementBlock } from './rdf/sourcePreservation';
import { serializeStoreWithRdflib } from './rdf/rdflibSerializer';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const XSD_BOOLEAN = XSD + 'boolean';

const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
export const BASE_IRI = 'http://example.org/aec-drawing-ontology#';
const HAS_CARDINALITY_PROP = BASE_IRI + 'hasCardinality';

export function extractLocalName(uri: string): string {
  if (uri.includes('#')) return uri.split('#').pop()!;
  if (uri.includes('/')) return uri.split('/').pop()!;
  return uri;
}

// Re-export for convenience
export { extractLocalName as extractLocalNameFromUri };

function isBlankNode(term: { termType: string }): boolean {
  return term.termType === 'BlankNode';
}

function parseCardinalityFromRestriction(
  minQual: import('n3').Quad | undefined,
  maxQual: import('n3').Quad | undefined,
  qualCard: import('n3').Quad | undefined,
  minCard: import('n3').Quad | undefined,
  maxCard: import('n3').Quad | undefined,
  someValuesFrom: import('n3').Quad | undefined,
  propName?: string,
  onClass?: import('n3').Quad | undefined
): { minCardinality?: number | null; maxCardinality?: number | null } {
  const toInt = (q: import('n3').Quad | undefined): number | null => {
    if (!q) return null;
    const obj = q.object as { value?: unknown };
    // Handle 0 correctly - check for null/undefined but allow 0
    if (obj.value == null) return null;
    const num = typeof obj.value === 'number' ? obj.value : parseInt(String(obj.value), 10);
    return isNaN(num) ? null : num;
  };
  const n = toInt(qualCard);
  if (n !== null && !isNaN(n)) {
    return { minCardinality: n, maxCardinality: n };
  }
  const minQ = toInt(minQual) ?? toInt(minCard);
  const maxQ = toInt(maxQual) ?? toInt(maxCard);
  if (minQ !== null && !isNaN(minQ)) {
    if (maxQ !== null && !isNaN(maxQ)) {
      return { minCardinality: minQ, maxCardinality: maxQ };
    }
    return { minCardinality: minQ, maxCardinality: null };
  }
  if (maxQ !== null && !isNaN(maxQ)) {
    return { minCardinality: null, maxCardinality: maxQ };
  }
  // If we have onClass or someValuesFrom but no explicit cardinality, return default
  if (someValuesFrom || onClass) {
    return { minCardinality: propName === 'contains' ? 0 : 1, maxCardinality: null };
  }
  return {};
}

export interface ParseResult {
  graphData: GraphData;
  store: Store;
  annotationProperties: AnnotationPropertyInfo[];
  objectProperties: ObjectPropertyInfo[];
  dataProperties: DataPropertyInfo[];
  /** Original file cache for source preservation (idempotent round-trips) */
  originalFileCache?: OriginalFileCache;
}

/** Return the main ontology IRI with trailing # for prefix matching, or null if not found. */
export function getMainOntologyBase(store: Store): string | null {
  const ontQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Ontology'), null);
  if (ontQuads.length === 0 || ontQuads[0].subject.termType !== 'NamedNode') return null;
  const uri = (ontQuads[0].subject as { value: string }).value;
  return uri.endsWith('#') ? uri : uri + '#';
}

/**
 * Return the namespace (base IRI with trailing #) used for class URIs in this store.
 * Used for exampleImage so the predicate lives in the same namespace as classes (e.g. :exampleImage not :Ontology#exampleImage).
 */
export function getClassNamespace(store: Store): string | null {
  const classQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), null);
  for (const q of classQuads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const uri = (q.subject as { value: string }).value;
    const localName = extractLocalName(uri);
    if (!localName) continue;
    if (uri.includes('#')) return uri.slice(0, uri.lastIndexOf('#') + 1);
    if (uri.includes('/')) return uri.slice(0, uri.lastIndexOf('/') + 1);
    return null;
  }
  return null;
}

export function getObjectProperties(store: Store): ObjectPropertyInfo[] {
  const result: ObjectPropertyInfo[] = [];
  const seen = new Set<string>();
  const mainBase = getMainOntologyBase(store);
  const classNs = getClassNamespace(store);
  const opQuads = store.getQuads(null, RDF + 'type', OWL + 'ObjectProperty', null);
  for (const q of opQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const localName = extractLocalName(subjUri);
    const isFromMainOntology =
      (mainBase != null && (subjUri === mainBase || subjUri.startsWith(mainBase) || subjUri === mainBase.slice(0, -1))) ||
      (classNs != null && subjUri.startsWith(classNs)) ||
      (mainBase == null && classNs == null && subjUri.startsWith(BASE_IRI));
    // External (imported) properties always use full URI so we can show e.g. geo:hasGeometry in the UI.
    // Local (main ontology) properties use local name unless duplicate, then full URI so both appear in the list.
    const name = isFromMainOntology
      ? (seen.has(localName) ? subjUri : localName)
      : subjUri;
    if (seen.has(name)) continue;
    seen.add(localName);
    seen.add(name);
    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? name;
    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;
    const hasCardQuad = store.getQuads(subj, DataFactory.namedNode(HAS_CARDINALITY_PROP), null, null)[0];
    let hasCardinality = true;
    if (hasCardQuad?.object) {
      const val = String((hasCardQuad.object as { value?: unknown }).value ?? '').toLowerCase();
      hasCardinality = val === 'true' || val === '"true"';
    }
    const OWL_THING = OWL + 'Thing';
    const domainQuads = store.getQuads(subj, DataFactory.namedNode(RDFS + 'domain'), null, null);
    const rangeQuads = store.getQuads(subj, DataFactory.namedNode(RDFS + 'range'), null, null);
    let domain: string | null = null;
    let range: string | null = null;
    if (domainQuads.length > 0 && domainQuads[0].object.termType === 'NamedNode') {
      const domainUri = (domainQuads[0].object as { value: string }).value;
      if (domainUri !== OWL_THING) domain = extractLocalName(domainUri);
    }
    if (rangeQuads.length > 0 && rangeQuads[0].object.termType === 'NamedNode') {
      const rangeUri = (rangeQuads[0].object as { value: string }).value;
      if (rangeUri !== OWL_THING) range = extractLocalName(rangeUri);
    }
    const isDefinedByQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
    const subPropertyOfQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'subPropertyOf'), null, null)[0];
    let isDefinedBy: string | null = null;
    let subPropertyOf: string | null = null;
    if (isDefinedByQuad?.object?.termType === 'NamedNode') isDefinedBy = (isDefinedByQuad.object as { value: string }).value;
    if (subPropertyOfQuad?.object?.termType === 'NamedNode') subPropertyOf = (subPropertyOfQuad.object as { value: string }).value;
    result.push({
      name,
      label: String(label),
      hasCardinality,
      comment: comment || undefined,
      domain: domain ?? undefined,
      range: range ?? undefined,
      uri: subjUri,
      isDefinedBy: isDefinedBy ?? undefined,
      subPropertyOf: subPropertyOf ?? undefined
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export function getAnnotationProperties(
  store: Store,
  externalOntologyReferences?: Array<{ url: string }>,
  mainOntologyBase?: string | null
): AnnotationPropertyInfo[] {
  const result: AnnotationPropertyInfo[] = [];
  const seen = new Set<string>();
  // Map of subject URIs to their range values
  const rangeMap = new Map<string, string>();
  const RDFS_RANGE = RDFS + 'range';
  for (const q of store) {
    const predVal = (q.predicate as { value?: string; id?: string }).value ?? (q.predicate as { value?: string; id?: string }).id;
    if (predVal !== RDFS_RANGE) continue;
    const obj = q.object as { value?: string; id?: string };
    const rangeVal = obj?.value ?? obj?.id;
    if (typeof rangeVal === 'string') {
      const subjUri = (q.subject as { value: string }).value ?? (q.subject as { id: string }).id;
      if (subjUri) {
        rangeMap.set(subjUri, rangeVal);
      }
    }
  }
  const apQuads = store.getQuads(null, RDF + 'type', OWL + 'AnnotationProperty', null);
  for (const q of apQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const name = extractLocalName(subjUri);
    if (seen.has(name)) continue;
    seen.add(name);
    const range = rangeMap.get(subjUri) ?? null;
    const isBoolean = range === XSD_BOOLEAN || range?.endsWith('#boolean') || false;
    
    // Extract isDefinedBy if present
    const isDefinedByQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
    let isDefinedBy: string | null = null;
    if (isDefinedByQuad?.object?.termType === 'NamedNode') {
      isDefinedBy = (isDefinedByQuad.object as { value: string }).value;
    }
    
    result.push({ name, isBoolean, range, uri: subjUri, isDefinedBy: isDefinedBy ?? undefined });
  }
  return result;
}

/**
 * Build ParseResult (graph data + store + property lists) from an N3 Store.
 * Used by both quadsToParseResult and (indirectly) parseTtlToGraph / parseRdfToGraph.
 */
function buildParseResultFromStore(
  store: Store,
  additionalAnnotationProps?: AnnotationPropertyInfo[],
  originalFileCache?: OriginalFileCache
): ParseResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenClasses = new Set<string>();
  let annotationProps = getAnnotationProperties(store);
  
  // Merge additional annotation properties (e.g., used but not declared ones from external ontologies)
  if (additionalAnnotationProps && additionalAnnotationProps.length > 0) {
    const existingNames = new Set(annotationProps.map(ap => ap.name));
    const existingUris = new Set(annotationProps.map(ap => ap.uri));
    for (const ap of additionalAnnotationProps) {
      if (!existingNames.has(ap.name) && !existingUris.has(ap.uri)) {
        annotationProps.push(ap);
      }
    }
  }
  
  // Debug: Log at start of parsing (only in debug mode)
  if (isDebugMode()) {
    debugLog('[PARSER] Starting buildParseResultFromStore');
  }

  const excludeNamespaces = [
    'http://www.w3.org/2002/07/owl#',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    'http://www.w3.org/2000/01/rdf-schema#',
  ];

  // Get all OWL classes
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const uri = subj.value;
    if (excludeNamespaces.some((ns) => uri.startsWith(ns))) continue;
    const localName = extractLocalName(uri);
    if (seenClasses.has(localName)) continue;
    seenClasses.add(localName);

    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? localName;

    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;

    let labellableRoot: boolean | null = null;
    const annotations: Record<string, string | boolean | null> = {};
    const outQuads = store.getQuads(subj, null, null, null);
    for (const oq of outQuads) {
      const predName = extractLocalName(oq.predicate.value);
      const isAnnotation = annotationProps.some((ap) => ap.name === predName);
      if (!isAnnotation) continue;
      const obj = oq.object;
      const apInfo = annotationProps.find((ap) => ap.name === predName);
      if (apInfo?.isBoolean) {
        const val = obj.value;
        const str = String(val).toLowerCase();
        const b = val === true || str === 'true' ? true : val === false || str === 'false' ? false : null;
        annotations[predName] = b;
        if (predName === 'labellableRoot') labellableRoot = b;
      } else {
        annotations[predName] = obj.value != null ? String(obj.value) : null;
      }
    }

    const exampleImages = getExampleImageUrisForClass(store, localName, getClassNamespace(store) ?? getMainOntologyBase(store) ?? BASE_IRI);

    nodes.push({
      id: localName,
      label,
      labellableRoot,
      comment: comment || undefined,
      annotations,
      dataPropertyRestrictions: [],
      exampleImages: exampleImages.length > 0 ? exampleImages : undefined,
    });
  }
  
  // Debug: Log parsed classes (only in debug mode)
  if (isDebugMode()) {
    debugLog(`[PARSER] Parsed ${nodes.length} classes:`, nodes.map(n => n.id));
  }

  // subClassOf edges
  const subClassQuads = store.getQuads(null, RDFS + 'subClassOf', null, null);
  const seenPairs = new Set<string>();

  // Debug: Log all blank node restrictions to find describes edge (only in debug mode)
  if (isDebugMode()) {
    const blankNodeRestrictions = subClassQuads.filter((q) => isBlankNode(q.object));
    debugLog(`[PARSER] Found ${blankNodeRestrictions.length} blank node restrictions (potential edges). Total subClassOf quads: ${subClassQuads.length}`);
    debugLog(`[PARSER] Seen classes:`, Array.from(seenClasses));
    debugLog(`[PARSER] Nodes:`, nodes.map(n => ({ id: n.id, label: n.label })));
  }
  
  // Debug: Specifically look for describes property
  const describesPropertyUri = 'https://w3id.org/dano#describes';
  let foundDescribesRestriction = false;

  for (const q of subClassQuads) {
    const subj = q.subject;
    const obj = q.object;
    if (subj.termType !== 'NamedNode') continue;

    const subjUri = subj.value;
    const subjName = extractLocalName(subjUri);
    if (!seenClasses.has(subjName)) continue;

    if (obj.termType === 'NamedNode') {
      const objName = extractLocalName(obj.value);
      if (!seenClasses.has(objName)) continue;
      const key = `${subjName}->${objName}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      edges.push({ from: subjName, to: objName, type: 'subClassOf' });
    } else if (isBlankNode(obj)) {
      // Get all quads for this blank node.
      // After serialization/parsing, blank node objects might be different, so we always
      // find the blank node by matching the rdfs:subClassOf relationship.
      // This ensures we get all quads even if the blank node object identity changed.
      // Find all blank nodes that this subject has rdfs:subClassOf to
      const matchingSubClassQuads = store.getQuads(
        DataFactory.namedNode(subjUri),
        DataFactory.namedNode(RDFS + 'subClassOf'),
        null,
        null
      ).filter(q => isBlankNode(q.object));
      
      // Process ALL restriction blank nodes for this subject, not just the first one
      // This handles cases where a class has multiple restrictions (e.g., DrawingSheet has 4 restrictions)
      // Use a Set to track processed blank nodes by their onProperty + onClass/someValuesFrom combination
      // (blank node IDs are not stable, so we can't use them directly)
      const processedRestrictions = new Set<string>();
      
      for (const matchQuad of matchingSubClassQuads) {
        const candidateBlank = matchQuad.object;
        if (candidateBlank.termType !== 'BlankNode') continue;
        
        // Query for onProperty directly - this works even if blank node object identity changed
        // because N3 matches by internal ID
        const onPropQuads = store.getQuads(candidateBlank, DataFactory.namedNode(OWL + 'onProperty'), null, null);
        if (onPropQuads.length === 0) continue; // Not a restriction blank node
        
        // This is a restriction blank node - get ALL its quads
        const allBlankQuads = store.getQuads(candidateBlank, null, null, null);
        
        const onProperty = allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'onProperty');
        const someValuesFrom = allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'someValuesFrom');
        const onClass = allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'onClass');
        const minQual = allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'minQualifiedCardinality');
        const maxQual = allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'maxQualifiedCardinality');
        const qualCard = allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'qualifiedCardinality');
        const minCard = allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'minCardinality');
        const maxCard = allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'maxCardinality');
        
        const targetQuad = someValuesFrom ?? onClass;
        if (!onProperty || !targetQuad) {
          continue; // Skip this blank node, continue to next one
        }
        const target = targetQuad.object;
        if (target.termType !== 'NamedNode') {
          continue; // Skip this blank node, continue to next one
        }
        const targetUri = (target as { value: string }).value;
        const targetName = extractLocalName(targetUri);
        
        // Check if target class exists
        if (!seenClasses.has(targetName)) {
          continue; // Skip this blank node, continue to next one
        }
        
        // Preserve full URI for external properties, use local name for local properties
        const propUri = (onProperty.object as { value: string }).value;
        const mainBase = getMainOntologyBase(store);
        // Check if property is external by comparing URI base
        let isExternalProperty = false;
        if (mainBase) {
          // Extract base IRI (before #) from both the ontology URI and property URI
          const mainBaseIri = mainBase.includes('#') ? mainBase.slice(0, mainBase.indexOf('#')) : mainBase.replace(/#$/, '');
          const propBase = propUri.includes('#') ? propUri.slice(0, propUri.indexOf('#')) : propUri.split('/').slice(0, -1).join('/');
          isExternalProperty = propBase !== mainBaseIri;
        } else {
          isExternalProperty = !propUri.startsWith(BASE_IRI);
        }
        const propName = isExternalProperty ? propUri : extractLocalName(propUri);

        // Create a unique key for this restriction to avoid processing duplicates
        const restrictionKey = `${subjName}:${propUri}:${targetUri}`;
        if (processedRestrictions.has(restrictionKey)) {
          continue; // Already processed this restriction
        }
        processedRestrictions.add(restrictionKey);

        // Debug: Check if this is the describes restriction
        if (propUri === describesPropertyUri || propUri.includes('describes')) {
          foundDescribesRestriction = true;
        }

        const cardinality = parseCardinalityFromRestriction(
          minQual, maxQual, qualCard, minCard, maxCard, someValuesFrom, propName, onClass
        );

        const key = `${subjName}->${targetName}:${propName}`;
        // If a domain/range edge already exists, replace it with the restriction edge
        // (restrictions have cardinality and are more specific)
        const existingEdgeIndex = edges.findIndex(
          (e) => e.from === subjName && e.to === targetName && e.type === propName
        );
        
        const restrictionEdge: GraphEdge = { 
          from: subjName, 
          to: targetName, 
          type: propName, 
          ...cardinality,
          isRestriction: true, // Mark as restriction (from OWL restriction)
        };
        
        // Debug: Log restriction edge creation for contains edges
        if (propName.includes('contains') && (subjName.includes('cardinality') || isDebugMode())) {
          debugLog('[DEBUG] Creating restriction edge:', { 
            key, 
            edge: restrictionEdge, 
            cardinality,
            hasMinQual: !!minQual,
            hasMaxQual: !!maxQual,
            minQualValue: minQual ? (minQual.object as { value: unknown }).value : null,
            maxQualValue: maxQual ? (maxQual.object as { value: unknown }).value : null,
            existingEdgeIndex,
            alreadySeen: seenPairs.has(key),
          });
        }
        
        if (existingEdgeIndex >= 0) {
          // Replace the existing domain/range edge with the restriction edge
          edges[existingEdgeIndex] = restrictionEdge;
          // Mark as seen to prevent domain/range from recreating it
          if (!seenPairs.has(key)) {
            seenPairs.add(key);
          }
          // Debug: Log replacement
          if (propName.includes('contains') && (subjName.includes('cardinality') || isDebugMode())) {
            debugLog('[DEBUG] Replaced domain/range edge with restriction edge:', { key, edge: restrictionEdge, cardinality });
          }
        } else if (!seenPairs.has(key)) {
          seenPairs.add(key);
          edges.push(restrictionEdge);
          
          // Debug: Log DimensionChain contains edge specifically
          if (subjName === 'DimensionChain' && targetName === 'Dimension' && propName.includes('contains')) {
            debugLog('[DEBUG] Parsed DimensionChain->Dimension contains restriction:', {
              edge: restrictionEdge,
              cardinality,
              minQual: minQual ? (minQual.object as { value: string }).value : null,
              maxQual: maxQual ? (maxQual.object as { value: string }).value : null,
              qualCard: qualCard ? (qualCard.object as { value: string }).value : null,
              minCard: minCard ? (minCard.object as { value: string }).value : null,
              maxCard: maxCard ? (maxCard.object as { value: string }).value : null,
              someValuesFrom: someValuesFrom ? (someValuesFrom.object as { value: string }).value : null,
            });
          }
          
          // Debug: Log external property edges
          if (propName.startsWith('http://') || propName.startsWith('https://')) {
            debugLog('[DEBUG] Parsed external property edge:', restrictionEdge);
          }
          // Debug: Specifically log describes edge
          if (propName === describesPropertyUri || propName.includes('describes')) {
            debugLog('[DEBUG] ✓ Successfully added describes edge:', restrictionEdge);
          }
          // Debug: Log contains edges to check for duplicates
          if (propName.includes('contains')) {
            debugLog('[DEBUG] Added contains restriction edge:', { key, edge: restrictionEdge, cardinality });
          }
        } else {
          // Debug: Log duplicate edge
          if (propName === describesPropertyUri || propName.includes('describes')) {
            debugLog('[DEBUG] Duplicate describes edge skipped (key already exists):', key);
          }
          // Debug: Log duplicate contains edge
          if (propName.includes('contains')) {
            debugWarn('[DEBUG] ⚠ Duplicate contains edge skipped (key already exists):', key, {
              subject: subjUri,
              target: targetUri,
              propUri: propUri
            });
          }
        }
      } // End of processing this blank node restriction
    } // End of loop through all matching blank nodes
  }
  
  // Debug: Summary
  if (!foundDescribesRestriction) {
    debugLog('[DEBUG] ⚠ No describes restriction found in TTL store');
  }
  debugLog(`[DEBUG] Total edges parsed: ${edges.length}`);
  const describesEdges = edges.filter((e) => e.type === describesPropertyUri || e.type.includes('describes'));
  debugLog(`[DEBUG] Describes edges in parsed edges: ${describesEdges.length}`, describesEdges);

  const objectProps = getObjectProperties(store);
  
  // Track object properties referenced in restrictions that might not be in the store
  const referencedObjectPropUris = new Set<string>();
  for (const q of store.getQuads(null, RDFS + 'subClassOf', null, null)) {
    const obj = q.object;
    if (!isBlankNode(obj)) continue;
    const onProperty = store.getQuads(obj, OWL + 'onProperty', null, null)[0];
    if (onProperty && onProperty.object.termType === 'NamedNode') {
      const propUri = (onProperty.object as { value: string }).value;
      referencedObjectPropUris.add(propUri);
    }
  }
  
  // Add referenced object properties that aren't declared in the store
  for (const propUri of referencedObjectPropUris) {
    const propName = extractLocalName(propUri);
    // Check if already in objectProps (by name or URI)
    if (!objectProps.some((op) => op.name === propName || op.uri === propUri)) {
      // Try to get label and other info from store, but if not found, use defaults
      const propQuads = store.getQuads(DataFactory.namedNode(propUri), null, null, null);
      let label = propName;
      let comment: string | undefined = undefined;
      let domain: string | undefined = undefined;
      let range: string | undefined = undefined;
      let hasCardinality = true;
      let isDefinedBy: string | undefined = undefined;
      let subPropertyOf: string | undefined = undefined;
      
      for (const q of propQuads) {
        const pred = (q.predicate as { value?: string }).value;
        if (pred === RDFS + 'label') {
          label = (q.object as { value?: string }).value ?? propName;
        } else if (pred === RDFS + 'comment') {
          comment = (q.object as { value?: string }).value ?? undefined;
        } else if (pred === RDFS + 'domain') {
          const domainUri = (q.object as { value?: string }).value;
          if (domainUri && domainUri !== OWL + 'Thing') {
            domain = extractLocalName(domainUri);
          }
        } else if (pred === RDFS + 'range') {
          const rangeUri = (q.object as { value?: string }).value;
          if (rangeUri && rangeUri !== OWL + 'Thing') {
            range = extractLocalName(rangeUri);
          }
        } else if (pred === RDFS + 'isDefinedBy') {
          if (q.object.termType === 'NamedNode') {
            isDefinedBy = (q.object as { value: string }).value;
          }
        } else if (pred === RDFS + 'subPropertyOf') {
          if (q.object.termType === 'NamedNode') {
            subPropertyOf = (q.object as { value: string }).value;
          }
        }
      }
      
      // Check if URI belongs to an external ontology (not the main ontology base)
      // If isDefinedBy is not found in store, check if URI belongs to external ontology
      if (!isDefinedBy) {
        const mainBase = getMainOntologyBase(store);
        const mainBaseNormalized = mainBase ? (mainBase.endsWith('#') ? mainBase.slice(0, -1) : mainBase).replace(/\/$/, '') : null;
        const mainBaseWithHash = mainBase || '';
        
        // Extract base URL from property URI
        let uriBase: string;
        if (propUri.includes('#')) {
          uriBase = propUri.slice(0, propUri.indexOf('#'));
        } else {
          const lastSlash = propUri.lastIndexOf('/');
          uriBase = lastSlash > 0 ? propUri.substring(0, lastSlash) : propUri;
        }
        uriBase = uriBase.replace(/\/$/, '');
        
        // If URI base doesn't match main ontology base, it's from an external ontology
        if (uriBase && uriBase !== mainBaseNormalized && uriBase !== mainBaseWithHash.replace(/\/$/, '').replace(/#$/, '')) {
          // Check if it matches any owl:imports
          const importQuads = store.getQuads(null, DataFactory.namedNode(OWL + 'imports'), null, null);
          for (const importQuad of importQuads) {
            if (importQuad.object.termType === 'NamedNode') {
              const importUrl = (importQuad.object as { value: string }).value;
              const importUrlNormalized = importUrl.endsWith('#') ? importUrl.slice(0, -1) : importUrl;
              const importUrlBase = importUrlNormalized.replace(/\/$/, '');
              if (uriBase === importUrlBase || uriBase.startsWith(importUrlBase + '/') || uriBase.startsWith(importUrlBase + '#')) {
                isDefinedBy = importUrlNormalized;
                break;
              }
            }
          }
          // If no matching import found but URI is clearly external, use the URI base
          if (!isDefinedBy) {
            isDefinedBy = uriBase;
          }
        }
      }
      
      // For external properties, use full URI as name (consistent with getObjectProperties behavior)
      // This ensures the name matches edge types which are stored as full URIs for external properties
      // Determine if this is an external property
      const isExternal = isDefinedBy || (propUri !== propName && (propUri.startsWith('http://') || propUri.startsWith('https://')));
      const finalName = isExternal ? propUri : propName; // Use full URI for external properties, local name for local
      
      objectProps.push({
        name: finalName,
        label: String(label),
        hasCardinality,
        comment,
        domain,
        range,
        uri: propUri,
        isDefinedBy,
        subPropertyOf,
      });
    }
  }
  
  const dataProps = getDataProperties(store);

  // Create edges from object property domain/range definitions
  // This handles cases where properties are defined but not used in restrictions
  // (e.g., dano:describes with domain DescriptionElement and range DisplayElement)
  // Note: We create domain/range edges for all properties, but they are marked as
  // isRestriction: false. When a restriction is removed, the edge from domain/range
  // will still exist, which is the expected behavior for most properties.
  // IMPORTANT: rawData.edges contains at most one edge per from/to/type combination.
  // If both a restriction and domain/range exist for the same property, only one edge
  // is created (the restriction edge takes precedence).
  for (const op of objectProps) {
    // Use explicit URI when set (disambiguates e.g. hasGeometry from GeoSPARQL vs DAnO), else name if full URI, else resolve from store
    let propUri: string;
    if (op.uri) {
      propUri = op.uri;
    } else if (op.name.startsWith('http://') || op.name.startsWith('https://')) {
      propUri = op.name;
    } else {
      const opQuads = store.getQuads(null, RDF + 'type', OWL + 'ObjectProperty', null);
      propUri = BASE_IRI + op.name;
      for (const q of opQuads) {
        if (q.subject.termType === 'NamedNode') {
          const uri = (q.subject as { value: string }).value;
          if (extractLocalName(uri) === op.name) {
            propUri = uri;
            break;
          }
        }
      }
    }
    
    const propNode = DataFactory.namedNode(propUri);
    const domainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), null, null);
    const rangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), null, null);
    
    const OWL_THING = OWL + 'Thing';
    
    // Use full URI for external properties, local name for local properties
    const isExternalProperty = !propUri.startsWith(BASE_IRI);
    const propName = isExternalProperty ? propUri : op.name;
    
    // Collect valid domains and ranges
    const validDomains: string[] = [];
    let hasOwlThingDomain = false;
    for (const domainQuad of domainQuads) {
      if (domainQuad.object.termType !== 'NamedNode') continue;
      const domainUri = (domainQuad.object as { value: string }).value;
      if (domainUri === OWL_THING) {
        hasOwlThingDomain = true;
        // When domain is owl:Thing, skip creating domain/range edges
        // Edges should only come from actual restrictions, not from owl:Thing domain/range
        break;
      }
      const domainName = extractLocalName(domainUri);
      if (seenClasses.has(domainName)) {
        validDomains.push(domainName);
      }
    }
    
    // Collect valid ranges
    const validRanges: string[] = [];
    let hasOwlThingRange = false;
    for (const rangeQuad of rangeQuads) {
      if (rangeQuad.object.termType !== 'NamedNode') continue;
      const rangeUri = (rangeQuad.object as { value: string }).value;
      if (rangeUri === OWL_THING) {
        hasOwlThingRange = true;
        // When range is owl:Thing, skip creating domain/range edges
        // Edges should only come from actual restrictions, not from owl:Thing domain/range
        break;
      }
      const rangeName = extractLocalName(rangeUri);
      if (seenClasses.has(rangeName)) {
        validRanges.push(rangeName);
      }
    }
    
    // Skip creating domain/range edges if domain or range is owl:Thing
    // owl:Thing means "any class can be used", but it doesn't mean "create edges between all classes"
    // Edges should only be created from actual restrictions (which are processed first)
    if (hasOwlThingDomain || hasOwlThingRange) {
      // Don't create domain/range edges for properties with owl:Thing domain/range
      // The edges will come from actual restrictions if they exist
      debugLog(`[PARSER] Skipping domain/range edges for property ${propName} (has owl:Thing domain/range)`);
      continue;
    }
    
    // For each domain-range pair, create an edge if both classes exist
    // But only if a restriction edge doesn't already exist (restrictions are processed first)
    for (const domainName of validDomains) {
      for (const rangeName of validRanges) {
        // Skip self-loops unless explicitly allowed
        if (domainName === rangeName) continue;
        
        // Only create edge if it doesn't already exist as a restriction
        // Restrictions are processed first (lines 316-474), so if a restriction exists,
        // seenPairs will already have the key and we skip creating a domain/range edge
        const key = `${domainName}->${rangeName}:${propName}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          const edge: GraphEdge = { 
            from: domainName, 
            to: rangeName, 
            type: propName,
            isRestriction: false, // Mark as non-restriction (from domain/range, not OWL restriction)
          };
          edges.push(edge);
          
          // Debug: Log domain/range edges
          if (propName.includes('describes') || propName.includes('contains') || propName.includes('connectsTo')) {
            debugLog('[DEBUG] Added edge from domain/range:', { edge, propUri, domainName, rangeName });
          }
        } else {
          // A restriction edge already exists for this key - don't create domain/range edge
          // The restriction edge (with cardinality if present) takes precedence
        }
      }
    }
  }

  // Parse data property restrictions (class subClassOf [ owl:onProperty dp ; owl:onDataRange ... ])
  const OWL_ON_DATA_RANGE = OWL + 'onDataRange';
  const referencedDataPropUris = new Set<string>(); // Track data properties referenced in restrictions
  for (const q of store.getQuads(null, RDFS + 'subClassOf', null, null)) {
    const subj = q.subject;
    const obj = q.object;
    if (subj.termType !== 'NamedNode' || !isBlankNode(obj)) continue;
    const onProp = store.getQuads(obj, OWL + 'onProperty', null, null)[0];
    const onDataRange = store.getQuads(obj, DataFactory.namedNode(OWL_ON_DATA_RANGE), null, null)[0];
    if (!onProp || !onDataRange) continue;
    const propUri = (onProp.object as { value: string }).value;
    const propName = extractLocalName(propUri);
    referencedDataPropUris.add(propUri); // Track full URI
    const minQ = store.getQuads(obj, OWL + 'minCardinality', null, null)[0];
    const maxQ = store.getQuads(obj, OWL + 'maxCardinality', null, null)[0];
    const cardQ = store.getQuads(obj, OWL + 'cardinality', null, null)[0];
    const toInt = (quad: import('n3').Quad | undefined): number | null =>
      quad?.object?.value != null ? parseInt(String(quad.object.value), 10) : null;
    let minCard: number | null = toInt(minQ);
    let maxCard: number | null = toInt(maxQ);
    const n = toInt(cardQ);
    if (n !== null && !isNaN(n)) {
      minCard = n;
      maxCard = n;
    }
    const subjName = extractLocalName((subj as { value: string }).value);
    const node = nodes.find((n) => n.id === subjName);
    if (node && node.dataPropertyRestrictions) {
      node.dataPropertyRestrictions.push({
        propertyName: propName,
        minCardinality: minCard ?? undefined,
        maxCardinality: maxCard ?? undefined,
      });
    }
  }
  
  // Add referenced data properties that aren't declared in the store
  for (const propUri of referencedDataPropUris) {
    const propName = extractLocalName(propUri);
    // Check if already in dataProps
    if (!dataProps.some((dp) => dp.name === propName && dp.uri === propUri)) {
      // Try to get label and other info from store, but if not found, use defaults
      const propQuads = store.getQuads(DataFactory.namedNode(propUri), null, null, null);
      let label = propName;
      let comment: string | undefined = undefined;
      let range = XSD_NS + 'string';
      let domains: string[] = [];
      
      for (const q of propQuads) {
        const pred = (q.predicate as { value?: string }).value;
        if (pred === RDFS + 'label') {
          label = (q.object as { value?: string }).value ?? propName;
        } else if (pred === RDFS + 'comment') {
          comment = (q.object as { value?: string }).value ?? undefined;
        } else if (pred === RDFS + 'range') {
          range = (q.object as { value?: string }).value ?? XSD_NS + 'string';
        } else if (pred === RDFS + 'domain') {
          const domainUri = (q.object as { value?: string }).value;
          if (domainUri && domainUri !== OWL + 'Thing') {
            const domainName = extractLocalName(domainUri);
            if (!domains.includes(domainName)) {
              domains.push(domainName);
            }
          }
        }
      }
      
      // Check if URI belongs to an external ontology (not the main ontology base)
      const isDefinedByQuad = store.getQuads(DataFactory.namedNode(propUri), DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
      let isDefinedBy: string | undefined = undefined;
      if (isDefinedByQuad?.object?.termType === 'NamedNode') {
        isDefinedBy = (isDefinedByQuad.object as { value: string }).value;
      } else {
        // If no isDefinedBy, check if URI doesn't belong to main ontology
        const mainBase = getMainOntologyBase(store);
        const mainBaseNormalized = mainBase ? (mainBase.endsWith('#') ? mainBase.slice(0, -1) : mainBase) : null;
        if (mainBaseNormalized && !propUri.startsWith(mainBaseNormalized) && !propUri.startsWith(mainBase)) {
          // Extract base URL from property URI
          const uriBase = propUri.includes('#') ? propUri.slice(0, propUri.indexOf('#')) : propUri.substring(0, propUri.lastIndexOf('/'));
          if (uriBase && uriBase !== mainBaseNormalized && uriBase !== mainBase) {
            isDefinedBy = uriBase;
          }
        }
      }
      
      dataProps.push({
        name: propName,
        label: String(label),
        comment,
        range,
        domains,
        uri: propUri,
        isDefinedBy,
      });
    }
  }

  return { 
    graphData: { nodes, edges }, 
    store, 
    annotationProperties: annotationProps, 
    objectProperties: objectProps, 
    dataProperties: dataProps,
    originalFileCache: originalFileCache ?? undefined
  };
}

/**
 * Build ParseResult from an array of quads (e.g. from N3 or rdf-parse).
 * RDF/JS quads from rdf-parse are compatible with N3 Store at runtime.
 */
export function quadsToParseResult(quads: N3Quad[], originalFileCache?: OriginalFileCache): ParseResult {
  return buildParseResultFromStore(new Store(quads as Iterable<N3Quad>), undefined, originalFileCache);
}

/**
 * Parse Turtle string and extract OWL classes with subClassOf, partOf, contains.
 * Returns both graph data and the N3 Store for editing/serialization.
 * Uses position-aware parsing for source preservation when possible.
 */
export async function parseTtlToGraph(ttlString: string): Promise<ParseResult> {
  // Use position-aware parsing for Turtle to enable source preservation
  try {
    // First parse with rdf-parse to get quads (handles prefixes correctly)
    const quads = await parseRdfToQuads(ttlString, { contentType: 'text/turtle' });
    
      // Then do position-aware parsing to build cache
      try {
        const { cache } = await parseTurtleWithPositions(ttlString, quads as N3Quad[]);
        return quadsToParseResult(quads as N3Quad[], cache);
    } catch (cacheError) {
      // If position tracking fails, still return quads but without cache
      debugWarn('[parseTtlToGraph] Position-aware parsing failed, continuing without cache:', cacheError);
      return quadsToParseResult(quads as N3Quad[]);
    }
  } catch (error) {
    // Fallback to standard parsing if everything fails
    debugWarn('[parseTtlToGraph] Parsing failed, falling back to standard parsing:', error);
    const quads = await parseRdfToQuads(ttlString, { contentType: 'text/turtle' });
    return quadsToParseResult(quads as N3Quad[]);
  }
}

export interface ParseRdfToGraphOptions {
  path?: string;
  contentType?: string;
  baseIRI?: string;
}

/**
 * Parse RDF content (Turtle, RDF/XML, JSON-LD, etc.) to graph + store.
 * Format is detected from path or contentType.
 * Uses position-aware parsing for Turtle to enable source preservation.
 */
export async function parseRdfToGraph(
  content: string,
  options?: ParseRdfToGraphOptions
): Promise<ParseResult> {
  const contentType = options?.contentType;
  const path = options?.path;
  
  // Use position-aware parsing for Turtle
  if (contentType === 'text/turtle' || 
      (path && (path.endsWith('.ttl') || path.endsWith('.turtle'))) ||
      (!contentType && !path && (content.trim().startsWith('@prefix') || content.trim().startsWith('@base')))) {
    // First parse with rdf-parse to get quads (handles prefixes correctly)
    try {
      const quads = await parseRdfToQuads(content, options ?? {});
      
      // Then do position-aware parsing to build cache
      try {
        const { cache } = await parseTurtleWithPositions(content, quads as N3Quad[]);
        return quadsToParseResult(quads as N3Quad[], cache);
      } catch (cacheError) {
        // If position tracking fails, still return quads but without cache
        debugWarn('[parseRdfToGraph] Position-aware parsing failed, continuing without cache:', cacheError);
        return quadsToParseResult(quads as N3Quad[]);
      }
    } catch (error) {
      // Fallback to standard parsing if everything fails
      debugWarn('[parseRdfToGraph] Parsing failed, falling back to standard parsing:', error);
    }
  }
  
  // Standard parsing for other formats or fallback
  const quads = await parseRdfToQuads(content, options ?? {});
  return quadsToParseResult(quads as N3Quad[]);
}

const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';

export function getDataProperties(store: Store): DataPropertyInfo[] {
  const result: DataPropertyInfo[] = [];
  const seen = new Set<string>();
  const dpQuads = store.getQuads(null, RDF + 'type', OWL + 'DatatypeProperty', null);
  const OWL_THING = OWL + 'Thing';
  for (const q of dpQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    const subjUri = (subj as { value: string }).value;
    const name = extractLocalName(subjUri);
    if (seen.has(name)) continue;
    seen.add(name);
    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? name;
    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;
    const rangeQuad = store.getQuads(subj, RDFS + 'range', null, null)[0];
    const range = rangeQuad?.object && (rangeQuad.object as { value?: string }).value
      ? (rangeQuad.object as { value: string }).value
      : XSD_NS + 'string';
    
    // Extract domain(s) - rdfs:domain can appear multiple times
    const domainQuads = store.getQuads(subj, RDFS + 'domain', null, null);
    const domains: string[] = [];
    for (const domainQuad of domainQuads) {
      const domainObj = domainQuad.object;
      if (domainObj.termType === 'NamedNode') {
        const domainUri = (domainObj as { value: string }).value;
        // If domain is owl:Thing, it means all classes (empty array)
        if (domainUri !== OWL_THING) {
          const domainName = extractLocalName(domainUri);
          if (!domains.includes(domainName)) {
            domains.push(domainName);
          }
        }
      }
    }
    // If no explicit domain or only owl:Thing, domains array is empty (meaning all classes)
    const isDefinedByQuad = store.getQuads(subj, DataFactory.namedNode(RDFS + 'isDefinedBy'), null, null)[0];
    const isDefinedBy =
      isDefinedByQuad?.object?.termType === 'NamedNode'
        ? (isDefinedByQuad.object as { value: string }).value
        : null;
    result.push({
      name,
      label: String(label),
      comment: comment || undefined,
      range,
      domains,
      uri: subjUri,
      isDefinedBy: isDefinedBy ?? undefined
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Update rdfs:label for a class in the store. localName is the class id (e.g. "FacadeCladding").
 */
export function updateLabelInStore(
  store: Store,
  localName: string,
  newLabel: string
): boolean {
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) !== localName) continue;

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
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  const commentPred = DataFactory.namedNode(RDFS + 'comment');
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) !== localName) continue;

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
  const XSD = 'http://www.w3.org/2001/XMLSchema#';
  const predUri = findLabellablePredicate(store);
  const labellablePredicate = predUri
    ? DataFactory.namedNode(predUri)
    : DataFactory.namedNode('http://example.org/aec-drawing-ontology#labellableRoot');

  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) !== localName) continue;

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
  // Find the class subject
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  let classSubject: import('n3').NamedNode | null = null;
  for (const q of classQuads) {
    const subj = q.subject;
    if (subj.termType !== 'NamedNode') continue;
    if (extractLocalName(subj.value) !== classLocalName) continue;
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

const TURTLE_PREFIXES: Record<string, string> = {
  '': 'http://example.org/aec-drawing-ontology#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

function toClassUri(localName: string): string {
  return BASE_IRI + localName;
}

function getPropertyUri(edgeType: string): string {
  // If edgeType is already a full URI (starts with http:// or https://), return it as-is
  if (edgeType.startsWith('http://') || edgeType.startsWith('https://')) {
    return edgeType;
  }
  return BASE_IRI + edgeType;
}

/** Resolve object property name to full URI from store (so loaded ontologies use their base). */
function getObjectPropertyUriFromStore(store: Store, name: string): string {
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

export function findRestrictionBlank(
  store: Store,
  classLocalName: string,
  propertyLocalName: string,
  targetLocalName: string
): import('n3').BlankNode | null {
  const classUri = toClassUri(classLocalName);
  const subClassQuads = store.getQuads(
    DataFactory.namedNode(classUri),
    DataFactory.namedNode(RDFS + 'subClassOf'),
    null,
    null
  );
  const propUri = getPropertyUri(propertyLocalName);
  const targetUri = toClassUri(targetLocalName);
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
  if (edgeType === 'subClassOf') {
    const subjUri = toClassUri(oldFrom);
    const objUri = toClassUri(oldTo);
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
      DataFactory.namedNode(toClassUri(newFrom)),
      subClassOfPred,
      DataFactory.namedNode(toClassUri(newTo)),
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
 * Derive the identifier that would be used for a new node with the given label.
 * Used by the editor to validate before adding. Must stay in sync with addNodeToStore.
 */
export function deriveNewNodeIdentifier(label: string): string {
  const raw = labelToCamelCaseIdentifier(label) || extractLocalName(label) || 'NewClass';
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
  const subjUri = toClassUri(id);
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
  const subjUri = toClassUri(localName);
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

function ensureHasCardinalityAnnotationProperty(store: Store): void {
  const apUri = DataFactory.namedNode(HAS_CARDINALITY_PROP);
  const existing = store.getQuads(apUri, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), null);
  if (existing.length > 0) return;
  const graph = store.getQuads(null, null, null, null)[0]?.graph ?? DataFactory.defaultGraph();
  store.addQuad(apUri, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'AnnotationProperty'), graph);
  store.addQuad(apUri, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(XSD + 'boolean'), graph);
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
  const OWL_THING_URI = OWL + 'Thing';
  const domainUri = (options?.domain?.trim() ?? '') ? resolveClassUri(store, options.domain!.trim()) : OWL_THING_URI;
  const rangeUri = (options?.range?.trim() ?? '') ? resolveClassUri(store, options.range!.trim()) : OWL_THING_URI;
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'ObjectProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'domain'), DataFactory.namedNode(domainUri), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), DataFactory.namedNode(rangeUri), graph);
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

const OWL_THING_URI = OWL + 'Thing';

/**
 * Resolve a class local name to full URI (from store or BASE_IRI).
 */
function resolveClassUri(store: Store, localName: string): string {
  if (!localName || localName.trim() === '') return OWL_THING_URI;
  const classQuads = store.getQuads(null, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Class'), null);
  for (const cq of classQuads) {
    if (cq.subject.termType === 'NamedNode') {
      const currentUri = (cq.subject as { value: string }).value;
      if (extractLocalName(currentUri) === localName.trim()) return currentUri;
    }
  }
  return BASE_IRI + localName.trim();
}

/**
 * Update rdfs:domain and rdfs:range for an object property in the store.
 * domainName/rangeName are class local names; null or empty means owl:Thing.
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

  const domainUri = (domainName?.trim() ?? '') ? resolveClassUri(store, domainName!) : OWL_THING_URI;
  const rangeUri = (rangeName?.trim() ?? '') ? resolveClassUri(store, rangeName!) : OWL_THING_URI;
  store.addQuad(subject, domainPred, DataFactory.namedNode(domainUri), graph);
  store.addQuad(subject, rangePred, DataFactory.namedNode(rangeUri), graph);
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
 * Add a new data property (owl:DatatypeProperty) to the store.
 * Returns the property localName, or null on failure.
 */
export function addDataPropertyToStore(
  store: Store,
  label: string,
  rangeUri: string,
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
  const rangeNode = DataFactory.namedNode(rangeUri);
  store.addQuad(subject, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'DatatypeProperty'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'label'), DataFactory.literal(label || name), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'domain'), DataFactory.namedNode(OWL + 'Thing'), graph);
  store.addQuad(subject, DataFactory.namedNode(RDFS + 'range'), rangeNode, graph);
  return name;
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
export function removeAnnotationPropertyFromStore(store: Store, propertyName: string): boolean {
  const propUri = BASE_IRI + propertyName;
  const subject = DataFactory.namedNode(propUri);
  const quads = store.getQuads(subject, null, null, null);
  if (quads.length === 0) return false;
  for (const q of quads) store.removeQuad(q);
  return true;
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
 * Update rdfs:range for a data property in the store (datatype URI).
 */
export function updateDataPropertyRangeInStore(
  store: Store,
  propertyName: string,
  rangeUri: string
): boolean {
  const propUri = getDataPropertyUriFromStore(store, propertyName);
  const subject = DataFactory.namedNode(propUri);
  const rangePred = DataFactory.namedNode(RDFS + 'range');
  const rangeQuads = store.getQuads(subject, rangePred, null, null);
  if (rangeQuads.length === 0) return false;
  const graph = rangeQuads[0]?.graph ?? DataFactory.defaultGraph();
  for (const rq of rangeQuads) store.removeQuad(rq);
  store.addQuad(subject, rangePred, DataFactory.namedNode(rangeUri), graph);
  return true;
}

/**
 * Update data property domains in the store.
 * If domains array is empty, sets domain to owl:Thing (all classes).
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
  
  // If domains array is empty, add owl:Thing (default - all classes)
  if (domains.length === 0) {
    store.addQuad(subject, domainPred, DataFactory.namedNode(OWL + 'Thing'), graph);
  } else {
    // Add each domain
    for (const domainName of domains) {
      // Try to find the domain URI (could be base IRI or external)
      let domainUri: string | null = null;
      const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
      for (const cq of classQuads) {
        if (cq.subject.termType === 'NamedNode') {
          const currentUri = (cq.subject as { value: string }).value;
          if (extractLocalName(currentUri) === domainName) {
            domainUri = currentUri;
            break;
          }
        }
      }
      
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

const OWL_ON_DATA_RANGE = OWL + 'onDataRange';

/** Resolve class URI from store by local name (use actual subject from loaded ontology). */
function getClassUriFromStore(store: Store, classLocalName: string): string {
  const classQuads = store.getQuads(null, RDF + 'type', OWL + 'Class', null);
  for (const q of classQuads) {
    if (q.subject.termType !== 'NamedNode') continue;
    const uri = (q.subject as { value: string }).value;
    if (extractLocalName(uri) === classLocalName) return uri;
  }
  return toClassUri(classLocalName);
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
 * Uses the data property's declared range. Returns true on success.
 */
export function addDataPropertyRestrictionToClass(
  store: Store,
  classLocalName: string,
  dataPropName: string,
  cardinality?: { minCardinality?: number | null; maxCardinality?: number | null }
): boolean {
  if (findDataRestrictionBlank(store, classLocalName, dataPropName)) return false;
  const dataProps = getDataProperties(store);
  const dp = dataProps.find((p) => p.name === dataPropName);
  const rangeUri = dp?.range ?? XSD_NS + 'string';
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
  const blank = new BlankNode();
  const min = cardinality?.minCardinality;
  const max = cardinality?.maxCardinality;
  store.addQuad(DataFactory.namedNode(classUri), DataFactory.namedNode(RDFS + 'subClassOf'), blank, graph);
  store.addQuad(blank, DataFactory.namedNode(RDF + 'type'), DataFactory.namedNode(OWL + 'Restriction'), graph);
  store.addQuad(blank, DataFactory.namedNode(OWL + 'onProperty'), DataFactory.namedNode(propUri), graph);
  store.addQuad(blank, DataFactory.namedNode(OWL_ON_DATA_RANGE), DataFactory.namedNode(rangeUri), graph);
  if (min != null && max != null && min === max) {
    store.addQuad(blank, DataFactory.namedNode(OWL + 'cardinality'), DataFactory.literal(min, DataFactory.namedNode(XSD_NS + 'nonNegativeInteger')), graph);
  } else {
    if (min != null) store.addQuad(blank, DataFactory.namedNode(OWL + 'minCardinality'), DataFactory.literal(min, DataFactory.namedNode(XSD_NS + 'nonNegativeInteger')), graph);
    if (max != null) store.addQuad(blank, DataFactory.namedNode(OWL + 'maxCardinality'), DataFactory.literal(max, DataFactory.namedNode(XSD_NS + 'nonNegativeInteger')), graph);
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
    const minQ = store.getQuads(obj, OWL + 'minCardinality', null, null)[0];
    const maxQ = store.getQuads(obj, OWL + 'maxCardinality', null, null)[0];
    const cardQ = store.getQuads(obj, OWL + 'cardinality', null, null)[0];
    const toInt = (quad: import('n3').Quad | undefined): number | null =>
      quad?.object?.value != null ? parseInt(String(quad.object.value), 10) : null;
    let minCard: number | null = toInt(minQ);
    let maxCard: number | null = toInt(maxQ);
    const n = toInt(cardQ);
    if (n !== null && !isNaN(n)) {
      minCard = n;
      maxCard = n;
    }
    result.push({
      propertyName: propName,
      minCardinality: minCard ?? undefined,
      maxCardinality: maxCard ?? undefined,
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
  if (edgeType === 'subClassOf') {
    // subClassOf is not a restriction, it's a direct relationship
    const subjUri = toClassUri(from);
    const objUri = toClassUri(to);
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
    const blank = new BlankNode();
    const fromUri = DataFactory.namedNode(toClassUri(from));
    const propUri = DataFactory.namedNode(getPropertyUri(edgeType));
    const toUri = DataFactory.namedNode(toClassUri(to));
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
  const fromUri = toClassUri(from);
  const toUri = toClassUri(to);
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
  if (edgeType === 'subClassOf') {
    // subClassOf is not a restriction, it's a direct relationship
    const subjUri = toClassUri(from);
    const objUri = toClassUri(to);
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
  const fromUri = DataFactory.namedNode(toClassUri(from));
  const subClassOfQuads = store.getQuads(fromUri, DataFactory.namedNode(RDFS + 'subClassOf'), blank, null);
  for (const q of subClassOfQuads) store.removeQuad(q);
  const blankQuads = store.getQuads(blank, null, null, null);
  for (const q of blankQuads) store.removeQuad(q);
  const blankAsObjQuads = store.getQuads(null, null, blank, null);
  for (const q of blankAsObjQuads) store.removeQuad(q);
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
  
  if (edgeType === 'subClassOf') {
    const subjUri = toClassUri(from);
    const objUri = toClassUri(to);
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
    const fromUri = DataFactory.namedNode(toClassUri(from));
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
  const fromUri = toClassUri(from);
  const toUri = toClassUri(to);
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
  const mainBase = getMainOntologyBase(store) ?? BASE_IRI;
  const base = mainBase.endsWith('#') ? mainBase : mainBase + '#';
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
  // Use class namespace (default ontology #) so serialization uses :name not <...#Ontology#name>
  const ns = getClassNamespace(store) ?? BASE_IRI;
  const base = ns.endsWith('#') ? ns : ns + '#';
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
  const propUri = getPropertyUri(propertyName);
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

/**
 * Serialize the store to Turtle string with section dividers and spacing.
 * @param originalTtlString Optional original TTL string to preserve format (colon vs base notation)
 * @param originalFileCache Optional original file cache for source preservation (idempotent round-trips)
 * @param useCacheBasedReconstruction If true and cache is available, use cache-based reconstruction (default: false)
 */
import type { SerializerType } from './storage';

// Re-export for convenience
export type { SerializerType };

export function storeToTurtle(
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
    return reconstructFromCache(store, originalFileCache, externalRefs);
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
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>
): Promise<string> {
  const startTime = Date.now();
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
      list.push(quad);
      currentQuadsBySubject.set(subjectUri, list);
    }
  }
  
  // Extract prefix map for resolving prefixed names
  const prefixMap = new Map<string, string>();
  if (cache.headerSection) {
    for (const block of cache.headerSection.blocks) {
      if (block.originalText) {
        const prefixMatch = block.originalText.match(/@prefix\s+(\w+):\s*<([^>]+)>/);
        if (prefixMatch) {
          prefixMap.set(prefixMatch[1], prefixMatch[2]);
        }
        const emptyPrefixMatch = block.originalText.match(/@prefix\s+:\s*<([^>]+)>/);
        if (emptyPrefixMatch) {
          prefixMap.set('', emptyPrefixMatch[1]);
        }
      }
    }
  }
  
  const resolvePrefixedName = (prefixedName: string): string | null => {
    if (prefixedName.startsWith('<') && prefixedName.endsWith('>')) {
      return prefixedName.slice(1, -1);
    }
    if (prefixedName.startsWith(':')) {
      const baseUri = prefixMap.get('');
      if (baseUri) {
        const resolved = baseUri + prefixedName.slice(1);
        debugLog('[reconstructFromCache] Resolved prefixed name:', prefixedName, '->', resolved);
        return resolved;
      }
      debugWarn('[reconstructFromCache] Failed to resolve prefixed name (no base URI):', prefixedName);
    } else if (prefixedName.includes(':')) {
      const [prefix, localName] = prefixedName.split(':', 2);
      const baseUri = prefixMap.get(prefix);
      if (baseUri) {
        const resolved = baseUri + localName;
        debugLog('[reconstructFromCache] Resolved prefixed name:', prefixedName, '->', resolved);
        return resolved;
      }
      debugWarn('[reconstructFromCache] Failed to resolve prefixed name (prefix not found):', prefixedName, 'prefix:', prefix);
    }
    debugWarn('[reconstructFromCache] Failed to resolve prefixed name (no match):', prefixedName);
    return null;
  };
  
  // Detect modifications by comparing current store with cache
  const modifiedBlocks: StatementBlock[] = [];
  
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
                const origBlankId = ((origQuad.object as { id: string }).id);
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
                  const origBlankId = (q.object as { id: string }).id;
                  originalBlankNodeIds.add(origBlankId);
                }
                if (q.subject.termType === 'BlankNode') {
                  const origBlankId = (q.subject as { id: string }).id;
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
    
    // Compare quads - check if they're different
    // IMPORTANT: Compare BEFORE updating block.quads, otherwise isModified will always be false
    const originalQuads = [...block.quads]; // Create a copy to avoid mutation issues
    const isModified = quadsAreDifferent(originalQuads, currentQuads);
    
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
    
    // Check if block has blank node quads (where blank node is subject)
    // If it does, we need to serialize it even if not modified, to ensure blank node IDs match current store
    const hasBlankNodeQuads = currentQuads.some(q => q.subject.termType === 'BlankNode');
    
    if (block.subject && block.subject.includes('DrawingSheet')) {
      debugLog('[reconstructFromCache] DrawingSheet - Reached point before creating modifiedBlock');
      const blankAsSubject = currentQuads.filter(q => q.subject.termType === 'BlankNode').length;
      debugLog('[reconstructFromCache] DrawingSheet - Before creating modifiedBlock:');
      debugLog('[reconstructFromCache] DrawingSheet - currentQuads.length:', currentQuads.length);
      debugLog('[reconstructFromCache] DrawingSheet - blank nodes as subjects:', blankAsSubject);
      debugLog('[reconstructFromCache] DrawingSheet - isModified:', isModified);
      debugLog('[reconstructFromCache] DrawingSheet - hasBlankNodeQuads:', hasBlankNodeQuads);
    }
    
    if (isModified || hasBlankNodeQuads) {
      const modifiedBlock: StatementBlock = {
        ...block,
        quads: currentQuads, // Use currentQuads which includes updated label and all blank node quads
        isModified: isModified || hasBlankNodeQuads // Mark as modified if quads changed OR if has blank node quads
      };
      modifiedBlocks.push(modifiedBlock);
      if (block.subject && block.subject.includes('DrawingSheet')) {
        const blankAsSubject = modifiedBlock.quads.filter(q => q.subject.termType === 'BlankNode').length;
        debugLog('[reconstructFromCache] DrawingSheet - After creating modifiedBlock:');
        debugLog('[reconstructFromCache] DrawingSheet - modifiedBlock.quads.length:', modifiedBlock.quads.length);
        debugLog('[reconstructFromCache] DrawingSheet - blank nodes as subjects in modifiedBlock.quads:', blankAsSubject);
      }
      if (hasBlankNodeQuads && !isModified) {
        debugLog('[reconstructFromCache] Block marked as modified due to blank node quads (to ensure IDs match):', block.subject, 'type:', block.type);
      } else {
        debugLog('[reconstructFromCache] Block marked as modified:', block.subject, 'type:', block.type);
      }
    } else if (block.type === 'Class' && currentQuads.length > 0) {
      // ARCHITECTURAL FIX: For class blocks that aren't modified and don't have blank node quads,
      // still update block.quads with currentQuads for consistency
      // But we don't mark as modified since the quads are semantically the same
      block.quads = currentQuads;
    }
  }
  
  // Try line-level replacement first for simple changes
  const propertyLevelChanges = detectPropertyLevelChanges(store, cache);
  debugLog('[reconstructFromCache] detectPropertyLevelChanges returned', propertyLevelChanges.size, 'changes');
  if (propertyLevelChanges.size > 0) {
    for (const [propLine, changeSet] of propertyLevelChanges.entries()) {
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
  let canUseTargetedReplacement = allChangesSimple && propertyLevelChanges.size > 0;
  if (canUseTargetedReplacement) {
    // Check which blocks have changes and which ones have blank node properties
    const blocksWithChanges = new Set<string>();
    const blocksWithBlankNodes = new Set<string>();
    
    for (const changeSet of propertyLevelChanges.values()) {
      // Find which block this property line belongs to
      for (const block of cache.statementBlocks) {
        if (block.position.start <= changeSet.propertyLine.position.start && 
            block.position.end >= changeSet.propertyLine.position.end) {
          blocksWithChanges.add(block.subject || '');
          break;
        }
      }
    }
    
    // For each block with changes, check if it has any blank node properties
    for (const blockSubject of blocksWithChanges) {
      const block = cache.statementBlocks.find(b => b.subject === blockSubject);
      if (block) {
        // Check if block has any property lines with blank nodes (multi-line properties)
        try {
          const propertyLines = extractPropertyLines(block, cache);
          const hasBlankNodeProperties = propertyLines.some(propLine => 
            propLine.isMultiLine || propLine.quads.some(q => q.object.termType === 'BlankNode')
          );
          if (hasBlankNodeProperties) {
            debugLog('[reconstructFromCache] Block', blockSubject, 'has blank node properties, will use block-level serialization for this block');
            blocksWithBlankNodes.add(blockSubject);
          }
        } catch (error) {
          // If property line extraction fails, fall back to block-level for this block
          debugWarn('[reconstructFromCache] Failed to extract property lines for', blockSubject, ', will use block-level serialization:', error);
          blocksWithBlankNodes.add(blockSubject);
        }
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
  if (original.length !== current.length) {
    debugLog('[quadsAreDifferent] Different lengths:', original.length, 'vs', current.length);
    return true;
  }
  
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
      const [subj, pred, obj] = sig.split('|');
      if (pred.includes('label')) {
        debugLog('[quadsAreDifferent] Label quad difference detected - original:', obj, 'current labels:', Array.from(currentSignatures).filter(s => s.split('|')[1].includes('label')).map(s => s.split('|')[2]));
      }
      return true;
    }
  }
  
  return false;
}
