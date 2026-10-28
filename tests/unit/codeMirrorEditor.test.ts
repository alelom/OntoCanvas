// @vitest-environment jsdom
/**
 * The CodeMirror editor of the query tab (#178), in a DOM: it holds the text, tells the user's changes from
 * `setText`, runs on Ctrl+Enter, leaves Tab alone, and its grammar parses SPARQL without an error node.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SparqlLanguage } from 'codemirror-lang-sparql';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { mountCodeMirror } from '../../src/ui/sidePanel/codeMirrorEditor';

const hooks = () => ({ onChange: vi.fn(), onRun: vi.fn() });
const parent = () => document.body.appendChild(document.createElement('div'));
const content = () => document.querySelector<HTMLElement>('.cm-content')!;

beforeEach(() => document.body.replaceChildren());

describe('mountCodeMirror', () => {
  it('shows the text and returns it', () => {
    const editor = mountCodeMirror(parent(), 'ASK { ?s ?p ?o }', hooks());
    expect(editor.getText()).toBe('ASK { ?s ?p ?o }');
    expect(content().textContent).toContain('ASK');
  });

  it('does not count setText as a change by the user', () => {
    const h = hooks();
    const editor = mountCodeMirror(parent(), 'a', h);
    editor.setText('SELECT * WHERE { ?s ?p ?o }');
    expect(editor.getText()).toBe('SELECT * WHERE { ?s ?p ?o }');
    expect(h.onChange).not.toHaveBeenCalled();
  });

  it('keeps a rewrite by setText out of the undo history, so Ctrl+Z cannot bring the old text back (#179 review)', () => {
    const editor = mountCodeMirror(parent(), 'PREFIX a: <http://a/#>', hooks());
    editor.setText('PREFIX b: <http://b/#>');

    undo(EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!);

    expect(editor.getText()).toBe('PREFIX b: <http://b/#>');
  });

  it('starts with the selection it is given, so a swap keeps the cursor where it was (#179 review)', () => {
    const editor = mountCodeMirror(parent(), 'SELECT * WHERE {}', hooks(), { from: 7, to: 8 });
    expect(editor.getSelection()).toEqual({ from: 7, to: 8 });
  });

  it('runs on Ctrl+Enter', () => {
    const h = hooks();
    mountCodeMirror(parent(), 'ASK {}', h);
    content().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(h.onRun).toHaveBeenCalledTimes(1);
  });

  it('leaves Tab to the browser, so the keyboard is not trapped', () => {
    mountCodeMirror(parent(), 'ASK {}', hooks());
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    content().dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });
});

describe('the SPARQL grammar', () => {
  const queries = [
    'SELECT ?c WHERE { ?c rdfs:subClassOf+ :Space }',
    'SELECT ?l WHERE { :Room rdfs:label ?l FILTER(lang(?l) = "en") }',
    'SELECT ?r WHERE { :Room rdfs:subClassOf ?r FILTER(isBlank(?r)) }',
    'SELECT (COUNT(?c) AS ?n) WHERE { ?c a owl:Class }',
    'SELECT ?p (COUNT(*) AS ?n) WHERE { ?s ?p ?o } GROUP BY ?p HAVING (COUNT(*) > 1) ORDER BY DESC(?n) LIMIT 10 OFFSET 2',
    'ASK { :Door a owl:Class }',
    'CONSTRUCT { ?c rdfs:subClassOf ?p } WHERE { ?c rdfs:subClassOf ?p . ?p a owl:Class }',
    'DESCRIBE :Room',
    'SELECT * WHERE { VALUES ?x { :A :B UNDEF } ?x a ?t }',
    'SELECT * WHERE { { SELECT ?s WHERE { ?s ?p ?o } LIMIT 1 } OPTIONAL { ?s rdfs:label ?l } MINUS { ?s a owl:Class } }',
    'SELECT * WHERE { { ?s a :A } UNION { ?s a :B } FILTER NOT EXISTS { ?s a :C } BIND(STR(?s) AS ?x) }',
    'SELECT * WHERE { ?a (rdfs:subClassOf|^rdfs:subClassOf)* / !(rdf:type) ?b }',
    'SELECT * WHERE { ?s ?p "x"@en-GB, 5, 5.5, 1e3, true, "5"^^xsd:integer }',
    'PREFIX : <http://ex.org/#>\nSELECT * WHERE { <http://x/y> :p _:b1 , [] } # a comment',
    'select ?s where { ?s a ?t } limit 3',
  ];
  const errorOffsets = (q: string) => {
    const found: number[] = [];
    SparqlLanguage.parser.parse(q).iterate({ enter: (n) => { if (n.type.isError) found.push(n.from); } });
    return found;
  };

  it.each(queries)('parses %s with no error', (q) => {
    expect(errorOffsets(q)).toEqual([]);
  });

  it('flags an unfinished query', () => {
    expect(errorOffsets('SELECT ?x WHERE { ?x ').length).toBeGreaterThan(0);
  });
});
