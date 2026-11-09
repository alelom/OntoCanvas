// @vitest-environment jsdom
/**
 * The record card of an individual (#229), in the Individuals tab: everything known of it on one panel. Its classes, its
 * properties with repeated ones grouped, what refers to it (collapsed, with counts), the named graph of each statement when
 * there are several, back and forward between cards, "Draw in graph" and "Copy IRI".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { createIndividualsTab, type IndividualsTab } from '../../src/ui/sidePanel/individualsTab';
import { createIndividualsLayer, type IndividualsLayer, type LayerChange } from '../../src/abox/individualsLayer';

const NS = 'http://example.org/d#';
const trig = (text: string) => new Store(new Parser({ format: 'application/trig' }).parse(`@prefix : <${NS}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n${text}`));

let container: HTMLElement;
let tab: IndividualsTab;
let layer: IndividualsLayer;
const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector);
const card = () => q('[data-individuals-detail]')!;
const heading = () => card().querySelector('h4')!.textContent;

function mount(stores: Store[], options: { maxTotal?: number } = {}): void {
  layer = createIndividualsLayer({ autoMax: 0, getStores: () => stores, ...options });
  tab = createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({ '': NS }), layer });
  tab.render(container);
}

/** Two graphs: :room1 has a label, two values of :tag and a link, in g1; :wall1 refers to it from g2, :wall2 from g1. */
const TWO_GRAPHS = trig(`
:g1 { :room1 a :Room ; rdfs:label "Room 1" ; :tag "a" , "b" ; :hasPart :wall1 . :wall2 :partOf :room1 . :wall2 a :Wall . }
:g2 { :wall1 a :Wall ; rdfs:label "North wall" ; :partOf :room1 . }`);

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
});

describe('show(iri): the card of an individual, opened from outside the tab (#217)', () => {
  it('shows the card of the individual', () => {
    mount([TWO_GRAPHS]);

    tab.show(NS + 'room1');

    expect(card().hidden).toBe(false);
    expect(heading()).toBe('Room 1');
  });
});

