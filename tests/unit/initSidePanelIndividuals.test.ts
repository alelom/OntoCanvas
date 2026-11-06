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
import { clearNotices, getNotices } from '../../src/ui/statusNotices';

const PREFIXES = '@prefix : <http://example.org/d#> . @prefix owl: <http://www.w3.org/2002/07/owl#> .\n';
const store = (turtle: string) => new Store(new Parser().parse(PREFIXES + turtle));

let ontology: Store | null;

const tabButton = () => document.querySelector<HTMLButtonElement>('[data-tab-button="individuals"]');
/** What the tab says it holds: a row for each type, with how many individuals it has. */
const options = () => [...document.querySelectorAll('[data-individuals-group-toggle] .individuals-group-title')].map((o) => o.textContent);
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
    expect(document.querySelector('[data-individuals-search]')).toBeNull();

    tabButton()!.click();

    expect(options()).toEqual([':Room (1)']);
  });

  it('recounts when data is added to the ontology, and when it is removed', async () => {
    const { dataSources } = mount();
    tabButton()!.click();

    const added = await dataSources.addText('more.ttl', PREFIXES + ':room2 a :Room . :room3 a :Room .', { path: 'more.ttl' });
    expect(options()).toEqual([':Room (3)']);

    dataSources.remove(added.id);
    expect(options()).toEqual([':Room (1)']);
  });

  it('recounts when another ontology is opened', () => {
    const { panel } = mount();
    tabButton()!.click();

    ontology = store(':Wall a owl:Class .');
    panel.refresh();

    expect(options()).toEqual([]);
    expect(document.querySelector('[data-individuals-empty]')!.textContent).toMatch(/no individuals/i);
  });

  it('shows nothing to browse before any ontology is open', () => {
    ontology = null;
    mount();

    tabButton()!.click();

    expect(options()).toEqual([]);
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

describe('the toggle for spreading individuals clear of classes (#209)', () => {
  const toggle = () => document.getElementById('relaxIndividualsWrap') as HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="networkWrapper"></div><aside id="sidePanel"></aside><label id="relaxIndividualsWrap" style="display: none"></label>';
  });

  it('is shown when there are individuals, and not when there are none', () => {
    ontology = store(':Room a owl:Class .');
    mount();
    expect(toggle().style.display).toBe('none');

    ontology = store(':Room a owl:Class . :room1 a :Room .');
    mount();
    expect(toggle().style.display).not.toBe('none');
  });

  it('follows the data added, and another ontology being opened', async () => {
    ontology = store(':Room a owl:Class .');
    const { dataSources, panel } = mount();
    expect(toggle().style.display).toBe('none');

    const added = await dataSources.addText('d.ttl', PREFIXES + ':room1 a :Room .', { path: 'd.ttl' });
    expect(toggle().style.display).not.toBe('none');

    dataSources.remove(added.id);
    expect(toggle().style.display).toBe('none');

    ontology = store(':Room a owl:Class . :room9 a :Room .');
    panel.refresh();
    expect(toggle().style.display).not.toBe('none');
  });
});

describe('the Individuals tab and the graph (#216)', () => {
  it('selects in the graph the class of an individual that is drawn there, from the detail of the individual', () => {
    const shown: unknown[] = [];
    initSidePanel({
      getStore: () => ontology,
      getPrefixes: () => ({ '': 'http://example.org/d#' }),
      dataSources: createDataSources(),
      embedded: false,
      getGraph: () => ({ nodes: [{ id: 'Room', uri: 'http://example.org/d#Room' }], edges: [], objectProperties: [] }),
      showInGraph: (match) => shown.push(match),
    });
    tabButton()!.click();
    document.querySelectorAll<HTMLElement>('[data-individuals-group-toggle][aria-expanded="false"]').forEach((t) => t.click());
    document.querySelector<HTMLButtonElement>('[data-individuals-item]')!.click();

    document.querySelector<HTMLButtonElement>('.individual-types [data-individuals-schema-link]')!.click();

    expect(shown).toEqual([{ nodeIds: ['Room'], edgeIds: [], allEdgesOfAProperty: false }].map((m) => expect.objectContaining({ nodeIds: m.nodeIds, edgeIds: m.edgeIds })));
  });
});

describe('dropping data files (#222)', () => {
  const turtleFile = (name: string, turtle: string) => ({ name, size: turtle.length, text: async () => PREFIXES + turtle });
  function drop(on: HTMLElement, files: unknown[]): Event {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } });
    on.dispatchEvent(event);
    return event;
  }
  const names = (dataSources: ReturnType<typeof createDataSources>) => dataSources.list().map((s) => s.name);

  it('adds the files dropped on the panel while the Individuals tab is open', async () => {
    const { dataSources } = mount();
    tabButton()!.click();

    drop(panelEl(), [turtleFile('a.ttl', ':a a :Room .'), turtleFile('b.ttl', ':b a :Room .')]);

    await expect.poll(() => names(dataSources)).toEqual(['a.ttl', 'b.ttl']);
  });

  it('adds the files dropped on the graph while the Individuals tab is open', async () => {
    const { dataSources } = mount();
    tabButton()!.click();

    drop(document.getElementById('networkWrapper')!, [turtleFile('a.ttl', ':a a :Room .')]);

    await expect.poll(() => names(dataSources)).toEqual(['a.ttl']);
  });

  it('leaves a drop alone while the Individuals tab is not open', async () => {
    const { dataSources } = mount();

    const event = drop(document.getElementById('networkWrapper')!, [turtleFile('a.ttl', ':a a :Room .')]);

    expect(event.defaultPrevented).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(names(dataSources)).toEqual([]);
  });
});

