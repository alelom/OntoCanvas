/**
 * Writes the data of examples/datasets/adiro-run (#235, #236): a small made-up run of a titleblock inference process, in the
 * shape such runs have. Its prov:Activity names the versions of the three ADIRO modules it was made with (prov:used), and its
 * individuals are of classes those modules declare, so OntoCanvas can offer to open them and then name the classes.
 *
 *   node scripts/makeAdiroRunExample.mjs     part-0001.nq and part-0001.nq.gz, as committed
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'datasets', 'adiro-run');
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const PROV = 'http://www.w3.org/ns/prov#';
const ADM = 'https://w3id.org/adiro/adiro_drawing_metadata#';
const APROV = 'https://w3id.org/adiro/adiro_provenance#';
const GEOM = 'https://w3id.org/adiro/adiro_geometry#';
const RUN = '<urn:example:run:1>';
const node = (local) => `<urn:example:run:1/${local}>`;
const q = (s, p, o) => `${s} <${p}> ${o} ${RUN} .`;
const text = (value) => JSON.stringify(value);

const lines = [
  q(RUN, RDF_TYPE, `<${PROV}Activity>`),
  q(RUN, LABEL, text('Example run')),
  ...['adiro_drawing_metadata/7.0.1', 'adiro_provenance/2.2.0', 'adiro_geometry/3.1.0'].map((v) => q(RUN, `${PROV}used`, `<https://w3id.org/adiro/${v}>`)),
];
for (const sheet of [1, 2]) {
  const file = node(`file${sheet}`);
  const page = node(`file${sheet}/page/1`);
  const drawing = node(`file${sheet}/page/1/drawing`);
  const titleblock = node(`file${sheet}/page/1/titleblock`);
  const box = node(`file${sheet}/page/1/titleblock/box`);
  const frame = node(`file${sheet}/page/1/frame`);
  lines.push(
    q(file, RDF_TYPE, `<${APROV}DrawingFile>`),
    q(file, LABEL, text(`Drawing ${sheet}.pdf`)),
    q(page, RDF_TYPE, `<${APROV}FilePage>`),
    q(page, `${APROV}belongsToFile`, file),
    q(drawing, RDF_TYPE, `<${ADM}DrawingSheet>`),
    q(drawing, LABEL, text(`Sheet ${sheet}`)),
    q(drawing, `${ADM}isOnPage`, page),
    q(titleblock, RDF_TYPE, `<${ADM}Titleblock>`),
    q(titleblock, LABEL, text(`Titleblock ${sheet}`)),
    q(box, RDF_TYPE, `<${GEOM}BoundingBox>`),
    q(frame, RDF_TYPE, `<${GEOM}CoordinateFrame>`),
    q(frame, `${GEOM}describesPage`, page)
  );
  for (const [n, field] of ['Project number', 'Drawing number', 'Revision'].entries()) {
    const assertion = node(`file${sheet}/assertion/${n + 1}`);
    lines.push(q(assertion, RDF_TYPE, `<${APROV}FieldAssertion>`), q(assertion, LABEL, text(`${field}, sheet ${sheet}`)));
  }
}

mkdirSync(dir, { recursive: true });
const nquads = lines.join('\n') + '\n';
writeFileSync(join(dir, 'part-0001.nq'), nquads);
writeFileSync(join(dir, 'part-0001.nq.gz'), gzipSync(Buffer.from(nquads, 'utf8'), { level: 9 }));
