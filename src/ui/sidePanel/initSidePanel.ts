/**
 * Mounts the side panel on the page and registers its tabs. `main.ts` calls this once after the page markup
 * exists, and `refresh()` when another ontology is opened.
 */

import type { Store } from 'n3';
import { createSidePanelHost } from './sidePanelHost';
import { createQueryTab } from './queryTab';
import { mountQueryButton } from './queryButton';
import type { GraphIndex, GraphMatch } from '../../sparql/graphMatches';

export interface SidePanelDeps {
  getStore: () => Store | null;
  /** The prefixes the open file declares. */
  getPrefixes: () => Record<string, string>;
  /** What the open file's query history is kept under (its ontology IRI, or its name); null when neither is known. */
  getHistoryKey?: () => string | null;
  /** What the graph draws now, to match a query result against (#203). */
  getGraph?: () => GraphIndex | null;
  /** Selects what a query result names in the graph and brings it into view (#203). */
  showInGraph?: (match: GraphMatch) => void;
  /** In an iframe the app is a read-only view: no panel. */
  embedded: boolean;
}

export function initSidePanel(deps: SidePanelDeps): { refresh(): void } {
  const root = document.getElementById('sidePanel');
  const wrapper = document.getElementById('networkWrapper');
  if (!root || !wrapper) return { refresh: () => {} };

  if (deps.embedded) {
    root.hidden = true;
    return { refresh: () => {} };
  }

  const host = createSidePanelHost(root);
  const queryTab = createQueryTab({
    getStore: deps.getStore,
    getPrefixes: deps.getPrefixes,
    getHistoryKey: deps.getHistoryKey,
    getGraph: deps.getGraph,
    showInGraph: deps.showInGraph,
  });
  host.registerTab(queryTab);

  const button = mountQueryButton(wrapper, () => host.toggle(queryTab.id));
  host.onChange((activeId) => button.setPressed(activeId === queryTab.id));

  return { refresh: () => queryTab.refresh() };
}
