/**
 * What the toolbar button for the Individuals tab says (#211): a call to action while there are none, the count once there are.
 */
import { describe, it, expect } from 'vitest';
import { individualsButtonText } from '../../src/abox/individualsLabel';

describe('individualsButtonText', () => {
  it('invites adding some when there are none, and says what the button opens', () => {
    expect(individualsButtonText(0)).toEqual({
      label: 'Add individuals',
      title: 'Add a file or a URL of individuals to browse and query',
    });
  });

  it('shows the count, with thousands separated, once there are some', () => {
    expect(individualsButtonText(2134).label).toBe('Individuals (2,134)');
    expect(individualsButtonText(2134).title).toBe('Browse the 2,134 individuals of this ontology and of the data added to it');
  });

  it('says "individual" for one', () => {
    expect(individualsButtonText(1)).toEqual({
      label: 'Individuals (1)',
      title: 'Browse the 1 individual of this ontology and of the data added to it',
    });
  });
});
