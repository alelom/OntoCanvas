/**
 * Wires the toolbar, the menus, the search box and the keyboard to what they do.
 * Moved out of main.ts (#175).
 */
import { preloadExternalOntologyClasses } from '../externalOntologySearch';
import { getDefaultEdgeColors, getDefaultColor } from '../graph';
import { actions } from '../state/actions';
import { fileState, session, canvasState, editState } from '../state/appState';
import { type ExternalNodeLayout, type SerializerType, type DisplayConfig } from '../storage/types';
import { saveExternalRefsToIndexedDB } from '../storage/externalRefsStore';
import { saveSerializerConfigToIndexedDB } from '../storage/serializerConfigStore';
import { saveDisplayConfigToIndexedDB, deleteDisplayConfigFromIndexedDB } from '../storage/displayConfigStore';
import { debounced } from '../utils/debounced';
import { debugLog } from '../utils/debug';
import { REPO_URL } from '../utils/siteInfo';
import { clearOntologyParamsFromAddressBar, displayConfigBaseName } from '../utils/urlParams';
import { getAppVersion } from '../utils/version';
import { performDeleteSelection } from '../workflows/deleteSelection';
import { applyDisplayConfig } from '../workflows/displayConfigApply';
import { collectDisplayConfig } from '../workflows/displayConfigFiles';
import { scheduleDisplayConfigSave } from '../workflows/displayConfigSave';
import { setStackLeaves, setHierarchyTypes, setRelaxIndividuals } from '../workflows/layoutOptions';
import { loadFromFile, loadFromUrl, loadLastOpenedFile, loadLastOpenedUrl, loadFromRecentEntry, loadTtlAndRender } from '../workflows/loadOntologyFlow';
import { restoreNodePositions, forgetNodePositions } from '../workflows/nodePositions';
import { saveTtl } from '../workflows/saveTtlFlow';
import { performUndo, performRedo } from '../workflows/undoRedo';
import { handleHistoryShortcut } from './historyShortcuts';
import { handleExternalClassSearch } from './addNodeModal';
import { initAnnotationPropsMenu } from './annotationPropertiesMenu';
import { getAnnotationPropsMenuDeps } from './annotationPropertyModal';
import { DEFAULT_BOOL_COLORS, DEFAULT_TEXT_COLOR } from './constants';
import { hideEditEdgeModalWithCleanup, updateEditEdgeCommentDisplayLocal } from './edgeModalHelpers';
import { updateEdgeColorsLegend, BORDER_LINE_OPTIONS, renderLineTypeSvg } from './edgeStyleUtils';
import { confirmEditEdge } from './editEdgeConfirm';
import { updateEditEdgeTypeSearch, updateEditEdgeTypeSections } from './editEdgeTypeSearch';
import { type ExternalRefsModalCallbacks, showExternalRefsModal, hideExternalRefsModal, sortExternalRefsByUrl, renderExternalRefsList } from './externalRefs';
import { updateSaveButtonVisibility } from './fileBar';
import { defaultMaxFontSize } from './fontSizeDefaults';
import { initLayoutModeHint } from './layoutModeHint';
import { showLoadingModal, hideLoadingModal, hideRenameModal } from './modals';
import { confirmRename, confirmAddNode } from './nodeConfirms';
import * as nodeModalFormUi from './nodeModalFormUi';
import { refreshRenameModalFromInput, onRemoveRenameDataProp, onRemoveAddNodeDataProp, refreshAddNodeOkButton, hideAddNodeModalWithCleanup } from './nodeModalHelpers';
import { showOpenOntologyModal, initOpenOntologyModal, hideOpenOntologyModal } from './openOntologyModal';
import { initEdgeStylesMenu } from './relationshipTypeModal';
import { hideRelationshipTooltip, getAllRelationshipTypes, colourableRelationshipTypes } from './relationshipUtils';
import { initRenameModalHeaderIcons } from './renameModalHeaderIcons';
import { updateSearchAutocomplete } from './searchAutocomplete';
import { attachPopover, setSearchScope, DEFAULT_SEARCH_SCOPE } from './searchOptions';
import { initStatusBar } from './statusBar';

