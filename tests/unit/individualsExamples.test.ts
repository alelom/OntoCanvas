/**
 * The examples for individuals drawn in the graph (#209): what each header promises is what the layer builds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Parser, Store } from 'n3';
import { individualsOf } from '../../src/lib/instanceData';
import { createIndividualsLayer } from '../../src/abox/individualsLayer';

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

  it('joins an individual of two classes to both, and leaves one of an undeclared class without a class edge', () => {
    const classEdges = (iri: string) => view.edges.filter((e) => e.type === 'rdf:type' && e.from === `__individual__${ns}${iri}`).map((e) => e.to).sort();
    expect(classEdges('ana')).toEqual(['Engineer', 'Inspector']);
    expect(classEdges('server')).toEqual(['Room', 'SecureArea']);
    expect(classEdges('acme')).toEqual([]);
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

  it('draws Head office with 50 neighbours, the two floors first, and 72 are left; 50 more at a time until all 122', () => {
    const l = layer();
    l.show(hq);

    let view = l.build(new Map());
    expect(view.nodes).toHaveLength(51);
    expect(view.nodes.filter((n) => n.label.startsWith('Floor'))).toHaveLength(2);
    expect(view.more).toEqual([{ iri: hq, label: 'Head office', hidden: 72 }]);

    l.showMore(hq);
    expect(l.build(new Map()).nodes).toHaveLength(101);
    l.showMore(hq);
    view = l.build(new Map());
    expect(view.nodes).toHaveLength(123);
    expect(view.more).toEqual([]);
  });

  it('adds the six rooms of Floor 1 when it is shown too', () => {
    const l = layer();
    l.show(hq);
    l.show(`${NS('hub')}floor1`);

    expect(l.build(new Map()).nodes.filter((n) => n.label.startsWith('Room'))).toHaveLength(6);
  });
});
