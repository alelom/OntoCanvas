/**
 * Loading an ontology: from a file, a URL, a file handle or the recent list, and everything done once it is parsed.
 * Moved out of main.ts (#175).
 */
import { fetchExternalOntologyTtl, getReferencedExternalClassesFromStore, preloadExternalOntologyClasses, servedFrom } from '../externalOntologySearch';
import { getEdgeTypes, resolveLayoutMode } from '../graph';
import { applyAnnotationPropertyOrder } from '../lib/annotationStyle';
import { latestDisplayConfigSource } from '../lib/displayConfigFallback';
import { loadImportedOntologies, readImportedDeclarations, mergeImportedDeclarations, mergeChangesWhatIsDrawn } from '../lib/importedDeclarations';
import { loadOntologyFromContent } from '../lib/loadOntology';
import { forgetOntologyDirectory } from '../lib/ontologyDirectory';
import { fetchOntologyFromUrl } from '../lib/ontologyUrlLoader';
import { validateOntologyStructure, formatValidationErrors } from '../lib/ontologyValidation';
import { readOntologyVersion } from '../lib/ontologyVersion';
import { findVersions } from '../lib/ontologyVersions';
import { recallSeenVersions, rememberSeenVersions } from '../lib/seenVersions';
import { handleUrlLoadFailure } from '../lib/urlLoadFailureHandler';
import { browserVersionSources } from '../lib/versionSources';
import { getMainOntologyBase, extractLocalName } from '../parser';
import { actions } from '../state/actions';
import { session, canvasState, fileState } from '../state/appState';
import { saveDisplayConfigToIndexedDB, loadSerializerConfigFromIndexedDB, loadExternalRefsFromIndexedDB, type ExternalOntologyReference, saveLastFileToIndexedDB, addRecentlyOpenedToIndexedDB, loadDisplayConfigFromIndexedDB, saveLastUrlToIndexedDB, getLastUrlFromIndexedDB, getLastFileFromIndexedDB, type RecentlyOpenedEntry } from '../storage';
import { initAddDataPropertyHandlers } from '../ui/addDataPropertyHandlers';
import { initAnnotationPropsMenu, applyAnnotationStyleConfigToDom } from '../ui/annotationPropertiesMenu';
import { getAnnotationPropsMenuDeps, initAddAnnotationPropertyHandlers } from '../ui/annotationPropertyModal';
import type { AnnotationStyleConfig } from '../ui/constants';
import { setImportedPrefixes, refreshExternalRefsList, isUriFromExternalOntology, extractUsedNamespaceRefsFromStore, sortExternalRefsByUrl } from '../ui/externalRefs';
import { updateSerializerDropdown, updateFilePathDisplay, updateSaveButtonVisibility } from '../ui/fileBar';
import { defaultMaxFontSize } from '../ui/fontSizeDefaults';
import { beginImportsSettle, importsSettled } from '../ui/importsSettle';
import { showLoadingModal, hideLoadingModal } from '../ui/modals';
import { getOntologyInfo } from '../ui/ontologyInfo';
import { hideOpenOntologyModal } from '../ui/openOntologyModal';
import { initEdgeStylesMenu, initAddRelationshipTypeHandlers } from '../ui/relationshipTypeModal';
import { refreshPropertyMenus } from '../ui/searchAutocomplete';
import { updateStatusBar, updateOntologyInfoDisplay, updateOntologyVersionDisplay, updateAvailableVersions } from '../ui/statusBar';
import { showValidationErrorModal } from '../ui/validationErrorModal';
import { beginViewSettle } from '../ui/viewSettle';
import { showWarningBar, hideWarningBar } from '../ui/warningBar';
import { debugWarn, debugLog, isDebugMode } from '../utils/debug';
import { isEmbedded } from '../utils/embedMode';
import { clearOntologyParamsFromAddressBar, getAllDisplayFileUrls, setOntologyUrlParamInAddressBar } from '../utils/urlParams';
import { applyDisplayConfig } from './displayConfigApply';
import { loadDisplayConfigFromLocalFile } from './displayConfigFiles';
import { firstDisplayConfig } from './displayConfigSave';
import { clearPositionsBeforeLayout } from './nodePositions';
import { findImportsNewerVersions, getDefiningOntologyFromUri } from './propertyLists';
import { clearUndoRedo } from './undoRedo';
import { DataFactory, type Term } from 'n3';

/** How long, and how large (in bytes), one imported ontology may be when it is read in the background (#104). */
export const IMPORT_READ_TIMEOUT_MS = 8000;

export const IMPORT_READ_MAX_BYTES = 5_000_000;

/**
 * Read what the loaded ontology's imports declare, in the background, and merge it into the property lists
 * and menus as read-only context (#104). Best effort: an import that can't be fetched (CORS, offline) is
 * skipped and nothing changes. The loaded store is never touched, so saving is unaffected. Nothing happens
 * if another ontology was opened in the meantime.
 */
