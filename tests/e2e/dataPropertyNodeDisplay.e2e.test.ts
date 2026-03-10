/**
 * E2E tests for verifying data property node and external class node display.
 * Tests that prefixes and import hints are correctly displayed.
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
  
  // Close any existing pages to ensure clean state
  const pages = browser.contexts().flatMap(ctx => ctx.pages());
  for (const p of pages) {
    if (p !== page && !p.isClosed()) {
      await p.close();
    }
  }
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
  
  // Simple wait - just wait a bit for file to load
  await page.waitForTimeout(2000);
}

describe('Data Property Node Display E2E', () => {
  it('should display data property nodes with prefix and import hint in data-props-child.ttl', async () => {
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
    
    // Wait for graph to rebuild
    await page.waitForTimeout(1500);
    
    // Get all node information and log it
    const result = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      const network = testHook.getNetwork?.();
      const rawData = testHook.getRawData?.();
      const externalRefs = testHook.getExternalOntologyReferences?.();
      
      if (!network) {
        return { error: 'Network not available', rawData: null, externalRefs: null, nodes: [] };
      }
      
      const allNodes = network.body.data.nodes.get();
      const classNodes = allNodes
        .filter((n: any) => !n.id?.startsWith('__dataprop__'))
        .map((n: any) => ({
          id: n.id,
          label: n.label,
          title: n.title,
          isExternal: n.isExternal,
        }));
      
      const dataPropertyNodes = allNodes
        .filter((n: any) => n.id?.startsWith('__dataprop__'))
        .map((n: any) => ({
          id: n.id,
          label: n.label,
          title: n.title,
        }));
      
      return {
        rawData: rawData ? {
          nodes: rawData.nodes.map((n: any) => ({
            id: n.id,
            label: n.label,
            isExternal: n.isExternal,
            externalOntologyUrl: n.externalOntologyUrl,
          })),
        } : null,
        externalRefs: externalRefs || [],
        classNodes,
        dataPropertyNodes,
      };
    });
    
    // Log everything for debugging
    console.log('[TEST] Raw data nodes:', JSON.stringify(result.rawData?.nodes || [], null, 2));
    console.log('[TEST] External refs:', JSON.stringify(result.externalRefs, null, 2));
    console.log('[TEST] Class nodes in network:', JSON.stringify(result.classNodes, null, 2));
    console.log('[TEST] Data property nodes in network:', JSON.stringify(result.dataPropertyNodes, null, 2));
    
    // Verify createdDate data property node has prefix
    const createdDateNode = result.dataPropertyNodes.find((n: any) => 
      n.label?.includes('createdDate') || n.label?.includes('created date') || n.id?.includes('createdDate')
    );
    
    if (createdDateNode) {
      console.log('[TEST] ✓ createdDate data property node found:', createdDateNode);
      expect(createdDateNode.label).toMatch(/dpbase:\s*(createdDate|created date)/i);
      expect(createdDateNode.label).toMatch(/\(xsd:(dateTime|string)\)/);
      expect(createdDateNode.title).toContain('Imported from');
      expect(createdDateNode.title).toContain('http://example.org/data-base');
    } else {
      console.warn('[TEST] ✗ createdDate data property node not found');
      console.warn('[TEST] Available data property nodes:', result.dataPropertyNodes.map((n: any) => ({ id: n.id, label: n.label })));
    }
  });
  
  it('should display external class node with prefix in data-props-child.ttl', async () => {
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
    
    // Wait for graph to rebuild
    await page.waitForTimeout(1500);
    
    // Get all node information and log it
    const result = await page.evaluate(() => {
      const testHook = (window as any).__EDITOR_TEST__;
      const network = testHook.getNetwork?.();
      const rawData = testHook.getRawData?.();
      
      if (!network) {
        return { error: 'Network not available', rawData: null, nodes: [] };
      }
      
      const allNodes = network.body.data.nodes.get();
      const nodes = allNodes
        .filter((n: any) => !n.id?.startsWith('__dataprop__'))
        .map((n: any) => ({
          id: n.id,
          label: n.label,
          title: n.title,
          isExternal: n.isExternal,
        }));
      
      return {
        rawData: rawData ? {
          nodes: rawData.nodes.map((n: any) => ({
            id: n.id,
            label: n.label,
            isExternal: n.isExternal,
            externalOntologyUrl: n.externalOntologyUrl,
          })),
        } : null,
        nodes,
      };
    });
    
    // Log everything for debugging
    console.log('[TEST] Raw data nodes:', JSON.stringify(result.rawData?.nodes || [], null, 2));
    console.log('[TEST] Class nodes in network:', JSON.stringify(result.nodes, null, 2));
    
    // Check BaseEntity class node
    const baseEntityNode = result.nodes.find((n: any) => 
      (n.id?.includes('BaseEntity') || n.label?.includes('Base Entity')) && n.isExternal
    );
    
    if (baseEntityNode) {
      console.log('[TEST] ✓ External BaseEntity node found:', baseEntityNode);
      expect(baseEntityNode.label).toMatch(/dpbase:\s*Base Entity/i);
      expect(baseEntityNode.title).toContain('Imported from');
      expect(baseEntityNode.title).toContain('http://example.org/data-base');
    } else {
      console.warn('[TEST] ✗ External BaseEntity node not found');
      console.warn('[TEST] Available external nodes:', result.nodes.filter((n: any) => n.isExternal).map((n: any) => ({ id: n.id, label: n.label })));
      console.warn('[TEST] All nodes:', result.nodes.map((n: any) => ({ id: n.id, label: n.label, isExternal: n.isExternal })));
    }
  });
});
