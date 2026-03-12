/**
 * External expansion: add nodes and edges for classes (and datatype properties) from external ontologies
 * so they can be visualized with 50% opacity and "Open external ontology" in the context menu.
 * Does not modify the parser or rawData; produces an expanded graph for display only.
 */

import { DataFactory, type Store } from 'n3';
import type { GraphData, GraphEdge, GraphNode } from '../types';
import type { ExternalOntologyReference } from '../storage';
import type { ExternalNodeLayout } from '../storage';
import { getMainOntologyBase, getObjectProperties, extractLocalName, findRestrictionBlank, toClassUri } from '../parser';
import { getCachedExternalClasses } from '../externalOntologySearch';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

export interface ExternalExpansionOptions {
  displayExternalReferences: boolean;
  externalNodeLayout: ExternalNodeLayout;
  nodePositions?: Record<string, { x: number; y: number }>;
}

/**
 * Normalize a URL/IRI for matching (no trailing # or /).
 */
function normalizeRefUrl(url: string): string {
  let u = url.endsWith('#') ? url.slice(0, -1) : url;
  u = u.replace(/\/$/, '');
  return u;
}

/**
 * Get the namespace of a class URI (with # if present).
 */
function getNamespace(uri: string): string {
  if (uri.includes('#')) return uri.slice(0, uri.indexOf('#') + 1);
  const lastSlash = uri.lastIndexOf('/');
  return lastSlash >= 0 ? uri.slice(0, lastSlash + 1) : uri;
}

/**
 * Find the external ref whose URL matches the namespace of the given URI.
 * Sorts refs by URL length (longest first) to prefer more specific matches.
 */
function findRefForUri(uri: string, refs: ExternalOntologyReference[]): ExternalOntologyReference | null {
  const ns = getNamespace(uri);
  const nsNormalized = normalizeRefUrl(ns);
  
  // Sort refs by URL length (longest first) to prefer more specific matches
  const sortedRefs = [...refs].sort((a, b) => {
    const aUrl = normalizeRefUrl(a.url);
    const bUrl = normalizeRefUrl(b.url);
    return bUrl.length - aUrl.length; // Longer URLs first
  });
  
  for (const ref of sortedRefs) {
    const refNorm = normalizeRefUrl(ref.url);
    // Exact match (with or without trailing slash/#)
    if (nsNormalized === refNorm) return ref;
    // Check if namespace starts with ref URL (ref is a prefix of namespace)
    if (nsNormalized.startsWith(refNorm + '/') || nsNormalized.startsWith(refNorm + '#')) return ref;
    // Check if ref URL starts with namespace (namespace is a prefix of ref - less common)
    if (refNorm.startsWith(nsNormalized + '/') || refNorm.startsWith(nsNormalized + '#')) return ref;
  }
  return null;
}

/**
 * Check if a URI belongs to the main ontology (local).
 */
function isLocalUri(uri: string, mainBase: string | null): boolean {
  if (!mainBase) return false;
  return uri === mainBase || uri.startsWith(mainBase) || uri === mainBase.slice(0, -1);
}

/**
 * Get label for an external class from cache, or fallback to local name.
 */
function getExternalClassLabel(
  uri: string,
  cachedClasses: { uri: string; label: string }[] | undefined
): string {
  if (cachedClasses) {
    const c = cachedClasses.find((x) => x.uri === uri);
    if (c) return c.label;
  }
  return extractLocalName(uri);
}

/**
 * Expand rawData with external ontology nodes and edges.
 * Only includes external classes that are referenced by object property domain/range in the current ontology
 * and that belong to an external ref with a valid URL in the list.
 */
