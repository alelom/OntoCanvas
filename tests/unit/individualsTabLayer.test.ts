// @vitest-environment jsdom
/**
 * The Individuals tab draws into the graph (#209): a button on each row that draws that individual alone, one in its detail for
 * its neighbours, one on the header of each type, what is drawn and how to clear it. The groups are closed until opened.
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

function mount(turtle: string, options: { maxTotal?: number } = {}): void {
  const stores = [store(turtle)];
  layer = createIndividualsLayer({ autoMax: 0, getStores: () => stores, ...options });
  createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({ '': NS }), layer }).render(container);
}

const toggle = (group: string) => container.querySelector<HTMLButtonElement>(`[data-individuals-group="${NS}${group}"] [data-individuals-group-toggle]`)!;
/** The groups are closed until opened. */
const openAll = () => container.querySelectorAll<HTMLElement>('[data-individuals-group-toggle][aria-expanded="false"]').forEach((t) => t.click());
const rowItem = (name: string) => {
  openAll();
  return [...container.querySelectorAll<HTMLElement>('[data-individuals-list] li:not([data-individuals-group]):not(.individuals-more-rows)')].find(
    (li) => li.querySelector<HTMLElement>('[data-individuals-item]')!.title === `${NS}${name}`
  )!;
};
/** The button next to the row of an individual. */
const row = (name: string) => rowItem(name).querySelector<HTMLButtonElement>('[data-individuals-show-in-graph]')!;
/** Chooses an individual, to see its detail. */
const choose = (name: string) => rowItem(name).querySelector<HTMLButtonElement>('[data-individuals-item]')!.click();
const neighbours = () => q<HTMLButtonElement>('[data-individuals-show-neighbours]');

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
});

describe('the button on the row of an individual', () => {
  it('says how many it draws, draws that individual alone, and then says it is displayed', () => {
    mount(':a a :Room ; :next :b . :b a :Room . :c a :Room .');
    expect(row('a').textContent).toBe('Show 1 (0 displayed/1 total)');

    row('a').click();

    expect(layer.build(new Map()).nodes.map((n) => n.iri)).toEqual([`${NS}a`]);
    expect(row('a').textContent).toBe('All 1 displayed');
    expect(row('a').disabled).toBe(true);
    expect(row('b').textContent).toBe('Show 1 (0 displayed/1 total)');
    expect(drawn().hidden).toBe(false);
    expect(drawn().textContent).toContain('1 individual.');
  });

  it('is not there without a layer (an ontology alone)', () => {
    const stores = [store(':a a :Room .')];
    createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({}) }).render(container);
    openAll();

    expect(container.querySelector('[data-individuals-show-in-graph]')).toBeNull();
  });
});

