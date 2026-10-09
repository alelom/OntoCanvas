/**
 * "Open external ontology" looks for the imported ontology's file in the open ontology's folder first (#103).
 * Browsers don't say which folder an opened file came from, so the app asks once with showDirectoryPicker();
 * here the picker is stubbed with a folder holding the imported ontology under an unrelated name. When the
 * user cancels, the ontology is opened by URL, as before. The lookup is unit-tested in
 * tests/unit/localFileOpeningFromE2e.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { blockExternalRequests, loadTestFile } from './testHelpers';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '../fixtures/imported-ontology');
const EDITOR_URL = 'http://localhost:5173/';
const BASE_CLASS_ID = 'http://example.org/base#BaseClass';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Open the editor with showDirectoryPicker stubbed: it returns a folder holding `files`, or cancels. */
async function openEditor(files: Record<string, string> | 'cancel'): Promise<void> {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await blockExternalRequests(page);
  await page.addInitScript((files) => {
    (window as any).__pickerCalls = 0;
    (window as any).showDirectoryPicker = async () => {
      (window as any).__pickerCalls++;
      if (files === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError');
      const handle = (name: string) => ({ name, kind: 'file', getFile: async () => new File([files[name]], name) });
      return {
        kind: 'directory',
        getFileHandle: async (name: string) => {
          if (!(name in files)) throw new DOMException('Not found', 'NotFoundError');
          return handle(name);
        },
        values: async function* () {
          for (const name of Object.keys(files)) yield handle(name);
        },
      };
    };
  }, files);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  await loadTestFile(page, join(FIXTURES, 'properties-child.ttl'));
  // Record where "Open external ontology" sends its tab instead of opening one. Like a real browser, a tab
  // opened as about:blank is sent on later by setting its location; __blankOpens records how many folder
  // pickers had run when each blank tab was opened (the tab must open on the click, before the picker).
  await page.evaluate(() => {
    (window as any).__openedUrls = [];
    (window as any).__blankOpens = [];
    window.open = ((url?: string | URL) => {
      if (String(url) === 'about:blank') {
        (window as any).__blankOpens.push((window as any).__pickerCalls);
        return { location: { set href(u: string) { (window as any).__openedUrls.push(u); } } };
      }
      (window as any).__openedUrls.push(String(url));
      return null;
    }) as typeof window.open;
  });
}

/** Click "Open external ontology" on BaseClass and return the URL the app opened. */
async function openExternal(): Promise<URL> {
  const before = await page.evaluate(() => (window as any).__openedUrls.length);
  await page.evaluate((id) => (window as any).__EDITOR_TEST__.openContextMenuForNode(id), BASE_CLASS_ID);
  await page.locator('#contextMenu').getByText('Open external ontology').click();
  await expect.poll(() => page.evaluate(() => (window as any).__openedUrls.length), { timeout: 5000 }).toBe(before + 1);
  return new URL(await page.evaluate(() => (window as any).__openedUrls.at(-1)));
}

describe('Open external ontology from the local folder (#103)', () => {

  it('opens the local file found in the folder, asking for the folder only once', async () => {
    await openEditor({
      'properties-child.ttl': readFileSync(join(FIXTURES, 'properties-child.ttl'), 'utf-8'),
      'shared-terms.ttl': readFileSync(join(FIXTURES, 'properties-parent.ttl'), 'utf-8'),
    });
    const first = await openExternal();
    expect(first.searchParams.get('localFile')).toBeTruthy();
    expect(first.searchParams.get('onto')).toBeNull();

    await openExternal();
    expect(await page.evaluate(() => (window as any).__pickerCalls)).toBe(1);
  }, 10000);

  it('opens the tab on the click, before the folder picker runs (a tab opened after it can be blocked)', async () => {
    await openEditor({ 'properties-child.ttl': readFileSync(join(FIXTURES, 'properties-child.ttl'), 'utf-8') });
    await openExternal(); // the folder holds no file for the imported ontology: opened by URL
    expect(await page.evaluate(() => (window as any).__blankOpens)).toEqual([0]);
  }, 10000);

  it('opens the ontology by URL when the user cancels the folder picker', async () => {
    await openEditor('cancel');
    const opened = await openExternal();
    expect(opened.searchParams.get('onto')).toBe('http://example.org/base.html');
  }, 10000);
});
