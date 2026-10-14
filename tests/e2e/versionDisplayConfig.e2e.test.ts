/**
 * Opening a version IRI loads that version's display config (#136): the IRI redirects to the release's file, and
 * the config is looked for next to it. A version with no config of its own borrows the latest version's, found
 * by resolving the ontology IRI, and the warning bar says so. Every address is answered by a route.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';

const W3ID = 'https://w3id.test/onto';
const PAGES = 'https://pages.test/onto';
const CORS = { 'access-control-allow-origin': '*' };
const ontology = (version: string) => `@prefix : <${W3ID}#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
<${W3ID}> rdf:type owl:Ontology ; owl:versionIRI <${W3ID}/${version}> ; owl:versionInfo "${version}" .
:A rdf:type owl:Class ; rdfs:label "A" .
`;
const config = (wrapChars: number) => JSON.stringify({ version: 1, wrapChars });

/** The w3id-like redirects, and the files they lead to: 2.0.0 is the latest; only 1.0.0 and the latest have a config. */
const redirects: Record<string, string> = {
  [W3ID]: `${PAGES}/onto.ttl`,
  [`${W3ID}/1.0.0`]: `${PAGES}/1.0.0/onto.ttl`,
  [`${W3ID}/1.5.0`]: `${PAGES}/1.5.0/onto.ttl`,
};
const files: Record<string, { type: string; body: string }> = {
  [`${PAGES}/onto.ttl`]: { type: 'text/turtle', body: ontology('2.0.0') },
  [`${PAGES}/onto.display.json`]: { type: 'application/json', body: config(9) },
  [`${PAGES}/1.0.0/onto.ttl`]: { type: 'text/turtle', body: ontology('1.0.0') },
  [`${PAGES}/1.0.0/onto.display.json`]: { type: 'application/json', body: config(7) },
  [`${PAGES}/1.5.0/onto.ttl`]: { type: 'text/turtle', body: ontology('1.5.0') },
};

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await launchBrowser();
});
afterAll(async () => {
  await browser.close();
});
beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5000);
  // Playwright does not route the request a redirect leads to (it goes to the real network, here unresolvable), so
  // the redirect is made in the page: a fetch of a w3id address fetches its target instead, and the app gets what
  // a real redirect gives it, a response whose `url` is the target.
  await page.addInitScript((map: Record<string, string>) => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return fetchOriginal(map[url] ?? input, init);
    };
  }, redirects);
  await page.route(`${W3ID}**`, (route) => route.fulfill({ status: 404, headers: CORS, body: '' }));
  await page.route(`${PAGES}/**`, (route) => {
    const file = files[route.request().url().split('?')[0]];
    return file
      ? route.fulfill({ status: 200, contentType: file.type, headers: CORS, body: file.body })
      : route.fulfill({ status: 404, headers: CORS, body: '' });
  });
});
afterEach(async () => {
  if (page && !page.isClosed()) await page.close();
});

const open = async (url: string) => {
  await page.goto(`http://localhost:5173/?onto=${encodeURIComponent(url)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
};
const wrapChars = () => page.evaluate(() => (document.getElementById('wrapChars') as HTMLInputElement).value);
const warning = () => page.evaluate(() => {
  const bar = document.getElementById('warningMsg')!;
  return bar.style.display === 'none' ? null : document.getElementById('warningMsgText')!.textContent;
});

describe('display config of a version opened by its version IRI (#136)', () => {
  it('is the one published next to the release file the version IRI redirects to', async () => {
    await open(`${W3ID}/1.0.0`);
    await expect.poll(wrapChars, { timeout: 5000 }).toBe('7');
    expect(await warning()).toBeNull();
  });

  it('is the latest version\'s when the version has none, and the warning bar says so', async () => {
    await open(`${W3ID}/1.5.0`);
    await expect.poll(wrapChars, { timeout: 5000 }).toBe('9');
    expect(await warning()).toContain('layout and colours of the latest version');
  });
});
