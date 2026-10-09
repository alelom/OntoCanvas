/**
 * The bottom bar (#113): "OntoCanvas v<version> | Ontology: <name> (prefix: <prefix>) | Nodes: n / Edges: m".
 * The ontology's name links to the file or URL it was opened from, and its prefix follows in brackets with the
 * prefix itself in italics; the node/edge count comes last, and is left out when embedded. The bars between
 * the parts are drawn by the stylesheet, so none is left dangling when a part is not shown. The name and prefix
 * logic is unit-tested in tests/unit/ontologyInfo.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { blockExternalRequests, openEditorWithTtl, waitForAppReady } from './testHelpers';

const EDITOR_URL = 'http://localhost:5173/';
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
const ONTOLOGY_URL = 'http://example.org/files/sb-ontology.ttl';

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

/** What the bottom bar shows: its parts in the order they are drawn, and the ontology part in detail. */
const statusBar = () =>
  page.evaluate(() => {
    const info = document.getElementById('info')!;
    const parts = Array.from(info.children).filter((el) => el.id);
    const ontology = document.getElementById('ontologyInfoDisplay')!;
    const link = ontology.querySelector('a');
    return {
      order: parts.map((el) => el.id),
      shown: Object.fromEntries(parts.map((el) => [el.id, getComputedStyle(el).display !== 'none'])),
      barBefore: Object.fromEntries(parts.map((el) => [el.id, getComputedStyle(el, '::before').content])),
      ontologyText: ontology.textContent,
      linkText: link?.textContent ?? null,
      linkHref: link?.getAttribute('href') ?? null,
      italic: Array.from(ontology.querySelectorAll('i')).map((i) => i.textContent),
      counts: document.getElementById('graphCounts')!.textContent,
    };
  });

describe('bottom bar (#113)', () => {
  it('shows the ontology name and prefix after the version, and the count after them; no separate File part', async () => {
    await openEditorWithTtl(page, WITH_ONTOLOGY);
    const bar = await statusBar();

    expect(bar.order.filter((id) => ['versionDisplay', 'ontologyInfoDisplay', 'graphCounts'].includes(id))).toEqual([
      'versionDisplay',
      'ontologyInfoDisplay',
      'graphCounts',
    ]);
    expect(bar.order).not.toContain('filePathDisplay');
    expect(bar.ontologyText).toBe('Ontology: Status bar ontology (prefix: sb)');
    expect(bar.counts).toBe('Nodes: 2 / Edges: 1');
  }, 10000);

  it('sets the prefix itself in italics', async () => {
    await openEditorWithTtl(page, WITH_ONTOLOGY);
    expect((await statusBar()).italic).toEqual(['sb']);
  }, 10000);

  it('links the name to the file the ontology was opened from, when it is a URL', async () => {
    await page.route(ONTOLOGY_URL, (route) =>
      route.fulfill({ status: 200, contentType: 'text/turtle', headers: { 'access-control-allow-origin': '*' }, body: WITH_ONTOLOGY })
    );
    await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent(ONTOLOGY_URL)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await waitForAppReady(page);
    const bar = await statusBar();

    expect(bar.linkText).toBe('Status bar ontology');
    expect(bar.linkHref).toBe(ONTOLOGY_URL);
    // "Ontology:" is outside the link.
    expect(bar.ontologyText).toBe('Ontology: Status bar ontology (prefix: sb)');
  }, 10000);

  it('sets the parts apart with a bar before each one shown, but not before the version', async () => {
    await openEditorWithTtl(page, WITH_ONTOLOGY);
    const bar = await statusBar();

    expect(bar.barBefore.ontologyInfoDisplay).toBe('"| "');
    expect(bar.barBefore.graphCounts).toBe('"| "');
    expect(bar.barBefore.versionDisplay).toBe('none');
  }, 10000);

  it('shows no ontology part, and no bar for it, when the file declares no ontology and none was opened', async () => {
    await openEditorWithTtl(page, WITHOUT_ONTOLOGY);
    const bar = await statusBar();

    expect(bar.shown.ontologyInfoDisplay).toBe(false);
    expect(bar.ontologyText).toBe('');
    expect(bar.counts).toBe('Nodes: 1 / Edges: 0');
  }, 10000);

  it('leaves out the node and edge count when embedded', async () => {
    await openEditorWithTtl(page, WITH_ONTOLOGY, `${EDITOR_URL}?embed`);
    const bar = await statusBar();

    expect(bar.shown.graphCounts).toBe(false);
    expect(bar.shown.ontologyInfoDisplay).toBe(true);
  }, 10000);

  it('shows the count outside embed mode', async () => {
    await openEditorWithTtl(page, WITH_ONTOLOGY);
    expect((await statusBar()).shown.graphCounts).toBe(true);
  }, 10000);
});
