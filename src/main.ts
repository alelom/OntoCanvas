import 'vis-network/styles/vis-network.css';
import { storeToTurtle } from './ontology/serialize';

import { session, fileState, canvasState, editState } from './state/appState';
import { installTestLogCapture } from './e2e/testLogCapture';
import { renderApp } from './ui/appShell';
import { initSidePanel } from './ui/sidePanel/initSidePanel';
import { historyKeyOf } from './sparql/queryHistory';
import { selectInGraph } from './graph/selectResults';
import { createDataSources, whenSourceListChanges } from './sparql/dataSources';
import { createIndividualsLayer, isIndividualNodeId, isIndividualEdgeId } from './abox/individualsLayer';
import { createDataImages } from './abox/dataImages';
import { getDataUrlsFromParams, getChecksUrlsFromParams } from './utils/urlParams';
import { updateSelectionInfoDisplay } from './ui/selectionInfo';
import { currentGraphIndex } from './graph/drawnGraphIndex';
import { showResultInGraph, clearResultInGraph } from './graph/showResultInGraph';

import { isDebugMode, debugLog } from './utils/debug';
import {
  showContextMenu,
  setTermUriResolver,
  setClassIndividualsProvider,
  setImportedClassProvider,
  setVersionPinnedUriResolver,
} from './ui/contextMenu';
import { versionPinnedUri } from './lib/versionPinnedUri';
import { readOntologyVersion, bareIri } from './lib/ontologyVersion';

import { attachEditorTestHook } from './e2e/editorTestHook';
import {
  showOpenOntologyModal,
  hideOpenOntologyModal,
  setOnExploreDataFiles,
} from './ui/openOntologyModal';
import { exploreDataFiles } from './workflows/exploreDataFiles';
import { importedClassLookup } from './abox/importedClasses';
import { ontologiesOfDataRead, openOntologiesOfData } from './workflows/dataOntologies';
import { setLoadingCancel, setLoadingText, underLoadingScreen, withinMs } from './ui/modals';

import { setNotice } from './ui/statusNotices';
import { openOnStartup } from './ui/startupOpen';
import { handleUrlParameterLoad } from './lib/urlParamLoader';

import {
  setImportVersionLookup,
} from './ui/externalRefs';
import { getShouldShowTopMenu, isEmbedded } from './utils/embedMode';
import {
  getRelationshipLabel,
} from './ui/relationshipUtils';

import './style.css';

import { updateSaveButtonVisibility, updateSerializerDropdown } from './ui/fileBar';

import { registerActions } from './state/actions';
import { performRedo, performUndo } from './workflows/undoRedo';
import { saveTtl } from './workflows/saveTtlFlow';

import { showAddNodeModal } from './ui/addNodeModal';
import { showAddEdgeModal } from './ui/addEdgeModal';
import { resolveTerm } from './ui/selectionInfo';
import { showEditRelationshipTypeModal } from './ui/relationshipTypeModal';
import { performDeleteSelection } from './workflows/deleteSelection';
import { loadFromUrl, loadTtlAndRender } from './workflows/loadOntologyFlow';
import { setupEventListeners } from './ui/eventListeners';
import { deleteDataPropertyWithConfirm, initDataPropsMenu, showEditDataPropertyModal } from './ui/dataPropertyModals';
import { openEditModalForEdge, openEditModalForNode, showEditEdgeModal } from './ui/editModals';
import { applyFilter } from './graph/applyFilter';
import { classIndividualsAction, classIriOfNode } from './graph/classIndividuals';

/** What the loading screen says while the data is added, then while the ontologies it names are read (#239). */
const ADDING_DATA = 'Adding the data…';
const READING_DATA_ONTOLOGIES = 'Reading the ontologies the data names…';
/** The longest the loading screen waits for the ontologies the data names: they name the classes when they come, later. */
const DATA_ONTOLOGIES_WAIT_MS = 3000;

/**
 * Adds data on an initial load (?data=, Explore data files…) under the loading screen, with a Cancel while the data is read
 * (the screen covers the Individuals tab's), then waits a little for the ontologies the data names, so the classes are
 * usually drawn once, named (#239).
 */
function addDataUnderLoadingScreen(add: () => Promise<unknown>): Promise<void> {
  return underLoadingScreen(async () => {
    setLoadingCancel(() => session.sidePanel?.cancelData());
    await add();
    setLoadingCancel(null);
    setLoadingText(READING_DATA_ONTOLOGIES);
    await withinMs(ontologiesOfDataRead(), DATA_ONTOLOGIES_WAIT_MS);
  }, ADDING_DATA);
}

setTermUriResolver((kind, id) => resolveTerm(kind, id)?.uri ?? null);
setClassIndividualsProvider((nodeId) => {
  // A class node of the graph, or the node of a class of the data that is not in it (#239).
  const uri = resolveTerm('node', nodeId)?.uri ?? classIriOfNode(nodeId, []);
  return uri && session.individualsLayer ? classIndividualsAction(session.individualsLayer, uri) : null;
});
setVersionPinnedUriResolver((kind, id) =>
  versionPinnedUri(resolveTerm(kind, id)?.uri ?? null, session.ttlStore ? readOntologyVersion(session.ttlStore) : null)
);

