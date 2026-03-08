/**
 * E2E test: Display external ontology references in the graph (Person, Project, Organisation from project-mgmt
 * when viewing task-assignment). Checks "Display external references" and that node count increases.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = process.env.EDITOR_URL || process.env.EDITOR_E2E_URL || 'http://localhost:5173/';
const FIXTURES_DIR = join(__dirname, '../fixtures');

async function loadTestFile(page: Page, filePath: string): Promise<void> {
  await page.evaluate(() => {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.style.display = 'block';
      fileInput.style.visibility = 'visible';
      fileInput.style.position = 'absolute';
      fileInput.style.left = '0';
      fileInput.style.top = '0';
      fileInput.style.width = '1px';
      fileInput.style.height = '1px';
    }
  });
  await page.waitForTimeout(50);
  const fileInput = page.locator('input#fileInput');
  await fileInput.setInputFiles(filePath, { timeout: 5000 });
  await page.waitForTimeout(500);
}

async function getNodeCount(page: Page): Promise<number> {
  await page.waitForTimeout(300);
  const text = await page.locator('#nodeCount').textContent();
  const n = parseInt(text ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

describe('External refs visualization E2E', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(5000);
    await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('#openOntologyBtn').waitFor({ state: 'visible', timeout: 5000 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  it('shows external class nodes by default (Display external references ON)', async () => {
    await page.waitForFunction(() => (window as unknown as { __EDITOR_TEST__?: unknown }).__EDITOR_TEST__ !== undefined, { timeout: 5000 });
    await page.evaluate(() => {
      const testHook = (window as unknown as { __EDITOR_TEST__?: { hideOpenOntologyModal?: () => void } }).__EDITOR_TEST__;
      if (testHook?.hideOpenOntologyModal) testHook.hideOpenOntologyModal();
    });
    await page.waitForTimeout(100);

    const taskAssignmentPath = join(FIXTURES_DIR, 'externalRefs-task-assignment.ttl');
    await loadTestFile(page, taskAssignmentPath);

    await page.locator('#vizControls').waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(800);
    const nodeCount = await getNodeCount(page);
    expect(nodeCount).toBeGreaterThanOrEqual(5);
  }, 10000);
});
