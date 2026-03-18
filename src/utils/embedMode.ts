/**
 * Embed mode: when the app runs inside an iframe, the top menu bar can be hidden
 * unless the URL has showMenuInEmbedded=1 (or another truthy value).
 */

/**
 * Pure function: should the top menu be shown given embed state and URL search string?
 * Used for unit testing; the app uses getShouldShowTopMenu() which reads window.
 *
 * @param isEmbedded - true when window.self !== window.top
 * @param searchQuery - window.location.search (e.g. '' or '?showMenuInEmbedded=1')
 * @returns true to show the top menu, false to hide it
 */
export function shouldShowTopMenuInEmbedMode(
  isEmbedded: boolean,
  searchQuery: string
): boolean {
  if (!isEmbedded) {
    return true;
  }
  const params = new URLSearchParams(searchQuery);
  const value = params.get('showMenuInEmbedded');
  if (value === null) {
    return false;
  }
  const normalized = value.toLowerCase().trim();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

/**
 * Reads window and returns whether the top menu should be shown.
 * When not in an iframe, always true. When in an iframe, true only if
 * showMenuInEmbedded is set to a truthy value in the URL.
 */
export function getShouldShowTopMenu(): boolean {
  const isEmbedded = window.self !== window.top;
  return shouldShowTopMenuInEmbedMode(isEmbedded, window.location.search);
}
