// @vitest-environment jsdom
/**
 * The right-click menu and individuals (#209): none on an individual or its edge, but a class node keeps its menu when an
 * individual's edge ends under the click (the dashed edges of drawn individuals end at the class node).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from 'n3';
import type { Network } from 'vis-network/esnext';
import { initContextMenu, showContextMenu, hideContextMenu, setClassIndividualsProvider } from '../../src/ui/contextMenu';
import type { GraphData } from '../../src/types';

const rawData: GraphData = { nodes: [{ id: 'Sensor', label: 'Sensor', labellableRoot: null, uri: 'http://example.org/o#Sensor' }], edges: [] };
const net = { getNodeAt: () => undefined, getEdgeAt: () => undefined, setSelection: () => {} } as unknown as Network;
const container = document.createElement('div');
const menu = () => document.getElementById('contextMenu')!;
const items = () => [...menu().children].map((c) => c.textContent ?? '').filter((t) => t !== '');
const rightClick = (nodeId: string | null, edgeId: string | null) =>
  showContextMenu(new MouseEvent('mouseup', { clientX: 10, clientY: 10 }), net, container, nodeId, edgeId);

describe('the context menu with individuals drawn', () => {
  beforeEach(() => {
    initContextMenu(net, container, new Store(), rawData, () => {}, () => {}, () => {}, () => {});
    setClassIndividualsProvider(() => ({ label: 'Show 50 individuals (0 displayed/120 total)', title: '', disabled: false, run: () => {} }));
    hideContextMenu();
  });

  it('is shown for a class node though an individual edge ends under the click, and offers its individuals', () => {
    rightClick('Sensor', '__individual_edge__30');

    expect(menu().style.display).toBe('block');
    expect(items()).toContain('Show 50 individuals (0 displayed/120 total)');
  });

  it('is not shown for an individual, nor for the edge of an individual', () => {
    rightClick('__individual__http://example.org/o#s1', null);
    expect(menu().style.display).toBe('none');

    rightClick(null, '__individual_edge__30');
    expect(menu().style.display).toBe('none');
  });

  it('is not shown for an individual that an edge of a class passes under', () => {
    rightClick('__individual__http://example.org/o#s1', 'Sensor->Building:installedIn');
    expect(menu().style.display).toBe('none');
  });
});
