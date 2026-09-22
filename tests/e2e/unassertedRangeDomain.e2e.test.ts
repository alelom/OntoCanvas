/**
 * E2E tests for https://github.com/alelom/OntoCanvas/issues/25.
 *
 * The fixture is the ADIRO provenance ontology exactly as pinned in the report
 * (commit 4fd2c7ebcf5d5801dafab679fd6d3c8328178548). `prov:generatedAtTime` is a typing stub: an
 * owl:DatatypeProperty with a label, a comment and an rdfs:isDefinedBy, and deliberately no
 * rdfs:range and no rdfs:domain. The canvas used to label it "(xsd:string)" and hang it off every
 * class, including skos:Concept.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EDITOR_URL = 'http://localhost:5173/';
const FIXTURE = join(__dirname, '../fixtures/aec-provenance-typing-stubs.ttl');

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
      return !!net?.body?.data?.nodes?.get && !!net.body.data.nodes.get('FieldAssertion');
    },
    { timeout: 5000 }
  );
});

afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

/** Every rendered data-property node, as `{ id, label }`. */
function dataPropertyNodes(p: Page): Promise<Array<{ id: string; label: string; title?: string }>> {
  return p.evaluate(() => {
    const net = (window as any).__EDITOR_TEST__.getNetwork();
    const out: Array<{ id: string; label: string; title?: string }> = [];
    net.body.data.nodes.forEach((n: any) => {
      if (String(n.id).startsWith('__dataprop')) {
        out.push({ id: String(n.id), label: String(n.label ?? ''), title: n.title });
      }
    });
    return out;
  });
}

describe('Unasserted rdfs:range and rdfs:domain (E2E)', () => {
  it('does not claim a datatype for a property that asserts no range', async () => {
    const nodes = await dataPropertyNodes(page);

    const generatedAtTime = nodes.filter((n) => n.id.includes('generatedAtTime'));
    expect(generatedAtTime).toHaveLength(1);
    expect(generatedAtTime[0].label).not.toContain('xsd:');
    expect(generatedAtTime[0].label.replace(/\n/g, ' ')).toBe('prov:generatedAtTime');
    expect(generatedAtTime[0].title).toContain('No rdfs:range asserted');
  });

  it('keeps an asserted range visibly different from an absent one', async () => {
    const nodes = await dataPropertyNodes(page);

    const capturedCaption = nodes.find((n) => n.id.includes('capturedCaption'))!;
    const generatedAtTime = nodes.find((n) => n.id.includes('generatedAtTime'))!;

    expect(capturedCaption.label).toContain('xsd:string');
    expect(generatedAtTime.label).not.toContain('xsd:string');
  });

  it('shows an asserted rdfs:Literal range, distinct from asserting nothing', async () => {
    const nodes = await dataPropertyNodes(page);

    const hasLiteralValue = nodes.find((n) => n.id.includes('hasLiteralValue'))!;
    expect(hasLiteralValue.label).toContain('rdfs:Literal');
  });

  it('does not attach a domainless property to any class', async () => {
    const nodes = await dataPropertyNodes(page);

    // The old behaviour produced __dataprop__<class>__generatedAtTime for every class node,
    // including skos:Concept, which is present only as another property's range.
    const attachedToAClass = nodes.filter(
      (n) => n.id.includes('generatedAtTime') && !n.id.startsWith('__dataprop__unattached__')
    );
    expect(attachedToAClass).toEqual([]);

    const edgeIds = await page.evaluate(() => {
      const net = (window as any).__EDITOR_TEST__.getNetwork();
      const out: string[] = [];
      net.body.data.edges.forEach((e: any) => out.push(String(e.id)));
      return out;
    });
    expect(edgeIds.filter((id) => id.includes('generatedAtTime'))).toEqual([]);
  });

  it('still attaches properties that do assert a domain', async () => {
    const nodes = await dataPropertyNodes(page);
    const ids = nodes.map((n) => n.id);

    expect(ids).toContain('__dataprop__FieldAssertion__capturedCaption');
    expect(ids).toContain('__dataprop__InferenceMeta__inferredAt');
  });

  it('explains in the tooltip why the property floats free', async () => {
    const nodes = await dataPropertyNodes(page);

    const generatedAtTime = nodes.find((n) => n.id.includes('generatedAtTime'))!;
    expect(generatedAtTime.title).toContain('No rdfs:domain asserted');
  });
});
