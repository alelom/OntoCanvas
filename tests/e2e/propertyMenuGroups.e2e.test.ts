/**
 * The property menus' groups (#137), end to end, on examples/display/menu-groups.ttl and the ontology it imports
 * (served from a made-up address): the ontology's own properties first, the imported ones in a collapsed
 * "From other ontologies" group, the deprecated annotations in "Deprecated" (greyed, marked, never styling a class),
 * and those used nowhere in "Not used".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { type Browser, type Page } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { launchBrowser } from './browser';
import { waitForAppReady } from './testHelpers';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples/display');
const WHERE = 'https://examples.test/display/';
const CORS = { 'access-control-allow-origin': '*' };

let browser: Browser;
let page: Page;

/** Each menu as lines: own rows, then "[closed] <group>" with its source headings ("-- base") and rows. */
const structure = (id: string) =>
  page.evaluate((i) => {
    const walk = (el: Element): string[] =>
      [...el.children].flatMap((ch) => {
        if (ch.tagName === 'DETAILS') {
          const d = ch as HTMLDetailsElement;
          return [`[${d.open ? 'open' : 'closed'}] ${d.querySelector('summary')!.textContent}`, ...walk(d).map((s) => `  ${s}`)];
        }
        if (ch.classList.contains('prop-menu-source')) return [`-- ${ch.textContent}`];
        if (ch.tagName === 'STRONG') return [`## ${ch.textContent}`];
        const name = ch.querySelector('.prop-name');
        if (name && !ch.querySelector('details, strong')) return [name.textContent + (ch.classList.contains('prop-deprecated') ? ' (deprecated)' : '')];
        return walk(ch);
      });
    return walk(document.getElementById(i)!);
  }, id);

beforeAll(async () => {
  browser = await launchBrowser();
  page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.setDefaultTimeout(5000);
  await page.route(`${WHERE}*`, (route) => {
    const file = route.request().url().slice(WHERE.length).split('?')[0];
    return /^menu-groups(-base)?\.ttl$/.test(file)
      ? route.fulfill({ status: 200, contentType: 'text/turtle', headers: CORS, body: readFileSync(join(EXAMPLES, file), 'utf-8') })
      : route.fulfill({ status: 404, headers: CORS, body: '' });
  });
  await page.goto(`http://localhost:5173/?onto=${encodeURIComponent(`${WHERE}menu-groups.ttl`)}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
  await waitForAppReady(page);
});
afterAll(async () => {
  await browser.close();
});

describe('property menus: own properties first, the others grouped (#137)', () => {
  it('Object Properties: hasRoom, then the imported one in a collapsed group', async () => {
    expect(await structure('edgeStylesContent')).toEqual(['hasRoom', 'subClassOf', '[closed] From other ontologies (1)', '  -- base', '  base:recordedBy']);
  });

  it('Data Properties: area, then the imported one in a collapsed group', async () => {
    expect(await structure('dataPropsContent')).toEqual(['area', '[closed] From other ontologies (1)', '  -- base', '  base:recordedOn']);
  });

  it('Annotation Properties: the deprecated ones in "Deprecated", what is used nowhere in "Not used", both last', async () => {
    expect(await structure('annotationPropsContent')).toEqual([
      '## Default (no property applies)',
      '## Boolean properties',
      'isLabel',
      '## Text properties (regex)',
      // In priority order within a source, which is the order the properties were found in.
      '[closed] From other ontologies (4)',
      '  -- dcterms',
      '  dcterms:license',
      '  dcterms:title',
      '  -- skos',
      '  skos:altLabel',
      '  skos:definition',
      '[closed] Deprecated (1)',
      '  oldLabelFlag (deprecated)',
      '[closed] Not used (1)',
      '  spareNote',
    ]);
    expect(await page.locator('#annotationPropsContent .prop-deprecated').getAttribute('title')).toBe('Deprecated: use isLabel.');
  });
});
