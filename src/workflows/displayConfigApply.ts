/**
 * Applying a display config to the page and the state: options, positions, edge and annotation styles.
 * Moved out of main.ts (#175).
 */
import { resolveLayoutMode, getEdgeTypes, getDefaultColor, getDefaultEdgeColors } from '../graph';
import { searchScopeFromConfig } from '../lib/searchHighlight';
import { extractLocalName } from '../utils/localName';
import { canvasState, session } from '../state/appState';
import type { DisplayConfig, ExternalNodeLayout } from '../storage/types';
import type { BorderLineType } from '../types';
import { updateEdgeColorsLegend } from '../ui/edgeStyleUtils';
import { defaultMaxFontSize } from '../ui/fontSizeDefaults';
import { getAllRelationshipTypes, colourableRelationshipTypes } from '../ui/relationshipUtils';
import { setSearchScope } from '../ui/searchOptions';
import { debugLog, debugWarn, isDebugMode } from '../utils/debug';
import { setHierarchyTypes, setRelaxIndividuals, setStackLeaves } from './layoutOptions';
import { forgetNodePositions, clearPositionsBeforeLayout } from './nodePositions';

export function applyDisplayConfig(config: DisplayConfig): void {
  canvasState.displayExternalReferences = config.displayExternalReferences ?? true;
  canvasState.clusterThingDataProperties = config.clusterThingDataProperties ?? true;
  const clusterThingEl = document.getElementById('clusterThingDataProps') as HTMLInputElement | null;
  if (clusterThingEl) clusterThingEl.checked = canvasState.clusterThingDataProperties;
  canvasState.externalNodeLayout = (config.externalNodeLayout as ExternalNodeLayout) ?? 'auto';
  // The layout made before the config arrived used the old tiers or layout; the config's own positions are applied
  // below. Loading a config is not undone with "Restore positions" (#152).
  const tiersChanged = setHierarchyTypes(config.hierarchyRelationships);
  const stackChanged = setStackLeaves(config.stackLeaves ?? true);
  setRelaxIndividuals(config.relaxIndividuals ?? true);
  const configLayoutMode = resolveLayoutMode(config.layoutMode);
  if (tiersChanged || stackChanged || (canvasState.lastLayoutMode !== null && canvasState.lastLayoutMode !== configLayoutMode)) forgetNodePositions();
  canvasState.lastLayoutMode = configLayoutMode;
  clearPositionsBeforeLayout();
  canvasState.loadedNodePositions = config.nodePositions ?? null;
  const displayExternalRefEl = document.getElementById('displayExternalRefs') as HTMLInputElement | null;
  const externalNodeLayoutEl = document.getElementById('externalNodeLayout') as HTMLSelectElement | null;
  if (displayExternalRefEl) displayExternalRefEl.checked = canvasState.displayExternalReferences;
  if (externalNodeLayoutEl) externalNodeLayoutEl.value = canvasState.externalNodeLayout;

  // Define edgeStyleConfig first before using it
  const edgeStyleConfig = config.edgeStyleConfig || {};
  
  debugLog('[DISPLAY CONFIG] Applying display config...');
  debugLog('[DISPLAY CONFIG] Edge style config keys:', Object.keys(edgeStyleConfig));
  debugLog('[DISPLAY CONFIG] Edge style config:', edgeStyleConfig);
  
  // Log all edge types in rawData
  const allEdgeTypesInData = getEdgeTypes(session.rawData.edges);
  debugLog('[DISPLAY CONFIG] All edge types in rawData.edges:', allEdgeTypesInData);
  debugLog('[DISPLAY CONFIG] Total edges in rawData.edges:', session.rawData.edges.length);
  
  // Check for describes edges specifically
  const describesEdgesInData = session.rawData.edges.filter((e) => 
    e.type === 'https://w3id.org/dano#describes' || 
    e.type.includes('describes') ||
    e.type.toLowerCase().includes('describes')
  );
  debugLog('[DISPLAY CONFIG] Describes edges in rawData.edges:', describesEdgesInData.length);
  if (describesEdgesInData.length > 0) {
    debugLog('[DISPLAY CONFIG] Describes edge types found:', [...new Set(describesEdgesInData.map(e => e.type))]);
    debugLog('[DISPLAY CONFIG] Sample describes edges:', describesEdgesInData.slice(0, 3));
  }
  
  // Check if edge types in config match edge types in data
  const configEdgeTypes = Object.keys(edgeStyleConfig);
  debugLog('[DISPLAY CONFIG] Edge types in config:', configEdgeTypes);
  
  const matchingTypes = configEdgeTypes.filter(type => allEdgeTypesInData.includes(type));
  const missingTypes = configEdgeTypes.filter(type => !allEdgeTypesInData.includes(type));
  debugLog('[DISPLAY CONFIG] Matching edge types (in both config and data):', matchingTypes);
  debugLog('[DISPLAY CONFIG] Missing edge types (in config but not in data):', missingTypes);
  
  // Check for potential matches with different formats (e.g., local name vs full URI)
  missingTypes.forEach(configType => {
    const potentialMatches = allEdgeTypesInData.filter(dataType => 
      dataType.includes(configType) || 
      configType.includes(dataType) ||
      dataType.endsWith('#' + configType) ||
      configType.endsWith('#' + dataType) ||
      extractLocalName(dataType) === configType ||
      extractLocalName(configType) === dataType
    );
    if (potentialMatches.length > 0) {
      debugWarn(`[DISPLAY CONFIG] ⚠ Edge type "${configType}" in config might match:`, potentialMatches);
    }
  });
  
  // Apply node positions with upgrade/migration support
  let matchedNodes = 0;
  let unmatchedNodes = 0;
  const nodePositions = config.nodePositions || {};
  // A node the config doesn't place drops the position laid out before the config arrived, so it goes near its
  // placed neighbours (#152).
  if (Object.keys(nodePositions).length > 0) {
    session.rawData.nodes.forEach((n) => {
      delete n.x;
      delete n.y;
    });
  }
  canvasState.positionsArranged = Object.keys(nodePositions).length > 0;
  
  Object.entries(nodePositions).forEach(([id, pos]) => {
    // First try exact ID match
    let node = session.rawData.nodes.find((n) => n.id === id);
    
    // If not found, try matching by label (for upgraded ontologies where IDs might have changed)
    if (!node) {
      // Try to find by label - useful when ontology structure changed but labels are similar
      const configLabel = id; // In old configs, ID might actually be a label
      node = session.rawData.nodes.find((n) => 
        n.label === configLabel || 
        n.id === configLabel ||
        (n.label && n.label.toLowerCase() === configLabel.toLowerCase())
      );
    }
    
    if (node) {
      node.x = pos.x;
      node.y = pos.y;
      matchedNodes++;
    } else {
      unmatchedNodes++;
    }
  });
  
  if (unmatchedNodes > 0) {
    debugLog(`[DISPLAY CONFIG] Applied positions for ${matchedNodes} nodes, ${unmatchedNodes} nodes from config not found in current ontology (likely due to ontology changes)`);
  } else {
    debugLog(`[DISPLAY CONFIG] Applied positions for ${matchedNodes} nodes`);
  }
  (document.getElementById('wrapChars') as HTMLInputElement).value = String(config.wrapChars ?? 12);
  (document.getElementById('minFontSize') as HTMLInputElement).value = String(config.minFontSize ?? 20);
  // Default the "Max" font size to a value scaled to the ontology size (fewer nodes → smaller Max,
  // gentler root→leaf gap). An explicit saved value always wins. See issue #44.
  const adaptiveMaxFont = defaultMaxFontSize(session.rawData?.nodes?.length ?? 0);
  (document.getElementById('maxFontSize') as HTMLInputElement).value = String(config.maxFontSize ?? adaptiveMaxFont);
  (document.getElementById('relationshipFontSize') as HTMLInputElement).value = String(config.relationshipFontSize ?? 18);
  (document.getElementById('dataPropertyFontSize') as HTMLInputElement).value = String(config.dataPropertyFontSize ?? 12);
  // Fall back to the default DAG layout when the config's mode no longer exists
  // (removed numbered modes, the 'weighted' alias, or any unknown value). See issue #19.
  const normalizedLayoutMode = resolveLayoutMode(config.layoutMode);
  (document.getElementById('layoutMode') as HTMLSelectElement).value = normalizedLayoutMode;
  const searchQueryEl = document.getElementById('searchQuery') as HTMLInputElement;
  if (searchQueryEl) {
    searchQueryEl.value = config.searchQuery ?? '';
    // Trigger input event to update styling (outline, background, clear button)
    // Use requestAnimationFrame to ensure event listeners are set up
    requestAnimationFrame(() => {
      searchQueryEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }
  setSearchScope(searchScopeFromConfig(config));
  (document.getElementById('searchExactMatch') as HTMLInputElement).checked = config.exactMatch ?? true;
  
  // Store the loaded edge style config so it can be merged when building the filter
  // This ensures edge types that don't have checkboxes yet are still applied
  // Convert old config format if needed (handle missing lineType)
  const upgradedEdgeStyleConfig: Record<string, { show: boolean; showLabel: boolean; color: string; lineType?: BorderLineType }> = {};
  Object.keys(edgeStyleConfig).forEach((type) => {
    const c = edgeStyleConfig[type];
    if (c) {
      upgradedEdgeStyleConfig[type] = {
        show: c.show !== false,
        showLabel: c.showLabel !== false,
        color: c.color || getDefaultColor(),
        lineType: c.lineType || 'solid', // Default to solid if missing
      };
    }
  });
  canvasState.loadedEdgeStyleConfig = upgradedEdgeStyleConfig;
  
  // Debug logging (only in debug mode)
  if (isDebugMode()) {
    debugLog(`[DISPLAY CONFIG] Stored edge style config for ${Object.keys(upgradedEdgeStyleConfig).length} edge types`);
  }
  
  if (document.getElementById('edgeStylesContent')) {
    const edgeStylesContent = document.getElementById('edgeStylesContent')!;
    const types = getAllRelationshipTypes(session.rawData, session.objectProperties);
    const defaultColors = getDefaultEdgeColors(colourableRelationshipTypes(types, session.objectProperties));
    let appliedToCheckboxes = 0;
    Object.keys(upgradedEdgeStyleConfig).forEach((type) => {
      const c = upgradedEdgeStyleConfig[type];
      if (c) {
        // CSS-escape the type to handle special characters like #, :, etc.
        const escapedType = CSS.escape(type);
        const showCb = edgeStylesContent.querySelector(`.edge-show-cb[data-type="${escapedType}"]`) as HTMLInputElement | null;
        const labelCb = edgeStylesContent.querySelector(`.edge-label-cb[data-type="${escapedType}"]`) as HTMLInputElement | null;
        const colorEl = edgeStylesContent.querySelector(`.edge-color-picker[data-type="${escapedType}"]`) as HTMLInputElement | null;
        if (showCb) {
          showCb.checked = c.show;
          appliedToCheckboxes++;
        }
        if (labelCb) {
          labelCb.checked = c.showLabel;
        }
        if (colorEl) {
          // Use saved color if available, otherwise use default color for this type
          colorEl.value = c.color || defaultColors[type] || getDefaultColor();
        }
      }
    });
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog(`[DISPLAY CONFIG] Applied edge styles to ${appliedToCheckboxes} checkboxes in DOM`);
    }
    // For types not in saved config, ensure they have default colors
    // This ensures that even if no saved config exists, all types get their spectrum colors
    types.forEach((type) => {
      if (!edgeStyleConfig[type]) {
        const escapedType = CSS.escape(type);
        const colorEl = document.querySelector(`.edge-color-picker[data-type="${escapedType}"]`) as HTMLInputElement | null;
        if (colorEl) {
          // Always set default color if not in saved config (override any existing value)
          const defaultColor = defaultColors[type] || getDefaultColor();
          colorEl.value = defaultColor;
        }
      }
    });
    updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences);
  }
  // Annotation style config is stored but restoration is deferred (complex DOM structure)
}
