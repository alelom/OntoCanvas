/**
 * Wires the toolbar, the menus, the search box and the keyboard to what they do: it calls one function per feature, in
 * src/ui/listeners/ (#198). It stays a hub: adding or removing a call changes what the whole page responds to.
 * Moved out of main.ts (#175).
 */
import { wireOpenFile } from './listeners/openFileListeners';
import { wireDisplayOptions } from './listeners/displayOptionListeners';
import { wireExternalRefs } from './listeners/externalRefsListeners';
import { wireToolbar } from './listeners/toolbarListeners';
import { wireEditEdge } from './listeners/editEdgeListeners';
import { wireSave } from './listeners/saveListeners';
import { wireDisplayConfig } from './listeners/displayConfigListeners';
import { wireNodeModals } from './listeners/nodeModalListeners';
import { wireGlobalShortcuts } from './listeners/globalShortcuts';
import { wireSearch } from './listeners/searchListeners';

export function setupEventListeners(): void {
  // The wiring is in src/ui/listeners/, one file per feature.
  wireOpenFile();
  wireDisplayOptions();
  wireExternalRefs();
  wireToolbar();
  wireEditEdge();
  wireSave();
  wireDisplayConfig();
  wireNodeModals();
  wireGlobalShortcuts();
  wireSearch();
}
