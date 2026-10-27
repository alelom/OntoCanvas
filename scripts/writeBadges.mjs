/**
 * Writes the two README badge files (#174, #175) from the results the verification of main collected.
 *
 *   node scripts/writeBadges.mjs <results-dir> <output-dir>
 *
 * Each result is `{ name, label, status }` (`status` is a job status: success, failure, cancelled). There are two
 * results, `unit` (the whole unit suite) and `e2e` (the whole E2E suite), and two shields.io endpoint files,
 * `unit.json` and `e2e.json`. A suite with no result counts as unknown, so a skipped job never reads as passing.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The shields.io endpoint JSON for one job status. */
export function badge(label, status) {
  if (status === 'success') return { schemaVersion: 1, label, message: 'passing', color: 'brightgreen' };
  if (status === 'failure') return { schemaVersion: 1, label, message: 'failing', color: 'red' };
  return { schemaVersion: 1, label, message: 'unknown', color: 'lightgrey' };
}

/**
 * @param {{ name: string, label: string, status: string }[]} results what the jobs recorded
 * @returns {{ 'unit.json': object, 'e2e.json': object }}
 */
export function buildBadges(results) {
  const status = (name) => results.find((r) => r.name === name)?.status;
  return { 'unit.json': badge('unit tests', status('unit')), 'e2e.json': badge('E2E tests', status('e2e')) };
}

function main(argv) {
  const [resultsDir, outDir] = argv;
  if (!resultsDir || !outDir) { console.error('usage: writeBadges.mjs <results-dir> <output-dir>'); return 2; }
  const results = readdirSync(resultsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(resultsDir, f), 'utf8')));
  const files = buildBadges(results);
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), JSON.stringify(content) + '\n');
  console.log(`wrote ${Object.keys(files).length} badge files to ${outDir}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
