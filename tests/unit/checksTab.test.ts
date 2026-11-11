// @vitest-environment jsdom
/**
 * The Checks tab (#231): the shapes loaded, Run checks over the ontology and its data, the report by shape, a focus node that is
 * an individual opening its card, the shapes not checked said, and Stop.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { createChecksTab, MAX_RESULTS_SHOWN, type Validate } from '../../src/ui/sidePanel/checksTab';
import { createChecksLibrary, type ChecksLibrary } from '../../src/checks/checksLibrary';
import type { CheckReport, CheckResult } from '../../src/checks/validateShapes';
import { QueryStopped } from '../../src/sparql/readCapped';

const NS = 'http://example.org/d#';
const SHAPES = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix : <${NS}> .
:Reading a sh:NodeShape ; sh:targetClass :TextReading ; sh:property [ sh:path :isReadingOf ; sh:minCount 1 ; sh:message "A reading reads one region." ] .
:NoHttp a sh:NodeShape ; sh:targetClass :TextReading ; sh:sparql [ sh:select "SELECT $this WHERE { }" ] .`;
const DATA = new Store(new Parser().parse(`@prefix : <${NS}> . :r1 a :TextReading . :r2 a :TextReading ; :isReadingOf :a .`));

let container: HTMLElement;
let library: ChecksLibrary;
const openIndividual = vi.fn();
const showInGraph = vi.fn(async () => ({ decision: { kind: 'none' as const }, notDrawn: 0, limit: 300 }));
const q = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector)!;
const status = () => q('[data-checks-status]').textContent;

function mount(validate?: Validate, stores: Store[] = [DATA]): void {
  createChecksTab({
    library,
    getStores: () => stores,
    getPrefixes: () => ({ '': NS }),
    isIndividual: (iri) => iri.startsWith(NS + 'r'),
    openIndividual,
    showInGraph,
    ...(validate ? { validate } : {}),
  }).render(container);
}
const loadShapes = () => library.addFiles([{ path: 'readings.shacl.ttl', text: async () => SHAPES }]);
const runChecks = async () => {
  q<HTMLButtonElement>('[data-checks-run]').click();
  // The first run imports shacl-engine: under the load of the whole suite that takes more than waitFor's default second.
  await vi.waitFor(() => expect(q<HTMLButtonElement>('[data-checks-stop]').hidden).toBe(true), { timeout: 5000 });
};

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.append(container);
  openIndividual.mockReset();
  showInGraph.mockClear();
  library = createChecksLibrary();
});

describe('before any shape is loaded', () => {
  it('offers to load shapes, and Run checks is off', () => {
    mount();

    expect(q<HTMLDetailsElement>('details.checks-load').open).toBe(true);
    expect(q<HTMLButtonElement>('[data-checks-run]').disabled).toBe(true);
  });
});

describe('the shapes loaded', () => {
  it('are listed with how many shapes each holds, and can be removed', async () => {
    mount();
    await loadShapes();

    expect(q('[data-checks-shapes-file]').textContent).toBe('readings.shacl.ttl 2 shapes Remove');
    expect(q<HTMLButtonElement>('[data-checks-run]').disabled).toBe(false);
    expect(q<HTMLDetailsElement>('details.checks-load').open).toBe(false);

    q<HTMLButtonElement>('[data-checks-remove]').click();
    expect(container.querySelectorAll('[data-checks-shapes-file]')).toHaveLength(0);
    expect(q<HTMLButtonElement>('[data-checks-run]').disabled).toBe(true);
  });
});

describe('Run checks', () => {
  it('reports the failures by shape, with the focus node, its path and the message, and the shapes not checked', async () => {
    mount();
    await loadShapes();

    await runChecks();

    expect(status()).toMatch(/^1 violation: 1 shape checked in \d+ ms; 1 shape not checked \(below\)\.$/);
    expect(q('[data-checks-shape] summary').textContent).toBe(':Reading (1 violation) Show in graph');
    const result = q('[data-checks-result]');
    expect(result.getAttribute('data-severity')).toBe('Violation');
    expect(result.querySelector('.checks-path')!.textContent).toBe(':isReadingOf');
    expect(result.querySelector('.checks-message')!.textContent).toBe('A reading reads one region.');
    expect(q('[data-checks-not-checked]').textContent).toContain(':NoHttp');
  });

  it('shows the focus nodes of a shape, or of the whole report, in the graph (#207)', async () => {
    mount();
    await loadShapes();
    await runChecks();

    q<HTMLButtonElement>('[data-checks-shape] [data-checks-show-in-graph]').click();
    expect(showInGraph).toHaveBeenLastCalledWith([NS + 'r1']);

    q<HTMLButtonElement>('[data-checks-show-all]').click();
    expect(showInGraph).toHaveBeenLastCalledWith([NS + 'r1']);
    expect(q('[data-checks-show-all]').textContent).toBe('Show all in graph (1 focus node)');
  });

  it('opens the card of a focus node that is an individual', async () => {
    mount();
    await loadShapes();
    await runChecks();

    q<HTMLButtonElement>('[data-checks-result] [data-checks-open]').click();

    expect(openIndividual).toHaveBeenCalledWith(NS + 'r1');
  });

  it('says the data conforms', async () => {
    mount(undefined, [new Store(new Parser().parse(`@prefix : <${NS}> . :r2 a :TextReading ; :isReadingOf :a .`))]);
    await loadShapes();

    await runChecks();

    expect(status()).toMatch(/^Conforms: 1 shape checked in \d+ ms; 1 shape not checked \(below\)\.$/);
  });

  it(`shows the first ${MAX_RESULTS_SHOWN} results of a large report`, async () => {
    const result = (i: number): CheckResult => ({
      shape: { termType: 'NamedNode', value: NS + 'Reading' },
      severity: 'Violation',
      focusNode: { termType: 'NamedNode', value: `${NS}x${i}` },
      path: null,
      value: null,
      message: 'm',
      constraint: 'MinCountConstraintComponent',
    });
    const report: CheckReport = { results: Array.from({ length: MAX_RESULTS_SHOWN + 5 }, (_, i) => result(i)), checked: 1, notChecked: [], conforms: false };
    mount(async () => report);
    await loadShapes();

    await runChecks();

    expect(container.querySelectorAll('[data-checks-result]')).toHaveLength(MAX_RESULTS_SHOWN);
    expect(container.textContent).toContain(`The first ${MAX_RESULTS_SHOWN} of ${MAX_RESULTS_SHOWN + 5} results are shown, violations first: 5 violations are not.`);
  });

  it('shows the violations first when the report is capped, and says how many are not shown (#243 review)', async () => {
    const result = (shape: string, severity: CheckResult['severity'], i: number): CheckResult => ({
      shape: { termType: 'NamedNode', value: NS + shape },
      severity,
      focusNode: { termType: 'NamedNode', value: `${NS}x${i}` },
      path: null,
      value: null,
      message: 'm',
      constraint: 'MinCountConstraintComponent',
    });
    const results = [
      ...Array.from({ length: MAX_RESULTS_SHOWN }, (_, i) => result('Warnings', 'Warning', i)),
      ...Array.from({ length: 3 }, (_, i) => result('Violations', 'Violation', i)),
    ];
    mount(async () => ({ results, checked: 2, notChecked: [], conforms: false }));
    await loadShapes();

    await runChecks();

    expect(container.querySelectorAll('[data-checks-result][data-severity="Violation"]')).toHaveLength(3);
    expect(q('[data-checks-shape] summary').textContent).toBe(':Violations (3 violations) Show in graph');
    expect(container.textContent).toContain(`The first ${MAX_RESULTS_SHOWN} of ${MAX_RESULTS_SHOWN + 3} results are shown, violations first: 3 warnings are not.`);
  });

  it('stops a run when another ontology is opened, so its report is not shown under the new one (#243 review)', async () => {
    const tab = createChecksTab({
      library,
      getStores: () => [DATA],
      getPrefixes: () => ({ '': NS }),
      validate: (_shapes, _data, options) => new Promise((_, reject) => options!.signal!.addEventListener('abort', () => reject(new QueryStopped()))),
    });
    tab.render(container);
    await loadShapes();
    q<HTMLButtonElement>('[data-checks-run]').click();

    tab.refresh();

    await vi.waitFor(() => expect(q<HTMLButtonElement>('[data-checks-stop]').hidden).toBe(true));
    expect(container.querySelectorAll('[data-checks-result]')).toHaveLength(0);
  });

  it('can be stopped', async () => {
    mount((_shapes, _data, options) => new Promise((_, reject) => options!.signal!.addEventListener('abort', () => reject(new QueryStopped()))));
    await loadShapes();

    q<HTMLButtonElement>('[data-checks-run]').click();
    expect(q<HTMLButtonElement>('[data-checks-stop]').hidden).toBe(false);
    q<HTMLButtonElement>('[data-checks-stop]').click();

    await vi.waitFor(() => expect(status()).toBe('Stopped.'));
  });

  it('says there is nothing to check with no ontology open', async () => {
    mount(undefined, []);
    await loadShapes();

    q<HTMLButtonElement>('[data-checks-run]').click();

    expect(status()).toBe('Open an ontology or add data first: there is nothing to check yet.');
  });
});
