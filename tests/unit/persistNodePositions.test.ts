/**
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import {
  persistNodePositionsFromNetwork,
  type NetworkWithPositions,
} from '../../src/graph/persistNodePositions';

describe('persistNodePositionsFromNetwork', () => {
  it('updates rawData.nodes with positions from network for matching IDs', () => {
    const rawData = {
      nodes: [
        { id: 'A', x: 0, y: 0 },
        { id: 'B', x: 10, y: 10 },
      ],
    };
    const network: NetworkWithPositions = {
      getPositions: () => ({
        A: { x: 100, y: 200 },
        B: { x: 150, y: 250 },
        __dataprop__A__p: { x: 120, y: 220 },
      }),
    };
    const scheduleDisplayConfigSave = vi.fn();

    persistNodePositionsFromNetwork(network, rawData, scheduleDisplayConfigSave);

    expect(rawData.nodes[0].x).toBe(100);
    expect(rawData.nodes[0].y).toBe(200);
    expect(rawData.nodes[1].x).toBe(150);
    expect(rawData.nodes[1].y).toBe(250);
    expect(scheduleDisplayConfigSave).toHaveBeenCalledTimes(1);
  });

  it('ignores positions for node IDs not in rawData.nodes', () => {
    const rawData = {
      nodes: [{ id: 'A', x: 0, y: 0 }],
    };
    const network: NetworkWithPositions = {
      getPositions: () => ({
        A: { x: 1, y: 2 },
        __dataprop__A__p: { x: 3, y: 4 },
      }),
    };
    const scheduleDisplayConfigSave = vi.fn();

    persistNodePositionsFromNetwork(network, rawData, scheduleDisplayConfigSave);

    expect(rawData.nodes[0].x).toBe(1);
    expect(rawData.nodes[0].y).toBe(2);
    expect(scheduleDisplayConfigSave).toHaveBeenCalledTimes(1);
  });
});
