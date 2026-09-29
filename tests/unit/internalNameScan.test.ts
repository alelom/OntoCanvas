import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain .mjs module without type declarations
import { compilePatterns, scanText } from '../../scripts/ci/internalNameScan.mjs';

describe('internal-name hygiene scan', () => {
  const patterns = compilePatterns([
    '[a-z0-9._%+-]+@burohappold\\.com',
    'pkgs\\.dev\\.azure\\.com',
    '\\b(?:10|192\\.168|172\\.(?:1[6-9]|2\\d|3[01]))\\.\\d{1,3}\\.\\d{1,3}(?:\\.\\d{1,3})?\\b',
  ]);
  const allow = compilePatterns(['burohappoldmachinelearning\\.github\\.io', 'w3id\\.org/adiro']);

  it('flags an internal email', () => {
    const f = scanText({ file: 'a.txt', text: 'contact alice@burohappold.com now', patterns, allow });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ file: 'a.txt', line: 1, match: 'alice@burohappold.com' });
  });

  it('flags an internal Azure DevOps feed URL', () => {
    const f = scanText({ file: 'b.md', text: 'x\nhttps://pkgs.dev.azure.com/ORG/_packaging/feed', patterns, allow });
    expect(f).toHaveLength(1);
    expect(f[0].line).toBe(2);
  });

  it('does NOT flag legitimate public references (allowlist)', () => {
    const text = 'load https://burohappoldmachinelearning.github.io/ADIRO/aec_geometry.ttl';
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
