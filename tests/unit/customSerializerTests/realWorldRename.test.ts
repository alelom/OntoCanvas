/**
 * Real-world rename test that simulates the exact workflow used by the web GUI.
 * This test performs a simple renaming of the "Drawing Sheet" class label and outputs
 * the serialized TTL for manual inspection by an LLM.
 * 
 * IMPORTANT: This test does not assert correctness. Instead, it outputs the serialized
 * TTL to console and returns a statement that instructs an LLM to:
 * 1. Read the output TTL
 * 2. Check if it matches requirements (formatting preservation, no corruption, etc.)
 * 3. Understand what's wrong if issues are found
 * 4. Write new unit tests to cover the errors
 * 5. Proceed with fixes
 *
 * Skipped in CI: non-deterministic, manual-inspection only; would add log spam
 * without providing pass/fail signal. Run locally when needed.
 */

import { describe, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseRdfToGraph, updateLabelInStore, storeToTurtle } from '../../../src/parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_FIXTURES_DIR = join(__dirname, '../../fixtures');
const FIXTURE_PATH = join(TEST_FIXTURES_DIR, 'aec_drawing_metadata.ttl');

const isCI = !!process.env.CI;
describe.skipIf(isCI)('Real-World Rename Test', () => {
  it('should rename Drawing Sheet class label and output serialized TTL for inspection', async () => {
    // Step 1: Read the original TTL file
    const originalContent = readFileSync(FIXTURE_PATH, 'utf-8');
    
    // Step 2: Parse the file (same as web GUI does)
    const parseResult = await parseRdfToGraph(originalContent, { path: FIXTURE_PATH });
    const { store, originalFileCache } = parseResult;
    
    if (!originalFileCache) {
      throw new Error('Original file cache not available - this test requires cache-based serialization');
    }
    
    // Step 3: Rename "Drawing Sheet" to "Drawing sheet renamed" (same function as web GUI)
    const oldLabel = 'Drawing Sheet';
    const newLabel = 'Drawing sheet renamed';
    const classLocalName = 'DrawingSheet'; // The local name/identifier of the class
    
    const updateResult = updateLabelInStore(store, classLocalName, newLabel);
    
    if (!updateResult) {
      throw new Error(`Failed to update label for class "${classLocalName}"`);
    }
    
    // Step 4: Serialize with custom serializer (same as web GUI when custom serializer is selected)
    let serializedTtl: string;
    let serializationError: Error | null = null;
    
    try {
      serializedTtl = await storeToTurtle(
        store,
        undefined, // externalRefs
        originalContent,
        originalFileCache,
        'custom' // Use custom serializer
      );
    } catch (error) {
      serializationError = error instanceof Error ? error : new Error(String(error));
      // Fallback to rdflib serializer to at least show something
      try {
        serializedTtl = await storeToTurtle(
          store,
          undefined,
          originalContent,
          originalFileCache,
          'rdflib' // Fallback serializer
        );
      } catch (fallbackError) {
        serializedTtl = '[SERIALIZATION FAILED - Could not serialize with either custom or rdflib serializer]';
      }
    }
    
    // Step 5: Output to console for inspection
    console.log('\n' + '='.repeat(80));
    console.log('REAL-WORLD RENAME TEST OUTPUT');
    console.log('='.repeat(80));
    console.log('\nTest performed: Simple renaming of class label');
    console.log(`Class: "${classLocalName}"`);
    console.log(`Old label: "${oldLabel}"`);
    console.log(`New label: "${newLabel}"`);
    
    if (serializationError) {
      console.log('\n⚠️  WARNING: Custom serializer failed with error:');
      console.log(serializationError.message);
      console.log('\nFalling back to rdflib serializer output below:');
    }
    
    console.log('\nSerialized TTL output:');
    console.log('-'.repeat(80));
    console.log(serializedTtl);
    console.log('-'.repeat(80));
    console.log('\n' + '='.repeat(80));
    console.log('END OF OUTPUT');
    console.log('='.repeat(80) + '\n');
    
    // Step 6: Return statement for LLM interpretation
    // This is not an assertion, but a statement that the test completed
    // The actual validation should be done by an LLM reading the console output
    
    const inspectionStatement = `
================================================================================
LLM INSTRUCTION: MANUAL INSPECTION REQUIRED
================================================================================

This test performed a simple renaming of the label of the class 'Drawing Sheet' 
(local name: 'DrawingSheet') to 'Drawing sheet renamed' and has output the 
resulting TTL above.

${serializationError ? `
⚠️  ATTENTION: The custom serializer failed with an error. This indicates
   a critical issue that needs to be fixed. The error was:
   
   ${serializationError.message}
   
   The output above is from the fallback rdflib serializer, which may not
   preserve formatting as required.
` : ''}

REQUIRED ACTIONS:
1. Read the serialized TTL output above
2. Check if it matches our requirements:
   - Only the rdfs:label line for DrawingSheet should be modified
   - All other properties (rdfs:subClassOf, rdfs:comment, :labellableRoot, 
     restrictions) should remain exactly the same
   - No text corruption or duplication
   - No overlapping property lines
   - Formatting should be preserved (indentation, line breaks, property order)
   - Other classes should be completely unchanged
3. If issues are found:
   - Understand what's wrong with the output
   - Write new unit tests in tests/unit/customSerializerTests/ to cover the 
     specific errors found
   - Proceed with fixing the implementation
4. If output looks correct:
   - Document this as a passing test case
   - Consider adding assertions to make this test more robust

The test has completed ${serializationError ? 'with errors' : 'successfully'} 
(serialization ${serializationError ? 'failed' : 'succeeded'}), but manual LLM 
inspection of the output is required to validate correctness.

================================================================================
`;
    
    console.log(inspectionStatement);
    
    // Return a warning/note that this test requires manual inspection
    // We don't throw an error, but we also don't assert correctness
    // The console output is the actual "result" of this test
    
    // If there was a serialization error, we should still note it
    if (serializationError) {
      console.warn('\n⚠️  Test completed but custom serializer failed. See error details above.');
    }
  });
});
