// @vitest-environment jsdom
/**
 * The bottom bar names a selected individual by its label (#217): the search selects one it finds, and its node id
 * (__individual__ and the IRI) means nothing to a reader.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DataSet } from 'vis-data';
import { updateSelectionInfoDisplay } from '../../src/ui/selectionInfo';
import { INDIVIDUAL_PREFIX } from '../../src/abox/individualsLayer';

const IRI = 'http://example.org/d#room01';
const net = (selected: string[]) =>
  ({
    getSelectedNodes: () => selected,
    getSelectedEdges: () => [],
    body: { data: { nodes: new DataSet<any>([{ id: INDIVIDUAL_PREFIX + IRI, label: 'Room 01' }]) } },
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