export function expandWithExternalRefs(
  rawData: GraphData,
  store: Store,
  externalRefs: ExternalOntologyReference[],
  options: ExternalExpansionOptions
): GraphData {
  if (!options.displayExternalReferences || externalRefs.length === 0) {
    return rawData;
  }

  const mainBase = getMainOntologyBase(store);
  const localNodeIds = new Set(rawData.nodes.map((n) => n.id));
  const objectProps = getObjectProperties(store);
  
  // Build a comprehensive set of edge keys that handles both URI and local name formats
  // This prevents expandWithExternalRefs from creating duplicate edges when edges are restored during undo
  const existingEdgeKeys = new Set<string>();
  const existingEdgesByKey = new Map<string, { from: string; to: string; type: string }>();
  rawData.edges.forEach((e) => {
    // Add the exact key
    const exactKey = `${e.from}->${e.to}:${e.type}`;
    existingEdgeKeys.add(exactKey);
    existingEdgesByKey.set(exactKey, { from: e.from, to: e.to, type: e.type });
    
    // Also add variations for URI/local name matching to catch duplicates with different type formats
    const op = objectProps.find((p) => p.name === e.type || p.uri === e.type);
    if (op) {
      if (op.uri && op.uri !== e.type) {
        const uriKey = `${e.from}->${e.to}:${op.uri}`;
        existingEdgeKeys.add(uriKey);
        existingEdgesByKey.set(uriKey, { from: e.from, to: e.to, type: e.type });
      }
      if (op.name && op.name !== e.type) {
        const nameKey = `${e.from}->${e.to}:${op.name}`;
        existingEdgeKeys.add(nameKey);
        existingEdgesByKey.set(nameKey, { from: e.from, to: e.to, type: e.type });
      }
    }
    // Also add variations for from/to using both local names and URIs
    // Extract local names in case we need to match against URI format
    const fromLocal = e.from.includes('#') ? e.from.split('#').pop() : e.from.includes('/') ? e.from.split('/').pop() : e.from;
    const toLocal = e.to.includes('#') ? e.to.split('#').pop() : e.to.includes('/') ? e.to.split('/').pop() : e.to;
    if (fromLocal !== e.from) {
      const fromLocalKey = `${fromLocal}->${e.to}:${e.type}`;
      existingEdgeKeys.add(fromLocalKey);
      existingEdgesByKey.set(fromLocalKey, { from: e.from, to: e.to, type: e.type });
    }
    if (toLocal !== e.to) {
      const toLocalKey = `${e.from}->${toLocal}:${e.type}`;
      existingEdgeKeys.add(toLocalKey);
      existingEdgesByKey.set(toLocalKey, { from: e.from, to: e.to, type: e.type });
    }
    if (fromLocal !== e.from && toLocal !== e.to) {
      const bothLocalKey = `${fromLocal}->${toLocal}:${e.type}`;
      existingEdgeKeys.add(bothLocalKey);
      existingEdgesByKey.set(bothLocalKey, { from: e.from, to: e.to, type: e.type });
    }
  });

  const externalClassNodes = new Map<string, GraphNode>();
  const newEdges: GraphEdge[] = [];

  const RDFS_DOMAIN = RDFS + 'domain';
  const RDFS_RANGE = RDFS + 'range';

  for (const op of objectProps) {
    const propUri = op.uri ?? (op.name.startsWith('http') ? op.name : null);
    if (!propUri) continue;
    const propNode = DataFactory.namedNode(propUri);
    const domainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS_DOMAIN), null, null);
    const rangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS_RANGE), null, null);

    for (const dq of domainQuads) {
      if (dq.object.termType !== 'NamedNode') continue;
      const domainUri = (dq.object as { value: string }).value;
      for (const rq of rangeQuads) {
        if (rq.object.termType !== 'NamedNode') continue;
        const rangeUri = (rq.object as { value: string }).value;

        const domainLocal = extractLocalName(domainUri);
        const rangeLocal = extractLocalName(rangeUri);
        const domainIsLocal = localNodeIds.has(domainLocal) || isLocalUri(domainUri, mainBase);
        const rangeIsLocal = localNodeIds.has(rangeLocal) || isLocalUri(rangeUri, mainBase);

        const fromId = domainIsLocal ? domainLocal : domainUri;
        const toId = rangeIsLocal ? rangeLocal : rangeUri;
        
        // CRITICAL: Skip creating edges if they already exist in rawData.edges
        // Use semantic comparison (same classes and property) regardless of format
        // This is the most important check to prevent duplicates during undo
        const edgeExists = rawData.edges.some((e) => {
          // Normalize both edges to local names for semantic comparison
          const eFromLocal = extractLocalName(e.from);
          const eToLocal = extractLocalName(e.to);
          const targetFromLocal = extractLocalName(fromId);
          const targetToLocal = extractLocalName(toId);
          
          // Check if classes match (by local name)
          const fromMatches = eFromLocal === targetFromLocal || 
                             eFromLocal === extractLocalName(domainUri) ||
                             extractLocalName(domainUri) === targetFromLocal ||
                             e.from === fromId ||
                             e.from === domainUri ||
                             e.from === domainLocal ||
                             (domainIsLocal && e.from === domainLocal);
          
          const toMatches = eToLocal === targetToLocal ||
                           eToLocal === extractLocalName(rangeUri) ||
                           extractLocalName(rangeUri) === targetToLocal ||
                           e.to === toId ||
                           e.to === rangeUri ||
                           e.to === rangeLocal ||
                           (rangeIsLocal && e.to === rangeLocal);
          
          if (!fromMatches || !toMatches) return false;
          
          // Check if property matches (by local name or exact match)
          const eTypeLocal = extractLocalName(e.type);
          const targetTypeLocal = extractLocalName(propUri);
          const typeMatches = e.type === propUri ||
                             e.type === op.name ||
                             (op.uri && e.type === op.uri) ||
                             eTypeLocal === targetTypeLocal ||
                             eTypeLocal === op.name ||
                             (op.uri && eTypeLocal === extractLocalName(op.uri));
          
          return typeMatches;
        });
        
        if (edgeExists) {
          continue;
        }
        
        // Also check if a restriction exists (for local-to-local edges)
        // Restrictions are the source of truth - if a restriction exists, the edge is already in rawData.edges
        if (domainIsLocal && rangeIsLocal) {
          const restrictionExists = findRestrictionBlank(store, domainLocal, op.name, rangeLocal);
          if (restrictionExists) {
            // Restriction exists, so the edge is already in rawData.edges from the restriction
            // Don't create it again from domain/range
            continue;
          }
        }
        
        // Check existingEdgeKeys for fast lookup (redundant but safe)
        const edgeKey = `${fromId}->${toId}:${propUri}`;
        const edgeKeyWithLocalType = `${fromId}->${toId}:${op.name}`;
        const edgeKeyWithLocalFrom = domainIsLocal ? `${domainUri}->${toId}:${propUri}` : edgeKey;
        const edgeKeyWithLocalTo = rangeIsLocal ? `${fromId}->${rangeUri}:${propUri}` : edgeKey;
        const edgeKeyWithLocalBoth = domainIsLocal && rangeIsLocal ? `${domainUri}->${rangeUri}:${propUri}` : edgeKey;
        
        const keyExists = existingEdgeKeys.has(edgeKey) || 
                         existingEdgeKeys.has(edgeKeyWithLocalType) ||
                         existingEdgeKeys.has(edgeKeyWithLocalFrom) ||
                         existingEdgeKeys.has(edgeKeyWithLocalTo) ||
                         existingEdgeKeys.has(edgeKeyWithLocalBoth);
        if (keyExists) {
          continue;
        }
        
        existingEdgeKeys.add(edgeKey);

        newEdges.push({ from: fromId, to: toId, type: propUri, isRestriction: false });

        if (!domainIsLocal) {
          const ref = findRefForUri(domainUri, externalRefs);
          if (ref && !externalClassNodes.has(domainUri)) {
            const cached = getCachedExternalClasses(ref.url);
            const label = getExternalClassLabel(domainUri, cached);
            externalClassNodes.set(domainUri, {
              id: domainUri,
              label,
              labellableRoot: null,
              isExternal: true,
              externalOntologyUrl: ref.url,
              x: options.nodePositions?.[domainUri]?.x,
              y: options.nodePositions?.[domainUri]?.y,
            });
          }
        }
        if (!rangeIsLocal) {
          const ref = findRefForUri(rangeUri, externalRefs);
          if (ref && !externalClassNodes.has(rangeUri)) {
            const cached = getCachedExternalClasses(ref.url);
            const label = getExternalClassLabel(rangeUri, cached);
            externalClassNodes.set(rangeUri, {
              id: rangeUri,
              label,
              labellableRoot: null,
              isExternal: true,
              externalOntologyUrl: ref.url,
              x: options.nodePositions?.[rangeUri]?.x,
              y: options.nodePositions?.[rangeUri]?.y,
            });
          }
        }
      }
    }
  }

  // Add external classes referenced in subClassOf relationships
  const RDFS_SUBCLASS_OF = RDFS + 'subClassOf';
  const subClassOfQuads = store.getQuads(null, DataFactory.namedNode(RDFS_SUBCLASS_OF), null, null);
  for (const q of subClassOfQuads) {
    // Only process direct subClassOf relationships (not restrictions - those are blank nodes)
    if (q.object.termType !== 'NamedNode') continue;
    const superClassUri = (q.object as { value: string }).value;
    const superClassIsLocal = isLocalUri(superClassUri, mainBase);
    if (!superClassIsLocal) {
      const ref = findRefForUri(superClassUri, externalRefs);
      if (ref && !externalClassNodes.has(superClassUri)) {
        const cached = getCachedExternalClasses(ref.url);
        const label = getExternalClassLabel(superClassUri, cached);
        externalClassNodes.set(superClassUri, {
          id: superClassUri,
          label,
          labellableRoot: null,
          isExternal: true,
          externalOntologyUrl: ref.url,
          x: options.nodePositions?.[superClassUri]?.x,
          y: options.nodePositions?.[superClassUri]?.y,
        });
      }
      // Also create the subClassOf edge if the subclass is local
      const subClassUri = (q.subject as { value: string }).value;
      const subClassIsLocal = isLocalUri(subClassUri, mainBase);
      if (subClassIsLocal) {
        const subClassLocalName = extractLocalName(subClassUri);
        const edgeKey = `${subClassLocalName}->${superClassUri}:subClassOf`;
        if (!existingEdgeKeys.has(edgeKey)) {
          newEdges.push({ from: subClassLocalName, to: superClassUri, type: 'subClassOf', isRestriction: false });
          existingEdgeKeys.add(edgeKey);
        }
      }
    }
  }

  let externalNodesList = Array.from(externalClassNodes.values());
  if (externalNodesList.length === 0 && newEdges.length === 0) {
    return rawData;
  }

  if (options.externalNodeLayout !== 'auto' && options.nodePositions) {
    const OFFSET = 120;
    const localIds = new Set(localNodeIds);
    for (const extNode of externalNodesList) {
      const positions: { x: number; y: number }[] = [];
      for (const e of newEdges) {
        const other = e.from === extNode.id ? e.to : e.to === extNode.id ? e.from : null;
        if (!other || !localIds.has(other)) continue;
        const localNode = rawData.nodes.find((n) => n.id === other);
        const pos = options.nodePositions![other] ?? (localNode?.x != null && localNode?.y != null ? { x: localNode.x, y: localNode.y } : null);
        if (pos) positions.push(pos);
      }
      if (positions.length > 0) {
        const layout = options.externalNodeLayout;
        const anchor =
          layout === 'right' ? positions.reduce((a, p) => (p.x > a.x ? p : a), positions[0])
          : layout === 'left' ? positions.reduce((a, p) => (p.x < a.x ? p : a), positions[0])
          : layout === 'bottom' ? positions.reduce((a, p) => (p.y > a.y ? p : a), positions[0])
          : positions.reduce((a, p) => (p.y < a.y ? p : a), positions[0]);
        if (layout === 'right') {
          extNode.x = anchor.x + OFFSET;
          extNode.y = anchor.y;
        } else if (layout === 'left') {
          extNode.x = anchor.x - OFFSET;
          extNode.y = anchor.y;
        } else if (layout === 'top') {
          extNode.x = anchor.x;
          extNode.y = anchor.y - OFFSET;
        } else if (layout === 'bottom') {
          extNode.x = anchor.x;
          extNode.y = anchor.y + OFFSET;
        }
      }
    }
  }

  // CRITICAL FIX: Deduplicate edges before returning to prevent duplicates during undo
  // Even though we check before adding to newEdges, format mismatches can still occur
  // So we do a final comprehensive deduplication here that compares by semantic meaning
  const allEdges = [...rawData.edges, ...newEdges];
  const deduplicatedEdges: GraphEdge[] = [];
  const seenEdgeSignatures = new Set<string>();
  
  for (const edge of allEdges) {
    // Build semantic signature: normalize to local names for comparison
    // This catches duplicates regardless of URI vs local name format
    const fromLocal = extractLocalName(edge.from);
    const toLocal = extractLocalName(edge.to);
    const typeLocal = extractLocalName(edge.type);
    
    // Also get the property info to normalize the type
    const op = objectProps.find((p) => p.name === edge.type || p.uri === edge.type);
    const normalizedType = op ? (op.name || extractLocalName(op.uri || edge.type)) : typeLocal;
    
    // Create semantic signature using normalized local names
    const semanticSignature = `${fromLocal}||${toLocal}||${normalizedType}`;
    
    // Also create signatures with all possible format variations
    const signatures = new Set<string>();
    signatures.add(semanticSignature);
    signatures.add(`${edge.from}||${edge.to}||${edge.type}`);
    if (op) {
      if (op.name) {
        signatures.add(`${fromLocal}||${toLocal}||${op.name}`);
        signatures.add(`${edge.from}||${edge.to}||${op.name}`);
      }
      if (op.uri) {
        signatures.add(`${fromLocal}||${toLocal}||${extractLocalName(op.uri)}`);
        signatures.add(`${edge.from}||${edge.to}||${op.uri}`);
      }
    }
    
    // Check if any signature has been seen
    let isDuplicate = false;
    for (const sig of signatures) {
      if (seenEdgeSignatures.has(sig)) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      // Mark all signatures as seen and add the edge
      for (const sig of signatures) {
        seenEdgeSignatures.add(sig);
      }
      deduplicatedEdges.push(edge);
    }
  }

  return {
    nodes: [...rawData.nodes, ...externalNodesList],
    edges: deduplicatedEdges,
  };
}

/**
 * Check if a node id refers to an external node (full URI used as id).
 */
export function isExternalNodeId(nodeId: string, rawData: GraphData): boolean {
  if (nodeId.startsWith('__dataprop')) return false;
  return (nodeId.startsWith('http://') || nodeId.startsWith('https://')) && !rawData.nodes.some((n) => n.id === nodeId);
}
