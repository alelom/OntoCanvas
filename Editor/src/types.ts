export interface GraphNode {
  id: string;
  label: string;
  labellableRoot: boolean | null;
  annotations?: Record<string, string | boolean | null>;
  x?: number;
  y?: number;
}

export interface AnnotationPropertyInfo {
  name: string;
  isBoolean: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
