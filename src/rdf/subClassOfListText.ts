/**
 * Text helpers for editing a class's rdfs:subClassOf list in place (#108), so the source-preserving
 * serializer can change one item and leave the others, and the list's layout, as they were.
 *
 * They work on a statement block's original Turtle text and understand just enough of it: strings,
 * IRIs, comments and nested brackets, so a ',' ';' '.' or ']' inside one of those is not taken for
 * syntax.
 */

/** One item of an rdfs:subClassOf list: its text is `text.slice(start, end)`; `list` counts the
 * rdfs:subClassOf predicates of the block, so items with the same `list` share one predicate. */
export interface SubClassOfItem {
  start: number;
  end: number;
  list: number;
}

/** End (exclusive) of the string, IRI or comment starting at `i`, or null if none starts there. */
function skipAtom(text: string, i: number): number | null {
  const ch = text[i];
  if (ch === '#') {
    const nl = text.indexOf('\n', i);
    return nl === -1 ? text.length : nl;
  }
  if (ch === '<') {
    const close = text.indexOf('>', i);
    return close === -1 ? text.length : close + 1;
  }
  if (ch === '"' || ch === "'") {
    const long = text.startsWith(ch.repeat(3), i);
    const quote = long ? ch.repeat(3) : ch;
    let j = i + quote.length;
    while (j < text.length) {
      if (text[j] === '\\') { j += 2; continue; }
      if (text.startsWith(quote, j)) return j + quote.length;
      j++;
    }
    return text.length;
  }
  return null;
}

/** Index of the first character after `i` that is not whitespace or part of a comment. */
function skipSpace(text: string, i: number): number {
  while (i < text.length) {
    if (/\s/.test(text[i])) i++;
    else if (text[i] === '#') i = skipAtom(text, i)!;
    else break;
  }
  return i;
}

/** End (exclusive) of the bracketed term starting with '[' at `i`. */
function skipBrackets(text: string, i: number): number {
  let depth = 0;
  while (i < text.length) {
    const atom = skipAtom(text, i);
    if (atom !== null) { i = atom; continue; }
    if (text[i] === '[' || text[i] === '(') depth++;
    else if (text[i] === ']' || text[i] === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return text.length;
}

/** End (exclusive) of the term (IRI, prefixed name, literal or bracketed node) starting at `i`. */
function skipTerm(text: string, i: number): number {
  if (text[i] === '[' || text[i] === '(') return skipBrackets(text, i);
  const atom = skipAtom(text, i);
  if (atom !== null) {
    // A literal may carry a datatype or language tag right after its closing quote.
    let j = atom;
    if (text.startsWith('^^', j)) return skipTerm(text, j + 2);
    if (text[j] === '@') {
      j++;
      while (j < text.length && /[\w-]/.test(text[j])) j++;
    }
    return j;
  }
  let j = i;
  while (j < text.length && !/[\s,;\[\]()]/.test(text[j])) {
    // A '.' ends the statement unless more of the name follows it.
    if (text[j] === '.' && !/[\w:%-]/.test(text[j + 1] ?? '')) break;
    j++;
  }
  return j;
}

/** Every item of every depth-0 `rdfs:subClassOf` in a statement block's text, in text order. */
export function findSubClassOfItems(text: string): SubClassOfItem[] {
  const items: SubClassOfItem[] = [];
  const PRED = 'rdfs:subClassOf';
  let list = -1;
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const atom = skipAtom(text, i);
    if (atom !== null) { i = atom; continue; }
    const ch = text[i];
    if (ch === '[' || ch === '(') { depth++; i++; continue; }
    if (ch === ']' || ch === ')') { depth--; i++; continue; }
    const atTokenStart = i === 0 || /[\s;]/.test(text[i - 1]);
    if (depth === 0 && atTokenStart && text.startsWith(PRED, i) && /\s/.test(text[i + PRED.length] ?? '')) {
      list++;
      let j = skipSpace(text, i + PRED.length);
      for (;;) {
        const end = skipTerm(text, j);
        if (end === j) break;
        items.push({ start: j, end, list });
        j = skipSpace(text, end);
        if (text[j] !== ',') break;
        j = skipSpace(text, j + 1);
      }
      i = j;
      continue;
    }
    i++;
  }
  return items;
}

/** The predicate-object parts of a bracketed node `[ p o ; p o ]`, with their positions in `text`. */
function bracketParts(text: string): { start: number; end: number }[] {
  const parts: { start: number; end: number }[] = [];
  const close = text.lastIndexOf(']');
  let i = skipSpace(text, text.indexOf('[') + 1);
  while (i < close) {
    const start = i;
    let end = i;
    while (i < close && text[i] !== ';') {
      const atom = skipAtom(text, i);
      if (atom !== null && text[i] !== '#') { i = end = atom; continue; }
      if (text[i] === '#') { i = skipAtom(text, i)!; continue; }
      if (text[i] === '[' || text[i] === '(') { i = end = skipBrackets(text, i); continue; }
      if (!/\s/.test(text[i])) end = i + 1;
      i++;
    }
    if (end > start) parts.push({ start, end });
    i = skipSpace(text, i + 1);
  }
  return parts;
}

/** A part's text with whitespace collapsed and `a` written as `rdf:type`, for comparing parts. */
const normalizePart = (part: string) => part.replace(/\s+/g, ' ').trim().replace(/^a /, 'rdf:type ');
const predicateOf = (part: string) => normalizePart(part).split(' ')[0];

/**
 * Write `replacement` (a single-line `[ … ]` node) in the layout of `original`, the item it replaces:
 * the same opening, separators and closing, the parts it shares with the original in the original's
 * order and text, then its new parts. A single-line original gives the replacement unchanged.
 */
export function formatLikeOriginal(replacement: string, original: string): string {
  if (!original.trim().startsWith('[') || !replacement.trim().startsWith('[')) return replacement;
  const origParts = bracketParts(original);
  const newParts = bracketParts(replacement).map((p) => replacement.slice(p.start, p.end));
  if (origParts.length === 0 || newParts.length === 0) return replacement;
  const origTexts = origParts.map((p) => original.slice(p.start, p.end));

  const open = original.slice(original.indexOf('['), origParts[0].start);
  const sep = origParts.length > 1 ? original.slice(origParts[0].end, origParts[1].start) : ' ; ';
  const close = original.slice(origParts[origParts.length - 1].end, original.lastIndexOf(']') + 1);

  // Parts the original also has keep its text and order; changed and new parts follow, in their order.
  const rank = (part: string) => {
    const same = origTexts.findIndex((o) => normalizePart(o) === normalizePart(part));
    if (same >= 0) return same;
    const samePredicate = origTexts.findIndex((o) => predicateOf(o) === predicateOf(part));
    return samePredicate >= 0 ? samePredicate + 0.5 : origTexts.length;
  };
  const ordered = newParts
    .map((part, i) => ({ part, i, r: rank(part) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ part }) => origTexts.find((o) => normalizePart(o) === normalizePart(part)) ?? part);
  return open + ordered.join(sep) + close;
}
