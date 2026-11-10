/**
 * SHACL validation of the ontology and its data (#231): over the RDF merge of every graph of every store, one shape at a time with
 * progress and Stop, and the SPARQL-based shapes listed as not checked rather than run.
 */
import { describe, it, expect, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { mergedDataset, shapesToRun, validateShapes } from '../../src/checks/validateShapes';
import { QueryStopped } from '../../src/sparql/readCapped';

const NS = 'http://example.org/d#';
const PREFIXES = `@prefix : <${NS}> . @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n`;
const store = (text: string, format = 'application/trig') => new Store(new Parser({ format }).parse(PREFIXES + text));

const SHAPES = store(`
:Reading a sh:NodeShape ; sh:targetClass :TextReading ;
  sh:property [ sh:path :isReadingOf ; sh:minCount 1 ; sh:maxCount 1 ; sh:message "A reading reads exactly one region." ] ,
              [ sh:path :readText ; sh:datatype xsd:string ; sh:severity sh:Warning ] .
:Room a sh:NodeShape , rdfs:Class ; sh:property [ sh:path [ sh:inversePath :inRoom ] ; sh:minCount 1 ] .
:Nested a sh:NodeShape ; sh:property [ sh:path :x ; sh:minCount 1 ] .
:NoHttp a sh:NodeShape ; sh:targetClass :TextReading ;
  sh:sparql [ a sh:SPARQLConstraint ; sh:select "SELECT $this WHERE { $this :readText ?v }" ] .
`);

describe('shapesToRun', () => {
  it('is the shapes with a target, and the node shapes that are classes too; not a shape only used from another', () => {
    expect(shapesToRun(SHAPES).map((t) => t.value).sort()).toEqual([NS + 'NoHttp', NS + 'Reading', NS + 'Room']);
  });
});

describe('mergedDataset', () => {
  it('finds a triple once however many graphs and stores state it', () => {
    const a = store(':g1 { :r :p :o } :g2 { :r :p :o }');
    const b = store(':r :p :o . :r :p :o2 .');
    const dataset = mergedDataset([a, b]);

    const found = dataset.match(null, null, null) as unknown as Iterable<unknown> & { size: number };
    expect(found.size).toBe(2);
    expect([...found]).toHaveLength(2);
  });
});

describe('validateShapes', () => {
  it('reports each failure with its shape, severity, focus node, path, value and message', async () => {
    const data = store(':r1 a :TextReading ; :readText 3 . :r2 a :TextReading ; :isReadingOf :a ; :readText "ok" .');

    const report = await validateShapes(SHAPES, [data]);

    expect(report.conforms).toBe(false);
    const byConstraint = (c: string) => report.results.find((r) => r.constraint === c)!;
    expect(byConstraint('MinCountConstraintComponent')).toMatchObject({
      shape: { termType: 'NamedNode', value: NS + 'Reading' },
      severity: 'Violation',
      focusNode: { termType: 'NamedNode', value: NS + 'r1' },
      path: [{ predicates: [NS + 'isReadingOf'], inverse: false, quantifier: 'one' }],
      message: 'A reading reads exactly one region.',
    });
    expect(byConstraint('DatatypeConstraintComponent')).toMatchObject({ severity: 'Warning', value: { termType: 'Literal', value: '3' } });
    expect(report.results).toHaveLength(2);
  });

  it('checks the ontology and the data together, across named graphs, a triple stated twice counted once', async () => {
    const ontology = store(':r1 a :TextReading .');
    const data = store(':g1 { :r1 :isReadingOf :a } :g2 { :r1 :isReadingOf :a }');

    const report = await validateShapes(SHAPES, [ontology, data]);

    expect(report.results).toEqual([]);
    expect(report.conforms).toBe(true);
  });

  it('gives no value when it is the focus node itself (a node shape)', async () => {
    const shapes = store(':S a sh:NodeShape ; sh:targetClass :TextReading ; sh:xone ( [ sh:property [ sh:path :a ; sh:minCount 1 ] ] [ sh:property [ sh:path :b ; sh:minCount 1 ] ] ) .');

    const report = await validateShapes(shapes, [store(':r a :TextReading .')]);

    expect(report.results).toHaveLength(1);
    expect(report.results[0]).toMatchObject({ constraint: 'XoneConstraintComponent', value: null, path: null });
  });

  it('gives an inverse path as such', async () => {
    const report = await validateShapes(SHAPES, [store(':kitchen a :Room .')]);

    expect(report.results[0]).toMatchObject({ focusNode: { value: NS + 'kitchen' }, path: [{ predicates: [NS + 'inRoom'], inverse: true }] });
  });

  it('lists the SPARQL-based shapes as not checked, and does not run them', async () => {
    const report = await validateShapes(SHAPES, [store(':r2 a :TextReading ; :isReadingOf :a ; :readText "x" .')]);

    expect(report.notChecked).toEqual([{ termType: 'NamedNode', value: NS + 'NoHttp' }]);
    expect(report.checked).toBe(2);
    expect(report.results).toEqual([]);
  });

  it('says its progress shape by shape, and stops at the next shape', async () => {
    const progress = vi.fn();
    const stopper = new AbortController();
    progress.mockImplementation((done: number) => {
      if (done === 1) stopper.abort();
    });

    await expect(validateShapes(SHAPES, [store(':r a :TextReading .')], { onProgress: progress, signal: stopper.signal })).rejects.toBeInstanceOf(QueryStopped);
    expect(progress.mock.calls).toEqual([[0, 2], [1, 2]]);
  });
});
