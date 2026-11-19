// @vitest-environment jsdom
/**
 * A term's description on the canvas (#247): what the class, relationship, data property and individual tooltips carry, read
 * from examples/display/definitions.ttl by the app's own parse and build.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/ontology/buildGraph';
import { buildNetworkData } from '../../src/graph/buildNetworkData';
import { createIndividualsLayer } from '../../src/abox/individualsLayer';
import { session, canvasState } from '../../src/state/appState';
import { getShowComment, setShowComment } from '../../src/ui/showCommentSetting';
import { getRelationshipComment, getRelationshipDescription } from '../../src/ui/relationshipUtils';

const EXAMPLE = join(dirname(fileURLToPath(import.meta.url)), '../../examples/display/definitions.ttl');
const NS = 'http://example.org/examples/definitions#';

const filter = {
  wrapChars: 12,
  minFontSize: 20,
  maxFontSize: 70,
  relationshipFontSize: 18,
  searchQuery: '',
  searchScope: 'matches' as never,
  exactMatch: true,
  edgeStyleConfig: {},
  annotationStyleConfig: {} as never,
  layoutMode: 'hierarchical',
};

type Parsed = Awaited<ReturnType<typeof parseRdfToGraph>>;
type Item = { id?: string; label?: string; title?: string; commentText?: string };
let parsed: Parsed;
let items: Item[];
let edges: Item[];

beforeAll(async () => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en');
  parsed = await parseRdfToGraph(readFileSync(EXAMPLE, 'utf-8'), { path: 'display/definitions.ttl' });
  parsed.graphData.nodes.forEach((n, i) => Object.assign(n, { x: i * 300, y: 0 }));
  session.rawData = parsed.graphData;
  session.objectProperties = parsed.objectProperties;
  session.dataProperties = parsed.dataProperties;
  session.ttlStore = parsed.store;
  canvasState.hierarchyTypes = new Set(['subClassOf']);
  const built = buildNetworkData(filter, parsed.graphData);
  items = built.nodes.get() as Item[];
  edges = built.edges.get() as Item[];
});

afterEach(() => {
  localStorage.clear();
});

describe('class node tooltips', () => {
  const node = (id: string) => items.find((n) => n.id === id)!;

  it('a class with both shows its definition, and its comment apart', () => {
    expect(node('Wall').title).toBe('A vertical structure that encloses or divides a space.');
    expect(node('Wall').commentText).toBe('Corresponds to the wall of the standard this ontology follows.');
  });

  it('a class with only a comment shows it as the description, with nothing after it', () => {
    expect(node('Door').title).toBe('An opening in a wall that can be closed.');
    expect(node('Door').commentText).toBeUndefined();
  });

  it('a class with only a definition shows it alone', () => {
    expect(node('Window').title).toBe('An opening in a wall that lets light in.');
    expect(node('Window').commentText).toBeUndefined();
  });

  it('shows every value, English first, then untagged, then another language; separately for the comments', () => {
    expect(node('Roof').title).toBe("The covering of the top of a building.\n\nA covering of a building's top.\n\nDas Dach eines Gebäudes.");
    expect(node('Roof').commentText).toBe('Includes its structure.\n\nPlain note.\n\nOhne die Dachhaut.');
  });

  it('keeps `comment` as the rdfs:comment the dialogs edit', () => {
    const wall = parsed.graphData.nodes.find((n) => n.id === 'Wall');
    expect(wall?.comment).toBe('Corresponds to the wall of the standard this ontology follows.');
    expect(parsed.graphData.nodes.find((n) => n.id === 'Door')?.comment).toBe('An opening in a wall that can be closed.');
  });
});

describe('relationship and data property tooltips', () => {
  it('a relationship edge carries its definition, and its comment apart', () => {
    const edge = edges.find((e) => String(e.id).includes('hasPart'))!;
    expect(edge.title).toBe('Relates a whole to one of its parts.');
    expect(edge.commentText).toBe('Not transitive here: a wall’s window is not a part of the building it stands in.'.replace('’', "'"));
  });

  it('getRelationshipComment still answers the rdfs:comment the edit dialog shows', () => {
    expect(getRelationshipComment('hasPart', parsed.objectProperties)).toMatch(/^Not transitive here/);
    expect(getRelationshipDescription('subClassOf', parsed.objectProperties)).toEqual({ text: 'Classification or sub-typing relationship', comment: '' });
  });

  it('a data property box carries its definition, and its comment apart', () => {
    const box = items.find((n) => String(n.id).includes('height'))!;
    expect(box.title).toContain('The vertical extent of the thing, in metres.');
    expect(box.commentText).toBe('Measured from the finished floor.');
  });
});

describe('individual tooltips', () => {
  it('shows the definition as the description, keeps the comment apart and out of the data rows', () => {
    const layer = createIndividualsLayer({ autoMax: 100, getStores: () => [parsed.store] });
    const node = layer.build(new Map([[`${NS}Wall`, 'Wall']])).nodes.find((n) => n.iri === `${NS}wall1`)!;
    expect(node.title).toContain('The north wall of the hall.');
    expect(node.title).not.toContain('skos');
    expect(node.title).not.toContain('definition:');
    expect(node.title).not.toContain('comment:');
    expect(node.title).not.toContain('Replaced in the second phase.');
    expect(node.comment).toBe('Replaced in the second phase.');
  });
});

describe('the Show comments setting', () => {
  it('is on until the user turns it off, and remembers the choice', () => {
    expect(getShowComment()).toBe(true);
    setShowComment(false);
    expect(getShowComment()).toBe(false);
    setShowComment(true);
    expect(getShowComment()).toBe(true);
  });
});
