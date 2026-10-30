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

    await page.click('[data-individuals-list] li:has([title$="#alice"]) [data-individuals-show-in-graph]');
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

  /** The ids of individual nodes whose drawn box overlaps a class node's. */
  const overlaps = () =>
    page.evaluate(() => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const ids = (net.body.data.nodes.getIds() as string[]).map(String);
      const box = (id: string) => net.getBoundingBox(id) as { left: number; right: number; top: number; bottom: number };
      const hit = (a: any, b: any) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      const individuals = ids.filter((id) => id.startsWith('__individual__'));
      const classes = ids.filter((id) => !id.startsWith('__individual__') && !id.startsWith('__dataprop'));
      return individuals.filter((i) => classes.some((c) => hit(box(i), box(c))));
    });

  it('spreads the individuals clear of the classes by default, and puts them on a ring around their class when that is unticked', async () => {
    expect(await page.locator('#relaxIndividuals').isChecked()).toBe(true);
    await page.click('[data-individuals-clear]').catch(() => {});
    await page.click('#relaxIndividuals');
    await page.click('#relaxIndividuals');
    await page.click('[data-individuals-list] li:has([title$="#alice"]) [data-individuals-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get('__individual__http://example.org/o#alice'));
    expect(await overlaps()).toEqual([]);

    const where = () => page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().getPositions(['__individual__http://example.org/o#alice'])['__individual__http://example.org/o#alice'] as { x: number; y: number });
    const relaxed = await where();
    await page.click('#relaxIndividuals');
    await page.waitForFunction(([x, y]) => { const p = (window as any).__EDITOR_TEST__.getNetwork().getPositions(['__individual__http://example.org/o#alice'])['__individual__http://example.org/o#alice']; return p.x !== x || p.y !== y; }, [relaxed.x, relaxed.y]);
    await page.click('#relaxIndividuals');
  });

  const drawnIndividuals = () => nodeIds().then((ids) => ids.filter((id) => id.startsWith('__individual__')).map((id) => id.replace('__individual__http://example.org/o#', '')).sort());

  it('hides the individuals the search does not concern: those without a searched relationship, those of other classes, those not named', async () => {
    // A fresh start: the four individuals are few, so all are drawn by themselves.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.getNetwork()?.body.data.nodes.getIds().filter((id: string) => id.startsWith('__individual__')).length === 4);
    expect(await drawnIndividuals()).toEqual(['alice', 'bob', 'carol', 'red']);

    await page.fill('#searchQuery', 'memberOf');
    await page.waitForFunction(() => !(window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get('__individual__http://example.org/o#carol'));
    expect(await drawnIndividuals()).toEqual(['alice', 'bob', 'red']);

    await page.fill('#searchQuery', 'Carol');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().filter((id: string) => id.startsWith('__individual__')).length === 1);
    expect(await drawnIndividuals()).toEqual(['carol']);

    await page.fill('#searchQuery', '');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().filter((id: string) => id.startsWith('__individual__')).length === 4);
    // The reload closed the panel; the tests after this one use it.
    await page.click('#individualsPanelBtn');
  });

  it('is cleared by Reset view, and the button of the row offers to show the individual again', async () => {
    await page.click('[data-individuals-clear]').catch(() => {});
    await page.click('[data-individuals-list] li:has([title$="#alice"]) [data-individuals-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get('__individual__http://example.org/o#alice'));
    expect(await page.locator('[data-individuals-list] li:has([title$="#alice"]) [data-individuals-show-in-graph]').innerText()).toBe('All 1 displayed');

    await page.click('#resetView');
    await page.waitForFunction(() => !(window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().some((id: string) => id.startsWith('__individual__')));

    expect(await page.locator('[data-individuals-list] li:has([title$="#alice"]) [data-individuals-show-in-graph]').innerText()).toBe('Show 1 (0 displayed/1 total)');
  });

  it('says in the Individuals tab where the individuals are: the ontology file that holds some itself, and the data added to it', async () => {
    const embedded = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    embedded.setDefaultTimeout(5000);
    const cors = { 'access-control-allow-origin': '*' };
    await embedded.route((url) => url.hostname === 'e2e-onto.test' && url.pathname === '/with.ttl', (route) => route.fulfill({ status: 200, contentType: 'text/turtle', body: ONTOLOGY + ':zed a :Person ; <http://www.w3.org/2000/01/rdf-schema#label> "Zed" .', headers: cors }));
    await embedded.route((url) => url.hostname === 'e2e-data.test' && url.pathname === '/d.ttl', (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: DATA, headers: cors }));
    await embedded.goto(`${EDITOR_URL}?onto=${encodeURIComponent('https://e2e-onto.test/with.ttl')}&data=${encodeURIComponent('https://e2e-data.test/d.ttl')}`, { waitUntil: 'domcontentloaded' });
    await embedded.waitForFunction(() => document.getElementById('individualsPanelBtn')?.textContent === 'Individuals (5)');
    await embedded.click('#individualsPanelBtn');

    const origin = embedded.locator('[data-individuals-origin]');
    expect(await origin.innerText()).toBe('1 individual from the ontology file with.ttl');
    expect(await embedded.locator('[data-data-list] li').first().innerText()).toContain('d.ttl');
    await embedded.close();
  });

  it('draws the individuals of a type from the header row of the type, saying how many are displayed of the total', async () => {
    await page.click('[data-individuals-clear]').catch(() => {});
    await page.waitForFunction(() => !(window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().some((id: string) => id.startsWith('__individual__')));
    const person = page.locator('[data-individuals-group$="#Person"] [data-individuals-show-class]');
    expect(await person.innerText()).toBe('Show 3 (0 displayed/3 total)');

    await person.click();
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.getIds().filter((id: string) => id.startsWith('__individual__')).length === 3);

    expect(await drawnIndividuals()).toEqual(['alice', 'bob', 'carol']);
    expect(await person.innerText()).toBe('All 3 displayed');
  });

  it('has no Edit button while an edge between individuals is selected, and has it, before the panel buttons, for a class edge', async () => {
    await page.click('[data-individuals-clear]').catch(() => {});
    await page.click('[data-individuals-list] li:has([title$="#alice"]) [data-individuals-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get('__individual__http://example.org/o#alice'));

    await clickEdge("e.id.startsWith('__individual_edge__') && e.label === 'memberOf'");
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().getSelectedEdges().length > 0);
    expect(await toolbar()).toEqual(['vis-add', 'vis-connect', 'queryPanelBtn', 'individualsPanelBtn']);

    await clickEdge("!e.id.startsWith('__individual') && /memberOf$/.test(String(e.id))");
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().getSelectedEdges().some((id: string) => !id.startsWith('__individual')));
    expect(await toolbar()).toEqual(['vis-add', 'vis-connect', 'vis-edit', 'queryPanelBtn', 'individualsPanelBtn']);
  });

  it('leaves a drawn individual alone on Delete, and the ontology unchanged', async () => {
    await page.click('[data-individuals-list] li:has([title$="#carol"]) [data-individuals-show-in-graph]');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get('__individual__http://example.org/o#carol'));
    const classCount = (await nodeIds()).filter((id) => !id.startsWith('__individual__')).length;

    await page.evaluate(() => (window as any).__EDITOR_TEST__.getNetwork().selectNodes(['__individual__http://example.org/o#carol']));
    await page.keyboard.press('Delete');

    expect((await nodeIds()).filter((id) => !id.startsWith('__individual__'))).toHaveLength(classCount);
    expect(await nodeIds()).toContain('__individual__http://example.org/o#carol');
  });
});
