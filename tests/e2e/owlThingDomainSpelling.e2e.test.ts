/**
 * The edit-object-property modal must agree with what it wrote.
 *
 * The domain and range fields accept owl:Thing written three ways, and the store writer honours all
 * three. The confirm handler used to recognise only "Thing" and "owl:Thing", so typing the full
 * owl#Thing URI wrote rdfs:domain owl:Thing to the store while leaving hasGlobalDomain false and
 * domain set to the URI — the edge-styles menu and a re-opened modal then disagreed with the file
 * until the next reparse.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { loadTestFile } from './testHelpers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EDITOR_URL = 'http://localhost:5173/';
const FIXTURE = join(__dirname, '../fixtures/owl-thing-domain.ttl');
const OWL_THING_URI = 'http://www.w3.org/2002/07/owl#Thing';
let browser: Browser;
let page: Page;
/** The key the Object Properties menu passes for :relates when its edit button is clicked: the edge type,
 * read from the menu rather than assumed (a local name or a full URI depending on the ontology; #87). */
let property: string;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  await loadTestFile(page, FIXTURE);
  property = await page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLInputElement>('#edgeStylesContent .edge-show-cb')];
    return rows.map((cb) => cb.dataset.type ?? '').find((t) => /(^|[#/])relates$/.test(t)) ?? '';
  });
  expect(property).not.toBe('');
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Open the edit modal for an object property and set its domain, then confirm. */
async function setDomain(p: Page, property: string, domain: string): Promise<void> {
  await p.evaluate((name) => (window as any).__EDITOR_TEST__.openEditObjectPropertyModal(name), property);
  await p.waitForFunction(
    () => getComputedStyle(document.getElementById('editRelationshipTypeModal')!).display !== 'none', undefined,
    { timeout: 5000 }
  );
  await p.evaluate((value) => {
    const input = document.getElementById('editRelTypeDomain') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, domain);
  await p.evaluate(() => (document.getElementById('editRelTypeConfirm') as HTMLButtonElement).click());
  await p.waitForFunction(
    () => getComputedStyle(document.getElementById('editRelationshipTypeModal')!).display === 'none', undefined,
    { timeout: 5000 }
  );
}

function objectProperty(p: Page, name: string) {
  return p.evaluate((n) => (window as any).__EDITOR_TEST__.getObjectPropertyByName(n), name);
}

describe('owl:Thing spelling in the object-property domain field (E2E)', () => {
  it('records a global domain when the full owl#Thing URI is typed', async () => {
    await setDomain(page, property, OWL_THING_URI);

    const op = await objectProperty(page, property);
    expect(op?.hasGlobalDomain).toBe(true);
    expect(op?.domain).toBeUndefined();

    const turtle = await page.evaluate(() => (window as any).__EDITOR_TEST__.getSerializedTurtle());
    expect(turtle).toContain('owl:Thing');
  });

  it('records the same thing for the prefixed spelling', async () => {
    await setDomain(page, property, 'owl:Thing');

    const op = await objectProperty(page, property);
    expect(op?.hasGlobalDomain).toBe(true);
    expect(op?.domain).toBeUndefined();
  });

  it('still treats a real class as a real domain', async () => {
    await setDomain(page, property, 'Beta');

    const op = await objectProperty(page, property);
    expect(op?.hasGlobalDomain).toBe(false);
    expect(op?.domain).toBe('Beta');
  });
});
