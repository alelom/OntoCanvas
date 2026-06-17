/**
 * Annotation Properties menu (top-menu panel).
 *
 * Renders the per-property styling controls (Boolean: when true/false/undefined colours +
 * visibility; Text: regex → colour rules), plus edit / delete / reorder controls. The menu's
 * priority order (top → bottom within each section) drives annotation styling precedence
 * (see resolveNodeAnnotationStyle in ../lib/annotationStyle).
 *
 * Extracted from main.ts to keep the entry file thin. All app state and side-effecting
 * callbacks are injected via AnnotationPropsMenuDeps (dependency injection), so this module
 * has no hidden dependency on main.ts globals and can be tested with stubbed deps.
 */
import { DataFactory, type Store } from 'n3';
import type { AnnotationPropertyInfo, BorderLineType } from '../types';
import type { AnnotationStyleConfig } from './constants';
import { DEFAULT_BOOL_COLORS, DEFAULT_TEXT_COLOR, BORDER_LINE_OPTIONS, DEFAULT_NODE_FALLBACK } from './constants';
import { renderLineTypeDropdown, renderLineTypeSvg } from './edgeStyleUtils';
import { getPrefixForUri } from './externalRefs';
import { getMainOntologyBase, removeAnnotationPropertyFromStore, getAnnotationPropertyUriFromStore } from '../parser';
import type { ExternalOntologyReference } from '../storage';
import { reorderAnnotationProperty, defaultAnnotationFill } from '../lib/annotationStyle';

/** Everything the menu needs from the host app, injected so this module stays decoupled. */
export interface AnnotationPropsMenuDeps {
  /** Current annotation properties in priority order. */
  getAnnotationProperties: () => AnnotationPropertyInfo[];
  /** Replace the annotation properties list (e.g. after delete or reorder). */
  setAnnotationProperties: (props: AnnotationPropertyInfo[]) => void;
  getTtlStore: () => Store | null;
  getExternalRefs: () => ExternalOntologyReference[];
  /** Re-apply styling / rebuild the graph (typically applyFilter). */
  onApply: () => void;
  /** Open the edit-annotation-property modal. */
  showEditModal: (name: string) => void;
  /** Mark the ontology as having unsaved changes (toggles the Save button). */
  markUnsaved: () => void;
  /** Persist display config (e.g. the new priority order). */
  scheduleSave: () => void;
  /** Register an undo/redo action. */
  pushUndoable: (undo: () => void, redo: () => void) => void;
}

let annotationPropsMenuClickAbort: AbortController | null = null;

