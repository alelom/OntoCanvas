/**
 * Pure scanning logic for the internal-name hygiene guard.
 *
 * Kept free of any filesystem/git access so it can be unit-tested directly. The CLI wrapper
 * (check-internal-names.mjs) supplies the file list and content.
 */

/** Compile an array of pattern strings into case-insensitive RegExps. */
export function compilePatterns(patternStrings) {
  return (patternStrings ?? [])
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .map((s) => new RegExp(s, 'i'));
}

/**
 * Scan one file's text for any denylisted pattern.
 * A line is skipped when it matches any allow pattern (e.g. a legitimate public URL).
 *
 * @returns array of { file, line, column, match, pattern }
 */
export function scanText({ file, text, patterns, allow = [] }) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (allow.some((a) => a.test(line))) continue;
    for (const p of patterns) {
      const m = p.exec(line);
      if (m) {
        findings.push({
          file,
          line: i + 1,
          column: (m.index ?? 0) + 1,
          match: m[0],
          pattern: p.source,
        });
        break; // one finding per line is enough to flag it
      }
    }
  }
  return findings;
}
