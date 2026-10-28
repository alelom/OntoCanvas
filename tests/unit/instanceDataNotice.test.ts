// @vitest-environment jsdom
/**
 * A file with instance data (an A-box) opens as a class graph that does not draw the instances: the bottom bar says so
 * (#181). Detection is a pure function of the store; the popup is checked in a DOM.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseRdfToGraph } from '../../src/ontology/buildGraph';
import { detectInstanceData, detectOntologyIssues } from '../../src/ui/ontologyIssues';
import { initStatusBar, updateStatusBar } from '../../src/ui/statusBar';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREFIXES = `
@prefix : <http://example.org/o#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
<http://example.org/o> a owl:Ontology .
`;

async function storeOf(body: string) {
  return (await parseRdfToGraph(PREFIXES + body, { contentType: 'text/turtle' })).store;
}

describe('instance data the graph does not draw (#181)', () => {
  it('counts the individuals of a file, whether their class is declared or not', async () => {
    const store = await storeOf(`
      :Room a owl:Class .
      :r1 a :Room .
      :r2 a :Room .
      :k1 a skos:Concept .
      :n1 a owl:NamedIndividual .
    `);

    const issue = detectInstanceData(store);

    expect(issue).toMatchObject({ type: 'instance_data_not_drawn', severity: 'warning', elementName: '4 individuals' });
  });

  it('says "1 individual" for one', async () => {
    const store = await storeOf(':Room a owl:Class . :r1 a :Room .');
    expect(detectInstanceData(store)?.elementName).toBe('1 individual');
  });

  it('is silent for a file that holds only classes, properties and annotations', async () => {
    const store = await storeOf(`
      :Room a owl:Class ; rdfs:label "Room" .
      :Hall a owl:Class ; rdfs:subClassOf :Room .
      :has a owl:ObjectProperty ; rdfs:domain :Room ; rdfs:range :Hall .
      :note a owl:AnnotationProperty .
      [ a owl:Restriction ; owl:onProperty :has ; owl:someValuesFrom :Hall ] rdfs:subClassOf :Room .
    `);

    expect(detectInstanceData(store)).toBeNull();
  });

  it('does not count the members of an owl:oneOf, which the graph shows in the class expression', async () => {
    const store = await storeOf(`
      :Season a owl:Class ; owl:equivalentClass [ a owl:Class ; owl:oneOf ( :winter :summer ) ] .
      :winter a owl:NamedIndividual .
      :summer a owl:NamedIndividual .
    `);

    expect(detectInstanceData(store)).toBeNull();
  });

  it('is silent for the test ontology, which has classes only', async () => {
    const path = join(__dirname, '../fixtures/aec_drawing_ontology.ttl');
    const { store } = await parseRdfToGraph(readFileSync(path, 'utf-8'), { path });
    expect(detectInstanceData(store)).toBeNull();
  });

  it('points to the SPARQL panel and links the issues that track the wider work', async () => {
    const store = await storeOf(':Room a owl:Class . :r1 a :Room .');

    const issue = detectInstanceData(store)!;

    expect(issue.message).toMatch(/SPARQL/);
    expect(issue.message).toMatch(/work in progress/i);
    expect(issue.links).toEqual([
      { label: '#168', url: 'https://github.com/alelom/OntoCanvas/issues/168' },
      { label: '#181', url: 'https://github.com/alelom/OntoCanvas/issues/181' },
    ]);
  });

  it('is one of the ontology issues', async () => {
    const store = await storeOf(':Room a owl:Class . :r1 a :Room .');
    const issues = await detectOntologyIssues(store);
    expect(issues.map((i) => i.type)).toContain('instance_data_not_drawn');
  });
});

describe('the bottom bar warning', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"><div id="info"></div></div>';
    initStatusBar();
  });

  it('shows the notice in the issues popup, with a link to each issue', async () => {
    updateStatusBar(await storeOf(':Room a owl:Class . :r1 a :Room . :r2 a :Room .'));

    const button = document.getElementById('ontologyIssuesBtn')!;
    await new Promise<void>((resolve) => {
      const check = () => (button.style.display === 'none' ? setTimeout(check, 5) : resolve());
      check();
    });
    button.click();

    const popup = document.getElementById('ontologyIssuesPopup')!;
    expect(popup.textContent).toContain('2 individuals');
    const links = [...popup.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://github.com/alelom/OntoCanvas/issues/168',
      'https://github.com/alelom/OntoCanvas/issues/181',
    ]);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('shows no warning for a file of classes only', async () => {
    updateStatusBar(await storeOf(':Room a owl:Class .'));
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('ontologyIssuesBtn')!.style.display).toBe('none');
  });
});
