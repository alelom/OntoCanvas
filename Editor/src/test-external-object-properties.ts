/**
 * Test file to verify external object property search functionality
 * Run this in the browser console after loading an ontology with owl:imports
 */

// Test function to verify external object properties are searchable
async function testExternalObjectPropertySearch() {
  console.log('=== Testing External Object Property Search ===');
  
  // Check if external references are loaded
  console.log('External references:', (window as any).externalOntologyReferences || 'Not accessible');
  
  // Simulate a search for "contains"
  const testQuery = 'contains';
  console.log(`\nTesting search for "${testQuery}"`);
  
  // Check if the search function exists
  if (typeof (window as any).updateEditEdgeTypeSearch === 'function') {
    console.log('Calling updateEditEdgeTypeSearch...');
    await (window as any).updateEditEdgeTypeSearch(testQuery);
  } else {
    console.log('updateEditEdgeTypeSearch function not found');
  }
  
  // Check if external object properties can be fetched
  const { searchExternalObjectProperties } = await import('./externalOntologySearch');
  const testRefs = [
    { url: 'https://w3id.org/dano', usePrefix: true, prefix: 'dano' }
  ];
  
  console.log('\nTesting direct fetch of external object properties...');
  const results = await searchExternalObjectProperties(testQuery, testRefs);
  console.log(`Found ${results.length} external object properties matching "${testQuery}"`);
  results.forEach((op, idx) => {
    console.log(`  ${idx + 1}. ${op.uri} -> "${op.label}" (prefix: ${op.prefix || 'none'})`);
  });
  
  return results;
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as any).testExternalObjectPropertySearch = testExternalObjectPropertySearch;
}

export { testExternalObjectPropertySearch };
