import { describe, it, expect } from 'vitest';
import { parseRdfToGraph } from '../../src/parser';
import { detectOntologyIssues } from '../../src/ui/ontologyIssues';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Unused Annotation Property Detection', () => {
  it('should not mark labellableRoot as unused when it is used in aec_drawing_metadata.ttl', async () => {
    const ontologyFile = join(__dirname, '../fixtures/aec_drawing_metadata.ttl');
    const content = readFileSync(ontologyFile, 'utf-8');

    // Parse the ontology
    const parseResult = await parseRdfToGraph(content, { path: ontologyFile });
    const { store } = parseResult;

    // Detect ontology issues
    const issues = detectOntologyIssues(store);

    // Find issues related to labellableRoot
    const labellableRootIssues = issues.filter(
      (issue) => issue.elementName === 'labellableRoot' && issue.type === 'unused_annotation_property'
    );

    // labellableRoot is used many times in the file, so it should NOT be marked as unused
    expect(labellableRootIssues.length).toBe(0);

    // Log all unused annotation property issues for debugging
    const unusedApIssues = issues.filter((issue) => issue.type === 'unused_annotation_property');
    if (unusedApIssues.length > 0) {
      console.log('[TEST] Unused annotation property issues found:');
      unusedApIssues.forEach((issue) => {
        console.log(`[TEST]   - ${issue.elementName}: ${issue.message}`);
      });
    }
  });

  it('should correctly detect when an annotation property is actually unused', async () => {
    const ttl = `
@prefix : <http://example.org/test#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

:Ontology rdf:type owl:Ontology .

:unusedProperty rdf:type owl:AnnotationProperty ;
    rdfs:label "Unused Property" .

:usedProperty rdf:type owl:AnnotationProperty ;
    rdfs:label "Used Property" .

:SomeClass rdf:type owl:Class ;
    :usedProperty "some value" .
`;

    const parseResult = await parseRdfToGraph(ttl, { path: 'test.ttl' });
    const { store } = parseResult;

    const issues = detectOntologyIssues(store);
    const unusedApIssues = issues.filter((issue) => issue.type === 'unused_annotation_property');

    // unusedProperty should be marked as unused
    const unusedPropertyIssue = unusedApIssues.find((issue) => issue.elementName === 'unusedProperty');
    expect(unusedPropertyIssue).toBeDefined();

    // usedProperty should NOT be marked as unused
    const usedPropertyIssue = unusedApIssues.find((issue) => issue.elementName === 'usedProperty');
    expect(usedPropertyIssue).toBeUndefined();
  });
});
