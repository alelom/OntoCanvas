/**
 * The ontology opening: the open button and modal, and the file input.
 * Moved out of eventListeners.ts (#198).
 */
import { REPO_URL } from '../../utils/siteInfo';
import { clearOntologyParamsFromAddressBar } from '../../utils/urlParams';
import { getAppVersion } from '../../utils/version';
import { loadFromFile, loadFromUrl, loadLastOpenedFile, loadLastOpenedUrl, loadFromRecentEntry, loadTtlAndRender } from '../../workflows/loadOntologyFlow';
import { showLoadingModal, hideLoadingModal } from '../modals';
import { showOpenOntologyModal, initOpenOntologyModal, hideOpenOntologyModal } from '../openOntologyModal';
import { initStatusBar } from '../statusBar';

export function wireOpenFile(): void {
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
}
