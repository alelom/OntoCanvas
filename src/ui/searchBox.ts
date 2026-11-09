/**
 * Emptying the search box after a pick (#217, #214): the pick draws, and that draw redraws the graph keeping the view.
 * An input event would redraw it first without keeping the view, so the box says it was emptied with its own event,
 * for the search bar's highlight only (#242 review).
 */
export const SEARCH_CLEARED = 'search-cleared';

export function clearSearchBox(): void {
  const input = document.getElementById('searchQuery') as HTMLInputElement | null;
  if (!input?.value) return;
  input.value = '';
  input.dispatchEvent(new Event(SEARCH_CLEARED));
}
