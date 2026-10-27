/**
 * The file part of the page: the save button, the path of the open file and the serializer choice.
 * Moved out of main.ts (#175).
 */
import { fileState } from '../state/appState';
import { debugLog, isDebugMode } from '../utils/debug';
import { updateFilePathDisplay as updateStatusBarFilePath } from './statusBar';

export function updateSaveButtonVisibility(): void {
  const group = document.getElementById('saveGroup');
  if (group) {
    group.style.display = fileState.hasUnsavedChanges ? 'inline-flex' : 'none';
  }
}

export function updateFilePathDisplay(): void {
  updateStatusBarFilePath(fileState.loadedFilePath);
}

export function updateSerializerDropdown(): void {
  const dropdown = document.getElementById('serializerSelect') as HTMLSelectElement | null;
  if (!dropdown) {
    // Dropdown doesn't exist - might not be in DEV mode or DOM not ready
    debugLog('[updateSerializerDropdown] Dropdown not found, isDebugMode:', isDebugMode());
    return;
  }
  
  // Only show for TTL files in debug mode
  if (fileState.isTtlFile && isDebugMode()) {
    dropdown.style.display = 'inline-block';
    dropdown.value = fileState.currentSerializerType;
    debugLog('[updateSerializerDropdown] Showing dropdown, isTtlFile:', fileState.isTtlFile, 'currentSerializerType:', fileState.currentSerializerType);
    
    // Disable custom option if prerequisites not met
    const customOption = dropdown.querySelector('option[value="custom"]') as HTMLOptionElement;
    if (customOption) {
      if (!fileState.originalFileCache || fileState.originalFileCache.format !== 'turtle') {
        customOption.disabled = true;
        customOption.title = 'Custom serializer requires file cache (load a .ttl file)';
        debugLog('[updateSerializerDropdown] Custom option disabled, cache:', !!fileState.originalFileCache);
        // If custom was selected but prerequisites not met, switch to rdflib
        if (fileState.currentSerializerType === 'custom') {
          fileState.currentSerializerType = 'rdflib';
          dropdown.value = 'rdflib';
        }
      } else {
        customOption.disabled = false;
        customOption.title = '';
        debugLog('[updateSerializerDropdown] Custom option enabled');
      }
    }
  } else {
    dropdown.style.display = 'none';
    debugLog('[updateSerializerDropdown] Hiding dropdown, isTtlFile:', fileState.isTtlFile, 'isDebugMode:', isDebugMode());
  }
}
