/**
 * The saved queries in the Query tab (#230): a list by title, grouped by the manifest each came with; picking one puts it in the
 * editor (it does not run it). Below, where more are loaded.
 */
import type { ChecksLibrary, SavedQuery } from '../../checks/checksLibrary';
import { renderChecksLoader } from './checksLoader';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function renderSavedQueries(library: ChecksLibrary, onPick: (query: SavedQuery) => void): HTMLElement {
  const box = element('div', 'query-library');
  box.setAttribute('data-query-library', '');

  const row = element('div', 'query-history');
  const select = element('select');
  select.setAttribute('data-query-saved', '');
  select.setAttribute('aria-label', 'Saved queries');
  const clear = element('button', undefined, 'Clear');
  clear.type = 'button';
  clear.title = 'Forget the saved queries loaded';
  clear.setAttribute('data-query-saved-clear', '');
  clear.addEventListener('click', () => library.clearQueries());
  row.append(select, clear);

  const loading = element('details', 'query-library-load');
  loading.append(element('summary', undefined, 'Load saved queries…'), renderChecksLoader(library, { label: 'From' }));

  function draw(): void {
    const queries = library.queries();
    row.hidden = queries.length === 0;
    const placeholder = element('option', undefined, `Saved queries (${queries.length})`);
    placeholder.value = '';
    // Grouped by the manifest each came with, in the order they were loaded; those loaded on their own last.
    const groups = new Map<string | null, number[]>();
    queries.forEach((query, i) => groups.set(query.group, [...(groups.get(query.group) ?? []), i]));
    const option = (i: number): HTMLOptionElement => {
      const o = element('option', undefined, queries[i].title);
      o.value = String(i);
      o.title = queries[i].description ?? queries[i].source;
      return o;
    };
    const named = [...groups].filter(([group]) => group !== null);
    const children: HTMLElement[] = named.map(([group, indexes]) => {
      const optgroup = element('optgroup');
      optgroup.label = group!;
      optgroup.append(...indexes.map(option));
      return optgroup;
    });
    const loose = groups.get(null) ?? [];
    if (loose.length && named.length) {
      const optgroup = element('optgroup');
      optgroup.label = 'Files';
      optgroup.append(...loose.map(option));
      children.push(optgroup);
    } else children.push(...loose.map(option));
    select.replaceChildren(placeholder, ...children);
  }

  select.addEventListener('change', () => {
    const chosen = library.queries()[Number(select.value)];
    select.value = '';
    if (chosen) onPick(chosen);
  });
  library.onChange(draw);
  draw();
  box.append(row, loading);
  return box;
}
