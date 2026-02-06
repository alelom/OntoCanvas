import { DataSet } from 'vis-data/esnext';
import { Network } from 'vis-network/esnext';
import 'vis-network/styles/vis-network.css';
import {
  parseTtlToGraph,
  updateLabelInStore,
  updateLabellableInStore,
  updateEdgeInStore,
  addEdgeToStore,
  removeEdgeFromStore,
  addNodeToStore,
  removeNodeFromStore,
  storeToTurtle,
} from './parser';
import type { GraphData, GraphEdge, GraphNode } from './types';
import {
  wrapText,
  getEdgeTypes,
  getDefaultEdgeColors,
  getDefaultColor,
  getSpacing,
  computeNodeDepths,
  computeWeightedLayout,
  estimateNodeDimensions,
  resolveOverlaps,
  matchesSearch,
  formatEdgeLabel,
  COLORS,
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
let annotationProperties: { name: string; isBoolean: boolean }[] = [];
let network: Network | null = null;
let addNodeMode = false;
let pendingAddNodePosition: { x: number; y: number } | null = null;
let addNodeModalShowing = false;
let ttlStore: import('n3').Store | null = null;
let loadedFileName: string | null = null;
let loadedFilePath: string | null = null;
let fileHandle: FileSystemFileHandle | null = null;
let hasUnsavedChanges = false;
let pendingEditEdgeCallback: ((data: { from: string; to: string } | null) => void) | null = null;
let pendingAddEdgeData: { from: string; to: string; callback: (data: { from: string; to: string; id?: string } | null) => void } | null = null;

type UndoableAction = { undo: () => void; redo: () => void };
let undoStack: UndoableAction[] = [];
let redoStack: UndoableAction[] = [];

function pushUndoable(undo: () => void, redo: () => void): void {
  redoStack = [];
  undoStack.push({ undo, redo });
  updateUndoRedoButtons();
}

function performUndo(): void {
  const action = undoStack.pop();
  if (!action) return;
  action.undo();
  redoStack.push(action);
  updateUndoRedoButtons();
  updateSaveButtonVisibility();
  applyFilter(true);
}

function performRedo(): void {
  const action = redoStack.pop();
  if (!action) return;
  action.redo();
  undoStack.push(action);
  updateUndoRedoButtons();
  updateSaveButtonVisibility();
  applyFilter(true);
}

function clearUndoRedo(): void {
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
}

function addNewNodeAtPosition(
  x?: number,
  y?: number,
  label = 'New class'
): { id: string; label: string; x?: number; y?: number } | null {
  if (!ttlStore) return null;
  const displayLabel = label.trim() || 'New class';
  const id = addNodeToStore(ttlStore, displayLabel);
  if (!id) return null;
  const node: GraphNode = {
    id,
    label: displayLabel,
    labellableRoot: null,
    ...(x != null && y != null && { x, y }),
  };
  rawData.nodes.push(node);
  pushUndoable(
    () => {
      removeNodeFromStore(ttlStore!, id);
      const i = rawData.nodes.findIndex((n) => n.id === id);
      if (i >= 0) rawData.nodes.splice(i, 1);
    },
    () => {
      addNodeToStore(ttlStore!, displayLabel, id);
      rawData.nodes.push(node);
    }
  );
  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  return { id, label: displayLabel, x, y };
}

function updateUndoRedoButtons(): void {
  const undoBtn = document.getElementById('undoBtn') as HTMLButtonElement | null;
  const redoBtn = document.getElementById('redoBtn') as HTMLButtonElement | null;
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function performDeleteSelection(): boolean {
  if (!network || !ttlStore) return false;
  const activeEl = document.activeElement as HTMLElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
    return false;
  }
  const selectedNodeIds = network.getSelectedNodes().map(String);
  const selectedEdgeIds = network.getSelectedEdges().map(String);
  if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return false;

  const edgesToRemove: { from: string; to: string; type: string }[] = [];
  for (const edgeId of selectedEdgeIds) {
    const m = edgeId.match(/^(.+)->(.+):(.+)$/);
    if (m) edgesToRemove.push({ from: m[1], to: m[2], type: m[3] });
  }

  const nodesToRemove = selectedNodeIds.filter((id) => rawData.nodes.some((n) => n.id === id));
  const connectedEdges = rawData.edges.filter(
    (e) => nodesToRemove.includes(e.from) || nodesToRemove.includes(e.to)
  );

  const undoActions: Array<() => void> = [];
  const redoActions: Array<() => void> = [];

  for (const { from, to, type } of edgesToRemove) {
    const edge = rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
    const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
    const ok = removeEdgeFromStore(ttlStore, from, to, type);
    if (ok) {
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) rawData.edges.splice(idx, 1);
      undoActions.push(() => {
        addEdgeToStore(ttlStore!, from, to, type, card);
        rawData.edges.push(edge ?? { from, to, type });
      });
      redoActions.push(() => {
        removeEdgeFromStore(ttlStore!, from, to, type);
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
        if (i >= 0) rawData.edges.splice(i, 1);
      });
    } else {
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) {
        const edge = rawData.edges[idx];
        rawData.edges.splice(idx, 1);
        undoActions.push(() => rawData.edges.push(edge));
        redoActions.push(() => {
          const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
          if (i < 0) rawData.edges.push(edge);
        });
      }
    }
  }

  for (const { from, to, type } of connectedEdges) {
    if (edgesToRemove.some((e) => e.from === from && e.to === to && e.type === type)) continue;
    const edge = rawData.edges.find((e) => e.from === from && e.to === to && e.type === type);
    const card = edge && type !== 'subClassOf' ? { minCardinality: edge.minCardinality ?? null, maxCardinality: edge.maxCardinality ?? null } : undefined;
    const ok = removeEdgeFromStore(ttlStore, from, to, type);
    if (ok) {
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) rawData.edges.splice(idx, 1);
      undoActions.push(() => {
        addEdgeToStore(ttlStore!, from, to, type, card);
        rawData.edges.push(edge ?? { from, to, type });
      });
      redoActions.push(() => {
        removeEdgeFromStore(ttlStore!, from, to, type);
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
        if (i >= 0) rawData.edges.splice(i, 1);
      });
    } else {
      const idx = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
      if (idx >= 0) {
        const edge = rawData.edges[idx];
        rawData.edges.splice(idx, 1);
        undoActions.push(() => rawData.edges.push(edge));
        redoActions.push(() => {
          const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === type);
          if (i >= 0) rawData.edges.splice(i, 1);
        });
      }
    }
  }

  for (const nodeId of nodesToRemove) {
    const node = rawData.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    removeNodeFromStore(ttlStore, nodeId);
    const idx = rawData.nodes.findIndex((n) => n.id === nodeId);
    if (idx >= 0) rawData.nodes.splice(idx, 1);
    undoActions.push(() => {
      addNodeToStore(ttlStore!, node.label, nodeId);
      rawData.nodes.push(node);
    });
    redoActions.push(() => {
      removeNodeFromStore(ttlStore!, nodeId);
      const i = rawData.nodes.findIndex((n) => n.id === nodeId);
      if (i >= 0) rawData.nodes.splice(i, 1);
    });
  }

  if (undoActions.length === 0 && redoActions.length === 0) return false;

  pushUndoable(
    () => undoActions.forEach((a) => a()),
    () => redoActions.forEach((a) => a())
  );
  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  applyFilter(true);
  network.unselectAll();
  return true;
}
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
      <span style="font-weight: bold; font-family: Consolas, monospace; font-size: 12px; min-width: 100px;">${type}</span>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
        <input type="checkbox" class="edge-show-cb" data-type="${type}" checked>
        <span>Show</span>
      </label>
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

type BorderLineType = 'solid' | 'dashed' | 'dotted' | 'dash-dot' | 'dash-dot-dot';

