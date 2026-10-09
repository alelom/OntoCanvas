/**
 * Data properties with rdfs:domain owl:Thing apply to every class (#80). By default they are drawn once,
 * under an owl:Thing node, instead of under every class; the toggle switches back to every class.
 */
import { describe, it, expect } from 'vitest';
import { appliesToClass } from '../../src/lib/dataPropertyDisplay';
import { withThingNode, OWL_THING_URI } from '../../src/graph/thingNode';
import type { GraphData } from '../../src/types';

const GLOBAL = { domains: [], hasGlobalDomain: true };
const ON_PERSON = { domains: ['Person'], hasGlobalDomain: false };
const NO_DOMAIN = { domains: [], hasGlobalDomain: false };

describe('appliesToClass with owl:Thing clustering (#80)', () => {
  it('clustered: a global property goes only under owl:Thing', () => {
    expect(appliesToClass(GLOBAL, 'Person', true)).toBe(false);
    expect(appliesToClass(GLOBAL, OWL_THING_URI, true)).toBe(true);
  });

  it('not clustered: a global property goes under every class, as before', () => {
    expect(appliesToClass(GLOBAL, 'Person', false)).toBe(true);
    expect(appliesToClass(GLOBAL, 'Person')).toBe(true);
  });

  it('other properties are unaffected by the toggle', () => {
    expect(appliesToClass(ON_PERSON, 'Person', true)).toBe(true);
    expect(appliesToClass(ON_PERSON, OWL_THING_URI, true)).toBe(false);
    expect(appliesToClass(NO_DOMAIN, OWL_THING_URI, true)).toBe(false);
  });
});

describe('withThingNode (#80)', () => {
  const graph = (): GraphData => ({ nodes: [{ id: 'Person', label: 'Person', labellableRoot: null }], edges: [] });

  it('adds one read-only owl:Thing node when clustering and a property has domain owl:Thing', () => {
    const g = graph();
    const out = withThingNode(g, [GLOBAL, ON_PERSON], true);
    const thing = out.nodes.filter((n) => n.id === OWL_THING_URI);
    expect(thing).toHaveLength(1);
    expect(thing[0]).toMatchObject({ label: 'Thing', isExternal: true });
    expect(g.nodes).toHaveLength(1); // the input graph is not changed
  });

  it('adds nothing when clustering is off or no property has domain owl:Thing', () => {
    const g = graph();
    expect(withThingNode(g, [GLOBAL], false)).toBe(g);
    expect(withThingNode(g, [ON_PERSON, NO_DOMAIN], true)).toBe(g);
  });

  it("reuses an owl:Thing node that's already on the graph", () => {
    const g = graph();
    g.nodes.push({ id: OWL_THING_URI, label: 'Thing (own)', labellableRoot: null, isExternal: true });
    const out = withThingNode(g, [GLOBAL], true);
    expect(out.nodes.filter((n) => n.id === OWL_THING_URI).map((n) => n.label)).toEqual(['Thing (own)']);
  });
});
