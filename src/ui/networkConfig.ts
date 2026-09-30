import { getSpacing } from '../graph';

/**
 * Get vis-network configuration options based on layout mode
 */
export function getNetworkOptions(
  layoutMode: string,
  opts?: { embedded?: boolean }
): Record<string, unknown> {
  const spacing = getSpacing();
  const base: Record<string, unknown> = {
    nodes: {
      shape: 'box',
      margin: 10,
      font: { size: 20, color: '#2c3e50' },
    },
    edges: { smooth: { type: 'cubicBezier' }, arrows: 'to' },
    interaction: {
      // In embedded mode, let the left mouse button pan the view (drag empty canvas), like the
      // custom right-button panning. Nodes are still draggable. Outside embed we keep the custom
      // right-button panning and leave left-drag for selection.
      dragView: opts?.embedded ?? false,
      dragNodes: true,
      multiselect: true,
    },
  };
  // Only the force-directed mode uses physics; every hierarchical layout is precomputed.
  if (layoutMode === 'force') {
    base.physics = {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: spacing,
        springConstant: 0.04,
        damping: 0.09,
        avoidOverlap: 0.1,
      },
      stabilization: { iterations: 150 },
    };
  } else {
    base.physics = { enabled: false };
  }
  return base;
}
