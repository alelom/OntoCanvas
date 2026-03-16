/**
 * Compare original files with serialized output
 * Checks various requirements like blank nodes, property order, comments, etc.
 */
export interface ComparisonResult {
  scenario: string;
  testCase: string;
  passed: boolean;
  issues: string[];
  warnings: string[];
  original: string;
  serialized: string;
  requirements: RequirementCheck[];
}

export interface RequirementCheck {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export type RequirementType = 
  | 'blank-node-definitions'
  | 'blank-node-inline-forms'
  | 'property-order'
  | 'comments'
  | 'annotations'
  | 'imports'
  | 'prefixes'
  | 'round-trip';

/**
 * Compare outputs based on specified requirements
 */
export function compareOutputs(
  original: string,
  serialized: string,
  requirements: RequirementType[],
  scenario: string,
  testCase: string
): ComparisonResult {
  const checks: RequirementCheck[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];

  for (const req of requirements) {
    const check = checkRequirement(original, serialized, req);
    checks.push(check);
    
    if (!check.passed) {
      issues.push(`${req}: ${check.message}`);
    } else if (check.details) {
      warnings.push(`${req}: ${check.details}`);
    }
  }

  const passed = issues.length === 0;

  return {
    scenario,
    testCase,
    passed,
    issues,
    warnings,
    original,
    serialized,
    requirements: checks
  };
}

/**
 * Check a specific requirement
 */
function checkRequirement(
  original: string,
  serialized: string,
  requirement: RequirementType
): RequirementCheck {
  switch (requirement) {
    case 'blank-node-definitions':
      return checkBlankNodeDefinitions(original, serialized);
    case 'blank-node-inline-forms':
      return checkBlankNodeInlineForms(original, serialized);
    case 'property-order':
      return checkPropertyOrder(original, serialized);
    case 'comments':
      return checkComments(original, serialized);
    case 'annotations':
      return checkAnnotations(original, serialized);
    case 'imports':
      return checkImports(original, serialized);
    case 'prefixes':
      return checkPrefixes(original, serialized);
    case 'round-trip':
      return checkRoundTrip(original, serialized);
    default:
      return {
        name: requirement,
        passed: false,
        message: `Unknown requirement type: ${requirement}`
      };
  }
}

/**
 * Check if blank node definitions are serialized (even when only used as objects)
 */
function checkBlankNodeDefinitions(original: string, serialized: string): RequirementCheck {
  // Find blank nodes used as objects in original (e.g., rdfs:subClassOf _:blank1)
  const blankNodeRefsInOriginal = original.match(/rdfs:subClassOf\s+\[/g);
  const blankNodeRefsInSerialized = serialized.match(/rdfs:subClassOf\s+\[/g);
  
  if (!blankNodeRefsInOriginal || blankNodeRefsInOriginal.length === 0) {
    return {
      name: 'blank-node-definitions',
      passed: true,
      message: 'No blank nodes in original to check'
    };
  }

  // Check if inline forms are present
  const hasInlineForms = /\[[\s\S]*?\]/.test(serialized);
  
  if (!hasInlineForms) {
    return {
      name: 'blank-node-definitions',
      passed: false,
      message: 'Blank node inline forms not found in serialized output'
    };
  }

  // Count restrictions in original vs serialized
  const originalRestrictions = (original.match(/owl:Restriction/g) || []).length;
  const serializedRestrictions = (serialized.match(/owl:Restriction/g) || []).length;

  if (serializedRestrictions < originalRestrictions) {
    return {
      name: 'blank-node-definitions',
      passed: false,
      message: `Missing restrictions: expected ${originalRestrictions}, found ${serializedRestrictions}`
    };
  }

  // Check for empty blank nodes
  const emptyBlanks = serialized.match(/\[\s*\]/g);
  if (emptyBlanks && emptyBlanks.length > 0) {
    return {
      name: 'blank-node-definitions',
      passed: false,
      message: `Found ${emptyBlanks.length} empty blank node(s) [ ] in serialized output`
    };
  }

  return {
    name: 'blank-node-definitions',
    passed: true,
    message: 'Blank node definitions are serialized correctly'
  };
}

/**
 * Check if blank nodes are serialized as inline forms [ ... ]
 */
function checkBlankNodeInlineForms(original: string, serialized: string): RequirementCheck {
  const inlineFormPattern = /\[[\s\S]*?owl:Restriction[\s\S]*?\]/g;
  const originalInlineForms = (original.match(inlineFormPattern) || []).length;
  const serializedInlineForms = (serialized.match(inlineFormPattern) || []).length;

  if (serializedInlineForms < originalInlineForms) {
    return {
      name: 'blank-node-inline-forms',
      passed: false,
      message: `Missing inline forms: expected ${originalInlineForms}, found ${serializedInlineForms}`
    };
  }

  // Check that inline forms contain required properties
  const inlineForms = serialized.match(/\[[\s\S]*?\]/g) || [];
  for (const form of inlineForms) {
    if (!form.includes('owl:Restriction')) continue; // Skip non-restriction forms
    
    const hasOnProperty = form.includes('owl:onProperty');
    const hasOnClass = form.includes('owl:onClass') || form.includes('owl:someValuesFrom');
    
    if (!hasOnProperty || !hasOnClass) {
      return {
        name: 'blank-node-inline-forms',
        passed: false,
        message: 'Inline form missing required properties (owl:onProperty or owl:onClass)'
      };
    }
  }

  return {
    name: 'blank-node-inline-forms',
    passed: true,
    message: 'Blank nodes are serialized as inline forms'
  };
}

/**
 * Check if property order is preserved
 */
function checkPropertyOrder(original: string, serialized: string): RequirementCheck {
  // Extract property order from original (for a specific subject)
  // This is a simplified check - we look for common patterns
  const originalOrder = extractPropertyOrder(original);
  const serializedOrder = extractPropertyOrder(serialized);

  if (originalOrder.length === 0) {
    return {
      name: 'property-order',
      passed: true,
      message: 'No properties to check order'
    };
  }

  // Check if key properties are in similar order
  // We're lenient - just check that subClassOf comes before label, etc.
  const keyProps = ['subClassOf', 'label', 'comment', 'type'];
  let orderMatches = true;
  const mismatches: string[] = [];

  for (let i = 0; i < keyProps.length - 1; i++) {
    const prop1 = keyProps[i];
    const prop2 = keyProps[i + 1];
    
    const origIdx1 = originalOrder.indexOf(prop1);
    const origIdx2 = originalOrder.indexOf(prop2);
    const serialIdx1 = serializedOrder.indexOf(prop1);
    const serialIdx2 = serializedOrder.indexOf(prop2);

    if (origIdx1 !== -1 && origIdx2 !== -1) {
      // Both exist in original
      if (origIdx1 < origIdx2) {
        // prop1 should come before prop2
        if (serialIdx1 !== -1 && serialIdx2 !== -1 && serialIdx1 > serialIdx2) {
          orderMatches = false;
          mismatches.push(`${prop1} should come before ${prop2}`);
        }
      }
    }
  }

  if (!orderMatches) {
    return {
      name: 'property-order',
      passed: false,
      message: `Property order mismatch: ${mismatches.join(', ')}`
    };
  }

  return {
    name: 'property-order',
    passed: true,
    message: 'Property order is preserved (or acceptable)',
    details: originalOrder.length !== serializedOrder.length ? 
      `Order length differs: original ${originalOrder.length}, serialized ${serializedOrder.length}` : undefined
  };
}

/**
 * Extract property order from Turtle content
 */
function extractPropertyOrder(content: string): string[] {
  const order: string[] = [];
  // Find first class or property definition
  const classMatch = content.match(/(:\w+|<\S+>)\s+([\s\S]*?)\s*\./);
  if (!classMatch) return order;

  const properties = classMatch[2];
  // Extract predicates
  const predicatePattern = /(\S+)\s+[^;.]+[;.]/g;
  let match;
  while ((match = predicatePattern.exec(properties)) !== null) {
    const pred = match[1].trim();
    // Normalize (remove prefix)
    const normalized = pred.replace(/^[a-z]+:/, '').replace(/^:/, '').replace(/^a$/, 'type');
    if (!order.includes(normalized)) {
      order.push(normalized);
    }
  }
  return order;
}

/**
 * Check if comments are preserved
 */
function checkComments(original: string, serialized: string): RequirementCheck {
  // Count comment lines
  const originalComments = (original.match(/^#.*$/gm) || []).length;
  const serializedComments = (serialized.match(/^#.*$/gm) || []).length;

  // rdflib typically doesn't preserve comments, so this will likely fail
  // But we check anyway to document the behavior
  if (serializedComments < originalComments) {
    return {
      name: 'comments',
      passed: false,
      message: `Comments not preserved: original has ${originalComments}, serialized has ${serializedComments}`
    };
  }

  return {
    name: 'comments',
    passed: true,
    message: 'Comments are preserved'
  };
}

/**
 * Check if annotation properties are preserved
 */
function checkAnnotations(original: string, serialized: string): RequirementCheck {
  // Check for common annotation properties
  const annotationProps = ['labellableRoot', 'exampleImage'];
  const missing: string[] = [];

  for (const prop of annotationProps) {
    const originalHas = original.includes(`:${prop}`) || original.includes(`<#${prop}>`);
    const serializedHas = serialized.includes(`:${prop}`) || serialized.includes(`<#${prop}>`);

    if (originalHas && !serializedHas) {
      missing.push(prop);
    }
  }

  if (missing.length > 0) {
    return {
      name: 'annotations',
      passed: false,
      message: `Missing annotation properties: ${missing.join(', ')}`
    };
  }

  return {
    name: 'annotations',
    passed: true,
    message: 'Annotation properties are preserved'
  };
}

/**
 * Check if owl:imports are preserved
 */
function checkImports(original: string, serialized: string): RequirementCheck {
  // Original may use <uri> format, serialized may use prefix notation (e.g., exa:import1)
  // Count imports in both formats
  const originalImportsFullUri = (original.match(/owl:imports\s+<\S+>/g) || []).length;
  const originalImportsPrefix = (original.match(/owl:imports\s+[^.\s<>]+/g) || []).length;
  const originalImports = originalImportsFullUri + originalImportsPrefix;
  
  // Serialized may use either format
  const serializedImportsFullUri = (serialized.match(/owl:imports\s+<\S+>/g) || []).length;
  // Match owl:imports followed by identifier (may be comma-separated list)
  const serializedImportsPrefix = (serialized.match(/owl:imports\s+[^.\s<>]+/g) || []).length;
  const serializedImports = serializedImportsFullUri + serializedImportsPrefix;
  
  // Also check for comma-separated lists (rdflib may serialize as: owl:imports exa:import1, exa:import2)
  const serializedCommaSeparated = (serialized.match(/owl:imports\s+[^.]+,/g) || []).length;
  // Count commas to estimate number of imports in comma-separated format
  const commaCount = (serialized.match(/owl:imports[^.]+,/g) || []).reduce((count, match) => {
    return count + (match.match(/,/g) || []).length;
  }, 0);
  
  // If we have comma-separated imports, count them
  let totalSerializedImports = serializedImports;
  if (serializedCommaSeparated > 0) {
    // For comma-separated, we need to count the actual import URIs
    // Simple approach: count distinct import statements (owl:imports appears once per ontology)
    const importStatements = serialized.match(/owl:imports\s+[^.]+/g) || [];
    if (importStatements.length > 0) {
      // Count commas + 1 for the number of imports in comma-separated format
      const commaSeparatedCount = commaCount + importStatements.length;
      totalSerializedImports = Math.max(serializedImports, commaSeparatedCount);
    }
  }

  if (totalSerializedImports < originalImports) {
    return {
      name: 'imports',
      passed: false,
      message: `Missing imports: original has ${originalImports}, serialized has ${totalSerializedImports}`
    };
  }

  return {
    name: 'imports',
    passed: true,
    message: 'Imports are preserved',
    details: originalImports !== totalSerializedImports ? 
      `Format may differ (original: ${originalImportsFullUri} full URIs, serialized: ${serializedImportsFullUri} full URIs + ${serializedImportsPrefix - serializedImportsFullUri} prefix notation)` : undefined
  };
}

/**
 * Check if prefixes are handled correctly
 */
function checkPrefixes(original: string, serialized: string): RequirementCheck {
  // Extract prefix declarations
  const originalPrefixes = (original.match(/@prefix\s+\S+:\s*<\S+>/g) || []).length;
  const serializedPrefixes = (serialized.match(/@prefix\s+\S+:\s*<\S+>/g) || []).length;

  // Check if prefixed names are used correctly
  const originalPrefixedNames = (original.match(/:\w+/g) || []).length;
  const serializedPrefixedNames = (serialized.match(/:\w+/g) || []).length;

  // We're lenient - just check that prefixed names are still used
  if (serializedPrefixedNames < originalPrefixedNames * 0.8) {
    return {
      name: 'prefixes',
      passed: false,
      message: `Many prefixed names lost: original has ${originalPrefixedNames}, serialized has ${serializedPrefixedNames}`
    };
  }

  return {
    name: 'prefixes',
    passed: true,
    message: 'Prefixes are handled correctly',
    details: originalPrefixes !== serializedPrefixes ? 
      `Prefix count differs: original ${originalPrefixes}, serialized ${serializedPrefixes}` : undefined
  };
}

/**
 * Check round-trip consistency (basic check)
 */
function checkRoundTrip(original: string, serialized: string): RequirementCheck {
  // This is a simplified check - full round-trip would require re-parsing
  // Check that key elements are present
  const originalClasses = (original.match(/owl:Class/g) || []).length;
  const serializedClasses = (serialized.match(/owl:Class/g) || []).length;

  if (serializedClasses < originalClasses) {
    return {
      name: 'round-trip',
      passed: false,
      message: `Missing classes: original has ${originalClasses}, serialized has ${serializedClasses}`
    };
  }

  return {
    name: 'round-trip',
    passed: true,
    message: 'Round-trip consistency check passed (basic)',
    details: 'Full round-trip requires re-parsing and quad comparison'
  };
}
