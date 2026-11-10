/**
 * The example of the library of checks (#230, #231): examples/checks, whose header comment (readings.ttl) says what the Query tab
 * lists and what Run checks reports. Pinned here so the comment stays true.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Parser, Store } from 'n3';
import { createChecksLibrary } from '../../src/checks/checksLibrary';
import { validateShapes } from '../../src/checks/validateShapes';
import { groupByShape, countsText } from '../../src/checks/checksReport';

const DIR = join(__dirname, '../../examples/checks');
const BASE = 'https://example.org/examples/checks/';
const read = (path: string) => readFileSync(join(DIR, path), 'utf8');
const fetchText = async (url: string) => read(url.slice(BASE.length));
const store = (path: string) => new Store(new Parser().parse(read(path)));
const local = (iri: string) => iri.slice(iri.lastIndexOf('#') + 1);

async function load() {
  const library = createChecksLibrary({ fetchText });
  const outcome = await library.addUrl(BASE + 'manifest.json');
  return { library, outcome };
}

describe('examples/checks', () => {
  it('the manifest loads two queries, titled, and two shapes files', async () => {
    const { library, outcome } = await load();

    expect(outcome).toEqual({ queries: 2, shapes: 2, problems: [] });
    expect(library.queries().map((q) => q.title)).toEqual(['The readings of each region, with what they read', 'The readings with no text']);
    expect(library.shapesFiles().map((s) => [s.name, s.shapeCount])).toEqual([
      ['readings.shacl.ttl', 2],
      ['no-web-addresses.shacl.ttl', 1],
    ]);
  });

  it('Run checks reports what the header says', async () => {
    const { library } = await load();

    const report = await validateShapes(library.shapes(), [store('readings.ttl'), store('readings-data.ttl')]);

    expect(report.checked).toBe(2);
    expect(report.notChecked.map((t) => local(t.value))).toEqual(['NoWebAddresses']);
    expect(groupByShape(report.results).map((g) => [local(g.shape.value), countsText(g.counts), g.results.map((r) => `${r.severity} ${local(r.focusNode.value)}`)])).toEqual([
      ['Reading', '2 violations, 1 warning', ['Violation reading4', 'Violation reading6', 'Warning reading5']],
      ['TextOrOutcome', '2 violations', ['Violation reading3', 'Violation reading4']],
    ]);
  });
});
