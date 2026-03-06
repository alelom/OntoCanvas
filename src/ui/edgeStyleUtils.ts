import type { GraphData, BorderLineType, ObjectPropertyInfo } from '../types';
import type { ExternalOntologyReference } from '../storage';
import { getAllRelationshipTypes, getRelationshipLabel } from './relationshipUtils';
import { getDefaultEdgeColors, getDefaultColor, getEdgeTypes } from '../graph';

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
  // HTML attributes can contain # without escaping, but we need to escape quotes
  const htmlEscapedType = type.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `
    <div class="ap-linetype-dropdown" style="position: relative; display: inline-block;">
      <input type="hidden" class="edge-linetype" data-type="${htmlEscapedType}" value="${selected}">
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
  
  // Get all relationship types from the menu (what's in the DOM)
  const menuTypes = getAllRelationshipTypes(rawData, objectProperties);
  
  // Also include any edge types that are actually in rawData.edges but might not be in the menu yet
  // This handles cases where external properties are in edges but not yet in objectProperties
  const edgeTypes = getEdgeTypes(rawData.edges);
  const allTypes = new Set([...menuTypes, ...edgeTypes]);
  
  // Get default colors for all types (distributed across spectrum)
  const defaultColors = getDefaultEdgeColors([...allTypes]);
  
  allTypes.forEach((type) => {
    // Escape special CSS characters in the type for use in attribute selectors
    // CSS.escape() handles #, :, and other special characters
    const escapedType = CSS.escape(type);
    
    const showCb = edgeStylesContent.querySelector(
      `.edge-show-cb[data-type="${escapedType}"]`
    ) as HTMLInputElement | null;
    const labelCb = edgeStylesContent.querySelector(
      `.edge-label-cb[data-type="${escapedType}"]`
    ) as HTMLInputElement | null;
    const colorEl = edgeStylesContent.querySelector(
      `.edge-color-picker[data-type="${escapedType}"]`
    ) as HTMLInputElement | null;
    const lineTypeEl = edgeStylesContent.querySelector(
      `.edge-linetype[data-type="${escapedType}"]`
    ) as HTMLInputElement | null;
    const lineType = (lineTypeEl?.value as BorderLineType) ?? 'solid';
    
    // Get default color - check both full URI and local name for external properties
    let defaultColor = defaultColors[type] ?? getDefaultColor();
    if (!defaultColor || defaultColor === getDefaultColor()) {
      // Try extracting local name for external URIs
      const localName = type.includes('#') ? type.split('#').pop() : type.split('/').pop();
      if (localName) {
        defaultColor = defaultColors[localName] ?? getDefaultColor();
      }
    }
    
    config[type] = {
      show: showCb?.checked ?? true, // Default to true if checkbox doesn't exist (edge not in menu yet)
      showLabel: labelCb?.checked ?? (type === 'subClassOf' ? false : true), // subClassOf label hidden by default
      color: colorEl?.value ?? defaultColor,
      lineType,
    };
  });
  return config;
}

/**
 * Check if an edge type can be displayed in the canvas.
 * 
 * An edge can be displayed if:
 * 1. It's subClassOf (always displayable, not an object property)
 * 2. It appears in rawData.edges (meaning it has both domain and range AND classes exist, OR a restriction exists)
 * 
 * According to parser.ts, edges are only created when:
 * - Both domain and range exist AND the classes exist in the ontology (domain/range edge)
 * - OR a restriction exists using that property (restriction edge)
 * 
 * If an edge type doesn't appear in rawData.edges, it means either:
 * - Domain or range is missing (e.g., "depicts" has domain but no range)
 * - The classes don't exist
 * - No restriction exists
 * 
 * In all these cases, the edge cannot be displayed, so it shouldn't be in the legend.
 */
function canDisplayEdgeType(
  edgeType: string,
  rawData: GraphData,
  objectProperties: ObjectPropertyInfo[]
): boolean {
  // subClassOf is always displayable (it's not an object property)
  if (edgeType === 'subClassOf') {
    return true;
  }
  
  // Check if this edge type actually appears in rawData.edges
  // If it appears, it means it can be displayed (has domain/range + classes exist, or restriction exists)
  // If it doesn't appear, it cannot be displayed (missing domain/range, classes don't exist, or no restriction)
  return rawData.edges.some((e) => e.type === edgeType);
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
  
  // Filter to only show edge types that can be displayed (have domain/range or appear in edges)
  const types = Object.keys(config).filter((t) => {
    return config[t].show && canDisplayEdgeType(t, rawData, objectProperties);
  });
  
  if (types.length === 0) {
    legendEl.textContent = '';
    return;
  }
  // Create clickable edge entries with hover underline
  const edgeEntries = types.map((t) => {
    const label = getRelationshipLabel(t, objectProperties, externalOntologyReferences);
    // Use the full URI (t) directly as the data-edge-type value
    return `<span style="color: ${config[t].color}">●</span> <a href="#" class="edge-legend-link" data-edge-type="${t.replace(/"/g, '&quot;')}" style="color: inherit; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${label}</a>`;
  }).join(' ');
  
  legendEl.innerHTML = 'Edges: ' + edgeEntries;
  
  // Add click handlers for edge links
  legendEl.querySelectorAll('.edge-legend-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const edgeType = (link as HTMLElement).getAttribute('data-edge-type');
      if (edgeType) {
        const searchInput = document.getElementById('searchQuery') as HTMLInputElement;
        if (searchInput) {
          searchInput.value = edgeType;
          // Trigger input event to update search and styling
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          // Focus the search input to show the outline
          searchInput.focus();
        }
      }
    });
  });
  
  // externalOntologyReferences is used in getRelationshipLabel call above
}