const BORDER_LINE_OPTIONS: { value: BorderLineType; visValue: false | true | number[]; svgDasharray: string }[] = [
  { value: 'solid', visValue: false, svgDasharray: '' },
  { value: 'dashed', visValue: [5, 5], svgDasharray: '5,3' },
  { value: 'dotted', visValue: [1, 3], svgDasharray: '1,3' },
  { value: 'dash-dot', visValue: [5, 2, 1, 2], svgDasharray: '5,2,1,2' },
  { value: 'dash-dot-dot', visValue: [5, 2, 1, 2, 1, 2], svgDasharray: '5,2,1,2,1,2' },
];

function borderLineTypeToVis(value: BorderLineType): false | true | number[] {
  return BORDER_LINE_OPTIONS.find((o) => o.value === value)?.visValue ?? false;
}

interface AnnotationStyleConfig {
  booleanProps: Record<
    string,
    {
      whenTrue: { fillColor: string; borderColor: string; borderLineType: BorderLineType; show: boolean };
      whenFalse: { fillColor: string; borderColor: string; borderLineType: BorderLineType; show: boolean };
      whenUndefined: { fillColor: string; borderColor: string; borderLineType: BorderLineType; show: boolean };
    }
  >;
  textProps: Record<string, { rules: { regex: string; fillColor: string; borderColor: string; borderLineType: BorderLineType }[] }>;
}

const DEFAULT_BOOL_COLORS = {
  whenTrue: { fill: '#2ecc71', border: '#000000', lineType: 'solid' as BorderLineType },
  whenFalse: { fill: '#b8b8b8', border: '#000000', lineType: 'dashed' as BorderLineType },
  whenUndefined: { fill: '#95a5a6', border: '#000000', lineType: 'dashed' as BorderLineType },
};
const DEFAULT_TEXT_COLOR = { fill: '#3498db', border: '#2980b9', lineType: 'solid' as BorderLineType };

function renderLineTypeSvg(dasharray: string): string {
  return `<svg width="32" height="10" style="display: block;"><line x1="2" y1="5" x2="30" y2="5" stroke="#333" stroke-width="1.5" ${dasharray ? `stroke-dasharray="${dasharray}"` : ''}></line></svg>`;
}

function renderLineTypeDropdown(
  dataProp: string,
  dataVal: string,
  selected: BorderLineType,
  inputClass: string
): string {
  const selectedOpt = BORDER_LINE_OPTIONS.find((o) => o.value === selected) ?? BORDER_LINE_OPTIONS[0];
  const dataValAttr = dataVal ? ` data-val="${dataVal}"` : '';
  const optionsHtml = BORDER_LINE_OPTIONS.map(
    (opt) => `
    <div class="ap-linetype-option" data-value="${opt.value}" style="display: flex; align-items: center; padding: 4px 8px; cursor: pointer; font-size: 11px; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='#fff'">
      ${renderLineTypeSvg(opt.svgDasharray)}
    </div>`
  ).join('');
  return `
    <div class="ap-linetype-dropdown" style="position: relative; display: inline-block;">
      <input type="hidden" class="${inputClass}" data-prop="${dataProp}"${dataValAttr} value="${selected}">
      <button type="button" class="ap-linetype-trigger" style="display: flex; align-items: center; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; background: #fff; cursor: pointer; font-size: 11px;">
        ${renderLineTypeSvg(selectedOpt.svgDasharray)}
        <span style="margin-left: 4px;">▾</span>
      </button>
      <div class="ap-linetype-panel" style="display: none; position: absolute; top: 100%; left: 0; margin-top: 2px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1001; min-width: 60px;">
        ${optionsHtml}
      </div>
    </div>`;
}

let annotationPropsMenuClickAbort: AbortController | null = null;

