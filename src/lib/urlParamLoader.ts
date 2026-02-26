/**
 * Handler for loading ontologies from URL parameters.
 */

import { getOntologyUrlFromParams } from '../utils/urlParams';

/**
 * Callback type for loading an ontology from a URL.
 */
export type OnLoadFromUrlCallback = (url: string) => Promise<void>;

/**
 * Callback type for showing the open ontology modal.
 */
export type ShowModalCallback = () => void;

/**
 * Handle URL parameter-based ontology loading.
 * Checks for the 'onto' URL parameter and attempts to load the ontology if present.
 * 
 * @param loadFromUrl - Callback function to load ontology from URL
 * @param showModal - Callback function to show the open ontology modal
 * @returns Promise that resolves to true if loading was attempted, false if no parameter was found
 */
export async function handleUrlParameterLoad(
  loadFromUrl: OnLoadFromUrlCallback,
  showModal: ShowModalCallback
): Promise<boolean> {
  const ontologyUrl = getOntologyUrlFromParams();
  
  if (!ontologyUrl) {
    // No URL parameter found, show modal as usual
    return false;
  }
  
  // URL parameter found, attempt to load
  try {
    await loadFromUrl(ontologyUrl);
    // Loading succeeded, don't show modal
    return true;
  } catch (err) {
    // Loading failed, show modal to allow manual selection
    console.error('Failed to load ontology from URL parameter:', err);
    showModal();
    return true; // Still return true since we attempted loading
  }
}
