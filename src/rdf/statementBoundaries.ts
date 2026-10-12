/**
 * Where a Turtle statement starts on the line where the previous one ends (#124):
 *
 *   … owl:onClass _:b3.:RevisionTable rdf:type owl:Class ;
 *
 * The source-preserving serializer reads statements line by line, so a statement that does not
 * start a line is otherwise taken for part of the one before it.
 */

/**
 * The `.` that ends a statement on `line`, at or after `from`, and where the next statement starts,
 * when one starts on the same line; otherwise null. Only a `.` outside strings, IRIs, brackets and
 * comments counts, and only where it cannot belong to the token before it: `_:b.c` is one label,
 * `ex:a.b` one prefixed name, `1.5` one number.
 */
export function statementStartAfterPeriod(line: string, from = 0): { period: number; next: number } | null {
  let depth = 0;
  let quote: string | null = null;
  let inIri = false;
  for (let i = from; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (inIri) {
      if (c === '>') inIri = false;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '<') inIri = true;
    else if (c === '#') return null;
    else if (c === '[' || c === '(') depth++;
    // A bracket opened on an earlier line can close here (`] . :Next …`): depth never goes below 0.
    else if (c === ']' || c === ')') depth = Math.max(0, depth - 1);
    else if (c === '.' && depth === 0 && endsToken(line, i)) {
      const next = line.slice(i + 1).search(/\S/);
      if (next < 0 || line[i + 1 + next] === '#') return null;
      return { period: i, next: i + 1 + next };
    }
  }
  return null;
}

/** Whether the `.` at `i` ends the statement rather than continuing the token it follows. */
function endsToken(line: string, i: number): boolean {
  const next = line[i + 1];
  if (next === undefined || /\s/.test(next)) return true;
  if (/[>"')\]]/.test(line[i - 1] ?? '')) return true;
  const token = /[^\s,;()[\]]*$/.exec(line.slice(0, i))![0];
  // A language tag has no `.`; a blank-node label can hold one, but never before a `:`.
  return token.startsWith('@') || (token.startsWith('_:') && !/[\w.-]/.test(next));
}
