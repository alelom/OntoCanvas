/**
 * Line-level diff utilities for asserting the "minimal atomic diff" contract on the
 * custom TTL serializer. Edits (rename, comment, add class, etc.) must touch only the
 * lines they logically affect — unrelated lines must remain byte-for-byte identical.
 *
 * Unlike helpers.ts#verifyOnlyLinesChanged (which requires equal line counts and compares
 * positionally), these use a Longest-Common-Subsequence diff so insertions/deletions are
 * reported accurately as added/removed hunks.
 */

export interface LineDiff {
  /** Lines present in `after` but not matched in `before` (insertions). */
  added: string[];
  /** Lines present in `before` but not matched in `after` (deletions). */
  removed: string[];
  /** Count of lines that are identical and unmoved between the two. */
  unchangedCount: number;
}

/**
 * Compute a line-level diff between two strings using LCS.
 * Line endings are normalized to '\n' for comparison so CRLF/LF differences are ignored.
 */
export function lineDiff(before: string, after: string): LineDiff {
  const a = before.replace(/\r\n/g, '\n').split('\n');
  const b = after.replace(/\r\n/g, '\n').split('\n');

  // LCS length table.
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  let unchangedCount = 0;
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      unchangedCount++;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      removed.push(a[i]);
      i++;
    } else {
      added.push(b[j]);
      j++;
    }
  }
  while (i < m) removed.push(a[i++]);
  while (j < n) added.push(b[j++]);

  return { added, removed, unchangedCount };
}

/** Trim + drop empty lines, for comparisons that ignore pure whitespace churn. */
function meaningful(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l !== '');
}

/**
 * A diff that ignores added/removed blank lines and pure whitespace-only changes.
 * Useful when we care about content churn, not formatting reflow.
 */
export function meaningfulLineDiff(before: string, after: string): LineDiff {
  const raw = lineDiff(before, after);
  return {
    added: meaningful(raw.added),
    removed: meaningful(raw.removed),
    unchangedCount: raw.unchangedCount,
  };
}

/**
 * Total number of changed lines (added + removed), ignoring blank-line churn.
 */
export function changedLineCount(before: string, after: string): number {
  const d = meaningfulLineDiff(before, after);
  return d.added.length + d.removed.length;
}

/**
 * Human-readable unified-ish diff for test failure messages.
 */
export function formatDiff(before: string, after: string): string {
  const d = lineDiff(before, after);
  const lines: string[] = [];
  for (const r of d.removed) lines.push(`- ${r}`);
  for (const a of d.added) lines.push(`+ ${a}`);
  return lines.length ? lines.join('\n') : '(no differences)';
}

/**
 * Returns true if the attribution comment version line is the only meaningful change.
 * The serializer rewrites `# Created/edited with ... version X.Y.Z`, which is expected churn.
 */
export function isAttributionOnlyChange(before: string, after: string): boolean {
  const d = meaningfulLineDiff(before, after);
  const isAttribution = (l: string): boolean =>
    /Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\//.test(l);
  return d.added.every(isAttribution) && d.removed.every(isAttribution);
}

/**
 * Extract the verbatim text of a top-level statement block by its subject token
 * (e.g. ":Room"). Returns the text from the subject line up to and including the
 * line that terminates the statement with " ." — the same notion of a block the
 * source-preservation parser uses. Returns null if the subject is not found.
 *
 * Line endings are normalized to '\n'.
 */
export function extractBlock(content: string, subjectToken: string): string | null {
  const text = content.replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  // A block starts at a non-indented line beginning with the subject token followed
  // by whitespace (so ":Room" does not match ":Roominess").
  const startRe = new RegExp(`^${subjectToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  // The block ends at the first line (>= start) whose trimmed text ends with '.'
  // and is not inside a bracket. We track bracket depth to avoid ending early on a
  // '.' that appears within an inline blank node (rare) — conservative but adequate.
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
    }
    const trimmed = lines[i].trim();
    if (depth <= 0 && trimmed.endsWith('.')) {
      return lines.slice(start, i + 1).join('\n');
    }
  }
  // Unterminated — return from start to end.
  return lines.slice(start).join('\n');
}

/**
 * Assert that a named block is byte-for-byte identical (modulo line endings) between
 * two documents. Returns { equal, before, after } so callers can produce good messages.
 */
export function blockUnchanged(
  before: string,
  after: string,
  subjectToken: string
): { equal: boolean; before: string | null; after: string | null } {
  const b = extractBlock(before, subjectToken);
  const a = extractBlock(after, subjectToken);
  return { equal: b !== null && a !== null && b === a, before: b, after: a };
}
