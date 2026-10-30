import 'vis-network/styles/vis-network.css';
import { storeToTurtle } from './ontology/serialize';

import { session, fileState, canvasState, editState } from './state/appState';
import { installTestLogCapture } from './e2e/testLogCapture';
import { renderApp } from './ui/appShell';
import { initSidePanel } from './ui/sidePanel/initSidePanel';
import { historyKeyOf } from './sparql/queryHistory';
import { selectInGraph } from './graph/selectResults';
import { createDataSources } from './sparql/dataSources';
import { createIndividualsLayer, isIndividualNodeId, isIndividualEdgeId } from './abox/individualsLayer';
import { getDataUrlsFromParams } from './utils/urlParams';
import { updateSelectionInfoDisplay } from './ui/selectionInfo';

import { isDebugMode, debugLog } from './utils/debug';
import {
  showContextMenu,
  setTermUriResolver,
  setVersionPinnedUriResolver,
} from './ui/contextMenu';
import { versionPinnedUri } from './lib/versionPinnedUri';
import { readOntologyVersion, bareIri } from './lib/ontologyVersion';

import { attachEditorTestHook } from './e2e/editorTestHook';
import {
  showOpenOntologyModal,
  hideOpenOntologyModal,
} from './ui/openOntologyModal';
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

setTermUriResolver((kind, id) => resolveTerm(kind, id)?.uri ?? null);
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
  const input = document.getElementById('searchQuery');
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
    e.preventDefault();
    (input as HTMLInputElement).value = (items[idx] as HTMLElement).dataset
      .value!;
    list.classList.remove('visible');
    applyFilter();
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
session.individualsLayer = createIndividualsLayer({
  getStores: () => (session.ttlStore ? [session.ttlStore, ...dataSources.stores()] : dataSources.stores()),
});
// Drawing or clearing individuals redraws the graph where it is.
session.individualsLayer.onChange(() => applyFilter(true));
session.sidePanel = initSidePanel({
  getStore: () => session.ttlStore,
  getPrefixes: () => session.currentPrefixMap,
  getHistoryKey: () => historyKeyOf(session.ttlStore, fileState.loadedFilePath ?? fileState.loadedFileName),
  getGraph: () => {
    const drawn = session.currentGraphDataForBuild;
    return drawn ? { nodes: drawn.nodes, edges: drawn.edges, objectProperties: session.objectProperties } : null;
  },
  showInGraph: (match) => {
    const network = canvasState.network;
    if (!network) return;
    selectInGraph(network, match);
    updateSelectionInfoDisplay(network);
  },
  dataSources,
  individualsLayer: session.individualsLayer,
  getOntologySource: () => (fileState.loadedFileName ? { name: fileState.loadedFileName, title: fileState.loadedFilePath ?? undefined } : null),
  isIndividualSelection: () => {
    const network = canvasState.network;
    if (!network) return false;
    const nodes = network.getSelectedNodes().map(String);
    const edges = network.getSelectedEdges().map(String);
    return nodes.length + edges.length > 0 && nodes.every(isIndividualNodeId) && edges.every(isIndividualEdgeId);
  },
  getClassLabel: (classIri) => session.rawData.nodes.find((n) => n.uri === classIri)?.label ?? null,
  embedded: isEmbedded(),
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
// Update serializer dropdown after DOM is ready (in case it was rendered)
if (isDebugMode()) {
  setTimeout(() => updateSerializerDropdown(), 0);
}
// Load the ontology named by the URL parameter, otherwise show the "Open ontology" dialog — unless an
// ontology was loaded meanwhile, which the dialog would otherwise cover.
setTimeout(() => {
  // The data files named next to the ontology (?data=<url>, #205), read before the load rewrites the address bar.
  const dataUrls = getDataUrlsFromParams();
  void openOnStartup({
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
      if (loaded && session.ttlStore) await session.sidePanel?.addDataUrls(dataUrls);
      return loaded;
    },
    hasOntology: () => session.ttlStore !== null,
    showOpenOntologyModal,
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
