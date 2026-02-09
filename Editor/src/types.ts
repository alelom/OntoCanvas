export interface GraphNode {
  id: string;
  label: string;
  labellableRoot: boolean | null;
  /** rdfs:comment from the ontology */
  comment?: string | null;
  annotations?: Record<string, string | boolean | null>;
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
