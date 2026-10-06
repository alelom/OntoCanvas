// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import type { Network } from 'vis-network/esnext';
import { initContextMenu, showContextMenu, hideContextMenu, setTermUriResolver } from '../../src/ui/contextMenu';
import type { GraphData } from '../../src/types';

const URI = 'https://example.org/onto#Sheet';
const rawData: GraphData = {
  nodes: [{ id: 'Sheet', label: 'Sheet', labellableRoot: null, uri: URI }],
  edges: [],
};
const net = {
  getNodeAt: () => undefined,
  getEdgeAt: () => undefined,
  setSelection: () => {},
} as unknown as Network;
const container = document.createElement('div');

function menuItems(): string[] {
  const menu = document.getElementById('contextMenu')!;
  return [...menu.children].map((c) => c.textContent ?? '').filter((t) => t !== '');
}

function rightClick(nodeId: string | null, edgeId: string | null, copyOnly = false): void {
  showContextMenu(new MouseEvent('mouseup', { clientX: 10, clientY: 10 }), net, container, nodeId, edgeId, { copyOnly });
}

describe('context menu "Copy URI"', () => {
  beforeEach(() => {
    initContextMenu(net, container, new Store(), rawData, () => {}, () => {}, () => {}, () => {});
    setTermUriResolver((kind, id) => (kind === 'node' && id === 'Sheet' ? URI : null));
    hideContextMenu();
  });

  it('is the first item for a node', () => {
    rightClick('Sheet', null);
    expect(menuItems()[0]).toBe('Copy URI');
  });

  it('is the first item for an edge', () => {
    rightClick(null, 'Sheet->Other:contains');
    expect(menuItems()[0]).toBe('Copy URI');
  });

  it('copies the resolved URI to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    rightClick('Sheet', null);
    (document.getElementById('contextMenu')!.firstElementChild as HTMLElement).click();
    expect(writeText).toHaveBeenCalledWith(URI);
  });

  it('is disabled when the URI cannot be resolved', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    rightClick(null, 'Sheet->Other:contains');
    const item = document.getElementById('contextMenu')!.firstElementChild as HTMLElement;
    item.click();
    expect(writeText).not.toHaveBeenCalled();
    expect(item.title).toBe('No URI recorded for this item');
  });

  it('is the only item in copy-only (embedded) mode', () => {
    rightClick('Sheet', null, true);
    expect(menuItems()).toEqual(['Copy URI']);
  });

  it('shows no menu on the empty canvas in copy-only mode', () => {
    rightClick(null, null, true);
    expect(document.getElementById('contextMenu')!.style.display).toBe('none');
  });
});
