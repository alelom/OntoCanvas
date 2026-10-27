#!/usr/bin/env node
/**
 * Writes the two README badge files (#174, #175) from the results the verification of main collected.
 *
 *   node scripts/writeBadges.mjs <results-dir> <output-dir>
 *
 * Each result is `{ name, label, status }` (`status` is a job status: success, failure, cancelled). The output is two
 * shields.io endpoint files: `unit.json` (the whole unit suite) and `e2e.json` (the whole E2E suite, one result per
 * area). An area with no result counts as unknown, so a skipped job never reads as passing.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The shields.io endpoint JSON for one job status. */
export function badge(label, status) {
  if (status === 'success') return { schemaVersion: 1, label, message: 'passing', color: 'brightgreen' };
  if (status === 'failure') return { schemaVersion: 1, label, message: 'failing', color: 'red' };
  return { schemaVersion: 1, label, message: 'unknown', color: 'lightgrey' };
}

/**
 * @param {{ name: string, label: string, status: string }[]} results what the jobs recorded
 * @param {string[]} areaNames every E2E area, so one without a result counts as unknown
 * @returns {{ 'unit.json': object, 'e2e.json': object }}
 */
export function buildBadges(results, areaNames) {
  const byName = new Map(results.map((r) => [r.name, r]));
  const statuses = areaNames.map((area) => byName.get(`e2e-${area}`)?.status);
  const failing = statuses.filter((s) => s === 'failure').length;
  const unknown = statuses.filter((s) => s !== 'success' && s !== 'failure').length;
  const e2e = failing
    ? { schemaVersion: 1, label: 'E2E tests', message: `${failing} of ${areaNames.length} areas failing`, color: 'red' }
    : unknown
      ? { schemaVersion: 1, label: 'E2E tests', message: `${unknown} of ${areaNames.length} areas unknown`, color: 'lightgrey' }
      : { schemaVersion: 1, label: 'E2E tests', message: 'passing', color: 'brightgreen' };
  return { 'unit.json': badge('unit tests', byName.get('unit')?.status), 'e2e.json': e2e };
}

function main(argv) {
  const [resultsDir, outDir] = argv;
  if (!resultsDir || !outDir) { console.error('usage: writeBadges.mjs <results-dir> <output-dir>'); return 2; }
  const results = readdirSync(resultsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(resultsDir, f), 'utf8')));
  const areas = Object.keys(JSON.parse(readFileSync(join(ROOT, 'tests', 'e2e', 'areas.json'), 'utf8')).areas);
  const files = buildBadges(results, areas);
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), JSON.stringify(content) + '\n');
  console.log(`wrote ${Object.keys(files).length} badge files to ${outDir}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
