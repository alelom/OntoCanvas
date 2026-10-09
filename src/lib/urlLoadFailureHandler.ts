/**
 * Handles ontology URL load failures (before the editor is opened).
 * Shows the appropriate modal: CORS fallback (download + open file), a slow server (try again), or generic failure.
 */

import { CorsOrNetworkError, FetchTimeoutError } from '../externalOntologySearch';
import { showCorsFailureModal, showGenericUrlLoadFailureModal, showTimeoutFailureModal } from '../ui/urlLoadFailureModals';

export type OnOpenFileCallback = () => void | Promise<void>;

/**
 * Returns true when the error is likely due to CORS or network (browser blocked the response).
 */
export function isLikelyCorsError(err: unknown): boolean {
  return err instanceof CorsOrNetworkError;
}

/**
 * Returns true when the server did not answer within the time allowed.
 */
export function isLikelyTimeoutError(err: unknown): boolean {
  return err instanceof FetchTimeoutError;
}

/**
 * Handle a URL load failure: show the CORS modal (with download + open file), the slow-server modal, or the
 * generic failure modal.
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
  } else if (err instanceof FetchTimeoutError) {
    showTimeoutFailureModal(url, Math.round(err.timeoutMs / 1000), options.onOpenFile);
  } else {
    showGenericUrlLoadFailureModal(url, errorMessage);
  }
}
