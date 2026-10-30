// @vitest-environment jsdom
/**
 * The Individuals tab in the side panel (#208, #211): a tab beside Query, a toolbar button beside "SPARQL query" that opens it
 * and says how many individuals there are (or invites adding some), recounting when the data changes or another ontology is
 * opened.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Parser, Store } from 'n3';
import { initSidePanel } from '../../src/ui/sidePanel/initSidePanel';
import { createDataSources } from '../../src/sparql/dataSources';

const PREFIXES = '@prefix : <http://example.org/d#> . @prefix owl: <http://www.w3.org/2002/07/owl#> .\n';
const store = (turtle: string) => new Store(new Parser().parse(PREFIXES + turtle));

let ontology: Store | null;

const tabButton = () => document.querySelector<HTMLButtonElement>('[data-tab-button="individuals"]');
const options = () => [...document.querySelectorAll<HTMLOptionElement>('[data-individuals-class] option')].map((o) => o.textContent);
const toolbarButton = () => document.getElementById('individualsPanelBtn') as HTMLButtonElement;
const queryButton = () => document.getElementById('queryPanelBtn') as HTMLButtonElement;
const panelEl = () => document.getElementById('sidePanel') as HTMLElement;

/** vis-network's toolbar, which the panel's buttons join (it is built after the page, hence the wait). */
async function renderToolbar(): Promise<void> {
  const bar = document.createElement('div');
  bar.className = 'vis-manipulation';
  bar.innerHTML = '<button class="vis-button vis-add"></button><button class="vis-button vis-connect"></button>';
  document.getElementById('networkWrapper')!.appendChild(bar);
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  document.body.innerHTML = '<div id="networkWrapper"></div><aside id="sidePanel"></aside>';
  ontology = store(':Room a owl:Class . :room1 a :Room .');
});

const mount = (dataSources = createDataSources()) => ({
  dataSources,
  panel: initSidePanel({ getStore: () => ontology, getPrefixes: () => ({ '': 'http://example.org/d#' }), dataSources, embedded: false }),
});

describe('initSidePanel with the Individuals tab', () => {
  it('has an Individuals tab beside Query, drawn when it is first opened', () => {
    mount();
    expect(tabButton()).not.toBeNull();
    expect(document.querySelector('[data-individuals-class]')).toBeNull();

    tabButton()!.click();

    expect(options()).toEqual(['All (1)', ':Room (1)']);
  });

  it('recounts when data is added to the ontology, and when it is removed', async () => {
    const { dataSources } = mount();
    tabButton()!.click();

    const added = await dataSources.addText('more.ttl', PREFIXES + ':room2 a :Room . :room3 a :Room .', { path: 'more.ttl' });
    expect(options()).toEqual(['All (3)', ':Room (3)']);

    dataSources.remove(added.id);
    expect(options()).toEqual(['All (1)', ':Room (1)']);
  });

  it('recounts when another ontology is opened', () => {
    const { panel } = mount();
    tabButton()!.click();

    ontology = store(':Wall a owl:Class .');
    panel.refresh();

    expect(options()).toEqual(['All (0)']);
    expect(document.querySelector('[data-individuals-empty]')!.textContent).toMatch(/no individuals/i);
  });

  it('shows nothing to browse before any ontology is open', () => {
    ontology = null;
    mount();

    tabButton()!.click();

    expect(options()).toEqual(['All (0)']);
  });

  it('has the controls to add individuals in the tab', () => {
    mount();

    tabButton()!.click();

    expect(document.querySelector('[data-add-file]')).not.toBeNull();
  });
});

describe('the toolbar button for the Individuals tab', () => {
  it('sits right after "SPARQL query"', async () => {
    mount();
    await renderToolbar();

    expect(document.querySelector('#queryPanelBtn + #individualsPanelBtn')).not.toBeNull();
  });

  it('says how many individuals there are, as the ontology has them', async () => {
    mount();
    await renderToolbar();

    expect(toolbarButton().textContent).toBe('Individuals (1)');
    expect(toolbarButton().title).toMatch(/Browse the 1 individual of this ontology/);
  });

  it('invites adding some when there are none', async () => {
    ontology = store(':Room a owl:Class .');
    mount();
    await renderToolbar();

    expect(toolbarButton().textContent).toBe('Add individuals');
    expect(toolbarButton().title).toMatch(/Add a file or a URL of individuals/);
  });

  it('follows the data added and removed', async () => {
    ontology = store(':Room a owl:Class .');
    const { dataSources } = mount();
    await renderToolbar();

    const added = await dataSources.addText('more.ttl', PREFIXES + ':a a :Room . :b a :Room .', { path: 'more.ttl' });
    expect(toolbarButton().textContent).toBe('Individuals (2)');

    dataSources.remove(added.id);
    expect(toolbarButton().textContent).toBe('Add individuals');
  });

  it('follows the ontology that is opened', async () => {
    const { panel } = mount();
    await renderToolbar();
    expect(toolbarButton().textContent).toBe('Individuals (1)');

    ontology = store(':Wall a owl:Class .');
    panel.refresh();

    expect(toolbarButton().textContent).toBe('Add individuals');
  });

  it('opens the panel on the Individuals tab, and a second click closes it', async () => {
    mount();
    await renderToolbar();

    toolbarButton().click();
    expect(panelEl().hidden).toBe(false);
    expect(panelEl().querySelector('[data-tab-body="individuals"]')!.hasAttribute('hidden')).toBe(false);
    expect(toolbarButton().getAttribute('aria-pressed')).toBe('true');
    expect(queryButton().getAttribute('aria-pressed')).toBe('false');

    toolbarButton().click();
    expect(panelEl().hidden).toBe(true);
    expect(toolbarButton().getAttribute('aria-pressed')).toBe('false');
  });

  it('moves the pressed state with the tab: Query on one, Individuals on the other', async () => {
    mount();
    await renderToolbar();

    queryButton().click();
    expect(queryButton().getAttribute('aria-pressed')).toBe('true');
    toolbarButton().click();

    expect(queryButton().getAttribute('aria-pressed')).toBe('false');
    expect(toolbarButton().getAttribute('aria-pressed')).toBe('true');
  });

  it('is not there in an embedded view, which has no panel', async () => {
    initSidePanel({ getStore: () => ontology, getPrefixes: () => ({}), dataSources: createDataSources(), embedded: true });
    await renderToolbar();

    expect(toolbarButton()).toBeNull();
  });
});

describe('openIndividuals', () => {
  it('opens the panel on the Individuals tab, as the notice about instance data asks', () => {
    const { panel } = mount();

    panel.openIndividuals();

    expect(panelEl().hidden).toBe(false);
    expect(panelEl().querySelector('[data-tab-body="individuals"]')!.hasAttribute('hidden')).toBe(false);
  });

  it('does nothing in an embedded view', () => {
    const panel = initSidePanel({ getStore: () => ontology, getPrefixes: () => ({}), dataSources: createDataSources(), embedded: true });

    expect(() => panel.openIndividuals()).not.toThrow();
    expect(panelEl().hidden).toBe(true);
  });
});

describe('the link from the Query tab', () => {
  it('opens the Individuals tab', async () => {
    const { dataSources } = mount();
    await renderToolbar();
    queryButton().click();
    await dataSources.addText('more.ttl', PREFIXES + ':a a :Room .', { path: 'more.ttl' });

    document.querySelector<HTMLButtonElement>('[data-query-data-manage]')!.click();

    expect(panelEl().querySelector('[data-tab-body="individuals"]')!.hasAttribute('hidden')).toBe(false);
  });
});
