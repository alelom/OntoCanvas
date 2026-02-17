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
  isBoolean: boolean; // Deprecated: kept for backward compatibility, use range instead
  /** Full URI of the datatype range (e.g. http://www.w3.org/2001/XMLSchema#boolean). null means no range specified. */
  range?: string | null;
}

export interface ObjectPropertyInfo {
  name: string;
  label: string;
  hasCardinality: boolean;
  /** rdfs:comment from the ontology */
  comment?: string | null;
  /** Domain class local name (rdfs:domain). Empty/null means owl:Thing. */
  domain?: string | null;
  /** Range class local name (rdfs:range). Empty/null means owl:Thing. */
  range?: string | null;
  /** Full URI of the property (used to disambiguate when local name is shared, e.g. hasGeometry from GeoSPARQL vs DAnO). */
  uri?: string;
  /** rdfs:isDefinedBy (URI of defining ontology). Read-only in edit. */
  isDefinedBy?: string | null;
  /** rdfs:subPropertyOf (single parent object property URI or local name). */
  subPropertyOf?: string | null;
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
  /** Whether this edge comes from an OWL restriction (true) or from domain/range definition (false/undefined) */
  isRestriction?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type BorderLineType = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot';
