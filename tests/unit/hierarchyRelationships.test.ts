/**
 * The relationships that make the tiers of the hierarchical layouts (#151): subClassOf by default, plus any object
 * property the user ticks (ADIRO: contains). The others are still drawn but no longer rank, except through rule 2.
 *
 * Rule 1: a superclass that nothing contains goes one tier below the nearest common container of its subclasses.
 * Rule 2: a class the hierarchy leaves without a parent goes one tier below the highest class pointing to it.
 */
import { describe, it, expect } from 'vitest';
import { buildLayeredModel } from '../../src/layouts/layeredModel';
import { computeHierarchicalDag } from '../../src/layouts/hierarchicalDag';
import { computeHierarchicalTiersSpring } from '../../src/layouts/hierarchicalTiersSpring';
import { computeHierarchicalForceDownward } from '../../src/layouts/hierarchicalForceDownward';
import { computeNodeDepths } from '../../src/graph';
import type { GraphEdge } from '../../src/types';

const sub = (child: string, parent: string): GraphEdge => ({ from: child, to: parent, type: 'subClassOf' });
const rel = (from: string, type: string, to: string): GraphEdge => ({ from, to, type });
const idsOf = (edges: GraphEdge[], extra: string[] = []) => new Set([...edges.flatMap((e) => [e.from, e.to]), ...extra]);
const CONTAINS = new Set(['subClassOf', 'contains']);

/** ADIRO aec_drawing_metadata 4.0.1: its class-to-class relationships. */
const ADIRO: GraphEdge[] = [
  rel('Layout', 'contains', 'DrawingElement'),
  rel('DrawingSheet', 'contains', 'KeyPlan'),
  rel('Titleblock', 'contains', 'KeyPlan'),
  rel('DrawingSheet', 'contains', 'Layout'),
  rel('DrawingSheet', 'contains', 'Legend'),
  rel('Titleblock', 'contains', 'Legend'),
  rel('DrawingSheet', 'contains', 'Note'),
  rel('DrawingSheet', 'contains', 'RevisionTable'),
  rel('Titleblock', 'contains', 'RevisionTable'),
  rel('DrawingSheet', 'contains', 'Titleblock'),
  ...['Detail', 'Elevation', 'Perspective', 'Plan', 'Section', 'Table'].map((c) => sub(c, 'LayoutContentType')),
  ...['KeyPlan', 'Legend', 'Note', 'RevisionTable', 'Titleblock'].map((c) => sub(c, 'MetadataContainer')),
  sub('Image', 'Note'),
  sub('TextualNote', 'Note'),
  rel('Layout', 'hasProperty', 'LayoutContentType'),
  rel('Detail', 'hasOrientation', 'OrientationValue'),
  rel('Section', 'hasOrientation', 'OrientationValue'),
  rel('Titleblock', 'assertsClient', 'Organisation'),
  rel('Titleblock', 'assertsMetadataFor', 'DrawingSheet'),
  rel('Titleblock', 'assertsOriginator', 'Organisation'),
  rel('DrawingSheet', 'belongsToPackage', 'DrawingPackage'),
  rel('DrawingSheet', 'belongsToProject', 'Project'),
  rel('DrawingSheet', 'hasLayout', 'Layout'),
  rel('Layout', 'hasLayoutContentType', 'LayoutContentType'),
  rel('DrawingSheet', 'hasRevision', 'DrawingRevision'),
  rel('DrawingRevision', 'hasStatusCode', 'StatusCode'),
  rel('DrawingRevision', 'isApprovedBy', 'Person'),
  rel('DrawingRevision', 'isAuthoredBy', 'Person'),
  rel('DrawingRevision', 'isCheckedBy', 'Person'),
];

const tiers = (edges: GraphEdge[], hierarchyTypes?: Set<string>) => buildLayeredModel(idsOf(edges), edges, { hierarchyTypes }).level;

describe('which relationships make the tiers (#151)', () => {
  it('ranks by subClassOf only when nothing else is ticked', () => {
    // A and B are both subclasses of P; A refers to B. B stays beside A instead of going below it.
    const edges = [sub('A', 'P'), sub('B', 'P'), rel('A', 'refersTo', 'B')];
    expect(tiers(edges)).toEqual({ P: 0, A: 1, B: 1 });
  });

  it('ranks by a ticked object property: the container goes above what it contains', () => {
    const edges = [sub('A', 'P'), sub('B', 'P'), rel('A', 'contains', 'B')];
    expect(tiers(edges, CONTAINS)).toEqual({ P: 0, A: 1, B: 2 });
  });

  it('still keeps every relationship for the connected groups: nothing linked only by an unticked one is parked', () => {
    const edges = [sub('A', 'P'), rel('A', 'refersTo', 'X')];
    const model = buildLayeredModel(idsOf(edges), edges);
    expect(model.parkedComponents).toEqual([]);
  });
});

