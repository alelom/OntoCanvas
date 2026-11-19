/**
 * A term's tooltip shows its skos:definition as the description, and its rdfs:comment after it under a "Comment" label,
 * unless the user turns the comments off (#247). Unit tests cover the reading and the ordering; this covers the hover
 * and the bottom-bar setting.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadTestFile } from './testHelpers';
import { EDITOR_URL } from './editorUrl';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(__dirname, '../../examples/display/definitions.ttl');

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1200, height: 800 }, locale: 'en' });
  page.setDefaultTimeout(5000);
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  await loadTestFile(page, EXAMPLE);
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

async function nodePoint(id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const r = document.querySelector('#network')!.getBoundingClientRect();
    const d = net.canvasToDOM(net.getPositions([id])[id]);
    return { x: r.left + d.x, y: r.top + d.y };
  }, id);
}

/** What the visible tooltip shows: its text, and its comment section (null when it has none). */
async function hover(id: string): Promise<{ text: string; comment: string | null; label: string | null }> {
  const at = await nodePoint(id);
  await page.mouse.move(0, 0);
  await page.mouse.move(at.x, at.y);
  await page.waitForFunction(() => (document.querySelector('.canvas-tooltip') as HTMLElement | null)?.style.display === 'block');
  return page.evaluate(() => {
    const tip = document.querySelector('.canvas-tooltip')!;
    return {
      text: tip.querySelector('.canvas-tooltip-text')?.textContent ?? tip.textContent ?? '',
      comment: tip.querySelector('.canvas-tooltip-comment-text')?.textContent ?? null,
      label: tip.querySelector('.canvas-tooltip-comment-label')?.textContent ?? null,
    };
  });
}

describe('definition and comment in the tooltip (#247)', () => {
  it('a class with both shows the definition, then the comment under a "Comment" label', async () => {
    expect(await hover('Wall')).toEqual({
      text: 'A vertical structure that encloses or divides a space.',
      comment: 'Corresponds to the wall of the standard this ontology follows.',
      label: 'Comment',
    });
  });

  it('a class with only a comment shows it as the description, with no label', async () => {
    expect(await hover('Door')).toEqual({ text: 'An opening in a wall that can be closed.', comment: null, label: null });
  });

  it('turning "Show comments" off leaves the definition and drops the comment; a comment-only class is unchanged', async () => {
    await page.locator('#showCommentSetting input').uncheck();

    expect(await hover('Wall')).toEqual({ text: 'A vertical structure that encloses or divides a space.', comment: null, label: null });
    expect(await hover('Door')).toEqual({ text: 'An opening in a wall that can be closed.', comment: null, label: null });

    await page.locator('#showCommentSetting input').check();
    expect((await hover('Wall')).comment).toBe('Corresponds to the wall of the standard this ontology follows.');
  });
});
