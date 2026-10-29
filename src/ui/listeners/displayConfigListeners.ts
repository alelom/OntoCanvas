/**
 * Saving, loading and resetting the display configuration, and redrawing the graph when a menu opens.
 * Moved out of eventListeners.ts (#198).
 */
import { actions } from '../../state/actions';
import { fileState, session, canvasState } from '../../state/appState';
import { type DisplayConfig } from '../../storage/types';
import { saveDisplayConfigToIndexedDB, deleteDisplayConfigFromIndexedDB } from '../../storage/displayConfigStore';
import { displayConfigBaseName } from '../../utils/urlParams';
import { applyDisplayConfig } from '../../workflows/displayConfigApply';
import { collectDisplayConfig } from '../../workflows/displayConfigFiles';
import { setStackLeaves, setHierarchyTypes } from '../../workflows/layoutOptions';
import { forgetNodePositions } from '../../workflows/nodePositions';
import { updateEdgeColorsLegend } from '../edgeStyleUtils';
import { initEdgeStylesMenu } from '../relationshipTypeModal';
import { setSearchScope, DEFAULT_SEARCH_SCOPE } from '../searchOptions';

export function wireDisplayConfig(): void {
  document.getElementById('saveDisplayConfig')?.addEventListener('click', async () => {
    if (session.rawData.nodes.length === 0) return;
    if (canvasState.network) {
      const positions = canvasState.network.getPositions();
      Object.entries(positions).forEach(([id, pos]) => {
        const node = session.rawData.nodes.find((n) => n.id === id);
        if (node && pos) {
          node.x = pos.x;
          node.y = pos.y;
        }
      });
    }
    const config = collectDisplayConfig();
    if (!config) return;
    const baseName = displayConfigBaseName(fileState.loadedFileName || fileState.loadedFilePath || 'ontology');
    const suggestedName = `${baseName}.display.json`;
    try {
      if ('showSaveFilePicker' in window) {
        const handle = await (window as Window & { showSaveFilePicker: (o?: { suggestedName?: string; types?: object[] }) => Promise<FileSystemFileHandle> })
          .showSaveFilePicker({ suggestedName, types: [{ accept: { 'application/json': ['.json'] } }] });
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }));
        a.download = suggestedName;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errorMsg = document.getElementById('errorMsg') as HTMLElement;
        errorMsg.textContent = `Failed to save display config: ${err instanceof Error ? err.message : String(err)}`;
        errorMsg.style.display = 'block';
      }
    }
  });

  const loadDisplayConfigInput = document.createElement('input');
  loadDisplayConfigInput.type = 'file';
  loadDisplayConfigInput.accept = '.json,application/json';
  loadDisplayConfigInput.style.display = 'none';
  document.body.appendChild(loadDisplayConfigInput);
  loadDisplayConfigInput.addEventListener('change', async () => {
    const file = loadDisplayConfigInput.files?.[0];
    loadDisplayConfigInput.value = '';
    if (!file || session.rawData.nodes.length === 0) return;
    try {
      console.log('[DISPLAY CONFIG] Loading display config from file:', file.name);
      const text = await file.text();
      const config = JSON.parse(text) as DisplayConfig;
      if (!config || typeof config !== 'object') throw new Error('Invalid config format');
      console.log('[DISPLAY CONFIG] Parsed config version:', config.version);
      console.log('[DISPLAY CONFIG] Config has edgeStyleConfig:', !!config.edgeStyleConfig);
      
      // Apply the display config (this will store edgeStyleConfig in loadedEdgeStyleConfig)
      applyDisplayConfig(config);
      
      // Force a re-render to apply the styles
      actions.applyFilter();
      
      // Apply view state after a short delay to ensure network is ready
      if (canvasState.network && config.viewState) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            canvasState.network?.moveTo({
              scale: config.viewState!.scale,
              position: config.viewState!.position,
              animation: false,
            });
          });
        });
      }
      
      // Save the upgraded config back to IndexedDB
      const upgradedConfig = collectDisplayConfig();
      if (upgradedConfig) {
        saveDisplayConfigToIndexedDB(upgradedConfig, fileState.loadedFilePath, fileState.loadedFileName).catch(() => {});
      }
    } catch (err) {
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to load display config: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
  });

  document.getElementById('loadDisplayConfig')?.addEventListener('click', async () => {
    if (session.rawData.nodes.length === 0) return;
    try {
      if ('showOpenFilePicker' in window) {
        const [handle] = await (window as Window & { showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]> })
          .showOpenFilePicker({ types: [{ accept: { 'application/json': ['.json'] } }] });
        const file = await handle.getFile();
        const text = await file.text();
        const config = JSON.parse(text) as DisplayConfig;
        if (!config || typeof config !== 'object') throw new Error('Invalid config format');
        applyDisplayConfig(config);
        actions.applyFilter();
        if (canvasState.network && config.viewState) {
          canvasState.network.moveTo({
            scale: config.viewState.scale,
            position: config.viewState.position,
            animation: false,
          });
        }
        saveDisplayConfigToIndexedDB(config, fileState.loadedFilePath, fileState.loadedFileName).catch(() => {});
      } else {
        loadDisplayConfigInput.click();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const errorMsg = document.getElementById('errorMsg') as HTMLElement;
        errorMsg.textContent = `Failed to load display config: ${err instanceof Error ? err.message : String(err)}`;
        errorMsg.style.display = 'block';
      }
    }
  });

  document.getElementById('resetDisplayConfig')?.addEventListener('click', async () => {
    if (session.rawData.nodes.length === 0) return;
    
    forgetNodePositions();
    setHierarchyTypes(undefined);
    setStackLeaves(true);
    
    // Reset all display settings to defaults
    (document.getElementById('wrapChars') as HTMLInputElement).value = '12';
    (document.getElementById('minFontSize') as HTMLInputElement).value = '20';
    (document.getElementById('maxFontSize') as HTMLInputElement).value = '70';
    (document.getElementById('relationshipFontSize') as HTMLInputElement).value = '18';
    (document.getElementById('dataPropertyFontSize') as HTMLInputElement).value = '12';
    (document.getElementById('layoutMode') as HTMLSelectElement).value = 'hierarchical-dag';
    (document.getElementById('searchQuery') as HTMLInputElement).value = '';
    setSearchScope(DEFAULT_SEARCH_SCOPE);
    (document.getElementById('searchExactMatch') as HTMLInputElement).checked = true;

    // Clear loaded edge style config (so it doesn't override DOM checkboxes)
    canvasState.loadedEdgeStyleConfig = null;
    
    // Reset Object Property display settings to defaults
    // Reinitialize the edge styles menu which will reset all checkboxes to default values
    const edgeStylesContent = document.getElementById('edgeStylesContent');
    if (edgeStylesContent) {
      initEdgeStylesMenu(edgeStylesContent, actions.applyFilter);
      updateEdgeColorsLegend(session.rawData, session.objectProperties, session.externalOntologyReferences);
    }
    
    // Delete display config from IndexedDB
    await deleteDisplayConfigFromIndexedDB(fileState.loadedFilePath, fileState.loadedFileName).catch(() => {});
    
    // Reset lastLayoutMode to prevent position clearing on first applyFilter
    canvasState.lastLayoutMode = 'hierarchical-dag';
    
    // Regenerate layout by applying filter
    actions.applyFilter();
  });

  const redrawNetworkOnMenuToggle = (): void => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (canvasState.network) {
          const nc = document.getElementById('network');
          if (nc) {
            const w = nc.clientWidth;
            const h = nc.clientHeight;
            if (w > 0 && h > 0) {
              canvasState.network.setSize(`${w}px`, `${h}px`);
              canvasState.network.redraw();
            }
          }
        }
      }, 50);
    });
  };
  document.getElementById('annotationPropsMenu')?.addEventListener('toggle', redrawNetworkOnMenuToggle);
  document.getElementById('edgeStylesMenu')?.addEventListener('toggle', redrawNetworkOnMenuToggle);
}
