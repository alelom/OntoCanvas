/**
 * The search bar block in the toolbar (#85): "Search:" above the bar and a "Search options" button below
 * it, whose popup holds how results are shown (three scopes, in one column) and how names are matched
 * (Exact match, in a second column that further matching options can join). Kept out of main.ts.
 */
import { SEARCH_SCOPES, type SearchScope } from '../lib/searchHighlight';

const POPUP_STYLE =
  'position: absolute; top: 100%; left: 0; margin-top: 4px; padding: 10px 12px; background: #fff; border: 1px solid #ccc; ' +
  'border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000; display: none; white-space: nowrap;';

const SCOPE_OPTIONS: Record<SearchScope, { label: string; title: string }> = {
  highlight: {
    label: 'Highlight matches in whole graph',
    title: 'Keep the whole graph as it is and mark what the search found with a pulsing outline.',
  },
  neighbours: {
    label: 'Show matches and their neighbours',
    title: 'Show what the search found and the items directly connected to it; fade everything else.',
  },
  matches: {
    label: 'Show matches only',
    title: 'Show only what the search found; fade everything else.',
  },
};

export const DEFAULT_SEARCH_SCOPE: SearchScope = 'matches';

export function searchControlsMarkup(): string {
  const scopes = SEARCH_SCOPES.map((scope) => {
    const { label, title } = SCOPE_OPTIONS[scope];
    const checked = scope === DEFAULT_SEARCH_SCOPE ? ' checked' : '';
    return `<label title="${title}"><input type="radio" name="searchScope" value="${scope}"${checked}> ${label}</label>`;
  }).join('\n');
  return `
      <div id="searchBlock" style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Search:</strong>
        <div id="searchWrap" style="position: relative; display: inline-block;">
          <input type="text" id="searchQuery" placeholder="Node or relationship..." autocomplete="off" style="width: 180px; padding-right: 24px; box-sizing: border-box;">
          <button type="button" id="searchClearBtn" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; padding: 2px 4px; color: #666; font-size: 16px; line-height: 1; display: none; z-index: 10;" title="Clear search" onmouseover="this.style.color='#333'" onmouseout="this.style.color='#666'">×</button>
          <div id="searchAutocomplete"></div>
        </div>
        <div id="searchOptionsWrap" style="position: relative; display: inline-block; margin-top: 4px;">
          <button type="button" id="searchOptionsToggle" aria-haspopup="true" aria-expanded="false" style="cursor: pointer; font-weight: bold; font-size: 12px;">Search options</button>
          <div id="searchOptionsPopup" style="${POPUP_STYLE}">
            <div style="display: flex; gap: 16px; align-items: flex-start; font-size: 11px;">
              <div role="radiogroup" aria-label="How search shows results" style="display: flex; flex-direction: column; gap: 4px;">
                <strong style="font-size: 12px;">Show</strong>
                ${scopes}
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px;">
                <strong style="font-size: 12px;">Match</strong>
                <label title="Match whole names instead of substrings (e.g. 'hasRevision' won't match 'hasRevisionTable')">
                  <input type="checkbox" id="searchExactMatch" checked> Exact match
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>`;
}

export function getSearchScope(): SearchScope {
  const checked = document.querySelector<HTMLInputElement>('input[name="searchScope"]:checked');
  return SEARCH_SCOPES.includes(checked?.value as SearchScope) ? (checked!.value as SearchScope) : DEFAULT_SEARCH_SCOPE;
}

export function setSearchScope(scope: SearchScope): void {
  const radio = document.querySelector<HTMLInputElement>(`input[name="searchScope"][value="${scope}"]`);
  if (radio) radio.checked = true;
}

/** A button that opens `popup` below it; a click outside `wrap` closes it. */
export function attachPopover(wrap: HTMLElement, toggle: HTMLElement, popup: HTMLElement): void {
  const show = (open: boolean) => {
    popup.style.display = open ? 'block' : 'none';
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    show(popup.style.display !== 'block');
  });
  document.addEventListener('click', (e) => {
    if (popup.style.display === 'block' && !wrap.contains(e.target as Node)) show(false);
  });
}
