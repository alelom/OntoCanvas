/**
 * Undo, redo, opening in a new tab, and resetting the view.
 * Moved out of eventListeners.ts (#198).
 */
import { getDefaultEdgeColors, getDefaultColor } from '../../graph';
import { actions } from '../../state/actions';
import { session, canvasState } from '../../state/appState';
import { performUndo, performRedo } from '../../workflows/undoRedo';
import { DEFAULT_BOOL_COLORS, DEFAULT_TEXT_COLOR } from '../constants';
import { updateEdgeColorsLegend, BORDER_LINE_OPTIONS, renderLineTypeSvg } from '../edgeStyleUtils';
import { defaultMaxFontSize } from '../fontSizeDefaults';
import { getAllRelationshipTypes, colourableRelationshipTypes } from '../relationshipUtils';
import { setSearchScope, DEFAULT_SEARCH_SCOPE } from '../searchOptions';

export function wireToolbar(): void {
  document.getElementById('undoBtn')?.addEventListener('click', performUndo);
  document.getElementById('redoBtn')?.addEventListener('click', performRedo);

  document.getElementById('openInNewTab')?.addEventListener('click', () => {
    const params = new URLSearchParams(window.location.search);
    const onto = params.get('onto');
    const base = window.location.origin + window.location.pathname;
    // Open the same ontology in a full, non-embedded OntoCanvas tab (drop the embed flag).
    const url = onto ? `${base}?onto=${encodeURIComponent(onto)}` : base;
    window.open(url, '_blank', 'noopener');
  });
  document.getElementById('resetView')?.addEventListener('click', () => {
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'hierarchical-dag';
    (document.getElementById('wrapChars') as HTMLInputElement).value = '12';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = String(defaultMaxFontSize(session.rawData?.nodes?.length ?? 0));
    (document.getElementById('relationshipFontSize') as HTMLInputElement).value = '18';
    (document.getElementById('searchQuery') as HTMLInputElement).value = '';
    setSearchScope(DEFAULT_SEARCH_SCOPE);
    (document.getElementById('searchExactMatch') as HTMLInputElement).checked = true;
    document.getElementById('searchAutocomplete')?.classList.remove('visible');
    for (const id of ['textDisplayPopup', 'searchOptionsPopup']) {
      const popup = document.getElementById(id);
      if (popup) popup.style.display = 'none';
    }
    document.querySelectorAll('.edge-show-cb').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    document.querySelectorAll('.edge-label-cb').forEach((cb) => ((cb as HTMLInputElement).checked = true));
    const types = getAllRelationshipTypes(session.rawData, session.objectProperties);
    const defaultColors = getDefaultEdgeColors(colourableRelationshipTypes(types, session.objectProperties));
    types.forEach((type) => {
      const colorEl = document.querySelector(`.edge-color-picker[data-type="${type}"]`) as HTMLInputElement;
      if (colorEl) colorEl.value = defaultColors[type] ?? getDefaultColor();
    });
    updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences);
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
    actions.applyFilter();
    canvasState.network?.fit();
  });
}
