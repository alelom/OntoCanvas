/**
 * E2E: individuals drawn in the graph (#209). "Show in graph" in the Individuals tab adds the individual and its neighbours
 * to the canvas, as nodes of their own beside the classes; they cannot be edited or deleted, and Clear individuals takes
 * them away. The addresses are answered by routes (no real network).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { EDITOR_URL } from './editorUrl';

const ONTOLOGY = `
@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:Person a owl:Class ; rdfs:label "Person" .
:Team a owl:Class ; rdfs:label "Team" .
:memberOf a owl:ObjectProperty ; rdfs:domain :Person ; rdfs:range :Team .
`;
const DATA = `@prefix : <http://example.org/o#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:alice a :Person ; rdfs:label "Alice" ; :memberOf :red .
:bob a :Person ; rdfs:label "Bob" ; :memberOf :red .
:red a :Team ; rdfs:label "Red team" .
:carol a :Person ; rdfs:label "Carol" .
`;

describe('individuals in the graph', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    const cors = { 'access-control-allow-origin': '*' };
    await page.route(/e2e-onto\.test\/o\.ttl/, (route) => route.fulfill({ status: 200, contentType: 'text/turtle', body: ONTOLOGY, headers: cors }));
    await page.route(/e2e-data\.test\/d\.ttl/, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: DATA, headers: cors }));
    await page.goto(`${EDITOR_URL}?onto=${encodeURIComponent('https://e2e-onto.test/o.ttl')}&data=${encodeURIComponent('https://e2e-data.test/d.ttl')}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (4)');
    await page.click('#individualsPanelBtn');
  });

  afterAll(async () => {
    await browser?.close();
  });

  const nodeIds = () =>
    page.evaluate(() => ((window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds() as string[]).map(String));
  const edgeCount = () => page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.edges.length as number);

  it('draws few individuals by themselves, clears them, and draws one with its neighbours on request', async () => {
    // Four individuals are few: all are drawn at once.
    expect((await nodeIds()).filter((id) => id.startsWith('__individual__'))).toHaveLength(4);
    expect(await page.locator('[data-individuals-drawn]').innerText()).toContain('4 individuals');

    await page.click('[data-individuals-clear]');
    await page.waitForFunction(() => !(window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().some((id: string) => id.startsWith('__individual__')));
    const classesOnly = await nodeIds();
    const edgesBefore = await edgeCount();

    await page.click('[data-individuals-item][title$="#alice"]');
    await page.click('[data-individuals-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().some((id: string) => id.startsWith('__individual__')));

    const drawn = (await nodeIds()).filter((id) => id.startsWith('__individual__')).sort();
    expect(drawn).toEqual(['__individual__http://example.org/o#alice', '__individual__http://example.org/o#red']);
    expect(await edgeCount()).toBeGreaterThan(edgesBefore);
    expect(await page.locator('[data-individuals-drawn]').innerText()).toContain('2 individuals');

    await page.click('[data-individuals-clear]');
    await page.waitForFunction(() => !(window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().some((id: string) => id.startsWith('__individual__')));
    expect(await nodeIds()).toEqual(classesOnly);
    expect(await edgeCount()).toBe(edgesBefore);
  });

/** Clicks the middle of the first edge for which `pick` is true, as a user does. */
  async function clickEdge(pick: string): Promise<void> {
    const point = await page.evaluate((src) => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const test = new Function('e', 'return ' + src) as (e: any) => boolean;
      const edge = net.body.data.edges.get().find(test);
      const pos = net.getPositions([edge.from, edge.to]);
      const mid = net.canvasToDOM({ x: (pos[edge.from].x + pos[edge.to].x) / 2, y: (pos[edge.from].y + pos[edge.to].y) / 2 });
      const rect = (document.getElementById('network') as HTMLElement).getBoundingClientRect();
      return { x: rect.left + mid.x, y: rect.top + mid.y };
    }, pick);
    await page.mouse.click(point.x, point.y);
  }
  const toolbar = () => page.evaluate(() => [...document.querySelectorAll('.vis-manipulation > button')].map((b) => b.id || b.className.replace('vis-button ', '')));

  it('has no Edit button while an edge between individuals is selected, and has it, before the panel buttons, for a class edge', async () => {
    await page.click('[data-individuals-clear]').catch(() => {});
    await page.click('[data-individuals-item][title$="#alice"]');
    await page.click('[data-individuals-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get('__individual__http://example.org/o#alice'));

    await clickEdge("e.id.startsWith('__individual_edge__') && e.label === 'memberOf'");
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().getSelectedEdges().length > 0);
    expect(await toolbar()).toEqual(['vis-add', 'vis-connect', 'queryPanelBtn', 'individualsPanelBtn']);

    await clickEdge("!e.id.startsWith('__individual') && /memberOf$/.test(String(e.id))");
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().getSelectedEdges().some((id: string) => !id.startsWith('__individual')));
    expect(await toolbar()).toEqual(['vis-add', 'vis-connect', 'vis-edit', 'queryPanelBtn', 'individualsPanelBtn']);
  });

  it('leaves a drawn individual alone on Delete, and the ontology unchanged', async () => {
    await page.click('[data-individuals-item][title$="#carol"]');
    await page.click('[data-individuals-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get('__individual__http://example.org/o#carol'));
    const classCount = (await nodeIds()).filter((id) => !id.startsWith('__individual__')).length;

    await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().selectNodes(['__individual__http://example.org/o#carol']));
    await page.keyboard.press('Delete');

    expect((await nodeIds()).filter((id) => !id.startsWith('__individual__'))).toHaveLength(classCount);
    expect(await nodeIds()).toContain('__individual__http://example.org/o#carol');
  });
});
