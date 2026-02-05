import { DataSet } from 'vis-data/esnext';
import { Network } from 'vis-network/esnext';
import 'vis-network/styles/vis-network.css';
import {
  parseTtlToGraph,
  updateLabelInStore,
  updateLabellableInStore,
  storeToTurtle,
} from './parser';
import type { GraphData, GraphEdge, GraphNode } from './types';
import {
  wrapText,
  getEdgeTypes,
  getNodeColor,
  getDefaultEdgeColors,
  getDefaultColor,
  getSpacing,
  computeNodeDepths,
  computeWeightedLayout,
  estimateNodeDimensions,
  resolveOverlaps,
  matchesSearch,
} from './graph';
import './style.css';

const IDB_NAME = 'OntologyEditor';
const IDB_STORE = 'lastFile';
const IDB_KEY = 'handle';

async function getLastFileFromIndexedDB(): Promise<{
  handle: FileSystemFileHandle;
  name: string;
  pathHint?: string;
} | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.close();
        resolve(null);
        return;
      }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const getReq = store.get(IDB_KEY);
      getReq.onsuccess = () => {
        const v = getReq.result;
        resolve(v && v.handle && v.name ? { handle: v.handle, name: v.name, pathHint: v.pathHint } : null);
      };
      getReq.onerror = () => resolve(null);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

async function saveLastFileToIndexedDB(
  handle: FileSystemFileHandle,
  name: string,
  pathHint?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ handle, name, pathHint }, IDB_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

function updateLoadLastOpenedButton(name: string | null, pathHint?: string): void {
  const btn = document.getElementById('loadLastOpened') as HTMLButtonElement;
  if (!btn) return;
  if (name) {
    btn.textContent = `Load last opened: ${name}`;
    btn.title = pathHint ?? name;
    btn.disabled = false;
    btn.dataset.hasLast = '1';
  } else {
    btn.textContent = 'Load last opened: (none)';
    btn.title = 'Select a TTL file first to enable';
    btn.disabled = true;
    btn.dataset.hasLast = '';
  }
}

let rawData: GraphData = { nodes: [], edges: [] };
let network: Network | null = null;
let ttlStore: import('n3').Store | null = null;
let loadedFileName: string | null = null;
let loadedFilePath: string | null = null;
let fileHandle: FileSystemFileHandle | null = null;
let hasUnsavedChanges = false;
let overwriteFile = true;
const container = document.getElementById('network')!;
const COLORS = {
  labellable: '#2ecc71',
  nonLabellable: '#b8b8b8',
  unknown: '#95a5a6',
  default: '#3498db',
};
const SPACING = getSpacing();

function initEdgeStylesMenu(
  edgeStylesContent: HTMLElement,
  onApply: () => void
): void {
  edgeStylesContent.innerHTML = '';
  getEdgeTypes(rawData.edges).forEach((type) => {
    const color = getDefaultEdgeColors()[type] || getDefaultColor();
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
    row.innerHTML = `
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-show-cb" data-type="${type}" checked>
        <span>Show</span>
      </label>
      <span style="font-weight: bold; font-size: 14px; min-width: 100px;">${type}</span>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-label-cb" data-type="${type}">
        <span>Label</span>
      </label>
      <label style="display: flex; align-items: center; gap: 4px;">
        <span style="font-size: 11px;">Color:</span>
        <input type="color" class="edge-color-picker" data-type="${type}" value="${color}" style="width: 28px; height: 22px; padding: 0; border: 1px solid #ccc; cursor: pointer;">
      </label>
    `;
    edgeStylesContent.appendChild(row);
  });
  edgeStylesContent
    .querySelectorAll('.edge-show-cb, .edge-label-cb, .edge-color-picker')
    .forEach((el) => el.addEventListener('change', onApply));
}

