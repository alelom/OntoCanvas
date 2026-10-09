/**
 * Wrapping for the "(defined by: …)" note above an imported term's label (#111): breaks at spaces like
 * wrapText does, and also splits a word longer than the line, so that a long prefix or ontology name wraps
 * instead of making the node wider. Kept free of imports so the node-size estimate and the drawn label can
 * share it and always agree.
 */

export interface StyledChar {
  char: string;
  italic: boolean;
}

/**
 * Break `chars` into lines of at most `maxChars` characters. Words (separated by spaces) are kept whole where
 * they fit; a longer word is cut into `maxChars` pieces, each keeping its italic state. A space is italic only
 * between italic characters. No `maxChars` (or 0) keeps everything on one line.
 */
export function wrapStyledChars(chars: StyledChar[], maxChars?: number): StyledChar[][] {
  const words: StyledChar[][] = [];
  let word: StyledChar[] = [];
  for (const c of chars) {
    if (c.char === ' ') {
      if (word.length) words.push(word);
      word = [];
    } else {
      word.push(c);
    }
  }
  if (word.length) words.push(word);

  const limit = maxChars && maxChars > 0 ? maxChars : Infinity;
  const lines: StyledChar[][] = [];
  let line: StyledChar[] = [];
  for (const w of words) {
    if (w.length > limit) {
      // Too long for any line: start on a new one and cut it; its last piece may be joined by the next word.
      if (line.length) lines.push(line);
      let rest = w;
      while (rest.length > limit) {
        lines.push(rest.slice(0, limit));
        rest = rest.slice(limit);
      }
      line = rest;
    } else if (line.length === 0) {
      line = [...w];
    } else if (line.length + 1 + w.length <= limit) {
      line = [...line, { char: ' ', italic: line[line.length - 1].italic && w[0].italic }, ...w];
    } else {
      lines.push(line);
      line = [...w];
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/** The same wrapping for plain text: its lines. */
export function wrapNoteText(text: string, maxChars?: number): string[] {
  return wrapStyledChars([...text].map((char) => ({ char, italic: false })), maxChars).map((line) => line.map((c) => c.char).join(''));
}
