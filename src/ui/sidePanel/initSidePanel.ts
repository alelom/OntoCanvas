/**
 * Mounts the side panel on the page and registers its tabs. `main.ts` calls this once after the page markup
 * exists, and `refresh()` when another ontology is opened.
 */

import type { Store } from 'n3';
import { createSidePanelHost } from './sidePanelHost';
import { createQueryTab } from './queryTab';
import { createIndividualsTab } from './individualsTab';
import { mountPanelButtons } from './panelButtons';
import { createDataLoader } from '../../sparql/dataLoader';
import { countIndividuals } from '../../abox/individualIndex';
import { individualsButtonText } from '../../abox/individualsLabel';
import type { GraphIndex, GraphMatch } from '../../sparql/graphMatches';
import type { DataSources } from '../../sparql/dataSources';
import type { IndividualsLayer } from '../../abox/individualsLayer';

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
  /** The data added to the open ontology, queried with it (#205). */
  dataSources?: DataSources;
  /** The label a class has in the graph, for the Individuals tab (#208). */
  getClassLabel?: (classIri: string) => string | null;
  /** What is drawn of the individuals in the graph (#209): the Individuals tab draws into it and clears it. */
  individualsLayer?: IndividualsLayer;
  /** In an iframe the app is a read-only view: no panel. */
  embedded: boolean;
}

export interface SidePanel {
  refresh(): void;
  /** Opens the panel on the Query tab and adds the data files an address names (?data=<url>, #205). */
  addDataUrls(urls: string[]): Promise<void>;
  /** Opens the panel on the Individuals tab (#211). */
  openIndividuals(): void;
}

const NO_PANEL: SidePanel = { refresh: () => {}, addDataUrls: async () => {}, openIndividuals: () => {} };

export function initSidePanel(deps: SidePanelDeps): SidePanel {
  const root = document.getElementById('sidePanel');
  const wrapper = document.getElementById('networkWrapper');
  if (!root || !wrapper) return NO_PANEL;

  if (deps.embedded) {
    root.hidden = true;
    return NO_PANEL;
  }

  const host = createSidePanelHost(root);
  const stores = () => {
    const store = deps.getStore();
    return store ? [store, ...(deps.dataSources?.stores() ?? [])] : [];
  };
  // The reading of added data is the loader's, apart from any tab: the Individuals tab shows it beside the controls to add
  // data, and the Query tab shows it when an address (?data=) loads files while that is the tab shown (#211).
  const dataLoader = deps.dataSources ? createDataLoader({ sources: deps.dataSources, getStore: deps.getStore }) : undefined;

  const queryTab = createQueryTab({
    getStore: deps.getStore,
    getPrefixes: deps.getPrefixes,
    getHistoryKey: deps.getHistoryKey,
    getGraph: deps.getGraph,
    showInGraph: deps.showInGraph,
    dataSources: deps.dataSources,
    dataLoader,
    openIndividuals: () => host.open('individuals'),
  });
  host.registerTab(queryTab);

  // The Individuals tab (#208) reads the ontology's store and the data added to it, and is where data is added (#211).
  const individualsTab = createIndividualsTab({
    getStores: stores,
    getPrefixes: deps.getPrefixes,
    getClassLabel: deps.getClassLabel,
    dataSources: deps.dataSources,
    dataLoader,
    layer: deps.individualsLayer,
  });
  host.registerTab(individualsTab);

  const buttons = mountPanelButtons(wrapper, [
    { id: 'queryPanelBtn', label: 'SPARQL query', title: 'Query the open ontology with SPARQL (read-only)', onClick: () => host.toggle(queryTab.id) },
    { id: 'individualsPanelBtn', label: '', title: '', onClick: () => host.toggle(individualsTab.id) },
  ]);
  host.onChange((activeId) => {
    buttons.setPressed('queryPanelBtn', activeId === queryTab.id);
    buttons.setPressed('individualsPanelBtn', activeId === individualsTab.id);
  });

  /** The label of the Individuals button follows what there is: an invitation to add some, or the count. */
  const updateIndividualsButton = (): void => {
    const { label, title } = individualsButtonText(countIndividuals(stores()));
    buttons.setLabel('individualsPanelBtn', label);
    buttons.setTitle('individualsPanelBtn', title);
  };
  updateIndividualsButton();
  deps.dataSources?.onChange(() => {
    deps.individualsLayer?.invalidate();
    individualsTab.refresh();
    updateIndividualsButton();
  });

  return {
    refresh: () => {
      deps.individualsLayer?.reset();
      queryTab.refresh();
      individualsTab.refresh();
      updateIndividualsButton();
    },
    async addDataUrls(urls) {
      if (!urls.length || !dataLoader) return;
      host.open(queryTab.id);
      await dataLoader.addUrls(urls);
    },
    openIndividuals: () => host.open(individualsTab.id),
  };
}
