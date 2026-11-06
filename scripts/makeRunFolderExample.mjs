/**
 * Writes examples/datasets/run-folder (#227, #228): the folder of a made-up run as a batch process leaves it. Three parts of
 * gzip-compressed N-Quads in two named graphs, a Turtle file about the run, an image of each sheet's titleblock, and a README.
 * The image paths in the data are relative to the folder above runs/, as real runs write them: `runs/run-0001/images/…`.
 *
 *   node scripts/makeRunFolderExample.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../examples/datasets/run-folder');
const RUN = join(ROOT, 'runs/run-0001');
const NS = 'http://example.org/examples/run-folder#';
const DATA = 'http://example.org/examples/run-folder/run-0001/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const XSD_INT = 'http://www.w3.org/2001/XMLSchema#integer';

const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

// --- The data ---------------------------------------------------------------------------------------------------------------

const iri = (v) => `<${v}>`;
const literal = (v) => JSON.stringify(String(v));
const quad = (s, p, o, g) => `${iri(s)} ${iri(p)} ${o} ${iri(g)} .`;

/** One sheet of the run, with its titleblock: the titleblock names its image by a path relative to the folder above runs/. */
function sheet(n, graph) {
  const s = `${DATA}sheet-${n}`;
  const tb = `${DATA}sheet-${n}/titleblock`;
  return [
    quad(s, RDF_TYPE, iri(`${NS}Sheet`), graph),
    quad(s, RDFS_LABEL, literal(`Sheet ${n}`), graph),
    quad(s, `${NS}drawingNumber`, literal(`A-10${n}`), graph),
    quad(s, `${NS}pageNumber`, `"${n}"^^${iri(XSD_INT)}`, graph),
    quad(s, `${NS}partOf`, iri(`${DATA}run`), graph),
    quad(s, `${NS}hasTitleblock`, iri(tb), graph),
    quad(tb, RDF_TYPE, iri(`${NS}Titleblock`), graph),
    quad(tb, RDFS_LABEL, literal(`Titleblock of sheet ${n}`), graph),
    quad(tb, `${NS}imagePath`, literal(`runs/run-0001/images/sheet-${n}/titleblock.png`), graph),
  ];
}

const BATCH_1 = `${DATA}batch/1`;
const BATCH_2 = `${DATA}batch/2`;
const parts = [
  [...sheet(1, BATCH_1), ...sheet(2, BATCH_1)],
  sheet(3, BATCH_1),
  // Sheet 4's image is not in the folder: its detail says so.
  [...sheet(4, BATCH_2), ...sheet(5, BATCH_2)],
];
parts.forEach((lines, i) => write(join(RUN, `part-000${i + 1}.nq.gz`), gzipSync(Buffer.from(`${lines.join('\n')}\n`, 'utf8'), { level: 9 })));

write(
  join(RUN, 'run.ttl'),
  `# The run itself (#227): plain Turtle beside the compressed parts, in no named graph.
@prefix : <${NS}> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

<${DATA}run> a prov:Activity, :Run ;
    rdfs:label "Run 0001" ;
    prov:startedAtTime "2026-11-06T09:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
`
);

write(
  join(RUN, 'README.md'),
  `# Run 0001

What a batch process left: three parts of compressed N-Quads, the run in Turtle, and an image per sheet. This file is not data:
opening the folder skips it.
`
);

// --- The images: a titleblock drawing per sheet, with the sheet's number --------------------------------------------------------

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

/** A grey-scale PNG of `width` × `height` from `pixel(x, y)`, 0 black to 255 white. */
function png(width, height, pixel) {
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rows[y * (width + 1) + 1 + x] = pixel(x, y);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grey-scale
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Digits 3 wide and 5 high. */
const DIGITS = { 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 5: ['111', '100', '111', '001', '111'] };

function titleblock(n) {
  const [w, h] = [320, 160];
  const inBox = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const line = (x, y, x0, y0, x1, y1) => inBox(x, y, x0, y0, x1, y1) && (x - x0 < 2 || x1 - x < 2 || y - y0 < 2 || y1 - y < 2);
  return png(w, h, (x, y) => {
    // The frame, the cells of the titleblock, and grey lines standing for its text.
    if (line(x, y, 4, 4, w - 5, h - 5) || line(x, y, 4, 4, 200, 60) || line(x, y, 200, 4, w - 5, 60) || line(x, y, 4, 60, w - 5, 110)) return 0;
    if ((y === 24 || y === 40) && x > 16 && x < 180) return 140;
    if ((y === 78 || y === 94) && x > 16 && x < 300) return 170;
    // The sheet's number, large, in the corner cell.
    const glyph = DIGITS[n];
    const [gx, gy, scale] = [244, 12, 8];
    if (glyph && inBox(x, y, gx, gy, gx + 3 * scale - 1, gy + 5 * scale - 1) && glyph[Math.floor((y - gy) / scale)][Math.floor((x - gx) / scale)] === '1') return 30;
    return 255;
  });
}

for (const n of [1, 2, 3, 5]) write(join(RUN, `images/sheet-${n}/titleblock.png`), titleblock(n));
