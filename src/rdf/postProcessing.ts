/**
 * Modular post-processing system for rdflib Turtle output.
 * Each post-processing step is a separate, testable function that can be composed together.
 * Steps are designed to be swappable and independently testable.
 */

export interface PostProcessingStep {
  name: string;
  process: (input: string, context?: PostProcessingContext) => string;
}

export interface PostProcessingContext {
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>;
  originalTtlString?: string;
  mainOntologyBase?: string;
}

/**
 * Step 1: Add section dividers
 * Adds section dividers (#####################################) between ontology sections.
 */
export function addSectionDividersStep(input: string, context?: PostProcessingContext): string {
  const SECTION_DIVIDER = '#################################################################';
  const SECTION_ORDER = [
    { type: 'Ontology', label: 'Ontology' },
    { type: 'AnnotationProperty', label: 'Annotation properties' },
    { type: 'ObjectProperty', label: 'Object Properties' },
    { type: 'DatatypeProperty', label: 'Data Properties' },
    { type: 'Class', label: 'Classes' },
  ];

  const lines = input.split('\n');
  
  // Find where prefixes end and content begins
  let contentStartIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip empty lines, comments, and prefix declarations
    if (line === '' || line.startsWith('#') || line.startsWith('@prefix') || line.startsWith('@base')) {
      continue;
    }
    // First non-prefix, non-comment line is the start of content
    contentStartIndex = i;
    break;
  }

  // Parse blocks (simplified - just group by subject for now)
  interface Block {
    lines: string[];
    sectionType: string | null;
    subject: string | null;
  }

  const blocks: Block[] = [];
  let currentBlock: Block | null = null;

  for (let i = contentStartIndex; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (trimmed === '') {
      if (currentBlock) {
        blocks.push(currentBlock);
        currentBlock = null;
      }
      continue;
    }

    // Check if this line starts a new subject
    const subjectMatch = trimmed.match(/^([a-zA-Z0-9_:-]+|<[^>]+>|_:[a-zA-Z0-9_-]+)/);
    if (subjectMatch) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      
      const subject = subjectMatch[1];
      // Detect section type from rdf:type or 'a'
      let sectionType: string | null = null;
      if (trimmed.includes('a owl:Ontology') || trimmed.includes('rdf:type owl:Ontology')) {
        sectionType = 'Ontology';
      } else if (trimmed.includes('a owl:AnnotationProperty') || trimmed.includes('rdf:type owl:AnnotationProperty')) {
        sectionType = 'AnnotationProperty';
      } else if (trimmed.includes('a owl:ObjectProperty') || trimmed.includes('rdf:type owl:ObjectProperty')) {
        sectionType = 'ObjectProperty';
      } else if (trimmed.includes('a owl:DatatypeProperty') || trimmed.includes('rdf:type owl:DatatypeProperty')) {
        sectionType = 'DatatypeProperty';
      } else if (trimmed.includes('a owl:Class') || trimmed.includes('rdf:type owl:Class')) {
        sectionType = 'Class';
      }
      
      currentBlock = {
        lines: [line],
        sectionType,
        subject,
      };
    } else if (currentBlock) {
      // Continuation of current block
      currentBlock.lines.push(line);
    }
  }
  
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // Group blocks by section type
  const blocksBySection = new Map<string, Block[]>();
  for (const block of blocks) {
    const sectionType = block.sectionType || 'Other';
    const list = blocksBySection.get(sectionType) || [];
    list.push(block);
    blocksBySection.set(sectionType, list);
  }

  // Sort blocks within each section by subject
  for (const [sectionType, sectionBlocks] of blocksBySection.entries()) {
    sectionBlocks.sort((a, b) => {
      const aSubj = a.subject || '';
      const bSubj = b.subject || '';
      return aSubj.localeCompare(bSubj);
    });
  }

  // Build output
  const result: string[] = [];
  
  // Add header (prefixes, @base, etc.)
  for (let i = 0; i < contentStartIndex; i++) {
    result.push(lines[i]);
  }

  // Add sections in order
  for (const sectionConfig of SECTION_ORDER) {
    const sectionBlocks = blocksBySection.get(sectionConfig.type);
    if (sectionBlocks && sectionBlocks.length > 0) {
      if (result.length > 0 && result[result.length - 1].trim() !== '') {
        result.push('');
      }
      result.push(SECTION_DIVIDER);
      result.push(`#    ${sectionConfig.label}`);
      result.push(SECTION_DIVIDER);
      result.push('');
      
      for (const block of sectionBlocks) {
        result.push(...block.lines);
        if (result[result.length - 1].trim() !== '') {
          result.push('');
        }
      }
    }
  }

  // Handle other blocks
  const otherBlocks = blocksBySection.get('Other');
  if (otherBlocks && otherBlocks.length > 0) {
    if (result.length > 0 && result[result.length - 1].trim() !== '') {
      result.push('');
    }
    for (const block of otherBlocks) {
      result.push(...block.lines);
    }
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * Step 2: Apply formatting style fixes
 * Converts 'a' to 'rdf:type' and normalizes boolean literals.
 */
export function applyFormattingStyleStep(input: string, context?: PostProcessingContext): string {
  let output = input;
  // Convert 'a' to 'rdf:type' (but not inside URIs or strings)
  output = output.replace(/ a (owl|rdf|rdfs|xsd|xml):/g, ' rdf:type $1:');
  output = output.replace(/ a :/g, ' rdf:type :');
  output = output.replace(/ a </g, ' rdf:type <');
  
  // Normalize boolean literals
  // rdflib may output:
  // 1. Plain booleans: `false` or `true` (without quotes)
  // 2. Quoted with "1"/"0": `"1"^^xsd:boolean` or `"0"^^xsd:boolean`
  // We need to convert both to `"false"^^xsd:boolean` or `"true"^^xsd:boolean`
  
  // First, convert "1"/"0" to "true"/"false"
  output = output.replace(/ "1"\^\^xsd:boolean/g, ' "true"^^xsd:boolean');
  output = output.replace(/ "0"\^\^xsd:boolean/g, ' "false"^^xsd:boolean');
  
  // Then, convert plain booleans to typed literals
  // Match `false` or `true` that appear after a property (not in URIs or strings)
  // Pattern: propertyName false; or propertyName true;
  // Be careful not to match inside URIs, strings, or other contexts
  output = output.replace(/(\w+)\s+false(?=[.;\s\n]|$)/g, '$1 "false"^^xsd:boolean');
  output = output.replace(/(\w+)\s+true(?=[.;\s\n]|$)/g, '$1 "true"^^xsd:boolean');
  
  return output;
}

/**
 * Step 3: Add owl:imports to ontology declaration
 * Adds owl:imports statements to the ontology block if externalRefs are provided.
 * 
 * NOTE: This is a simplified version. For complex cases, we should use the more robust
 * addOwlImports function from turtlePostProcess.ts. This step is currently disabled
 * to avoid syntax errors - owl:imports should be handled by rdflib itself or by
 * the existing post-processing pipeline.
 */
export function addOwlImportsStep(input: string, context?: PostProcessingContext): string {
  // TEMPORARILY DISABLED: This step was causing "Expected entity but got ;" parsing errors.
  // The issue is that the regex replacement was creating invalid Turtle syntax.
  // TODO: Re-implement using the robust addOwlImports function from turtlePostProcess.ts
  // or ensure rdflib handles owl:imports correctly.
  return input;
  
  /* DISABLED CODE - kept for reference
  if (!context?.externalRefs || context.externalRefs.length === 0) {
    return input;
  }

  // Find the ontology declaration
  const ontologyPattern = /(:\w+|<\S+>)\s+(a|rdf:type)\s+owl:Ontology[^.]*\./;
  const match = input.match(ontologyPattern);
  
  if (!match) {
    return input;
  }

  // Build imports list
  const imports: string[] = [];
  for (const ref of context.externalRefs) {
    if (ref.usePrefix && ref.prefix) {
      imports.push(`${ref.prefix}:${ref.url.split('#').pop() || ref.url.split('/').pop()}`);
    } else {
      imports.push(`<${ref.url}>`);
    }
  }

  if (imports.length === 0) {
    return input;
  }

  // Add owl:imports before the closing period
  const importsLine = `    owl:imports ${imports.join(', ')} ;`;
  const replacement = match[0].replace(/\.\s*$/, ` ;\n${importsLine} .`);
  
  return input.replace(ontologyPattern, replacement);
  */
}

/**
 * Compose multiple post-processing steps
 */
export function composePostProcessingSteps(...steps: PostProcessingStep[]): (input: string, context?: PostProcessingContext) => string {
  return (input: string, context?: PostProcessingContext) => {
    let result = input;
    for (const step of steps) {
      result = step.process(result, context);
    }
    return result;
  };
}

/**
 * Default post-processing pipeline for rdflib output
 */
export const defaultRdflibPostProcessing = composePostProcessingSteps(
  { name: 'formatting', process: applyFormattingStyleStep },
  { name: 'owl-imports', process: addOwlImportsStep },
  { name: 'section-dividers', process: addSectionDividersStep }
);
