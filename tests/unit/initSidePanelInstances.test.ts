// @vitest-environment jsdom
/**
 * The Instances tab in the side panel (#208): it is a tab beside Query, it reads the ontology and the data added to it, and it
 * recounts when the data changes or another ontology is opened.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Parser, Store } from 'n3';
import { initSidePanel } from '../../src/ui/sidePanel/initSidePanel';
import { createDataSources } from '../../src/sparql/dataSources';

const PREFIXES = '@prefix : <http://example.org/d#> . @prefix owl: <http://www.w3.org/2002/07/owl#> .\n';
const store = (turtle: string) => new Store(new Parser().parse(PREFIXES + turtle));

let ontology: Store | null;

const tabButton = () => document.querySelector<HTMLButtonElement>('[data-tab-button="instances"]');
const options = () => [...document.querySelectorAll<HTMLOptionElement>('[data-instances-class] option')].map((o) => o.textContent);

beforeEach(() => {
  document.body.innerHTML = '<div id="networkWrapper"></div><aside id="sidePanel"></aside>';
  ontology = store(':Room a owl:Class . :room1 a :Room .');
});

describe('initSidePanel with the Instances tab', () => {
  const mount = (dataSources = createDataSources()) => ({
    dataSources,
    panel: initSidePanel({ getStore: () => ontology, getPrefixes: () => ({ '': 'http://example.org/d#' }), dataSources, embedded: false }),
  });

  it('has an Instances tab beside Query, drawn when it is first opened', () => {
    mount();
    expect(tabButton()).not.toBeNull();
    expect(document.querySelector('[data-instances-class]')).toBeNull();

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
    expect(document.querySelector('[data-instances-empty]')!.textContent).toMatch(/no individuals/i);
  });

  it('shows nothing to browse before any ontology is open', () => {
    ontology = null;
    mount();

    tabButton()!.click();

    expect(options()).toEqual(['All (0)']);
  });
});
