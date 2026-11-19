/**
 * Writes the data of examples/datasets/adiro-job (#251): a small made-up job of a titleblock inference process, as such a job is
 * left on disk: a folder tree with one folder per run, every run with a part-0001 of its own, and the merged parts of the runs
 * that finished.
 *
 *   job/runs/run-a/part-0001.nq.gz, part-0002.nq.gz    a run in two parts, one named graph
 *   job/runs/run-b/part-0001.nq.gz                      another run, its own named graph
 *   job/compacted/part-0001.nq.gz                       run-a again, merged (the same quads)
 *   job/images/…, job_start.json, job_end.json          not data: images kept for previews, metadata skipped
 *
 *   node scripts/makeAdiroJobExample.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'datasets', 'adiro-job');
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const PROV = 'http://www.w3.org/ns/prov#';
const ADM = 'https://w3id.org/adiro/adiro_drawing_metadata#';
const APROV = 'https://w3id.org/adiro/adiro_provenance#';
const GEOM = 'https://w3id.org/adiro/adiro_geometry#';
const text = (value) => JSON.stringify(value);

/** The quads of one sheet of a run, in the run's graph. */
function sheetQuads(run, sheet) {
  const graph = `<urn:example:job:${run}>`;
  const node = (local) => `<urn:example:job:${run}/${local}>`;
  const q = (s, p, o) => `${s} <${p}> ${o} ${graph} .`;
  const [file, page, drawing, titleblock, box] = ['file', 'page', 'drawing', 'titleblock', 'box'].map((n) => node(`${n}${sheet}`));
  const lines = [
    q(file, RDF_TYPE, `<${APROV}DrawingFile>`),
    q(file, LABEL, text(`Drawing ${sheet} of ${run}.pdf`)),
    q(page, RDF_TYPE, `<${APROV}FilePage>`),
    q(page, `${APROV}belongsToFile`, file),
    q(drawing, RDF_TYPE, `<${ADM}DrawingSheet>`),
    q(drawing, LABEL, text(`Sheet ${sheet} of ${run}`)),
    q(drawing, `${ADM}isOnPage`, page),
    q(titleblock, RDF_TYPE, `<${ADM}Titleblock>`),
    q(box, RDF_TYPE, `<${GEOM}BoundingBox>`),
  ];
  for (const [n, field] of ['Project number', 'Drawing number'].entries()) {
    const assertion = node(`assertion${sheet}-${n + 1}`);
    lines.push(q(assertion, RDF_TYPE, `<${APROV}FieldAssertion>`), q(assertion, LABEL, text(`${field}, sheet ${sheet} of ${run}`)));
  }
  return lines;
}

/** The activity of a run, naming the ontology versions it was made with. */
function activityQuads(run) {
  const graph = `<urn:example:job:${run}>`;
  return [
    `${graph} <${RDF_TYPE}> <${PROV}Activity> ${graph} .`,
    `${graph} <${LABEL}> ${text(`Run ${run}`)} ${graph} .`,
    ...['adiro_drawing_metadata/7.0.1', 'adiro_provenance/2.2.0', 'adiro_geometry/3.1.0'].map((v) => `${graph} <${PROV}used> <https://w3id.org/adiro/${v}> ${graph} .`),
  ];
}

const write = (path, content) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};
const writeGz = (path, lines) => write(path, gzipSync(Buffer.from(lines.join('\n') + '\n', 'utf8'), { level: 9 }));

const runA = [[...activityQuads('run-a'), ...sheetQuads('run-a', 1)], sheetQuads('run-a', 2)];
const runB = [[...activityQuads('run-b'), ...sheetQuads('run-b', 1), ...sheetQuads('run-b', 2)]];
writeGz('job/runs/run-a/part-0001.nq.gz', runA[0]);
writeGz('job/runs/run-a/part-0002.nq.gz', runA[1]);
writeGz('job/runs/run-b/part-0001.nq.gz', runB[0]);
writeGz('job/compacted/part-0001.nq.gz', runA.flat());
write('job/job_start.json', JSON.stringify({ job: 'example-job', runs: ['run-a', 'run-b'] }, null, 2) + '\n');
write('job/job_end.json', JSON.stringify({ job: 'example-job', finished: ['run-a'] }, null, 2) + '\n');
// A 1x1 PNG, as the images folder of a job holds crops.
write('job/images/run-a/crop-1.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHPzKcwAAAABJRU5ErkJggg==', 'base64'));