/** What the imports dialog shows of an import's version (#131); null for a reference that is not an import. */
setImportVersionLookup((url) => {
  if (!session.ttlStore) return null;
  const isImport = session.ttlStore.getQuads(null, 'http://www.w3.org/2002/07/owl#imports', null, null).some((q) => bareIri(q.object.value) === bareIri(url));
  if (!isImport) return null;
  const imported = session.importedOntologies.find((o) => bareIri(o.url) === bareIri(url));
  if (imported) return { state: 'read', version: readOntologyVersion(imported.store), newer: session.importNewerVersions.get(imported.url) };
  return session.importsBeingRead ? { state: 'reading' } : { state: 'unread' };
});

document.addEventListener('keydown', (e) => {
  const list = document.getElementById('searchAutocomplete');
  if (!list?.classList.contains('visible')) return;
  const items = list.querySelectorAll('.suggestion');
  let idx = parseInt(list.dataset.highlight || '-1', 10);
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    idx = Math.min(idx + 1, items.length - 1);
    list.dataset.highlight = String(idx);
    items.forEach((el, i) => el.classList.toggle('highlight', i === idx));
    if (idx >= 0 && items[idx]) items[idx].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    idx = Math.max(idx - 1, -1);
    list.dataset.highlight = String(idx);
    items.forEach((el, i) => el.classList.toggle('highlight', i === idx));
  } else if (e.key === 'Enter' && idx >= 0 && items[idx]) {
    // Enter does what a click does: a class or a relationship is searched for, an individual drawn and opened (#217).
    e.preventDefault();
    (items[idx] as HTMLElement).click();
  } else if (e.key === 'Escape') {
    list.classList.remove('visible');
  }
});

document.addEventListener('click', (e) => {
  const input = document.getElementById('searchQuery');
  const list = document.getElementById('searchAutocomplete');
  if (
    input &&
    list &&
    !input.contains(e.target as Node) &&
    !list.contains(e.target as Node)
  ) {
    list.classList.remove('visible');
  }
});

