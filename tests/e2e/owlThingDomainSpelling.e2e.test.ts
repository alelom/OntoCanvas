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
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EDITOR_URL = 'http://localhost:5173/';
const FIXTURE = join(__dirname, '../fixtures/owl-thing-domain.ttl');
const OWL_THING_URI = 'http://www.w3.org/2002/07/owl#Thing';
/** Object properties are keyed by their full URI, which is what the edge-styles menu passes. */
const PROPERTY = 'http://example.org/owlthing#relates';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage();
  await page.goto(EDITOR_URL);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const fi = document.getElementById('fileInput') as HTMLInputElement | null;
    if (fi) {
      fi.style.display = 'block';
      fi.style.visibility = 'visible';
      fi.style.position = 'absolute';
      fi.style.width = '1px';
      fi.style.height = '1px';
    }
  });
  await page.locator('input#fileInput').setInputFiles(FIXTURE, { timeout: 5000 });
  await page.waitForFunction(
    () => {
      const net = (window as any).__EDITOR_TEST__?.getNetwork?.();
      return !!net?.body?.data?.nodes?.get?.('Alpha');
    },
    { timeout: 5000 }
  );
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Open the edit modal for an object property and set its domain, then confirm. */
async function setDomain(p: Page, property: string, domain: string): Promise<void> {
  await p.evaluate((name) => (window as any).__EDITOR_TEST__.openEditObjectPropertyModal(name), property);
  await p.waitForFunction(
    () => getComputedStyle(document.getElementById('editRelationshipTypeModal')!).display !== 'none',
    { timeout: 5000 }
  );
  await p.evaluate((value) => {
    const input = document.getElementById('editRelTypeDomain') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, domain);
  await p.evaluate(() => (document.getElementById('editRelTypeConfirm') as HTMLButtonElement).click());
  await p.waitForFunction(
    () => getComputedStyle(document.getElementById('editRelationshipTypeModal')!).display === 'none',
    { timeout: 5000 }
  );
}

function objectProperty(p: Page, name: string) {
  return p.evaluate((n) => (window as any).__EDITOR_TEST__.getObjectPropertyByName(n), name);
}

describe('owl:Thing spelling in the object-property domain field (E2E)', () => {
  it('records a global domain when the full owl#Thing URI is typed', async () => {
    await setDomain(page, PROPERTY, OWL_THING_URI);

    const op = await objectProperty(page, PROPERTY);
    expect(op?.hasGlobalDomain).toBe(true);
    expect(op?.domain).toBeUndefined();

    const turtle = await page.evaluate(() => (window as any).__EDITOR_TEST__.getSerializedTurtle());
    expect(turtle).toContain('owl:Thing');
  });

  it('records the same thing for the prefixed spelling', async () => {
    await setDomain(page, PROPERTY, 'owl:Thing');

    const op = await objectProperty(page, PROPERTY);
    expect(op?.hasGlobalDomain).toBe(true);
    expect(op?.domain).toBeUndefined();
  });

  it('still treats a real class as a real domain', async () => {
    await setDomain(page, PROPERTY, 'Beta');

    const op = await objectProperty(page, PROPERTY);
    expect(op?.hasGlobalDomain).toBe(false);
    expect(op?.domain).toBe('Beta');
  });
});
