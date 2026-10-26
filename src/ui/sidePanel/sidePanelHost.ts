/**
 * The side panel: a container with a tab bar and a close button. It knows about tabs, not about what is in
 * them, and not about where it is mounted (a tab is `{ id, title, render }`), so the UI can later move its
 * features into tabs of a side or top panel without changing the tabs.
 *
 * A tab is drawn the first time it is opened, and kept (hidden) afterwards.
 */

export interface SidePanelTab {
  id: string;
  title: string;
  /** Fill `container` with the tab's content. Called once, the first time the tab is opened. */
  render(container: HTMLElement): void;
}

export interface SidePanelHost {
  registerTab(tab: SidePanelTab): void;
  open(id: string): void;
  close(): void;
  /** Open the tab; if it is the one already shown, close the panel. */
  toggle(id: string): void;
  isOpen(): boolean;
  /** The tab shown, or null when the panel is closed. */
  activeTabId(): string | null;
  /** Called with the active tab's id after it changes, and with null after the panel closes. */
  onChange(listener: (activeId: string | null) => void): void;
}

interface TabEntry {
  tab: SidePanelTab;
  button: HTMLButtonElement;
  body: HTMLElement;
  rendered: boolean;
}

export function createSidePanelHost(root: HTMLElement): SidePanelHost {
  root.classList.add('side-panel');
  root.hidden = true;

  const header = document.createElement('div');
  header.className = 'side-panel-header';
  const tabList = document.createElement('div');
  tabList.className = 'side-panel-tabs';
  tabList.setAttribute('role', 'tablist');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'side-panel-close';
  closeButton.title = 'Close panel';
  closeButton.setAttribute('aria-label', 'Close panel');
  closeButton.setAttribute('data-side-panel-close', '');
  closeButton.textContent = '×';
  header.append(tabList, closeButton);

  const bodies = document.createElement('div');
  bodies.className = 'side-panel-bodies';
  root.append(header, bodies);

  const entries = new Map<string, TabEntry>();
  const listeners: Array<(activeId: string | null) => void> = [];
  let active: string | null = null;

  const notify = () => listeners.forEach((listener) => listener(active));

  function open(id: string): void {
    if (!entries.has(id)) throw new Error(`Unknown side panel tab: ${id}`);
    for (const [tabId, entry] of entries) {
      const selected = tabId === id;
      entry.body.hidden = !selected;
      entry.button.setAttribute('aria-selected', String(selected));
      if (selected && !entry.rendered) {
        entry.rendered = true;
        entry.tab.render(entry.body);
      }
    }
    root.hidden = false;
    active = id;
    notify();
  }

  function close(): void {
    if (active === null) return;
    root.hidden = true;
    active = null;
    notify();
  }

  closeButton.addEventListener('click', close);

  return {
    registerTab(tab) {
      if (entries.has(tab.id)) throw new Error(`Side panel tab already registered: ${tab.id}`);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'side-panel-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      button.setAttribute('data-tab-button', tab.id);
      button.textContent = tab.title;
      button.addEventListener('click', () => open(tab.id));
      tabList.append(button);

      const body = document.createElement('div');
      body.className = 'side-panel-body';
      body.setAttribute('role', 'tabpanel');
      body.setAttribute('data-tab-body', tab.id);
      body.hidden = true;
      bodies.append(body);

      entries.set(tab.id, { tab, button, body, rendered: false });
    },
    open,
    close,
    toggle(id) {
      if (active === id) close();
      else open(id);
    },
    isOpen: () => active !== null,
    activeTabId: () => active,
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}
