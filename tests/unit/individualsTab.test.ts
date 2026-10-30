// @vitest-environment jsdom
/**
 * The Individuals tab (#208): the individuals of the ontology and of the added data, counted per class, listed a page at a
 * time with a search, and described one at a time. Nothing is drawn or written.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { createIndividualsTab, type IndividualsTab } from '../../src/ui/sidePanel/individualsTab';
import { createDataSources } from '../../src/sparql/dataSources';
import { createDataLoader } from '../../src/sparql/dataLoader';

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
let tab: IndividualsTab;

function mount(options: { pageSize?: number; classLabel?: (iri: string) => string | null } = {}): void {
  tab = createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({ '': NS }), getClassLabel: options.classLabel, pageSize: options.pageSize ?? 50 });
  tab.render(container);
}

const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const toggles = () => [...container.querySelectorAll<HTMLButtonElement>('[data-individuals-group-toggle]')];
/** The title of each group: its type's name or label, and how many individuals. */
const groupTitles = () => toggles().map((t) => t.querySelector('.individuals-group-title')!.textContent);
const rows = () => [...container.querySelectorAll('[data-individuals-list] li:not([data-individuals-group]):not(.individuals-more-rows)')].map((li) => li.textContent ?? '');
const range = () => q('[data-individuals-range]').textContent;
/** The groups are closed until opened: opens every one that is closed. */
const openAll = () => container.querySelectorAll<HTMLElement>('[data-individuals-group-toggle][aria-expanded="false"]').forEach((t) => t.click());
/** Opens the group of a type. */
const openGroup = (classIri: string) => container.querySelector<HTMLButtonElement>(`[data-individuals-group="${classIri}"] [data-individuals-group-toggle]`)!.click();

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  stores = [ONTOLOGY, store(':room101 a :Room ; rdfs:label "Room 101" ; :hasPart :wall1 . :wall1 a :Wall ; rdfs:label "North wall" . :wall2 a :Wall .')];
});
afterEach(() => vi.useRealTimers());

describe('the groups', () => {
  it('has a row for each type with how many individuals it has, the bigger first, by prefixed name when the type has no label', () => {
    mount();

    expect(groupTitles()).toEqual([':Wall (2)', ':Room (1)']);
  });

  it('names a type by its label in the graph when it has one', () => {
    mount({ classLabel: (iri) => (iri === NS + 'Room' ? 'Chamber' : null) });

    expect(groupTitles()).toEqual([':Wall (2)', 'Chamber (1)']);
  });

  it('has a row for the individuals that have no class, last', () => {
    stores = [...stores, store(':loose a owl:NamedIndividual .')];
    mount();

    expect(groupTitles()).toEqual([':Wall (2)', ':Room (1)', 'No class (1)']);
  });
});

describe('the list', () => {
  it('lists the individuals of a group, by label, with their prefixed names, when it is opened', () => {
    mount();

    openGroup(NS + 'Wall');

    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toContain('North wall');
    expect(rows()[0]).toContain(':wall1');
    expect(rows()[1]).toContain(':wall2');
  });

  it('says how many individuals there are and in how many groups', () => {
    mount();

    expect(range()).toMatch(/3 in 2 groups/);
  });

  it('has the groups closed, each with its header, until one is opened, and closes it again', () => {
    mount();
    expect(toggles().map((t) => t.textContent)).toEqual(['▸:Wall (2)', '▸:Room (1)']);
    expect(rows()).toEqual([]);

    toggles()[0].click();
    expect(toggles()[0].getAttribute('aria-expanded')).toBe('true');
    expect(rows()).toHaveLength(2);

    toggles()[0].click();
    expect(rows()).toEqual([]);
  });

  it('lists a group a page of rows at a time, with a row to list more', () => {
    stores = [ONTOLOGY, store(people(5))];
    mount({ pageSize: 2 });
    toggles()[0].click();
    expect(rows()).toHaveLength(2);
    expect(q('[data-individuals-more-rows]').textContent).toBe('Show 2 more rows (2 of 5)');

    q<HTMLButtonElement>('[data-individuals-more-rows]').click();
    expect(rows()).toHaveLength(4);
    expect(q('[data-individuals-more-rows]').textContent).toBe('Show 1 more rows (4 of 5)');

    q<HTMLButtonElement>('[data-individuals-more-rows]').click();
    expect(rows()).toHaveLength(5);
    expect(container.querySelector('[data-individuals-more-rows]')).toBeNull();
  });

  it('filters by what is typed, after a short pause, and opens the groups that have a match', () => {
    vi.useFakeTimers();
    stores = [ONTOLOGY, store(people(5))];
    mount({ pageSize: 2 });

    const input = q<HTMLInputElement>('[data-individuals-search]');
    input.value = 'room 03';
    input.dispatchEvent(new Event('input'));
    expect(rows()).toEqual([]);
    vi.advanceTimersByTime(400);

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain('Room 03');
    expect(range()).toMatch(/1 matching in 1 group/);
  });

  it('says what the filter is for', () => {
    mount();

    expect(q<HTMLInputElement>('[data-individuals-search]').placeholder).toBe('Filter individuals by label or name');
    expect(container.querySelector('[data-individuals-class]')).toBeNull();
  });

  it('says so when nothing matches the search', () => {
    vi.useFakeTimers();
    mount();

    const input = q<HTMLInputElement>('[data-individuals-search]');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(400);

    expect(rows()).toEqual([]);
    expect(q('[data-individuals-empty]').textContent).toMatch(/No individual matches/);
  });
});

