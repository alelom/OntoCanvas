/**
 * E2E: individuals and the schema (#216). The class of a drawn individual that is not on the canvas is a stub, read-only; the
 * detail of an individual selects its class or property in the graph; and the view fits what the user just drew. The addresses
 * are answered by routes (no real network).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';
import { traceOnFailure } from './traceOnFailure';

const ONTOLOGY = `
@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:Person a owl:Class ; rdfs:label "Person" .
:Team a owl:Class ; rdfs:label "Team" .
:memberOf a owl:ObjectProperty ; rdfs:domain :Person ; rdfs:range :Team .
`;
const people = Array.from({ length: 80 }, (_, i) => `:p${String(i).padStart(2, '0')} a :Person ; rdfs:label "Person ${String(i).padStart(2, '0')}" .`).join(' ');
const DATA = `@prefix : <http://example.org/o#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:gadget1 a :Gadget ; rdfs:label "Gadget 1" ; :expects :Person ; :via :memberOf .
:gadget2 a :Gadget ; rdfs:label "Gadget 2" .
${people}
`;

describe('individuals and the schema', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    const cors = { 'access-control-allow-origin': '*' };
    await page.route((url) => url.hostname === 'e2e-onto.test', (route) => route.fulfill({ status: 200, contentType: 'text/turtle', body: ONTOLOGY, headers: cors }));
    await page.route((url) => url.hostname === 'e2e-data.test', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: DATA, headers: cors }));
    await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent('https://e2e-onto.test/o.ttl')}&data=${encodeURIComponent('https://e2e-data.test/d.ttl')}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (82)');
    await page.click('#individualsPanelBtn');
  });

  afterAll(async () => {
    await browser?.close();
  });
  traceOnFailure(() => page.context());

  /** Drawing refits the view a moment later: a click or a measure must wait for it. */
  const settled = () => page.waitForFunction(() => (window as any).__EDITOR_TEST__.isViewSettled());
  const nodeIds = () => page.evaluate(() => ((window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds() as string[]).map(String));
  const openGroups = () => page.evaluate(() => document.querySelectorAll<HTMLElement>('[data-individuals-group-toggle][aria-expanded="false"]').forEach((t) => t.click()));
  const stubId = '__individual_class__http://example.org/o#Gadget';

  /** The ids of the drawn individuals whose box is not wholly inside the canvas as it is now. */
  const outsideTheView = () =>
    page.evaluate(() => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const rect = (document.getElementById('network') as HTMLElement).getBoundingClientRect();
      const ids = (net.body.data.nodes.getIds() as string[]).map(String).filter((id) => id.startsWith('__individual__'));
      return ids.filter((id) => {
        const box = net.getBoundingBox(id);
        const a = net.canvasToDOM({ x: box.left, y: box.top });
        const b = net.canvasToDOM({ x: box.right, y: box.bottom });
        return a.x < 0 || a.y < 0 || b.x > rect.width || b.y > rect.height;
      });
    });

  it('fits the view to the individuals the user just drew, and leaves it alone when they are cleared', async () => {
    // Eighty-two individuals: none is drawn by itself.
    expect((await nodeIds()).some((id) => id.startsWith('__individual__'))).toBe(false);

    await page.click('[data-individuals-group="http://example.org/o#Person"] [data-individuals-show-class]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().filter((id: string) => id.startsWith('__individual__')).length === 50);
    await settled();

    expect(await outsideTheView()).toEqual([]);

    const view = () => page.evaluate(() => { const n = (window as any).__EDITOR_TEST__.getNetwork(); return { scale: n.getScale(), position: n.getViewPosition() }; });
    const before = await view();
    await page.click('[data-individuals-clear]');
    await page.waitForFunction(() => !(window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().some((id: string) => id.startsWith('__individual__')));
    await settled();
    expect(await view()).toEqual(before);
  });

  it('draws a stub for the class that is not on the canvas, which cannot be edited or deleted', async () => {
    await openGroups();
    await page.click('[data-individuals-group="http://example.org/o#Gadget"] [data-individuals-show-class]');
    await page.waitForFunction((id) => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get(id), stubId);
    await settled();

    const edges = await page.evaluate((id) => (window as any).__EDITOR_TEST__.getNetwork().body.data.edges.get().filter((e: any) => e.to === id && e.dashes === true).length, stubId);
    expect(edges).toBe(2);
    const label = await page.evaluate((id) => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get(id).label, stubId);
    expect(label).toBe('Gadget');

    await page.evaluate((id) => (window as any).__EDITOR_TEST__.getNetwork().selectNodes([id]), stubId);
    await page.keyboard.press('Delete');
    expect(await nodeIds()).toContain(stubId);
  });

  it('selects the class and the property of an individual in the graph from its detail', async () => {
    await openGroups();
    await page.click('[data-individuals-item][title$="#gadget1"]');

    await page.click('[data-individuals-outgoing] [data-individuals-schema-link]:text-is(":Person")');
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__.getNetwork().getSelectedNodes() as string[]).includes('Person'));

    await page.click('[data-individuals-outgoing] [data-individuals-schema-link]:text-is(":memberOf")');
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__.getNetwork().getSelectedEdges() as string[]).some((id) => /memberOf/.test(id)));
  });
});
