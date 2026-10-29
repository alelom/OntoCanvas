/**
 * Building the graph an ontology is drawn from: the ParseResult of a store, and the entry points that parse a file (any
 * RDF format, Turtle with its source cache) into one. Moved out of src/parser.ts unchanged (#193, step 3).
 */

import type { AnnotationPropertyInfo, DataPropertyInfo, GraphData, GraphEdge, GraphNode, ObjectPropertyInfo } from '../types';
import { BASE_IRI, OWL, RDFS, isBlankNode } from './vocab';
import { DataFactory, type Quad as N3Quad, Store } from 'n3';
import { type OriginalFileCache, parseTurtleWithPositions } from '../rdf/sourcePreservation';
import { type RdfTerm, extractClassExpressionGroups } from '../rdf/classExpressions';
import { debugLog, debugWarn, isDebugMode } from '../utils/debug';
import { exampleImagesOf } from '../lib/exampleImages';
import { extractLocalName } from '../utils/localName';
import { getAnnotationProperties } from './readAnnotationProperties';
import { getDataProperties } from './readDataProperties';
import { getMainOntologyBase } from './ontologyBase';
import { isExternalPropertyUri } from '../rdf/propertyNamespace';
import { isNodeOf, rankedClassUris } from '../graph/classNodeIds';
import { mergeRestrictionKinds, readObjectRestriction } from '../rdf/restrictions';
import { parseRdfToQuadsWithPrefixes } from '../rdf/parseRdfToQuads';
import { addDataPropertyRestrictions } from './dataPropertyRestrictions';
import { buildObjectPropertyEdges } from './objectPropertyEdges';

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
  /** The prefixes the file declares, as the parser read them (prefix → namespace, `''` for the default); see parseRdfToQuadsWithPrefixes. */
  prefixes?: Record<string, string>;
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
  /** Full IRI of each class by its node id (local name), so a same-named class elsewhere isn't taken for it. */
  const classUriByName = new Map<string, string>();
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

  // Get all OWL classes. The ontology's own classes claim their local names first (#164): a stub of an external
  // class with the same name (std:Party next to :Party) is then drawn by the external expansion, under its full IRI.
  const classUris = rankedClassUris(store);
  for (const uri of classUris) {
    const subj = DataFactory.namedNode(uri);
    if (excludeNamespaces.some((ns) => uri.startsWith(ns))) continue;
    const localName = extractLocalName(uri);
    if (seenClasses.has(localName)) continue;
    seenClasses.add(localName);
    classUriByName.set(localName, uri);

    const labelQuad = store.getQuads(subj, RDFS + 'label', null, null)[0];
    const label = labelQuad?.object?.value ?? localName;

    const commentQuad = store.getQuads(subj, RDFS + 'comment', null, null)[0];
    const comment = commentQuad?.object?.value != null ? String(commentQuad.object.value) : null;

    // rdfs:isDefinedBy — set on classes declared locally but defined elsewhere (typing stubs).
    const isDefinedByQuad = store.getQuads(subj, RDFS + 'isDefinedBy', null, null)[0];
    const isDefinedBy =
      isDefinedByQuad?.object?.termType === 'NamedNode'
        ? (isDefinedByQuad.object as { value: string }).value
        : undefined;

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
        const b = str === 'true' ? true : str === 'false' ? false : null;
        annotations[predName] = b;
        if (predName === 'labellableRoot') labellableRoot = b;
      } else {
        annotations[predName] = obj.value != null ? String(obj.value) : null;
      }
    }

    // Read by property IRI, not the class's namespace: ADIRO modules share one exampleImage (#142).
    const exampleImages = exampleImagesOf(store, uri);

    nodes.push({
      id: localName,
      label,
      labellableRoot,
      comment: comment || undefined,
      annotations,
      dataPropertyRestrictions: [],
      exampleImages: exampleImages.length > 0 ? exampleImages : undefined,
      uri,
      isDefinedBy,
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
    if (!isNodeOf(classUriByName, subjUri)) continue;

    if (obj.termType === 'NamedNode') {
      const objName = extractLocalName(obj.value);
      // By IRI, not local name: std:Party is not the local Party (#164)
      if (!isNodeOf(classUriByName, obj.value)) continue;
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
        
        // Which kind of restriction this is, and the named class its edge points to (#63): ∃ some, ∀ only,
        // ∋ hasValue (the individual's class), ⟲ hasSelf (the subject), qualified/unqualified cardinality.
        const restriction = onProperty ? readObjectRestriction(store, candidateBlank as RdfTerm, subjUri) : null;
        if (!onProperty || !restriction) {
          continue; // Skip this blank node, continue to next one
        }
        const targetUri = restriction.targetUri;
        const targetName = extractLocalName(targetUri);
        
        // Check the target is this ontology's class: an imported class with the same local name (lib:Book next
        // to :Book) is drawn by the external expansion instead
        if (classUriByName.get(targetName) !== targetUri) {
          continue; // Skip this blank node, continue to next one
        }
        
        // Preserve full URI for external properties, use local name for local properties
        const propUri = (onProperty.object as { value: string }).value;
        const isExternalProperty = isExternalPropertyUri(propUri, getMainOntologyBase(store), BASE_IRI);
        const propName = isExternalProperty ? propUri : extractLocalName(propUri);

        // Create a unique key for this restriction to avoid processing duplicates (per kind, so a ∀ and a
        // ∃ on the same property and class are both read, then merged into one edge below)
        const restrictionKey = `${subjName}:${propUri}:${targetUri}:${restriction.kind}`;
        if (processedRestrictions.has(restrictionKey)) {
          continue; // Already processed this restriction
        }
        processedRestrictions.add(restrictionKey);

        // Debug: Check if this is the describes restriction
        if (propUri === describesPropertyUri || propUri.includes('describes')) {
          foundDescribesRestriction = true;
        }

        // Only ∃ and qualified restrictions carry an implied [1..*]; owl:cardinality (unqualified, exact) is
        // read like qualifiedCardinality.
        const exactCard = qualCard ?? allBlankQuads.find(q => (q.predicate as { value: string }).value === OWL + 'cardinality');
        const cardinality = parseCardinalityFromRestriction(
          minQual, maxQual, exactCard, minCard, maxCard,
          restriction.kind === 'some' ? someValuesFrom : undefined, propName,
          restriction.kind === 'qualified' ? onClass : undefined
        );

        const key = `${subjName}->${targetName}:${propName}`;
        // If a domain/range edge already exists, replace it with the restriction edge
        // (restrictions have cardinality and are more specific)
        const existingEdgeIndex = edges.findIndex(
          (e) => e.from === subjName && e.to === targetName && e.type === propName
        );
        
        // A second restriction on the same property and class (e.g. ∀ next to ∃) joins the existing edge.
        const existingRestriction = existingEdgeIndex >= 0 && edges[existingEdgeIndex].isRestriction ? edges[existingEdgeIndex] : null;
        if (existingRestriction) {
          existingRestriction.restrictionKinds = mergeRestrictionKinds(existingRestriction.restrictionKinds, restriction.kind);
          if (existingRestriction.minCardinality == null && existingRestriction.maxCardinality == null) {
            Object.assign(existingRestriction, cardinality);
          }
          if (restriction.value) existingRestriction.restrictionValue = restriction.value;
          continue;
        }

        const restrictionEdge: GraphEdge = { 
          from: subjName, 
          to: targetName, 
          type: propName, 
          ...cardinality,
          isRestriction: true, // Mark as restriction (from OWL restriction)
          restrictionKinds: [restriction.kind],
          ...(restriction.value ? { restrictionValue: restriction.value } : {}),
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

  const dataProps = getDataProperties(store);
  const objectProps = buildObjectPropertyEdges(store, edges, classUriByName, seenPairs);

  addDataPropertyRestrictions(store, nodes, dataProps);

  const classExpressions = extractClassExpressionGroups(store, classUriByName);

  return {
    graphData: { nodes, edges, classExpressions },
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
export function quadsToParseResult(quads: N3Quad[], originalFileCache?: OriginalFileCache, prefixes?: Record<string, string>): ParseResult {
  return { ...buildParseResultFromStore(new Store(quads), undefined, originalFileCache), prefixes };
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
    const { quads, prefixes } = await parseRdfToQuadsWithPrefixes(ttlString, { contentType: 'text/turtle' });
    
      // Then do position-aware parsing to build cache
      try {
        const { cache } = await parseTurtleWithPositions(ttlString, quads as N3Quad[]);
        return quadsToParseResult(quads as N3Quad[], cache, prefixes);
    } catch (cacheError) {
      // If position tracking fails, still return quads but without cache
      debugWarn('[parseTtlToGraph] Position-aware parsing failed, continuing without cache:', cacheError);
      return quadsToParseResult(quads as N3Quad[], undefined, prefixes);
    }
  } catch (error) {
    // Fallback to standard parsing if everything fails
    debugWarn('[parseTtlToGraph] Parsing failed, falling back to standard parsing:', error);
    const { quads, prefixes } = await parseRdfToQuadsWithPrefixes(ttlString, { contentType: 'text/turtle' });
    return quadsToParseResult(quads as N3Quad[], undefined, prefixes);
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
      const { quads, prefixes } = await parseRdfToQuadsWithPrefixes(content, options ?? {});
      
      // Then do position-aware parsing to build cache
      try {
        const { cache } = await parseTurtleWithPositions(content, quads as N3Quad[]);
        return quadsToParseResult(quads as N3Quad[], cache, prefixes);
      } catch (cacheError) {
        // If position tracking fails, still return quads but without cache
        debugWarn('[parseRdfToGraph] Position-aware parsing failed, continuing without cache:', cacheError);
        return quadsToParseResult(quads as N3Quad[], undefined, prefixes);
      }
    } catch (error) {
      // Fallback to standard parsing if everything fails
      debugWarn('[parseRdfToGraph] Parsing failed, falling back to standard parsing:', error);
    }
  }
  
  // Standard parsing for other formats or fallback
  const { quads, prefixes } = await parseRdfToQuadsWithPrefixes(content, options ?? {});
  return quadsToParseResult(quads as N3Quad[], undefined, prefixes);
}