describe('adding individuals in the tab (#211)', () => {
  const withSources = () => {
    const dataSources = createDataSources();
    const dataLoader = createDataLoader({ sources: dataSources, getStore: () => ONTOLOGY, confirm: async () => true });
    tab = createIndividualsTab({ getStores: () => [...stores, ...dataSources.stores()], getPrefixes: () => ({ '': NS }), dataSources, dataLoader });
    tab.render(container);
    dataSources.onChange(() => tab.refresh());
    return { dataSources, dataLoader };
  };

  it('has the controls to add a file or a URL above the list, where an empty tab shows them as its call to action', () => {
    stores = [ONTOLOGY];
    withSources();

    expect(q('[data-add-file]')).not.toBeNull();
    expect(q('[data-add-url-input]')).not.toBeNull();
    expect(q('[data-individuals-empty]').textContent).toMatch(/Add a file or a URL above/);
    expect(q<HTMLElement>('[data-individuals-controls]').hidden).toBe(true);
  });

  it('lists what was added, in the tab, and its individuals appear', async () => {
    stores = [ONTOLOGY];
    const { dataSources } = withSources();

    await dataSources.addText('people.ttl', PREFIXES + ':alice a :Room ; rdfs:label "Alice" .', { path: 'people.ttl' });
    openAll();

    expect(q('[data-data-list]').textContent).toContain('people.ttl');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain('Alice');
  });

  it('has no such controls when no data sources are given (a tab for the ontology alone), and says to open a file that has individuals', () => {
    stores = [ONTOLOGY];
    mount();

    expect(container.querySelector('[data-add-file]')).toBeNull();
    expect(q('[data-individuals-empty]').textContent).toMatch(/Open a file that has them/);
  });
});

describe('with no individuals', () => {
  it('says where they can come from (without the controls to add them), and has no list', () => {
    stores = [ONTOLOGY];
    mount();

    expect(q('[data-individuals-empty]').textContent).toMatch(/no individuals.*open a file that has them/i);
    expect(rows()).toEqual([]);
    expect(q<HTMLElement>('[data-individuals-controls]').hidden).toBe(true);
  });
});

