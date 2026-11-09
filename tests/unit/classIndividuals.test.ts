/**
 * Individuals from the class node (#209): the entry of its right-click menu says what it draws and how many are drawn, and
 * the node carries how many individuals the loaded data has for it, when it has any.
 */
import { describe, it, expect } from 'vitest';
import { DataSet } from 'vis-data';
import { Parser, Store } from 'n3';
import { createIndividualsLayer } from '../../src/abox/individualsLayer';
import { classIndividualsAction, addIndividualCounts, classIriOfNode } from '../../src/graph/classIndividuals';

const NS = 'http://example.org/d#';
const people = (n: number) => Array.from({ length: n }, (_, i) => `:p${String(i).padStart(3, '0')} a :Person .`).join('\n');
const store = (turtle: string) => new Store(new Parser().parse(`@prefix : <${NS}> .\n${turtle}`));
const layerOf = (turtle: string, options: { maxTotal?: number } = {}) => {
  const stores = [store(turtle)];
  return createIndividualsLayer({ autoMax: 0, getStores: () => stores, ...options });
};

describe('classIndividualsAction', () => {
  it('is null for a class with no individuals', () => {
    expect(classIndividualsAction(layerOf(people(3)), `${NS}Room`)).toBeNull();
  });

  it('says how many it draws, and draws them in batches, then says all are displayed', () => {
    const layer = layerOf(people(120));
    const uri = `${NS}Person`;
    expect(classIndividualsAction(layer, uri)).toMatchObject({ label: 'Show 50 individuals (0 displayed/120 total)', disabled: false });

    classIndividualsAction(layer, uri)!.run();
    expect(classIndividualsAction(layer, uri)!.label).toBe('Show 50 more individuals (50 displayed/120 total)');
    classIndividualsAction(layer, uri)!.run();
    classIndividualsAction(layer, uri)!.run();

    expect(classIndividualsAction(layer, uri)).toMatchObject({ label: 'All 120 individuals displayed', disabled: true });
  });

  it('says the limit is reached, disabled, at the total cap', () => {
    const layer = layerOf(people(120), { maxTotal: 10 });
    classIndividualsAction(layer, `${NS}Person`)!.run();

    expect(classIndividualsAction(layer, `${NS}Person`)).toMatchObject({ label: 'Limit reached', disabled: true });
    expect(classIndividualsAction(layer, `${NS}Person`)!.title).toMatch(/^The graph draws up to 10 individuals: /);
  });
});

describe('addIndividualCounts', () => {
  const nodes = () => new DataSet<any>([
    { id: 'Person', label: 'Person' },
    { id: 'Room', label: 'Room' },
  ]);
  const byUri = new Map([[`${NS}Person`, 'Person'], [`${NS}Room`, 'Room']]);

  it('records the count on a class that has individuals, whether or not they are drawn, and leaves the label and the others alone', () => {
    const data = nodes();
    addIndividualCounts(data, layerOf(people(120)), byUri);

    expect(data.get('Person').individualCount).toBe(120);
    expect(data.get('Person').label).toBe('Person');
    expect(data.get('Room').individualCount).toBeUndefined();
  });
});

describe('classIriOfNode (#239)', () => {
  it('is the IRI of a class node of the graph, or of the node of a class of the data that is not in the graph', () => {
    const graph = [{ id: 'Room', uri: 'http://example.org/d#Room' }];

    expect(classIriOfNode('Room', graph)).toBe('http://example.org/d#Room');
    expect(classIriOfNode('__individual_class__http://example.org/p#Assertion', graph)).toBe('http://example.org/p#Assertion');
    expect(classIriOfNode('__individual__http://example.org/d#a', graph)).toBeNull();
    expect(classIriOfNode('Nothing', graph)).toBeNull();
  });
});
