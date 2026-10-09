import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';
import { expandWithExternalRefs } from '../../src/graph/externalExpansion';
import { edgeLock } from '../../src/lib/edgeEditability';
import { getMainOntologyBase } from '../../src/parser';
import { importedIdentifier } from '../../src/ui/externalRefs';
import { getImportUrls, loadImportedOntologies, readImportedDeclarations, mergeImportedDeclarations } from '../../src/lib/importedDeclarations';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples/imports');

/** The hand-testing examples for imported terms must keep showing what their header comments promise. */
describe('examples/imports', () => {
  it('fetchable-child.ttl: its import is read from next to it, and what the parent declares is listed as context only (#104)', async () => {
    // Opened by URL, a relative owl:imports resolves against where the child was opened from.
    const WHERE = 'https://example.test/examples/imports/';
    const PARENT = 'http://example.org/examples/fetchable-parent#';
    const child = readFileSync(join(EXAMPLES, 'fetchable-child.ttl'), 'utf-8');
    const parent = readFileSync(join(EXAMPLES, 'fetchable-parent.ttl'), 'utf-8');
    const { parseResult, extractedRefs } = await loadOntologyFromContent(child, WHERE + 'fetchable-child.ttl');

    expect(getImportUrls(parseResult.store)).toEqual([WHERE + 'fetchable-parent.ttl']);

    const asked: string[] = [];
    const imported = await loadImportedOntologies(parseResult.store, async (url) => {
      asked.push(url);
      return url === WHERE + 'fetchable-parent.ttl' ? parent : null;
    });
    expect(asked).toEqual([WHERE + 'fetchable-parent.ttl']);

    // The child declares none of the properties: they are known only from the parent.
    expect(parseResult.objectProperties).toEqual([]);
    expect(parseResult.dataProperties).toEqual([]);
    const merged = mergeImportedDeclarations(
      { objectProperties: parseResult.objectProperties, dataProperties: parseResult.dataProperties, annotationProperties: parseResult.annotationProperties },
      readImportedDeclarations(imported)
    );
    // Defined by the parent ontology (its IRI), not by the address it was fetched from: that is what a prefix is matched on.
    expect(merged.objectProperties.find((p) => p.uri === PARENT + 'author')).toMatchObject({ label: 'author', contextOnly: true, isDefinedBy: 'http://example.org/examples/fetchable-parent' });
    expect(merged.dataProperties.find((p) => p.uri === PARENT + 'title')).toMatchObject({ label: 'title', range: 'http://www.w3.org/2001/XMLSchema#string', contextOnly: true });
    expect(merged.dataProperties.find((p) => p.uri === PARENT + 'publishedOn')).toMatchObject({ label: 'published on', range: 'http://www.w3.org/2001/XMLSchema#date', contextOnly: true });

    // The one class it uses is drawn, faded, as the parent's.
    // (The app adds a reference for each prefix a file declares, which is how parent: terms are known as external.)
    const refs = [...extractedRefs, { url: PARENT.replace(/#$/, ''), usePrefix: true, prefix: 'parent' }];
    const shown = expandWithExternalRefs(parseResult.graphData, parseResult.store, refs, { displayExternalReferences: true, externalNodeLayout: 'auto' });
    expect(shown.nodes.find((n) => n.id === PARENT + 'Document')?.isExternal).toBe(true);
    expect(shown.nodes.map((n) => n.id).sort()).toEqual(['Report', PARENT + 'Document']);
  });

  it('imported-terms.ttl: restriction edge to an imported class, data property listed once, prefixed identifier (#99–#101)', async () => {
    const file = 'imported-terms.ttl';
    const { parseResult, extractedRefs } = await loadOntologyFromContent(readFileSync(join(EXAMPLES, file), 'utf-8'), file);
    const LIB = 'http://example.org/examples/library#';

    const shown = expandWithExternalRefs(parseResult.graphData, parseResult.store, extractedRefs, { displayExternalReferences: true, externalNodeLayout: 'auto' });
    const lends = shown.edges.find((e) => e.from === 'Loan' && e.to === LIB + 'Book');
    expect(lends).toMatchObject({ type: LIB + 'lends', restrictionKinds: ['some'], minCardinality: 1 });
    expect(edgeLock(lends!)).toBe('externalTarget');
    expect(shown.nodes.find((n) => n.id === LIB + 'Book')?.isExternal).toBe(true);

    expect(parseResult.objectProperties.map((op) => op.uri)).not.toContain(LIB + 'dueDate');
    const dueDate = parseResult.dataProperties.find((dp) => dp.uri === LIB + 'dueDate');
    expect(dueDate).toBeDefined();
    expect(importedIdentifier(dueDate!.uri, dueDate!.isDefinedBy, extractedRefs, getMainOntologyBase(parseResult.store))).toBe('lib:dueDate');
  });
});
