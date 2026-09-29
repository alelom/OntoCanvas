import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain .mjs module without type declarations
import { compilePatterns, scanText } from '../../scripts/ci/internalNameScan.mjs';

// NOTE: this file necessarily contains sample strings that match the guard's own patterns
// (e.g. pkgs.dev.azure.com, a private IP). It is therefore excluded from the hygiene scan via
// "excludeFiles" in scripts/ci/internal-names.config.json. Values here are synthetic — no real
// company/org names.
describe('internal-name hygiene scan', () => {
  const patterns = compilePatterns([
    '[a-z0-9._%+-]+@example-corp\\.com',
    'pkgs\\.dev\\.azure\\.com',
    '\\b(?:10|192\\.168|172\\.(?:1[6-9]|2\\d|3[01]))\\.\\d{1,3}\\.\\d{1,3}(?:\\.\\d{1,3})?\\b',
  ]);
  const allow = compilePatterns(['github\\.io/ADIRO', 'w3id\\.org/adiro']);

  it('flags an internal email', () => {
    const f = scanText({ file: 'a.txt', text: 'contact alice@example-corp.com now', patterns, allow });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ file: 'a.txt', line: 1, match: 'alice@example-corp.com' });
  });

  it('flags an internal Azure DevOps feed URL', () => {
    const f = scanText({ file: 'b.md', text: 'x\nhttps://pkgs.dev.azure.com/ORG/_packaging/feed', patterns, allow });
    expect(f).toHaveLength(1);
    expect(f[0].line).toBe(2);
  });

  it('does NOT flag legitimate public references (allowlist)', () => {
    const text = 'load https://example.github.io/ADIRO/aec_geometry.ttl';
    expect(scanText({ file: 'c.ttl', text, patterns, allow })).toHaveLength(0);
  });

  it('does NOT flag a startsWith prefix like "192.168." with no full address', () => {
    // e.g. src/utils/debug.ts: hostname.startsWith('192.168.')
    const text = "if (hostname.startsWith('192.168.')) enableDebug();";
    expect(scanText({ file: 'debug.ts', text, patterns, allow })).toHaveLength(0);
  });

  it('flags a full RFC1918 address', () => {
    expect(scanText({ file: 'd.txt', text: 'host 10.4.2.9', patterns, allow })).toHaveLength(1);
  });

  it('returns nothing for clean text', () => {
    expect(scanText({ file: 'e.ts', text: 'const x = 1;\nexport default x;', patterns, allow })).toHaveLength(0);
  });
});
