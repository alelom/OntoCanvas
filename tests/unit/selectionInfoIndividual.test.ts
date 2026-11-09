// @vitest-environment jsdom
/**
 * The bottom bar names a selected individual by its label (#217): the search selects one it finds, and its node id
 * (__individual__ and the IRI) means nothing to a reader. A selected link between individuals is named by its
 * relationship, not by its edge id (__individual_edge__ and a number; #242 review).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSet } from 'vis-data';
import { updateSelectionInfoDisplay } from '../../src/ui/selectionInfo';
import { INDIVIDUAL_PREFIX, INDIVIDUAL_EDGE_PREFIX } from '../../src/abox/individualsLayer';

const IRI = 'http://example.org/d#room01';
const HAS_WALL = 'http://example.org/d#hasWall';
const net = (nodes: string[], edges: string[] = []) =>
  ({
    getSelectedNodes: () => nodes,
    getSelectedEdges: () => edges,
    body: {
      data: {
        nodes: new DataSet<any>([{ id: INDIVIDUAL_PREFIX + IRI, label: 'Room 01' }]),
        edges: new DataSet<any>([
          { id: INDIVIDUAL_EDGE_PREFIX + 0, label: 'hasWall', property: HAS_WALL },
          { id: INDIVIDUAL_EDGE_PREFIX + 1, label: '' },
        ]),
      },
    },
  }) as any;

beforeEach(() => {
  document.body.innerHTML = '<span id="selectionInfo"></span>';
});

describe('a selected individual in the bottom bar', () => {
  it('is named by its label, as an individual, with a link to its IRI', () => {
    updateSelectionInfoDisplay(net([INDIVIDUAL_PREFIX + IRI]));

    const info = document.getElementById('selectionInfo')!;
    expect(info.textContent).toBe(' | Selected: Room 01 (individual)');
    expect(info.querySelector('a')!.getAttribute('href')).toBe(IRI);
  });
});

describe('a selected link between individuals in the bottom bar', () => {
  it('is named by its relationship, with a link to the relationship', () => {
    updateSelectionInfoDisplay(net([], [INDIVIDUAL_EDGE_PREFIX + 0]));

    const info = document.getElementById('selectionInfo')!;
    expect(info.textContent).toBe(' | Selected: hasWall (link between individuals)');
    expect(info.querySelector('a')!.getAttribute('href')).toBe(HAS_WALL);
  });

  it('names a link to a class of the data as rdf:type', () => {
    updateSelectionInfoDisplay(net([], [INDIVIDUAL_EDGE_PREFIX + 1]));

    expect(document.getElementById('selectionInfo')!.textContent).toBe(' | Selected: type (link between individuals)');
  });
});