export function setupEventListeners(): void {
  // Initialize status bar after DOM is ready
  initStatusBar();
  
  // Initialize version display (clickable link to repo)
  const versionDisplay = document.getElementById('versionDisplay');
  if (versionDisplay) {
    versionDisplay.innerHTML = `<a href="${REPO_URL}" target="_blank" rel="noopener noreferrer" class="version-link" title="OntoCanvas on GitHub">OntoCanvas v${getAppVersion()}</a>`;
  }
  
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;

  // Open ontology button
  const openOntologyBtn = document.getElementById('openOntologyBtn');
  openOntologyBtn?.addEventListener('click', () => {
    showOpenOntologyModal();
  });

  // Initialize the open ontology modal
      initOpenOntologyModal(
        loadFromFile,
        loadFromUrl,
        loadLastOpenedFile,
        loadLastOpenedUrl,
        loadFromRecentEntry
      );

  // File input change handler (for fallback when showOpenFilePicker is not available)
  fileInput?.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    showLoadingModal();
    try {
      const ttl = await file.text();
      await loadTtlAndRender(ttl, file.name, null);
      clearOntologyParamsFromAddressBar();
      hideLoadingModal();
      hideOpenOntologyModal();
    } catch (err) {
      hideLoadingModal();
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      errorMsg.textContent = `Failed to read file: ${err instanceof Error ? err.message : String(err)}`;
      errorMsg.style.display = 'block';
    }
    fileInput.value = '';
  });

  document.getElementById('layoutMode')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('restorePositions')?.addEventListener('click', restoreNodePositions);

  const externalRefsCallbacks: ExternalRefsModalCallbacks = {
    onUpdate: () => {
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
      // Refresh all UI elements that display prefixes
      if (session.ttlStore) {
        const edgeStylesContent = document.getElementById('edgeStylesContent');
        if (edgeStylesContent) {
          initEdgeStylesMenu(edgeStylesContent, () => actions.applyFilter(true));
        }
        const dataPropsContent = document.getElementById('dataPropsContent');
        if (dataPropsContent) {
          actions.initDataPropsMenu(dataPropsContent);
        }
        const annotationPropsContent = document.getElementById('annotationPropsContent');
        if (annotationPropsContent) {
          initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
        }
        // Rebuild the graph to update class node labels
        actions.applyFilter(true);
      }
    },
    onSave: () => {
      // Additional save logic if needed
    },
  };
  
  document.getElementById('manageExternalRefs')?.addEventListener('click', () => {
    showExternalRefsModal(session.externalOntologyReferences, externalRefsCallbacks, fileState.loadedFilePath, fileState.loadedFileName);
    const displayEl = document.getElementById('displayExternalRefs') as HTMLInputElement | null;
    const layoutEl = document.getElementById('externalNodeLayout') as HTMLSelectElement | null;
    if (displayEl) displayEl.checked = canvasState.displayExternalReferences;
    if (layoutEl) layoutEl.value = canvasState.externalNodeLayout;
  });
  document.getElementById('stackLeaves')?.addEventListener('change', (e) => {
    setStackLeaves((e.target as HTMLInputElement).checked);
    forgetNodePositions();
    actions.applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('relaxIndividuals')?.addEventListener('change', (e) => {
    setRelaxIndividuals((e.target as HTMLInputElement).checked);
    actions.applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('clusterThingDataProps')?.addEventListener('change', (e) => {
    canvasState.clusterThingDataProperties = (e.target as HTMLInputElement).checked;
    actions.applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('displayExternalRefs')?.addEventListener('change', (e) => {
    canvasState.displayExternalReferences = (e.target as HTMLInputElement).checked;
    actions.applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('externalNodeLayout')?.addEventListener('change', (e) => {
    canvasState.externalNodeLayout = (e.target as HTMLSelectElement).value as ExternalNodeLayout;
    actions.applyFilter(true);
    scheduleDisplayConfigSave();
  });
  document.getElementById('externalRefsCancel')?.addEventListener('click', hideExternalRefsModal);
  document.getElementById('externalRefsModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'externalRefsModal') hideExternalRefsModal();
  });
  document.getElementById('addExternalRefBtn')?.addEventListener('click', async () => {
    const urlInput = document.getElementById('addExternalRefUrl') as HTMLInputElement;
    const addBtn = document.getElementById('addExternalRefBtn') as HTMLButtonElement;
    const url = urlInput?.value.trim();
    if (!url) return;
    
    // Validate URL format
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      alert('Please enter a valid URL');
      return;
    }
    
    // Check if already exists
    if (session.externalOntologyReferences.some((ref) => ref.url === url)) {
      alert('This ontology is already in the list');
      return;
    }
    
    // Disable button and show loading state
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = 'Validating...';
    }
    
    try {
      // Fetch the URL to validate it's an ontology
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/turtle, application/rdf+xml, application/n-triples, text/n3, */*',
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Read the response body once (can only be read once)
      const text = await response.text();
      
      const contentType = response.headers.get('content-type') || '';
      const isRdfContent = contentType.includes('turtle') || 
                          contentType.includes('rdf+xml') || 
                          contentType.includes('n-triples') ||
                          contentType.includes('n3') ||
                          url.endsWith('.ttl') ||
                          url.endsWith('.rdf') ||
                          url.endsWith('.owl') ||
                          url.endsWith('.nt') ||
                          url.endsWith('.n3');
      
      if (!isRdfContent) {
        // Check if it looks like RDF/Turtle
        const looksLikeRdf = /@prefix|@base|rdf:type|owl:|rdfs:|<http|https:\/\/[^>]+>/i.test(text);
        if (!looksLikeRdf) {
          throw new Error('The URL does not appear to be an ontology. It should return RDF/Turtle content.');
        }
      }
      
      // Parse the ontology to find preferred namespace prefix
      let preferredPrefix: string | undefined;
      let usePrefix = true; // Default to true - user can uncheck if they want full IRIs
      
      // Try to parse as Turtle
      try {
        const { Parser } = await import('n3');
        const parser = new Parser({ format: 'text/turtle' });
        const quads = [...parser.parse(text)];
        
        // Look for vann:preferredNamespacePrefix
        const VANN_NS = 'http://purl.org/vocab/vann/';
        const VANN_PREFERRED_PREFIX = VANN_NS + 'preferredNamespacePrefix';
        
        for (const quad of quads as Array<{ predicate: { value?: string }; object: { value?: string } }>) {
          const pred = quad.predicate;
          if (pred.value === VANN_PREFERRED_PREFIX) {
            const obj = quad.object;
            const prefixValue = obj.value;
            if (prefixValue && typeof prefixValue === 'string') {
              preferredPrefix = prefixValue.trim();
              usePrefix = true;
              break;
            }
          }
        }
      } catch (parseError) {
        // If parsing fails, try regex as fallback
        const prefixMatch = text.match(/vann:preferredNamespacePrefix\s+"([^"]+)"/i) ||
                           text.match(/<http:\/\/purl\.org\/vocab\/vann\/preferredNamespacePrefix>\s+"([^"]+)"/i);
        if (prefixMatch && prefixMatch[1]) {
          preferredPrefix = prefixMatch[1].trim();
          usePrefix = true;
        }
      }
      
      // If no preferred prefix found, extract suggestion from URL
      if (!preferredPrefix) {
        const pathParts = urlObj.pathname.split('/').filter((p) => p);
        if (pathParts.length > 0) {
          const lastPart = pathParts[pathParts.length - 1];
          if (lastPart && /^[a-z]/.test(lastPart)) {
            preferredPrefix = lastPart.replace(/[^a-z0-9]/gi, '');
          }
        }
        if (!preferredPrefix && urlObj.hostname) {
          const hostParts = urlObj.hostname.split('.');
          if (hostParts.length > 0) {
            preferredPrefix = hostParts[0].replace(/[^a-z0-9]/gi, '');
          }
        }
      }
      
      const newRef = {
        url,
        usePrefix,
        prefix: preferredPrefix,
      };
      session.externalOntologyReferences.push(newRef);
      sortExternalRefsByUrl(session.externalOntologyReferences);

      urlInput.value = '';
      const externalRefsCallbacks: ExternalRefsModalCallbacks = {
        onUpdate: () => {
          fileState.hasUnsavedChanges = true;
          updateSaveButtonVisibility();
        },
        onSave: () => {
          // Additional save logic if needed
        },
      };
      renderExternalRefsList(session.externalOntologyReferences, externalRefsCallbacks, fileState.loadedFilePath, fileState.loadedFileName);
      await saveExternalRefsToIndexedDB(session.externalOntologyReferences, fileState.loadedFilePath, fileState.loadedFileName);
      
      // Pre-fetch the newly added ontology
      try {
        await preloadExternalOntologyClasses([newRef]);
      } catch (err) {
        console.warn(`Failed to pre-load newly added ontology ${newRef.url}:`, err);
      }
      
      fileState.hasUnsavedChanges = true;
      updateSaveButtonVisibility();
    } catch (error) {
      alert(`Failed to validate ontology: ${error instanceof Error ? error.message : String(error)}\n\nPlease ensure the URL points to a valid ontology file (Turtle/RDF format).`);
    } finally {
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.textContent = 'Add';
      }
    }
  });
  document.getElementById('addExternalRefUrl')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      (document.getElementById('addExternalRefBtn') as HTMLButtonElement)?.click();
    }
  });

  for (const name of ['textDisplay', 'searchOptions']) {
    const wrap = document.getElementById(`${name}Wrap`);
    const toggle = document.getElementById(`${name}Toggle`);
    const popup = document.getElementById(`${name}Popup`);
    if (wrap && toggle && popup) attachPopover(wrap, toggle, popup);
  }

  // Layout-mode hint popup (describes the logic of each layout mode).
  initLayoutModeHint();

  document.getElementById('wrapChars')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('wrapChars')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('minFontSize')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('minFontSize')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('maxFontSize')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('maxFontSize')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('relationshipFontSize')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('relationshipFontSize')?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('dataPropertyFontSize')?.addEventListener('input', () => actions.applyFilter());
  document.getElementById('dataPropertyFontSize')?.addEventListener('change', () => actions.applyFilter());
  document
    .querySelectorAll('input[name="searchScope"]')
    .forEach((radio) => radio.addEventListener('change', () => actions.applyFilter()));
  document
    .getElementById('searchExactMatch')
    ?.addEventListener('change', () => actions.applyFilter());
  document.getElementById('undoBtn')?.addEventListener('click', performUndo);
  document.getElementById('redoBtn')?.addEventListener('click', performRedo);
  document.getElementById('editEdgeCancel')?.addEventListener('click', hideEditEdgeModalWithCleanup);
  document.getElementById('editEdgeConfirm')?.addEventListener('click', confirmEditEdge);
  
  // Toggle cardinality visibility based on restriction checkbox
  document.getElementById('editEdgeIsRestriction')?.addEventListener('change', (e) => {
    const isRestrictionCb = e.target as HTMLInputElement;
    const cardWrap = document.getElementById('editEdgeCardinalityWrap');
    if (cardWrap) {
      cardWrap.style.display = isRestrictionCb.checked ? 'block' : 'none';
      // Clear cardinality values when unchecked (they don't apply to non-restrictions)
      if (!isRestrictionCb.checked) {
        const minCardInput = document.getElementById('editEdgeMinCard') as HTMLInputElement;
        const maxCardInput = document.getElementById('editEdgeMaxCard') as HTMLInputElement;
        if (minCardInput) minCardInput.value = '';
        if (maxCardInput) maxCardInput.value = '';
      }
    }
  });
  
  let editEdgeTypeSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  document.getElementById('editEdgeType')?.addEventListener('input', (e) => {
    const typeInput = e.target as HTMLInputElement;
    const query = typeInput.value.trim();
    
    // Clear previous timeout
    if (editEdgeTypeSearchTimeout) {
      clearTimeout(editEdgeTypeSearchTimeout);
    }
    
    // Reset selection when user types
    editState.selectedEdgeType = null;
    editState.selectedExternalObjectProperty = null;
    
    // Debounce search
    editEdgeTypeSearchTimeout = setTimeout(() => {
      updateEditEdgeTypeSearch(query).catch((err) => {
        console.error('Error in edge type search:', err);
      });
    }, 150);
    
    // Also update comment display immediately if we have a selected type
    if (editState.selectedEdgeType) {
      updateEditEdgeCommentDisplayLocal();
    }
  });
  
  // Close results when clicking outside
  document.addEventListener('click', (e) => {
    const resultsDiv = document.getElementById('editEdgeTypeResults');
    const typeInput = document.getElementById('editEdgeType');
    if (resultsDiv && typeInput && 
        !resultsDiv.contains(e.target as Node) && 
        !typeInput.contains(e.target as Node)) {
      resultsDiv.style.display = 'none';
      hideRelationshipTooltip();
    }
  });
  
  // Keep the sections in step with the type on leaving the field too (a no-op once a type was chosen).
  document.getElementById('editEdgeType')?.addEventListener('focusout', updateEditEdgeTypeSections);
  document.getElementById('editEdgeModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'editEdgeModal') hideEditEdgeModalWithCleanup();
  });
  document.getElementById('editEdgeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#editEdgeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') confirmEditEdge();
      else hideEditEdgeModalWithCleanup();
      e.preventDefault();
    }
  });
  // Document-level Escape so Edit Edge modal closes regardless of focus (e.g. type-ahead)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('editEdgeModal');
    if (modal && modal.style.display !== 'none') {
      hideEditEdgeModalWithCleanup();
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
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
  document.getElementById('saveChanges')?.addEventListener('click', saveTtl);
  
  // Serializer dropdown change handler (DEV mode only)
  const serializerSelect = document.getElementById('serializerSelect') as HTMLSelectElement;
  if (serializerSelect) {
    serializerSelect.addEventListener('change', async (e) => {
      const newType = (e.target as HTMLSelectElement).value as SerializerType;
      fileState.currentSerializerType = newType;
      
      // Save to IndexedDB
      if (fileState.isTtlFile && !fileState.skipSlowOperationsForTests) {
        await saveSerializerConfigToIndexedDB(
          { serializerType: newType },
          fileState.loadedFilePath,
          fileState.loadedFileName
        );
      }
      
      debugLog('[serializerSelect] Changed to:', newType);
    });
  }

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
    setRelaxIndividuals(true);
    
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

  document.getElementById('renameCancel')?.addEventListener('click', hideRenameModal);
  document.getElementById('renameConfirm')?.addEventListener('click', confirmRename);
  document.getElementById('renameInput')?.addEventListener('input', refreshRenameModalFromInput);
  document.getElementById('renameDataPropAdd')?.addEventListener('click', () => {
    const modal = document.getElementById('renameModal')!;
    if (modal.dataset.mode !== 'single') return;
    const selectEl = document.getElementById('renameDataPropSelect') as HTMLSelectElement;
    const minEl = document.getElementById('renameDataPropMin') as HTMLInputElement;
    const maxEl = document.getElementById('renameDataPropMax') as HTMLInputElement;
    const propName = selectEl?.value?.trim();
    if (!propName) return;
    const min = minEl?.value?.trim();
    const max = maxEl?.value?.trim();
    const minCardinality = min === '' ? undefined : parseInt(min, 10);
    const maxCardinality = max === '' ? undefined : parseInt(max, 10);
    if (min !== '' && (Number.isNaN(minCardinality!) || minCardinality! < 0)) return;
    if (max !== '' && (Number.isNaN(maxCardinality!) || maxCardinality! < 0)) return;
    if (minCardinality !== undefined && maxCardinality !== undefined && minCardinality! > maxCardinality!) return;
    editState.renameModalDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    nodeModalFormUi.renderRenameModalDataPropsList(editState.renameModalDataPropertyRestrictions, session.dataProperties, onRemoveRenameDataProp);
    if (minEl) minEl.value = '';
    if (maxEl) maxEl.value = '';
  });
  document.getElementById('renameDataPropSelect')?.addEventListener('change', () => {
    nodeModalFormUi.updateRenameDataPropAddButtonState();
  });
  document.getElementById('addNodeDataPropAdd')?.addEventListener('click', () => {
    const selectEl = document.getElementById('addNodeDataPropSelect') as HTMLSelectElement;
    const minEl = document.getElementById('addNodeDataPropMin') as HTMLInputElement;
    const maxEl = document.getElementById('addNodeDataPropMax') as HTMLInputElement;
    const propName = selectEl?.value?.trim();
    if (!propName) return;
    const min = minEl?.value?.trim();
    const max = maxEl?.value?.trim();
    const minCardinality = min === '' ? undefined : parseInt(min, 10);
    const maxCardinality = max === '' ? undefined : parseInt(max, 10);
    if (min !== '' && (Number.isNaN(minCardinality!) || minCardinality! < 0)) return;
    if (max !== '' && (Number.isNaN(maxCardinality!) || maxCardinality! < 0)) return;
    if (minCardinality !== undefined && maxCardinality !== undefined && minCardinality! > maxCardinality!) return;
    editState.addNodeDataPropertyRestrictions.push({
      propertyName: propName,
      ...(minCardinality !== undefined && { minCardinality: minCardinality! }),
      ...(maxCardinality !== undefined && { maxCardinality: maxCardinality! }),
    });
    if (selectEl) selectEl.value = '';
    nodeModalFormUi.renderAddNodeDataPropsList(editState.addNodeDataPropertyRestrictions, session.dataProperties, onRemoveAddNodeDataProp);
    if (minEl) minEl.value = '';
    if (maxEl) maxEl.value = '';
  });
  document.getElementById('addNodeDataPropSelect')?.addEventListener('change', () => {
    nodeModalFormUi.updateAddNodeDataPropAddButtonState();
  });
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
  const renameModalEl = document.getElementById('renameModal');
  if (renameModalEl) initRenameModalHeaderIcons(renameModalEl);

  // Tab switching
  document.querySelectorAll('.add-node-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const tabName = (tab as HTMLElement).dataset.tab;
      if (!tabName) return;
      
      // Update tab styles
      document.querySelectorAll('.add-node-tab').forEach((t) => {
        (t as HTMLElement).classList.remove('active');
        (t as HTMLElement).style.borderBottomColor = 'transparent';
        (t as HTMLElement).style.fontWeight = 'normal';
        (t as HTMLElement).style.color = '#666';
      });
      (tab as HTMLElement).classList.add('active');
      (tab as HTMLElement).style.borderBottomColor = '#3498db';
      (tab as HTMLElement).style.fontWeight = 'bold';
      (tab as HTMLElement).style.color = '#000';
      
      // Show/hide tab content
      const customTabContent = document.getElementById('addNodeCustomTab');
      const externalTabContent = document.getElementById('addNodeExternalTabContent');
      if (tabName === 'custom') {
        if (customTabContent) customTabContent.style.display = 'block';
        if (externalTabContent) externalTabContent.style.display = 'none';
        const customInput = document.getElementById('addNodeInput') as HTMLInputElement;
        if (customInput) customInput.focus();
      } else {
        if (customTabContent) customTabContent.style.display = 'none';
        if (externalTabContent) externalTabContent.style.display = 'block';
        const externalInput = document.getElementById('addNodeExternalInput') as HTMLInputElement;
        if (externalInput) externalInput.focus();
      }
      
      refreshAddNodeOkButton();
    });
  });
  
  document.getElementById('addNodeInput')?.addEventListener('input', refreshAddNodeOkButton);
  document.getElementById('addNodeExternalInput')?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.trim();
    
    // Clear previous timeout
    if (editState.addNodeSearchTimeout) {
      clearTimeout(editState.addNodeSearchTimeout);
    }
    
    // Debounce search
    editState.addNodeSearchTimeout = setTimeout(() => {
      handleExternalClassSearch(query).catch((err) => {
        console.error('Search error:', err);
      });
    }, 300);
    
    refreshAddNodeOkButton();
  });
  
  document.getElementById('addNodeCancel')?.addEventListener('click', hideAddNodeModalWithCleanup);
  document.getElementById('addNodeConfirm')?.addEventListener('click', confirmAddNode);
  document.getElementById('addNodeModal')?.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('#addNodeModal') && (e.key === 'Enter' || e.key === 'Escape')) {
      if (e.key === 'Enter') {
        const okBtn = document.getElementById('addNodeConfirm') as HTMLButtonElement;
        if (okBtn && !okBtn.disabled) confirmAddNode();
      } else {
        hideAddNodeModalWithCleanup();
      }
      e.preventDefault();
    }
  });
  document.getElementById('addNodeModal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'addNodeModal') hideAddNodeModalWithCleanup();
  });

  document.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('searchQuery') as HTMLInputElement;
        searchInput?.focus();
      }
      handleHistoryShortcut(e);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Run in capture phase so we handle Delete before search input (which would delete a character)
        const activeEl = document.activeElement as HTMLElement;
        debugLog(`[DELETE KEY] Delete/Backspace key pressed. Active element:`, activeEl?.id || activeEl?.tagName);
        if (activeEl?.id === 'searchQuery' && canvasState.network?.getSelectedNodes().length) {
          activeEl.blur();
        }
        if (performDeleteSelection()) e.preventDefault();
      }
    },
    { capture: true }
  );

  const searchInput = document.getElementById('searchQuery');
  const searchList = document.getElementById('searchAutocomplete');
  const searchClearBtn = document.getElementById('searchClearBtn');
  if (searchInput && searchList) {
    // Escape cancels a pending update, or the suggestions would reopen after being dismissed (#93).
    const suggestionsUpdate = debounced(updateSearchAutocomplete, 150);
    searchInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') suggestionsUpdate.cancel();
    });
    let animationId: number | null = null;
    
    // Function to clear the search bar
    const clearSearch = () => {
      (searchInput as HTMLInputElement).value = '';
      updateSearchBarStyle();
      actions.applyFilter();
      searchInput.focus();
    };
    
    // Add click handler for clear button
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearSearch();
      });
    }
    
    // Function to update search bar styling based on content
    const updateSearchBarStyle = () => {
      const hasText = (searchInput as HTMLInputElement).value.trim().length > 0;
      const inputEl = searchInput as HTMLElement;
      
      // Show/hide clear button
      if (searchClearBtn) {
        searchClearBtn.style.display = hasText ? 'block' : 'none';
      }
      
      if (hasText) {
        // Add more visible colored outline when search bar has text
        inputEl.style.outline = '3px solid #3498db';
        inputEl.style.outlineOffset = '2px';
        inputEl.style.borderRadius = '4px';
        // Add light yellow background to indicate active filtering
        inputEl.style.backgroundColor = '#fffacd'; // Light yellow (lemon chiffon)
        
        // Add pulsating animation - more visible with wider opacity range
        if (animationId === null) {
          let startTime: number | null = null;
          const animate = (timestamp: number) => {
            if (startTime === null) startTime = timestamp;
            const elapsed = timestamp - startTime;
            // Pulsate between 0.3 and 1.0 opacity, 1.5 second cycle (faster and more pronounced)
            const opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((elapsed / 1500) * 2 * Math.PI));
            inputEl.style.outlineColor = `rgba(52, 152, 219, ${opacity})`;
            // Also pulsate the outline width slightly for more visibility
            const widthMultiplier = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin((elapsed / 1500) * 2 * Math.PI));
            inputEl.style.outlineWidth = `${3 * widthMultiplier}px`;
            animationId = requestAnimationFrame(animate);
          };
          animationId = requestAnimationFrame(animate);
        }
      } else {
        // Remove outline, animation, and background when empty
        inputEl.style.outline = '';
        inputEl.style.outlineOffset = '';
        inputEl.style.backgroundColor = '';
        if (animationId !== null) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      }
    };
    
    searchInput.addEventListener('input', () => {
      updateSearchBarStyle();
      actions.applyFilter();
      suggestionsUpdate.schedule();
    });
    searchInput.addEventListener('focus', () => {
      updateSearchBarStyle();
      if ((searchInput as HTMLInputElement).value.trim()) updateSearchAutocomplete();
    });
    searchInput.addEventListener('blur', () => {
      // Keep outline and animation on blur if there's text
      const hasText = (searchInput as HTMLInputElement).value.trim().length > 0;
      if (hasText) {
        updateSearchBarStyle();
      }
    });
    
    // Initial check
    updateSearchBarStyle();
  }
}
