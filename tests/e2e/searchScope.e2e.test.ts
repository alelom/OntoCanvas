/**
 * E2E for #85: the "Search options" popup under the search bar holds three scopes — highlight in the
 * whole graph (nothing fades, the outline marks the match), matches and their neighbours, matches only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

const EDITOR_URL = 'http://localhost:5173/';

const TTL = `@prefix : <http://example.org/main#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/main> a owl:Ontology .
:Group a owl:Class ; rdfs:label "Group" .
:Agent a owl:Class ; rdfs:label "Agent" .
:Document a owl:Class ; rdfs:label "Document" .
:member a owl:ObjectProperty ; rdfs:label "member" ; rdfs:domain :Group ; rdfs:range :Agent .
`;

describe('Search scope E2E (#85)', () => {
  let browser: Browser;
  let page: Page;

  /** Each node's drawn background, by label. */
  const backgrounds = () =>
    page.evaluate(() => {
      const nodes = (window as any).__EDITOR_TEST__.getNetwork().body.data.nodes.get();
      return Object.fromEntries(
        nodes
          .filter((n: any) => ['Group', 'Agent', 'Document'].some((l) => String(n.label).startsWith(l)))
          .map((n: any) => [String(n.label).split('\n')[0], typeof n.color === 'object' ? n.color.background : n.color]),
      ) as Record<string, string>;
    });
  const outlinedRects = () => page.evaluate(() => document.querySelectorAll('#searchOutlineOverlay rect.oc-mark').length);
  const chooseScope = async (scope: string) => {
    if (!(await page.isVisible('#searchOptionsPopup'))) await page.click('#searchOptionsToggle');
    await page.check(`input[name="searchScope"][value="${scope}"]`);
  };

  let plain: Record<string, string>;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.setDefaultTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__?.loadTtlDirectly !== undefined, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.evaluate((t) => (window as any).__EDITOR_TEST__.loadTtlDirectly(t), TTL);
    await page.waitForFunction(() => ((window as any).__EDITOR_TEST__?.getRawDataEdges?.() ?? []).length > 0, { timeout: 5000 });
    await page.evaluate(() => (window as any).__EDITOR_TEST__?.hideOpenOntologyModal?.());
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window as any).__EDITOR_TEST__.getNetwork()?.body.data.nodes.length >= 3, { timeout: 5000 });
    plain = await backgrounds();
    await page.fill('#searchQuery', 'Group');
    await page.keyboard.press('Escape'); // close the suggestions
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
  });

  it('"Search:" sits above the bar, the options button below it, and the popup starts closed', async () => {
    const [label, bar, button] = await Promise.all(
      ['#searchBlock > strong', '#searchQuery', '#searchOptionsToggle'].map((s) => page.locator(s).boundingBox()),
    );
    expect(label!.y).toBeLessThan(bar!.y);
    expect(bar!.y).toBeLessThan(button!.y);
    expect(await page.isVisible('#searchOptionsPopup')).toBe(false);
  });

  it('shows the scopes in one column, Exact match in a column beside them, each with a tooltip', async () => {
    await page.click('#searchOptionsToggle');
    const boxes = await Promise.all(
      ['highlight', 'neighbours', 'matches'].map((v) => page.locator(`input[name="searchScope"][value="${v}"]`).boundingBox()),
    );
    expect(new Set(boxes.map((b) => Math.round(b!.x))).size).toBe(1);
    expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
    expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
    const exact = await page.locator('#searchExactMatch').boundingBox();
    expect(exact!.x).toBeGreaterThan(boxes[0]!.x + 20);
    const titles = await page.$$eval('input[name="searchScope"]', (els) => els.map((e) => e.closest('label')?.title ?? ''));
    expect(titles.every((t) => t.length > 10)).toBe(true);
    expect(await page.isChecked('input[name="searchScope"][value="matches"]')).toBe(true);
  });

  it('matches only: fades the neighbour and the unrelated class', async () => {
    await chooseScope('matches');
    await expect.poll(backgrounds, { timeout: 5000 }).toMatchObject({ Group: plain.Group });
    const now = await backgrounds();
    expect(now.Agent).not.toBe(plain.Agent);
    expect(now.Document).not.toBe(plain.Document);
  });

  it('matches and their neighbours: the neighbour fades less than the unrelated class', async () => {
    const matchesOnly = await backgrounds();
    await chooseScope('neighbours');
    await expect.poll(async () => (await backgrounds()).Agent, { timeout: 5000 }).not.toBe(matchesOnly.Agent);
    expect((await backgrounds()).Document).toBe(matchesOnly.Document);
  });

  it('highlight in whole graph: nothing fades, the outline still marks the match', async () => {
    await chooseScope('highlight');
    await expect.poll(backgrounds, { timeout: 5000 }).toEqual(plain);
    await expect.poll(outlinedRects, { timeout: 5000 }).toBe(1);
  });

  it('closes the popup on a click outside it', async () => {
    await page.mouse.click(700, 600);
    expect(await page.isVisible('#searchOptionsPopup')).toBe(false);
  });
});
