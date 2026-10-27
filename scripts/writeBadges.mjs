#!/usr/bin/env node
/**
 * Writes the README badge files (#174, #175) from the results the badges workflow collected.
 *
 *   node scripts/writeBadges.mjs <results-dir> <output-dir>
 *
 * Each result is `{ name, label, status }` (`status` is a job status: success, failure, cancelled). The output is a
 * shields.io endpoint file per unit/area (`unit.json`, `e2e-<area>.json`) and an overall `e2e.json`. An area with no
 * result shows as unknown, so a skipped job never reads as passing.
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
 * @param {string[]} areaNames every area, so one without a result is shown as unknown
 * @returns {Record<string, object>} file name -> badge
 */
export function buildBadges(results, areaNames) {
  const byName = new Map(results.map((r) => [r.name, r]));
  const files = {};
  const unit = byName.get('unit');
  files['unit.json'] = badge('unit tests', unit?.status);
  const statuses = [];
  for (const area of areaNames) {
    const r = byName.get(`e2e-${area}`);
    files[`e2e-${area}.json`] = badge(`E2E ${area}`, r?.status);
    statuses.push(r?.status);
  }
  const failing = statuses.filter((s) => s === 'failure').length;
  const unknown = statuses.filter((s) => s !== 'success' && s !== 'failure').length;
  files['e2e.json'] = failing
    ? { schemaVersion: 1, label: 'E2E', message: `${failing} of ${areaNames.length} failing`, color: 'red' }
    : unknown
      ? { schemaVersion: 1, label: 'E2E', message: `${unknown} of ${areaNames.length} unknown`, color: 'lightgrey' }
      : { schemaVersion: 1, label: 'E2E', message: 'passing', color: 'brightgreen' };
  return files;
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
