/**
 * Building the graph an ontology is drawn from: the ParseResult of a store, and the entry points that parse a file (any
 * RDF format, Turtle with its source cache) into one. Moved out of src/parser.ts unchanged (#193, step 3).
 */

import type { AnnotationPropertyInfo, DataPropertyInfo, GraphData, GraphEdge, GraphNode, ObjectPropertyInfo } from '../types';
import { BASE_IRI, OWL, RDF, RDFS, isBlankNode } from './vocab';
import { DataFactory, type Quad as N3Quad, Store } from 'n3';
import { type OriginalFileCache, parseTurtleWithPositions } from '../rdf/sourcePreservation';
import { type RdfTerm, extractClassExpressionGroups, resolveExpressionClassUris } from '../rdf/classExpressions';
import { debugLog, debugWarn, isDebugMode } from '../utils/debug';
import { describeDataRange } from '../rdf/dataRanges';
import { exampleImagesOf } from '../lib/exampleImages';
import { extractLocalName } from '../utils/localName';
import { findInheritedRange, getAnnotationProperties, getDataProperties, getMainOntologyBase, getObjectProperties, resolveDatatypeRangeValue } from './readOntology';
import { isExternalPropertyUri } from '../rdf/propertyNamespace';
import { isNodeOf, rankedClassUris } from '../graph/classNodeIds';
import { mergeRestrictionKinds, readObjectRestriction, readRestrictionCardinality } from '../rdf/restrictions';
import { parseRdfToQuadsWithPrefixes } from '../rdf/parseRdfToQuads';

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

  const objectProps = getObjectProperties(store);
  
  // Track object properties referenced in restrictions that might not be in the store
  const referencedObjectPropUris = new Set<string>();
  for (const q of store.getQuads(null, RDFS + 'subClassOf', null, null)) {
    const obj = q.object;
    if (!isBlankNode(obj)) continue;
    const onProperty = store.getQuads(obj, OWL + 'onProperty', null, null)[0];
    if (!onProperty || onProperty.object.termType !== 'NamedNode') continue;
    // A data restriction names a data property, listed with the data properties instead (#100).
    if (store.getQuads(obj, OWL + 'onDataRange', null, null).length > 0) continue;
    const propUri = (onProperty.object as { value: string }).value;
    if (store.getQuads(DataFactory.namedNode(propUri), RDF + 'type', OWL + 'DatatypeProperty', null).length > 0) continue;
    referencedObjectPropUris.add(propUri);
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
    
    // Use full URI for external properties, local name for local properties — decided exactly as for
    // restriction edges, so one property is one edge type (#87).
    const isExternalProperty = isExternalPropertyUri(propUri, getMainOntologyBase(store), BASE_IRI);
    const propName = isExternalProperty ? propUri : op.name;
    
    // Collect valid domains and ranges
    const validDomains: string[] = [];
    // Classes reached through an anonymous expression rather than named directly: their edges are
    // marked fromClassExpression, so the editor won't write them back as a plain pair (#58).
    const expressionDomains = new Set<string>();
    let hasOwlThingDomain = false;
    for (const domainQuad of domainQuads) {
      const domObj = domainQuad.object;
      if (domObj.termType === 'NamedNode') {
        const domainUri = (domObj as { value: string }).value;
        if (domainUri === OWL_THING) {
          hasOwlThingDomain = true;
          // When domain is owl:Thing, skip creating domain/range edges
          // Edges should only come from actual restrictions, not from owl:Thing domain/range
          break;
        }
        const domainName = extractLocalName(domainUri);
        if (isNodeOf(classUriByName, domainUri)) {
          validDomains.push(domainName);
        }
      } else if (domObj.termType === 'BlankNode') {
        // An anonymous class expression domain (union / intersection / complement / oneOf): flatten to
        // the classes it is drawn against so the relationship is visible. The expression itself is
        // shown by the overlay mark (issues #59-#62).
        for (const uri of resolveExpressionClassUris(store, domObj as RdfTerm)) {
          const name = extractLocalName(uri);
          if (!isNodeOf(classUriByName, uri)) continue;
          expressionDomains.add(name);
          if (!validDomains.includes(name)) validDomains.push(name);
        }
      }
    }
    
    // Collect valid ranges
    const validRanges: string[] = [];
    const expressionRanges = new Set<string>();
    let hasOwlThingRange = false;
    for (const rangeQuad of rangeQuads) {
      const rangeObj = rangeQuad.object;
      if (rangeObj.termType === 'NamedNode') {
        const rangeUri = (rangeObj as { value: string }).value;
        if (rangeUri === OWL_THING) {
          hasOwlThingRange = true;
          // When range is owl:Thing, skip creating domain/range edges
          // Edges should only come from actual restrictions, not from owl:Thing domain/range
          break;
        }
        const rangeName = extractLocalName(rangeUri);
        if (isNodeOf(classUriByName, rangeUri)) {
          validRanges.push(rangeName);
        }
      } else if (rangeObj.termType === 'BlankNode') {
        // An anonymous class expression range (union / intersection / complement / oneOf): flatten to
        // the classes it is drawn against so the relationships are visible. The expression itself is
        // shown by the overlay mark (issues #59-#62).
        for (const uri of resolveExpressionClassUris(store, rangeObj as RdfTerm)) {
          const name = extractLocalName(uri);
          if (!isNodeOf(classUriByName, uri)) continue;
          expressionRanges.add(name);
          if (!validRanges.includes(name)) validRanges.push(name);
        }
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
        const fromClassExpression = expressionDomains.has(domainName) || expressionRanges.has(rangeName);
        // A restriction edge already drawn for this pair (self-loops included) stands in for the expression's
        // edge: deleting it would also remove the domain/range it shares, so it is marked too.
        if (fromClassExpression) {
          const restrictionEdge = edges.find((e) => e.from === domainName && e.to === rangeName && e.type === propName);
          if (restrictionEdge) restrictionEdge.fromClassExpression = true;
        }

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
            ...(fromClassExpression ? { fromClassExpression: true } : {}),
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
    // Qualified (OWL 2, the form used with owl:onDataRange) or unqualified cardinality (#63).
    const { min: minCard, max: maxCard } = readRestrictionCardinality(store, obj as RdfTerm);
    const subjName = extractLocalName((subj as { value: string }).value);
    const node = nodes.find((n) => n.id === subjName);
    if (node && node.dataPropertyRestrictions) {
      node.dataPropertyRestrictions.push({
        propertyName: propName,
        minCardinality: minCard ?? undefined,
        maxCardinality: maxCard ?? undefined,
        onDataRange: (onDataRange.object as { value?: string }).value,
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
      let range: string | null = null;
      let rangeExpression: string | undefined;
      let domains: string[] = [];
      let hasGlobalDomain = false;
      
      for (const q of propQuads) {
        const pred = (q.predicate as { value?: string }).value;
        if (pred === RDFS + 'label') {
          label = (q.object as { value?: string }).value ?? propName;
        } else if (pred === RDFS + 'comment') {
          comment = (q.object as { value?: string }).value ?? undefined;
        } else if (pred === RDFS + 'range') {
          range = resolveDatatypeRangeValue(store, q.object as RdfTerm);
          rangeExpression = describeDataRange(store, q.object as RdfTerm) ?? undefined;
        } else if (pred === RDFS + 'domain') {
          const domainUri = (q.object as { value?: string }).value;
          if (domainUri === OWL + 'Thing') {
            hasGlobalDomain = true;
          } else if (domainUri) {
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
        if (mainBaseNormalized && !propUri.startsWith(mainBaseNormalized) && !propUri.startsWith(mainBase!)) {
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
        ...(rangeExpression ? { rangeExpression } : {}),
        inheritedRange: range ? null : findInheritedRange(store, propUri),
        domains,
        hasGlobalDomain,
        uri: propUri,
        isDefinedBy,
      });
    }
  }

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
