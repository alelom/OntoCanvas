/**
 * Draws the individuals layer (#209) into the data the canvas is given, after the class graph is built: the nodes of
 * individuals look different from classes (ellipse, warm colour) and sit around the class node they belong to when it has a
 * position. Display only: nothing here reaches rawData, the ontology's store or the save pipeline.
 */
import type { DataSet } from 'vis-data';
import type { IndividualsLayer } from '../abox/individualsLayer';
import { extractLocalName } from '../utils/localName';
import { relaxIndividuals, type FixedBox } from './individualsRelax';
import { filterIndividualsBySearch, type IndividualSearchFilter } from '../abox/individualSearch';

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

/** The room a node already placed takes, estimated from its label (the canvas has not drawn it yet). */
function boxOf(node: { id: string; x: number; y: number; label?: string; font?: { size?: number } }): FixedBox {
  const lines = String(node.label ?? '').split('\n');
  const size = node.font?.size ?? 20;
  return { id: String(node.id), x: node.x, y: node.y, width: Math.max(80, Math.max(...lines.map((l) => l.length)) * size * 0.55 + 24), height: lines.length * size * 1.3 + 20 };
}

export function addIndividualsToNetworkData(data: NetworkData, layer: IndividualsLayer, classNodes: Map<string, string>, options: { relax?: boolean; search?: IndividualSearchFilter | null } = {}): void {
  if (layer.isEmpty()) return;
  const view = filterIndividualsBySearch(layer.build(classNodes), options.search ?? null);

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
  if (options.relax ?? true) relax(data, view);
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

/** Moves the individuals by force relaxation, anchored to the nodes the layout already placed; the rest are left to the canvas. */
function relax(data: NetworkData, view: ReturnType<IndividualsLayer['build']>): void {
  const individualIds = new Set(view.nodes.map((n) => n.id));
  const fixed = (data.nodes.get() as Array<{ id: string; x?: number; y?: number; label?: string }>)
    .filter((n) => !individualIds.has(String(n.id)) && typeof n.x === 'number' && typeof n.y === 'number')
    .map((n) => boxOf(n as Parameters<typeof boxOf>[0]));
  // With the classes unplaced (the physics layout) there is nothing to anchor to: the canvas lays everything out.
  if (fixed.length === 0) return;
  const centre = { x: fixed.reduce((sum, f) => sum + f.x, 0) / fixed.length, y: fixed.reduce((sum, f) => sum + f.y, 0) / fixed.length };
  const movable = data.nodes.get(view.nodes.map((n) => n.id)).map((n: { id: string; x?: number; y?: number }) => ({ id: String(n.id), x: n.x ?? centre.x, y: n.y ?? centre.y }));
  const links = view.edges.map((e) => [e.from, e.to] as [string, string]);
  const placed = relaxIndividuals({ movable, fixed, links });
  data.nodes.update([...placed].map(([id, p]) => ({ id, x: p.x, y: p.y })));
}