describe('hiding a named graph of the data (#224)', () => {
  it('takes its individuals out of the list and the count of the toolbar button', async () => {
    const { dataSources } = mount();
    tabButton()!.click();
    await dataSources.addText(
      'run.nq',
      '<http://example.org/d#r2> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/d#Room> <http://example.org/g1> .\n' +
        '<http://example.org/d#r3> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://example.org/d#Room> <http://example.org/g2> .\n',
      { path: 'run.nq' }
    );
    await renderToolbar();
    expect(options()).toEqual([':Room (3)']);

    dataSources.setGraphHidden('http://example.org/g2', true);

    expect(options()).toEqual([':Room (2)']);
    expect(toolbarButton().textContent).toBe('Individuals (2)');
  });
});

describe('addData (#234)', () => {
  it('opens the Individuals tab and adds the files as one selection', async () => {
    const { dataSources, panel } = mount();
    const file = (name: string, turtle: string) => ({ name, size: turtle.length, text: async () => PREFIXES + turtle });

    await panel.addData({ files: [file('a.ttl', ':a a :Room .'), file('b.ttl', ':b a :Room .')], folders: [] });

    expect(dataSources.list().map((s) => s.name)).toEqual(['a.ttl', 'b.ttl']);
    expect(tabButton()!.getAttribute('aria-selected')).toBe('true');
    expect(options()).toEqual([':Room (3)']);
  });
});

describe('schemaChanged (#235)', () => {
  it('names the classes again (labels from imports read later) and keeps the data', async () => {
    let label: string | null = null;
    const dataSources = createDataSources();
    const panel = initSidePanel({ getStore: () => ontology, getPrefixes: () => ({ '': 'http://example.org/d#' }), dataSources, getClassLabel: () => label, embedded: false });
    tabButton()!.click();
    await dataSources.addText('more.ttl', PREFIXES + ':room2 a :Room .', { path: 'more.ttl' });
    expect(options()).toEqual([':Room (2)']);

    label = 'A room';
    panel.schemaChanged();

    expect(options()).toEqual(['A room (2)']);
    expect(dataSources.list()).toHaveLength(1);
  });
});

describe('onDataStatus (#239)', () => {
  it('tells the progress of adding data, for the loading screen', async () => {
    const { panel } = mount();
    const seen: string[] = [];
    panel.onDataStatus((status, loading) => seen.push(`${loading}|${status}`));

    await panel.addData({ files: [{ name: 'a.ttl', size: 20, text: async () => PREFIXES + ':a a :Room .' }], folders: [] });

    expect(seen[0]).toBe('true|Loading a.ttl…');
    expect(seen[seen.length - 1]).toBe('false|');
  });
});

describe('cancelData (#239 fourth review)', () => {
  it('stops adding data, as the Cancel of the Individuals tab does', async () => {
    const { dataSources, panel } = mount();
    const big = PREFIXES + Array.from({ length: 20000 }, (_, i) => `:r${i} a :Room .`).join('\n');
    const statuses: string[] = [];
    panel.onDataStatus((status) => statuses.push(status));

    const adding = panel.addData({ files: [{ name: 'big.ttl', size: 100, text: async () => big }], folders: [] });
    await expect.poll(() => statuses.some((s) => s.startsWith('Loading big.ttl'))).toBe(true);
    panel.cancelData();
    await adding;

    expect(dataSources.list()).toEqual([]);
    expect(statuses[statuses.length - 1]).toBe('Cancelled.');
  });
});

describe("a folder's images it couldn't see, in the bottom bar (#240)", () => {
  it('sets a warning for a folder whose data names images it does not hold, and takes it out with the folder', async () => {
    clearNotices();
    const { dataSources, panel } = mount();

    await panel.addData({
      files: [],
      folders: [async () => ({ name: 'run-0001', data: [{ path: 'part-0001.ttl', file: { name: 'part-0001.ttl', size: 100, text: async () => `${PREFIXES}:a :image "images/a.png" .` } as unknown as File }], images: [], skipped: 0, unreadable: [] })],
    });

    const [notice] = getNotices();
    expect(notice).toMatchObject({ key: expect.stringMatching(/^folder-images:/), level: 'warning', message: expect.stringMatching(/^run-0001: 1 image its data names isn't in the folder\./) });

    dataSources.removeFolder(dataSources.folders()[0].id);
    expect(getNotices()).toEqual([]);
  });
});
