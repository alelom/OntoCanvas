/**
 * Reading and writing the display config: collecting it from the page, and loading one from a URL or a local file.
 * Moved out of main.ts (#175).
 */
import { session, canvasState } from '../state/appState';
import { type DisplayConfig, DISPLAY_CONFIG_VERSION, type ExternalNodeLayout } from '../storage';
import { getAnnotationStyleConfig } from '../ui/annotationPropertiesMenu';
import { getEdgeStyleConfig } from '../ui/edgeStyleUtils';
import { getSearchScope } from '../ui/searchOptions';
import { isDebugMode, debugWarn, debugLog } from '../utils/debug';
import { withCacheBust } from '../utils/urlParams';

/**
 * `forBrowser`: the copy kept in the browser between visits, which holds positions only once the user has arranged
 * the graph; a computed layout is laid out again next time, with the current layout and settings.
 */
export function collectDisplayConfig(options: { forBrowser?: boolean } = {}): DisplayConfig | null {
  if (session.rawData.nodes.length === 0) return null;
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  const annotationPropsContent = document.getElementById('annotationPropsContent');
  const nodePositions: Record<string, { x: number; y: number }> = {};
  
  // Get positions from network if available (most up-to-date), otherwise from rawData
  if (canvasState.network) {
    const networkPositions = canvasState.network.getPositions();
    Object.entries(networkPositions).forEach(([id, pos]) => {
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        nodePositions[id] = { x: pos.x, y: pos.y };
        // Also update rawData to keep it in sync
        const node = session.rawData.nodes.find((n) => n.id === id);
        if (node) {
          node.x = pos.x;
          node.y = pos.y;
        }
      }
    });
  } else {
    // Fallback to rawData positions if network not available
    session.rawData.nodes.forEach((n) => {
      if (n.x != null && n.y != null) nodePositions[n.id] = { x: n.x, y: n.y };
    });
  }
  const displayExternalRefEl = document.getElementById('displayExternalRefs') as HTMLInputElement | null;
  const externalNodeLayoutEl = document.getElementById('externalNodeLayout') as HTMLSelectElement | null;
  return {
    version: DISPLAY_CONFIG_VERSION,
    nodePositions: options.forBrowser && !canvasState.positionsArranged ? {} : nodePositions,
    edgeStyleConfig: edgeStylesContent ? getEdgeStyleConfig(edgeStylesContent, session.rawData, session.objectProperties, session.externalOntologyReferences) : {},
    wrapChars: parseInt((document.getElementById('wrapChars') as HTMLInputElement)?.value, 10) || 12,
    minFontSize: parseInt((document.getElementById('minFontSize') as HTMLInputElement)?.value, 10) || 20,
    maxFontSize: parseInt((document.getElementById('maxFontSize') as HTMLInputElement)?.value, 10) || 70,
    relationshipFontSize: parseInt((document.getElementById('relationshipFontSize') as HTMLInputElement)?.value, 10) || 18,
    dataPropertyFontSize: parseInt((document.getElementById('dataPropertyFontSize') as HTMLInputElement)?.value, 10) || 12,
    layoutMode: (document.getElementById('layoutMode') as HTMLSelectElement)?.value || 'hierarchical-dag',
    searchQuery: (document.getElementById('searchQuery') as HTMLInputElement)?.value ?? '',
    searchScope: getSearchScope(),
    includeNeighbors: getSearchScope() === 'neighbours', // read by builds from before #85
    exactMatch: (document.getElementById('searchExactMatch') as HTMLInputElement)?.checked ?? true,
    annotationStyleConfig: annotationPropsContent ? getAnnotationStyleConfig(annotationPropsContent, session.annotationProperties) : undefined,
    annotationPropertyOrder: session.annotationProperties.map((ap) => ap.name),
    viewState: canvasState.network
      ? { scale: canvasState.network.getScale(), position: canvasState.network.getViewPosition() }
      : undefined,
    displayExternalReferences: displayExternalRefEl?.checked ?? canvasState.displayExternalReferences,
    clusterThingDataProperties: canvasState.clusterThingDataProperties,
    stackLeaves: canvasState.stackLeaves,
    externalNodeLayout: (externalNodeLayoutEl?.value as ExternalNodeLayout) ?? canvasState.externalNodeLayout,
    hierarchyRelationships: [...canvasState.hierarchyTypes],
  };
}

