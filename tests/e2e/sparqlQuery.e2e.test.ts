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
:Student a owl:Class ; rdfs:label "Student"@en ; rdfs:subClassOf :Person, [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :Person ] .
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
    // The built app names the engine chunk index-browser-<hash>.js; the dev server names it after the package.
    const isEngineChunk = (u: string) => /index-browser|comunica/i.test(u);
    expect(requested.filter((u) => isEngineChunk(u) || /runQuery/i.test(u))).toEqual([]);

    const result = await page.evaluate(() =>
      (window as any).__EDITOR_TEST__.runSparql(
        'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?s ?p WHERE { ?s rdfs:subClassOf ?p FILTER(isIRI(?p)) }'
      )
    );

    expect(result.kind).toBe('bindings');
    expect(result.rows).toEqual([
      {
        s: { termType: 'NamedNode', value: 'http://example.org/o#Student' },
        p: { termType: 'NamedNode', value: 'http://example.org/o#Person' },
      },
    ]);
    expect(requested.some(isEngineChunk)).toBe(true);
  });

  it('returns a blank node under the label the store uses, and a literal with its language', async () => {
    const result = await page.evaluate(() =>
      (window as any).__EDITOR_TEST__.runSparql(
        'PREFIX : <http://example.org/o#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> ' +
          'SELECT ?r ?l WHERE { :Student rdfs:subClassOf ?r . ?r a <http://www.w3.org/2002/07/owl#Restriction> . :Student rdfs:label ?l }'
      )
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].r.termType).toBe('BlankNode');
    expect(result.rows[0].r.value).not.toMatch(/^bc_\d+_/);
    expect(result.rows[0].l).toMatchObject({ termType: 'Literal', value: 'Student', language: 'en' });
  });

  it('refuses an update query', async () => {
    const message = await page.evaluate(() =>
      (window as any).__EDITOR_TEST__.runSparql('DELETE WHERE { ?s ?p ?o }').then(
        () => 'resolved',
        (e: Error) => e.message
      )
    );
    expect(message).toMatch(/read-only/i);
  });
});
