/**
 * Saving an ontology loaded from RDF/XML (#90): there is no Turtle source to preserve, so the app saves
 * through the rdflib serializer. The saved Turtle must parse, declare each prefix once and keep owl:imports
 * on the ontology's real subject. The serializer is unit-tested in tests/unit/rdflibNoSourceSave.test.ts;
 * this test drives the app's own load and Save.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Parser } from 'n3';
import { loadTestFile } from './testHelpers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../fixtures/rdfxml-with-imports.rdf');
const EDITOR_URL = 'http://localhost:5173/';
const OWL = 'http://www.w3.org/2002/07/owl#';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({ acceptDownloads: true });
  page.setDefaultTimeout(5000);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Save through the app (no file handle, so it downloads) and return the saved text. */
async function saveAndReadDownload(): Promise<string> {
  const downloadPromise = page.waitForEvent('download', { timeout: 5000 });
  await page.evaluate(() => (window as any).__EDITOR_TEST__.saveTtl());
  const download = await downloadPromise;
  return readFileSync((await download.path())!, 'utf-8');
}

describe('Save of an ontology loaded from RDF/XML (#90)', () => {
  it('writes valid Turtle with owl:imports on the ontology', async () => {
    await loadTestFile(page, FIXTURE);
    const saved = await saveAndReadDownload();

    const quads = new Parser().parse(saved); // throws on an undeclared prefix
    const imports = quads.filter((q) => q.predicate.value === OWL + 'imports');
    expect(imports.length).toBeGreaterThan(0);
    expect(new Set(imports.map((q) => q.subject.value))).toEqual(new Set(['http://example.org/loans']));
    expect(imports.map((q) => q.object.value)).toContain('http://example.org/library');
    expect(quads.some((q) => q.subject.value === 'http://example.org/loans#ShortLoan')).toBe(true);

    const prefixNames = [...saved.matchAll(/^@prefix\s+([\w-]*):/gm)].map((m) => m[1]);
    expect(prefixNames).toEqual([...new Set(prefixNames)]);
  }, 10000);
});
