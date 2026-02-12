/** Data property restriction on a class (min/max cardinality). */
export interface DataPropertyRestriction {
  propertyName: string;
  minCardinality?: number | null;
  maxCardinality?: number | null;
}

export interface GraphNode {
  id: string;
  label: string;
  labellableRoot: boolean | null;
  /** rdfs:comment from the ontology */
  comment?: string | null;
  annotations?: Record<string, string | boolean | null>;
  /** Data property restrictions (owl:Restriction with owl:onDataRange) on this class */
  dataPropertyRestrictions?: DataPropertyRestriction[];
  x?: number;
  y?: number;
}

export interface AnnotationPropertyInfo {
  name: string;
  isBoolean: boolean;
}

export interface ObjectPropertyInfo {
  name: string;
  label: string;
  hasCardinality: boolean;
  /** rdfs:comment from the ontology */
  comment?: string | null;
}

export interface DataPropertyInfo {
  name: string;
  label: string;
  /** rdfs:comment from the ontology */
  comment?: string | null;
  /** Full URI of the datatype (e.g. http://www.w3.org/2001/XMLSchema#string) */
  range: string;
  /** Domain class local names (extracted from rdfs:domain). Empty array means owl:Thing (all classes). */
  domains: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
  /** Min cardinality (null = unbounded). For qualified restrictions. */
  minCardinality?: number | null;
  /** Max cardinality (null = unbounded). For qualified restrictions. */
  maxCardinality?: number | null;
  /** Target class for qualified cardinality (when different from edge 'to'). */
  onClass?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type BorderLineType = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot';
