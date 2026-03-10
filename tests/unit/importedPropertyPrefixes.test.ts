/**
 * Unit tests for imported property prefix detection and formatting.
 * These tests verify the core logic without DOM interactions.
 */
import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { 
  formatRelationshipLabelWithPrefix, 
  getPrefixForUri,
  isUriFromExternalOntology 
} from '../../src/ui/externalRefs';
import { getMainOntologyBase } from '../../src/parser';
import { loadOntologyFromContent } from '../../src/lib/loadOntology';
import type { ExternalOntologyReference } from '../../src/storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Imported Property Prefixes Unit Tests', () => {
  it('should detect imported object property and return correct prefix', async () => {
    const childFile = join(__dirname, '../fixtures/imported-ontology/object-props-child.ttl');
    const content = readFileSync(childFile, 'utf-8');
    
    const { parseResult, extractedRefs } = await loadOntologyFromContent(content, childFile);
    const { store, objectProperties } = parseResult;
    const mainBase = getMainOntologyBase(store);
    
    // Find the connectsTo property
    const connectsToProp = objectProperties.find(op => 
      op.name === 'connectsTo' || 
      op.uri === 'http://example.org/object-base#connectsTo' ||
      op.name === 'http://example.org/object-base#connectsTo'
    );
    
    expect(connectsToProp).toBeDefined();
    
    // Check if it's imported
    const isImported = isUriFromExternalOntology(
      connectsToProp?.uri || connectsToProp?.name || null,
      connectsToProp?.isDefinedBy || null,
      extractedRefs,
      mainBase
    );
    
    expect(isImported).toBe(true);
    
    // Check prefix
    const prefix = getPrefixForUri(
      connectsToProp?.uri || connectsToProp?.name || null,
      connectsToProp?.isDefinedBy || null,
      extractedRefs,
      mainBase
    );
    
    expect(prefix).toBe('base');
    
    // Check formatted label
    const formatted = formatRelationshipLabelWithPrefix(
      connectsToProp?.uri || connectsToProp?.name || 'connectsTo',
      connectsToProp?.label || 'connectsTo',
      extractedRefs,
      {
        uri: connectsToProp?.uri,
        isDefinedBy: connectsToProp?.isDefinedBy,
      },
      mainBase
    );
    
    expect(formatted).toBe('base:connectsTo');
  });
  
  it('should detect imported data property and return correct prefix', async () => {
    const childFile = join(__dirname, '../fixtures/imported-ontology/data-props-child.ttl');
    const content = readFileSync(childFile, 'utf-8');
    
    const { parseResult, extractedRefs } = await loadOntologyFromContent(content, childFile);
    const { store, dataProperties } = parseResult;
    const mainBase = getMainOntologyBase(store);
    
    // Find the createdDate property
    const createdDateProp = dataProperties.find(dp => 
      dp.name === 'createdDate' || 
      dp.uri === 'http://example.org/data-base#createdDate'
    );
    
    expect(createdDateProp).toBeDefined();
    
    // Check if it's imported
    const isImported = isUriFromExternalOntology(
      createdDateProp?.uri || createdDateProp?.name || null,
      createdDateProp?.isDefinedBy || null,
      extractedRefs,
      mainBase
    );
    
    expect(isImported).toBe(true);
    
    // Check prefix
    const prefix = getPrefixForUri(
      createdDateProp?.uri || createdDateProp?.name || null,
      createdDateProp?.isDefinedBy || null,
      extractedRefs,
      mainBase
    );
    
    expect(prefix).toBe('dpbase');
    
    // Check formatted label
    const formatted = formatRelationshipLabelWithPrefix(
      createdDateProp?.uri || createdDateProp?.name || 'createdDate',
      createdDateProp?.label || 'createdDate',
      extractedRefs,
      {
        uri: createdDateProp?.uri,
        isDefinedBy: createdDateProp?.isDefinedBy,
      },
      mainBase
    );
    
    expect(formatted).toBe('dpbase:createdDate');
  });
  
  it('should detect imported annotation property and return correct prefix', async () => {
    const childFile = join(__dirname, '../fixtures/imported-ontology/labellableRoot-child.ttl');
    const content = readFileSync(childFile, 'utf-8');
    
    const { parseResult, extractedRefs } = await loadOntologyFromContent(content, childFile);
    const { store } = parseResult;
    const mainBase = getMainOntologyBase(store);
    
    // Annotation properties might not be in initial parse - check if used in store
    const labellableRootUri = 'http://example.org/core#labellableRoot';
    const usedQuads = store.getQuads(null, { termType: 'NamedNode', value: labellableRootUri } as any, null, null);
    
    expect(usedQuads.length).toBeGreaterThan(0);
    
    // Check if it's imported (URI belongs to external ontology)
    const isImported = isUriFromExternalOntology(
      labellableRootUri,
      'http://example.org/core', // isDefinedBy from parent ontology
      extractedRefs,
      mainBase
    );
    
    expect(isImported).toBe(true);
    
    // Check prefix
    const prefix = getPrefixForUri(
      labellableRootUri,
      'http://example.org/core',
      extractedRefs,
      mainBase
    );
    
    expect(prefix).toBe('core');
  });
  
  it('should NOT add prefix for locally defined properties', async () => {
    const parentFile = join(__dirname, '../fixtures/imported-ontology/object-props-parent.ttl');
    const content = readFileSync(parentFile, 'utf-8');
    
    const { parseResult, extractedRefs } = await loadOntologyFromContent(content, parentFile);
    const { store, objectProperties } = parseResult;
    const mainBase = getMainOntologyBase(store);
    
    // Find a locally defined property
    const localProp = objectProperties.find(op => op.name && !op.name.startsWith('http'));
    
    if (localProp) {
      // Check if it's imported (should be false)
      const isImported = isUriFromExternalOntology(
        localProp.uri || localProp.name || null,
        localProp.isDefinedBy || null,
        extractedRefs,
        mainBase
      );
      
      expect(isImported).toBe(false);
      
      // Check prefix (should be null)
      const prefix = getPrefixForUri(
        localProp.uri || localProp.name || null,
        localProp.isDefinedBy || null,
        extractedRefs,
        mainBase
      );
      
      expect(prefix).toBeNull();
    }
  });
});
