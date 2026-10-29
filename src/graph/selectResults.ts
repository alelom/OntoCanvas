/**
 * Selects what a query result names in the graph and brings it into view (#203). Only what is drawn is selected: a node
 * that a filter hides, or an edge whose style is switched off, is not in the network and vis-network would refuse its id.
 */
import type { Network } from 'vis-network';
import type { GraphMatch } from '../sparql/graphMatches';

export type SelectableNetwork = Pick<Network, 'getPositions' | 'getConnectedNodes' | 'setSelection' | 'fit'>;

/** Returns how many nodes and edges were selected. */
export function selectInGraph(network: SelectableNetwork, match: GraphMatch): { nodes: number; edges: number } {
  const nodes = match.nodeIds.filter((id) => id in network.getPositions([id]));
  const ends = new Set(nodes);
  const edges = match.edgeIds.filter((id) => {
    const connected = network.getConnectedNodes(id) as unknown;
    if (!Array.isArray(connected) || connected.length === 0) return false;
    for (const end of connected as string[]) ends.add(end);
    return true;
  });
  if (nodes.length === 0 && edges.length === 0) return { nodes: 0, edges: 0 };
  network.setSelection({ nodes, edges }, { unselectAll: true, highlightEdges: false });
  network.fit({ nodes: [...ends], animation: true });
  return { nodes: nodes.length, edges: edges.length };
}
