// @vitest-environment jsdom
/**
 * The side panel host (#171): a container that knows about tabs but not about what is in them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSidePanelHost, type SidePanelTab } from '../../src/ui/sidePanel/sidePanelHost';

let root: HTMLElement;

const tab = (id: string, text = id): SidePanelTab & { render: ReturnType<typeof vi.fn> } => ({
  id,
  title: `Tab ${id}`,
  render: vi.fn((container: HTMLElement) => {
    container.textContent = text;
  }),
});

beforeEach(() => {
  document.body.replaceChildren();
  root = document.createElement('aside');
  document.body.append(root);
});

const bodyOf = (id: string) => root.querySelector<HTMLElement>(`[data-tab-body="${id}"]`);
const buttonOf = (id: string) => root.querySelector<HTMLButtonElement>(`[data-tab-button="${id}"]`);

describe('createSidePanelHost', () => {
  it('starts closed and has drawn no tab yet', () => {
    const t = tab('a');
    const host = createSidePanelHost(root);
    host.registerTab(t);

    expect(host.isOpen()).toBe(false);
    expect(root.hidden).toBe(true);
    expect(t.render).not.toHaveBeenCalled();
  });

  it('opens a tab: shows the panel, draws the tab once, marks its button selected', () => {
    const t = tab('a', 'Hello');
    const host = createSidePanelHost(root);
    host.registerTab(t);

    host.open('a');

    expect(host.isOpen()).toBe(true);
    expect(host.activeTabId()).toBe('a');
    expect(root.hidden).toBe(false);
    expect(bodyOf('a')?.textContent).toBe('Hello');
    expect(buttonOf('a')?.getAttribute('aria-selected')).toBe('true');
    expect(t.render).toHaveBeenCalledTimes(1);
  });

  it('keeps a tab\'s content across close and open instead of drawing it again', () => {
    const t = tab('a');
    const host = createSidePanelHost(root);
    host.registerTab(t);

    host.open('a');
    host.close();
    host.open('a');

    expect(t.render).toHaveBeenCalledTimes(1);
  });

  it('shows only the active tab\'s body when there are several tabs', () => {
    const host = createSidePanelHost(root);
    host.registerTab(tab('a'));
    host.registerTab(tab('b'));

    host.open('a');
    host.open('b');

    expect(bodyOf('a')?.hidden).toBe(true);
    expect(bodyOf('b')?.hidden).toBe(false);
    expect(buttonOf('a')?.getAttribute('aria-selected')).toBe('false');
    expect(buttonOf('b')?.getAttribute('aria-selected')).toBe('true');
  });

  it('closes with its close button', () => {
    const host = createSidePanelHost(root);
    host.registerTab(tab('a'));
    host.open('a');

    root.querySelector<HTMLButtonElement>('[data-side-panel-close]')!.click();

    expect(host.isOpen()).toBe(false);
    expect(root.hidden).toBe(true);
  });

  it('switches tabs when a tab button is clicked', () => {
    const host = createSidePanelHost(root);
    host.registerTab(tab('a'));
    host.registerTab(tab('b'));
    host.open('a');

    buttonOf('b')!.click();

    expect(host.activeTabId()).toBe('b');
  });

  it('toggle opens a closed tab, closes the open one, and switches to another one', () => {
    const host = createSidePanelHost(root);
    host.registerTab(tab('a'));
    host.registerTab(tab('b'));

    host.toggle('a');
    expect(host.activeTabId()).toBe('a');
    host.toggle('b');
    expect(host.activeTabId()).toBe('b');
    host.toggle('b');
    expect(host.isOpen()).toBe(false);
  });

  it('tells a listener when it opens or closes, and which tab is active', () => {
    const host = createSidePanelHost(root);
    host.registerTab(tab('a'));
    const seen: Array<string | null> = [];
    host.onChange((activeId) => seen.push(activeId));

    host.open('a');
    host.close();

    expect(seen).toEqual(['a', null]);
  });

  it('refuses an unknown tab and a duplicate id', () => {
    const host = createSidePanelHost(root);
    host.registerTab(tab('a'));

    expect(() => host.open('nope')).toThrow(/nope/);
    expect(() => host.registerTab(tab('a'))).toThrow(/already/i);
  });
});
