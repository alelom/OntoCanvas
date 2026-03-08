/**
 * External expansion: add nodes and edges for classes (and datatype properties) from external ontologies
 * so they can be visualized with 50% opacity and "Open external ontology" in the context menu.
 * Does not modify the parser or rawData; produces an expanded graph for display only.
 */

import { DataFactory, type Store } from 'n3';
import type { GraphData, GraphEdge, GraphNode } from '../types';
import type { ExternalOntologyReference } from '../storage';
import type { ExternalNodeLayout } from '../storage';
import { getMainOntologyBase, getObjectProperties, extractLocalName } from '../parser';
import { getCachedExternalClasses } from '../externalOntologySearch';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

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
 */
function findRefForUri(uri: string, refs: ExternalOntologyReference[]): ExternalOntologyReference | null {
  const ns = getNamespace(uri);
  const nsNormalized = normalizeRefUrl(ns);
  for (const ref of refs) {
    const refNorm = normalizeRefUrl(ref.url);
    if (nsNormalized === refNorm || ref.url.startsWith(nsNormalized) || ns.startsWith(refNorm)) return ref;
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
  refUrl: string,
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
  const existingEdgeKeys = new Set(
    rawData.edges.map((e) => `${e.from}->${e.to}:${e.type}`)
  );

  const externalClassNodes = new Map<string, GraphNode>();
  const newEdges: GraphEdge[] = [];

  const objectProps = getObjectProperties(store);
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
        const edgeKey = `${fromId}->${toId}:${propUri}`;
        if (existingEdgeKeys.has(edgeKey)) continue;
        existingEdgeKeys.add(edgeKey);

        newEdges.push({ from: fromId, to: toId, type: propUri, isRestriction: false });

        if (!domainIsLocal) {
          const ref = findRefForUri(domainUri, externalRefs);
          if (ref && !externalClassNodes.has(domainUri)) {
            const normalizedRef = normalizeRefUrl(ref.url);
            const cached = getCachedExternalClasses(ref.url);
            const label = getExternalClassLabel(domainUri, ref.url, cached);
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
            const label = getExternalClassLabel(rangeUri, ref.url, cached);
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

  return {
    nodes: [...rawData.nodes, ...externalNodesList],
    edges: [...rawData.edges, ...newEdges],
  };
}

/**
 * Check if a node id refers to an external node (full URI used as id).
 */
export function isExternalNodeId(nodeId: string, rawData: GraphData): boolean {
  if (nodeId.startsWith('__dataprop')) return false;
  return (nodeId.startsWith('http://') || nodeId.startsWith('https://')) && !rawData.nodes.some((n) => n.id === nodeId);
}
