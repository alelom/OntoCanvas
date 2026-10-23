/**
 * E2E: SPARQL runs in the real browser bundle over the loaded ontology's store (spike for #169).
 * Unit tests cover the query logic; this proves the lazily loaded Comunica chunk works under Vite
 * and is not fetched until the first query.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { openEditorWithTtl } from './testHelpers';

const TTL = `
@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<http://example.org/o> a owl:Ontology .
:Person a owl:Class ; rdfs:label "Person" .
:Student a owl:Class ; rdfs:label "Student" ; rdfs:subClassOf :Person .
`;

describe('SPARQL in the browser', () => {
  let browser: Browser;
  let page: Page;
  const requested: string[] = [];

  beforeAll(async () => {
    browser = await launchBrowser();
    page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.setDefaultTimeout(5000);
    page.on('request', (req) => requested.push(req.url()));
    await openEditorWithTtl(page, TTL);
  });

  afterAll(async () => {
    await browser?.close();
  });

  it('loads the query engine only when the first query runs, then answers from the store', async () => {
    const loadedBefore = requested.filter((u) => /runQuery|comunica/i.test(u));
    expect(loadedBefore).toEqual([]);

    const result = await page.evaluate(() =>
      (window as any).__EDITOR_TEST__.runSparql(
        'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?s ?p WHERE { ?s rdfs:subClassOf ?p }'
      )
    );

    expect(result.kind).toBe('bindings');
    expect(result.rows).toEqual([{ s: 'http://example.org/o#Student', p: 'http://example.org/o#Person' }]);
    expect(requested.some((u) => /runQuery|comunica/i.test(u))).toBe(true);
  });
});
