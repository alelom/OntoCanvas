/**
 * The external ontologies: the references modal, the display options of external nodes, and adding a reference.
 * Moved out of eventListeners.ts (#198).
 */
import { preloadExternalOntologyClasses } from '../../externalOntologySearch';
import { actions } from '../../state/actions';
import { fileState, session, canvasState } from '../../state/appState';
import { type ExternalNodeLayout } from '../../storage/types';
import { saveExternalRefsToIndexedDB } from '../../storage/externalRefsStore';
import { scheduleDisplayConfigSave } from '../../workflows/displayConfigSave';
import { initAnnotationPropsMenu } from '../annotationPropertiesMenu';
import { getAnnotationPropsMenuDeps } from '../annotationPropertyModal';
import { type ExternalRefsModalCallbacks, showExternalRefsModal, hideExternalRefsModal, sortExternalRefsByUrl, renderExternalRefsList } from '../externalRefs';
import { updateSaveButtonVisibility } from '../fileBar';
import { initEdgeStylesMenu } from '../relationshipTypeModal';

export function wireExternalRefs(): void {
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
}
