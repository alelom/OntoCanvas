/**
 * The individuals of the open ontology and of the data added to it (#208): counted per class, listed a page at a time,
 * described. Pure: stores in, plain objects out.
 */
import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { createIndividualIndex, NO_CLASS } from '../../src/abox/individualIndex';

const PREFIXES = `
@prefix : <http://example.org/d#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;
const NS = 'http://example.org/d#';

function store(turtle: string): Store {
  return new Store(new Parser().parse(PREFIXES + turtle));
}

const ONTOLOGY = store(`
:Room a owl:Class . :Wall a owl:Class . :Bedroom a owl:Class ; rdfs:subClassOf :Room .
:hasPart a owl:ObjectProperty .
`);
const DATA = store(`
:room101 a :Room ; rdfs:label "Room 101" ; :hasPart :wall1 , :wall2 .
:room102 a :Room , :Bedroom ; rdfs:label "Room 102"@en , "Raum 102"@de .
:wall1 a :Wall ; rdfs:label "North wall" .
:wall2 a :Wall .
:loose a owl:NamedIndividual ; rdfs:label "No class" .
`);

describe('classCounts', () => {
  it('counts the individuals of each class, most first, an individual of two classes in both', () => {
    const { total, classes } = createIndividualIndex([ONTOLOGY, DATA]).classCounts();

    expect(total).toBe(5);
    expect(classes).toEqual([
      { classIri: NS + 'Room', count: 2 },
      { classIri: NS + 'Wall', count: 2 },
      { classIri: NS + 'Bedroom', count: 1 },
    ]);
  });

  it('counts the individuals that have no class apart', () => {
    expect(createIndividualIndex([DATA]).classCounts().withoutClass).toBe(1);
  });

  it('is empty for stores that hold no individuals, as the ontology alone does', () => {
    expect(createIndividualIndex([ONTOLOGY]).classCounts()).toEqual({ total: 0, classes: [], withoutClass: 0 });
  });

  it('counts one individual once, though two stores type it', () => {
    const more = store(':room101 a :Room .');

    expect(createIndividualIndex([DATA, more]).classCounts().classes.find((c) => c.classIri === NS + 'Room')!.count).toBe(2);
  });

  it('counts an individual typed in one store with a class declared in another', () => {
    const typing = store(':stray a :Room .');

    expect(createIndividualIndex([ONTOLOGY, typing]).classCounts().classes).toEqual([{ classIri: NS + 'Room', count: 1 }]);
  });
});

describe('list', () => {
  const index = () => createIndividualIndex([ONTOLOGY, DATA]);

  it('lists every individual by label, then name, with the label it has', () => {
    const { items, total } = index().list({ offset: 0, limit: 50 });

    expect(total).toBe(5);
    // "No class", "North wall", "Room 101", "Room 102", then wall2, which has no label and goes by its name.
    expect(items.map((i) => i.iri)).toEqual([NS + 'loose', NS + 'wall1', NS + 'room101', NS + 'room102', NS + 'wall2']);
    expect(items.find((i) => i.iri === NS + 'wall2')!.label).toBeNull();
  });

  it('lists the individuals of one class', () => {
    const { items, total } = index().list({ classIri: NS + 'Wall', offset: 0, limit: 50 });

    expect(total).toBe(2);
    expect(items.map((i) => i.iri).sort()).toEqual([NS + 'wall1', NS + 'wall2']);
  });

  it('lists the individuals with no class under NO_CLASS', () => {
    expect(index().list({ classIri: NO_CLASS, offset: 0, limit: 50 }).items.map((i) => i.iri)).toEqual([NS + 'loose']);
  });

  it('pages: the total is the whole, the items a page', () => {
    const second = index().list({ offset: 2, limit: 2 });

    expect(second.total).toBe(5);
    expect(second.items).toHaveLength(2);
    expect(index().list({ offset: 4, limit: 2 }).items).toHaveLength(1);
    expect(index().list({ offset: 10, limit: 2 }).items).toEqual([]);
  });

  it('filters by label or IRI, ignoring case, and the total is the filtered count', () => {
    const byLabel = index().list({ search: 'north', offset: 0, limit: 50 });
    const byName = index().list({ search: 'ROOM10', offset: 0, limit: 50 });

    expect(byLabel.items.map((i) => i.iri)).toEqual([NS + 'wall1']);
    expect(byName.total).toBe(2);
  });

  it('filters inside a class', () => {
    expect(index().list({ classIri: NS + 'Room', search: '102', offset: 0, limit: 50 }).items.map((i) => i.iri)).toEqual([NS + 'room102']);
  });

  it('prefers a label with no language or in English to one in another language', () => {
    expect(index().list({ search: 'room 102', offset: 0, limit: 5 }).items[0].label).toBe('Room 102');
  });

  it('finds nothing for a search that matches nothing', () => {
    expect(index().list({ search: 'zzz', offset: 0, limit: 50 })).toMatchObject({ items: [], total: 0 });
  });
});

describe('describe', () => {
  const index = () => createIndividualIndex([ONTOLOGY, DATA]);

  it('gives the labels, the types, and what the individual points to', () => {
    const detail = index().describe(NS + 'room101');

    expect(detail.iri).toBe(NS + 'room101');
    expect(detail.labels).toEqual(['Room 101']);
    expect(detail.types).toEqual([NS + 'Room']);
    expect(detail.outgoing.map((t) => [t.predicate, t.object.value, t.object.termType])).toEqual([
      [NS + 'hasPart', NS + 'wall1', 'NamedNode'],
      [NS + 'hasPart', NS + 'wall2', 'NamedNode'],
    ]);
  });

  it('marks the objects that are individuals themselves, so they can be followed', () => {
    const detail = index().describe(NS + 'room101');

    expect(detail.outgoing.map((t) => t.objectIsIndividual)).toEqual([true, true]);
  });

  it('gives what points to the individual', () => {
    const detail = index().describe(NS + 'wall1');

    expect(detail.incoming.map((t) => [t.subject, t.predicate])).toEqual([[NS + 'room101', NS + 'hasPart']]);
  });

  it('keeps the language of a label, and shows every label', () => {
    expect(index().describe(NS + 'room102').labels.sort()).toEqual(['Raum 102', 'Room 102']);
  });

  it('leaves the typing and the labels out of the rows of what it points to', () => {
    const rows = index().describe(NS + 'room102').outgoing;

    expect(rows.filter((t) => t.predicate.endsWith('#type') || t.predicate.endsWith('#label'))).toEqual([]);
  });

  it('caps the rows each way and says how many there are', () => {
    const many = store(Array.from({ length: 30 }, (_, i) => `:hub :link :n${i} . :n${i} a :Room .`).join('\n') + ' :hub a :Room .');
    const detail = createIndividualIndex([many]).describe(NS + 'hub', { maxRows: 10 });

    expect(detail.outgoing).toHaveLength(10);
    expect(detail.outgoingTotal).toBe(30);
  });

  it('shows a literal with its datatype or language', () => {
    const typed = store(':a a :Room ; :height "2.5"^^xsd:decimal ; :note "hello"@en .');
    const rows = createIndividualIndex([typed]).describe(NS + 'a').outgoing;

    expect(rows.find((t) => t.predicate === NS + 'height')!.object).toMatchObject({ termType: 'Literal', value: '2.5', datatype: 'http://www.w3.org/2001/XMLSchema#decimal' });
    expect(rows.find((t) => t.predicate === NS + 'note')!.object).toMatchObject({ termType: 'Literal', value: 'hello', language: 'en' });
  });

  it('describes an IRI that is not an individual as having nothing', () => {
    expect(index().describe(NS + 'nothing')).toMatchObject({ labels: [], types: [], outgoing: [], incoming: [] });
  });
});

describe('on a large file', () => {
  const many = (n: number) =>
    store(Array.from({ length: n }, (_, i) => `:i${i} a :C${i % 50} ; rdfs:label "Item ${i}" .`).join('\n'));

  it('sorts once: a search only filters, a next page costs nothing, and the order does not change with either', () => {
    const index = createIndividualIndex([many(20000)]);

    const first = index.list({ offset: 0, limit: 3 });
    const searched = index.list({ search: 'item 1999', offset: 0, limit: 50 });
    const second = index.list({ offset: 3, limit: 3 });

    expect(first.total).toBe(20000);
    expect(first.items.map((i) => i.label)).toEqual(['Item 0', 'Item 1', 'Item 10']);
    expect(second.items.map((i) => i.label)).toEqual(['Item 100', 'Item 1000', 'Item 10000']);
    expect(searched.total).toBe(11);
    expect(searched.items.map((i) => i.label)[0]).toBe('Item 1999');
  });
});

describe('countIndividuals', () => {
  it('counts the individuals over all the stores, one for an individual typed in two', async () => {
    const { countIndividuals } = await import('../../src/abox/individualIndex');

    expect(countIndividuals([ONTOLOGY, DATA])).toBe(5);
    expect(countIndividuals([DATA, store(':room101 a :Room . :extra a :Wall .')])).toBe(6);
  });

  it('is nothing for an ontology without individuals, and for no stores', async () => {
    const { countIndividuals } = await import('../../src/abox/individualIndex');

    expect(countIndividuals([ONTOLOGY])).toBe(0);
    expect(countIndividuals([])).toBe(0);
  });
});

describe('list(), grouped by class', () => {
  const index = () => createIndividualIndex([ONTOLOGY, DATA]);
  const grouped = (options: Partial<Parameters<ReturnType<typeof index>['list']>[0]> = {}) => index().list({ offset: 0, limit: 50, grouped: true, ...options });

  it('puts the individuals of each class together, the biggest class first, by label inside each, those with no class last', () => {
    const { items, groupTotals } = grouped();
    const byGroup = new Map<string, string[]>();
    for (const item of items) byGroup.set(item.group, [...(byGroup.get(item.group) ?? []), item.iri]);

    // Room and Wall have two individuals each (Room first, by IRI); Bedroom's only individual is also a Room, so it is listed there.
    expect([...byGroup.keys()]).toEqual([NS + 'Room', NS + 'Wall', NO_CLASS]);
    expect(byGroup.get(NS + 'Room')).toEqual([NS + 'room101', NS + 'room102']);
    expect([...groupTotals.entries()].reduce((sum, [, n]) => sum + n, 0)).toBe(items.length);
  });

  it('lists an individual of two classes once, under the first of them', () => {
    const { items } = grouped();
    const iris = items.map((i) => i.iri);
    expect(new Set(iris).size).toBe(iris.length);
  });

  it('counts the matches of a search in each group, and gives one group for one class', () => {
    const all = grouped();
    const one = grouped({ classIri: all.items[0].group });
    expect(new Set(one.items.map((i) => i.group))).toEqual(new Set([all.items[0].group]));
    expect(one.groupTotals.get(all.items[0].group)).toBe(one.total);
  });
});
