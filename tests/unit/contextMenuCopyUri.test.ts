// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Store } from 'n3';
import type { Network } from 'vis-network/esnext';
import { initContextMenu, showContextMenu, hideContextMenu, setTermUriResolver, setVersionPinnedUriResolver } from '../../src/ui/contextMenu';
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

  it('is the only item in copy-only (embedded) mode, with the version-pinned one', () => {
    rightClick('Sheet', null, true);
    expect(menuItems()).toEqual(['Copy URI', 'Copy version-pinned URI']);
  });

  it('shows no menu on the empty canvas in copy-only mode', () => {
    rightClick(null, null, true);
    expect(document.getElementById('contextMenu')!.style.display).toBe('none');
  });
});

describe('context menu "Copy version-pinned URI" (#128)', () => {
  const PINNED = 'https://example.org/onto/1.0.0#Sheet';
  const item = (): HTMLElement => document.getElementById('contextMenu')!.children[1] as HTMLElement;

  beforeEach(() => {
    initContextMenu(net, container, new Store(), rawData, () => {}, () => {}, () => {}, () => {});
    setTermUriResolver((kind, id) => (kind === 'node' && id === 'Sheet' ? URI : null));
    setVersionPinnedUriResolver((kind, id) =>
      kind === 'node' && id === 'Sheet'
        ? { uri: PINNED, version: '1.0.0', derived: false }
        : { uri: null, reason: 'Not defined in this ontology' }
    );
    hideContextMenu();
  });

  it('follows "Copy URI", naming the version it copies', () => {
    rightClick('Sheet', null);
    expect(menuItems().slice(0, 2)).toEqual(['Copy URI', 'Copy version-pinned URI (1.0.0)']);
    expect(item().title).toBe(PINNED);
  });

  it('is offered in copy-only (embedded) mode too', () => {
    rightClick('Sheet', null, true);
    expect(menuItems()).toEqual(['Copy URI', 'Copy version-pinned URI (1.0.0)']);
  });

  it('copies the version-pinned URI', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    rightClick('Sheet', null);
    item().click();
    expect(writeText).toHaveBeenCalledWith(PINNED);
  });

  it('says when the version IRI was derived from owl:versionInfo', () => {
    setVersionPinnedUriResolver(() => ({ uri: PINNED, version: '1.0.0', derived: true }));
    rightClick('Sheet', null);
    expect(item().title).toContain('owl:versionInfo');
  });

  it('is disabled, without a version, and says why when there is no pinned URI', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    rightClick(null, 'Sheet->Other:contains');
    expect(menuItems()[1]).toBe('Copy version-pinned URI');
    item().click();
    expect(writeText).not.toHaveBeenCalled();
    expect(item().title).toBe('Not defined in this ontology');
  });
});
