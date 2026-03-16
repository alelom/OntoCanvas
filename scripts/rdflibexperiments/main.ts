/**
 * Main orchestrator: run all scenarios and generate reports
 */
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'url';
import { runBlankNodeTests } from './scenarios/blankNodes.test.js';
import { runPropertyOrderTests } from './scenarios/propertyOrder.test.js';
import { runCommentsTests } from './scenarios/comments.test.js';
import { runAnnotationsTests } from './scenarios/annotations.test.js';
import { runImportsTests } from './scenarios/imports.test.js';
import { runMultiFormatTests } from './scenarios/multiFormat.test.js';
import { runRoundTripTests } from './scenarios/roundTrip.test.js';
import { generateConsoleReport, generateJSONReport, generateHTMLReport, type TestResults } from './utils/reportGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_DIR = join(__dirname, 'output');

/**
 * Main function to run all experiments
 */
async function main() {
  console.log('🚀 Starting RDFLib Serialization Experiments...\n');

  // Create output directory
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
  }

  const results: TestResults = {};

  try {
    // Run all scenarios
    console.log('📋 Running blank node serialization tests...');
    results.blankNodes = await runBlankNodeTests();

    console.log('📋 Running property order preservation tests...');
    results.propertyOrder = await runPropertyOrderTests();

    console.log('📋 Running comment preservation tests...');
    results.comments = await runCommentsTests();

    console.log('📋 Running annotation property preservation tests...');
    results.annotations = await runAnnotationsTests();

    console.log('📋 Running imports preservation tests...');
    results.imports = await runImportsTests();

    console.log('📋 Running multi-format serialization tests...');
    results.multiFormat = await runMultiFormatTests();

    console.log('📋 Running round-trip consistency tests...');
    results.roundTrip = await runRoundTripTests();

    // Generate reports
    console.log('\n📊 Generating reports...\n');
    generateConsoleReport(results);
    generateJSONReport(results, OUTPUT_DIR);
    generateHTMLReport(results, OUTPUT_DIR);

    // Summary
    const allTests = Object.values(results).flat();
    const total = allTests.length;
    const passed = allTests.filter(r => r.passed).length;
    const failed = total - passed;

    console.log('\n' + '='.repeat(80));
    console.log('✅ EXPERIMENTS COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
    console.log(`\nReports saved to: ${OUTPUT_DIR}`);
    console.log('='.repeat(80) + '\n');

    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error running experiments:', error);
    process.exit(1);
  }
}

// Run if called directly
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
