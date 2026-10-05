/**
 * Resolve the full URI (and display label) of the term behind a graph node or edge, and build the
 * link the status bar uses for the selected term. Pure functions, no DOM.
 */
import type { GraphNode, ObjectPropertyInfo, DataPropertyInfo } from '../types';
import { parseEdgeId } from '../utils/edgeId';

const RDFS_SUBCLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const DATA_PROP_NODE = /^__dataprop(?:restrict)?__(.+)__(.+)$/;

export interface TermLookup {
  nodes: GraphNode[];
  objectProperties: ObjectPropertyInfo[];
  dataProperties: DataPropertyInfo[];
}

export interface ResolvedTerm {
  /** Full URI of the term, or null when the loaded data does not record one. */
  uri: string | null;
  label: string;
}

function isHttpUri(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

function localNameOf(uri: string): string {
  const hash = uri.lastIndexOf('#');
  if (hash >= 0) return uri.slice(hash + 1);
  return uri.slice(uri.lastIndexOf('/') + 1);
}

function resolveDataPropertyNode(nodeId: string, lookup: TermLookup): ResolvedTerm | null {
  const match = nodeId.match(DATA_PROP_NODE);
  if (!match) return null;
  const propertyName = match[2];
  const dp = lookup.dataProperties.find((p) => p.name === propertyName || p.uri === propertyName);
  return { uri: dp?.uri ?? null, label: dp?.label || propertyName };
}

/** Term behind a node: a class, or the data property a data-property node stands for. */
export function resolveNodeTerm(nodeId: string, lookup: TermLookup): ResolvedTerm | null {
  if (DATA_PROP_NODE.test(nodeId)) return resolveDataPropertyNode(nodeId, lookup);
  const node = lookup.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return { uri: node.uri ?? null, label: node.label || node.id };
}

/** Term behind an edge: the object property, rdfs:subClassOf, or the data property it attaches. */
export function resolveEdgeTerm(edgeId: string, lookup: TermLookup): ResolvedTerm | null {
  const parsed = parseEdgeId(edgeId);
  if (!parsed) return null;
  const { from, to, type } = parsed;
  if (type === 'subClassOf') return { uri: RDFS_SUBCLASS_OF, label: 'subClassOf' };
  if (type === 'dataprop' || type === 'dataproprestrict') {
    const dpNode = DATA_PROP_NODE.test(to) ? to : DATA_PROP_NODE.test(from) ? from : null;
    return dpNode ? resolveDataPropertyNode(dpNode, lookup) : null;
  }
  const op = lookup.objectProperties.find((p) => p.uri === type || p.name === type);
  if (op) return { uri: op.uri ?? (isHttpUri(type) ? type : null), label: op.label || op.name };
  if (isHttpUri(type)) return { uri: type, label: localNameOf(type) };
  return { uri: null, label: type };
}

/**
 * Link for a term. When the ontology was loaded from an http(s) URL and the term is a hash-IRI in
 * one of the main ontology's namespaces, point at the loaded file with the term's fragment;
 * otherwise use the term's own URI when it is dereferenceable. Null when neither applies.
 */
export function buildTermLink(
  termUri: string | null,
  sourceUrl: string | null,
  localNamespaces: string[]
): string | null {
  if (!termUri) return null;
  const hash = termUri.indexOf('#');
  const isLocal = hash >= 0 && localNamespaces.some((ns) => ns && termUri.startsWith(ns));
  if (isLocal && sourceUrl && isHttpUri(sourceUrl)) {
    const base = sourceUrl.split('#')[0];
    return `${base}#${termUri.slice(hash + 1)}`;
  }
  return isHttpUri(termUri) ? termUri : null;
}
