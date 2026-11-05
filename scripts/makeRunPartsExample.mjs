/**
 * Writes the data of examples/datasets/run-parts (#221, #222, #223): a run of a batch process split into two numbered parts of
 * N-Quads, one named graph per batch, each part also gzip-compressed. The ontology, vocabulary.ttl, is written by hand.
 *
 *   node scripts/makeRunPartsExample.mjs            the two parts, plain and compressed, and run.trig, as committed
 *   node scripts/makeRunPartsExample.mjs --large       also part-0003.nq.gz (not committed): adding it asks first, then loads
 *   node scripts/makeRunPartsExample.mjs --too-large   also part-0004.nq.gz (not committed): asks, then stops at the limit
 */
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Parser, Writer } from 'n3';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'datasets', 'run-parts');
const NS = 'http://example.org/examples/run-parts#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const DECIMAL = 'http://www.w3.org/2001/XMLSchema#decimal';
const batch = (n) => `<http://example.org/examples/run-parts/batch/${n}>`;
const iri = (local) => `<${NS}${local}>`;
const literal = (text) => `"${text}"`;

/** The quads of one batch: readings `from` to `to`, made by the three sensors in turn, each one pointing to the next. */
function readings(from, to, graph) {
  const lines = [];
  for (let i = from; i <= to; i++) {
    const sensor = `sensor${((i - 1) % 3) + 1}`;
    const value = (18 + ((i * 7) % 50) / 10).toFixed(1);
    lines.push(
      `${iri(`reading${i}`)} <${RDF_TYPE}> ${iri('Reading')} ${graph} .`,
      `${iri(`reading${i}`)} <${LABEL}> ${literal(`Reading ${i}`)} ${graph} .`,
      `${iri(`reading${i}`)} ${iri('madeBy')} ${iri(sensor)} ${graph} .`,
      `${iri(`reading${i}`)} ${iri('value')} "${value}"^^<${DECIMAL}> ${graph} .`,
      // The last reading of part 1 points to the first of part 2: with part 1 alone, it points to a reading nothing describes.
      `${iri(`reading${i}`)} ${iri('next')} ${iri(`reading${i + 1}`)} ${graph} .`
    );
  }
  return lines;
}

function sensors(graph) {
  return [1, 2, 3].flatMap((n) => [
    `${iri(`sensor${n}`)} <${RDF_TYPE}> ${iri('Sensor')} ${graph} .`,
    `${iri(`sensor${n}`)} <${LABEL}> ${literal(`Sensor ${n}`)} ${graph} .`,
  ]);
}

function write(name, lines) {
  const text = lines.join('\n') + '\n';
  writeFileSync(join(dir, `${name}.gz`), gzipSync(Buffer.from(text, 'utf8'), { level: 9 }));
  return text;
}

// Part 1: batch 1, the sensors and readings 1 to 15. Part 2: batch 2, readings 16 to 30; the last points to no reading.
const part1 = write('part-0001.nq', [...sensors(batch(1)), ...readings(1, 15, batch(1))]);
writeFileSync(join(dir, 'part-0001.nq'), part1);
const part2 = write('part-0002.nq', readings(16, 30, batch(2)).filter((line) => !line.includes(`${NS}reading31>`)));

// The whole run in one TriG file (#224): both batches, each graph with a label stated inside it.
const graphLabel = (n) => `${batch(n)} <${LABEL}> ${literal(`Batch ${n}`)} ${batch(n)} .`;
const quads = new Parser({ format: 'N-Quads' }).parse([part1, graphLabel(1), part2, graphLabel(2)].join('\n'));
const writer = new Writer({ format: 'application/trig', prefixes: { '': NS, rdfs: 'http://www.w3.org/2000/01/rdf-schema#', xsd: 'http://www.w3.org/2001/XMLSchema#' } });
writer.addQuads(quads);
writer.end((error, trig) => {
  if (error) throw error;
  writeFileSync(join(dir, 'run.trig'), trig);
});

// Not committed, to try the size checks. Each estimate (20 times the compressed size) is over the 2 MB at which adding asks.
if (process.argv.includes('--large')) {
  // Some 6,000 readings, about 5 MB of data: asks, then loads.
  write('part-0003.nq', readings(31, 6030, batch(3)));
}
if (process.argv.includes('--too-large')) {
  // Some 20,000 readings, about 17 MB of data: asks, then stops at 10 MB decompressed and adds nothing.
  write('part-0004.nq', readings(6031, 26030, batch(4)));
}
