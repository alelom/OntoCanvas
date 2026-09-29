#!/usr/bin/env node
/**
 * Internal-name hygiene guard.
 *
 * Fails (exit 1) if any tracked text file contains an internal-only name/pattern. Purpose: keep
 * internal infrastructure detail (company email domains, private package feeds, internal trackers,
 * client names, private hostnames/IPs) out of this PUBLIC repository.
 *
 * Pattern sources:
 *  - scripts/ci/internal-names.config.json  — GENERIC, non-identifying patterns (safe to be public).
 *  - INTERNAL_NAME_PATTERNS env / CI secret  — organisation-specific literals, injected at runtime
 *    so they never live in the repo. Separate multiple patterns with newlines or ';'.
 *
 * Usage: node scripts/ci/check-internal-names.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { compilePatterns, scanText } from './internalNameScan.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const config = JSON.parse(readFileSync(join(here, 'internal-names.config.json'), 'utf-8'));

// Extra, organisation-specific patterns from the environment (CI secret).
const envPatterns = (process.env.INTERNAL_NAME_PATTERNS ?? '')
  .split(/[\n;]/)
  .map((s) => s.trim())
  .filter(Boolean);

const patterns = compilePatterns([...(config.patterns ?? []), ...envPatterns]);
const allow = compilePatterns(config.allow ?? []);

if (patterns.length === 0) {
  console.log('[check-internal-names] no patterns configured; nothing to check.');
  process.exit(0);
}

// Tracked files only (respects .gitignore); scan a text subset.
const tracked = execSync('git ls-files -z', { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
  .toString('utf-8')
  .split('\0')
  .filter(Boolean);

const includeExt = new Set(config.includeExt ?? []);
const excludeDirs = config.excludeDirs ?? [];
const excludeFiles = new Set(config.excludeFiles ?? []);

const shouldScan = (path) => {
  const p = path.replace(/\\/g, '/');
  if (excludeDirs.some((d) => p.startsWith(d) || p.includes('/' + d))) return false;
  if (excludeFiles.has(p) || excludeFiles.has(p.split('/').pop())) return false;
  if (p.endsWith('.min.js') || p.endsWith('.map')) return false;
  const dot = p.lastIndexOf('.');
  const ext = dot >= 0 ? p.slice(dot) : '';
  return includeExt.has(ext);
};

const findings = [];
for (const rel of tracked) {
  if (!shouldScan(rel)) continue;
  let text;
  try {
    text = readFileSync(join(repoRoot, rel), 'utf-8');
  } catch {
    continue; // unreadable / binary — skip
  }
  findings.push(...scanText({ file: rel, text, patterns, allow }));
}

if (findings.length > 0) {
  console.error(`\n✖ Internal-name hygiene check failed — ${findings.length} match(es) in a public repo:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}:${f.column}  "${f.match}"  (/${f.pattern}/i)`);
  }
  console.error('\nRemove the internal reference, or — if it is a legitimate public reference — add it to');
  console.error('the "allow" list in scripts/ci/internal-names.config.json. See scripts/ci/check-internal-names.mjs.\n');
  process.exit(1);
}

console.log('✓ Internal-name hygiene check passed — no internal names found in tracked files.');
process.exit(0);
