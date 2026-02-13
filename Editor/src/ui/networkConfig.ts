import { getSpacing } from '../graph';

/**
 * Get vis-network configuration options based on layout mode
 */
export function getNetworkOptions(layoutMode: string): Record<string, unknown> {
  const spacing = getSpacing();
  const base: Record<string, unknown> = {
    nodes: {
      shape: 'box',
      margin: 10,
      font: { size: 20, color: '#2c3e50' },
    },
    edges: { smooth: { type: 'cubicBezier' }, arrows: 'to' },
    interaction: {
      dragView: false,
      dragNodes: true,
      multiselect: true,
    },
  };
  if (layoutMode === 'weighted') {
    base.physics = { enabled: false };
  } else if (layoutMode === 'force') {
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