describe('rule 1: a superclass goes just below the common container of its subclasses (#151)', () => {
  it('places MetadataContainer below Drawing Sheet, though Titleblock is both its subclass and a container', () => {
    const level = tiers(ADIRO, CONTAINS);
    expect(level.DrawingSheet).toBe(0);
    expect(level.MetadataContainer).toBe(1);
    expect(level.Titleblock).toBe(2);
    expect(level.Note).toBe(2);
    expect(level.KeyPlan).toBe(3);
  });

  it('places a superclass below the lowest container that holds all its subclasses', () => {
    // Kitchen and Bath, both kinds of Room, are in Flat, which is in Building: Room goes below Flat.
    const edges = [
      rel('Building', 'contains', 'Flat'),
      rel('Flat', 'contains', 'Kitchen'),
      rel('Flat', 'contains', 'Bath'),
      sub('Kitchen', 'Room'),
      sub('Bath', 'Room'),
    ];
    const level = tiers(edges, CONTAINS);
    expect(level.Room).toBe(level.Flat + 1);
    expect(level.Kitchen).toBe(level.Room + 1);
  });

  it('follows a container of any subclass, not only the direct ones', () => {
    const edges = [rel('Box', 'contains', 'Apple'), sub('Apple', 'Fruit'), sub('Fruit', 'Food')];
    const level = tiers(edges, CONTAINS);
    expect(level.Food).toBe(level.Box + 1);
  });

  it('does not apply to a superclass that something contains', () => {
    const edges = [rel('Shelf', 'contains', 'Book'), rel('Library', 'contains', 'Item'), sub('Book', 'Item')];
    const level = tiers(edges, CONTAINS);
    expect(level.Item).toBe(level.Library + 1);
    expect(level.Shelf).toBe(0);
  });

  it('does not apply when the containers have no common container', () => {
    const edges = [rel('Car', 'contains', 'Wheel'), rel('Bike', 'contains', 'Pedal'), sub('Wheel', 'Part'), sub('Pedal', 'Part')];
    const level = tiers(edges, CONTAINS);
    expect(level.Part).toBe(0);
  });

  it('applies when only some subclasses are contained', () => {
    const edges = [rel('Sheet', 'contains', 'Note'), sub('Note', 'Element'), sub('Loose', 'Element')];
    const level = tiers(edges, CONTAINS);
    expect(level.Element).toBe(level.Sheet + 1);
    expect(level.Loose).toBe(level.Element + 1);
  });

  it('never puts a class below its own subclass: a container that is a subclass does not count', () => {
    // Titleblock, a subclass of MetadataContainer, is the only container: the rule does not apply.
    const edges = [
      rel('Titleblock', 'contains', 'KeyPlan'),
      sub('Titleblock', 'MetadataContainer'),
      sub('KeyPlan', 'MetadataContainer'),
    ];
    expect(tiers(edges, CONTAINS)).toEqual({ MetadataContainer: 0, Titleblock: 1, KeyPlan: 2 });
  });

  it('does nothing when only subClassOf is ticked', () => {
    expect(tiers(ADIRO).MetadataContainer).toBe(0);
  });
});

describe('rule 2: a class with no place in the hierarchy goes below the class pointing to it (#151)', () => {
  it('places every class of ADIRO as the issue expects', () => {
    const level = tiers(ADIRO, CONTAINS);
    const at = (t: number) => Object.keys(level).filter((id) => level[id] === t).sort();
    expect(at(0)).toEqual(['DrawingSheet']);
    expect(at(1)).toEqual(['DrawingPackage', 'DrawingRevision', 'Layout', 'MetadataContainer', 'Project']);
    expect(at(2)).toEqual(['DrawingElement', 'LayoutContentType', 'Note', 'Person', 'StatusCode', 'Titleblock']);
    expect(at(3)).toEqual([
      'Detail', 'Elevation', 'Image', 'KeyPlan', 'Legend', 'Organisation', 'Perspective', 'Plan', 'RevisionTable',
      'Section', 'Table', 'TextualNote',
    ]);
    expect(at(4)).toEqual(['OrientationValue']);
  });

  it('chooses the highest class pointing to it', () => {
    const edges = [sub('Deep', 'Mid'), sub('Mid', 'Top'), rel('Deep', 'mentions', 'X'), rel('Top', 'mentions', 'X')];
    expect(tiers(edges).X).toBe(1);
  });

  it('never puts a class below one that is below it: Drawing Sheet stays on top though Titleblock points to it', () => {
    expect(tiers(ADIRO, CONTAINS).DrawingSheet).toBe(0);
  });

  it('leaves two classes pointing to each other side by side', () => {
    const edges = [rel('A', 'knows', 'B'), rel('B', 'knows', 'A')];
    expect(tiers(edges)).toEqual({ A: 0, B: 0 });
  });

  it('does not put a class below one it points to as well, when the relationship between them is unticked', () => {
    // Page contains Header (unticked) and Header refers to Page: Page stays on top.
    const edges = [sub('Header', 'Element'), rel('Page', 'contains', 'Header'), rel('Header', 'refersTo', 'Page')];
    expect(tiers(edges).Page).toBe(0);
  });

  it('leaves a class that nothing points to at the top', () => {
    const edges = [rel('A', 'knows', 'B')];
    expect(tiers(edges)).toEqual({ A: 0, B: 1 });
  });
});

describe('the hierarchical layouts take the setting (#151)', () => {
  const layouts = [computeHierarchicalDag, computeHierarchicalTiersSpring, computeHierarchicalForceDownward];
  it('places what a ticked relationship contains below its container, in every hierarchical layout', () => {
    const edges = [sub('A', 'P'), sub('B', 'P'), rel('A', 'contains', 'B')];
    for (const layout of layouts) {
      const ticked = layout(idsOf(edges), edges, 220, undefined, { hierarchyTypes: CONTAINS });
      expect(ticked.B.y, layout.name).toBeGreaterThan(ticked.A.y);
      const unticked = layout(idsOf(edges), edges, 220);
      expect(Math.abs(unticked.B.y - unticked.A.y), layout.name).toBeLessThan(1);
    }
  });
});

describe('depth for font sizes follows the setting (#151)', () => {
  it('counts subClassOf only by default, and a ticked relationship when given', () => {
    const edges = [rel('Sheet', 'contains', 'Note'), sub('Image', 'Note')];
    expect(computeNodeDepths(idsOf(edges), edges).depth.Image).toBe(1);
    expect(computeNodeDepths(idsOf(edges), edges, CONTAINS).depth.Image).toBe(2);
  });
});
