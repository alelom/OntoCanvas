// @vitest-environment jsdom
/**
 * The search box of the graph finds individuals that are not drawn (#217): an "Individuals" group in its suggestions, capped, that
 * draws the one picked (alone, or with its neighbours), selects it and opens its card. A relationship name offers its instances,
 * or draws them, as the bottom bar's choice says (#214).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { createIndividualsLayer, type IndividualsLayer, type LayerChange } from '../../src/abox/individualsLayer';
import { createIndividualIndex } from '../../src/abox/individualIndex';
import {
  individualSuggestionRows,
  pickRelationshipName,
  relationshipSuggestionActions,
  setIndividualSearchProvider,
  MAX_INDIVIDUAL_SUGGESTIONS,
} from '../../src/ui/individualSuggestions';
import { setRelationshipNameMode } from '../../src/ui/relationshipNameMode';

const NS = 'http://example.org/d#';
const store = (ttl: string) => new Store(new Parser().parse(`@prefix : <${NS}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n${ttl}`));
const rooms = (n: number) => Array.from({ length: n }, (_, i) => `:room${String(i).padStart(2, '0')} a :Room ; rdfs:label "Room ${String(i).padStart(2, '0')}" ; :hasWall :wall${i} . :wall${i} a :Wall .`).join('\n');

let layer: IndividualsLayer;
let changes: LayerChange[];
const open = vi.fn();
const clearSearch = vi.fn();
const close = vi.fn();

function provide(ttl: string, options: { maxTotal?: number } = {}): void {
  const stores = [store(ttl)];
  const index = createIndividualIndex(stores);
  layer = createIndividualsLayer({ autoMax: 0, getStores: () => stores, ...options });
  changes = [];
  layer.onChange((change) => changes.push(change));
  setIndividualSearchProvider({
    find: (query, limit) => index.list({ search: query, offset: 0, limit }),
    nameOf: (iri) => `:${iri.slice(NS.length)}`,
    layer,
    open,
  });
}

const rows = (query: string) => individualSuggestionRows(query, { clearSearch, close });
const picks = (query: string) => rows(query).filter((r) => r.classList.contains('suggestion'));

beforeEach(() => {
  open.mockClear();
  clearSearch.mockClear();
  close.mockClear();
  setRelationshipNameMode('definition');
  setIndividualSearchProvider(null);
});

describe('the Individuals group of the suggestions', () => {
  it('is a heading and the individuals whose label or name matches, by label', () => {
    provide(rooms(3));

    const found = rows('room 0');

    expect(found[0].textContent).toBe('Individuals');
    expect(picks('room 0').map((r) => r.firstChild!.textContent)).toEqual(['Room 00', 'Room 01', 'Room 02']);
    expect(picks('room 0')[0].title).toBe(NS + 'room00');
  });

  it('names an individual with no label by its prefixed name', () => {
    provide(rooms(1));

    expect(picks('wall0').map((r) => r.firstChild!.textContent)).toEqual([':wall0']);
  });

  it('is nothing when no individual matches, or with no provider', () => {
    provide(rooms(1));
    expect(rows('nothing like it')).toEqual([]);
    setIndividualSearchProvider(null);
    expect(rows('room')).toEqual([]);
  });

  it(`shows at most ${MAX_INDIVIDUAL_SUGGESTIONS}, and says how many more match`, () => {
    provide(rooms(25));

    expect(picks('room')).toHaveLength(MAX_INDIVIDUAL_SUGGESTIONS);
    expect(rows('room').at(-1)!.textContent).toBe('15 more match: filter them in the Individuals tab');
  });
});

describe('picking an individual', () => {
  it('empties the search, draws it alone, selected and in view, and opens its card', () => {
    provide(rooms(2));

    picks('room 01')[0].click();

    expect(clearSearch).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(changes).toEqual([{ kind: 'draw', drawn: [NS + 'room01'], focus: NS + 'room01' }]);
    expect(open).toHaveBeenCalledWith(NS + 'room01');
  });

  it('draws its neighbours too with the second action of the row', () => {
    provide(rooms(2));

    picks('room 01')[0].querySelector<HTMLButtonElement>('[data-suggestion-neighbours]')!.click();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: 'draw', focus: NS + 'room01' });
    expect(changes[0].drawn.sort()).toEqual([NS + 'room01', NS + 'wall1']);
    expect(open).toHaveBeenCalledWith(NS + 'room01');
  });

  it('says the limit, with its number, and only opens the card, when the graph is full', () => {
    provide(rooms(2), { maxTotal: 1 });
    layer.show(NS + 'wall0');
    changes.length = 0;

    const row = picks('room 01')[0];
    expect(row.textContent).toContain('limit reached: the graph draws up to 1 individual');
    row.click();

    expect(changes).toEqual([]);
    expect(open).toHaveBeenCalledWith(NS + 'room01');
  });
});

describe('a relationship name (#214)', () => {
  it('offers to draw its instances, with how many there are, when the data uses it', () => {
    provide(rooms(3));

    const [action] = relationshipSuggestionActions(NS + 'hasWall', { clearSearch, close });
    expect(action.textContent).toBe('Draw 6 instances (0 displayed/6 total)');
    action.click();

    expect(changes[0]).toMatchObject({ kind: 'draw', selectEdgeType: NS + 'hasWall' });
    expect(changes[0].drawn).toHaveLength(6);
  });

  it('offers nothing for a relationship the data does not use, or with no provider', () => {
    provide(rooms(1));
    expect(relationshipSuggestionActions(NS + 'unused', { clearSearch, close })).toEqual([]);
    setIndividualSearchProvider(null);
    expect(relationshipSuggestionActions(NS + 'hasWall', { clearSearch, close })).toEqual([]);
  });

  it('is left to the search while names select the definitions', () => {
    provide(rooms(1));

    expect(pickRelationshipName(NS + 'hasWall', { clearSearch, close })).toBe(false);
    expect(changes).toEqual([]);
  });

  it('draws its instances, and their links selected, while names select the instances', () => {
    provide(rooms(1));
    setRelationshipNameMode('instances');

    expect(pickRelationshipName(NS + 'hasWall', { clearSearch, close })).toBe(true);

    expect(clearSearch).toHaveBeenCalled();
    expect(changes).toEqual([{ kind: 'draw', drawn: [NS + 'room00', NS + 'wall0'], selectEdgeType: NS + 'hasWall' }]);
  });

  it('is left to the search, in either choice, for a relationship no individual has', () => {
    provide(rooms(1));
    setRelationshipNameMode('instances');

    expect(pickRelationshipName(NS + 'unused', { clearSearch, close })).toBe(false);
  });
});