function getEdgeStyleConfig(
  edgeStylesContent: HTMLElement
): Record<string, { show: boolean; showLabel: boolean; color: string }> {
  const config: Record<string, { show: boolean; showLabel: boolean; color: string }> = {};
  getEdgeTypes(rawData.edges).forEach((type) => {
    const showCb = edgeStylesContent.querySelector(
      `.edge-show-cb[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const labelCb = edgeStylesContent.querySelector(
      `.edge-label-cb[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const colorEl = edgeStylesContent.querySelector(
      `.edge-color-picker[data-type="${type}"]`
    ) as HTMLInputElement | null;
    config[type] = {
      show: showCb?.checked ?? true,
      showLabel: labelCb?.checked ?? false,
      color: colorEl?.value ?? getDefaultEdgeColors()[type] ?? getDefaultColor(),
    };
  });
  return config;
}

function buildNetworkData(filter: {
  labellable: string;
  colorBy: string;
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  searchQuery: string;
  includeNeighbors: boolean;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string }>;
  layoutMode: string;
}): { nodes: DataSet; edges: DataSet } {
  let filteredNodes = rawData.nodes.filter((n) => {
    if (filter.labellable === 'all') return true;
    if (filter.labellable === 'true') return n.labellableRoot === true;
    if (filter.labellable === 'false') return n.labellableRoot === false;
    return true;
  });
  let nodeIds = new Set(filteredNodes.map((n) => n.id));
  let filteredEdges = rawData.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
  );

  const searchQuery = (filter.searchQuery || '').trim();
  if (searchQuery) {
    const matchingNodeIds = new Set<string>();
    filteredNodes.forEach((n) => {
      if (matchesSearch(n, null, searchQuery)) matchingNodeIds.add(n.id);
    });
    filteredEdges.forEach((e) => {
      if (matchesSearch(null, e, searchQuery)) {
        matchingNodeIds.add(e.from);
        matchingNodeIds.add(e.to);
      }
    });
    let searchMatchNodeIds = new Set(matchingNodeIds);
    if (filter.includeNeighbors) {
      filteredEdges.forEach((e) => {
        if (matchingNodeIds.has(e.from) || matchingNodeIds.has(e.to)) {
          searchMatchNodeIds.add(e.from);
          searchMatchNodeIds.add(e.to);
        }
      });
    }
    filteredNodes = filteredNodes.filter((n) => searchMatchNodeIds.has(n.id));
    nodeIds = new Set(filteredNodes.map((n) => n.id));
    filteredEdges = rawData.edges.filter(
      (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
    );
  }

  const edgeStyleConfig = filter.edgeStyleConfig;
  filteredEdges = filteredEdges.filter((e) => {
    const style = edgeStyleConfig[e.type];
    return !style || style.show !== false;
  });

  const layoutMode = filter.layoutMode;
  const wrapChars = filter.wrapChars ?? 10;
  const minFontSize = Math.max(8, Math.min(96, filter.minFontSize ?? 20));
  const maxFontSize = Math.max(minFontSize, Math.min(96, filter.maxFontSize ?? 60));
  const { depth, maxDepth } = computeNodeDepths(nodeIds, filteredEdges);

  let nodePositions: Record<string, { x: number; y: number }> = {};
  if (layoutMode === 'weighted') {
    const nodeDimensions = new Map<string, { width: number; height: number }>();
    filteredNodes.forEach((n) => {
      const fontSize =
        maxDepth > 0
          ? Math.round(
              minFontSize +
                ((maxFontSize - minFontSize) * (maxDepth - (depth[n.id] ?? 0))) /
                  maxDepth
            )
          : maxFontSize;
      nodeDimensions.set(
        n.id,
        estimateNodeDimensions(n.label, wrapChars, fontSize)
      );
    });
    nodePositions = computeWeightedLayout(
      nodeIds,
      filteredEdges,
      SPACING,
      nodeDimensions
    );
    nodePositions = resolveOverlaps(
      nodePositions,
      nodeIds,
      filteredEdges,
      nodeDimensions,
      { minPadding: 8 }
    );
  }

  const nodes = filteredNodes.map((n) => {
    const pos = nodePositions[n.id];
    const d = depth[n.id] ?? 0;
    const fontSize =
      maxDepth > 0
        ? Math.round(
            minFontSize +
              (maxFontSize - minFontSize) * (maxDepth - d) / maxDepth
          )
        : maxFontSize;
    const node: Record<string, unknown> = {
      id: n.id,
      label: wrapText(n.label, wrapChars),
      labellableRoot: n.labellableRoot,
      color: {
        background: getNodeColor(n, filter.colorBy),
        border: '#2c3e50',
      },
      font: { size: fontSize, color: '#2c3e50' },
    };
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
    }
    return node;
  });

  const edges = filteredEdges.map((e) => {
    const style = edgeStyleConfig[e.type] || {
      showLabel: false,
      color: getDefaultColor(),
    };
    return {
      from: e.from,
      to: e.to,
      arrows: 'to',
      label: style.showLabel ? e.type : '',
      color: { color: style.color, highlight: style.color },
    };
  });

  return {
    nodes: new DataSet(nodes),
    edges: new DataSet(edges),
  };
}