describe('the header', () => {
  it('names an individual with no label by its prefixed name, with its IRI below', () => {
    mount([TWO_GRAPHS]);

    tab.show(NS + 'wall2');

    expect(heading()).toBe(':wall2');
    expect(q('[data-individuals-iri]')!.textContent).toBe(NS + 'wall2');
  });

  it('copies the IRI', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mount([TWO_GRAPHS]);
    tab.show(NS + 'room1');

    q<HTMLButtonElement>('[data-individuals-copy-iri]')!.click();
    await vi.waitFor(() => expect(q('[data-individuals-copy-iri]')!.textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith(NS + 'room1');
  });

  it('copies the IRI without the Clipboard API, and says so when it cannot (#242 review)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    mount([TWO_GRAPHS]);
    tab.show(NS + 'room1');
    const copy = () => q<HTMLButtonElement>('[data-individuals-copy-iri]')!;

    copy().click();
    await vi.waitFor(() => expect(copy().textContent).toBe('Copied'));
    expect(execCommand).toHaveBeenCalledWith('copy');

    execCommand.mockReturnValue(false);
    tab.show(NS + 'wall2');
    copy().click();
    await vi.waitFor(() => expect(copy().textContent).toBe('Copy failed'));
  });

  it('does not leave a rejected copy unhandled', async () => {
    const writeText = vi.fn(async () => Promise.reject(new Error('denied')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(document, 'execCommand', { value: vi.fn(() => true), configurable: true });
    mount([TWO_GRAPHS]);
    tab.show(NS + 'room1');

    q<HTMLButtonElement>('[data-individuals-copy-iri]')!.click();

    await vi.waitFor(() => expect(q('[data-individuals-copy-iri]')!.textContent).toBe('Copied'));
  });
});

describe('the properties', () => {
  it('has one row for each property, with every value of a repeated one in it', () => {
    mount([TWO_GRAPHS]);

    tab.show(NS + 'room1');

    const rows = [...container.querySelectorAll('[data-individuals-outgoing] [data-individuals-property]')];
    expect(rows.map((r) => r.querySelector('.individual-predicate')!.textContent)).toEqual([':hasPart', ':tag']);
    expect(rows[1].querySelectorAll('[data-individuals-value]')).toHaveLength(2);
  });

  it('says the named graph of each statement when they come from several', () => {
    mount([TWO_GRAPHS]);

    tab.show(NS + 'wall1');

    // Its own statements are all in g2, and the one that refers to it is in g1: two graphs.
    const graphs = [...container.querySelectorAll('[data-individuals-detail] [data-individuals-graph]')].map((g) => g.textContent);
    expect(graphs).toContain(':g2');
    expect(graphs).toContain(':g1');
  });

  it('says no graph when every statement is in the same one', () => {
    mount([trig(':a a :Room ; :next :b . :b a :Room .')]);

    tab.show(NS + 'a');

    expect(container.querySelector('[data-individuals-detail] [data-individuals-graph]')).toBeNull();
  });
});

describe('what refers to it', () => {
  it('is collapsed, with how many statements, grouped by property with a count each', () => {
    mount([TWO_GRAPHS]);

    tab.show(NS + 'room1');

    const incoming = q<HTMLDetailsElement>('details[data-individuals-incoming]')!;
    expect(incoming.open).toBe(false);
    expect(incoming.querySelector('summary')!.textContent).toBe('Referenced by (2)');
    const groups = [...incoming.querySelectorAll('[data-individuals-property]')];
    expect(groups.map((g) => g.querySelector('.individual-predicate')!.textContent)).toEqual([':partOf (2)']);
  });

  it('follows only what is an individual: a blank node or a class that refers to it is shown, not followed (#242 review)', () => {
    mount([trig(':w a :Wall . :r a :Room ; :hasPart :w . :Room :example :w . [ :mentions :w ] .')]);

    tab.show(NS + 'w');

    const incoming = q('details[data-individuals-incoming]')!;
    const valueOf = (p: string) =>
      [...incoming.querySelectorAll('[data-individuals-property]')].find((g) => g.querySelector('.individual-predicate')!.textContent!.startsWith(p))!.querySelector('[data-individuals-value]')!;
    expect(valueOf(':hasPart').querySelector('[data-individuals-follow]')!.textContent).toBe(':r');
    expect(valueOf(':example').querySelector('[data-individuals-follow]')).toBeNull();
    expect(valueOf(':example').textContent).toBe(':Room');
    expect(valueOf(':mentions').querySelector('[data-individuals-follow]')).toBeNull();
    expect(valueOf(':mentions').textContent).toMatch(/^_:/);
  });
});

describe('back and forward', () => {
  it('follows a link to another card, and goes back and forward again', () => {
    mount([TWO_GRAPHS]);
    tab.show(NS + 'room1');
    const back = () => q<HTMLButtonElement>('[data-individuals-back]')!;
    const forward = () => q<HTMLButtonElement>('[data-individuals-forward]')!;
    expect(back().disabled).toBe(true);

    q<HTMLButtonElement>('[data-individuals-outgoing] [data-individuals-follow]')!.click();
    expect(heading()).toBe('North wall');

    back().click();
    expect(heading()).toBe('Room 1');
    expect(forward().disabled).toBe(false);

    forward().click();
    expect(heading()).toBe('North wall');
    expect(forward().disabled).toBe(true);
  });
});

describe('Draw in graph', () => {
  it('draws the individual, selected and brought into view, and then says it is drawn', () => {
    mount([TWO_GRAPHS]);
    const changes: LayerChange[] = [];
    layer.onChange((change) => changes.push(change));
    tab.show(NS + 'room1');

    q<HTMLButtonElement>('[data-individuals-draw]')!.click();

    expect(changes).toEqual([{ kind: 'draw', drawn: [NS + 'room1'], focus: NS + 'room1' }]);
    expect(q('[data-individuals-draw]')!.textContent).toBe('Show in graph');
  });

  it('says the limit, with its number, when the graph is full', () => {
    mount([TWO_GRAPHS], { maxTotal: 1 });
    layer.show(NS + 'wall1');
    tab.show(NS + 'room1');

    const draw = q<HTMLButtonElement>('[data-individuals-draw]')!;
    expect(draw.disabled).toBe(true);
    expect(draw.title).toMatch(/draws up to 1 individual/);
  });
});
