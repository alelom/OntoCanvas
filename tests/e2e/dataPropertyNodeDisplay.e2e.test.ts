/**
 * E2E tests for verifying data property node and external class node display.
 * Tests that prefixes and import hints are correctly displayed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { loadTestFile, waitForAppReady } from './testHelpers';
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
  await page.goto(EDITOR_URL, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await page.waitForFunction(() => (window as any).__EDITOR_TEST__ !== undefined, undefined, { timeout: 5000 });
  
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
    await waitForAppReady(page);
    
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
        .filter((n: any) => !n.id?.startsWith('__dataprop'))
        .map((n: any) => ({
          id: n.id,
          label: n.label,
          title: n.title,
          isExternal: n.isExternal,
        }));
      
      const dataPropertyNodes = allNodes
        .filter((n: any) => n.id?.startsWith('__dataprop'))
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
    
    // Verify createdDate data property node has prefix
    const createdDateNode = result.dataPropertyNodes.find((n: any) => 
      n.label?.includes('createdDate') || n.label?.includes('created date') || n.id?.includes('createdDate')
    );
    
    // ExtendedEntity restricts dpbase:createdDate, so it is drawn as a __dataproprestrict__ node.
    expect(createdDateNode, 'createdDate data property node').toBeDefined();
    expect(createdDateNode.label).toMatch(/dpbase:\s*(createdDate|created date)/i);
    expect(createdDateNode.label).toMatch(/\(xsd:(dateTime|string)\)/);
    expect(createdDateNode.title).toContain('Imported from');
    expect(createdDateNode.title).toContain('http://example.org/data-base');
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
    await waitForAppReady(page);
    
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
        .filter((n: any) => !n.id?.startsWith('__dataprop'))
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
    
    // Check BaseEntity class node
    // An external class node is keyed by its full IRI (the rendered node carries no isExternal flag).
    const baseEntityNode = result.nodes.find((n: any) => n.id === 'http://example.org/data-base#BaseEntity');
    expect(baseEntityNode, 'external BaseEntity node').toBeDefined();
    // The imported ontology is not loaded, so there is no rdfs:label and the local name is shown.
    expect(baseEntityNode.label).toMatch(/dpbase:\s*Base\s?Entity/i);
    expect(baseEntityNode.title).toContain('Imported from');
    expect(baseEntityNode.title).toContain('http://example.org/data-base');
  });
});