describe('the detail', () => {
  const click = (name: string) => {
    openAll();
    [...container.querySelectorAll<HTMLElement>('[data-individuals-list] li button[data-individuals-item]')].find((b) => b.textContent!.includes(name))!.click();
  };
  const detail = () => q('[data-individuals-detail]').textContent ?? '';

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

    expect(q('[data-individuals-incoming]').textContent).toContain(':room101');
    expect(q('[data-individuals-incoming]').textContent).toContain(':hasPart');
  });

  it('follows a link to another individual', () => {
    mount();
    click('Room 101');

    q<HTMLButtonElement>('[data-individuals-outgoing] [data-individuals-follow]').click();

    expect(q('[data-individuals-detail] h4').textContent).toContain('North wall');
  });

  it('shows a literal with its datatype or language, not as a link', () => {
    stores = [ONTOLOGY, store(':a a :Room ; rdfs:label "A" ; :height "2.5"^^<http://www.w3.org/2001/XMLSchema#decimal> ; :note "hello"@en .')];
    mount();

    click('A');

    expect(q('[data-individuals-outgoing]').textContent).toContain('"2.5"^^xsd:decimal');
    expect(q('[data-individuals-outgoing]').textContent).toContain('"hello"@en');
    expect(container.querySelectorAll('[data-individuals-outgoing] [data-individuals-follow]')).toHaveLength(0);
  });

  it('says how many more rows there are than it shows', () => {
    stores = [ONTOLOGY, store(':hub a :Room ; rdfs:label "Hub" .\n' + Array.from({ length: 120 }, (_, i) => `:hub :link :n${i} . :n${i} a :Wall .`).join('\n'))];
    mount();

    click('Hub');

    expect(q('[data-individuals-outgoing]').textContent).toMatch(/and 20 more/);
  });

  it('shows nothing until an individual is chosen', () => {
    mount();

    expect(q<HTMLElement>('[data-individuals-detail]').hidden).toBe(true);
  });
});

describe('refresh', () => {
  it('recounts when the data changes, and drops a detail whose individual is gone', () => {
    mount();
    openAll();
    [...container.querySelectorAll<HTMLElement>('[data-individuals-list] li button[data-individuals-item]')].find((b) => b.textContent!.includes('North wall'))!.click();

    stores = [ONTOLOGY];
    tab.refresh();

    expect(groupTitles()).toEqual([]);
    expect(q<HTMLElement>('[data-individuals-detail]').hidden).toBe(true);
    expect(q('[data-individuals-empty]').textContent).toMatch(/no individuals/i);
  });

  it('does nothing before the tab is drawn', () => {
    const early = createIndividualsTab({ getStores: () => stores, getPrefixes: () => ({}) });

    expect(() => early.refresh()).not.toThrow();
  });
});

describe('where the individuals come from', () => {
  const origin = () => container.querySelector<HTMLElement>('[data-individuals-origin]')!;
  const mountWith = (getOntologySource: () => { name: string; title?: string } | null, withData = false) => {
    const sources = createDataSources();
    tab = createIndividualsTab({
      getStores: () => stores,
      getPrefixes: () => ({ '': NS }),
      getOntologySource,
      ...(withData ? { dataSources: sources, dataLoader: createDataLoader({ sources, getStore: () => ONTOLOGY, confirm: async () => true }) } : {}),
    });
    tab.render(container);
  };

  it('names the ontology file when it holds individuals itself, with how many', () => {
    stores = [store(':Room a owl:Class . :r1 a :Room . :r2 a :Room .')];
    mountWith(() => ({ name: 'building.ttl', title: 'https://example.org/building.ttl' }));

    expect(origin().hidden).toBe(false);
    expect(origin().textContent).toContain('2 individuals');
    expect(origin().textContent).toContain('building.ttl');
    expect(origin().title).toBe('https://example.org/building.ttl');
  });

  it('counts only the ontology file\'s own individuals, not those of data added to it', () => {
    stores = [store(':Room a owl:Class . :r1 a :Room .'), store(':r2 a :Room . :r3 a :Room .')];
    mountWith(() => ({ name: 'building.ttl' }), true);

    expect(origin().textContent).toContain('1 individual from');
    expect(origin().textContent).not.toContain('1 individuals');
  });

  it('is not there when the ontology file holds none (they all come from added data), or when its name is not known', () => {
    stores = [ONTOLOGY, store(':r1 a :Room .')];
    mountWith(() => ({ name: 'building.ttl' }), true);
    expect(origin().hidden).toBe(true);

    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    stores = [store(':Room a owl:Class . :r1 a :Room .')];
    mountWith(() => null);
    expect(origin().hidden).toBe(true);
  });

  it('follows another ontology being opened', () => {
    let name = 'one.ttl';
    stores = [store(':r1 a :Room .')];
    mountWith(() => ({ name }));
    expect(origin().textContent).toContain('one.ttl');

    name = 'two.ttl';
    stores = [store(':Room a owl:Class .')];
    tab.refresh();

    expect(origin().hidden).toBe(true);
  });
});
