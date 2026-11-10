/**
 * Mounts the side panel on the page and registers its tabs. `main.ts` calls this once after the page markup
 * exists, and `refresh()` when another ontology is opened.
 */

import { DataFactory, type Store } from 'n3';
import { createSidePanelHost } from './sidePanelHost';
import { createQueryTab } from './queryTab';
import { createIndividualsTab } from './individualsTab';
import { createChecksTab } from './checksTab';
import { createChecksLibrary, describeOutcome } from '../../checks/checksLibrary';
import { mountPanelButtons } from './panelButtons';
import { createDataLoader, type DataPick } from '../../sparql/dataLoader';
import { attachDataDrop } from '../dataDrop';
import { countIndividuals, createIndividualIndex, type IndividualIndex } from '../../abox/individualIndex';
import { individualsButtonText } from '../../abox/individualsLabel';
import { matchIrisToGraph, type GraphIndex, type GraphMatch } from '../../sparql/graphMatches';
import type { DataSources } from '../../sparql/dataSources';
import type { IndividualsLayer } from '../../abox/individualsLayer';
import type { DataImages } from '../../abox/dataImages';
import { syncFolderNotices } from '../folderNotices';
import { setNotice } from '../statusNotices';
import { setIndividualSearchProvider } from '../individualSuggestions';
import { mountRelationshipNameMode } from '../relationshipNameMode';
import { formatTerm } from '../../sparql/formatTerm';
import { withStandardPrefixes } from '../../sparql/prefixHeader';

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
  /** The open ontology file's name, and where it was opened from (#209): the Individuals tab says how many individuals it holds itself. */
  getOntologySource?: () => { name: string; title?: string } | null;
  /** Where the images the values of the data name are (#228): shown in the detail of an individual. */
  dataImages?: DataImages;
  /** True while what is selected in the graph is only individuals: the toolbar then has no Edit button (#209). */
  isIndividualSelection?: () => boolean;
  /** In an iframe the app is a read-only view: no panel. */
  embedded: boolean;
}

export interface SidePanel {
  refresh(): void;
  /** Opens the panel on the Query tab and adds the data files an address names (?data=<url>, #205). */
  addDataUrls(urls: string[]): Promise<void>;
  /** Opens the panel on the Individuals tab (#211). */
  openIndividuals(): void;
  /** Opens the panel on the card of an individual (#217). */
  openIndividual(iri: string): void;
  /** Opens the panel on the Individuals tab and adds the folders, then the files as one selection (#234, #227). */
  addData(pick: DataPick): Promise<void>;
  /**
   * What is known of the classes changed (imports read in the background, #235): the Individuals tab names them again, and so
   * does a folder's warning about images not loaded (#240). Keeps the data.
   */
  schemaChanged(): void;
  /** Called with the progress of adding data ("Adding 2 of 3: …") and whether it goes on, for the loading screen (#239). */
  onDataStatus(listener: (status: string, loading: boolean) => void): void;
  /** Stops adding data, as the Cancel of the Individuals tab does: for the loading screen that covers it (#239). */
  cancelData(): void;
  /** Loads the checks an address names (?checks=<url>, #230): a manifest, a query or shapes; opens the Checks tab when it has shapes. */
  loadChecks(url: string): Promise<void>;
}

const NO_PANEL: SidePanel = {
  refresh: () => {},
  addDataUrls: async () => {},
  openIndividuals: () => {},
  openIndividual: () => {},
  addData: async () => {},
  schemaChanged: () => {},
  onDataStatus: () => {},
  cancelData: () => {},
  loadChecks: async () => {},
};

