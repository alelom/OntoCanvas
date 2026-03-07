/**
 * Persist node positions from the network to rawData and schedule display config save.
 * Only nodes that exist in rawData.nodes are updated (domain classes); data property
 * nodes are not persisted.
 */

export interface NetworkWithPositions {
  getPositions(): Record<string, { x: number; y: number }>;
}

export interface RawDataNode {
  id: string;
  x?: number;
  y?: number;
}

/**
 * Copies positions from the network into rawData.nodes for matching IDs,
 * then calls scheduleDisplayConfigSave.
 */
export function persistNodePositionsFromNetwork(
  network: NetworkWithPositions,
  rawData: { nodes: RawDataNode[] },
  scheduleDisplayConfigSave: () => void
): void {
  const positions = network.getPositions();
  Object.entries(positions).forEach(([id, pos]) => {
    const node = rawData.nodes.find((n) => n.id === id);
    if (node && pos) {
      node.x = pos.x;
      node.y = pos.y;
    }
  });
  scheduleDisplayConfigSave();
}