function getNetworkOptions(layoutMode: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    nodes: {
      shape: 'box',
      margin: 10,
      font: { size: 20, color: '#2c3e50' },
    },
    edges: { smooth: { type: 'cubicBezier' }, arrows: 'to' },
  };
  if (layoutMode === 'weighted') {
    base.physics = { enabled: false };
  } else if (layoutMode === 'force') {
    base.physics = {
      enabled: true,
      barnesHut: {
        gravitationalConstant: -2000,
        centralGravity: 0.3,
        springLength: SPACING,
        springConstant: 0.04,
        damping: 0.09,
        avoidOverlap: 0.1,
      },
      stabilization: { iterations: 150 },
    };
  } else {
    base.physics = { enabled: false };
  }
  return base;
}

function updateSaveButtonVisibility(): void {
  const btn = document.getElementById('saveChanges');
  if (btn) btn.style.display = hasUnsavedChanges ? 'inline-block' : 'none';
}

function updateFilePathDisplay(): void {
  const el = document.getElementById('filePathDisplay');
  if (!el) return;
  if (loadedFilePath) {
    el.textContent = `| File: ${loadedFilePath}`;
    el.title = loadedFilePath;
    el.style.display = '';
  } else {
    el.textContent = '';
    el.title = '';
    el.style.display = 'none';
  }
}

function showRenameModal(
  nodeId: string,
  currentLabel: string,
  labellableRoot: boolean | null
): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const labellableCb = document.getElementById('renameLabellable') as HTMLInputElement;
  input.value = currentLabel;
  input.dataset.nodeId = nodeId;
  labellableCb.checked = labellableRoot === true;
  labellableCb.indeterminate = labellableRoot === null;
  modal.style.display = 'flex';
  input.focus();
  input.select();
}

function hideRenameModal(): void {
  document.getElementById('renameModal')!.style.display = 'none';
}

function confirmRename(): void {
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const labellableCb = document.getElementById('renameLabellable') as HTMLInputElement;
  const nodeId = input.dataset.nodeId;
  const newLabel = input.value.trim();
  if (!nodeId || !newLabel) return;

  const node = rawData.nodes.find((n) => n.id === nodeId);
  if (!node) {
    hideRenameModal();
    return;
  }

  const labelChanged = node.label !== newLabel;
  const newLabellable = labellableCb.checked;
  const labellableChanged = (node.labellableRoot === true) !== newLabellable;

  if (!labelChanged && !labellableChanged) {
    hideRenameModal();
    return;
  }

  if (labelChanged) {
    node.label = newLabel;
    if (ttlStore) updateLabelInStore(ttlStore, nodeId, newLabel);
  }
  if (labellableChanged && ttlStore) {
    node.labellableRoot = newLabellable;
    updateLabellableInStore(ttlStore, nodeId, newLabellable);
  }

  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  hideRenameModal();
  applyFilter(true); // preserveView = true
}

