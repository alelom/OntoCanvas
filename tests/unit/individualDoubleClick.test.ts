/**
 * A double-click on a drawn individual draws the individuals linked to it; on the node of a class of the data, its individuals
 * (#239). Any other node is left to the editing double-click.
 */
import { describe, it, expect, vi } from 'vitest';
import { individualDoubleClick } from '../../src/graph/individualDoubleClick';
import { INDIVIDUAL_CLASS_PREFIX, INDIVIDUAL_PREFIX, type IndividualsLayer } from '../../src/abox/individualsLayer';

const layer = () => ({ showNeighbours: vi.fn(), showClass: vi.fn() }) as unknown as IndividualsLayer & { showNeighbours: ReturnType<typeof vi.fn>; showClass: ReturnType<typeof vi.fn> };

describe('individualDoubleClick', () => {
  it('draws the individuals linked to a drawn individual', () => {
    const l = layer();

    expect(individualDoubleClick(`${INDIVIDUAL_PREFIX}http://example.org/d#a`, l)).toBe(true);
    expect(l.showNeighbours).toHaveBeenCalledWith('http://example.org/d#a');
  });

  it('draws the individuals of the class a class node of the data stands for', () => {
    const l = layer();

    expect(individualDoubleClick(`${INDIVIDUAL_CLASS_PREFIX}http://example.org/p#Assertion`, l)).toBe(true);
    expect(l.showClass).toHaveBeenCalledWith('http://example.org/p#Assertion');
  });

  it('leaves any other node to the editing double-click', () => {
    const l = layer();

    expect(individualDoubleClick('Room', l)).toBe(false);
    expect(l.showNeighbours).not.toHaveBeenCalled();
    expect(l.showClass).not.toHaveBeenCalled();
  });
});