export function startLoadingImportedDeclarations(store: NonNullable<typeof session.ttlStore>): void {
  beginImportsSettle();
  session.importedOntologies = [];
  setImportedPrefixes({});
  session.importNewerVersions = new Map();
  session.importsBeingRead = true;
  void (async () => {
    try {
      // Background reads are bounded: a slow or huge import is given up on, not waited for (and not kept).
      const imported = await loadImportedOntologies(store, (url) =>
        fetchExternalOntologyTtl(url, { timeoutMs: IMPORT_READ_TIMEOUT_MS, maxBytes: IMPORT_READ_MAX_BYTES, fetchStandardVocabularies: true })
      );
      if (store !== session.ttlStore || imported.length === 0) return;
      session.importedOntologies = imported;
      // Prefixes the imports declare name the namespaces they bring in (PROV through aec_provenance, #137).
      setImportedPrefixes(Object.assign({}, ...imported.map((o) => o.prefixes ?? {})));
      session.importedDeclarations = readImportedDeclarations(imported);
      const before = { objectProperties: session.objectProperties, dataProperties: session.dataProperties, annotationProperties: session.annotationProperties };
      const merged = mergeImportedDeclarations(before, session.importedDeclarations);
      session.objectProperties = merged.objectProperties;
      session.dataProperties = merged.dataProperties;
      session.annotationProperties = merged.annotationProperties;
      refreshPropertyMenus();
      // Redrawing clears the user's selection, so only do it when the labels or ranges of properties the file
      // uses came from an import; properties added as context are never drawn.
      if (mergeChangesWhatIsDrawn(before, merged)) actions.applyFilter(true);
    } catch (err) {
      debugWarn('Could not read the declarations of the imports:', err);
    } finally {
      if (store === session.ttlStore) {
        session.importsBeingRead = false;
        refreshExternalRefsList();
        importsSettled();
        void findImportsNewerVersions(store);
      }
    }
  })();
}

/**
 * Look, in the background, for the other versions of the loaded ontology (#132), and offer them in the bottom bar
 * (#133). Choosing one opens it, after asking when there are unsaved edits. The versions seen are remembered for
 * the tab, so an older version still offers the later ones. Not offered when embedded: the view is read-only there.
 */
export function startFindingVersions(store: NonNullable<typeof session.ttlStore>, loadedUrl: string | null): void {
  updateAvailableVersions(null, () => {});
  const ontologyIri = readOntologyVersion(store)?.ontologyIri;
  if (isEmbedded() || !ontologyIri) return;
  void findVersions(store, loadedUrl, browserVersionSources, recallSeenVersions(ontologyIri)).then((available) => {
    if (store !== session.ttlStore) return;
    rememberSeenVersions(ontologyIri, available.entries);
    updateAvailableVersions(available, (entry) => {
      if (!entry.url) return;
      if (fileState.hasUnsavedChanges && !confirm(`Open version ${entry.version}? Your unsaved changes will be lost.`)) return;
      void loadFromUrl(entry.url);
    });
  });
}

