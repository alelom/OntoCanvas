/**
 * Handler for loading ontologies from URL parameters.
 */

import { getOntologyUrlFromParams, getLocalFileTokenFromParams } from '../utils/urlParams';
import { retrieveLocalFileContent, deleteLocalFileContent } from './localFileTokenStorage';

/**
 * Callback type for loading an ontology from a URL.
 */
export type OnLoadFromUrlCallback = (url: string) => Promise<void>;

/**
 * Callback type for loading an ontology from local file content.
 */
export type OnLoadFromLocalFileCallback = (content: string, fileName: string, pathHint: string) => Promise<void>;

/**
 * Callback type for showing the open ontology modal.
 */
export type ShowModalCallback = () => void;

/**
 * Callback type for hiding the open ontology modal.
 */
export type HideModalCallback = () => void;

/**
 * Handle URL parameter-based ontology loading.
 * Checks for the 'onto' URL parameter or 'localFile' token and attempts to load the ontology if present.
 * 
 * @param loadFromUrl - Callback function to load ontology from URL
 * @param loadFromLocalFile - Callback function to load ontology from local file content
 * @param showModal - Callback function to show the open ontology modal
 * @param hideModal - Callback function to hide the open ontology modal
 * @returns Promise that resolves to true if loading was attempted, false if no parameter was found
 */
export async function handleUrlParameterLoad(
  loadFromUrl: OnLoadFromUrlCallback,
  loadFromLocalFile: OnLoadFromLocalFileCallback,
  showModal: ShowModalCallback,
  hideModal: HideModalCallback
): Promise<boolean> {
  // First check for local file token
  const localFileToken = getLocalFileTokenFromParams();
  if (localFileToken) {
    try {
      const fileData = await retrieveLocalFileContent(localFileToken);
      if (fileData) {
        // Load from local file content
        await loadFromLocalFile(fileData.content, fileData.fileName, fileData.pathHint);
        // Delete the token after successful load (one-time use)
        await deleteLocalFileContent(localFileToken);
        // Close the modal after successful loading
        hideModal();
        return true;
      } else {
        // Token expired or invalid, show modal
        console.warn('Local file token expired or invalid');
        showModal();
        return true;
      }
    } catch (err) {
      console.error('Failed to load ontology from local file token:', err);
      showModal();
      return true;
    }
  }
  
  // Check for ontology URL parameter
  const ontologyUrl = getOntologyUrlFromParams();
  if (!ontologyUrl) {
    // No URL parameter found, show modal as usual
    return false;
  }
  
  // URL parameter found, attempt to load
  try {
    await loadFromUrl(ontologyUrl);
    // Loading succeeded, close the modal
    hideModal();
    return true;
  } catch (err) {
    // Loading failed, show modal to allow manual selection
    console.error('Failed to load ontology from URL parameter:', err);
    showModal();
    return true; // Still return true since we attempted loading
  }
}
