// @vitest-environment jsdom
/**
 * Mounting the side panel on the page (#171): the toolbar button toggles the query tab, and in an embedded
 * (read-only) view there is no panel at all.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Store } from 'n3';
import { initSidePanel } from '../../src/ui/sidePanel/initSidePanel';
import { localStorageHistory } from '../../src/sparql/queryHistory';

const deps = (embedded = false) => ({ getStore: () => new Store(), getPrefixes: () => ({}), embedded });
const panel = () => document.getElementById('sidePanel') as HTMLElement;
const button = () => document.getElementById('queryPanelBtn') as HTMLButtonElement;

/** vis-network's toolbar, which the query button joins (it is built after the page, hence the wait). */
async function renderToolbar(): Promise<void> {
  const bar = document.createElement('div');
  bar.className = 'vis-manipulation';
  bar.innerHTML = '<button class="vis-button vis-add"></button><button class="vis-button vis-connect"></button>';
  document.getElementById('networkWrapper')!.appendChild(bar);
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  document.body.innerHTML = '<div id="networkWrapper"></div><aside id="sidePanel"></aside>';
});

describe('initSidePanel', () => {
  it('opens the query tab from the toolbar button and closes it with a second click', async () => {
    initSidePanel(deps());
    await renderToolbar();

    button().click();
    expect(panel().hidden).toBe(false);
    expect(panel().querySelector('[data-query-editor]')).not.toBeNull();
    expect(button().getAttribute('aria-pressed')).toBe('true');

    button().click();
    expect(panel().hidden).toBe(true);
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('offers the queries kept for the open file, under the key it is given (#182)', async () => {
    const key = 'ontology:http://example.org/history-test';
    localStorage.clear();
    localStorageHistory().save(key, [{ query: 'ASK { ?s ?p ?o }', at: 1 }]);
    initSidePanel({ ...deps(), getHistoryKey: () => key });
    await renderToolbar();

    button().click();

    const options = [...panel().querySelectorAll<HTMLOptionElement>('[data-query-history] option')];
    expect(options).toHaveLength(2); // the placeholder and the one query
    expect(options[1].title).toContain('ASK { ?s ?p ?o }');
  });

  it('draws nothing until the button is first pressed', () => {
    initSidePanel(deps());
    expect(panel().hidden).toBe(true);
    expect(panel().querySelector('[data-query-editor]')).toBeNull();
  });

  it('closes with the panel\'s own close button and releases the toolbar button', async () => {
    initSidePanel(deps());
    await renderToolbar();
    button().click();

    panel().querySelector<HTMLButtonElement>('[data-side-panel-close]')!.click();

    expect(panel().hidden).toBe(true);
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('shows no panel and no button when the app is embedded', async () => {
    initSidePanel(deps(true));
    await renderToolbar();

    expect(button()).toBeNull();
    expect(panel().hidden).toBe(true);
    expect(panel().querySelector('[data-query-editor]')).toBeNull();
  });

  it('does nothing when the page has no panel markup', () => {
    document.body.innerHTML = '';
    expect(() => initSidePanel(deps()).refresh()).not.toThrow();
  });
});