export async function loadTtlAndRender(
  ttlString: string,
  fileName?: string,
  handle?: FileSystemFileHandle | null,
  pathHint?: string
): Promise<void> {
  // The view is unsettled from the start of a load, not only once its render begins: the new store is set
  // before rendering, and the previous render's "settled" must not count for this load (#93).
  beginViewSettle();
  const errorMsg = document.getElementById('errorMsg') as HTMLElement;
  const warningMsg = document.getElementById('warningMsg') as HTMLElement;
  const vizControls = document.getElementById('vizControls') as HTMLElement;
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';
  errorMsg.innerHTML = '';
  errorMsg.style.cursor = '';
  warningMsg.style.display = 'none';

  try {
    // Store original TTL string to preserve format when saving
    fileState.originalTtlString = ttlString;
    
    const pathForParse = pathHint ?? fileName ?? '';
    const { parseResult, prefixMap, extractedRefs } = await loadOntologyFromContent(ttlString, pathForParse);
    const { graphData, store, annotationProperties: annotationProps, objectProperties: objectProps, dataProperties: dataProps, originalFileCache: cache } = parseResult;
    
    // Store the store early so tests can detect when parsing is complete
    session.ttlStore = store;
    // A loaded ontology is never left under the "Open ontology" dialog, whichever way it arrived — including
    // one loaded while start-up was still deciding whether to show that dialog.
    hideOpenOntologyModal();

    // Store original file cache for source preservation
    fileState.originalFileCache = cache ?? null;
    
    // Detect if file is TTL and load serializer config
    const isTurtle = pathForParse.toLowerCase().endsWith('.ttl') || 
                     pathForParse.toLowerCase().endsWith('.turtle') ||
                     (!pathForParse && cache?.format === 'turtle');
    fileState.isTtlFile = isTurtle;
    
    // Load serializer config from IndexedDB
    if (isTurtle && !fileState.skipSlowOperationsForTests) {
      const savedConfig = await loadSerializerConfigFromIndexedDB(fileState.loadedFilePath, fileState.loadedFileName);
      if (savedConfig) {
        fileState.currentSerializerType = savedConfig.serializerType;
      } else {
        // Default to 'custom' for TTL files
        fileState.currentSerializerType = 'custom';
      }
    } else {
      // Non-TTL files: default to rdflib (dropdown will be hidden)
      fileState.currentSerializerType = 'rdflib';
    }
    
    // Update dropdown visibility and state (call after cache is set)
    updateSerializerDropdown();
    
    // Merge external refs early so we can detect used annotation properties before processing nodes
    // Skip IndexedDB operations in test mode for faster execution
    const dbRefs = fileState.skipSlowOperationsForTests ? [] : await loadExternalRefsFromIndexedDB(fileState.loadedFilePath, fileState.loadedFileName);
    const mergedRefs: ExternalOntologyReference[] = [];
    const seenUrls = new Set<string>();
    
    // First add DB refs (they have user preferences like prefix)
    for (const dbRef of dbRefs) {
      const normalizedUrl = dbRef.url.endsWith('#') ? dbRef.url.slice(0, -1) : dbRef.url;
      mergedRefs.push(dbRef);
      seenUrls.add(normalizedUrl);
    }
    
    // Then add extracted refs that aren't in DB
    for (const extRef of extractedRefs) {
      const normalizedUrl = extRef.url.endsWith('#') ? extRef.url.slice(0, -1) : extRef.url;
      if (!seenUrls.has(normalizedUrl)) {
        mergedRefs.push(extRef);
        seenUrls.add(normalizedUrl);
      }
    }
    
    // Add refs from TTL @prefix so inlined externals (e.g. geo:) get a prefix even without owl:imports
    const mainBaseForPrefixes = getMainOntologyBase(store);
    for (const [prefix, url] of Object.entries(prefixMap)) {
      const urlStr = String(url);
      const normalizedUrl = (urlStr.endsWith('#') ? urlStr.slice(0, -1) : urlStr).replace(/\/$/, '');
      const mainNormalized = mainBaseForPrefixes ? (mainBaseForPrefixes.endsWith('#') ? mainBaseForPrefixes.slice(0, -1) : mainBaseForPrefixes).replace(/\/$/, '') : '';
      
      // Skip if this prefix matches the main ontology base
      if (normalizedUrl === mainNormalized) continue;
      
      if (!seenUrls.has(normalizedUrl)) {
        mergedRefs.push({ url: urlStr, prefix, usePrefix: true });
        seenUrls.add(normalizedUrl);
      } else {
        // Update existing ref with prefix if not set
        const existingRef = mergedRefs.find(r => {
          const rUrl = (r.url.endsWith('#') ? r.url.slice(0, -1) : r.url).replace(/\/$/, '');
          return rUrl === normalizedUrl;
        });
        if (existingRef && !existingRef.prefix) {
          existingRef.prefix = prefix;
          existingRef.usePrefix = true;
        }
      }
    }
    
    session.externalOntologyReferences = mergedRefs;
    
    // Now detect used annotation properties BEFORE we process nodes for styling
    // This ensures imported annotation properties like core:labellableRoot are available
    const mainBaseForAnnotProps = getMainOntologyBase(store);
    const usedAnnotationProps = new Set<string>();
    const usedAnnotationPropsWithUri = new Map<string, string>(); // localName -> full URI
    const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';
    const XSD_NS = 'http://www.w3.org/2001/XMLSchema#';
    
    // Find all predicates used in the store that might be annotation properties
    for (const q of store) {
      const pred = q.predicate as { termType?: string; value?: string };
      if (pred.termType !== 'NamedNode') continue;
      const predUri = pred.value;
      if (!predUri) continue;
      
      // Skip standard RDF/OWL properties
      if (predUri.startsWith('http://www.w3.org/1999/02/22-rdf-syntax-ns#') ||
          predUri.startsWith('http://www.w3.org/2000/01/rdf-schema#') ||
          predUri.startsWith('http://www.w3.org/2002/07/owl#')) {
        continue;
      }
      
      // Check if this predicate is already in annotationProperties
      const localName = extractLocalName(predUri);
      const alreadyExists = annotationProps.some((ap) => ap.name === localName || ap.uri === predUri);
      if (alreadyExists) continue;
      
      // Check if this predicate belongs to an external ontology
      const isExternal = isUriFromExternalOntology(predUri, null, session.externalOntologyReferences, mainBaseForAnnotProps);
      if (isExternal) {
        usedAnnotationProps.add(localName);
        usedAnnotationPropsWithUri.set(localName, predUri);
      }
    }
    
    // Add used annotation properties that are from external ontologies to annotationProps
    for (const [localName, fullUri] of usedAnnotationPropsWithUri) {
      // Check if it's not already in the list
      if (!annotationProps.some((ap) => ap.name === localName || ap.uri === fullUri)) {
        // Try to get range from store (might be in parent ontology, but we can check)
        const { DataFactory } = await import('n3');
        let rangeQuads = store.getQuads(DataFactory.namedNode(fullUri), DataFactory.namedNode(RDFS_NS + 'range'), null, null);
        let range = rangeQuads.length > 0 ? (rangeQuads[0].object as { value?: string }).value ?? null : null;
        
        // If range is not in store, try to infer it from usage patterns
        if (!range) {
          const XSD_BOOLEAN_URI = XSD_NS + 'boolean';
          const usedWithBoolean = store.getQuads(null, DataFactory.namedNode(fullUri), null, null).some((q) => {
            const obj = q.object;
            if (obj.termType === 'Literal') {
              const objLit = obj as { datatype?: { value?: string }; value?: string };
              const datatype = objLit.datatype?.value;
              if (datatype === XSD_BOOLEAN_URI || datatype?.endsWith('#boolean')) {
                return true;
              }
              const value = objLit.value;
              if (value === 'true' || value === 'false') {
                return true;
              }
            }
            return false;
          });
          
          if (usedWithBoolean) {
            range = XSD_BOOLEAN_URI;
          }
        }
        
        const isBoolean = range === XSD_NS + 'boolean' || range?.endsWith('#boolean') || false;
        
        // Get isDefinedBy if present
        const isDefinedByQuads = store.getQuads(DataFactory.namedNode(fullUri), DataFactory.namedNode(RDFS_NS + 'isDefinedBy'), null, null);
        let isDefinedBy: string | undefined = undefined;
        if (isDefinedByQuads.length > 0 && isDefinedByQuads[0].object.termType === 'NamedNode') {
          isDefinedBy = (isDefinedByQuads[0].object as { value?: string }).value ?? undefined;
        } else {
          // Extract base URL from the URI
          const hashIndex = fullUri.indexOf('#');
          const slashIndex = fullUri.lastIndexOf('/');
          if (hashIndex > -1) {
            isDefinedBy = fullUri.slice(0, hashIndex);
          } else if (slashIndex > -1) {
            isDefinedBy = fullUri.slice(0, slashIndex + 1);
          }
          if (!isDefinedBy) {
            const definingOntology = getDefiningOntologyFromUri(fullUri, session.externalOntologyReferences);
            isDefinedBy = definingOntology !== 'an external ontology' ? definingOntology : undefined;
          }
        }
        
        annotationProps.push({
          name: localName,
          isBoolean,
          range: range ?? null,
          uri: fullUri,
          isDefinedBy: isDefinedBy,
        });
      }
    }
    
    // Now re-process nodes to extract annotation values using the complete annotation properties list
    // This is necessary because imported annotation properties weren't available during initial parsing
    const RDF_NS_FOR_NODES = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    const OWL_NS_FOR_NODES = 'http://www.w3.org/2002/07/owl#';
    const updatedNodes = graphData.nodes.map(node => {
      // Find the subject for this node by matching local name
      const classQuads = store.getQuads(null, DataFactory.namedNode(RDF_NS_FOR_NODES + 'type'), DataFactory.namedNode(OWL_NS_FOR_NODES + 'Class'), null);
      let subj: { termType: string; value: string } | null = null;
      for (const q of classQuads) {
        const subject = q.subject as { termType?: string; value?: string };
        if (subject.termType === 'NamedNode' && subject.value) {
          const subjUri = subject.value;
          const localName = extractLocalName(subjUri);
          if (localName === node.id) {
            subj = subject as { termType: string; value: string };
            break;
          }
        }
      }
      
      if (!subj) return node;
      
      let labellableRoot: boolean | null = node.labellableRoot;
      const annotations: Record<string, string | boolean | null> = { ...(node.annotations || {}) };
      
      const outQuads = store.getQuads(subj as unknown as Term, null, null, null);
      for (const oq of outQuads) {
        const predName = extractLocalName((oq.predicate as { value: string }).value);
        const isAnnotation = annotationProps.some((ap) => ap.name === predName);
        if (!isAnnotation) continue;
        const obj = oq.object;
        const apInfo = annotationProps.find((ap) => ap.name === predName);
        if (apInfo?.isBoolean) {
          const val = (obj as { value: unknown }).value;
          const str = String(val).toLowerCase();
          const b = val === true || str === 'true' ? true : val === false || str === 'false' ? false : null;
          annotations[predName] = b;
          if (predName === 'labellableRoot') labellableRoot = b;
        } else {
          annotations[predName] = (obj as { value: unknown }).value != null ? String((obj as { value: unknown }).value) : null;
        }
      }
      
      return {
        ...node,
        labellableRoot,
        annotations,
      };
    });
    
    graphData.nodes = updatedNodes;

    // Validate ontology structure before proceeding
    const validationResult = validateOntologyStructure(graphData.nodes, graphData.edges);
    if (!validationResult.isValid) {
      const errorCount = validationResult.errors.length;
      const warningCount = validationResult.warnings.length;
      let errorSummary = 'Cannot open ontology';
      if (errorCount > 0 && warningCount > 0) {
        errorSummary += `: ${errorCount} error${errorCount !== 1 ? 's' : ''} and ${warningCount} warning${warningCount !== 1 ? 's' : ''} found`;
      } else if (errorCount > 0) {
        errorSummary += `: ${errorCount} error${errorCount !== 1 ? 's' : ''} found`;
      } else if (warningCount > 0) {
        errorSummary += `: ${warningCount} warning${warningCount !== 1 ? 's' : ''} found`;
      }
      
      // Create clickable error message
      errorMsg.innerHTML = `<span style="cursor: pointer; text-decoration: underline;">${errorSummary}</span>`;
      errorMsg.style.display = 'block';
      errorMsg.style.cursor = 'pointer';
      // Remove any existing click listeners by cloning and replacing
      const newErrorMsg = errorMsg.cloneNode(true) as HTMLElement;
      errorMsg.parentNode?.replaceChild(newErrorMsg, errorMsg);
      const currentErrorMsg = document.getElementById('errorMsg') as HTMLElement;
      currentErrorMsg.addEventListener('click', () => {
        showValidationErrorModal(validationResult);
      });
      
      vizControls.style.display = 'none';
      // Also create plain text version for the error object
      const errorText = formatValidationErrors(validationResult);
      throw new Error(`Invalid ontology structure: ${errorText}`);
    }
    
    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      console.warn('Ontology validation warnings:', validationResult.warnings);
    }

    session.rawData = graphData;
    clearPositionsBeforeLayout();
    canvasState.positionsArranged = false;
    session.annotationProperties = annotationProps;
    session.objectProperties = objectProps;
    session.dataProperties = dataProps;
    session.importedDeclarations = null; // those of the previous ontology's imports
    // ttlStore already set earlier after parsing (for faster test detection)
    session.knownExternalClassUris = new Set();
    session.userAddedExternalNodes = [];

    fileState.loadedFileName = fileName ?? null;
    fileState.loadedFilePath = pathHint ?? fileName ?? null;
    fileState.fileHandle = handle ?? null;
    forgetOntologyDirectory(); // another ontology, maybe in another folder (#103)
fileState.hasUnsavedChanges = false;
    clearUndoRedo();
    updateFilePathDisplay();

    canvasState.loadedEdgeStyleConfig = null;

    // Check if ontology has no classes AND no edges (canvas is truly empty)
    // If there are edges (even connecting external nodes), the canvas is not empty
    // Also check if there are object properties with domain/range that would create edges
    // (even if those edges connect external nodes like owl:Thing)
    let hasObjectPropertiesWithDomainRange = false;
    if (graphData.nodes.length === 0 && graphData.edges.length === 0) {
      // Check if any object properties have domain/range defined (would create edges with external nodes)
      const { DataFactory } = await import('n3');
      const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
      for (const op of objectProps) {
        const propUri = op.uri ?? (op.name.startsWith('http://') || op.name.startsWith('https://') ? op.name : null);
        if (!propUri) continue;
        const propNode = DataFactory.namedNode(propUri);
        const domainQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'domain'), null, null);
        const rangeQuads = store.getQuads(propNode, DataFactory.namedNode(RDFS + 'range'), null, null);
        if (domainQuads.length > 0 && rangeQuads.length > 0) {
          hasObjectPropertiesWithDomainRange = true;
          break;
        }
      }
    }
    
    if (graphData.nodes.length === 0 && graphData.edges.length === 0 && !hasObjectPropertiesWithDomainRange) {
      showWarningBar('The current file defines no classes, so the canvas is empty.');
    } else {
      hideWarningBar();
    }

    setTimeout(() => {
      updateStatusBar(session.ttlStore, pathHint ?? fileName ?? null);
      updateOntologyInfoDisplay(session.ttlStore ? getOntologyInfo(session.ttlStore, prefixMap) : null);
      updateOntologyVersionDisplay(session.ttlStore ? readOntologyVersion(session.ttlStore) : null);
      if (session.ttlStore) startFindingVersions(session.ttlStore, pathHint && /^https?:\/\//i.test(pathHint) ? pathHint : null);
    }, 0);

    if (handle && fileName) {
      saveLastFileToIndexedDB(handle, pathHint ?? fileName).catch(() => {});
      addRecentlyOpenedToIndexedDB({
        kind: 'file',
        handle,
        pathHint: pathHint ?? fileName,
        name: fileName,
        openedAt: Date.now(),
      }).catch(() => {});
    }
    updateSaveButtonVisibility();

    vizControls.style.display = 'contents';
    const displayConfigGroup = document.getElementById('displayConfigGroup');
    if (displayConfigGroup) {
      displayConfigGroup.style.display = 'inline-flex';
      displayConfigGroup.style.flexDirection = 'column';
    }
    const manageExternalRefsBtn = document.getElementById('manageExternalRefs');
    if (manageExternalRefsBtn) manageExternalRefsBtn.style.display = 'inline-block';

    debugLog('[DEBUG] After parsing - describes edges in rawData.edges:', session.rawData.edges.filter((e) => e.type.includes('describes')).length);
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog('Extracted external references from ontology:', extractedRefs);
      debugLog('Extracted prefixes:', prefixMap);
    }

    // Note: External references are already merged earlier (before node re-processing)
    // This ensures external ontology references are available when detecting used annotation properties
    
    // Add refs from namespaces used in the store (e.g. DANO loaded as RDF/XML has no owl:imports and no TTL prefixes)
    const mainBaseForNamespaceRefs = getMainOntologyBase(session.ttlStore);
    for (const ref of extractUsedNamespaceRefsFromStore(session.ttlStore, mainBaseForNamespaceRefs)) {
      const normalized = ref.url.endsWith('#') ? ref.url.slice(0, -1) : ref.url.replace(/\/$/, '');
      if (!seenUrls.has(normalized)) {
        mergedRefs.push(ref);
        seenUrls.add(normalized);
      }
    }

    sortExternalRefsByUrl(mergedRefs);
    session.externalOntologyReferences = mergedRefs;

    sortExternalRefsByUrl(mergedRefs);
    session.externalOntologyReferences = mergedRefs;
    // Debug logging removed - use debugLog if needed in future
    // Debug logging (only in debug mode)
    if (isDebugMode()) {
      debugLog(`Total external references: ${session.externalOntologyReferences.length}`);
      for (const ref of session.externalOntologyReferences) {
        debugLog(`  - ${ref.url} (prefix: ${ref.prefix || 'none'}, usePrefix: ${ref.usePrefix})`);
      }
    }

    const mainBaseForSeed = getMainOntologyBase(session.ttlStore);
    if (mainBaseForSeed && session.externalOntologyReferences.length > 0) {
      const refed = getReferencedExternalClassesFromStore(session.ttlStore, mainBaseForSeed, session.externalOntologyReferences);
      refed.forEach((c) => session.knownExternalClassUris.add(c.uri));
    }

    // Pre-fetch and cache external ontology classes and object properties (non-blocking)
    // Failures are expected (CORS, 404, etc.) and are handled silently unless in debug mode
    if (session.externalOntologyReferences.length > 0) {
      preloadExternalOntologyClasses(session.externalOntologyReferences).catch((err) => {
        // Only log in debug mode - failures are expected for many external ontologies
        if (isDebugMode()) {
          debugWarn('Failed to pre-load external ontologies:', err);
        }
      });
    }
    
    // Extract external object properties from edges that use full URIs
    // This ensures external properties appear in the Object Properties menu
    // Create basic entries immediately without any network requests to avoid blocking
    const edgeTypes = getEdgeTypes(session.rawData.edges);
    for (const edgeType of edgeTypes) {
      if ((edgeType.startsWith('http://') || edgeType.startsWith('https://'))) {
        // Check if this property already exists (either as full URI or as local name)
        const localName = extractLocalName(edgeType);
        const existingByUri = session.objectProperties.find((op) => op.name === edgeType);
        const existingByLocalName = session.objectProperties.find((op) => op.name === localName);
        
        // If it exists as local name, update it to use the full URI to avoid duplicates
        if (existingByLocalName && !existingByUri) {
          existingByLocalName.name = edgeType;
        }
        
        // Only add if it doesn't exist yet - create basic entry immediately (no network requests)
        if (!existingByUri && !existingByLocalName) {
          session.objectProperties.push({
            name: edgeType,
            label: extractLocalName(edgeType),
            hasCardinality: true,
            comment: null,
          });
        }
      }
    }
    session.objectProperties.sort((a, b) => a.name.localeCompare(b.name));

    // Note: Used annotation properties are already detected and added earlier (before node re-processing)
    // This ensures imported annotation properties like core:labellableRoot are available when nodes are processed
    session.annotationProperties.sort((a, b) => a.name.localeCompare(b.name));

    const edgeStylesContent = document.getElementById('edgeStylesContent')!;
    const annotationPropsContent = document.getElementById('annotationPropsContent');
    initEdgeStylesMenu(edgeStylesContent, actions.applyFilter);
    const dataPropsContent = document.getElementById('dataPropsContent');
    if (dataPropsContent) actions.initDataPropsMenu(dataPropsContent);
    if (annotationPropsContent) initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
    initAddRelationshipTypeHandlers(edgeStylesContent);
    initAddDataPropertyHandlers(dataPropsContent ?? undefined);
    initAddAnnotationPropertyHandlers(annotationPropsContent ?? undefined);

    let savedViewState: { scale: number; position: { x: number; y: number } } | null = null;
    // Skip IndexedDB operations in test mode for faster execution
    const displayConfig = fileState.skipSlowOperationsForTests ? null : await loadDisplayConfigFromIndexedDB(fileState.loadedFilePath, fileState.loadedFileName);

    // Apply the saved annotation-property priority order (drives styling precedence) and restore
    // saved per-property colours into the freshly rendered menu. The menu was rendered above with
    // alphabetical order + default colours; this overrides both from the saved display config.
    if (displayConfig && annotationPropsContent) {
      session.annotationProperties = applyAnnotationPropertyOrder(session.annotationProperties, displayConfig.annotationPropertyOrder);
      initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
      applyAnnotationStyleConfigToDom(
        annotationPropsContent,
        displayConfig.annotationStyleConfig as AnnotationStyleConfig | undefined,
        session.annotationProperties
      );
    }

    // Set lastLayoutMode BEFORE applying config to prevent clearing positions.
    // Resolve to the default DAG layout when the config's mode no longer exists (issue #19).
    canvasState.lastLayoutMode = resolveLayoutMode(displayConfig?.layoutMode);
    
    if (displayConfig) {
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog('[DISPLAY CONFIG] Loading display config from IndexedDB for:', fileState.loadedFileName);
        debugLog('[DISPLAY CONFIG] Config has', Object.keys(displayConfig.nodePositions || {}).length, 'node positions');
        debugLog('[DISPLAY CONFIG] Config has', Object.keys(displayConfig.edgeStyleConfig || {}).length, 'edge style configs');
      }
      // Store the edge style config so it can be merged when building the filter
      canvasState.loadedEdgeStyleConfig = displayConfig.edgeStyleConfig || null;
      applyDisplayConfig(displayConfig);
      if (displayConfig.viewState) savedViewState = displayConfig.viewState;
    } else {
      // No saved config: default the "Max" node font size to a value scaled to the ontology size
      // (fewer nodes → smaller Max, gentler root→leaf gap). See issue #44.
      const maxFontEl = document.getElementById('maxFontSize') as HTMLInputElement | null;
      if (maxFontEl) maxFontEl.value = String(defaultMaxFontSize(session.rawData?.nodes?.length ?? 0));
      // Debug logging (only in debug mode)
      if (isDebugMode()) {
        debugLog('[DISPLAY CONFIG] No display config found in IndexedDB for:', fileState.loadedFileName);
      }
    }

    // Allow layout to settle after vizControls appears, then render
    // Skip double requestAnimationFrame in test mode for faster execution
    if (fileState.skipSlowOperationsForTests) {
      actions.applyFilter();
      if (canvasState.network && savedViewState) {
        canvasState.network.moveTo({
          scale: savedViewState.scale,
          position: savedViewState.position,
          animation: false,
        });
      }
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          actions.applyFilter();
          if (canvasState.network && savedViewState) {
            canvasState.network.moveTo({
              scale: savedViewState.scale,
              position: savedViewState.position,
              animation: false,
            });
          }
        });
      });
    }
    startLoadingImportedDeclarations(store);
  } catch (err) {
    errorMsg.textContent = `Parse error: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}

/**
 * Load ontology from a file.
 */
export async function loadFromFile(): Promise<void> {
  const fileInput = document.getElementById('fileInput') as HTMLInputElement;
  if (!fileInput) return;

  if ('showOpenFilePicker' in window) {
    showLoadingModal();
    try {
      const [handle] = await (window as Window & { showOpenFilePicker: (o?: object) => Promise<FileSystemFileHandle[]> })
        .showOpenFilePicker({
          types: [
            { accept: { 'text/turtle': ['.ttl', '.turtle'] }, description: 'Turtle' },
            { accept: { 'application/rdf+xml': ['.owl', '.rdf', '.rdfxml'] }, description: 'RDF/XML (OWL)' },
            { accept: { 'application/ld+json': ['.jsonld', '.json'] }, description: 'JSON-LD' },
          ],
          mode: 'readwrite',
        });
      const file = await handle.getFile();
      const ttl = await file.text();
      const pathHint = (file as File & { path?: string }).path ?? file.name;
      await loadTtlAndRender(ttl, file.name, handle, pathHint);
      
      // Try to load display config from sibling .display.json file
      const localDisplayConfig = await loadDisplayConfigFromLocalFile(handle, file.name);
      if (localDisplayConfig) {
        canvasState.loadedEdgeStyleConfig = localDisplayConfig.edgeStyleConfig || null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            applyDisplayConfig(localDisplayConfig);
            actions.applyFilter();
            if (canvasState.network && localDisplayConfig.viewState) {
              canvasState.network.moveTo({
                scale: localDisplayConfig.viewState.scale,
                position: localDisplayConfig.viewState.position,
                animation: false,
              });
            }
            saveDisplayConfigToIndexedDB(localDisplayConfig, pathHint, file.name).catch(() => {});
          });
        });
      }
      
      clearOntologyParamsFromAddressBar();
      hideLoadingModal();
      hideOpenOntologyModal();
    } catch (err) {
      hideLoadingModal();
      if ((err as Error).name !== 'AbortError') {
        const errorMsg = document.getElementById('errorMsg') as HTMLElement;
        errorMsg.textContent = `Failed to open file: ${err instanceof Error ? err.message : String(err)}`;
        errorMsg.style.display = 'block';
      }
    }
  } else {
    fileInput.click();
  }
}

/**
 * Load ontology from a URL.
 * On failure (CORS or other), shows a modal instead of the in-editor error bar.
 */
export async function loadFromUrl(url: string): Promise<void> {
  showLoadingModal();
  try {
    const ttl = await fetchOntologyFromUrl(url);

    // Use URL path as filename for display; format is detected from URL for parsing
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const fileName = pathParts[pathParts.length - 1] || 'ontology.ttl';

    saveLastUrlToIndexedDB(url, fileName).catch(() => {});
    addRecentlyOpenedToIndexedDB({ kind: 'url', url, name: fileName, openedAt: Date.now() }).catch(() => {});

    // Next to the file the URL was finally served from first: a version IRI redirects to its release (#136).
    let urlDisplayConfig = await firstDisplayConfig(getAllDisplayFileUrls(url, servedFrom(url)));

    await loadTtlAndRender(ttl, fileName, null, url);
    setOntologyUrlParamInAddressBar(url);

    // A version opened without a config of its own borrows the latest version's, and says so (#136).
    const latestSource = !urlDisplayConfig && session.ttlStore ? latestDisplayConfigSource(url, readOntologyVersion(session.ttlStore)) : null;
    if (latestSource && (await fetchExternalOntologyTtl(latestSource, { timeoutMs: IMPORT_READ_TIMEOUT_MS }))) {
      urlDisplayConfig = await firstDisplayConfig(getAllDisplayFileUrls(latestSource, servedFrom(latestSource)));
      if (urlDisplayConfig) {
        showWarningBar('This version has no display settings of its own: the layout and colours of the latest version are used, so terms added or removed since may be placed oddly.');
      }
    }

    if (urlDisplayConfig) {
      canvasState.loadedEdgeStyleConfig = urlDisplayConfig.edgeStyleConfig || null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyDisplayConfig(urlDisplayConfig!);
          actions.applyFilter();
          if (canvasState.network && urlDisplayConfig!.viewState) {
            canvasState.network.moveTo({
              scale: urlDisplayConfig!.viewState.scale,
              position: urlDisplayConfig!.viewState.position,
              animation: false,
            });
          }
          saveDisplayConfigToIndexedDB(urlDisplayConfig!, url, fileName).catch(() => {});
        });
      });
    }

    hideLoadingModal();
  } catch (err) {
    hideLoadingModal();
    console.error('Failed to load ontology from URL:', err);
    handleUrlLoadFailure(url, err, { onOpenFile: loadFromFile });
  }
}

/**
 * Load an ontology from a previously-granted file handle (requesting permission again if
 * needed), and apply its sibling .display.json config if present. Shared by "Load last opened
 * file" and reopening an entry from the "Previously opened" history.
 */
export async function loadOntologyFromFileHandle(handle: FileSystemFileHandle, storedPathHint?: string): Promise<void> {
  showLoadingModal();
  try {
    // The File System Access permission API is not yet in the TS DOM lib.
    const handleWithPerms = handle as unknown as {
      queryPermission(descriptor: { mode: string }): Promise<PermissionState>;
      requestPermission(descriptor: { mode: string }): Promise<PermissionState>;
    };
    const perm = await handleWithPerms.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const requested = await handleWithPerms.requestPermission({ mode: 'readwrite' });
      if (requested !== 'granted') {
        hideLoadingModal();
        const errorMsg = document.getElementById('errorMsg') as HTMLElement;
        errorMsg.textContent = 'Permission to access file was denied.';
        errorMsg.style.display = 'block';
        return;
      }
    }
    const file = await handle.getFile();
    const ttl = await file.text();
    const pathHint = (file as File & { path?: string }).path ?? storedPathHint ?? file.name;
    await loadTtlAndRender(ttl, file.name, handle, pathHint);

    // Try to load display config from sibling .display.json file
    const localDisplayConfig = await loadDisplayConfigFromLocalFile(handle, file.name);
    if (localDisplayConfig) {
      canvasState.loadedEdgeStyleConfig = localDisplayConfig.edgeStyleConfig || null;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyDisplayConfig(localDisplayConfig);
          actions.applyFilter();
          if (canvasState.network && localDisplayConfig.viewState) {
            canvasState.network.moveTo({
              scale: localDisplayConfig.viewState.scale,
              position: localDisplayConfig.viewState.position,
              animation: false,
            });
          }
          saveDisplayConfigToIndexedDB(localDisplayConfig, pathHint, file.name).catch(() => {});
        });
      });
    }

    hideLoadingModal();
  } catch (err) {
    hideLoadingModal();
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = `Failed to load file: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}

