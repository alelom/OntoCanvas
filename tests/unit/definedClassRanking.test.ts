/**
 * A class defined by owl:equivalentClass ranks below the named classes of its definition (#160): a class equivalent to
 * an intersection is a subclass of each named operand (CheeseyPizza ≡ Pizza ⊓ ∃hasTopping.CheeseTopping is a Pizza).
 * Layout only: nothing is drawn or saved.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/ontology/buildGraph';
import { definitionParents } from '../../src/lib/definitionParents';
import { buildLayeredModel } from '../../src/layouts/layeredModel';
import type { GraphEdge } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREFIXES = `@prefix : <http://example.org/defs#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/defs> rdf:type owl:Ontology .
:hasTopping rdf:type owl:ObjectProperty .
`;

async function parse(body: string) {
  const { graphData, store } = await parseRdfToGraph(PREFIXES + body, { path: 'defs.ttl' });
  const ids = new Set(graphData.nodes.map((n) => n.id));
  return { graphData, store, ids, parents: definitionParents(store, ids) };
}

describe('definitionParents (#160)', () => {
  it('reads the named operands of an intersection, not the classes inside its restrictions', async () => {
    const { parents } = await parse(`
:Pizza rdf:type owl:Class .
:CheeseTopping rdf:type owl:Class .
:CheeseyPizza rdf:type owl:Class ; owl:equivalentClass [ rdf:type owl:Class ; owl:intersectionOf ( :Pizza
    [ rdf:type owl:Restriction ; owl:onProperty :hasTopping ; owl:someValuesFrom :CheeseTopping ] ) ] .
`);
    expect(parents).toEqual([{ cls: 'CheeseyPizza', parent: 'Pizza' }]);
  });

  it('reads every named operand of an intersection', async () => {
    const { parents } = await parse(`
:Vehicle rdf:type owl:Class . :Electric rdf:type owl:Class .
:ElectricVehicle rdf:type owl:Class ; owl:equivalentClass [ owl:intersectionOf ( :Vehicle :Electric ) ] .
`);
    expect(parents).toEqual([
      { cls: 'ElectricVehicle', parent: 'Electric' },
      { cls: 'ElectricVehicle', parent: 'Vehicle' },
    ]);
  });

  it('reads a class equivalent to a named class', async () => {
    const { parents } = await parse(`
:Car rdf:type owl:Class .
:Automobile rdf:type owl:Class ; owl:equivalentClass :Car .
`);
    expect(parents).toEqual([{ cls: 'Automobile', parent: 'Car' }]);
  });

  it('ignores a union and a complement: neither says what the class is a kind of', async () => {
    const { parents } = await parse(`
:Cat rdf:type owl:Class . :Dog rdf:type owl:Class .
:Pet rdf:type owl:Class ; owl:equivalentClass [ owl:unionOf ( :Cat :Dog ) ] .
:NotCat rdf:type owl:Class ; owl:equivalentClass [ owl:complementOf :Cat ] .
`);
    expect(parents).toEqual([]);
  });

  it('ignores classes that are not drawn', async () => {
    const { store } = await parse(`
:Pizza rdf:type owl:Class .
:CheeseyPizza rdf:type owl:Class ; owl:equivalentClass [ owl:intersectionOf ( :Pizza :Hidden ) ] .
`);
    expect(definitionParents(store, new Set(['CheeseyPizza', 'Pizza']))).toEqual([{ cls: 'CheeseyPizza', parent: 'Pizza' }]);
  });
});

describe('ranking with definitions (#160)', () => {
  const sub = (child: string, parent: string): GraphEdge => ({ from: child, to: parent, type: 'subClassOf' });

  it('ranks a defined class one tier below the named classes of its definition', () => {
    const ids = new Set(['Food', 'Pizza', 'CheeseyPizza']);
    const { level } = buildLayeredModel(ids, [sub('Pizza', 'Food')], {
      definitions: [{ cls: 'CheeseyPizza', parent: 'Pizza' }],
    });
    expect(level).toEqual({ Food: 0, Pizza: 1, CheeseyPizza: 2 });
  });

  it('keeps the defined class in the main group instead of parking it', () => {
    const ids = new Set(['Food', 'Pizza', 'CheeseyPizza']);
    const model = buildLayeredModel(ids, [sub('Pizza', 'Food')], { definitions: [{ cls: 'CheeseyPizza', parent: 'Pizza' }] });
    expect(model.parkedComponents).toEqual([]);
  });

  it('does not loop on two named classes defined as equivalent to each other', () => {
    const ids = new Set(['Car', 'Automobile']);
    const { level } = buildLayeredModel(ids, [], {
      definitions: [{ cls: 'Automobile', parent: 'Car' }, { cls: 'Car', parent: 'Automobile' }],
    });
    expect([level.Car, level.Automobile].sort()).toEqual([0, 1]);
  });

  it('is not used when subClassOf is not ticked as a tier relationship', () => {
    const ids = new Set(['Pizza', 'CheeseyPizza']);
    const { level } = buildLayeredModel(ids, [], {
      hierarchyTypes: new Set(['contains']),
      definitions: [{ cls: 'CheeseyPizza', parent: 'Pizza' }],
    });
    expect(level).toEqual({ Pizza: 0, CheeseyPizza: 0 });
  });
});

describe('examples/layout/broad-menu.ttl (#160)', () => {
  it('parks none of its defined classes: each ranks one tier below the named class of its definition', async () => {
    const path = join(__dirname, '../../examples/layout/broad-menu.ttl');
    const { graphData, store } = await parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
    const ids = new Set(graphData.nodes.map((n) => n.id));
    const definitions = definitionParents(store, ids);
    const before = buildLayeredModel(ids, graphData.edges);
    const after = buildLayeredModel(ids, graphData.edges, { definitions });
    const defined = ['CheesyDish', 'MeatyDish', 'SpicyIngredient', 'VegetarianDish'];
    expect(before.parkedComponents.flat().sort()).toEqual(defined);
    expect(after.parkedComponents).toEqual([]);
    for (const id of ['CheesyDish', 'MeatyDish', 'VegetarianDish']) expect(after.level[id]).toBe(after.level.Dish + 1);
    expect(after.level.SpicyIngredient).toBe(after.level.Ingredient + 1);
  });
});
