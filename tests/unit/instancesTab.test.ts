// @vitest-environment jsdom
/**
 * The Instances tab (#208): the individuals of the ontology and of the added data, counted per class, listed a page at a
 * time with a search, and described one at a time. Nothing is drawn or written.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { createInstancesTab, type InstancesTab } from '../../src/ui/sidePanel/instancesTab';

const NS = 'http://example.org/d#';
const PREFIXES = `
@prefix : <${NS}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
`;
const store = (turtle: string) => new Store(new Parser().parse(PREFIXES + turtle));

const ONTOLOGY = store(':Room a owl:Class . :Wall a owl:Class . :hasPart a owl:ObjectProperty .');
const people = (n: number) => Array.from({ length: n }, (_, i) => `:room${String(i).padStart(2, '0')} a :Room ; rdfs:label "Room ${String(i).padStart(2, '0')}" .`).join('\n');

let container: HTMLElement;
let stores: Store[];
let tab: InstancesTab;

function mount(options: { pageSize?: number; classLabel?: (iri: string) => string | null } = {}): void {
  tab = createInstancesTab({ getStores: () => stores, getPrefixes: () => ({ '': NS }), getClassLabel: options.classLabel, pageSize: options.pageSize ?? 50 });
  tab.render(container);
}

const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const classOptions = () => [...container.querySelectorAll<HTMLOptionElement>('[data-instances-class] option')].map((o) => o.textContent);
const rows = () => [...container.querySelectorAll('[data-instances-list] li')].map((li) => li.textContent ?? '');
const range = () => q('[data-instances-range]').textContent;
const choose = (value: string) => {
  const select = q<HTMLSelectElement>('[data-instances-class]');
  select.value = value;
  select.dispatchEvent(new Event('change'));
};

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  stores = [ONTOLOGY, store(':room101 a :Room ; rdfs:label "Room 101" ; :hasPart :wall1 . :wall1 a :Wall ; rdfs:label "North wall" . :wall2 a :Wall .')];
});
afterEach(() => vi.useRealTimers());

describe('the class selector', () => {
  it('offers every individual first, then each class with its count, most first, by prefixed name when it has no label', () => {
    mount();

    expect(classOptions()).toEqual(['All (3)', ':Wall (2)', ':Room (1)']);
  });

  it('names a class by its label in the graph when it has one', () => {
    mount({ classLabel: (iri) => (iri === NS + 'Room' ? 'Chamber' : null) });

    expect(classOptions()).toEqual(['All (3)', ':Wall (2)', 'Chamber (1)']);
  });

  it('offers the individuals that have no class as such', () => {
    stores = [...stores, store(':loose a owl:NamedIndividual .')];
    mount();

    expect(classOptions()).toContain('No class (1)');
  });
});

describe('the list', () => {
  it('lists the individuals of the class chosen, by label, with their prefixed names', () => {
    mount();

    choose(NS + 'Wall');

    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toContain('North wall');
    expect(rows()[0]).toContain(':wall1');
    expect(rows()[1]).toContain(':wall2');
  });

  it('says which of how many it shows', () => {
    mount();

    expect(range()).toMatch(/1.*3 of 3/);
  });

  it('pages with Previous and Next, and says when it is on the first or last page', () => {
    stores = [ONTOLOGY, store(people(5))];
    mount({ pageSize: 2 });
    expect(rows()).toHaveLength(2);
    expect(q<HTMLButtonElement>('[data-instances-prev]').disabled).toBe(true);
    expect(range()).toMatch(/1.*2 of 5/);

    q<HTMLButtonElement>('[data-instances-next]').click();
    expect(rows()[0]).toContain('Room 02');
    expect(range()).toMatch(/3.*4 of 5/);

    q<HTMLButtonElement>('[data-instances-next]').click();
    expect(rows()).toHaveLength(1);
    expect(q<HTMLButtonElement>('[data-instances-next]').disabled).toBe(true);
    expect(range()).toMatch(/5.*5 of 5/);

    q<HTMLButtonElement>('[data-instances-prev]').click();
    expect(rows()[0]).toContain('Room 02');
  });

  it('goes back to the first page when the class changes', () => {
    stores = [ONTOLOGY, store(people(5) + '\n:wall1 a :Wall . :wall2 a :Wall . :wall3 a :Wall .')];
    mount({ pageSize: 2 });
    q<HTMLButtonElement>('[data-instances-next]').click();

    choose(NS + 'Wall');

    expect(range()).toMatch(/1.*2 of 3/);
  });

  it('filters by what is typed, after a short pause, and starts again from the first page', () => {
    vi.useFakeTimers();
    stores = [ONTOLOGY, store(people(5))];
    mount({ pageSize: 2 });
    q<HTMLButtonElement>('[data-instances-next]').click();

    const input = q<HTMLInputElement>('[data-instances-search]');
    input.value = 'room 03';
    input.dispatchEvent(new Event('input'));
    expect(rows()).toHaveLength(2);
    vi.advanceTimersByTime(400);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain('Room 03');
    expect(range()).toMatch(/1.*1 of 1/);
  });

  it('says so when nothing matches the search', () => {
    vi.useFakeTimers();
    mount();

    const input = q<HTMLInputElement>('[data-instances-search]');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);

    expect(rows()).toEqual([]);
    expect(q('[data-instances-empty]').textContent).toMatch(/No individual matches/);
  });
});

describe('with no individuals', () => {
  it('says where they can come from, and has no list', () => {
    stores = [ONTOLOGY];
    mount();

    expect(q('[data-instances-empty]').textContent).toMatch(/no individuals.*add a data file/i);
    expect(rows()).toEqual([]);
    expect(q<HTMLElement>('[data-instances-controls]').hidden).toBe(true);
  });
});

describe('the detail', () => {
  const click = (name: string) => [...container.querySelectorAll<HTMLElement>('[data-instances-list] li button')].find((b) => b.textContent!.includes(name))!.click();
  const detail = () => q('[data-instances-detail]').textContent ?? '';

  it('shows an individual\'s IRI, label, class and what it points to', () => {
    mount();

    click('Room 101');

    expect(detail()).toContain(NS + 'room101');
    expect(detail()).toContain('Room 101');
    expect(detail()).toContain(':Room');
    expect(detail()).toContain(':hasPart');
    expect(detail()).toContain(':wall1');
  });

  it('shows what points to it', () => {
    mount();

    click('North wall');

    expect(q('[data-instances-incoming]').textContent).toContain(':room101');
    expect(q('[data-instances-incoming]').textContent).toContain(':hasPart');
  });

  it('follows a link to another individual', () => {
    mount();
    click('Room 101');

    q<HTMLButtonElement>('[data-instances-outgoing] [data-instances-follow]').click();

    expect(q('[data-instances-detail] h4').textContent).toContain('North wall');
  });

  it('shows a literal with its datatype or language, not as a link', () => {
    stores = [ONTOLOGY, store(':a a :Room ; rdfs:label "A" ; :height "2.5"^^<http://www.w3.org/2001/XMLSchema#decimal> ; :note "hello"@en .')];
    mount();

    click('A');

    expect(q('[data-instances-outgoing]').textContent).toContain('"2.5"^^xsd:decimal');
    expect(q('[data-instances-outgoing]').textContent).toContain('"hello"@en');
    expect(container.querySelectorAll('[data-instances-outgoing] [data-instances-follow]')).toHaveLength(0);
  });

  it('says how many more rows there are than it shows', () => {
    stores = [ONTOLOGY, store(':hub a :Room ; rdfs:label "Hub" .\n' + Array.from({ length: 120 }, (_, i) => `:hub :link :n${i} . :n${i} a :Wall .`).join('\n'))];
    mount();

    click('Hub');

    expect(q('[data-instances-outgoing]').textContent).toMatch(/and 20 more/);
  });

  it('shows nothing until an individual is chosen', () => {
    mount();

    expect(q<HTMLElement>('[data-instances-detail]').hidden).toBe(true);
  });
});

describe('refresh', () => {
  it('recounts when the data changes, and drops a detail whose individual is gone', () => {
    mount();
    [...container.querySelectorAll<HTMLElement>('[data-instances-list] li button')].find((b) => b.textContent!.includes('North wall'))!.click();

    stores = [ONTOLOGY];
    tab.refresh();

    expect(classOptions()).toEqual(['All (0)']);
    expect(q<HTMLElement>('[data-instances-detail]').hidden).toBe(true);
    expect(q('[data-instances-empty]').textContent).toMatch(/no individuals/i);
  });

  it('keeps the class chosen while it still has individuals, and falls back to all when it has none', () => {
    mount();
    choose(NS + 'Wall');

    stores = [...stores, store(':wall3 a :Wall .')];
    tab.refresh();
    expect(q<HTMLSelectElement>('[data-instances-class]').value).toBe(NS + 'Wall');
    expect(rows()).toHaveLength(3);

    stores = [ONTOLOGY, store(':room101 a :Room .')];
    tab.refresh();
    expect(q<HTMLSelectElement>('[data-instances-class]').value).toBe('');
  });

  it('does nothing before the tab is drawn', () => {
    const early = createInstancesTab({ getStores: () => stores, getPrefixes: () => ({}) });

    expect(() => early.refresh()).not.toThrow();
  });
});
