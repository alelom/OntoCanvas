export interface GraphNode {
  id: string;
  label: string;
  labellableRoot: boolean | null;
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
