/**
 * The search box's suggestions, and refreshing the property menus.
 * Moved out of main.ts (#175).
 */
import { buildSearchSuggestions } from '../lib/searchSuggestions';
import { actions } from '../state/actions';
import { canvasState } from '../state/appState';
import { initAnnotationPropsMenu } from './annotationPropertiesMenu';
import { getAnnotationPropsMenuDeps } from './annotationPropertyModal';
import { initEdgeStylesMenu } from './relationshipTypeModal';

/** Re-render the property menus after the declarations of the imports were merged in (#104). The edge
 * styles already set are kept; the annotation menu keeps its own. */
export function refreshPropertyMenus(): void {
  const edgeStylesContent = document.getElementById('edgeStylesContent');
  if (edgeStylesContent) initEdgeStylesMenu(edgeStylesContent, actions.applyFilter, { preserveStyles: true });
  const dataPropsContent = document.getElementById('dataPropsContent');
  if (dataPropsContent) actions.initDataPropsMenu(dataPropsContent);
  const annotationPropsContent = document.getElementById('annotationPropsContent');
  if (annotationPropsContent) initAnnotationPropsMenu(annotationPropsContent, getAnnotationPropsMenuDeps());
}

export function updateSearchAutocomplete(): void {
  const input = document.getElementById('searchQuery') as HTMLInputElement;
  const list = document.getElementById('searchAutocomplete')!;
  const query = (input?.value || '').trim();
  const q = query.toLowerCase();
  if (q.length < 1) {
    list.innerHTML = '';
    list.classList.remove('visible');
    return;
  }
  // Relationships, classes and data properties as drawn by the last render, shown by prefixed name
  // (foaf:member) with the full IRI as a tooltip (#81).
  const suggestions = buildSearchSuggestions(query, canvasState.searchSuggestionSources);
  list.innerHTML = '';
  list.classList.remove('visible');
  list.dataset.highlight = '-1';
  suggestions.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'suggestion';
    div.dataset.value = s.value;
    div.title = s.title;
    // Built with textContent: labels come from the loaded ontology and must not be read as HTML.
    div.textContent = s.display;
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = `(${s.hint})`;
    div.appendChild(hint);
    div.addEventListener('click', () => {
      input.value = s.value;
      list.classList.remove('visible');
      actions.applyFilter();
    });
    list.appendChild(div);
  });
  list.classList.add('visible');
}
