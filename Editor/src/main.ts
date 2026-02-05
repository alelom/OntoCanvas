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
let annotationProperties: { name: string; isBoolean: boolean }[] = [];
let network: Network | null = null;
let ttlStore: import('n3').Store | null = null;
let loadedFileName: string | null = null;
let loadedFilePath: string | null = null;
let fileHandle: FileSystemFileHandle | null = null;
let hasUnsavedChanges = false;
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

function initAnnotationPropsMenu(
  container: HTMLElement,
  onApply: () => void
): void {
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
  document.addEventListener('click', () => {
    container.querySelectorAll('.ap-linetype-panel').forEach((p) => ((p as HTMLElement).style.display = 'none'));
  });
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
    }
    // when null/undefined: show (no rule applies)
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
    const pos = nodePositions[n.id];
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
    if (!node.annotations) node.annotations = {};
    node.annotations['labellableRoot'] = newLabellable;
    updateLabellableInStore(ttlStore, nodeId, newLabellable);
  }

  hasUnsavedChanges = true;
  updateSaveButtonVisibility();
  hideRenameModal();
  applyFilter(true); // preserveView = true
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
        if (w > 0 && h > 0) {
          network.setSize(`${w}px`, `${h}px`);
          network.redraw();
        }
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
