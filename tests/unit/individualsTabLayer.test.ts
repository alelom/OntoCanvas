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
/** The button next to the row of an individual. */
const row = (name: string) =>
  [...container.querySelectorAll<HTMLElement>('[data-individuals-list] li')].find((li) => li.querySelector<HTMLElement>('[data-individuals-item]')!.title === `${NS}${name}`)!.querySelector<HTMLButtonElement>('[data-individuals-show-in-graph]')!;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
});

describe('"Show in graph"', () => {
  it('is next to the row of each individual, says how many it draws, and draws the individual with its neighbours', () => {
    mount(':a a :Room ; :next :b . :b a :Room . :c a :Room .');
    expect(row('a').textContent).toBe('Show 1 (0 displayed/1 total)');
    expect(row('c').textContent).toBe('Show in graph');

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
    expect(row('h').textContent).toBe('Show 50 (0 displayed/120 total)');
    row('h').click();

    expect(row('h').textContent).toBe('Show 50 (50 displayed/120 total)');
    row('h').click();
    expect(layer.build(new Map()).nodes).toHaveLength(101);
    expect(row('h').textContent).toBe('Show 20 (100 displayed/120 total)');

    row('h').click();

    expect(layer.build(new Map()).nodes).toHaveLength(121);
    expect(row('h').textContent).toBe('All 120 displayed');
    expect(row('h').disabled).toBe(true);
  });

  it('says when the total cap cut what was asked for', () => {
    const stores = [store(links(120))];
    layer = createIndividualsLayer({ autoMax: 0, getStores: () => stores, maxTotal: 10 });
    createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({}), layer }).render(container);
    row('h').click();

    expect(drawn().textContent).toContain('10');
    expect(drawn().textContent).toMatch(/first 10/);
  });
});