export function initSidePanel(deps: SidePanelDeps): SidePanel {
  const root = document.getElementById('sidePanel');
  const wrapper = document.getElementById('networkWrapper');
  if (!root || !wrapper) return NO_PANEL;

  if (deps.embedded) {
    root.hidden = true;
    return NO_PANEL;
  }

  const host = createSidePanelHost(root);
  // What the Individuals tab and the toolbar count show: the data without its hidden graphs (#224). Queries keep every graph.
  const stores = () => {
    const store = deps.getStore();
    return store ? [store, ...(deps.dataSources?.visibleStores() ?? [])] : [];
  };
  // The individuals of those stores, looked up by the Individuals tab and the search of the graph (#217): built when first asked
  // for after a change of the data, not on every keystroke.
  let index: IndividualIndex | null = null;
  const individualIndex = (): IndividualIndex => (index ??= createIndividualIndex(stores()));
  const dataChanged = (): void => {
    index = null;
  };
  // The reading of added data is the loader's, apart from any tab: the Individuals tab shows it beside the controls to add
  // data, and the Query tab shows it when an address (?data=) loads files while that is the tab shown (#211).
  const dataLoader = deps.dataSources ? createDataLoader({ sources: deps.dataSources, getStore: deps.getStore }) : undefined;

  // The checks of the session (#230, #231): saved queries for the Query tab, SHACL shapes for the Checks tab. Kept when another
  // ontology is opened: the checks of a domain apply to all of its files.
  const library = createChecksLibrary();

  const queryTab = createQueryTab({
    getStore: deps.getStore,
    getPrefixes: deps.getPrefixes,
    getHistoryKey: deps.getHistoryKey,
    getGraph: deps.getGraph,
    showInGraph: deps.showInGraph,
    dataSources: deps.dataSources,
    dataLoader,
    images: deps.dataImages,
    openIndividuals: () => host.open('individuals'),
    library,
  });
  host.registerTab(queryTab);

  // The Individuals tab (#208) reads the ontology's store and the data added to it, and is where data is added (#211).
  const individualsTab = createIndividualsTab({
    getStores: stores,
    getIndex: individualIndex,
    getPrefixes: deps.getPrefixes,
    getClassLabel: deps.getClassLabel,
    dataSources: deps.dataSources,
    dataLoader,
    layer: deps.individualsLayer,
    getOntologySource: deps.getOntologySource,
    images: deps.dataImages,
    // A class or a property in the detail of an individual that is in the graph can be selected there (#216).
    schemaLinks:
      deps.getGraph && deps.showInGraph
        ? {
            match: (iri) => {
              const graph = deps.getGraph!();
              const match = graph ? matchIrisToGraph([iri], graph) : null;
              return match && match.nodeIds.length + match.edgeIds.length > 0 ? match : null;
            },
            show: deps.showInGraph,
          }
        : undefined,
  });
  host.registerTab(individualsTab);

  const openIndividual = (iri: string): void => {
    host.open(individualsTab.id);
    individualsTab.show(iri);
  };

  // SHACL over the ontology and every graph of the data, as queries see it (a graph hidden from the Individuals tab is still checked).
  const checksTab = createChecksTab({
    library,
    getStores: () => {
      const store = deps.getStore();
      return store ? [store, ...(deps.dataSources?.stores() ?? [])] : [];
    },
    getPrefixes: deps.getPrefixes,
    isIndividual: (iri) => individualIndex().has(iri),
    openIndividual,
  });
  host.registerTab(checksTab);
  // The search of the graph finds the individuals that are not drawn, and opens the card of the one picked (#217).
  if (deps.individualsLayer) {
    setIndividualSearchProvider({
      find: (query, limit) => individualIndex().list({ search: query, offset: 0, limit }),
      nameOf: (iri) => formatTerm(DataFactory.namedNode(iri), withStandardPrefixes(deps.getPrefixes())).text,
      layer: deps.individualsLayer,
      open: openIndividual,
    });
  }
  // What a relationship's name selects, its definition or its instances (#214): a choice only when there are individuals.
  const relationshipNameMode = mountRelationshipNameMode();

  const buttons = mountPanelButtons(wrapper, [
    { id: 'queryPanelBtn', label: 'SPARQL query', title: 'Query the open ontology with SPARQL (read-only)', onClick: () => host.toggle(queryTab.id) },
    { id: 'individualsPanelBtn', label: '', title: '', onClick: () => host.toggle(individualsTab.id) },
    { id: 'checksPanelBtn', label: 'SHACL checks', title: 'Check the open ontology and its data against SHACL shapes (read-only)', onClick: () => host.toggle(checksTab.id) },
  ], { hideEdit: deps.isIndividualSelection });
  // Data files and folders dropped on the panel or the graph while the Individuals tab is open are added (#222, #227).
  if (dataLoader) {
    const drop = { enabled: () => host.activeTabId() === individualsTab.id, onDrop: (pick: DataPick) => void dataLoader.addPick(pick) };
    attachDataDrop(root, drop);
    attachDataDrop(wrapper, drop);
  }
  host.onChange((activeId) => {
    buttons.setPressed('queryPanelBtn', activeId === queryTab.id);
    buttons.setPressed('individualsPanelBtn', activeId === individualsTab.id);
    buttons.setPressed('checksPanelBtn', activeId === checksTab.id);
  });

  /** The label of the Individuals button follows what there is: an invitation to add some, or the count. */
  const updateIndividualsButton = (): void => {
    const count = countIndividuals(stores());
    const { label, title } = individualsButtonText(count);
    // The option for how individuals are laid out only means something when there are some.
    const relaxToggle = document.getElementById('relaxIndividualsWrap');
    if (relaxToggle) relaxToggle.style.display = count > 0 ? 'flex' : 'none';
    relationshipNameMode?.setVisible(count > 0);
    buttons.setLabel('individualsPanelBtn', label);
    buttons.setTitle('individualsPanelBtn', title);
  };
  updateIndividualsButton();
  // What a folder could not show, as a warning in the bottom bar that pops up on Windows (#240).
  // It names the classes of the images not loaded, by their labels once the ontologies the data names are read (schemaChanged).
  const sayFolderNotices = deps.dataSources ? syncFolderNotices(deps.dataSources, setNotice, { classLabel: deps.getClassLabel }) : () => {};
  deps.dataSources?.onChange(() => {
    dataChanged();
    deps.individualsLayer?.invalidate();
    individualsTab.refresh();
    updateIndividualsButton();
  });

  return {
    refresh: () => {
      dataChanged();
      deps.individualsLayer?.reset();
      queryTab.refresh();
      individualsTab.refresh();
      checksTab.refresh();
      updateIndividualsButton();
    },
    async addDataUrls(urls) {
      if (!urls.length || !dataLoader) return;
      host.open(queryTab.id);
      await dataLoader.addUrls(urls);
    },
    openIndividuals: () => host.open(individualsTab.id),
    openIndividual,
    cancelData: () => dataLoader?.cancel(),
    async loadChecks(url) {
      const outcome = await library.addUrl(url);
      // The shapes are what is not seen elsewhere: their tab opens. Queries alone wait in the Query tab's list.
      if (outcome.shapes) host.open(checksTab.id);
      else if (outcome.queries) host.open(queryTab.id);
      if (outcome.problems.length) setNotice('checks', describeOutcome(outcome));
    },
    onDataStatus(listener) {
      dataLoader?.onChange(() => listener(dataLoader.status(), dataLoader.loading()));
    },
    schemaChanged() {
      deps.individualsLayer?.invalidate();
      individualsTab.refresh();
      sayFolderNotices();
    },
    async addData(pick) {
      if ((!pick.files.length && !pick.folders.length) || !dataLoader) return;
      host.open(individualsTab.id);
      await dataLoader.addPick(pick);
    },
  };
}
