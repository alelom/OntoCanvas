/**
 * The bottom bar (#113): "OntoCanvas v<version> | <ontology name> (<prefix>:) | File: <file> | Nodes: n / Edges: m".
 * The ontology's name and prefix follow the version, and the node/edge count comes after the file. The bars
 * between the parts are drawn by the stylesheet, so none is left dangling when a part is not shown. The name
 * and prefix logic is unit-tested in tests/unit/ontologyInfo.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { blockExternalRequests, openEditorWithTtl } from './testHelpers';

const HEADER = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix sb: <http://example.org/sb#> .
`;
const WITH_ONTOLOGY = `${HEADER}
<http://example.org/sb> rdf:type owl:Ontology ; rdfs:label "Status bar ontology" .
sb:A rdf:type owl:Class ; rdfs:label "A" .
sb:B rdf:type owl:Class ; rdfs:label "B" ; rdfs:subClassOf sb:A .
`;
const WITHOUT_ONTOLOGY = `${HEADER}
sb:A rdf:type owl:Class ; rdfs:label "A" .
`;

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await blockExternalRequests(page);
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** The ids of the status bar's parts, in the order they are drawn, and what each shows. */
const statusBar = () =>
  page.evaluate(() => {
    const info = document.getElementById('info')!;
    const parts = Array.from(info.children).filter((el) => el.id);
    return {
      order: parts.map((el) => el.id),
      shown: Object.fromEntries(parts.map((el) => [el.id, getComputedStyle(el).display !== 'none'])),
      barBefore: Object.fromEntries(parts.map((el) => [el.id, getComputedStyle(el, '::before').content])),
      ontology: { text: document.getElementById('ontologyInfoDisplay')!.textContent, title: document.getElementById('ontologyInfoDisplay')!.title },
      counts: document.getElementById('graphCounts')!.textContent,
    };
  });

describe('bottom bar (#113)', () => {
  it('shows the ontology name and prefix after the version, and the count after the file', async () => {
    await openEditorWithTtl(page, WITH_ONTOLOGY);
    const bar = await statusBar();

    const at = (id: string) => bar.order.indexOf(id);
    expect(at('versionDisplay')).toBeGreaterThanOrEqual(0);
    expect(at('ontologyInfoDisplay')).toBe(at('versionDisplay') + 1);
    expect(at('filePathDisplay')).toBe(at('ontologyInfoDisplay') + 1);
    expect(at('graphCounts')).toBe(at('filePathDisplay') + 1);

    expect(bar.ontology).toEqual({ text: 'Status bar ontology (sb:)', title: 'http://example.org/sb' });
    expect(bar.counts).toBe('Nodes: 2 / Edges: 1');
  }, 10000);

  it('sets the parts apart with a bar before each one shown, but not before the version', async () => {
    await openEditorWithTtl(page, WITH_ONTOLOGY);
    const bar = await statusBar();

    expect(bar.barBefore.ontologyInfoDisplay).toBe('"| "');
    expect(bar.barBefore.graphCounts).toBe('"| "');
    expect(bar.barBefore.versionDisplay).toBe('none');
    // No file is open here, so that part is empty and gets no bar of its own.
    expect(bar.barBefore.filePathDisplay).toBe('none');
  }, 10000);

  it('shows no ontology part, and no bar for it, when the file declares no ontology', async () => {
    await openEditorWithTtl(page, WITHOUT_ONTOLOGY);
    const bar = await statusBar();

    expect(bar.shown.ontologyInfoDisplay).toBe(false);
    expect(bar.ontology.text).toBe('');
    expect(bar.counts).toBe('Nodes: 1 / Edges: 0');
  }, 10000);
});