export async function loadDisplayConfigFromUrl(displayUrl: string): Promise<DisplayConfig | null> {
  try {
    // Cache-bust: the config may have just been re-published; GitHub Pages caches it for ~10 min.
    const response = await fetch(withCacheBust(displayUrl, Date.now()), { cache: 'no-store' });
    if (!response.ok) {
      // 404 or other error - display file doesn't exist, which is fine
      // Show a helpful warning message (not an error, since this is expected)
      // Note: The browser will also show a 404 error in the Network tab, but this warning
      // provides user-friendly context that this is expected behavior.
      if (response.status === 404) {
        // Use a single, clear warning message that's easy to spot
        console.warn(
          `[OntoCanvas] Display style file not found: ${displayUrl}`
        );
        console.warn(
          `We tried looking for an OntoCanvas display style file related to this ontology, but it could not be found. The ontology will load without custom styling.`
        );
      }
      return null;
    }
    const text = await response.text();
    const config = JSON.parse(text) as DisplayConfig;
    if (!config || typeof config !== 'object') {
      console.warn('Invalid display config format from URL:', displayUrl);
      return null;
    }
    // Validate version
    if (config.version !== DISPLAY_CONFIG_VERSION) {
      console.warn('Display config version mismatch:', displayUrl);
      return null;
    }
    return config;
  } catch (err) {
    // Network error or parse error - silently fail (display file is optional)
    // Only log in debug mode
    if (isDebugMode()) {
      debugWarn('Could not load display config from URL:', displayUrl, err);
    }
    return null;
  }
}

/**
 * Attempt to load display config from a sibling .display.json file in the same directory.
 * Returns the config if found, null otherwise (doesn't throw on errors).
 * Only works when File System Access API is available and fileHandle.getParent() is supported.
 */
export async function loadDisplayConfigFromLocalFile(
  fileHandle: FileSystemFileHandle | null,
  fileName: string
): Promise<DisplayConfig | null> {
  if (!fileHandle) return null;
  
  // Check if getParent is available (Chrome/Edge support this)
  if (!('getParent' in fileHandle) || typeof (fileHandle as FileSystemFileHandle & { getParent?: () => Promise<FileSystemDirectoryHandle> }).getParent !== 'function') {
    return null;
  }

  try {
    // Get the parent directory
    const parent = await (fileHandle as FileSystemFileHandle & { getParent: () => Promise<FileSystemDirectoryHandle> }).getParent();
    
    // Extract base name from fileName (remove extension)
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
    const displayFileName = `${baseName}.display.json`;
    
    // Try to get the display config file
    try {
      const displayFileHandle = await parent.getFileHandle(displayFileName);
      const displayFile = await displayFileHandle.getFile();
      const text = await displayFile.text();
      const config = JSON.parse(text) as DisplayConfig;
      
      if (!config || typeof config !== 'object') {
        console.warn('Invalid display config format from local file:', displayFileName);
        return null;
      }
      
      // Validate version
      if (config.version !== DISPLAY_CONFIG_VERSION) {
        console.warn('Display config version mismatch:', displayFileName);
        return null;
      }
      
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog('[DISPLAY CONFIG] Loaded display config from local file:', displayFileName);
      }
      return config;
    } catch (fileErr) {
      // File doesn't exist or can't be read - this is fine, display config is optional
      if (isDebugMode()) {
        debugWarn('Could not load display config from local file:', displayFileName, fileErr);
      }
      return null;
    }
  } catch (err) {
    // Parent directory access failed - silently fail (display file is optional)
    if (isDebugMode()) {
      debugWarn('Could not access parent directory for display config:', err);
    }
    return null;
  }
}