function initAnnotationPropsMenu(
  container: HTMLElement,
  onApply: () => void
): void {
  annotationPropsMenuClickAbort?.abort();
  annotationPropsMenuClickAbort = new AbortController();
  const signal = annotationPropsMenuClickAbort.signal;

  container.innerHTML = '';
  const boolProps = annotationProperties.filter((ap) => ap.isBoolean);
  const textProps = annotationProperties.filter((ap) => !ap.isBoolean);

  if (boolProps.length > 0) {
    const boolSection = document.createElement('div');
    boolSection.style.marginBottom = '12px';
    boolSection.innerHTML = '<strong style="font-size: 11px;">Boolean properties</strong>';
    boolProps.forEach((ap) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin: 8px 0; padding: 8px; background: #f9f9f9; border-radius: 4px;';
      const renderBoolBlock = (val: 'true' | 'false' | 'undefined', defaults: { fill: string; border: string; lineType: BorderLineType }) => {
        const dataVal = val === 'undefined' ? 'undefined' : val;
        return `
          <div>
            <span>When ${val}:</span>
            <label><input type="checkbox" class="ap-bool-show" data-prop="${ap.name}" data-val="${dataVal}" checked> Show</label>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
              <div><span style="font-size: 10px;">Fill:</span> <input type="color" class="ap-bool-fill" data-prop="${ap.name}" data-val="${dataVal}" value="${defaults.fill}" style="width: 24px; height: 18px; vertical-align: middle;"></div>
              <div><span style="font-size: 10px;">Border:</span> <input type="color" class="ap-bool-border" data-prop="${ap.name}" data-val="${dataVal}" value="${defaults.border}" style="width: 24px; height: 18px; vertical-align: middle;"></div>
              <div><span style="font-size: 10px;">Line:</span> ${renderLineTypeDropdown(ap.name, dataVal, defaults.lineType, 'ap-bool-linetype')}</div>
            </div>
          </div>`;
      };
      row.innerHTML = `
        <div style="font-weight: bold; font-family: Consolas, monospace; font-size: 11px; margin-bottom: 6px;">${ap.name}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px;">
          ${renderBoolBlock('true', DEFAULT_BOOL_COLORS.whenTrue)}
          ${renderBoolBlock('false', DEFAULT_BOOL_COLORS.whenFalse)}
          ${renderBoolBlock('undefined', DEFAULT_BOOL_COLORS.whenUndefined)}
        </div>
      `;
      boolSection.appendChild(row);
    });
    container.appendChild(boolSection);
  }

  if (textProps.length > 0) {
    const textSection = document.createElement('div');
    textSection.innerHTML = '<strong style="font-size: 11px;">Text properties (regex)</strong>';
    textProps.forEach((ap) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin: 8px 0; padding: 8px; background: #f9f9f9; border-radius: 4px;';
      row.innerHTML = `
        <div style="font-weight: bold; font-family: Consolas, monospace; font-size: 11px; margin-bottom: 6px;">${ap.name}</div>
        <div class="ap-text-rules" data-prop="${ap.name}"></div>
        <button type="button" class="ap-add-rule" data-prop="${ap.name}" style="font-size: 11px; margin-top: 4px;">+ Add regex rule</button>
      `;
      const rulesDiv = row.querySelector('.ap-text-rules')!;
      const addRule = (regex = '', fillColor = DEFAULT_TEXT_COLOR.fill, borderColor = DEFAULT_TEXT_COLOR.border, borderLineType = DEFAULT_TEXT_COLOR.lineType) => {
        const ruleEl = document.createElement('div');
        ruleEl.style.cssText = 'display: flex; align-items: center; gap: 6px; margin: 4px 0; flex-wrap: wrap;';
        ruleEl.innerHTML = `
          <input type="text" class="ap-regex" placeholder="regex" value="${regex}" style="flex: 1; min-width: 80px; font-size: 11px; padding: 4px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div><span style="font-size: 10px;">Fill:</span> <input type="color" class="ap-regex-fill" value="${fillColor}" style="width: 24px; height: 18px;"></div>
            <div><span style="font-size: 10px;">Border:</span> <input type="color" class="ap-regex-border" value="${borderColor}" style="width: 24px; height: 18px;"></div>
            <div><span style="font-size: 10px;">Line:</span> ${renderLineTypeDropdown(ap.name, '', borderLineType, 'ap-regex-linetype')}</div>
          </div>
          <button type="button" class="ap-remove-rule" style="font-size: 11px;">×</button>
        `;
        ruleEl.querySelector('.ap-remove-rule')!.addEventListener('click', () => {
          ruleEl.remove();
          onApply();
        });
        [...ruleEl.querySelectorAll('.ap-regex, .ap-regex-fill, .ap-regex-border')].forEach((el) =>
          el.addEventListener('change', onApply)
        );
        ruleEl.querySelector('.ap-regex')!.addEventListener('input', onApply);
        rulesDiv.appendChild(ruleEl);
      };
      addRule();
      row.querySelector('.ap-add-rule')!.addEventListener('click', () => {
        addRule();
        onApply();
      });
      textSection.appendChild(row);
    });
    container.appendChild(textSection);
  }

  if (boolProps.length === 0 && textProps.length === 0) {
    container.innerHTML = '<span style="font-size: 11px; color: #888;">No annotation properties in ontology</span>';
  }

  container.querySelectorAll('.ap-bool-show, .ap-bool-fill, .ap-bool-border').forEach((el) =>
    el.addEventListener('change', onApply)
  );

  container.querySelectorAll('.ap-linetype-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.closest('.ap-linetype-dropdown');
      const panel = dropdown?.querySelector('.ap-linetype-panel') as HTMLElement;
      const isOpen = panel?.style.display === 'block';
      container.querySelectorAll('.ap-linetype-panel').forEach((p) => ((p as HTMLElement).style.display = 'none'));
      if (panel && !isOpen) panel.style.display = 'block';
    });
  });
  container.querySelectorAll('.ap-linetype-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = (opt as HTMLElement).dataset.value as BorderLineType;
      const dropdown = opt.closest('.ap-linetype-dropdown');
      const hiddenInput = dropdown?.querySelector('.ap-bool-linetype, .ap-regex-linetype') as HTMLInputElement;
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      if (hiddenInput && trigger && value) {
        hiddenInput.value = value;
        const selectedOpt = BORDER_LINE_OPTIONS.find((o) => o.value === value);
        if (selectedOpt) {
          trigger.innerHTML = `${renderLineTypeSvg(selectedOpt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
        }
        (dropdown?.querySelector('.ap-linetype-panel') as HTMLElement).style.display = 'none';
        onApply();
      }
    });
  });
  document.addEventListener(
    'click',
    () => {
      container.querySelectorAll('.ap-linetype-panel').forEach((p) => ((p as HTMLElement).style.display = 'none'));
    },
    { signal }
  );
}

function getAnnotationStyleConfig(container: HTMLElement | null): AnnotationStyleConfig {
  const config: AnnotationStyleConfig = { booleanProps: {}, textProps: {} };
  if (!container) return config;
  annotationProperties.forEach((ap) => {
    if (ap.isBoolean) {
      const showTrue = container.querySelector(
        `.ap-bool-show[data-prop="${ap.name}"][data-val="true"]`
      ) as HTMLInputElement | null;
      const showFalse = container.querySelector(
        `.ap-bool-show[data-prop="${ap.name}"][data-val="false"]`
      ) as HTMLInputElement | null;
      const fillTrue = container.querySelector(
        `.ap-bool-fill[data-prop="${ap.name}"][data-val="true"]`
      ) as HTMLInputElement | null;
      const borderTrue = container.querySelector(
        `.ap-bool-border[data-prop="${ap.name}"][data-val="true"]`
      ) as HTMLInputElement | null;
      const fillFalse = container.querySelector(
        `.ap-bool-fill[data-prop="${ap.name}"][data-val="false"]`
      ) as HTMLInputElement | null;
      const borderFalse = container.querySelector(
        `.ap-bool-border[data-prop="${ap.name}"][data-val="false"]`
      ) as HTMLInputElement | null;
      const linetypeTrue = container.querySelector(
        `.ap-bool-linetype[data-prop="${ap.name}"][data-val="true"]`
      ) as HTMLInputElement | null;
      const linetypeFalse = container.querySelector(
        `.ap-bool-linetype[data-prop="${ap.name}"][data-val="false"]`
      ) as HTMLInputElement | null;
      const showUndefined = container.querySelector(
        `.ap-bool-show[data-prop="${ap.name}"][data-val="undefined"]`
      ) as HTMLInputElement | null;
      const fillUndefined = container.querySelector(
        `.ap-bool-fill[data-prop="${ap.name}"][data-val="undefined"]`
      ) as HTMLInputElement | null;
      const borderUndefined = container.querySelector(
        `.ap-bool-border[data-prop="${ap.name}"][data-val="undefined"]`
      ) as HTMLInputElement | null;
      const linetypeUndefined = container.querySelector(
        `.ap-bool-linetype[data-prop="${ap.name}"][data-val="undefined"]`
      ) as HTMLInputElement | null;
      config.booleanProps[ap.name] = {
        whenTrue: {
          fillColor: fillTrue?.value ?? DEFAULT_BOOL_COLORS.whenTrue.fill,
          borderColor: borderTrue?.value ?? DEFAULT_BOOL_COLORS.whenTrue.border,
          borderLineType: (linetypeTrue?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenTrue.lineType,
          show: showTrue?.checked ?? true,
        },
        whenFalse: {
          fillColor: fillFalse?.value ?? DEFAULT_BOOL_COLORS.whenFalse.fill,
          borderColor: borderFalse?.value ?? DEFAULT_BOOL_COLORS.whenFalse.border,
          borderLineType: (linetypeFalse?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenFalse.lineType,
          show: showFalse?.checked ?? true,
        },
        whenUndefined: {
          fillColor: fillUndefined?.value ?? DEFAULT_BOOL_COLORS.whenUndefined.fill,
          borderColor: borderUndefined?.value ?? DEFAULT_BOOL_COLORS.whenUndefined.border,
          borderLineType: (linetypeUndefined?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenUndefined.lineType,
          show: showUndefined?.checked ?? true,
        },
      };
    } else {
      const rulesDiv = container.querySelector(`.ap-text-rules[data-prop="${ap.name}"]`);
      const rules: { regex: string; fillColor: string; borderColor: string; borderLineType: BorderLineType }[] = [];
      rulesDiv?.querySelectorAll(':scope > div').forEach((ruleEl) => {
        const regexInput = ruleEl.querySelector('.ap-regex') as HTMLInputElement | null;
        const fillInput = ruleEl.querySelector('.ap-regex-fill') as HTMLInputElement | null;
        const borderInput = ruleEl.querySelector('.ap-regex-border') as HTMLInputElement | null;
        const linetypeInput = ruleEl.querySelector('.ap-regex-linetype') as HTMLInputElement | null;
        if (regexInput && regexInput.value.trim()) {
          rules.push({
            regex: regexInput.value.trim(),
            fillColor: fillInput?.value ?? DEFAULT_TEXT_COLOR.fill,
            borderColor: borderInput?.value ?? DEFAULT_TEXT_COLOR.border,
            borderLineType: (linetypeInput?.value as BorderLineType) ?? DEFAULT_TEXT_COLOR.lineType,
          });
        }
      });
      config.textProps[ap.name] = { rules };
    }
  });
  return config;
}

function shouldShowNodeByAnnotations(
  node: GraphNode,
  config: AnnotationStyleConfig
): boolean {
  const ann = node.annotations ?? {};
  for (const [propName, boolConfig] of Object.entries(config.booleanProps)) {
    const val = ann[propName];
    if (val === true) {
      if (!boolConfig.whenTrue.show) return false;
    } else if (val === false) {
      if (!boolConfig.whenFalse.show) return false;
    } else if (val == null) {
      // when null/undefined: respect whenUndefined.show if configured
      if (boolConfig.whenUndefined && boolConfig.whenUndefined.show === false) return false;
    }
  }
  return true;
}

function getNodeStyleFromAnnotations(
  node: GraphNode,
  config: AnnotationStyleConfig
): { background: string; border: string; shapeProperties?: { borderDashes: false | true | number[] } } {
  const ann = node.annotations ?? {};
  for (const [propName, boolConfig] of Object.entries(config.booleanProps)) {
    const val = ann[propName];
    if (val === true) {
      const dashes = borderLineTypeToVis(boolConfig.whenTrue.borderLineType);
      return {
        background: boolConfig.whenTrue.fillColor,
        border: boolConfig.whenTrue.borderColor,
        shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
      };
    }
    if (val === false) {
      const dashes = borderLineTypeToVis(boolConfig.whenFalse.borderLineType);
      return {
        background: boolConfig.whenFalse.fillColor,
        border: boolConfig.whenFalse.borderColor,
        shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
      };
    }
    if (val == null) {
      const dashes = borderLineTypeToVis(boolConfig.whenUndefined.borderLineType);
      return {
        background: boolConfig.whenUndefined.fillColor,
        border: boolConfig.whenUndefined.borderColor,
        shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
      };
    }
  }
  for (const [propName, textConfig] of Object.entries(config.textProps)) {
    const val = ann[propName];
    if (val == null || typeof val !== 'string') continue;
    for (const rule of textConfig.rules) {
      if (!rule.regex) continue;
      try {
        const re = new RegExp(rule.regex);
        if (re.test(val)) {
          const dashes = borderLineTypeToVis(rule.borderLineType);
          return {
            background: rule.fillColor,
            border: rule.borderColor,
            shapeProperties: dashes !== false ? { borderDashes: dashes } : undefined,
          };
        }
      } catch {
        // invalid regex: skip
      }
    }
  }
  return { background: COLORS.default, border: '#2c3e50' };
}

function buildNetworkData(filter: {
  wrapChars: number;
  minFontSize: number;
  maxFontSize: number;
  searchQuery: string;
  includeNeighbors: boolean;
  edgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string }>;
  annotationStyleConfig: AnnotationStyleConfig;
  layoutMode: string;
}): { nodes: DataSet; edges: DataSet } {
  let filteredNodes = rawData.nodes.filter((n) =>
    shouldShowNodeByAnnotations(n, filter.annotationStyleConfig)
  );
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
    const pos = (n.x != null && n.y != null) ? { x: n.x, y: n.y } : nodePositions[n.id];
    const d = depth[n.id] ?? 0;
    const fontSize =
      maxDepth > 0
        ? Math.round(
            minFontSize +
              (maxFontSize - minFontSize) * (maxDepth - d) / maxDepth
          )
        : maxFontSize;
    const style = getNodeStyleFromAnnotations(n, filter.annotationStyleConfig);
    const node: Record<string, unknown> = {
      id: n.id,
      label: wrapText(n.label, wrapChars),
      labellableRoot: n.labellableRoot,
      color: { background: style.background, border: style.border },
      font: { size: fontSize, color: '#2c3e50' },
      ...(style.shapeProperties && { shapeProperties: style.shapeProperties }),
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
      id: `${e.from}->${e.to}:${e.type}`,
      from: e.from,
      to: e.to,
      arrows: 'to',
      label: style.showLabel ? formatEdgeLabel(e) : '',
      color: { color: style.color, highlight: style.color },
    };
  });

  return {
    nodes: new DataSet(nodes),
    edges: new DataSet(edges),
  };
}

function updateSelectionInfoDisplay(net: Network): void {
  const selectionEl = document.getElementById('selectionInfo');
  if (!selectionEl) return;
  const nodeIds = net.getSelectedNodes().map(String);
  if (nodeIds.length === 0) {
    selectionEl.textContent = '';
  } else if (nodeIds.length === 1) {
    const node = rawData.nodes.find((n) => n.id === nodeIds[0]);
    selectionEl.textContent = ` | Selected: ${node?.label ?? nodeIds[0]} | Labellable: ${node?.labellableRoot ?? 'N/A'}`;
  } else {
    selectionEl.textContent = ` | Selected: ${nodeIds.length} nodes`;
  }
}

function setupNetworkSelectionAndNavigation(
  net: Network,
  container: HTMLElement
): void {
  const RIGHT_BUTTON = 2;
  const LEFT_BUTTON = 1;
  let rightPanStart: { x: number; y: number; viewPos: { x: number; y: number }; scale: number } | null = null;
  let selectionBeforeClick: string[] = [];

  container.oncontextmenu = () => false;

  const getContainerCoords = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (!container.contains(e.target as Node)) return;
    const coords = getContainerCoords(e);
    if (e.button === RIGHT_BUTTON) {
      const viewPos = net.getViewPosition();
      const scale = net.getScale();
      rightPanStart = { x: coords.x, y: coords.y, viewPos: { ...viewPos }, scale };
    } else if (e.button === LEFT_BUTTON) {
      selectionBeforeClick = net.getSelectedNodes().map(String);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const coords = getContainerCoords(e);
    if (rightPanStart) {
      const dx = coords.x - rightPanStart.x;
      const dy = coords.y - rightPanStart.y;
      const canvasDx = dx / rightPanStart.scale;
      const canvasDy = dy / rightPanStart.scale;
      const newViewPos = {
        x: rightPanStart.viewPos.x - canvasDx,
        y: rightPanStart.viewPos.y - canvasDy,
      };
      net.moveTo({
        position: newViewPos,
        scale: rightPanStart.scale,
        animation: false,
      });
      rightPanStart = { ...rightPanStart, x: coords.x, y: coords.y, viewPos: newViewPos };
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (e.button === RIGHT_BUTTON) rightPanStart = null;
  };

  const handleMouseLeave = () => {
    rightPanStart = null;
  };

  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseup', handleMouseUp, true);
  container.addEventListener('mouseleave', handleMouseLeave);

  const handleNativeClick = (e: MouseEvent) => {
    if (!ttlStore || !network) return;
    const target = e.target as HTMLElement;
    if (target.closest?.('.vis-add')) {
      addNodeMode = true;
      return;
    }
    if (target.closest?.('.vis-manipulation') && !addNodeMode) return;
    if (!addNodeMode) return;
    const rect = container.getBoundingClientRect();
    const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const nodeAt = net.getNodeAt(domPos);
    if (nodeAt != null) return;
    const canvasPos = net.DOMtoCanvas(domPos);
    showAddNodeModal(canvasPos.x, canvasPos.y);
  };

  const handleNativeDblclick = (e: MouseEvent) => {
    if (!ttlStore || !network) return;
    const target = e.target as HTMLElement;
    if (target.closest?.('.vis-manipulation')) return;
    const rect = container.getBoundingClientRect();
    const domPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const edgeAt = net.getEdgeAt(domPos);
    if (edgeAt != null) {
      const m = String(edgeAt).match(/^(.+)->(.+):(.+)$/);
      if (m) showEditEdgeModal(m[1], m[2], m[3]);
      return;
    }
    const nodeAt = net.getNodeAt(domPos);
    if (nodeAt != null) return;
    const canvasPos = net.DOMtoCanvas(domPos);
    showAddNodeModal(canvasPos.x, canvasPos.y);
  };

  container.addEventListener('click', handleNativeClick, true);
  container.addEventListener('dblclick', handleNativeDblclick, true);

  net.on('click', (params: { nodes: string[]; edges: string[]; event?: { srcEvent?: MouseEvent } }) => {
    const clickedNode = params.nodes[0] as string | undefined;
    const ctrlKey = params.event?.srcEvent?.ctrlKey ?? false;

    if (!clickedNode) {
      return;
    }

    if (ctrlKey) {
      const wasSelected = selectionBeforeClick.includes(clickedNode);
      const newSelection = wasSelected
        ? selectionBeforeClick.filter((id) => id !== clickedNode)
        : [...new Set([...selectionBeforeClick, clickedNode])];
      net.setSelection({ nodes: newSelection }, { unselectAll: false, highlightEdges: true });
    } else {
      const newSelection = [clickedNode];
      net.setSelection({ nodes: newSelection }, { unselectAll: false, highlightEdges: true });
    }
    updateSelectionInfoDisplay(net);
  });
}

function getNetworkOptions(layoutMode: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    nodes: {
      shape: 'box',
      margin: 10,
      font: { size: 20, color: '#2c3e50' },
    },
    edges: { smooth: { type: 'cubicBezier' }, arrows: 'to' },
    interaction: {
      dragView: false,
      dragNodes: true,
      multiselect: true,
    },
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
  const group = document.getElementById('saveGroup');
  if (group) {
    group.style.display = hasUnsavedChanges ? 'inline-flex' : 'none';
  }
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
  const titleEl = modal.querySelector('h3');
  if (titleEl) titleEl.textContent = 'Edit node';
  modal.dataset.mode = 'single';
  delete modal.dataset.nodeIds;
  input.value = currentLabel;
  input.disabled = false;
  input.style.color = '';
  input.dataset.nodeId = nodeId;
  labellableCb.checked = labellableRoot === true;
  labellableCb.indeterminate = labellableRoot === null;
  modal.style.display = 'flex';
  input.focus();
  input.select();
}

function showMultiEditModal(nodeIds: string[]): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const labellableCb = document.getElementById('renameLabellable') as HTMLInputElement;
  modal.dataset.mode = 'multi';
  modal.dataset.nodeIds = JSON.stringify(nodeIds);
  delete input.dataset.nodeId;
  input.value = 'multiple nodes selected';
  input.disabled = true;
  input.style.color = '#999';
  const nodes = nodeIds.map((id) => rawData.nodes.find((n) => n.id === id)).filter(Boolean) as GraphNode[];
  const labellableValues = nodes.map((n) => n.labellableRoot);
  const allTrue = labellableValues.every((v) => v === true);
  const allFalse = labellableValues.every((v) => v === false);
  labellableCb.checked = allTrue;
  labellableCb.indeterminate = !allTrue && !allFalse;
  modal.style.display = 'flex';
  labellableCb.focus();
}

function hideRenameModal(): void {
  document.getElementById('renameModal')!.style.display = 'none';
}

function showAddNodeModal(canvasX: number, canvasY: number): void {
  pendingAddNodePosition = { x: canvasX, y: canvasY };
  addNodeModalShowing = true;
  const modal = document.getElementById('addNodeModal')!;
  const input = document.getElementById('addNodeInput') as HTMLInputElement;
  const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
  input.value = '';
  okBtn.disabled = true;
  modal.style.display = 'flex';
  input.focus();
}

function hideAddNodeModal(): void {
  pendingAddNodePosition = null;
  addNodeMode = false;
  document.getElementById('addNodeModal')!.style.display = 'none';
}

function updateAddNodeOkButton(): void {
  const input = document.getElementById('addNodeInput') as HTMLInputElement;
  const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
  if (input && okBtn) {
    okBtn.disabled = !input.value.trim();
  }
}

function confirmAddNode(): void {
  if (!pendingAddNodePosition) return;
  const input = document.getElementById('addNodeInput') as HTMLInputElement;
  const label = input?.value?.trim();
  if (!label) return;
  const { x, y } = pendingAddNodePosition;
  const result = addNewNodeAtPosition(x, y, label);
  if (result) {
    applyFilter(true);
  }
  hideAddNodeModal();
}

const EDGE_TYPES = ['subClassOf', 'partOf', 'contains'];

function showEditEdgeModal(edgeFrom: string, edgeTo: string, edgeType: string): void {
  const modal = document.getElementById('editEdgeModal')!;
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap')!;
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;

  const edge = rawData.edges.find((e) => e.from === edgeFrom && e.to === edgeTo && e.type === edgeType);

  modal.dataset.mode = 'edit';
  modal.dataset.oldFrom = edgeFrom;
  modal.dataset.oldTo = edgeTo;
  modal.dataset.oldType = edgeType;
  fromSel.disabled = false;
  toSel.disabled = false;
  fromSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeFrom ? ' selected' : ''}>${n.label}</option>`).join('');
  toSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === edgeTo ? ' selected' : ''}>${n.label}</option>`).join('');
  const allTypes = [...new Set([...EDGE_TYPES, ...getEdgeTypes(rawData.edges)])].sort();
  typeSel.innerHTML = allTypes.map((t) => `<option value="${t}"${t === edgeType ? ' selected' : ''}>${t}</option>`).join('');

  minCardInput.value = edge?.minCardinality != null ? String(edge.minCardinality) : '';
  maxCardInput.value = edge?.maxCardinality != null ? String(edge.maxCardinality) : '';
  cardWrap.style.display = edgeType !== 'subClassOf' ? 'block' : 'none';

  modal.querySelector('h3')!.textContent = 'Edit edge';
  modal.style.display = 'flex';
}

function showAddEdgeModal(from: string, to: string, callback: (data: { from: string; to: string; id?: string } | null) => void): void {
  const modal = document.getElementById('editEdgeModal')!;
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap')!;
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;

  modal.dataset.mode = 'add';
  pendingAddEdgeData = { from, to, callback };
  fromSel.disabled = true;
  toSel.disabled = true;
  fromSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === from ? ' selected' : ''}>${n.label}</option>`).join('');
  toSel.innerHTML = rawData.nodes.map((n) => `<option value="${n.id}"${n.id === to ? ' selected' : ''}>${n.label}</option>`).join('');
  const allTypes = [...new Set([...EDGE_TYPES, ...getEdgeTypes(rawData.edges)])].sort();
  typeSel.innerHTML = allTypes.map((t) => `<option value="${t}"${t === 'subClassOf' ? ' selected' : ''}>${t}</option>`).join('');

  minCardInput.value = '';
  maxCardInput.value = '';
  cardWrap.style.display = typeSel.value !== 'subClassOf' ? 'block' : 'none';

  modal.querySelector('h3')!.textContent = 'Add edge';
  modal.style.display = 'flex';
}

