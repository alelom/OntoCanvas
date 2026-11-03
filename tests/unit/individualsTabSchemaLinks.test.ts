// @vitest-environment jsdom
/**
 * In the detail of an individual in the Individuals tab, a class or a property that is in the graph is a button that selects it
 * there (#216); what is not in the graph stays text.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Parser, Store } from 'n3';
import { createIndividualsTab } from '../../src/ui/sidePanel/individualsTab';
import type { GraphMatch } from '../../src/sparql/graphMatches';

const NS = 'http://example.org/d#';
const store = new Store(new Parser().parse(`@prefix : <${NS}> .
:kind a :Concept , :Room ; :expects :Room ; :mapsTo :hasPart ; :seeAlso :elsewhere .`));
const drawn: Record<string, GraphMatch> = {
  [`${NS}Room`]: { nodeIds: ['Room'], edgeIds: [] },
  [`${NS}hasPart`]: { nodeIds: [], edgeIds: ['Room->Wall:hasPart'] },
};

let container: HTMLElement;
const show = vi.fn();

function open(withLinks = true): void {
  const tab = createIndividualsTab({
    getStores: () => [store],
    getPrefixes: () => ({ '': NS }),
    ...(withLinks ? { schemaLinks: { match: (iri: string) => drawn[iri] ?? null, show } } : {}),
  });
  tab.render(container);
  container.querySelectorAll<HTMLElement>('[data-individuals-group-toggle][aria-expanded="false"]').forEach((t) => t.click());
  container.querySelector<HTMLButtonElement>(`[data-individuals-item][title="${NS}kind"]`)!.click();
}

const links = () => [...container.querySelectorAll<HTMLButtonElement>('[data-individuals-schema-link]')];

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.append(container);
  show.mockClear();
});

describe('links from the detail of an individual to the schema', () => {
  it('makes a property and a class that are in the graph buttons, and selects what they are on click', () => {
    open();

    const outgoing = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('[data-individuals-outgoing] [data-individuals-schema-link]')].find((b) => b.textContent === text)!;
    outgoing(':hasPart').click();
    expect(show).toHaveBeenLastCalledWith({ nodeIds: [], edgeIds: ['Room->Wall:hasPart'] });
    outgoing(':Room').click();
    expect(show).toHaveBeenLastCalledWith({ nodeIds: ['Room'], edgeIds: [] });
  });

  it('makes the class names of the individual buttons when the class is in the graph, and only those', () => {
    open();

    const classRow = container.querySelector('.individual-types')!;
    expect([...classRow.querySelectorAll('[data-individuals-schema-link]')].map((b) => b.textContent)).toEqual([':Room']);
    expect(classRow.textContent).toBe('Class: :Concept, :Room');
  });

  it('leaves a term that is not in the graph as text', () => {
    open();

    const outgoing = container.querySelector('[data-individuals-outgoing]')!;
    expect(outgoing.textContent).toContain(':elsewhere');
    expect([...outgoing.querySelectorAll('[data-individuals-schema-link]')].map((b) => b.textContent).sort()).toEqual([':Room', ':hasPart']);
  });

  it('has no such button without the graph to select in (an ontology alone)', () => {
    open(false);

    expect(links()).toHaveLength(0);
  });
});
