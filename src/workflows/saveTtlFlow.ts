/**
 * Saving the open ontology to its file: choosing the serializer, writing, and clearing the unsaved flag.
 * Moved out of main.ts (#175).
 */
import { loadOntologyFromContent } from '../lib/loadOntology';
import { storeToTurtle } from '../parser';
import { session, fileState } from '../state/appState';
import { updateSerializerDropdown, updateSaveButtonVisibility } from '../ui/fileBar';
import { debugError, debugLog, debugWarn } from '../utils/debug';

export async function saveTtl(): Promise<void> {
  if (!session.ttlStore) {
    debugError('[saveTtl] No ttlStore available');
    return;
  }
  
  // Validate custom serializer prerequisites
  if (fileState.currentSerializerType === 'custom') {
    if (!fileState.originalFileCache || fileState.originalFileCache.format !== 'turtle') {
      const errorMsg = document.getElementById('errorMsg') as HTMLElement;
      if (errorMsg) {
        errorMsg.textContent = 
          'Custom TTL Serializer requires original file cache. ' +
          'Please reload the file as a Turtle (.ttl) file or switch to rdflib serializer.';
        errorMsg.style.display = 'block';
      }
      throw new Error('Custom serializer prerequisites not met');
    }
  }
  
  const overwriteCb = document.getElementById('overwriteFile') as HTMLInputElement | null;
  const doOverwrite = overwriteCb?.checked === true && fileState.fileHandle;
  try {
    debugLog('[saveTtl] Starting save, serializer:', fileState.currentSerializerType, 'doOverwrite:', doOverwrite);
    
    // Pass serializer type to storeToTurtle
    const ttlString = await storeToTurtle(
      session.ttlStore, 
      session.externalOntologyReferences, 
      fileState.originalTtlString ?? undefined, 
      fileState.originalFileCache ?? undefined,
      fileState.currentSerializerType
    );
    debugLog('[saveTtl] Got ttlString, length:', ttlString.length);
    if (doOverwrite) {
      if (!fileState.fileHandle) {
        throw new Error('File handle not available for overwrite');
      }
      const writable = await fileState.fileHandle.createWritable();
      await writable.write(ttlString);
      await writable.close();
      // Update originalTtlString to the newly saved content for idempotent round trips
      // This ensures that subsequent saves use the saved format as the reference
      fileState.originalTtlString = ttlString;
      // Update cache if we used reconstruction (cache will be updated with new content)
      if (fileState.originalFileCache) {
        // Re-parse to update cache with new content
        try {
          const pathForParse = fileState.loadedFilePath ?? fileState.loadedFileName ?? '';
          const { parseResult: newParseResult } = await loadOntologyFromContent(ttlString, pathForParse);
          fileState.originalFileCache = newParseResult.originalFileCache ?? null;
          // Update dropdown state after cache update
          updateSerializerDropdown();
        } catch (e) {
          debugWarn('[saveTtl] Failed to update cache after save:', e);
        }
      }
      debugLog('[saveTtl] File overwritten successfully');
    } else {
      const blob = new Blob([ttlString], { type: 'text/turtle' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Ensure filename has .ttl extension
      let downloadName = fileState.loadedFileName ?? 'ontology.ttl';
      if (!downloadName.toLowerCase().endsWith('.ttl') && !downloadName.toLowerCase().endsWith('.turtle')) {
        downloadName = `${downloadName}.ttl`;
      }
      a.download = downloadName;
      // Add to DOM temporarily to ensure Playwright can detect the download
      a.style.display = 'none';
      a.style.position = 'absolute';
      a.style.left = '-9999px';
      document.body.appendChild(a);
      
      // Click synchronously to ensure Playwright can detect the download
      // Playwright needs the click to happen synchronously for download detection
      a.click();
      
      // Remove from DOM and revoke URL after a delay to ensure download is initiated
      // Use a longer delay to give Playwright time to detect the download
      setTimeout(() => {
        try {
          if (a.parentNode) {
            document.body.removeChild(a);
          }
        } catch (e) {
          // Ignore errors if element was already removed
        }
      URL.revokeObjectURL(url);
      }, 1000);
      debugLog('[saveTtl] File download triggered');
    }
    fileState.hasUnsavedChanges = false;
    updateSaveButtonVisibility();
    debugLog('[saveTtl] Save completed successfully');
  } catch (err) {
    debugError('[saveTtl] Error during save:', err);
    const errorMsg = document.getElementById('errorMsg') as HTMLElement;
    if (errorMsg) {
      let errorText = `Save error: ${err instanceof Error ? err.message : String(err)}`;
      
      // Special handling for custom serializer errors
      if (fileState.currentSerializerType === 'custom' && 
          err instanceof Error && 
          err.message.includes('cache')) {
        errorText += ' Try switching to "rdflib Serializer" in the dropdown.';
      }
      
      errorMsg.textContent = errorText;
      errorMsg.style.display = 'block';
    }
    // Re-throw to ensure the error is visible
    throw err;
  }
}
