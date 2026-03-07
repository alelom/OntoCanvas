/**
 * Handles ontology URL load failures (before the editor is opened).
 * Shows the appropriate modal: CORS fallback (download + open file) or generic failure.
 */

import { CorsOrNetworkError } from '../externalOntologySearch';
import { showCorsFailureModal, showGenericUrlLoadFailureModal } from '../ui/urlLoadFailureModals';

export type OnOpenFileCallback = () => void | Promise<void>;

/**
 * Returns true when the error is likely due to CORS or network (browser blocked the response).
 */
export function isLikelyCorsError(err: unknown): boolean {
  return err instanceof CorsOrNetworkError;
}

/**
 * Handle a URL load failure: show CORS modal (with download + open file) or generic failure modal.
 * Does not use the in-editor error bar.
 */
export function handleUrlLoadFailure(
  url: string,
  err: unknown,
  options: { onOpenFile: OnOpenFileCallback }
): void {
  const errorMessage = err instanceof Error ? err.message : String(err);
  if (isLikelyCorsError(err)) {
    showCorsFailureModal(url, options.onOpenFile);
  } else {
    showGenericUrlLoadFailureModal(url, errorMessage);
  }
}
