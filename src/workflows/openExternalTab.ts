/**
 * Opening a referenced external ontology in a new tab.
 * Moved out of main.ts (#175).
 */
import { getOrRequestOntologyDirectory } from '../lib/ontologyDirectory';
import { openExternalOntologyTab } from '../lib/openExternalOntology';
import { fileState } from '../state/appState';
import { convertOntologyUrlToHtmlUrl } from '../utils/urlParams';

/**
 * "Open external ontology": open the imported ontology in a new tab. When the open ontology came from a
 * local file, its file is looked for in the same folder first (the folder is asked for once, #103), which
 * avoids CORS; otherwise, or when it isn't there, the ontology is opened by URL. The tab opens on the click
 * itself (see openExternalOntologyTab), so the wait for the folder can't get it blocked as a popup.
 */
export function openExternalOntology(url: string): Promise<void> {
  const fileName = fileState.loadedFileName;
  return openExternalOntologyTab({
    fromDisk: !!fileName && !/^https?:\/\//i.test(fileState.loadedFilePath ?? ''),
    open: (target) => window.open(target, '_blank'),
    findLocalUrl: async () => {
      const directory = await getOrRequestOntologyDirectory(fileState.fileHandle);
      if (!directory) return null;
      const { findMatchingLocalFile, openLocalFileInNewTab } = await import('../lib/localFileOpener');
      const localFile = await findMatchingLocalFile(directory, fileName!, url);
      return localFile ? openLocalFileInNewTab(localFile) : null;
    },
    // Open the HTML documentation URL when the ontology URL converts to one (hyphens to underscores, .html).
    byUrl: () => `${window.location.origin + window.location.pathname}?onto=${encodeURIComponent(convertOntologyUrlToHtmlUrl(url) || url)}`,
  });
}
