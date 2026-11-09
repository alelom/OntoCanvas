/**
 * The examples for individuals drawn in the graph (#209): what each header promises is what the layer builds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Parser, Store } from 'n3';
import { individualsOf } from '../../src/lib/instanceData';
import { createIndividualsLayer } from '../../src/abox/individualsLayer';
import { createIndividualIndex } from '../../src/abox/individualIndex';
import { graphsOf, groupByPredicate } from '../../src/abox/recordCard';

const load = (name: string): Store => new Store(new Parser().parse(readFileSync(join(__dirname, '../../examples/sparql', name), 'utf8')));
const NS = (name: string) => `http://example.org/examples/individuals-${name}#`;

describe('individuals-small.ttl', () => {
  const store = load('individuals-small.ttl');
  const classNodes = new Map(['Person', 'Team', 'Project'].map((c) => [`${NS('small')}${c}`, c]));

  it('has ten individuals, few enough to be drawn without being asked, with their links and classes', () => {
    expect(individualsOf(store).size).toBe(10);
    const layer = createIndividualsLayer({ getStores: () => [store] });

    const view = layer.build(classNodes);

    expect(layer.isEmpty()).toBe(false);
    expect(view.nodes).toHaveLength(10);
    expect(view.edges.filter((e) => e.type === 'rdf:type')).toHaveLength(10);
    expect(view.edges.filter((e) => e.type === `${NS('small')}memberOf`)).toHaveLength(5);
    expect(view.edges.filter((e) => e.type === `${NS('small')}worksOn`)).toHaveLength(3);
    expect(view.nodes.find((n) => n.iri === `${NS('small')}alice`)!.title).toContain('alice@example.org');
  });
});

describe('individuals-building.ttl', () => {
  const store = load('individuals-building.ttl');
  const ns = NS('building');
  const classNodes = new Map(['Space', 'Room', 'Corridor', 'SecureArea', 'Element', 'Wall', 'Door', 'Window', 'Person', 'Engineer', 'Inspector', 'Report'].map((c) => [`${ns}${c}`, c]));
  const view = createIndividualsLayer({ getStores: () => [store] }).build(classNodes);
  const count = (property: string) => view.edges.filter((e) => e.type === `${ns}${property}`).length;

  it('has 17 individuals, all drawn by themselves', () => {
    expect(individualsOf(store).size).toBe(17);
    expect(view.nodes).toHaveLength(17);
  });

  it('draws nine kinds of link between them, as many edges as the file has', () => {
    const kinds = new Set(view.edges.map((e) => e.type).filter((t) => t !== 'rdf:type'));
    expect(kinds.size).toBe(9);
    expect([count('adjacentTo'), count('connects'), count('hosts'), count('separates'), count('describes')]).toEqual([4, 6, 4, 2, 2]);
    expect([count('responsibleFor'), count('inspectedBy'), count('suppliedBy'), count('employs')]).toEqual([2, 1, 1, 1]);
  });

  it('joins an individual of two classes to both, and one of an undeclared class to a stub of it (#216)', () => {
    const classEdges = (iri: string) => view.edges.filter((e) => e.type === 'rdf:type' && e.from === `__individual__${ns}${iri}`).map((e) => e.to).sort();
    expect(classEdges('ana')).toEqual(['Engineer', 'Inspector']);
    expect(classEdges('server')).toEqual(['Room', 'SecureArea']);
    expect(classEdges('acme')).toEqual([`__individual_class__${ns}Company`]);
  });

  it('puts the values of an individual in its tooltip', () => {
    expect(view.nodes.find((n) => n.iri === `${ns}door3`)!.title).toContain('fireRating: 60');
    expect(view.nodes.find((n) => n.iri === `${ns}server`)!.title).toContain('area: 12.5');
  });
});

describe('individuals-hub.ttl', () => {
  const store = load('individuals-hub.ttl');
  const hq = `${NS('hub')}hq`;
  const layer = () => createIndividualsLayer({ getStores: () => [store] });

  it('has 135 individuals: too many to be drawn without being asked', () => {
    expect(individualsOf(store).size).toBe(135);
    expect(layer().isEmpty()).toBe(true);
  });

  it('has a class with no individuals (Site), for a node with no badge', () => {
    expect(store.getQuads(`${NS('hub')}Site`, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'http://www.w3.org/2002/07/owl#Class', null)).toHaveLength(1);
    expect(layer().previewClass(`${NS('hub')}Site`).total).toBe(0);
    expect(layer().previewClass(`${NS('hub')}Sensor`).total).toBe(120);
  });

  it('draws Head office with 50 neighbours, the two floors first, and 50 more at a time until all 122', () => {
    const l = layer();
    l.showNeighbours(hq);

    let view = l.build(new Map());
    expect(view.nodes).toHaveLength(51);
    expect(view.nodes.filter((n) => n.label.startsWith('Floor'))).toHaveLength(2);
    expect(l.previewNeighbours(hq)).toEqual({ adds: 50, displayed: 50, total: 122 });

    l.showNeighbours(hq);
    expect(l.build(new Map()).nodes).toHaveLength(101);
    l.showNeighbours(hq);
    view = l.build(new Map());
    expect(view.nodes).toHaveLength(123);
    expect(l.previewNeighbours(hq)).toEqual({ adds: 0, displayed: 122, total: 122 });
  });

  it('adds the six rooms of Floor 1 when it is shown too', () => {
    const l = layer();
    l.showNeighbours(hq);
    l.showNeighbours(`${NS('hub')}floor1`);

    expect(l.build(new Map()).nodes.filter((n) => n.label.startsWith('Room'))).toHaveLength(6);
  });
});

describe('individuals-vocabulary.ttl (#216)', () => {
  const store = load('individuals-vocabulary.ttl');
  const ns = NS('vocabulary');
  const classNodes = new Map(['Building', 'Sensor'].map((c) => [`${ns}${c}`, c]));
  const layer = () => createIndividualsLayer({ getStores: () => [store] });

  it('has five individuals, drawn by themselves, three of a class the file never declares', () => {
    expect(individualsOf(store).size).toBe(5);
    expect(store.getQuads(`${ns}FieldKind`, null, null, null)).toEqual([]);
    expect(layer().isEmpty()).toBe(false);
  });

  it('draws a stub for the class of the three kinds, and a dashed edge from each, and none for the classes that are nodes', () => {
    const view = layer().build(classNodes);

    expect(view.classes.map((c) => c.iri)).toEqual([`${ns}FieldKind`]);
    const toStub = view.edges.filter((e) => e.to === view.classes[0].id);
    expect(toStub).toHaveLength(3);
    expect(view.edges.filter((e) => e.type === 'rdf:type' && classNodes.has(`${ns}Sensor`) && (e.to === 'Sensor' || e.to === 'Building'))).toHaveLength(2);
  });

  it('has, for the kinds, the links the header says: a class and relationship that are drawn, and one that is not', () => {
    const quads = (kind: string, predicate: string) => store.getQuads(`${ns}${kind}`, `${ns}${predicate}`, null, null).map((q) => q.object.value);

    expect(quads('SensorField', 'expects')).toEqual([`${ns}Sensor`]);
    expect(quads('SensorField', 'mapsTo')).toEqual([`${ns}installedIn`]);
    expect(quads('NameField', 'mapsTo')).toEqual([`${ns}name`]);
  });
});

describe('individuals-records.ttl with individuals-records-data.trig (#229, #217, #214)', () => {
  const ontology = load('individuals-records.ttl');
  const data = new Store(new Parser({ format: 'application/trig' }).parse(readFileSync(join(__dirname, '../../examples/sparql/individuals-records-data.trig'), 'utf8')));
  const ns = NS('records');

  it('has 39 individuals, more than are drawn by themselves', () => {
    expect(individualsOf(data).size).toBe(39);
    expect(createIndividualsLayer({ getStores: () => [ontology, data] }).isEmpty()).toBe(true);
  });

  it('finds the four individuals of "room 01" by label, and 10 of the 38 for "room"', () => {
    const index = createIndividualIndex([ontology, data]);

    expect(index.list({ search: 'room 01', offset: 0, limit: 10 }).items.map((i) => i.label)).toEqual(['Inspection of Room 01', 'Room 01', 'Room 01 north wall', 'Room 01 south wall']);
    expect(index.list({ search: 'room', offset: 0, limit: 10 })).toMatchObject({ total: 38 });
  });

  it('gives Room 01 the properties, graphs and references its header promises', () => {
    const card = createIndividualIndex([ontology, data]).describe(`${ns}room01`);
    const outgoing = groupByPredicate(card.outgoing).map((g) => [g.predicate.slice(ns.length), g.links.length]);

    expect(outgoing).toEqual([['area', 1], ['condition', 1], ['hasWall', 2], ['tag', 2]]);
    expect(graphsOf([...card.outgoing, ...card.incoming]).sort()).toEqual([`${ns}inspection`, `${ns}survey`]);
    expect(groupByPredicate(card.incoming).map((g) => [g.predicate.slice(ns.length), g.links.length])).toEqual([['hasRoom', 1], ['inspects', 1]]);
  });

  it('draws the 12 rooms and 24 walls of hasWall, 36 at once', () => {
    const layer = createIndividualsLayer({ getStores: () => [ontology, data] });
    expect(layer.previewRelationship(`${ns}hasWall`)).toEqual({ adds: 36, displayed: 0, total: 36 });
  });
});
