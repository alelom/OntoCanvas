import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { isUriFromExternalOntology } from '../../src/ui/externalRefs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ExternalOntologyReference } from '../../src/externalOntologySearch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('External Property Detection', () => {
  it('should not mark local contains property as external in aec_drawing_metadata.ttl', async () => {
    const ontologyFile = join(__dirname, '../fixtures/aec_drawing_metadata.ttl');
    const content = readFileSync(ontologyFile, 'utf-8');

    // Parse the ontology
    const parseResult = await parseRdfToGraph(content, { path: ontologyFile });
    const { objectProperties, store } = parseResult;

    // Find the contains property
    const containsProperty = objectProperties.find((op) => op.name === 'contains' || op.uri?.includes('contains'));
    expect(containsProperty).toBeDefined();
    expect(containsProperty?.uri).toBeDefined();

    // Get main ontology base
    const { getMainOntologyBase } = await import('../../src/parser');
    const mainBase = getMainOntologyBase(store);

    // The main ontology base should be the ontology subject URI
    // From the file: <https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata> rdf:type owl:Ontology
    expect(mainBase).toBe('https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#');

    // Create external ontology references that might match (simulating the bug)
    const externalRefs: ExternalOntologyReference[] = [
      {
        url: 'https://burohappoldmachinelearning.github.io/ADIRO',
        prefix: 'adiro',
      },
    ];

    // The contains property URI should be: https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#contains
    const containsUri = containsProperty!.uri!;
    expect(containsUri).toBe('https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#contains');

    // Check if it's incorrectly identified as external
    // This should return false because the property is local (defined in the main ontology)
    const isExternal = isUriFromExternalOntology(
      containsUri,
      containsProperty?.isDefinedBy,
      externalRefs,
      mainBase
    );

    // The property should NOT be marked as external
    expect(isExternal).toBe(false);
    expect(containsProperty?.isDefinedBy).toBeUndefined(); // Local properties shouldn't have isDefinedBy
  });

  it('should correctly identify external properties', async () => {
    const externalRefs: ExternalOntologyReference[] = [
      {
        url: 'https://example.org/external-ontology#',
        prefix: 'ext',
      },
    ];

    const mainBase = 'https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#';

    // External property URI
    const externalUri = 'https://example.org/external-ontology#someProperty';
    const isExternal = isUriFromExternalOntology(externalUri, null, externalRefs, mainBase);
    expect(isExternal).toBe(true);

    // Local property URI (same base as main ontology)
    const localUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#contains';
    const isLocal = isUriFromExternalOntology(localUri, null, externalRefs, mainBase);
    expect(isLocal).toBe(false);
  });

  it('should handle case where external reference URL is a prefix of main ontology URL', async () => {
    const externalRefs: ExternalOntologyReference[] = [
      {
        url: 'https://burohappoldmachinelearning.github.io/ADIRO',
        prefix: 'adiro',
      },
    ];

    const mainBase = 'https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#';

    // Local property URI - should NOT match external reference even though it starts with it
    const localUri = 'https://burohappoldmachinelearning.github.io/ADIRO/aec-drawing-metadata#contains';
    const isLocal = isUriFromExternalOntology(localUri, null, externalRefs, mainBase);
    expect(isLocal).toBe(false);

    // External property URI from a different sub-path
    const externalUri = 'https://burohappoldmachinelearning.github.io/ADIRO/other-ontology#property';
    const isExternal = isUriFromExternalOntology(externalUri, null, externalRefs, mainBase);
    expect(isExternal).toBe(true);
  });
});
