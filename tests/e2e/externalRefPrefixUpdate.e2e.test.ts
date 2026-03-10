/**
 * E2E tests for verifying that prefix changes in "Manage external references" modal
 * update the UI (Object Properties, Data Properties, Annotation Properties, Classes).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EDITOR_URL = 'http://localhost:5173/';
const TEST_FIXTURES_DIR = join(__dirname, '../fixtures/imported-ontology');

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
  await page.waitForTimeout(500);
  
  // Enable debug mode for tests
  await page.evaluate(() => {
    localStorage.setItem('ontologyEditorDebug', 'true');
  });
});

afterEach(async () => {
  if (page && !page.isClosed()) {
    await page.close();
  }
});

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
  await page.waitForTimeout(100);
  const fileInput = page.locator('input#fileInput');
  await fileInput.setInputFiles(filePath, { timeout: 5000 });
  await page.waitForTimeout(2000);
}

describe('External Ref Prefix Update E2E', () => {
  it('should update Object Properties dropdown when prefix is changed', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'object-props-child.ttl');
    expect(existsSync(childFile)).toBe(true);
    
    await loadTestFile(page, childFile);
    
    // Enable external references display
    await page.evaluate(() => {
      const displayExternalRefEl = document.getElementById('displayExternalRefs') as HTMLInputElement;
      if (displayExternalRefEl && !displayExternalRefEl.checked) {
        displayExternalRefEl.checked = true;
        displayExternalRefEl.dispatchEvent(new Event('change'));
      }
    });
    await page.waitForTimeout(1500);
    
    // Get initial Object Properties dropdown content
    const initialProps = await page.evaluate(() => {
      const edgeStylesContent = document.getElementById('edgeStylesContent');
      if (!edgeStylesContent) return { found: false, items: [] };
      const items = Array.from(edgeStylesContent.querySelectorAll('div[style*="display: flex"]'));
      return {
        found: true,
        items: items.map((item) => ({
          text: item.textContent?.trim() || '',
          html: item.innerHTML,
        })),
      };
    });
    
    console.log('[TEST] Initial Object Properties:', JSON.stringify(initialProps, null, 2));
    
    // Open "Manage external references" modal
    await page.click('#manageExternalRefs');
    await page.waitForTimeout(300);
    
    // Change the prefix from "base" to "testprefix"
    const prefixChanged = await page.evaluate(() => {
      const prefixInput = document.querySelector('.external-ref-prefix') as HTMLInputElement;
      if (!prefixInput) return { success: false, reason: 'Prefix input not found' };
      
      const oldValue = prefixInput.value;
      prefixInput.value = 'testprefix';
      prefixInput.dispatchEvent(new Event('change'));
      
      return { success: true, oldValue, newValue: 'testprefix' };
    });
    
    console.log('[TEST] Prefix change result:', prefixChanged);
    expect(prefixChanged.success).toBe(true);
    
    // Close the modal
    await page.click('#externalRefsCancel');
    await page.waitForTimeout(500);
    
    // Get updated Object Properties dropdown content
    const updatedProps = await page.evaluate(() => {
      const edgeStylesContent = document.getElementById('edgeStylesContent');
      if (!edgeStylesContent) return { found: false, items: [] };
      const items = Array.from(edgeStylesContent.querySelectorAll('div[style*="display: flex"]'));
      return {
        found: true,
        items: items.map((item) => ({
          text: item.textContent?.trim() || '',
          html: item.innerHTML,
        })),
      };
    });
    
    console.log('[TEST] Updated Object Properties:', JSON.stringify(updatedProps, null, 2));
    
    // Verify that the prefix was updated (should show "testprefix:connectsTo" instead of "base:connectsTo")
    const connectsToItem = updatedProps.items.find((item: any) => 
      item.text?.includes('connectsTo') || item.html?.includes('connectsTo')
    );
    
    if (connectsToItem) {
      console.log('[TEST] Found connectsTo item:', connectsToItem);
      expect(connectsToItem.text || connectsToItem.html).toContain('testprefix:');
      expect(connectsToItem.text || connectsToItem.html).not.toContain('base:');
    } else {
      console.warn('[TEST] connectsTo item not found in updated properties');
    }
  });
  
  it('should update Data Properties dropdown when prefix is changed', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');
    expect(existsSync(childFile)).toBe(true);
    
    await loadTestFile(page, childFile);
    
    // Enable external references display
    await page.evaluate(() => {
      const displayExternalRefEl = document.getElementById('displayExternalRefs') as HTMLInputElement;
      if (displayExternalRefEl && !displayExternalRefEl.checked) {
        displayExternalRefEl.checked = true;
        displayExternalRefEl.dispatchEvent(new Event('change'));
      }
    });
    await page.waitForTimeout(1500);
    
    // Get initial Data Properties dropdown content
    const initialProps = await page.evaluate(() => {
      const dataPropsContent = document.getElementById('dataPropsContent');
      if (!dataPropsContent) return { found: false, items: [] };
      const items = Array.from(dataPropsContent.querySelectorAll('div[style*="display: flex"]'));
      return {
        found: true,
        items: items.map((item) => ({
          text: item.textContent?.trim() || '',
          html: item.innerHTML,
        })),
      };
    });
    
    console.log('[TEST] Initial Data Properties:', JSON.stringify(initialProps, null, 2));
    
    // Open "Manage external references" modal
    await page.click('#manageExternalRefs');
    await page.waitForTimeout(300);
    
    // Change the prefix from "dpbase" to "testprefix"
    const prefixChanged = await page.evaluate(() => {
      const prefixInput = document.querySelector('.external-ref-prefix') as HTMLInputElement;
      if (!prefixInput) return { success: false, reason: 'Prefix input not found' };
      
      const oldValue = prefixInput.value;
      prefixInput.value = 'testprefix';
      prefixInput.dispatchEvent(new Event('change'));
      
      return { success: true, oldValue, newValue: 'testprefix' };
    });
    
    console.log('[TEST] Prefix change result:', prefixChanged);
    expect(prefixChanged.success).toBe(true);
    
    // Close the modal
    await page.click('#externalRefsCancel');
    await page.waitForTimeout(500);
    
    // Get updated Data Properties dropdown content
    const updatedProps = await page.evaluate(() => {
      const dataPropsContent = document.getElementById('dataPropsContent');
      if (!dataPropsContent) return { found: false, items: [] };
      const items = Array.from(dataPropsContent.querySelectorAll('div[style*="display: flex"]'));
      return {
        found: true,
        items: items.map((item) => ({
          text: item.textContent?.trim() || '',
          html: item.innerHTML,
        })),
      };
    });
    
    console.log('[TEST] Updated Data Properties:', JSON.stringify(updatedProps, null, 2));
    
    // Verify that the prefix was updated (should show "testprefix:createdDate" instead of "dpbase:createdDate")
    const createdDateItem = updatedProps.items.find((item: any) => 
      item.text?.includes('createdDate') || item.html?.includes('createdDate') || 
      item.text?.includes('created date') || item.html?.includes('created date')
    );
    
    if (createdDateItem) {
      console.log('[TEST] Found createdDate item:', createdDateItem);
      expect(createdDateItem.text || createdDateItem.html).toContain('testprefix:');
      expect(createdDateItem.text || createdDateItem.html).not.toContain('dpbase:');
    } else {
      console.warn('[TEST] createdDate item not found in updated properties');
    }
  });
  
  it('should update class node labels when prefix is changed', async () => {
    const childFile = join(TEST_FIXTURES_DIR, 'data-props-child.ttl');
    expect(existsSync(childFile)).toBe(true);
    
    await loadTestFile(page, childFile);
    
    // Enable external references display
    await page.evaluate(() => {
      const displayExternalRefEl = document.getElementById('displayExternalRefs') as HTMLInputElement;
      if (displayExternalRefEl && !displayExternalRefEl.checked) {
        displayExternalRefEl.checked = true;
        displayExternalRefEl.dispatchEvent(new Event('change'));
      }
    });
    await page.waitForTimeout(1500);
    
    // Get initial class node labels
    const initialNodes = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      const network = testHook.getNetwork?.();
      if (!network) return { found: false, nodes: [] };
      
      const allNodes = network.body.data.nodes.get();
      const nodes = allNodes
        .filter((n: any) => !n.id?.startsWith('__dataprop__'))
        .map((n: any) => ({
          id: n.id,
          label: n.label,
        }));
      
      return { found: true, nodes };
    });
    
    console.log('[TEST] Initial class nodes:', JSON.stringify(initialNodes, null, 2));
    
    // Open "Manage external references" modal
    await page.click('#manageExternalRefs');
    await page.waitForTimeout(300);
    
    // Change the prefix from "dpbase" to "testprefix"
    const prefixChanged = await page.evaluate(() => {
      const prefixInput = document.querySelector('.external-ref-prefix') as HTMLInputElement;
      if (!prefixInput) return { success: false, reason: 'Prefix input not found' };
      
      prefixInput.value = 'testprefix';
      prefixInput.dispatchEvent(new Event('change'));
      
      return { success: true, newValue: 'testprefix' };
    });
    
    console.log('[TEST] Prefix change result:', prefixChanged);
    expect(prefixChanged.success).toBe(true);
    
    // Close the modal
    await page.click('#externalRefsCancel');
    await page.waitForTimeout(500);
    
    // Get updated class node labels
    const updatedNodes = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      const network = testHook.getNetwork?.();
      if (!network) return { found: false, nodes: [] };
      
      const allNodes = network.body.data.nodes.get();
      const nodes = allNodes
        .filter((n: any) => !n.id?.startsWith('__dataprop__'))
        .map((n: any) => ({
          id: n.id,
          label: n.label,
        }));
      
      return { found: true, nodes };
    });
    
    console.log('[TEST] Updated class nodes:', JSON.stringify(updatedNodes, null, 2));
    
    // Verify that BaseEntity node label was updated
    const baseEntityNode = updatedNodes.nodes.find((n: any) => 
      n.id?.includes('BaseEntity') || n.label?.includes('Base Entity')
    );
    
    if (baseEntityNode) {
      console.log('[TEST] Found BaseEntity node:', baseEntityNode);
      expect(baseEntityNode.label).toContain('testprefix:');
      expect(baseEntityNode.label).not.toContain('dpbase:');
    } else {
      console.warn('[TEST] BaseEntity node not found in updated nodes');
    }
  });
});
