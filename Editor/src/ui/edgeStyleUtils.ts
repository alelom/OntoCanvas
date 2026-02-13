import type { GraphData, BorderLineType, ObjectPropertyInfo } from '../types';
import type { ExternalOntologyReference } from '../storage';
import { getAllRelationshipTypes, getRelationshipLabel } from './relationshipUtils';
import { getDefaultEdgeColors, getDefaultColor } from '../graph';

/**
 * Border line type options for edge and annotation property styling
 */
export const BORDER_LINE_OPTIONS: { value: BorderLineType; visValue: false | true | number[]; svgDasharray: string }[] = [
  { value: 'solid', visValue: false, svgDasharray: '' },
  { value: 'dashed', visValue: [5, 5], svgDasharray: '5,3' },
  { value: 'dotted', visValue: [1, 3], svgDasharray: '1,3' },
  { value: 'dash-dot', visValue: [5, 2, 1, 2], svgDasharray: '5,2,1,2' },
  { value: 'dash-dot-dot', visValue: [5, 2, 1, 2, 1, 2], svgDasharray: '5,2,1,2,1,2' },
];

/**
 * Convert border line type to vis-network format
 */
export function borderLineTypeToVis(value: BorderLineType): false | true | number[] {
  return BORDER_LINE_OPTIONS.find((o) => o.value === value)?.visValue ?? false;
}

/**
 * Render SVG for line type preview
 */
export function renderLineTypeSvg(dasharray: string): string {
  return `<svg width="32" height="10" style="display: block;"><line x1="2" y1="5" x2="30" y2="5" stroke="#333" stroke-width="1.5" ${dasharray ? `stroke-dasharray="${dasharray}"` : ''}></line></svg>`;
}

/**
 * Render line type dropdown for annotation properties
 */
export function renderLineTypeDropdown(
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

/**
 * Render line type dropdown for edges (uses data-type instead of data-prop/data-val)
 */
export function renderEdgeLineTypeDropdown(type: string, selected: BorderLineType): string {
  const selectedOpt = BORDER_LINE_OPTIONS.find((o) => o.value === selected) ?? BORDER_LINE_OPTIONS[0];
  const optionsHtml = BORDER_LINE_OPTIONS.map(
    (opt) => `
    <div class="ap-linetype-option" data-value="${opt.value}" style="display: flex; align-items: center; padding: 4px 8px; cursor: pointer; font-size: 11px; border-bottom: 1px solid #eee;" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='#fff'">
      ${renderLineTypeSvg(opt.svgDasharray)}
    </div>`
  ).join('');
  return `
    <div class="ap-linetype-dropdown" style="position: relative; display: inline-block;">
      <input type="hidden" class="edge-linetype" data-type="${type}" value="${selected}">
      <button type="button" class="ap-linetype-trigger" style="display: flex; align-items: center; padding: 2px 6px; border: 1px solid #ccc; border-radius: 3px; background: #fff; cursor: pointer; font-size: 11px;">
        ${renderLineTypeSvg(selectedOpt.svgDasharray)}
        <span style="margin-left: 4px;">▾</span>
      </button>
      <div class="ap-linetype-panel" style="display: none; position: absolute; top: 100%; left: 0; margin-top: 2px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1001; min-width: 60px;">
        ${optionsHtml}
      </div>
    </div>`;
}

/**
 * Get edge style configuration from DOM
 */
export function getEdgeStyleConfig(
  edgeStylesContent: HTMLElement,
  rawData: GraphData,
  objectProperties: ObjectPropertyInfo[],
  externalOntologyReferences: ExternalOntologyReference[]
): Record<string, { show: boolean; showLabel: boolean; color: string; lineType: BorderLineType }> {
  const config: Record<string, { show: boolean; showLabel: boolean; color: string; lineType: BorderLineType }> = {};
  getAllRelationshipTypes(rawData, objectProperties).forEach((type) => {
    const showCb = edgeStylesContent.querySelector(
      `.edge-show-cb[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const labelCb = edgeStylesContent.querySelector(
      `.edge-label-cb[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const colorEl = edgeStylesContent.querySelector(
      `.edge-color-picker[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const lineTypeEl = edgeStylesContent.querySelector(
      `.edge-linetype[data-type="${type}"]`
    ) as HTMLInputElement | null;
    const lineType = (lineTypeEl?.value as BorderLineType) ?? 'solid';
    config[type] = {
      show: showCb?.checked ?? true,
      showLabel: labelCb?.checked ?? true,
      color: colorEl?.value ?? getDefaultEdgeColors()[type] ?? getDefaultColor(),
      lineType,
    };
  });
  return config;
}

/**
 * Update edge colors legend in the status bar
 */
export function updateEdgeColorsLegend(
  rawData: GraphData,
  objectProperties: ObjectPropertyInfo[],
  externalOntologyReferences: ExternalOntologyReference[]
): void {
  const legendEl = document.getElementById('edgeColorsLegend');
  if (!legendEl) return;
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  if (!edgeStylesContent) {
    legendEl.textContent = '';
    return;
  }
  const config = getEdgeStyleConfig(edgeStylesContent, rawData, objectProperties, externalOntologyReferences);
  const types = Object.keys(config).filter((t) => config[t].show);
  if (types.length === 0) {
    legendEl.textContent = '';
    return;
  }
  legendEl.innerHTML =
    'Edge colors: ' +
    types.map((t) => `<span style="color: ${config[t].color}">●</span> ${getRelationshipLabel(t, objectProperties, externalOntologyReferences)}`).join(' ');
  // externalOntologyReferences is used in getRelationshipLabel call above
}
