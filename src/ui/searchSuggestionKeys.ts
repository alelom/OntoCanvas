/**
 * The keys of the search's suggestions, and closing them on a click elsewhere. Moved out of main.ts (#198), so a change to them
 * selects the search tests, not every E2E area.
 */
export function attachSearchSuggestionKeys(): void {
  document.addEventListener('keydown', (e) => {
    const list = document.getElementById('searchAutocomplete');
    if (!list?.classList.contains('visible')) return;
    const items = list.querySelectorAll('.suggestion');
    let idx = parseInt(list.dataset.highlight || '-1', 10);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
      list.dataset.highlight = String(idx);
      items.forEach((el, i) => el.classList.toggle('highlight', i === idx));
      if (idx >= 0 && items[idx]) items[idx].scrollIntoView?.({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, -1);
      list.dataset.highlight = String(idx);
      items.forEach((el, i) => el.classList.toggle('highlight', i === idx));
    } else if (e.key === 'Enter' && idx >= 0 && items[idx]) {
      // Enter does what a click does: a class or a relationship is searched for, an individual drawn and opened (#217).
      e.preventDefault();
      (items[idx] as HTMLElement).click();
    } else if (e.key === 'Escape') {
      list.classList.remove('visible');
    }
  });

  document.addEventListener('click', (e) => {
    const input = document.getElementById('searchQuery');
    const list = document.getElementById('searchAutocomplete');
    if (input && list && !input.contains(e.target as Node) && !list.contains(e.target as Node)) {
      list.classList.remove('visible');
    }
  });
}