/**
 * Load the last opened file.
 */
export async function loadLastOpenedFile(): Promise<void> {
  hideOpenOntologyModal();
  const stored = await getLastFileFromIndexedDB();
  if (!stored) {
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = 'No previously opened file found.';
    errorMsg.style.display = 'block';
    return;
  }
  await loadOntologyFromFileHandle(stored.handle, stored.pathHint);
}

/**
 * Reopen an entry from the "Previously opened" history (file or URL).
 */
export async function loadFromRecentEntry(entry: RecentlyOpenedEntry): Promise<void> {
  if (entry.kind === 'url') {
    await loadFromUrl(entry.url);
  } else {
    await loadOntologyFromFileHandle(entry.handle, entry.pathHint);
  }
}

/**
 * Load the last opened URL.
 */
export async function loadLastOpenedUrl(): Promise<void> {
  hideOpenOntologyModal();
  const stored = await getLastUrlFromIndexedDB();
  if (!stored) {
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = 'No previously opened URL found.';
    errorMsg.style.display = 'block';
    return;
  }
  try {
    await loadFromUrl(stored.url);
  } catch (err) {
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    errorMsg.textContent = `Failed to load from URL: ${err instanceof Error ? err.message : String(err)}`;
    errorMsg.style.display = 'block';
  }
}
