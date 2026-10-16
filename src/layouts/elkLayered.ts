import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { GraphEdge, NodeDimensions } from '../types';
import { buildLayeredModel, tierYs, type LayeredModelOptions } from './layeredModel';

const VERTICAL_GAP = 150;
/** ELK keeps an edge with a higher straightness priority shorter and straighter. */
const RANKING_PRIORITY = '10';
const OTHER_PRIORITY = '1';

/**
 * The ELK input for "Layered (ELK)" (#153). The tiers come from the layered model, as in the other hierarchical
 * layouts (the Tiers setting and its rules, #151), and reach ELK as layer constraints; ELK orders the nodes of each
 * tier and places them (Brandes–Köpf). The ranking edges point down with a high priority; every other relationship
 * between two tiers points down from the upper one, with a low priority, so it still pulls its ends together.
 */
export function buildElkGraph(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>,
  options: LayeredModelOptions = {}
): ElkNode {
  const { level, children } = buildLayeredModel(nodeIds, edges, options);
  const size = (id: string) => nodeDimensions?.get(id) ?? { width: spacing * 0.45, height: spacing * 0.3 };
  const elkEdges: ElkExtendedEdge[] = [];
  const edge = (from: string, to: string, priority: string) =>
    elkEdges.push({
      id: `e${elkEdges.length}`,
      sources: [from],
      targets: [to],
      layoutOptions: { 'elk.layered.priority.straightness': priority },
    });
  for (const p of Object.keys(children).sort()) for (const c of children[p]) edge(p, c, RANKING_PRIORITY);
  for (const e of edges) {
    if (options.hierarchyTypes?.has(e.type) ?? e.type === 'subClassOf') continue;
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to) || level[e.from] === level[e.to]) continue;
    const [upper, lower] = level[e.from] < level[e.to] ? [e.from, e.to] : [e.to, e.from];
    edge(upper, lower, OTHER_PRIORITY);
  }
  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(VERTICAL_GAP),
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      // One layered graph: a separate group shares the tiers, beside the main one, rather than a row of its own.
      'elk.separateConnectedComponents': 'false',
    },
    children: [...nodeIds].sort().map((id) => ({
      id,
      width: size(id).width,
      height: size(id).height,
      layoutOptions: { 'elk.layered.layering.layerChoiceConstraint': String(level[id] ?? 0) },
    })),
    edges: elkEdges,
  };
}

/**
 * "Layered (ELK)" (#153): x from ELK, y from the layered model's tiers, so every node of a tier shares one y as in
 * the other hierarchical layouts. elkjs is loaded only when this layout is first used (it is large).
 */
export async function computeElkLayered(
  nodeIds: Set<string>,
  edges: GraphEdge[],
  spacing: number,
  nodeDimensions?: Map<string, NodeDimensions>,
  options: LayeredModelOptions = {}
): Promise<Record<string, { x: number; y: number }>> {
  if (nodeIds.size === 0) return {};
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const graph = buildElkGraph(nodeIds, edges, spacing, nodeDimensions, options);
  const laid = await new ELK().layout(graph);

  const { level } = buildLayeredModel(nodeIds, edges, options);
  const tiers: string[][] = [];
  for (const id of nodeIds) (tiers[level[id] ?? 0] = tiers[level[id] ?? 0] || []).push(id);
  const height = (id: string) => nodeDimensions?.get(id)?.height ?? spacing * 0.3;
  const ys = tierYs(Array.from(tiers, (t) => t ?? []), height, VERTICAL_GAP);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of laid.children ?? []) {
    positions[node.id] = { x: (node.x ?? 0) + (node.width ?? 0) / 2, y: ys[level[node.id] ?? 0] };
  }
  return positions;
}
