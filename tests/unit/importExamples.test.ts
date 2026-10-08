import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';
import { expandWithExternalRefs } from '../../src/graph/externalExpansion';
import { edgeLock } from '../../src/lib/edgeEditability';
import { getMainOntologyBase } from '../../src/parser';
import { importedIdentifier } from '../../src/ui/externalRefs';

const EXAMPLES = join(dirname(fileURLToPath(import.meta.url)), '../../examples/imports');

/** The hand-testing examples for imported terms must keep showing what their header comments promise. */
describe('examples/imports', () => {
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
