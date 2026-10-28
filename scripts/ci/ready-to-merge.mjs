/**
 * The gate "Ready to merge" (test.yml): green when every job it waited for passed. A skipped job counts as passed (an
 * E2E area nothing touched is skipped on purpose); a failed or a cancelled one does not. It reads the results of all the
 * jobs from `toJSON(needs)`, so a new job cannot be left out of it (#189).
 */
const needs = JSON.parse(process.env.NEEDS ?? '{}');
if (Object.keys(needs).length === 0) {
  console.log('No job results were passed to the gate (NEEDS is empty): the workflow is misconfigured.');
  process.exit(1);
}
const bad = Object.entries(needs).filter(([, job]) => job.result === 'failure' || job.result === 'cancelled');

if (bad.length) {
  for (const [id, job] of bad) console.log(`${id}: ${job.result}`);
  console.log('A job did not pass.');
  process.exit(1);
}
const ran = Object.values(needs).filter((job) => job.result === 'success').length;
const skipped = Object.values(needs).filter((job) => job.result === 'skipped').length;
console.log(`All the jobs that ran passed (${ran} passed, ${skipped} skipped).`);
