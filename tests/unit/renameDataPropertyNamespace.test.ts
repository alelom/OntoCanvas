/**
 * Unit tests for renameDataPropertyInStore (issue #33, second defect).
 *
 * Renaming a local data property must keep it in its own namespace. It previously derived
 * the target namespace from getClassNamespace(store), which returns the namespace of whichever
 * owl:Class quad comes back first. In a document that declares external typing stubs (e.g. a
 * locally-declared prov:Agent), that can be an external namespace, so a local rename silently
 * reassigned the term to someone else's vocabulary.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseRdfToGraph,
  getDataProperties,
  renameDataPropertyInStore,
  extractLocalName,
} from '../../src/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE = join(__dirname, '../fixtures/aec-provenance-typing-stubs.ttl');
const ADIRO_NS = 'https://w3id.org/adiro/aec_provenance#';

function namespaceOf(uri: string): string {
  return uri.slice(0, uri.length - extractLocalName(uri).length);
}

describe('renameDataPropertyInStore keeps the property in its own namespace', () => {
  it('renames capturedCaption without moving it into an external namespace', async () => {
    const content = readFileSync(FIXTURE, 'utf-8');
    const { store } = await parseRdfToGraph(content, { path: FIXTURE });

    const dp = getDataProperties(store).find((p) => p.name === 'capturedCaption');
    expect(dp?.uri).toBe(`${ADIRO_NS}capturedCaption`);

    const renamed = renameDataPropertyInStore(store, dp!.uri!, 'capturedCaption2');
    expect(renamed).toBe(true);

    const after = getDataProperties(store).find((p) => p.name === 'capturedCaption2');
    expect(after, 'renamed property should be found under its new local name').toBeDefined();
    // The namespace must be unchanged — not http://www.w3.org/ns/prov# (prov:Agent's namespace).
    expect(namespaceOf(after!.uri!)).toBe(ADIRO_NS);
    expect(after!.uri).toBe(`${ADIRO_NS}capturedCaption2`);
  });
});
