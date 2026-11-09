/**
 * The search box of the graph finds individuals that are not drawn (#217): an "Individuals" group after the classes and
 * relationships of its suggestions, capped, saying how many more match. Picking one empties the search (it was the way to find
 * it), draws it alone (or, with the row's second action, with its neighbours), selects it, brings it into view and opens its
 * card (#229). At the limit of the graph it only opens the card, and says so.
 *
 * A relationship's name offers its instances (#214): a second action on its suggestion draws them, and while the bottom bar's
 * choice is "instances" picking the name does. The matching is the Individuals tab's (the index's `list`), on a lookup built
 * once per change of the data.
 */
import { limitPhrase, limitTitle, type IndividualsLayer } from '../abox/individualsLayer';
import { atLimit } from './sidePanel/individualCard';
import { getRelationshipNameMode } from './relationshipNameMode';

export interface IndividualSearchProvider {
  /** The individuals whose label or name holds `query`, by label: the first `limit` of them, and how many there are. */
  find(query: string, limit: number): { items: Array<{ iri: string; label: string | null }>; total: number };
  /** An IRI as a prefixed name, for an individual with no label. */
  nameOf(iri: string): string;
  layer: IndividualsLayer;
  /** Opens the card of the individual. */
  open(iri: string): void;
}

/** What a pick does to the search box: empty it, and close the suggestions. */
export interface SuggestionControls {
  /** Empties the search box without redrawing: the draw that follows redraws, keeping the view (#242 review). */
  clearSearch: () => void;
  close: () => void;
  /** Redraws the graph keeping the view: the emptied search, when the pick draws nothing. */
  redraw: () => void;
}

export const MAX_INDIVIDUAL_SUGGESTIONS = 10;

let provider: IndividualSearchProvider | null = null;

/** Set once the side panel has the individuals; null with none (an embedded view). */
export function setIndividualSearchProvider(next: IndividualSearchProvider | null): void {
  provider = next;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** The heading, a row for each individual that matches (at most MAX_INDIVIDUAL_SUGGESTIONS), and how many more; nothing when none does. */
export function individualSuggestionRows(query: string, controls: SuggestionControls): HTMLElement[] {
  const search = provider;
  if (!search || !query.trim()) return [];
  const { items, total } = search.find(query, MAX_INDIVIDUAL_SUGGESTIONS);
  if (!items.length) return [];
  const { layer } = search;
  const rows = items.map(({ iri, label }) => {
    const preview = layer.preview(iri);
    const full = atLimit(preview);
    const row = element('div', 'suggestion suggestion-individual');
    row.dataset.individual = iri;
    row.title = iri;
    row.append(element('span', 'suggestion-text', label ?? search.nameOf(iri)));
    const hint = full ? `individual; limit reached: ${limitPhrase(layer.limit)}` : preview.shown ? 'individual, drawn' : 'individual';
    row.append(element('span', 'hint', ` (${hint})`));
    const pick = (neighbours: boolean): void => {
      controls.close();
      controls.clearSearch();
      if (full) controls.redraw();
      else if (neighbours) layer.showNeighbours(iri, { focus: true });
      else layer.show(iri, { focus: true });
      search.open(iri);
    };
    row.addEventListener('click', () => pick(false));
    if (!full && layer.previewNeighbours(iri).total > 0) {
      const withNeighbours = element('button', 'suggestion-action', 'with neighbours');
      withNeighbours.type = 'button';
      withNeighbours.title = 'Draw it and the individuals linked to it';
      withNeighbours.setAttribute('data-suggestion-neighbours', '');
      withNeighbours.addEventListener('click', (e) => {
        e.stopPropagation();
        pick(true);
      });
      row.append(withNeighbours);
    }
    return row;
  });
  const more = total - items.length;
  return [
    element('div', 'suggestion-group', 'Individuals'),
    ...rows,
    ...(more > 0 ? [element('div', 'suggestion-more', `${more.toLocaleString('en')} more match: filter them in the Individuals tab`)] : []),
  ];
}

function drawInstances(layer: IndividualsLayer, propertyIri: string, controls: SuggestionControls): void {
  controls.close();
  controls.clearSearch();
  layer.showRelationship(propertyIri);
}

/** On a relationship's suggestion: a button that draws its instances, when the data has some; nothing otherwise. */
export function relationshipSuggestionActions(propertyIri: string, controls: SuggestionControls): HTMLButtonElement[] {
  const layer = provider?.layer;
  if (!layer) return [];
  const preview = layer.previewRelationship(propertyIri);
  const { adds, displayed, total } = preview;
  if (total === 0) return [];
  const action = element('button', 'suggestion-action');
  action.type = 'button';
  action.setAttribute('data-suggestion-instances', '');
  if (atLimit(preview)) {
    action.textContent = 'Limit reached';
    action.title = limitTitle(layer.limit);
    action.disabled = true;
  } else if (displayed < total) {
    action.textContent = `Draw ${adds}${displayed > 0 ? ' more' : ''} instances (${displayed} displayed/${total} total)`;
    action.title = 'Draw the individuals linked by this relationship, and select those links';
  } else {
    action.textContent = `All ${total} instances displayed: select them`;
    action.title = 'Select the links between individuals of this relationship';
  }
  action.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!action.disabled) drawInstances(layer, propertyIri, controls);
  });
  return [action];
}

/**
 * A relationship's name picked (in the suggestions, or the bottom bar's list of edges): while names select the instances and the
 * data has some, draws them and selects their links, and says it took the pick; otherwise leaves it to the search (false).
 */
export function pickRelationshipName(propertyIri: string, controls: SuggestionControls): boolean {
  const layer = provider?.layer;
  if (!layer || getRelationshipNameMode() !== 'instances' || layer.previewRelationship(propertyIri).total === 0) return false;
  drawInstances(layer, propertyIri, controls);
  return true;
}
