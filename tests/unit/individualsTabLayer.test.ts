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
  layer = createIndividualsLayer({ getStores: () => stores });
  createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({ '': NS }), layer }).render(container);
}
const open = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[data-individuals-item]')].find((b) => b.title === `${NS}${name}`)!.click();

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
});

describe('"Show in graph"', () => {
  it('is offered on the individual chosen, and draws it with its neighbours', () => {
    mount(':a a :Room ; :next :b . :b a :Room .');
    open('a');

    q<HTMLButtonElement>('[data-individuals-show-in-graph]').click();

    expect(layer.build(new Map()).nodes.map((n) => n.iri).sort()).toEqual([`${NS}a`, `${NS}b`]);
    expect(drawn().hidden).toBe(false);
    expect(drawn().textContent).toContain('2 individuals');
  });

  it('is not there without a layer (an ontology alone)', () => {
    const stores = [store(':a a :Room .')];
    createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({}) }).render(container);
    open('a');

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
    open('a');
    q<HTMLButtonElement>('[data-individuals-show-in-graph]').click();

    q<HTMLButtonElement>('[data-individuals-clear]').click();

    expect(layer.isEmpty()).toBe(true);
    expect(drawn().hidden).toBe(true);
  });

  it('offers "show more" for an individual with more neighbours than the cap, and draws them', () => {
    mount(links(120));
    open('h');
    q<HTMLButtonElement>('[data-individuals-show-in-graph]').click();

    const more = q<HTMLButtonElement>('[data-individuals-more]');
    expect(more.textContent).toContain('70');

    more.click();

    expect(layer.build(new Map()).nodes).toHaveLength(101);
    expect(q<HTMLButtonElement>('[data-individuals-more]').textContent).toContain('20');
  });

  it('says when the total cap cut what was asked for', () => {
    const stores = [store(links(120))];
    layer = createIndividualsLayer({ getStores: () => stores, maxTotal: 10 });
    createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({}), layer }).render(container);
    open('h');

    q<HTMLButtonElement>('[data-individuals-show-in-graph]').click();

    expect(drawn().textContent).toContain('10');
    expect(drawn().textContent).toMatch(/first 10/);
  });
});