function hideEditEdgeModal(): void {
  if (pendingEditEdgeCallback) {
    pendingEditEdgeCallback(null);
    pendingEditEdgeCallback = null;
  }
  if (pendingAddEdgeData) {
    pendingAddEdgeData.callback(null);
    pendingAddEdgeData = null;
  }
  document.getElementById('editEdgeModal')!.style.display = 'none';
}

function getCardinalityFromEditModal(): { minCardinality?: number | null; maxCardinality?: number | null } | undefined {
  const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
  const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;
  const cardWrap = document.getElementById('editEdgeCardinalityWrap');
  if (!cardWrap || cardWrap.style.display === 'none') return undefined;
  const minVal = minCardInput?.value?.trim();
  const maxVal = maxCardInput?.value?.trim();
  const min = minVal === '' ? null : parseInt(minVal, 10);
  const max = maxVal === '' ? null : parseInt(maxVal, 10);
  if ((minVal !== '' && (isNaN(min!) || min! < 0)) || (maxVal !== '' && (isNaN(max!) || max! < 0))) return undefined;
  return { minCardinality: minVal === '' ? null : min!, maxCardinality: maxVal === '' ? null : max! };
}

function confirmEditEdge(): void {
  const modal = document.getElementById('editEdgeModal')!;
  const fromSel = document.getElementById('editEdgeFrom') as HTMLSelectElement;
  const toSel = document.getElementById('editEdgeTo') as HTMLSelectElement;
  const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
  const mode = modal.dataset.mode;
  const cardinality = getCardinalityFromEditModal();

  if (mode === 'add' && pendingAddEdgeData) {
    const { from, to, callback } = pendingAddEdgeData;
    const newType = typeSel.value;
    if (!ttlStore) {
      hideEditEdgeModal();
      return;
    }
    const card = newType !== 'subClassOf' ? cardinality : undefined;
    const ok = addEdgeToStore(ttlStore, from, to, newType, card);
    if (!ok) {
      alert('Failed to add edge. An edge may already exist between these nodes.');
      hideEditEdgeModal();
      return;
    }
    const newEdge: import('./types').GraphEdge = { from, to, type: newType };
    if (card) {
      newEdge.minCardinality = card.minCardinality ?? undefined;
      newEdge.maxCardinality = card.maxCardinality ?? undefined;
    }
    rawData.edges.push(newEdge);
    pushUndoable(
      () => {
        removeEdgeFromStore(ttlStore!, from, to, newType);
        const i = rawData.edges.findIndex((e) => e.from === from && e.to === to && e.type === newType);
        if (i >= 0) rawData.edges.splice(i, 1);
      },
      () => {
        addEdgeToStore(ttlStore!, from, to, newType, card);
        rawData.edges.push(newEdge);
      }
    );
    hasUnsavedChanges = true;
    updateSaveButtonVisibility();
    callback({ from, to, id: `${from}->${to}:${newType}` });
    pendingAddEdgeData = null;
    hideEditEdgeModal();
    applyFilter(true);
    return;
  }

  const oldFrom = modal.dataset.oldFrom!;
  const oldTo = modal.dataset.oldTo!;
  const oldType = modal.dataset.oldType!;
  const newFrom = fromSel.value;
  const newTo = toSel.value;
  const newType = typeSel.value;
  const oldEdge = rawData.edges.find((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
  const card = newType !== 'subClassOf' ? cardinality : undefined;
  const sameEdge = oldFrom === newFrom && oldTo === newTo && oldType === newType &&
    (card?.minCardinality ?? null) === (oldEdge?.minCardinality ?? null) &&
    (card?.maxCardinality ?? null) === (oldEdge?.maxCardinality ?? null);
  if (!ttlStore || sameEdge) {
    hideEditEdgeModal();
    return;
  }
  const removeOk = removeEdgeFromStore(ttlStore, oldFrom, oldTo, oldType);
  if (!removeOk) {
    hideEditEdgeModal();
    return;
  }
  const addOk = addEdgeToStore(ttlStore, newFrom, newTo, newType, card);
  if (!addOk) {
    addEdgeToStore(ttlStore, oldFrom, oldTo, oldType, { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null });
    alert('Failed to update edge.');
    hideEditEdgeModal();
    return;
  }
  const idx = rawData.edges.findIndex((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
  if (idx >= 0) rawData.edges.splice(idx, 1);
  const newEdge: import('./types').GraphEdge = { from: newFrom, to: newTo, type: newType };
  if (card) {
    newEdge.minCardinality = card.minCardinality ?? undefined;
    newEdge.maxCardinality = card.maxCardinality ?? undefined;
  }
  rawData.edges.push(newEdge);
  const oldCard = { minCardinality: oldEdge?.minCardinality ?? null, maxCardinality: oldEdge?.maxCardinality ?? null };
  pushUndoable(
    () => {
      removeEdgeFromStore(ttlStore!, newFrom, newTo, newType);
      addEdgeToStore(ttlStore!, oldFrom, oldTo, oldType, oldCard);
      const i = rawData.edges.findIndex((e) => e.from === newFrom && e.to === newTo && e.type === newType);
      if (i >= 0) rawData.edges.splice(i, 1);
      rawData.edges.push({ from: oldFrom, to: oldTo, type: oldType, ...oldCard });
    },
    () => {
      removeEdgeFromStore(ttlStore!, oldFrom, oldTo, oldType);
      addEdgeToStore(ttlStore!, newFrom, newTo, newType, card);
      const i = rawData.edges.findIndex((e) => e.from === oldFrom && e.to === oldTo && e.type === oldType);
      if (i >= 0) rawData.edges.splice(i, 1);
      rawData.edges.push(newEdge);
    }
  );
  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  hideEditEdgeModal();
  applyFilter(true);
}

function confirmRename(): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLInputElement;
  const labellableCb = document.getElementById('renameLabellable') as HTMLInputElement;
  const mode = modal.dataset.mode;

  if (mode === 'multi') {
    const nodeIdsJson = modal.dataset.nodeIds;
    if (!nodeIdsJson || !ttlStore) {
      hideRenameModal();
      return;
    }
    const nodeIds: string[] = JSON.parse(nodeIdsJson);
    const newLabellable = labellableCb.checked;
    const oldVals = nodeIds.map((id) => {
      const n = rawData.nodes.find((x) => x.id === id);
      return { id, labellable: n?.labellableRoot };
    });
    let anyChanged = false;
    for (const nodeId of nodeIds) {
      const node = rawData.nodes.find((n) => n.id === nodeId);
      if (node && (node.labellableRoot === true) !== newLabellable) {
        node.labellableRoot = newLabellable;
        if (!node.annotations) node.annotations = {};
        node.annotations['labellableRoot'] = newLabellable;
        updateLabellableInStore(ttlStore, nodeId, newLabellable);
        anyChanged = true;
      }
    }
    if (anyChanged) {
      pushUndoable(
        () => {
          oldVals.forEach(({ id, labellable }) => {
            const n = rawData.nodes.find((x) => x.id === id);
            if (n && ttlStore) {
              n.labellableRoot = labellable ?? null;
              if (n.annotations) n.annotations['labellableRoot'] = labellable ?? null;
              updateLabellableInStore(ttlStore, id, labellable === true);
            }
          });
        },
        () => {
          nodeIds.forEach((id) => {
            const n = rawData.nodes.find((x) => x.id === id);
            if (n && ttlStore) {
              n.labellableRoot = newLabellable;
              if (!n.annotations) n.annotations = {};
              n.annotations['labellableRoot'] = newLabellable;
              updateLabellableInStore(ttlStore, id, newLabellable);
            }
          });
        }
      );
      hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    }
    hideRenameModal();
    applyFilter(true);
    return;
  }

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

  const oldLabel = node.label;
  const oldLabellable = node.labellableRoot;

  if (labelChanged) {
    node.label = newLabel;
    if (ttlStore) updateLabelInStore(ttlStore, nodeId, newLabel);
  }
  if (labellableChanged && ttlStore) {
    node.labellableRoot = newLabellable;
    if (!node.annotations) node.annotations = {};
    node.annotations['labellableRoot'] = newLabellable;
    updateLabellableInStore(ttlStore, nodeId, newLabellable);
  }

  pushUndoable(
    () => {
      if (labelChanged) {
        node.label = oldLabel;
        if (ttlStore) updateLabelInStore(ttlStore, nodeId, oldLabel);
      }
      if (labellableChanged && ttlStore) {
        node.labellableRoot = oldLabellable;
        if (!node.annotations) node.annotations = {};
        node.annotations['labellableRoot'] = oldLabellable ?? null;
        updateLabellableInStore(ttlStore, nodeId, oldLabellable === true);
      }
    },
    () => {
      if (labelChanged) {
        node.label = newLabel;
        if (ttlStore) updateLabelInStore(ttlStore, nodeId, newLabel);
      }
      if (labellableChanged && ttlStore) {
        node.labellableRoot = newLabellable;
        if (!node.annotations) node.annotations = {};
        node.annotations['labellableRoot'] = newLabellable;
        updateLabellableInStore(ttlStore, nodeId, newLabellable);
      }
    }
  );

  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  hideRenameModal();
  applyFilter(true);
}

async function saveTtl(): Promise<void> {
  if (!ttlStore) return;
  const overwriteCb = document.getElementById('overwriteFile') as HTMLInputElement | null;
  const doOverwrite = overwriteCb?.checked === true && fileHandle;
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
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Load ontology:</strong>
        <button type="button" id="selectFile" class="primary">Select TTL file...</button>
        <button type="button" id="loadLastOpened" title="Select a TTL file first" disabled>Load last opened: (none)</button>
        <input type="file" id="fileInput" accept=".ttl,.turtle" />
      </div>
      <div id="vizControls" style="display: none;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Layout:</strong>
        <select id="layoutMode">
          <option value="weighted">Hierarchical</option>
          <option value="force">Force-directed</option>
        </select>
      </div>
      <div id="styleMenusGroup" style="display: flex; flex-direction: column; gap: 8px; padding: 8px; border: 1px solid #000; border-radius: 4px;">
        <details id="annotationPropsMenu">
          <summary style="cursor: pointer; font-weight: bold;">Annotation Properties</summary>
          <div id="annotationPropsContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
        </details>
        <details id="edgeStylesMenu">
          <summary style="cursor: pointer; font-weight: bold;">Relationships</summary>
          <div id="edgeStylesContent" style="margin-top: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; max-height: 200px; overflow-y: auto;"></div>
        </details>
      </div>
      <div id="textDisplayWrap" style="position: relative; display: inline-block;">
        <button type="button" id="textDisplayToggle" style="cursor: pointer; font-weight: bold; font-size: 12px;">Text display options</button>
        <div id="textDisplayPopup" style="position: absolute; top: 100%; left: 0; margin-top: 4px; padding: 12px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; display: none; min-width: 200px;">
          <div style="margin-bottom: 10px;">
            <strong style="font-size: 12px;">Wrap text:</strong>
            <input type="number" id="wrapChars" min="1" max="50" value="10" style="width: 50px; margin-left: 6px;">
            <span style="font-size: 11px;">chars</span>
          </div>
          <div>
            <strong style="font-size: 12px;">Font size (px)</strong>
            <div style="margin-top: 6px;">
              <span style="font-size: 11px;">Min (leaves)</span>
              <input type="number" id="minFontSize" min="8" max="96" value="20" style="width: 45px; margin-left: 6px;">
              <span style="font-size: 11px; margin-left: 8px;">Max (roots)</span>
              <input type="number" id="maxFontSize" min="8" max="96" value="60" style="width: 45px; margin-left: 6px;">
            </div>
          </div>
        </div>
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
      <span id="undoRedoGroup" style="gap: 4px; align-items: center; display: inline-flex;">
        <button type="button" id="undoBtn" title="Undo (Ctrl+Z)" disabled>Undo</button>
        <button type="button" id="redoBtn" title="Redo (Ctrl+Shift+Z)" disabled>Redo</button>
      </span>
      <span id="saveGroup" style="display: none; gap: 8px; align-items: center;">
        <button id="saveChanges" class="primary">Save changes</button>
        <span id="overwriteFileWrap">
          <label style="font-size: 11px;">
            <input type="checkbox" id="overwriteFile"> Overwrite file on save
          </label>
        </span>
      </span>
      </div>
      <div id="errorMsg" class="error" style="display: none;"></div>
    </div>
    <div id="networkWrapper">
      <div id="network"></div>
      <button type="button" id="resetView">Reset view</button>
    </div>
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
    <div id="addNodeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Add node</h3>
        <label>Label: <input type="text" id="addNodeInput" placeholder="Enter node label" /></label>
        <div class="modal-actions">
          <button type="button" id="addNodeCancel">Cancel</button>
          <button type="button" id="addNodeConfirm" class="primary" disabled>OK</button>
        </div>
      </div>
    </div>
    <div id="editEdgeModal" class="modal" style="display: none;">
      <div class="modal-content">
        <h3>Edit edge</h3>
        <label>Relationship: <select id="editEdgeType"></select></label>
        <label style="display: block; margin-top: 8px;">From: <select id="editEdgeFrom"></select></label>
        <label style="display: block; margin-top: 8px;">To: <select id="editEdgeTo"></select></label>
        <div id="editEdgeCardinalityWrap" style="display: none; margin-top: 12px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
          <strong style="font-size: 12px;">Cardinality</strong>
          <div style="display: flex; gap: 12px; margin-top: 6px; align-items: center; flex-wrap: wrap;">
            <label style="font-size: 11px;">Min: <input type="number" id="editEdgeMinCard" min="0" placeholder="0" style="width: 60px;"></label>
            <label style="font-size: 11px;">Max: <input type="number" id="editEdgeMaxCard" min="0" placeholder="*" style="width: 60px;" title="Leave empty for unbounded"></label>
          </div>
        </div>
        <div class="modal-actions" style="margin-top: 16px;">
          <button type="button" id="editEdgeCancel">Cancel</button>
          <button type="button" id="editEdgeConfirm" class="primary">OK</button>
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
    const { graphData, store, annotationProperties: annotationProps } = await parseTtlToGraph(ttlString);
    rawData = graphData;
    annotationProperties = annotationProps;
    ttlStore = store;
    loadedFileName = fileName ?? null;
    loadedFilePath = pathHint ?? fileName ?? null;
    fileHandle = handle ?? null;
    hasUnsavedChanges = false;
    clearUndoRedo();
    updateFilePathDisplay();
    if (handle && fileName) {
      saveLastFileToIndexedDB(handle, fileName, pathHint ?? fileName).catch(() => {});
      updateLoadLastOpenedButton(fileName, pathHint ?? fileName);
    }
    updateSaveButtonVisibility();

    vizControls.style.display = 'contents';

    const edgeStylesContent = document.getElementById('edgeStylesContent')!;
    const annotationPropsContent = document.getElementById('annotationPropsContent');
    initEdgeStylesMenu(edgeStylesContent, applyFilter);
    if (annotationPropsContent) initAnnotationPropsMenu(annotationPropsContent, applyFilter);

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

  const annotationPropsContent = document.getElementById('annotationPropsContent');
  const currentFilter = {
    wrapChars,
    minFontSize,
    maxFontSize,
    searchQuery: searchEl?.value ?? '',
    includeNeighbors: neighborsEl?.checked ?? true,
    edgeStyleConfig: getEdgeStyleConfig(edgeStylesContent),
    annotationStyleConfig: getAnnotationStyleConfig(annotationPropsContent),
    layoutMode,
  };

  const data = buildNetworkData(currentFilter);
  const options = getNetworkOptions(layoutMode);

  const manipulationOptions = {
    enabled: true,
    initiallyActive: true,
    addNode: (
      nodeData: { x?: number; y?: number },
      callback: (data: { id: string; label: string; x?: number; y?: number } | null) => void
    ) => {
      if (addNodeModalShowing) {
        callback(null);
        return;
      }
      const x = nodeData.x ?? 0;
      const y = nodeData.y ?? 0;
      showAddNodeModal(x, y);
      callback(null);
    },
    addEdge: (
      edgeData: { from: string; to: string },
      callback: (data: { from: string; to: string; id?: string } | null) => void
    ) => {
      const from = String(edgeData.from);
      const to = String(edgeData.to);
      if (from === to || !ttlStore) {
        callback(null);
        return;
      }
      showAddEdgeModal(from, to, callback);
    },
    editNode: false,
    editEdge: {
      editWithoutDrag: (
        edgeData: { id?: string; from: string; to: string },
        callback: (data: { from: string; to: string } | null) => void
      ) => {
        const edgeId = edgeData.id ?? '';
        const match = edgeId.match(/^(.+)->(.+):(.+)$/);
        if (!match || !ttlStore) {
          callback(null);
          return;
        }
        const [, from, to, type] = match;
        pendingEditEdgeCallback = callback;
        showEditEdgeModal(from, to, type);
      },
    },
    deleteNode: false,
    deleteEdge: false,
  };

  const networkContainer = document.getElementById('network')!;
  if (network) {
    network.setData(data);
    network.setOptions({
      ...options,
      manipulation: manipulationOptions,
      width: '100%',
      height: '100%',
    });
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
    const opts = {
      ...options,
      manipulation: manipulationOptions,
      width: '100%',
      height: '100%',
    };
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
        if (w > 0 && h > 0) {
          network.setSize(`${w}px`, `${h}px`);
          network.redraw();
        }
      }
    };
    const ro = new ResizeObserver(resizeNetwork);
    ro.observe(networkContainer);
    resizeNetwork(); // Initial size
    setupNetworkSelectionAndNavigation(network, networkContainer);
    network.on('click', () => {
      if (network) updateSelectionInfoDisplay(network);
    });
    network.on('doubleClick', (params: { nodes: string[]; edges: string[] }) => {
      if (!network) return;
      if (!params.nodes.length) return;
      const clickedNodeId = params.nodes[0] as string;
      const selectedIds = network.getSelectedNodes().map(String);
      if (selectedIds.length > 1 && selectedIds.includes(clickedNodeId)) {
        showMultiEditModal(selectedIds);
      } else {
        const node = rawData.nodes.find((n) => n.id === clickedNodeId);
        if (node) showRenameModal(clickedNodeId, node.label, node.labellableRoot);
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

  document.getElementById('layoutMode')?.addEventListener('change', applyFilter);

  const textDisplayToggle = document.getElementById('textDisplayToggle');
  const textDisplayPopup = document.getElementById('textDisplayPopup');
  const textDisplayWrap = document.getElementById('textDisplayWrap');
  textDisplayToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = textDisplayPopup?.style.display === 'block';
    if (textDisplayPopup) textDisplayPopup.style.display = isVisible ? 'none' : 'block';
  });
  document.addEventListener('click', (e) => {
    if (textDisplayPopup?.style.display === 'block' && textDisplayWrap && !textDisplayWrap.contains(e.target as Node)) {
      textDisplayPopup.style.display = 'none';
    }
  });

  document.getElementById('wrapChars')?.addEventListener('input', applyFilter);
  document.getElementById('wrapChars')?.addEventListener('change', applyFilter);
  document.getElementById('minFontSize')?.addEventListener('input', applyFilter);
  document.getElementById('minFontSize')?.addEventListener('change', applyFilter);
  document.getElementById('maxFontSize')?.addEventListener('input', applyFilter);
  document.getElementById('maxFontSize')?.addEventListener('change', applyFilter);
  document
    .getElementById('searchIncludeNeighbors')
    ?.addEventListener('change', applyFilter);
  document.getElementById('undoBtn')?.addEventListener('click', performUndo);
  document.getElementById('redoBtn')?.addEventListener('click', performRedo);
  document.getElementById('editEdgeCancel')?.addEventListener('click', hideEditEdgeModal);
  document.getElementById('editEdgeConfirm')?.addEventListener('click', confirmEditEdge);
  document.getElementById('editEdgeType')?.addEventListener('change', () => {
    const typeSel = document.getElementById('editEdgeType') as HTMLSelectElement;
    const cardWrap = document.getElementById('editEdgeCardinalityWrap');
    if (cardWrap) cardWrap.style.display = typeSel.value !== 'subClassOf' ? 'block' : 'none';
  });
  document.getElementById('editEdgeModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'editEdgeModal') hideEditEdgeModal();
  });
  document.getElementById('editEdgeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#editEdgeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') confirmEditEdge();
      else hideEditEdgeModal();
      e.preventDefault();
    }
  });
  document.getElementById('resetView')?.addEventListener('click', () => {
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'weighted';
    (document.getElementById('wrapChars') as HTMLInputElement).value = '10';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = '60';
    (document.getElementById('searchQuery') as HTMLInputElement).value = '';
    (document.getElementById('searchIncludeNeighbors') as HTMLInputElement).checked = true;
    document.getElementById('searchAutocomplete')?.classList.remove('visible');
    textDisplayPopup && (textDisplayPopup.style.display = 'none');
    document.querySelectorAll('.edge-show-cb').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.edge-label-cb').forEach((cb) => ((cb as HTMLInputElement).checked = false));
    getEdgeTypes(rawData.edges).forEach((type) => {
      const colorEl = document.querySelector(`.edge-color-picker[data-type="${type}"]`) as HTMLInputElement;
      if (colorEl) colorEl.value = getDefaultEdgeColors()[type] ?? getDefaultColor();
    });
    document.querySelectorAll('.ap-bool-show').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.ap-bool-fill[data-val="true"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenTrue.fill));
    document.querySelectorAll('.ap-bool-border[data-val="true"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenTrue.border));
    document.querySelectorAll('.ap-bool-linetype[data-val="true"]').forEach((el) => {
      (el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenTrue.lineType;
      const dropdown = (el as HTMLElement).closest('.ap-linetype-dropdown');
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      const opt = BORDER_LINE_OPTIONS.find((o) => o.value === DEFAULT_BOOL_COLORS.whenTrue.lineType);
      if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
    });
    document.querySelectorAll('.ap-bool-fill[data-val="false"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenFalse.fill));
    document.querySelectorAll('.ap-bool-border[data-val="false"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenFalse.border));
    document.querySelectorAll('.ap-bool-linetype[data-val="false"]').forEach((el) => {
      (el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenFalse.lineType;
      const dropdown = (el as HTMLElement).closest('.ap-linetype-dropdown');
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      const opt = BORDER_LINE_OPTIONS.find((o) => o.value === DEFAULT_BOOL_COLORS.whenFalse.lineType);
      if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
    });
    document.querySelectorAll('.ap-bool-show[data-val="undefined"]').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.ap-bool-fill[data-val="undefined"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenUndefined.fill));
    document.querySelectorAll('.ap-bool-border[data-val="undefined"]').forEach((el) => ((el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenUndefined.border));
    document.querySelectorAll('.ap-bool-linetype[data-val="undefined"]').forEach((el) => {
      (el as HTMLInputElement).value = DEFAULT_BOOL_COLORS.whenUndefined.lineType;
      const dropdown = (el as HTMLElement).closest('.ap-linetype-dropdown');
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      const opt = BORDER_LINE_OPTIONS.find((o) => o.value === DEFAULT_BOOL_COLORS.whenUndefined.lineType);
      if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
    });
    document.querySelectorAll('.ap-text-rules').forEach((rulesDiv) => {
      const divs = rulesDiv.querySelectorAll(':scope > div');
      divs.forEach((d, i) => {
        if (i > 0) d.remove();
        else {
          (d.querySelector('.ap-regex') as HTMLInputElement).value = '';
          (d.querySelector('.ap-regex-fill') as HTMLInputElement).value = DEFAULT_TEXT_COLOR.fill;
          (d.querySelector('.ap-regex-border') as HTMLInputElement).value = DEFAULT_TEXT_COLOR.border;
          const linetypeInput = d.querySelector('.ap-regex-linetype') as HTMLInputElement;
          if (linetypeInput) {
            linetypeInput.value = 'solid';
            const dropdown = linetypeInput.closest('.ap-linetype-dropdown');
            const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
            if (trigger) trigger.innerHTML = `${renderLineTypeSvg('')}<span style="margin-left: 4px;">▾</span>`;
          }
        }
      });
    });
    applyFilter();
    network?.fit();
  });
  document.getElementById('saveChanges')?.addEventListener('click', saveTtl);

  const redrawNetworkOnMenuToggle = (): void => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (network) {
          const nc = document.getElementById('network');
          if (nc) {
            const w = nc.clientWidth;
            const h = nc.clientHeight;
            if (w > 0 && h > 0) {
              network.setSize(`${w}px`, `${h}px`);
              network.redraw();
            }
          }
        }
      }, 50);
    });
  };
  document.getElementById('annotationPropsMenu')?.addEventListener('toggle', redrawNetworkOnMenuToggle);
  document.getElementById('edgeStylesMenu')?.addEventListener('toggle', redrawNetworkOnMenuToggle);

  document.getElementById('renameCancel')?.addEventListener('click', hideRenameModal);
  document.getElementById('renameConfirm')?.addEventListener('click', confirmRename);
  document.getElementById('renameModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#renameModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') confirmRename();
      else hideRenameModal();
      e.preventDefault();
    }
  });
  document.getElementById('renameModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'renameModal') hideRenameModal();
  });

  document.getElementById('addNodeInput')?.addEventListener('input', updateAddNodeOkButton);
  document.getElementById('addNodeCancel')?.addEventListener('click', hideAddNodeModal);
  document.getElementById('addNodeConfirm')?.addEventListener('click', confirmAddNode);
  document.getElementById('addNodeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#addNodeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') {
        const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
        if (okBtn && !okBtn.disabled) confirmAddNode();
      } else {
        hideAddNodeModal();
      }
      e.preventDefault();
    }
  });
  document.getElementById('addNodeModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'addNodeModal') hideAddNodeModal();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      const searchInput = document.getElementById('searchQuery') as HTMLInputElement;
      searchInput?.focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) performRedo();
      else performUndo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      performRedo();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (performDeleteSelection()) e.preventDefault();
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