describe('the button for the neighbours, in the detail of an individual', () => {
  it('says how many neighbours it draws, and draws them with the individual', () => {
    mount(':a a :Room ; :next :b . :b a :Room . :c a :Room .');
    choose('a');
    expect(neighbours().textContent).toBe('Show 1 neighbour (0 displayed/1 total)');

    neighbours().click();

    expect(layer.build(new Map()).nodes.map((n) => n.iri).sort()).toEqual([`${NS}a`, `${NS}b`]);
    expect(neighbours().textContent).toBe('All 1 neighbour displayed');
    expect(neighbours().disabled).toBe(true);
  });

  it('draws them a batch at a time, with how many are drawn of the total, until all are', () => {
    mount(links(120));
    choose('h');
    expect(neighbours().textContent).toBe('Show 50 neighbours (0 displayed/120 total)');

    neighbours().click();
    expect(neighbours().textContent).toBe('Show 50 more neighbours (50 displayed/120 total)');
    neighbours().click();
    expect(layer.build(new Map()).nodes).toHaveLength(101);
    expect(neighbours().textContent).toBe('Show 20 more neighbours (100 displayed/120 total)');
    neighbours().click();

    expect(layer.build(new Map()).nodes).toHaveLength(121);
    expect(neighbours().textContent).toBe('All 120 neighbours displayed');
  });

  it('is not there for an individual with no neighbours', () => {
    mount(':a a :Room . :b a :Room .');
    choose('a');

    expect(container.querySelector('[data-individuals-show-neighbours]')).toBeNull();
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

  it('says when the total cap cut what was asked for', () => {
    mount(links(120), { maxTotal: 10 });
    choose('h');
    neighbours().click();

    expect(drawn().textContent).toContain('10');
    expect(drawn().textContent).toMatch(/first 10/);
  });
});

describe('the individuals grouped by type', () => {
  const headers = () => [...container.querySelectorAll<HTMLElement>('[data-individuals-group]')];
  const titles = () => headers().map((h) => h.querySelector('.individuals-group-title')!.textContent);
  const classButton = (group: string) => headers().find((h) => h.dataset.individualsGroup === `${NS}${group}`)!.querySelector<HTMLButtonElement>('[data-individuals-show-class]')!;

  it('has a closed header row for each type, whatever the size of the others, the bigger type first, with no rows until one is opened', () => {
    mount(links(120));

    expect(titles()).toEqual([':Person (120)', ':Room (1)']);
    expect(container.querySelectorAll('[data-individuals-item]')).toHaveLength(0);

    toggle('Room').click();

    expect(container.querySelectorAll('[data-individuals-item]')).toHaveLength(1);
  });

  it('has a button on the header that says how many it draws and how many are drawn of the total, until all are', () => {
    mount(links(120));
    expect(classButton('Person').textContent).toBe('Show 50 (0 displayed/120 total)');

    classButton('Person').click();

    expect(layer.build(new Map()).nodes).toHaveLength(50);
    expect(classButton('Person').textContent).toBe('Show 50 more (50 displayed/120 total)');
    classButton('Person').click();
    classButton('Person').click();
    expect(classButton('Person').textContent).toBe('All 120 displayed');
    expect(classButton('Person').disabled).toBe(true);
  });

  it('has no button where there is no class', () => {
    mount(':a a :Room . :loose a <http://www.w3.org/2002/07/owl#NamedIndividual> .');

    expect(titles()).toEqual([':Room (1)', 'No class (1)']);
    expect(headers()[1].querySelector('[data-individuals-show-class]')).toBeNull();
  });
});

describe('the rows after a type header is pressed', () => {
  const header = () => container.querySelector<HTMLButtonElement>('[data-individuals-group] [data-individuals-show-class]')!;

  it('say that the individuals the header drew are displayed, and mark them', () => {
    mount(':a a :Room ; :next :b . :b a :Room . :c a :Room .');
    expect(row('a').textContent).toBe('Show 1 (0 displayed/1 total)');
    expect(rowItem('a').classList.contains('individual-drawn')).toBe(false);

    header().click();

    expect(rowItem('a').classList.contains('individual-drawn')).toBe(true);
    for (const name of ['a', 'b', 'c']) {
      expect(row(name).textContent).toBe('All 1 displayed');
      expect(row(name).disabled).toBe(true);
    }
  });

  it('count only the individuals the header drew: the hub, of another type, stays to be drawn', () => {
    mount(links(120));
    header().click();

    expect(rowItem('p000').classList.contains('individual-drawn')).toBe(true);
    expect(row('p000').textContent).toBe('All 1 displayed');
    expect(row('h').textContent).toBe('Show 1 (0 displayed/1 total)');
    expect(rowItem('h').classList.contains('individual-drawn')).toBe(false);
  });
});

describe('the buttons at the total cap', () => {
  it('say the limit is reached, disabled, instead of offering more that cannot be drawn', () => {
    mount(links(120), { maxTotal: 10 });
    choose('h');
    neighbours().click();
    expect(neighbours().textContent).toBe('Limit reached');
    expect(neighbours().disabled).toBe(true);
    expect(row('p020').textContent).toBe('Limit reached');
    expect(row('p020').disabled).toBe(true);
    expect(drawn().textContent).toMatch(/Clear individuals, or filter/);
  });
});
