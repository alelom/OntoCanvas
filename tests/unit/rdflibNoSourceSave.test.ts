/**
 * Saving without the original Turtle source (#90): the rdflib path, used for ontologies loaded from another
 * format (RDF/XML, JSON-LD…). Its output must be valid Turtle with one prefix block, and owl:imports must go
 * on the ontology's real subject, not a made-up `:Ontology`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Parser, type Quad } from 'n3';
import { parseRdfToGraph, storeToTurtle } from '../../src/parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OWL = 'http://www.w3.org/2002/07/owl#';
const REFS = [
  { url: 'http://example.org/ext#', usePrefix: true, prefix: 'ext' },
  { url: 'http://example.org/other', usePrefix: false },
];

const RDF_XML = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology rdf:about="http://example.org/x"/>
  <owl:Class rdf:about="http://example.org/x#Room"><rdfs:label>Room</rdfs:label></owl:Class>
  <owl:Class rdf:about="http://example.org/x#Kitchen"><rdfs:subClassOf rdf:resource="http://example.org/x#Room"/></owl:Class>
</rdf:RDF>`;

async function saveWithoutSource(content: string, path: string): Promise<{ out: string; quads: Quad[]; before: number }> {
  const { store } = await parseRdfToGraph(content, { path });
  const before = store!.size;
  const out = await storeToTurtle(store!, REFS);
  return { out, quads: new Parser().parse(out), before };
}

describe('Turtle saved without a source cache (#90)', () => {
  it.each([
    ['a Turtle file', readFileSync(join(__dirname, '../fixtures/unionDomain.ttl'), 'utf-8'), 'unionDomain.ttl', 'http://example.org/o'],
    ['an RDF/XML file', RDF_XML, 'x.rdf', 'http://example.org/x'],
  ])('from %s: parses, keeps every triple and puts owl:imports on the ontology', async (_name, content, path, ontology) => {
    const { out, quads, before } = await saveWithoutSource(content, path);
    const imports = quads.filter((q) => q.predicate.value === OWL + 'imports');
    expect(imports.map((q) => [q.subject.value, q.object.value]).sort()).toEqual([
      [ontology, 'http://example.org/ext#'],
      [ontology, 'http://example.org/other'],
    ]);
    expect(quads.length).toBe(before + 2);
    expect(out).not.toMatch(/^:Ontology\b/m); // no made-up subject
  });

  it('declares each prefix once', async () => {
    const { out } = await saveWithoutSource(readFileSync(join(__dirname, '../fixtures/unionDomain.ttl'), 'utf-8'), 'unionDomain.ttl');
    const names = [...out.matchAll(/^@prefix\s+([\w-]*):/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toEqual([...new Set(names)]);
  });

  it('does not add an import the ontology already has', async () => {
    const ttl = `@prefix owl: <${OWL}> .\n<http://example.org/x> a owl:Ontology ; owl:imports <http://example.org/other> .\n`;
    const { quads } = await saveWithoutSource(ttl, 'x.ttl');
    expect(quads.filter((q) => q.object.value === 'http://example.org/other')).toHaveLength(1);
  });
});