registerActions({ applyFilter, initDataPropsMenu, deleteDataPropertyWithConfirm });
renderApp();
const dataSources = createDataSources();
// The ontologies the data was made with are opened on their own, as context, whenever data is added (#236, #239).
// Only when a source is added or removed: showing or hiding a graph changes nothing they could name.
whenSourceListChanges(dataSources, () => void openOntologiesOfData(dataSources.stores()));
// The classes the ontologies loaded as context declare (its imports, #235): they name the classes of individuals.
const importedClass = importedClassLookup(() => session.importedOntologies);
// The node of such a class, drawn for its individuals, offers to open the ontology that declares it.
setImportedClassProvider((classIri) => importedClass(classIri)?.definedBy ?? null);
// The images the values of the data name (#228): from its folder, next to its address, or against where the ontology was opened.
const dataImages = createDataImages({
  sources: dataSources,
  getOntology: () => (session.ttlStore ? { store: session.ttlStore, location: fileState.loadedFilePath } : null),
});
session.individualsLayer = createIndividualsLayer({
  // The data without its hidden graphs (#224): a hidden graph's individuals are not drawn.
  getStores: () => (session.ttlStore ? [session.ttlStore, ...dataSources.visibleStores()] : dataSources.visibleStores()),
  classInfo: importedClass,
  imagesOf: (iri) => dataImages.imagesOf(iri),
});
// Drawing or clearing individuals redraws the graph where it is; after a draw the user started, the view fits what was drawn (#216).
session.individualsLayer.onChange(({ kind, drawn, ...asked }) => applyFilter(true, kind === 'draw' ? { fitTo: drawn, ...asked } : undefined));
session.sidePanel = initSidePanel({
  getStore: () => session.ttlStore,
  getPrefixes: () => session.currentPrefixMap,
  getHistoryKey: () => historyKeyOf(session.ttlStore, fileState.loadedFilePath ?? fileState.loadedFileName),
  // The class graph and the individuals drawn over it (#207).
  getGraph: currentGraphIndex,
  showResult: showResultInGraph,
  clearResult: clearResultInGraph,
  showInGraph: (match) => {
    const network = canvasState.network;
    if (!network) return;
    selectInGraph(network, match);
    updateSelectionInfoDisplay(network);
  },
  dataSources,
  individualsLayer: session.individualsLayer,
  dataImages,
  getOntologySource: () => (fileState.loadedFileName ? { name: fileState.loadedFileName, title: fileState.loadedFilePath ?? undefined } : null),
  isIndividualSelection: () => {
    const network = canvasState.network;
    if (!network) return false;
    const nodes = network.getSelectedNodes().map(String);
    const edges = network.getSelectedEdges().map(String);
    return nodes.length + edges.length > 0 && nodes.every(isIndividualNodeId) && edges.every(isIndividualEdgeId);
  },
  getClassLabel: (classIri) => session.rawData.nodes.find((n) => n.uri === classIri)?.label ?? importedClass(classIri)?.label ?? null,
  embedded: isEmbedded(),
});
// The loading screen over an initial load says how adding the data goes ("Adding 2 of 3: …", #239).
session.sidePanel.onDataStatus((status, loading) => {
  if (loading && status) setLoadingText(status);
});
const appEl = document.getElementById('app');
if (appEl && (!getShouldShowTopMenu() || isEmbedded())) {
  appEl.classList.add('embed-no-menu');
  document.body.classList.add('embed-no-menu');
}
// Embedded (iframe or ?embed): compact, read-only view. Hide the edges legend (CSS), show the
// "Open in a new tab" button. Editing is gated in the handlers via isEmbedded().
if (isEmbedded()) {
  document.body.classList.add('ontocanvas-embedded');
  const openBtn = document.getElementById('openInNewTab');
  if (openBtn) openBtn.style.display = '';
}
setupEventListeners();
// Data files or a folder with no ontology to open first (#234, #227): an empty workspace ontology, then the data.
setOnExploreDataFiles((pick) =>
  void exploreDataFiles(pick, {
    openOntology: (ttl, name) => loadTtlAndRender(ttl, name, null),
    showNote: (text) => {
      setNotice('no-classes', null);
      setNotice('workspace', text);
    },
    // Under the loading screen until the ontologies the data names are read: the classes are drawn once, named.
    addData: (pick) => addDataUnderLoadingScreen(async () => session.sidePanel?.addData(pick)),
  })
);
// Update serializer dropdown after DOM is ready (in case it was rendered)
if (isDebugMode()) {
  setTimeout(() => updateSerializerDropdown(), 0);
}
// Load the ontology named by the URL parameter, otherwise show the "Open ontology" dialog — unless an
// ontology was loaded meanwhile, which the dialog would otherwise cover.
setTimeout(() => {
  // The data files named next to the ontology (?data=<url>, #205), read before the load rewrites the address bar.
  const dataUrls = getDataUrlsFromParams();
  const checksUrls = getChecksUrlsFromParams();
  const opened = openOnStartup({
    loadFromUrlParameter: async () => {
      const loaded = await handleUrlParameterLoad(
        loadFromUrl,
        async (content: string, fileName: string, pathHint: string) => {
          await loadTtlAndRender(content, fileName, null, pathHint);
        },
        showOpenOntologyModal,
        hideOpenOntologyModal
      );
      // The data is added to the ontology that was just opened, so only once it is.
      if (loaded && session.ttlStore && dataUrls.length) {
        await addDataUnderLoadingScreen(async () => session.sidePanel?.addDataUrls(dataUrls));
      }
      return loaded;
    },
    hasOntology: () => session.ttlStore !== null,
    showOpenOntologyModal,
  });
  // The checks named by the address (?checks=<url>, #230), in order, once the ontology and its data are read: their tab is the one
  // left open. They need no ontology, so they are loaded whether one opened or not.
  void opened.catch(() => {}).then(async () => {
    for (const url of checksUrls) await session.sidePanel?.loadChecks(url);
  });
}, 100);

// Capture tagged console output for the E2E tests (see src/e2e/testLogCapture.ts).
const { addTestLog, getTestLogs } = installTestLogCapture(isDebugMode);

// E2E test hook: attach programmatic control for browser automation (e.g. Playwright).
attachEditorTestHook({
  hideOpenOntologyModal,
  getRawData: () => session.rawData,
  getNetwork: () => canvasState.network,
  showContextMenu,
  performDeleteSelection,
  performUndo,
  performRedo,
  getUndoStack: () => editState.undoStack,
  getRelationshipLabel,
  getObjectProperties: () => session.objectProperties,
  getExternalOntologyReferences: () => session.externalOntologyReferences,
  openEditModalForNode,
  openEditModalForEdge,
  showEditEdgeModal,
  showAddEdgeModal,
  showAddNodeModal,
  showEditDataPropertyModal,
  getDataProperties: () => session.dataProperties,
  getAnnotationProperties: () => session.annotationProperties,
  getTtlStore: () => session.ttlStore,
  storeToTurtle,
  applyFilter,
  showEditRelationshipTypeModal,
  debugLog,
  addTestLog,
  getTestLogs,
  isDebugMode,
  saveTtl,
  setHasUnsavedChanges: (value: boolean) => { fileState.hasUnsavedChanges = value; },
  updateSaveButtonVisibility,
  getHasUnsavedChanges: () => fileState.hasUnsavedChanges,
  loadTtlDirectly: async (ttlString: string, fileName?: string, pathHint?: string) => {
    // For tests: call loadTtlAndRender directly, bypassing file input UI
    // Set loadedFilePath/loadedFileName so IndexedDB operations use the right keys
    // Enable test mode to skip slow operations (IndexedDB, rendering delays)
    fileState.loadedFilePath = pathHint ?? fileName ?? null;
    fileState.loadedFileName = fileName ?? null;
    fileState.skipSlowOperationsForTests = true;
    try {
      await loadTtlAndRender(ttlString, fileName, null, pathHint);
    } finally {
      fileState.skipSlowOperationsForTests = false;
    }
  },
});
