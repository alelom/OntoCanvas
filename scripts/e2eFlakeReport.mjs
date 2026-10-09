#!/usr/bin/env node
/**
 * Measure how flaky the E2E suite is (#116): run it N times in a row and report, per test, how often it failed
 * and how long it took, plus how many runs were fully clean.
 *
 *   npm run test:e2e:flake            # 10 runs
 *   npm run test:e2e:flake -- 20      # 20 runs
 *   npm run test:e2e:flake -- 20 --out flake.json
 *
 * A test that fails in some runs and passes in others is flaky; one that fails in every run is broken. A file that
 * failed to run at all (no tests reported) is counted under its file name. Nothing here changes the tests: it only
 * reads vitest's JSON report. Run it on an otherwise idle machine, or the load is part of what it measures.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const positional = args.filter((a, i) => !a.startsWith('--') && i !== outIndex + 1);
const runs = Number(positional[0] ?? 10);
if (!Number.isInteger(runs) || runs < 1) {
  console.error('Usage: e2eFlakeReport.mjs [runs] [--out report.json]');
  process.exit(2);
}

const tmp = mkdtempSync(join(tmpdir(), 'e2e-flake-'));
const failures = new Map(); // test name -> { failed, message }
const durations = new Map(); // test name -> [ms]
const perRun = [];

for (let i = 1; i <= runs; i++) {
  const report = join(tmp, `run-${i}.json`);
  const started = Date.now();
  spawnSync('npx', ['vitest', 'run', '-c', 'vitest.e2e.config.ts', '--reporter=json', `--outputFile=${report}`], {
    stdio: ['ignore', 'ignore', 'ignore'],
    shell: process.platform === 'win32',
  });
  const seconds = Math.round((Date.now() - started) / 1000);
  if (!existsSync(report)) {
    perRun.push({ run: i, seconds, failed: ['(no report: the run itself failed)'] });
    console.log(`run ${i}/${runs}: no report, ${seconds}s`);
    continue;
  }
  const json = JSON.parse(readFileSync(report, 'utf8'));
  const failed = [];
  for (const file of json.testResults ?? []) {
    const shortFile = String(file.name).replace(/^.*[\\/]tests[\\/]e2e[\\/]/, '');
    const tests = file.assertionResults ?? [];
    // A file can fail without a failed test: it did not run, or a hook (afterAll) threw after the tests passed.
    if (file.status === 'failed' && !tests.some((t) => t.status === 'failed')) {
      const label = `${shortFile} (${tests.length === 0 ? 'file failed to run' : 'file failed after its tests ran'})`;
      failed.push(label);
      const entry = failures.get(label) ?? { failed: 0, message: String(file.message ?? '').split('\n')[0] };
      entry.failed++;
      failures.set(label, entry);
    }
    for (const t of tests) {
      const name = `${shortFile} > ${t.fullName}`;
      if (typeof t.duration === 'number') durations.set(name, [...(durations.get(name) ?? []), t.duration]);
      if (t.status === 'failed') {
        failed.push(name);
        const entry = failures.get(name) ?? { failed: 0, message: String((t.failureMessages ?? [''])[0]).split('\n')[0] };
        entry.failed++;
        failures.set(name, entry);
      }
    }
  }
  perRun.push({ run: i, seconds, failed });
  console.log(`run ${i}/${runs}: ${failed.length === 0 ? 'clean' : failed.length + ' failed'}, ${seconds}s`);
}

const clean = perRun.filter((r) => r.failed.length === 0).length;
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

console.log(`\n${clean}/${runs} runs fully clean (${Math.round((clean / runs) * 100)}%).`);
console.log(`Suite time: median ${percentile(perRun.map((r) => r.seconds), 50)}s, max ${Math.max(...perRun.map((r) => r.seconds))}s.`);

if (failures.size > 0) {
  console.log('\nFailures (times failed / runs):');
  for (const [name, { failed, message }] of [...failures].sort((a, b) => b[1].failed - a[1].failed)) {
    console.log(`  ${failed}/${runs}  ${name}\n          ${message.slice(0, 120)}`);
  }
}

console.log('\nSlowest tests (worst time seen, median):');
for (const [name, ms] of [...durations].sort((a, b) => Math.max(...b[1]) - Math.max(...a[1])).slice(0, 10)) {
  console.log(`  ${Math.max(...ms)}ms (median ${percentile(ms, 50)}ms)  ${name}`);
}

if (outFile) {
  writeFileSync(
    outFile,
    JSON.stringify(
      { runs, clean, perRun, failures: Object.fromEntries(failures), slowest: [...durations].map(([name, ms]) => ({ name, max: Math.max(...ms), median: percentile(ms, 50) })).sort((a, b) => b.max - a.max).slice(0, 25) },
      null,
      2
    )
  );
  console.log(`\nWrote ${outFile}`);
}
rmSync(tmp, { recursive: true, force: true });
process.exit(clean === runs ? 0 : 1);
