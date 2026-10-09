import { describe, it, expect } from 'vitest';
import { wrapStyledChars, wrapNoteText, type StyledChar } from './noteWrap';

const styled = (parts: Array<[string, boolean]>): StyledChar[] => parts.flatMap(([text, italic]) => [...text].map((char) => ({ char, italic })));
const render = (lines: StyledChar[][]) => lines.map((l) => l.map((c) => (c.italic ? c.char.toUpperCase() : c.char)).join(''));

describe('wrapNoteText', () => {
  it('breaks at spaces and keeps a word whole where it fits', () => {
    expect(wrapNoteText('(defined by: imported-note-other)', 24)).toEqual(['(defined by:', 'imported-note-other)']);
    expect(wrapNoteText('(defined by: base)', 24)).toEqual(['(defined by: base)']);
  });

  it('cuts a word longer than the line into pieces, so it does not make the node wider', () => {
    expect(wrapNoteText('(defined by: aVeryVeryLongOntologyName)', 12)).toEqual([
      '(defined by:',
      'aVeryVeryLon',
      'gOntologyNam',
      'e)',
    ]);
  });

  it('lets the next word join the last piece of a cut word', () => {
    expect(wrapNoteText('aaaaaaaaaaaaaaaaa bb', 10)).toEqual(['aaaaaaaaaa', 'aaaaaaa bb']);
  });

  it('does not wrap without a limit', () => {
    expect(wrapNoteText('(defined by: a-very-long-prefix-name)')).toEqual(['(defined by: a-very-long-prefix-name)']);
    expect(wrapNoteText('(defined by: a-very-long-prefix-name)', 0)).toHaveLength(1);
  });
});

describe('wrapStyledChars', () => {
  it('keeps the italic state of every piece of a cut word', () => {
    // "(defined by: " plain, the name italic, ")" plain
    const lines = wrapStyledChars(styled([['(defined by: ', false], ['abcdefghijklmnop', true], [')', false]]), 8);
    expect(render(lines)).toEqual(['(defined', 'by:', 'ABCDEFGH', 'IJKLMNOP', ')']);
  });

  it('makes a space italic only between italic characters', () => {
    const lines = wrapStyledChars(styled([['x ', false], ['Friend of', true], [' y', false]]), 40);
    const spaces = lines[0].filter((c) => c.char === ' ').map((c) => c.italic);
    expect(spaces).toEqual([false, true, false]);
  });
});
