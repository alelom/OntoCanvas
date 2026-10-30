/**
 * Draws the individuals layer (#209) into the data the canvas is given, after the class graph is built: the nodes of
 * individuals look different from classes (ellipse, warm colour) and sit around the class node they belong to when it has a
 * position. Display only: nothing here reaches rawData, the ontology's store or the save pipeline.
 */
import type { DataSet } from 'vis-data';
import type { IndividualsLayer } from '../abox/individualsLayer';
import { extractLocalName } from '../utils/localName';

interface NetworkData {
  nodes: DataSet<any>;
  edges: DataSet<any>;
}

const RING_RADIUS = 160;
const RING_STEP = 18;

/** The node id of each class that is drawn, by the class's IRI. */
export function classNodesByUri(nodes: Array<{ id: string; uri?: string }>): Map<string, string> {
  const byUri = new Map<string, string>();
  for (const node of nodes) if (node.uri) byUri.set(node.uri, node.id);
  return byUri;
}

export function addIndividualsToNetworkData(data: NetworkData, layer: IndividualsLayer, classNodes: Map<string, string>): void {
  if (layer.isEmpty()) return;
  const view = layer.build(classNodes);

  // Each individual goes on a ring around its first drawn class that has a position; the others are left to the layout.
  const classOf = new Map<string, string>();
  for (const edge of view.edges) if (edge.type === 'rdf:type' && !classOf.has(edge.from)) classOf.set(edge.from, edge.to);
  const placed = new Map<string, number>();
  const ringSize = new Map<string, number>();
  for (const node of view.nodes) {
    const cls = classOf.get(node.id);
    if (cls) ringSize.set(cls, (ringSize.get(cls) ?? 0) + 1);
  }

  data.nodes.add(
    view.nodes.map((node) => {
      const base = {
        id: node.id,
        label: node.label,
        title: node.title,
        shape: 'ellipse',
        color: { background: '#fdebd0', border: '#e67e22', highlight: { background: '#fad7a0', border: '#d35400' } },
        font: { size: 14 },
        borderWidth: 1,
      };
      const cls = classOf.get(node.id);
      const anchor = cls ? (data.nodes.get(cls) as { x?: number; y?: number } | null) : null;
      if (!cls || typeof anchor?.x !== 'number' || typeof anchor.y !== 'number') return base;
      const index = placed.get(cls) ?? 0;
      placed.set(cls, index + 1);
      const angle = (2 * Math.PI * index) / (ringSize.get(cls) ?? 1);
      const radius = RING_RADIUS + Math.floor(index / 12) * RING_STEP;
      return { ...base, x: anchor.x + radius * Math.cos(angle), y: anchor.y + radius * Math.sin(angle) };
    })
  );
  data.edges.add(
    view.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      arrows: 'to',
      label: edge.type === 'rdf:type' ? '' : extractLocalName(edge.type),
      dashes: edge.type === 'rdf:type',
      color: { color: '#e67e22', highlight: '#d35400' },
      font: { size: 11, align: 'middle' },
      smooth: false,
    }))
  );
}