export function initAnnotationPropsMenu(
  container: HTMLElement,
  deps: AnnotationPropsMenuDeps
): void {
  annotationPropsMenuClickAbort?.abort();
  annotationPropsMenuClickAbort = new AbortController();
  const signal = annotationPropsMenuClickAbort.signal;

  const annotationProperties = deps.getAnnotationProperties();
  const ttlStore = deps.getTtlStore();
  const externalRefs = deps.getExternalRefs();

  // Distinct default fill per property (by position) so two properties never share a colour
  // out of the box. Keyed by name; preservation below keeps a property's colour stable on reorder.
  const colourIndexByName = new Map(annotationProperties.map((ap, i) => [ap.name, i] as const));
  const defaultFillFor = (name: string): string => defaultAnnotationFill(colourIndexByName.get(name) ?? 0);

  // Snapshot the colours/visibility currently shown so a re-render (after reorder/delete/undo)
  // does not reset the user's picks. Only when controls already exist — on the first render there
  // is nothing to preserve and we must keep the fresh per-property defaults rendered below.
  const hadExistingControls = !!container.querySelector('.ap-default-fill, .ap-bool-fill, .ap-regex-fill');
  const preserved = hadExistingControls ? getAnnotationStyleConfig(container, annotationProperties) : null;

  container.innerHTML = '';
  const mainBase = ttlStore ? getMainOntologyBase(ttlStore) : null;

  // Default style for nodes that no annotation property governs (configurable). Always shown,
  // since with "when false"/"when undefined" off by default most nodes land here.
  const defaultSection = document.createElement('div');
  defaultSection.style.cssText = 'margin-bottom: 12px; padding: 8px; background: #eef1f3; border-radius: 4px;';
  defaultSection.innerHTML = `
    <strong style="font-size: 11px;">Default (no property applies)</strong>
    <div style="display: flex; gap: 12px; margin-top: 4px; align-items: center; font-size: 11px;">
      <div><span style="font-size: 10px;">Fill:</span> <input type="color" class="ap-default-fill" value="${DEFAULT_NODE_FALLBACK.fill}" style="width: 24px; height: 18px; vertical-align: middle;"></div>
      <div><span style="font-size: 10px;">Border:</span> <input type="color" class="ap-default-border" value="${DEFAULT_NODE_FALLBACK.border}" style="width: 24px; height: 18px; vertical-align: middle;"></div>
      <div><span style="font-size: 10px;">B. Line:</span> ${renderLineTypeDropdown('__default__', '', DEFAULT_NODE_FALLBACK.lineType, 'ap-default-linetype')}</div>
    </div>`;
  container.appendChild(defaultSection);

  const formatPropName = (ap: AnnotationPropertyInfo): string => {
    const prefix = getPrefixForUri(ap.uri, ap.isDefinedBy, externalRefs, mainBase);
    return prefix ? `${prefix}:${ap.name}` : ap.name;
  };

  const boolProps = annotationProperties.filter((ap) => ap.isBoolean);
  const textProps = annotationProperties.filter((ap) => !ap.isBoolean);

  /** Up/down priority controls. `isFirst`/`isLast` are within the property's own section. */
  const reorderControls = (name: string, isFirst: boolean, isLast: boolean): string => {
    const btn = (cls: string, glyph: string, title: string, disabled: boolean) =>
      `<button type="button" class="${cls}" data-name="${name}" title="${title}"${disabled ? ' disabled' : ''} style="background: none; border: none; cursor: ${disabled ? 'default' : 'pointer'}; padding: 0 2px; color: #555; font-size: 11px; line-height: 1; opacity: ${disabled ? 0.25 : 1};">${glyph}</button>`;
    return `<div style="display: flex; flex-direction: column; margin-right: 2px;">${btn(
      'ap-move-up',
      '▲',
      'Increase priority',
      isFirst
    )}${btn('ap-move-down', '▼', 'Decrease priority', isLast)}</div>`;
  };

  const rowHeaderControls = (ap: AnnotationPropertyInfo, isFirst: boolean, isLast: boolean): string => `
    ${reorderControls(ap.name, isFirst, isLast)}
    <div style="font-weight: bold; font-family: Consolas, monospace; font-size: 11px; flex: 1;">${formatPropName(ap)}</div>
    <button type="button" class="annotation-prop-edit-btn" data-name="${ap.name}" title="Edit annotation property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #3498db; font-size: 14px; transform: scaleX(-1);">✎</button>
    <button type="button" class="annotation-prop-delete-btn" data-name="${ap.name}" title="Delete this annotation property" style="background: none; border: none; cursor: pointer; padding: 2px; color: #c0392b; font-size: 14px;">🗑</button>`;

  if (boolProps.length > 0) {
    const boolSection = document.createElement('div');
    boolSection.style.marginBottom = '12px';
    boolSection.innerHTML = '<strong style="font-size: 11px;">Boolean properties</strong>';
    boolProps.forEach((ap, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin: 8px 0; padding: 8px; background: #f9f9f9; border-radius: 4px;';
      const renderBoolBlock = (val: 'true' | 'false' | 'undefined', defaults: { fill: string; border: string; lineType: BorderLineType }, activatable: boolean) => {
        const dataVal = val === 'undefined' ? 'undefined' : val;
        const activeToggle = activatable
          ? `<input type="checkbox" class="ap-bool-active" data-prop="${ap.name}" data-val="${dataVal}" title="Apply this colour. If off, a lower-priority property decides this node's colour."> `
          : '';
        return `
          <div>
            <span>${activeToggle}When ${val}:</span>
            <label><input type="checkbox" class="ap-bool-show" data-prop="${ap.name}" data-val="${dataVal}" checked> Show</label>
            <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 4px;">
              <div><span style="font-size: 10px;">Fill:</span> <input type="color" class="ap-bool-fill" data-prop="${ap.name}" data-val="${dataVal}" value="${defaults.fill}" style="width: 24px; height: 18px; vertical-align: middle;"></div>
              <div><span style="font-size: 10px;">Border:</span> <input type="color" class="ap-bool-border" data-prop="${ap.name}" data-val="${dataVal}" value="${defaults.border}" style="width: 24px; height: 18px; vertical-align: middle;"></div>
              <div><span style="font-size: 10px;">B. Line:</span> ${renderLineTypeDropdown(ap.name, dataVal, defaults.lineType, 'ap-bool-linetype')}</div>
            </div>
          </div>`;
      };
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          ${rowHeaderControls(ap, i === 0, i === boolProps.length - 1)}
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 11px;">
          ${renderBoolBlock('true', { ...DEFAULT_BOOL_COLORS.whenTrue, fill: defaultFillFor(ap.name) }, false)}
          ${renderBoolBlock('false', DEFAULT_BOOL_COLORS.whenFalse, true)}
          ${renderBoolBlock('undefined', DEFAULT_BOOL_COLORS.whenUndefined, true)}
        </div>
      `;
      boolSection.appendChild(row);
    });
    container.appendChild(boolSection);
  }

  if (textProps.length > 0) {
    const textSection = document.createElement('div');
    textSection.innerHTML = '<strong style="font-size: 11px;">Text properties (regex)</strong>';
    textProps.forEach((ap, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'margin: 8px 0; padding: 8px; background: #f9f9f9; border-radius: 4px;';
      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
          ${rowHeaderControls(ap, i === 0, i === textProps.length - 1)}
        </div>
        <div class="ap-text-rules" data-prop="${ap.name}"></div>
        <button type="button" class="ap-add-rule" data-prop="${ap.name}" style="font-size: 11px; margin-top: 4px;">+ Add regex rule</button>
      `;
      const rulesDiv = row.querySelector('.ap-text-rules')!;
      const addRule = (regex = '', fillColor = defaultFillFor(ap.name), borderColor = DEFAULT_TEXT_COLOR.border, borderLineType = DEFAULT_TEXT_COLOR.lineType) => {
        const ruleEl = document.createElement('div');
        ruleEl.style.cssText = 'display: flex; align-items: center; gap: 6px; margin: 4px 0; flex-wrap: wrap;';
        ruleEl.innerHTML = `
          <input type="text" class="ap-regex" placeholder="regex" value="${regex}" style="flex: 1; min-width: 80px; font-size: 11px; padding: 4px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div><span style="font-size: 10px;">Fill:</span> <input type="color" class="ap-regex-fill" value="${fillColor}" style="width: 24px; height: 18px;"></div>
            <div><span style="font-size: 10px;">Border:</span> <input type="color" class="ap-regex-border" value="${borderColor}" style="width: 24px; height: 18px;"></div>
            <div><span style="font-size: 10px;">B. Line:</span> ${renderLineTypeDropdown(ap.name, '', borderLineType, 'ap-regex-linetype')}</div>
          </div>
          <button type="button" class="ap-remove-rule" style="font-size: 11px;">×</button>
        `;
        ruleEl.querySelector('.ap-remove-rule')!.addEventListener('click', () => {
          ruleEl.remove();
          deps.onApply();
        });
        [...ruleEl.querySelectorAll('.ap-regex, .ap-regex-fill, .ap-regex-border')].forEach((el) =>
          el.addEventListener('change', deps.onApply)
        );
        ruleEl.querySelector('.ap-regex')!.addEventListener('input', deps.onApply);
        rulesDiv.appendChild(ruleEl);
      };
      addRule();
      row.querySelector('.ap-add-rule')!.addEventListener('click', () => {
        addRule();
        deps.onApply();
      });
      textSection.appendChild(row);
    });
    container.appendChild(textSection);
  }

  if (boolProps.length === 0 && textProps.length === 0) {
    const note = document.createElement('div');
    note.innerHTML = '<span style="font-size: 11px; color: #888;">No annotation properties in ontology</span>';
    container.appendChild(note);
  }

  // Reorder: move a property up/down in priority (within its Boolean/Text section).
  const moveProp = (name: string, direction: -1 | 1) => {
    deps.setAnnotationProperties(reorderAnnotationProperty(deps.getAnnotationProperties(), name, direction));
    deps.scheduleSave();
    initAnnotationPropsMenu(container, deps);
    deps.onApply();
  };
  container.querySelectorAll('.ap-move-up').forEach((btn) => {
    if ((btn as HTMLButtonElement).disabled) return;
    btn.addEventListener('click', () => moveProp((btn as HTMLElement).dataset.name!, -1), { signal });
  });
  container.querySelectorAll('.ap-move-down').forEach((btn) => {
    if ((btn as HTMLButtonElement).disabled) return;
    btn.addEventListener('click', () => moveProp((btn as HTMLElement).dataset.name!, 1), { signal });
  });

  container.querySelectorAll('.annotation-prop-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      deps.showEditModal((btn as HTMLElement).dataset.name!);
    }, { signal });
  });

  container.querySelectorAll('.annotation-prop-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = (btn as HTMLElement).dataset.name!;
      if (!confirm(`Delete annotation property "${name}"?`)) return;
      const store = deps.getTtlStore();
      if (!store) return;

      // Capture all quads for this property (by its real URI) so the delete can be undone.
      const propUri = getAnnotationPropertyUriFromStore(store, name);
      const subject = DataFactory.namedNode(propUri);
      const removedQuads = store.getQuads(subject, null, null, null).map((q) => q);
      const prevProps = [...deps.getAnnotationProperties()];

      if (removeAnnotationPropertyFromStore(store, name)) {
        deps.setAnnotationProperties(deps.getAnnotationProperties().filter((p) => p.name !== name));

        deps.pushUndoable(
          () => {
            const s = deps.getTtlStore();
            if (s) for (const q of removedQuads) s.addQuad(q.subject, q.predicate, q.object, q.graph);
            deps.setAnnotationProperties(prevProps);
            initAnnotationPropsMenu(container, deps);
            deps.markUnsaved();
            deps.onApply();
          },
          () => {
            const s = deps.getTtlStore();
            if (s) removeAnnotationPropertyFromStore(s, name);
            deps.setAnnotationProperties(deps.getAnnotationProperties().filter((p) => p.name !== name));
            initAnnotationPropsMenu(container, deps);
            deps.markUnsaved();
            deps.onApply();
          }
        );

        deps.markUnsaved();
        initAnnotationPropsMenu(container, deps);
        deps.onApply();
      }
    }, { signal });
  });

  container.querySelectorAll('.ap-bool-show, .ap-bool-fill, .ap-bool-border, .ap-bool-active, .ap-default-fill, .ap-default-border').forEach((el) =>
    el.addEventListener('change', deps.onApply, { signal })
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
      const hiddenInput = dropdown?.querySelector('.ap-bool-linetype, .ap-regex-linetype, .ap-default-linetype') as HTMLInputElement;
      const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement;
      if (hiddenInput && trigger && value) {
        hiddenInput.value = value;
        const selectedOpt = BORDER_LINE_OPTIONS.find((o) => o.value === value);
        if (selectedOpt) {
          trigger.innerHTML = `${renderLineTypeSvg(selectedOpt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
        }
        (dropdown?.querySelector('.ap-linetype-panel') as HTMLElement).style.display = 'none';
        deps.onApply();
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

  // Restore the snapshotted colours/visibility into the freshly rendered inputs (only when a
  // prior render existed; otherwise the per-property defaults rendered above stand).
  if (preserved) applyAnnotationStyleConfigToDom(container, preserved, annotationProperties);
}

/** Read the current annotation styling config from the menu DOM. */
export function getAnnotationStyleConfig(
  container: HTMLElement | null,
  annotationProperties: AnnotationPropertyInfo[]
): AnnotationStyleConfig {
  const config: AnnotationStyleConfig = { booleanProps: {}, textProps: {} };
  if (!container) return config;
  annotationProperties.forEach((ap) => {
    if (ap.isBoolean) {
      const q = (cls: string, val: string) =>
        container.querySelector(`.${cls}[data-prop="${ap.name}"][data-val="${val}"]`) as HTMLInputElement | null;
      const showTrue = q('ap-bool-show', 'true');
      const showFalse = q('ap-bool-show', 'false');
      const showUndefined = q('ap-bool-show', 'undefined');
      const activeFalse = q('ap-bool-active', 'false');
      const activeUndefined = q('ap-bool-active', 'undefined');
      const fillTrue = q('ap-bool-fill', 'true');
      const borderTrue = q('ap-bool-border', 'true');
      const fillFalse = q('ap-bool-fill', 'false');
      const borderFalse = q('ap-bool-border', 'false');
      const linetypeTrue = q('ap-bool-linetype', 'true');
      const linetypeFalse = q('ap-bool-linetype', 'false');
      const fillUndefined = q('ap-bool-fill', 'undefined');
      const borderUndefined = q('ap-bool-border', 'undefined');
      const linetypeUndefined = q('ap-bool-linetype', 'undefined');
      config.booleanProps[ap.name] = {
        whenTrue: {
          fillColor: fillTrue?.value ?? DEFAULT_BOOL_COLORS.whenTrue.fill,
          borderColor: borderTrue?.value ?? DEFAULT_BOOL_COLORS.whenTrue.border,
          borderLineType: (linetypeTrue?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenTrue.lineType,
          show: showTrue?.checked ?? true,
          active: true, // whenTrue is always active
        },
        whenFalse: {
          fillColor: fillFalse?.value ?? DEFAULT_BOOL_COLORS.whenFalse.fill,
          borderColor: borderFalse?.value ?? DEFAULT_BOOL_COLORS.whenFalse.border,
          borderLineType: (linetypeFalse?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenFalse.lineType,
          show: showFalse?.checked ?? true,
          active: activeFalse?.checked ?? false,
        },
        whenUndefined: {
          fillColor: fillUndefined?.value ?? DEFAULT_BOOL_COLORS.whenUndefined.fill,
          borderColor: borderUndefined?.value ?? DEFAULT_BOOL_COLORS.whenUndefined.border,
          borderLineType: (linetypeUndefined?.value as BorderLineType) ?? DEFAULT_BOOL_COLORS.whenUndefined.lineType,
          show: showUndefined?.checked ?? true,
          active: activeUndefined?.checked ?? false,
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

  // Default style for nodes no property governs.
  const defFill = container.querySelector('.ap-default-fill') as HTMLInputElement | null;
  const defBorder = container.querySelector('.ap-default-border') as HTMLInputElement | null;
  const defLine = container.querySelector('.ap-default-linetype') as HTMLInputElement | null;
  if (defFill || defBorder || defLine) {
    config.defaultStyle = {
      fillColor: defFill?.value ?? DEFAULT_NODE_FALLBACK.fill,
      borderColor: defBorder?.value ?? DEFAULT_NODE_FALLBACK.border,
      borderLineType: (defLine?.value as BorderLineType) ?? DEFAULT_NODE_FALLBACK.lineType,
    };
  }

  return config;
}

/**
 * Write a styling config back into the menu DOM inputs. Used to (a) preserve the user's colour
 * picks across a re-render (reorder/delete/undo) and (b) restore a saved config on load.
 * Boolean inputs are updated in place; text (regex) rules are rebuilt to match the config.
 */
export function applyAnnotationStyleConfigToDom(
  container: HTMLElement | null,
  config: AnnotationStyleConfig | null | undefined,
  annotationProperties: AnnotationPropertyInfo[]
): void {
  if (!container || !config) return;

  annotationProperties.forEach((ap) => {
    const boolCfg = config.booleanProps?.[ap.name];
    if (ap.isBoolean && boolCfg) {
      const set = (cls: string, val: string, value: string) => {
        const el = container.querySelector(`.${cls}[data-prop="${ap.name}"][data-val="${val}"]`) as HTMLInputElement | null;
        if (el) el.value = value;
      };
      const setShow = (val: string, checked: boolean) => {
        const el = container.querySelector(`.ap-bool-show[data-prop="${ap.name}"][data-val="${val}"]`) as HTMLInputElement | null;
        if (el) el.checked = checked;
      };
      const setActive = (val: string, active: boolean) => {
        const el = container.querySelector(`.ap-bool-active[data-prop="${ap.name}"][data-val="${val}"]`) as HTMLInputElement | null;
        if (el) el.checked = active;
      };
      const setLineType = (val: string, lineType: BorderLineType) => {
        const dropdown = (container.querySelector(`.ap-bool-linetype[data-prop="${ap.name}"][data-val="${val}"]`) as HTMLInputElement | null)?.closest('.ap-linetype-dropdown');
        const hidden = dropdown?.querySelector('.ap-bool-linetype') as HTMLInputElement | null;
        const trigger = dropdown?.querySelector('.ap-linetype-trigger') as HTMLElement | null;
        if (hidden) hidden.value = lineType;
        const opt = BORDER_LINE_OPTIONS.find((o) => o.value === lineType);
        if (trigger && opt) trigger.innerHTML = `${renderLineTypeSvg(opt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
      };
      const apply = (val: 'true' | 'false' | 'undefined', state: { fillColor: string; borderColor: string; borderLineType: BorderLineType; show: boolean; active?: boolean }) => {
        set('ap-bool-fill', val, state.fillColor);
        set('ap-bool-border', val, state.borderColor);
        setShow(val, state.show);
        setLineType(val, state.borderLineType);
        setActive(val, state.active ?? false); // no-op for 'true' (no active checkbox)
      };
      apply('true', boolCfg.whenTrue);
      apply('false', boolCfg.whenFalse);
      apply('undefined', boolCfg.whenUndefined);
      return;
    }

    const textCfg = config.textProps?.[ap.name];
    if (!ap.isBoolean && textCfg && textCfg.rules.length > 0) {
      const rulesDiv = container.querySelector(`.ap-text-rules[data-prop="${ap.name}"]`);
      if (!rulesDiv) return;
      const ruleEls = rulesDiv.querySelectorAll(':scope > div');
      // Update the inputs of the (default single) rule and any extra rendered rules.
      textCfg.rules.forEach((rule, i) => {
        const ruleEl = ruleEls[i];
        if (!ruleEl) return; // extra saved rules beyond the rendered ones are not recreated here
        const regexInput = ruleEl.querySelector('.ap-regex') as HTMLInputElement | null;
        const fillInput = ruleEl.querySelector('.ap-regex-fill') as HTMLInputElement | null;
        const borderInput = ruleEl.querySelector('.ap-regex-border') as HTMLInputElement | null;
        if (regexInput) regexInput.value = rule.regex;
        if (fillInput) fillInput.value = rule.fillColor;
        if (borderInput) borderInput.value = rule.borderColor;
      });
    }
  });

  // Default style for nodes no property governs.
  if (config.defaultStyle) {
    const dFill = container.querySelector('.ap-default-fill') as HTMLInputElement | null;
    const dBorder = container.querySelector('.ap-default-border') as HTMLInputElement | null;
    if (dFill) dFill.value = config.defaultStyle.fillColor;
    if (dBorder) dBorder.value = config.defaultStyle.borderColor;
    const dDropdown = (container.querySelector('.ap-default-linetype') as HTMLInputElement | null)?.closest('.ap-linetype-dropdown');
    const dHidden = dDropdown?.querySelector('.ap-default-linetype') as HTMLInputElement | null;
    const dTrigger = dDropdown?.querySelector('.ap-linetype-trigger') as HTMLElement | null;
    if (dHidden) dHidden.value = config.defaultStyle.borderLineType;
    const dOpt = BORDER_LINE_OPTIONS.find((o) => o.value === config.defaultStyle!.borderLineType);
    if (dTrigger && dOpt) dTrigger.innerHTML = `${renderLineTypeSvg(dOpt.svgDasharray)}<span style="margin-left: 4px;">▾</span>`;
  }
}
