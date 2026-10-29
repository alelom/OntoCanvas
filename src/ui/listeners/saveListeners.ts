/**
 * Save, and the serializer choice.
 * Moved out of eventListeners.ts (#198).
 */
import { fileState } from '../../state/appState';
import { type SerializerType } from '../../storage/types';
import { saveSerializerConfigToIndexedDB } from '../../storage/serializerConfigStore';
import { debugLog } from '../../utils/debug';
import { saveTtl } from '../../workflows/saveTtlFlow';

export function wireSave(): void {
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
}
