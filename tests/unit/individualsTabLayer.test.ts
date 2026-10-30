// @vitest-environment jsdom
/**
 * The Individuals tab draws into the graph (#209): "Show in graph" on the individual chosen, what is drawn and how to clear
 * it, and "show N more" when an individual has more neighbours than the cap.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Parser, Store } from 'n3';
import { createIndividualsTab } from '../../src/ui/sidePanel/individualsTab';
import { createIndividualsLayer, type IndividualsLayer } from '../../src/abox/individualsLayer';

const NS = 'http://example.org/d#';
const store = (turtle: string) => new Store(new Parser().parse(`@prefix : <${NS}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n${turtle}`));
const links = (n: number) => ':h a :Room .\n' + Array.from({ length: n }, (_, i) => `:h :has :p${String(i).padStart(3, '0')} . :p${String(i).padStart(3, '0')} a :Person .`).join('\n');

let container: HTMLElement;
let layer: IndividualsLayer;
const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const drawn = () => q('[data-individuals-drawn]');

function mount(turtle: string): void {
  const stores = [store(turtle)];
  layer = createIndividualsLayer({ autoMax: 0, getStores: () => stores });
  createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({ '': NS }), layer }).render(container);
}
const open = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[data-individuals-item]')].find((b) => b.title === `${NS}${name}`)!.click();
/** Lists the individuals of one class only: the hub of `links` is a Room, and the 120 persons fill the first pages. */
const chooseRooms = () => {
  const select = q<HTMLSelectElement>('[data-individuals-class]');
  select.value = `${NS}Room`;
  select.dispatchEvent(new Event('change'));
};
/** The button next to the row of an individual. */
const row = (name: string) =>
  [...container.querySelectorAll<HTMLElement>('[data-individuals-list] li:not([data-individuals-group])')].find((li) => li.querySelector<HTMLElement>('[data-individuals-item]')!.title === `${NS}${name}`)!.querySelector<HTMLButtonElement>('[data-individuals-show-in-graph]')!;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
});

describe('"Show in graph"', () => {
  it('is next to the row of each individual, says how many it draws, and draws the individual with its neighbours', () => {
    mount(':a a :Room ; :next :b . :b a :Room . :c a :Room .');
    expect(row('a').textContent).toBe('Show 2 (0 displayed/2 total)');
    expect(row('c').textContent).toBe('Show 1 (0 displayed/1 total)');

    row('a').click();

    expect(layer.build(new Map()).nodes.map((n) => n.iri).sort()).toEqual([`${NS}a`, `${NS}b`]);
    expect(drawn().hidden).toBe(false);
    expect(drawn().textContent).toContain('2 individuals');
  });

  it('is not there without a layer (an ontology alone)', () => {
    const stores = [store(':a a :Room .')];
    createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({}) }).render(container);

    expect(container.querySelector('[data-individuals-show-in-graph]')).toBeNull();
  });
});

describe('what is drawn', () => {
  it('is not mentioned while nothing is drawn', () => {
    mount(':a a :Room .');

    expect(drawn().hidden).toBe(true);
  });

  it('can be cleared, and the line goes with it', () => {
    mount(':a a :Room .');
    row('a').click();

    q<HTMLButtonElement>('[data-individuals-clear]').click();

    expect(layer.isEmpty()).toBe(true);
    expect(drawn().hidden).toBe(true);
  });

  it('says how many the next click draws and how many are drawn of the total, until all are', () => {
    mount(links(120));
    chooseRooms();
    expect(row('h').textContent).toBe('Show 50 (0 displayed/121 total)');
    row('h').click();

    expect(row('h').textContent).toBe('Show 50 (50 displayed/121 total)');
    row('h').click();
    expect(layer.build(new Map()).nodes).toHaveLength(100);
    expect(row('h').textContent).toBe('Show 21 (100 displayed/121 total)');

    row('h').click();

    expect(layer.build(new Map()).nodes).toHaveLength(121);
    expect(row('h').textContent).toBe('All 121 displayed');
    expect(row('h').disabled).toBe(true);
  });

  it('says when the total cap cut what was asked for', () => {
    const stores = [store(links(120))];
    layer = createIndividualsLayer({ autoMax: 0, getStores: () => stores, maxTotal: 10 });
    createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({}), layer }).render(container);
    chooseRooms();
    row('h').click();

    expect(drawn().textContent).toContain('10');
    expect(drawn().textContent).toMatch(/first 10/);
  });
});