async function saveTtl(): Promise<void> {
  if (!ttlStore) return;
  const doOverwrite = overwriteFile && fileHandle;
  try {
    const ttlString = await storeToTurtle(ttlStore);
    if (doOverwrite) {
      const writable = await fileHandle!.createWritable();
      await writable.write(ttlString);
      await writable.close();
    } else {
      const blob = new Blob([ttlString], { type: 'text/turtle' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = loadedFileName ?? 'ontology.ttl';
      a.click();
      URL.revokeObjectURL(url);
    }
    hasUnsavedChanges = false;
    updateSaveButtonVisibility();
  } catch (err) {
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = `Save error: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}

function renderApp(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div id="controls">
      <div>
        <strong>Load ontology:</strong>
        <button type="button" id="selectFile" class="primary">Select TTL file...</button>
        <button type="button" id="loadLastOpened" title="Select a TTL file first" disabled>Load last opened: (none)</button>
        <input type="file" id="fileInput" accept=".ttl,.turtle" />
      </div>
      <div id="vizControls" style="display: none;">
      <div>
        <strong>Labellable filter:</strong>
        <label><input type="radio" name="labellable" value="all" checked> All</label>
        <label><input type="radio" name="labellable" value="true"> Labellable only</label>
        <label><input type="radio" name="labellable" value="false"> Non-labellable only</label>
      </div>
      <div>
        <strong>Node color by:</strong>
        <select id="colorBy">
          <option value="labellable">Labellable status</option>
          <option value="default">Default</option>
        </select>
      </div>
      <div>
        <strong>Layout:</strong>
        <select id="layoutMode">
          <option value="weighted">Weighted (leaves sink, roots rise)</option>
          <option value="force">Force-directed</option>
        </select>
      </div>
      <div>
        <strong>Wrap text:</strong>
        <input type="number" id="wrapChars" min="1" max="50" value="10" style="width: 50px;">
        <span style="font-size: 11px;">chars</span>
      </div>
      <div>
        <strong>Font size:</strong>
        <span style="font-size: 11px;">Min</span>
        <input type="number" id="minFontSize" min="8" max="96" value="20" style="width: 45px;">
        <span style="font-size: 11px;">Max</span>
        <input type="number" id="maxFontSize" min="8" max="96" value="60" style="width: 45px;">
        <span style="font-size: 11px;">px (leaf→root)</span>
      </div>
      <div>
        <strong>Search:</strong>
        <div id="searchWrap">
          <input type="text" id="searchQuery" placeholder="Node or relationship..." autocomplete="off" style="width: 180px;">
          <div id="searchAutocomplete"></div>
        </div>
        <label style="font-size: 11px; margin-left: 4px;">
          <input type="checkbox" id="searchIncludeNeighbors" checked> Include neighbors
        </label>
      </div>
      <details id="edgeStylesMenu" style="margin-left: 8px;">
        <summary style="cursor: pointer; font-weight: bold;">Relationships</summary>
        <div id="edgeStylesContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
      </details>
      <button id="resetView">Reset view</button>
      <button id="saveChanges" class="primary" style="display: none;">Save changes</button>
      <label style="font-size: 11px;">
        <input type="checkbox" id="overwriteFile" checked> Overwrite file on save
      </label>
      </div>
      <div id="errorMsg" class="error" style="display: none;"></div>
    </div>
    <div id="network"></div>
    <div id="info">
      Nodes: <span id="nodeCount">0</span> | Edges: <span id="edgeCount">0</span>
      <span id="filePathDisplay" style="margin-left: 24px; font-size: 11px;"></span>
      <span style="margin-left: 24px; font-size: 11px;">
        Edge colors: <span style="color: #3498db">●</span> subClassOf
        <span style="color: #27ae60">●</span> contains
        <span style="color: #e67e22">●</span> partOf
      </span>
      <span id="selectionInfo"></span>
    </div>
    <div id="renameModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit node</h3>
        <label>Label: <input type="text" id="renameInput" /></label>
        <label style="display: block; margin-top: 10px;">
          <input type="checkbox" id="renameLabellable" />
          Labellable
        </label>
        <div class="modal-actions">
          <button type="button" id="renameCancel">Cancel</button>
          <button type="button" id="renameConfirm" class="primary">OK</button>
        </div>
      </div>
    </div>
  `;
}

async function loadTtlAndRender(
  ttlString: string,
  fileName?: string,
  handle?: FileSystemFileHandle | null,
  pathHint?: string
): Promise<void> {
  const errorMsg = document.getElementById('errorMsg') as HTMLElement;
  const vizControls = document.getElementById('vizControls') as HTMLElement;
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';

  try {
    const { graphData, store } = await parseTtlToGraph(ttlString);
    rawData = graphData;
    ttlStore = store;
    loadedFileName = fileName ?? null;
    loadedFilePath = pathHint ?? fileName ?? null;
    fileHandle = handle ?? null;
    hasUnsavedChanges = false;
    updateFilePathDisplay();
    if (handle && fileName) {
      saveLastFileToIndexedDB(handle, fileName, pathHint ?? fileName).catch(() => {});
      updateLoadLastOpenedButton(fileName, pathHint ?? fileName);
    }
    updateSaveButtonVisibility();

    vizControls.style.display = 'contents';

    const edgeStylesContent = document.getElementById('edgeStylesContent')!;
    initEdgeStylesMenu(edgeStylesContent, applyFilter);

    // Allow layout to settle after vizControls appears, then render
    requestAnimationFrame(() => {
      requestAnimationFrame(() => applyFilter());
    });
  } catch (err) {
    errorMsg.textContent = `Parse error: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}

function applyFilter(preserveView = false): void {
  if (rawData.nodes.length === 0) return;

  let savedScale: number | null = null;
  let savedPosition: { x: number; y: number } | null = null;
  if (preserveView && network) {
    savedScale = network.getScale();
    savedPosition = network.getViewPosition();
  }

  const layoutMode = (document.getElementById('layoutMode') as HTMLSelectElement)
    .value;
  const wrapChars =
    parseInt(
      (document.getElementById('wrapChars') as HTMLInputElement).value,
      10
    ) || 10;
  const minFontSize =
    parseInt(
      (document.getElementById('minFontSize') as HTMLInputElement).value,
      10
    ) || 20;
  const maxFontSize =
    parseInt(
      (document.getElementById('maxFontSize') as HTMLInputElement).value,
      10
    ) || 60;
  const searchEl = document.getElementById('searchQuery') as HTMLInputElement;
  const neighborsEl = document.getElementById(
    'searchIncludeNeighbors'
  ) as HTMLInputElement;
  const edgeStylesContent = document.getElementById('edgeStylesContent')!;

  const currentFilter = {
    labellable: (
      document.querySelector('input[name="labellable"]:checked') as HTMLInputElement
    ).value,
    colorBy: (document.getElementById('colorBy') as HTMLSelectElement).value,
    wrapChars,
    minFontSize,
    maxFontSize,
    searchQuery: searchEl?.value ?? '',
    includeNeighbors: neighborsEl?.checked ?? true,
    edgeStyleConfig: getEdgeStyleConfig(edgeStylesContent),
    layoutMode,
  };

  const data = buildNetworkData(currentFilter);
  const options = getNetworkOptions(layoutMode);

  const networkContainer = document.getElementById('network')!;
  if (network) {
    network.setData(data);
    network.setOptions({ ...options, width: '100%', height: '100%' });
    const w = networkContainer.clientWidth;
    const h = networkContainer.clientHeight;
    if (w > 0 && h > 0) network.setSize(`${w}px`, `${h}px`);
    if (preserveView && savedScale !== null && savedPosition !== null) {
      requestAnimationFrame(() => {
        network?.moveTo({
          position: savedPosition!,
          scale: savedScale!,
          animation: false,
        });
      });
    } else if (layoutMode === 'force') {
      network.once('stabilizationIterationsDone', () => network!.fit());
    } else if (layoutMode === 'weighted') {
      setTimeout(() => network!.fit({ padding: 20 }), 100);
    }
  } else {
    const opts = { ...options, width: '100%', height: '100%' };
    network = new Network(networkContainer, data, opts);
    if (layoutMode === 'force') {
      network.once('stabilizationIterationsDone', () => network!.fit());
    } else if (layoutMode === 'weighted') {
      setTimeout(() => network!.fit({ padding: 20 }), 100);
    }
    // Resize network when container size changes (e.g. flex layout settling)
    const resizeNetwork = () => {
      if (network && networkContainer) {
        const w = networkContainer.clientWidth;
        const h = networkContainer.clientHeight;
        if (w > 0 && h > 0) network.setSize(`${w}px`, `${h}px`);
      }
    };
    const ro = new ResizeObserver(resizeNetwork);
    ro.observe(networkContainer);
    resizeNetwork(); // Initial size
    network.on('click', (params) => {
      const selectionEl = document.getElementById('selectionInfo');
      if (params.nodes.length) {
        const nodeId = params.nodes[0] as string;
        const node = rawData.nodes.find((n) => n.id === nodeId);
        if (selectionEl) selectionEl.textContent = ` | Selected: ${node?.label ?? nodeId} | Labellable: ${node?.labellableRoot ?? 'N/A'}`;
      } else if (selectionEl) {
        selectionEl.textContent = '';
      }
    });
    network.on('doubleClick', (params) => {
      if (params.nodes.length) {
        const nodeId = params.nodes[0] as string;
        const node = rawData.nodes.find((n) => n.id === nodeId);
        if (node) showRenameModal(nodeId, node.label, node.labellableRoot);
      }
    });
  }

  (
    document.getElementById('nodeCount')!
  ).textContent = String(data.nodes.length);
  (document.getElementById('edgeCount')!).textContent = String(
    data.edges.length
  );
}

function setupEventListeners(): void {
  const selectFile = document.getElementById('selectFile');
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;

  const loadLastOpened = document.getElementById('loadLastOpened');
  loadLastOpened?.addEventListener('click', async () => {
    if (loadLastOpened.dataset.hasLast !== '1') return;
    const stored = await getLastFileFromIndexedDB();
    if (!stored) {
      updateLoadLastOpenedButton(null);
      return;
    }
    try {
      const perm = await stored.handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const requested = await stored.handle.requestPermission({ mode: 'readwrite' });
        if (requested !== 'granted') {
          const errorMsg = document.getElementById('errorMsg') as HTMLElement;
          errorMsg.textContent = 'Permission to access file was denied.';
          errorMsg.style.display = 'block';
          return;
        }
      }
      const file = await stored.handle.getFile();
      const ttl = await file.text();
      const pathHint = (file as File & { path?: string }).path ?? stored.pathHint ?? file.name;
      await loadTtlAndRender(ttl, file.name, stored.handle, pathHint);
    } catch (err) {
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to load file: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
  });

  selectFile?.addEventListener('click', async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as Window & { showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]> })
          .showOpenFilePicker({
            types: [{ accept: { 'text/turtle': ['.ttl', '.turtle'] } }],
            mode: 'readwrite',
          });
        const file = await handle.getFile();
        const ttl = await file.text();
        const pathHint = (file as File & { path?: string }).path ?? file.name;
        await loadTtlAndRender(ttl, file.name, handle, pathHint);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const errorMsg = document.getElementById('errorMsg') as HTMLElement;
          errorMsg.textContent = `Failed to open file: ${err instanceof Error ? err.message : String(err)}`;
          errorMsg.style.display = 'block';
        }
      }
    } else {
      fileInput?.click();
    }
  });

  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const ttl = await file.text();
      await loadTtlAndRender(ttl, file.name, null);
    } catch (err) {
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to read file: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
    fileInput.value = '';
  });

  document.querySelectorAll('input[name="labellable"]').forEach((r) => {
    r.addEventListener('change', applyFilter);
  });
  document.getElementById('colorBy')?.addEventListener('change', applyFilter);
  document.getElementById('layoutMode')?.addEventListener('change', applyFilter);
  document.getElementById('wrapChars')?.addEventListener('input', applyFilter);
  document.getElementById('wrapChars')?.addEventListener('change', applyFilter);
  document.getElementById('minFontSize')?.addEventListener('input', applyFilter);
  document.getElementById('minFontSize')?.addEventListener('change', applyFilter);
  document.getElementById('maxFontSize')?.addEventListener('input', applyFilter);
  document.getElementById('maxFontSize')?.addEventListener('change', applyFilter);
  document
    .getElementById('searchIncludeNeighbors')
    ?.addEventListener('change', applyFilter);
  document.getElementById('resetView')?.addEventListener('click', () => {
    const labellableAll = document.querySelector('input[name="labellable"][value="all"]') as HTMLInputElement;
    labellableAll?.click();
    (document.getElementById('colorBy') as HTMLSelectElement).value = 'labellable';
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'weighted';
    (document.getElementById('wrapChars') as HTMLInputElement).value = '10';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = '60';
    (document.getElementById('searchQuery') as HTMLInputElement).value = '';
    (document.getElementById('searchIncludeNeighbors') as HTMLInputElement).checked = true;
    document.getElementById('searchAutocomplete')?.classList.remove('visible');
    document.querySelectorAll('.edge-show-cb').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.edge-label-cb').forEach((cb) => ((cb as HTMLInputElement).checked = false));
    getEdgeTypes(rawData.edges).forEach((type) => {
      const colorEl = document.querySelector(`.edge-color-picker[data-type="${type}"]`) as HTMLInputElement;
      if (colorEl) colorEl.value = getDefaultEdgeColors()[type] ?? getDefaultColor();
    });
    applyFilter();
    network?.fit();
  });
  document.getElementById('saveChanges')?.addEventListener('click', saveTtl);
  document.getElementById('overwriteFile')?.addEventListener('change', (e) => {
    overwriteFile = (e.target as HTMLInputElement).checked;
  });

  document.getElementById('renameCancel')?.addEventListener('click', hideRenameModal);
  document.getElementById('renameConfirm')?.addEventListener('click', confirmRename);
  document.getElementById('renameInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') hideRenameModal();
  });
  document.getElementById('renameModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'renameModal') hideRenameModal();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      const searchInput = document.getElementById('searchQuery') as HTMLInputElement;
      searchInput?.focus();
    }
  });

  const searchInput = document.getElementById('searchQuery');
  const searchList = document.getElementById('searchAutocomplete');
  if (searchInput && searchList) {
    let debounceTimer: number;
    searchInput.addEventListener('input', () => {
      applyFilter();
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(updateSearchAutocomplete, 150);
    });
    searchInput.addEventListener('focus', () => {
      if ((searchInput as HTMLInputElement).value.trim()) updateSearchAutocomplete();
    });
  }
}

function updateSearchAutocomplete(): void {
  const input = document.getElementById('searchQuery') as HTMLInputElement;
  const list = document.getElementById('searchAutocomplete')!;
  const query = (input?.value || '').trim();
  const q = query.toLowerCase();
  if (q.length < 1) {
    list.innerHTML = '';
    list.classList.remove('visible');
    return;
  }
  const seen = new Set<string>();
  const suggestions: { value: string; label: string; hint: string }[] = [];
  getEdgeTypes(rawData.edges).forEach((type) => {
    if (type.toLowerCase().includes(q) && !seen.has(type)) {
      seen.add(type);
      suggestions.push({ value: type, label: type, hint: 'relationship' });
    }
  });
  rawData.nodes.forEach((n) => {
    const label = (n.label || '').toLowerCase();
    const id = (n.id || '').toLowerCase();
    const val = n.label || n.id;
    if ((label.includes(q) || id.includes(q)) && !seen.has(val)) {
      seen.add(val);
      suggestions.push({ value: val, label: val, hint: 'node' });
    }
  });
  list.innerHTML = '';
  list.classList.remove('visible');
  list.dataset.highlight = '-1';
  suggestions.slice(0, 12).forEach((s) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.dataset.value = s.value;
    div.innerHTML = s.label + '<span class="hint">(' + s.hint + ')</span>';
    div.addEventListener('click', () => {
      input.value = s.value;
      list.classList.remove('visible');
      applyFilter();
    });
    list.appendChild(div);
  });
  list.classList.add('visible');
}

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

async function initLastOpened(): Promise<void> {
  const stored = await getLastFileFromIndexedDB();
  if (stored) {
    updateLoadLastOpenedButton(stored.name, stored.pathHint);
  } else {
    updateLoadLastOpenedButton(null);
  }
}

renderApp();
setupEventListeners();
initLastOpened().catch(() => {});