describe('the individuals grouped by type', () => {
  const headers = () => [...container.querySelectorAll<HTMLElement>('[data-individuals-group]')];
  const classButton = (group: string) => headers().find((h) => h.dataset.individualsGroup === `${NS}${group}`)!.querySelector<HTMLButtonElement>('[data-individuals-show-class]')!;

  it('has a header row above the individuals of each type, with how many there are, the bigger type first', () => {
    mount(links(120));

    expect(headers().map((h) => h.querySelector('.individuals-group-title')!.textContent)).toEqual([':Person (120)']);
    // The 120 persons fill the first page of 50; the one room is on the third.
    container.querySelector<HTMLButtonElement>('[data-individuals-next]')!.click();
    container.querySelector<HTMLButtonElement>('[data-individuals-next]')!.click();
    expect(headers().map((h) => h.querySelector('.individuals-group-title')!.textContent)).toEqual([':Person (120)', ':Room (1)']);
  });

  it('has a button on the header that says how many it draws and how many are drawn of the total, until all are', () => {
    mount(links(120));
    expect(classButton('Person').textContent).toBe('Show 50 (0 displayed/120 total)');

    classButton('Person').click();

    expect(layer.build(new Map()).nodes).toHaveLength(50);
    expect(classButton('Person').textContent).toBe('Show 50 (50 displayed/120 total)');
    classButton('Person').click();
    classButton('Person').click();
    expect(classButton('Person').textContent).toBe('All 120 displayed');
    expect(classButton('Person').disabled).toBe(true);
  });

  it('has one header when one class is chosen, and no button where there is no class', () => {
    mount(':a a :Room . :loose a <http://www.w3.org/2002/07/owl#NamedIndividual> .');

    const titles = headers().map((h) => h.querySelector('.individuals-group-title')!.textContent);
    expect(titles).toEqual([':Room (1)', 'No class (1)']);
    expect(headers()[1].querySelector('[data-individuals-show-class]')).toBeNull();
  });
});

describe('the rows after a type header is pressed', () => {
  const rowItem = (name: string) =>
    [...container.querySelectorAll<HTMLElement>('[data-individuals-list] li:not([data-individuals-group])')].find((li) => li.querySelector<HTMLElement>('[data-individuals-item]')!.title === `${NS}${name}`)!;
  const header = () => container.querySelector<HTMLButtonElement>('[data-individuals-group] [data-individuals-show-class]')!;

  it('say that the individuals the header drew are all displayed, with their neighbours', () => {
    mount(':a a :Room ; :next :b . :b a :Room . :c a :Room .');
    expect(row('a').textContent).toBe('Show 2 (0 displayed/2 total)');
    expect(rowItem('a').classList.contains('individual-drawn')).toBe(false);

    header().click();

    expect(rowItem('a').classList.contains('individual-drawn')).toBe(true);
    expect(row('a').textContent).toBe('All 2 displayed');
    expect(row('a').disabled).toBe(true);
    expect(row('b').textContent).toBe('All 2 displayed');
    expect(row('c').textContent).toBe('All 1 displayed');
  });

  it('count a neighbour the header drew as displayed, and mark the individuals that are drawn', () => {
    mount(links(120));
    header().click();

    // The hub is a room, not drawn by the header of the persons: each person drawn counts itself as displayed, its neighbour the hub as not.
    expect(rowItem('p000').classList.contains('individual-drawn')).toBe(true);
    expect(row('p000').textContent).toBe('Show 1 (1 displayed/2 total)');
    expect(row('p000').title).toContain('This individual is drawn');
    expect(rowItem('p049').classList.contains('individual-drawn')).toBe(true);
  });

  it('draw the next neighbours, not the ones already drawn, when the row is pressed after the header', () => {
    mount(':a a :Room ; :next :b , :c . :b a :Room . :c a :Room .');
    // Header draws the three rooms; the row of a then has nothing left to draw.
    header().click();
    expect(layer.preview(`${NS}a`)).toEqual({ shown: true, adds: 0, displayed: 3, total: 3 });
  });
});
