/**
 * Source text preservation with position tracking for idempotent round-trip saves.
 * Tracks original file positions for each statement block to enable targeted text modifications
 * while preserving formatting, section structure, and import ordering.
 */

import { Parser, Writer, DataFactory } from 'n3';
import type { Quad as N3Quad, Store } from 'n3';

// ============================================================================
// Phase 1: Core Data Structures
// ============================================================================

/**
 * Position in original file (character offset and line numbers)
 */
export interface TextPosition {
  start: number;        // Character offset (0-indexed)
  end: number;          // Character offset (exclusive)
  startLine: number;    // Line number (1-indexed)
  endLine: number;      // Line number (1-indexed)
}

/**
 * Statement types for section detection
 */
export type StatementType = 
  | 'Header'            // @prefix, @base declarations (one section)
  | 'Ontology'          // owl:Ontology + owl:imports statements
  | 'AnnotationProperty'
  | 'ObjectProperty'
  | 'DatatypeProperty'
  | 'Class'
  | 'Other';            // Unknown/unclassified statements

/**
 * Formatting style detected from original file
 */
export interface FormattingStyle {
  indentSize: number;                    // Spaces per indent level (2, 4, etc.)
  lineEnding: '\n' | '\r\n';            // Line ending style
  blankLinesBetweenStatements: number;  // Usually 1 or 2
  blankLinesBetweenSections: number;    // Usually 1 or 2
  trailingNewline: boolean;             // File ends with newline
}

/**
 * Statement block (entire multi-line definition)
 * Tracks the complete statement including all properties and blank nodes
 */
export interface StatementBlock {
  type: StatementType;
  position: TextPosition;
  originalText: string;         // Exact text from start to end (computed from position + cache)
  quads: N3Quad[];              // All quads that belong to this block
  subject?: string;              // For alphabetical sorting (extract from first quad or line)
  formattingStyle?: FormattingStyle; // Detected from this block
  isModified: boolean;
  isNew: boolean;
  isDeleted: boolean;
}

/**
 * Section information (grouping of statement blocks by type)
 */
export interface Section {
  type: StatementType;
  startPosition: TextPosition;
  endPosition: TextPosition;
  blocks: StatementBlock[];
  hasStructure: boolean;        // false if multiple sections of same type exist
}

/**
 * Original file cache with all metadata for reconstruction
 */
export interface OriginalFileCache {
  content: string;              // Full original file content
  filePath?: string;            // Source file path
  format: 'turtle' | 'rdfxml' | 'jsonld' | 'ntriples';
  formattingStyle: FormattingStyle;
  headerSection: Section | null;  // @prefix, @base (one section)
  sections: Section[];             // Other sections (Ontology, Classes, Properties, etc.)
  statementBlocks: StatementBlock[];
  quadToBlockMap: Map<N3Quad, StatementBlock>; // Quick lookup: quad -> block
}

// ============================================================================
// Phase 2: Position-Aware Parsing (Turtle)
// ============================================================================

/**
 * Parse Turtle with position tracking
 * Returns quads, blocks, and sections with full position information
 */
export function parseTurtleWithPositions(content: string): {
  quads: N3Quad[];
  cache: OriginalFileCache;
} {
  // Parse with N3 to get quads (for structure)
  // Use the same approach as parseRdfToQuads for consistency
  const parser = new Parser({ format: 'text/turtle', blankNodePrefix: '_:' });
  let quads: N3Quad[] = [];
  try {
    // N3 Parser.parse() returns an iterable, convert to array
    const parsed = parser.parse(content);
    quads = Array.isArray(parsed) ? parsed : [...parsed];
  } catch (e) {
    // If parsing fails, log and return empty result
    console.warn('[parseTurtleWithPositions] N3 Parser failed:', e);
    const emptyCache: OriginalFileCache = {
      content,
      format: 'turtle',
      formattingStyle: detectFormattingStyle(content, content.split(/\r?\n/)),
      headerSection: null,
      sections: [],
      statementBlocks: [],
      quadToBlockMap: new Map()
    };
    return { quads: [], cache: emptyCache };
  }
  
  // If no quads found, still create cache for position tracking
  if (quads.length === 0) {
    console.warn('[parseTurtleWithPositions] No quads found in content');
  }

  // Detect formatting style
  const lines = content.split(/\r?\n/);
  const formattingStyle = detectFormattingStyle(content, lines);

  // Parse with position tracking
  const blocks: StatementBlock[] = [];
  const sections: Section[] = [];
  const quadToBlockMap = new Map<N3Quad, StatementBlock>();
  
  let charOffset = 0;
  let lineNumber = 1;
  
  let currentBlock: StatementBlock | null = null;
  let currentSection: Section | null = null;
  let headerSection: Section | null = null;
  const sectionTypeCounts = new Map<StatementType, number>();
  
  // Track if we're in header (prefixes/base)
  let inHeader = true;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineStart = charOffset;
    const lineEnd = charOffset + line.length;
    const lineLength = line.length;
    
    // Check if this is a header line (@prefix or @base)
    const isHeaderLine = trimmed.startsWith('@prefix') || trimmed.startsWith('@base');
    
    if (isHeaderLine) {
      inHeader = true;
      
      // Handle header section
      if (!headerSection) {
        headerSection = {
          type: 'Header',
          startPosition: { start: lineStart, end: lineStart, startLine: lineNumber, endLine: lineNumber },
          endPosition: { start: 0, end: 0, startLine: 0, endLine: 0 },
          blocks: [],
          hasStructure: true
        };
      }
      
      // Create header block (usually one per line)
      const headerBlock: StatementBlock = {
        type: 'Header',
        position: {
          start: lineStart,
          end: lineEnd,
          startLine: lineNumber,
          endLine: lineNumber
        },
        originalText: line + formattingStyle.lineEnding,
        quads: [], // Header doesn't produce quads
        isModified: false,
        isNew: false,
        isDeleted: false
      };
      
      headerSection.blocks.push(headerBlock);
      blocks.push(headerBlock);
      
      charOffset = lineEnd + formattingStyle.lineEnding.length;
      lineNumber++;
      continue;
    }
    
    // After header, check for section dividers or comments
    if (trimmed.startsWith('#') && trimmed.length > 50 && /^#+$/.test(trimmed)) {
      // Section divider - skip but track position
      charOffset = lineEnd + formattingStyle.lineEnding.length;
      lineNumber++;
      continue;
    }
    
    // Skip empty lines (they're preserved between blocks)
    if (trimmed === '') {
      charOffset = lineEnd + formattingStyle.lineEnding.length;
      lineNumber++;
      continue;
    }
    
    // Skip regular comments (they're part of the block they're associated with)
    if (trimmed.startsWith('#') && !trimmed.startsWith('##')) {
      // Comment line - if we have a current block, it's part of it
      if (currentBlock) {
        currentBlock.position.end = lineEnd;
        currentBlock.position.endLine = lineNumber;
      }
      charOffset = lineEnd + formattingStyle.lineEnding.length;
      lineNumber++;
      continue;
    }
    
    // Detect statement start: not indented, not a comment
    const isStatementStart = !line.startsWith(' ') && 
                             !line.startsWith('\t') && 
                             !trimmed.startsWith('#');
    
    if (isStatementStart) {
      inHeader = false; // We're past header
      
      // Finalize previous block if exists
      if (currentBlock) {
        // Block ends at the end of previous line (before this new statement)
        currentBlock.position.end = lineStart - formattingStyle.lineEnding.length;
        currentBlock.position.endLine = lineNumber - 1;
        currentBlock.originalText = content.slice(
          currentBlock.position.start,
          currentBlock.position.end + formattingStyle.lineEnding.length
        );
        
        // Detect formatting from this block
        currentBlock.formattingStyle = detectBlockFormatting(currentBlock.originalText, formattingStyle);
      }
      
      // Detect statement type from line
      const statementType = detectStatementTypeFromLine(trimmed);
      const subject = extractSubject(trimmed);
      
      // Start new block
      currentBlock = {
        type: statementType,
        position: {
          start: lineStart,
          end: lineEnd, // Will be updated when block ends
          startLine: lineNumber,
          endLine: lineNumber
        },
        originalText: '', // Will be set when block ends
        quads: [], // Will be populated
        subject,
        isModified: false,
        isNew: false,
        isDeleted: false
      };
      
      blocks.push(currentBlock);
      
      // Handle section transitions
      if (!currentSection || currentSection.type !== statementType) {
        // End previous section
        if (currentSection) {
          currentSection.endPosition = {
            start: lineStart - formattingStyle.lineEnding.length,
            end: lineStart - formattingStyle.lineEnding.length,
            startLine: lineNumber - 1,
            endLine: lineNumber - 1
          };
          sections.push(currentSection);
        }
        
        // Count section types
        sectionTypeCounts.set(
          statementType,
          (sectionTypeCounts.get(statementType) || 0) + 1
        );
        
        // Start new section
        currentSection = {
          type: statementType,
          startPosition: {
            start: lineStart,
            end: lineStart,
            startLine: lineNumber,
            endLine: lineNumber
          },
          endPosition: { start: 0, end: 0, startLine: 0, endLine: 0 },
          blocks: [],
          hasStructure: true
        };
      }
      
      currentSection.blocks.push(currentBlock);
      
    } else if (currentBlock) {
      // Continuation of current block (indented line or property continuation)
      // Update end position to include this line
      currentBlock.position.end = lineEnd;
      currentBlock.position.endLine = lineNumber;
    }
    
    // Check if this line ends the block (ends with period, and next line is statement start or EOF)
    const endsWithPeriod = trimmed.endsWith('.');
    const nextLineIsStatement = i + 1 < lines.length && 
      lines[i + 1].trim() !== '' &&
      !lines[i + 1].trim().startsWith(' ') && 
      !lines[i + 1].trim().startsWith('\t') &&
      !lines[i + 1].trim().startsWith('#');
    const isLastLine = i === lines.length - 1;
    
    if (endsWithPeriod && (nextLineIsStatement || isLastLine) && currentBlock) {
      // Block ends here
      currentBlock.position.end = lineEnd;
      currentBlock.position.endLine = lineNumber;
      currentBlock.originalText = content.slice(
        currentBlock.position.start,
        currentBlock.position.end + formattingStyle.lineEnding.length
      );
      currentBlock.formattingStyle = detectBlockFormatting(currentBlock.originalText, formattingStyle);
    }
    
    charOffset = lineEnd + formattingStyle.lineEnding.length;
    lineNumber++;
  }
  
  // Finalize last block and section
  if (currentBlock) {
    if (!currentBlock.originalText) {
      // Extract text from start to end position
      const endPos = Math.min(currentBlock.position.end, content.length);
      const textEnd = endPos + (endPos < content.length && content[endPos] === '\r' ? 2 : 1);
      currentBlock.originalText = content.slice(
        currentBlock.position.start,
        Math.min(textEnd, content.length)
      );
      currentBlock.position.end = endPos;
      currentBlock.formattingStyle = detectBlockFormatting(currentBlock.originalText, formattingStyle);
    }
  }
  
  if (currentSection) {
    currentSection.endPosition = {
      start: content.length,
      end: content.length,
      startLine: lineNumber - 1,
      endLine: lineNumber - 1
    };
    sections.push(currentSection);
  }
  
  if (headerSection) {
    headerSection.endPosition = {
      start: content.length,
      end: content.length,
      startLine: lineNumber - 1,
      endLine: lineNumber - 1
    };
  }
  
  // Determine if file has structure (no duplicate section types)
  const hasStructure = Array.from(sectionTypeCounts.values())
    .every(count => count === 1);
  
  sections.forEach(section => {
    section.hasStructure = hasStructure;
  });
  
  // Match quads to blocks (by subject and properties)
  matchQuadsToBlocks(quads, blocks, quadToBlockMap);
  
  const cache: OriginalFileCache = {
    content,
    format: 'turtle',
    formattingStyle,
    headerSection,
    sections,
    statementBlocks: blocks,
    quadToBlockMap
  };
  
  return { quads, cache };
}

// ============================================================================
// Phase 3: Statement Type Detection
// ============================================================================

/**
 * Detect statement type from a line of Turtle
 */
function detectStatementTypeFromLine(line: string): StatementType {
  const trimmed = line.trim();
  
  // Check for ontology declaration
  if (trimmed.includes('owl:Ontology') || trimmed.includes('rdf:type owl:Ontology')) {
    return 'Ontology';
  }
  
  // Check for owl:imports (part of ontology section)
  if (trimmed.includes('owl:imports')) {
    return 'Ontology';
  }
  
  // Check for class
  if (trimmed.includes('owl:Class') || trimmed.includes('rdf:type owl:Class')) {
    return 'Class';
  }
  
  // Check for annotation property
  if (trimmed.includes('owl:AnnotationProperty') || trimmed.includes('rdf:type owl:AnnotationProperty')) {
    return 'AnnotationProperty';
  }
  
  // Check for object property
  if (trimmed.includes('owl:ObjectProperty') || trimmed.includes('rdf:type owl:ObjectProperty')) {
    return 'ObjectProperty';
  }
  
  // Check for datatype property
  if (trimmed.includes('owl:DatatypeProperty') || trimmed.includes('rdf:type owl:DatatypeProperty')) {
    return 'DatatypeProperty';
  }
  
  return 'Other';
}

/**
 * Extract subject from a Turtle line
 */
function extractSubject(line: string): string | null {
  const trimmed = line.trim();
  
  // Match :subject, <uri>, or prefix:localName at start of line
  const subjectMatch = trimmed.match(/^([:<][^\s]+|<[^>]+>)/);
  if (subjectMatch) {
    return subjectMatch[1];
  }
  
  return null;
}

/**
 * Match parsed quads to statement blocks
 * Associates quads with the blocks they belong to based on subject matching
 */
function matchQuadsToBlocks(
  quads: N3Quad[],
  blocks: StatementBlock[],
  quadToBlockMap: Map<N3Quad, StatementBlock>
): void {
  // Extract prefix map from header blocks to resolve prefixed names
  const prefixMap = new Map<string, string>();
  for (const block of blocks) {
    if (block.type === 'Header' && block.originalText) {
      // Parse @prefix declarations
      const prefixMatch = block.originalText.match(/@prefix\s+(\w+):\s*<([^>]+)>/);
      if (prefixMatch) {
        prefixMap.set(prefixMatch[1], prefixMatch[2]);
      }
      // Also handle empty prefix (default namespace)
      const emptyPrefixMatch = block.originalText.match(/@prefix\s+:\s*<([^>]+)>/);
      if (emptyPrefixMatch) {
        prefixMap.set('', emptyPrefixMatch[1]);
      }
    }
  }
  
  // Helper to resolve prefixed name to full URI
  const resolvePrefixedName = (prefixedName: string): string | null => {
    if (prefixedName.startsWith('<') && prefixedName.endsWith('>')) {
      return prefixedName.slice(1, -1); // Already a full URI
    }
    if (prefixedName.startsWith(':')) {
      // Empty prefix (default namespace)
      const baseUri = prefixMap.get('');
      if (baseUri) {
        return baseUri + prefixedName.slice(1);
      }
    } else if (prefixedName.includes(':')) {
      const [prefix, localName] = prefixedName.split(':', 2);
      const baseUri = prefixMap.get(prefix);
      if (baseUri) {
        return baseUri + localName;
      }
    }
    return null;
  };
  
  // Group quads by subject URI
  const quadsBySubject = new Map<string, N3Quad[]>();
  
  for (const quad of quads) {
    if (quad.subject.termType === 'NamedNode') {
      const subjectUri = (quad.subject as { value: string }).value;
      const list = quadsBySubject.get(subjectUri) || [];
      list.push(quad);
      quadsBySubject.set(subjectUri, list);
    }
  }
  
  // Match quads to blocks by resolving block subjects to URIs
  for (const block of blocks) {
    if (block.type === 'Header') continue; // Header blocks don't have quads
    
    if (block.subject) {
      // Resolve block subject to full URI
      const resolvedUri = resolvePrefixedName(block.subject);
      if (resolvedUri) {
        const subjectQuads = quadsBySubject.get(resolvedUri);
        if (subjectQuads) {
          for (const quad of subjectQuads) {
            block.quads.push(quad);
            quadToBlockMap.set(quad, block);
          }
        }
      }
    }
  }
  
  // For any remaining quads, try to match by checking if URI appears in block text
  // (fallback for cases where subject extraction didn't work)
  for (const quad of quads) {
    if (quadToBlockMap.has(quad)) continue; // Already matched
    
    if (quad.subject.termType === 'NamedNode') {
      const subjectUri = (quad.subject as { value: string }).value;
      // Try to find a block where this URI might appear (check all blocks)
      for (const block of blocks) {
        if (block.type === 'Header') continue;
        // Check if URI appears in block text (might be serialized differently)
        if (block.originalText) {
          // Check if URI or any part of it appears
          if (block.originalText.includes(subjectUri) || 
              block.originalText.includes(subjectUri.split('#').pop() || '') ||
              block.originalText.includes(subjectUri.split('/').pop() || '')) {
            block.quads.push(quad);
            quadToBlockMap.set(quad, block);
            break;
          }
        }
      }
    }
  }
}

// ============================================================================
// Formatting Detection
// ============================================================================

/**
 * Detect formatting style from file content
 */
function detectFormattingStyle(content: string, lines: string[]): FormattingStyle {
  // Detect line ending
  const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
  
  // Detect indent size (most common)
  const indentSizes = new Map<number, number>();
  for (const line of lines) {
    if (line.startsWith(' ')) {
      let indent = 0;
      for (let i = 0; i < line.length && line[i] === ' '; i++) {
        indent++;
      }
      if (indent > 0) {
        indentSizes.set(indent, (indentSizes.get(indent) || 0) + 1);
      }
    }
  }
  const indentSize = Array.from(indentSizes.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 4;
  
  // Detect blank lines between statements (analyze actual file structure)
  let blankLinesBetweenStatements = 1;
  let blankLinesBetweenSections = 2;
  
  // Check trailing newline
  const trailingNewline = content.endsWith('\n') || content.endsWith('\r\n');
  
  return {
    indentSize,
    lineEnding,
    blankLinesBetweenStatements,
    blankLinesBetweenSections,
    trailingNewline
  };
}

/**
 * Detect formatting style for a specific block
 */
function detectBlockFormatting(blockText: string, defaultStyle: FormattingStyle): FormattingStyle {
  const lines = blockText.split(/\r?\n/);
  const lineEnding = blockText.includes('\r\n') ? '\r\n' : '\n';
  
  // Detect indent from continuation lines
  let indentSize = defaultStyle.indentSize;
  for (const line of lines.slice(1)) {
    if (line.startsWith(' ')) {
      let indent = 0;
      for (let i = 0; i < line.length && line[i] === ' '; i++) {
        indent++;
      }
      if (indent > 0) {
        indentSize = indent;
        break;
      }
    }
  }
  
  return {
    ...defaultStyle,
    indentSize,
    lineEnding
  };
}

// ============================================================================
// Phase 6: Text Reconstruction
// ============================================================================

/**
 * Reconstruct file from original text with targeted modifications
 */
export async function reconstructFromOriginalText(
  cache: OriginalFileCache,
  modifiedBlocks: StatementBlock[]
): Promise<string> {
  let result = cache.content;
  
  // Apply modifications in reverse order (end to start) to preserve positions
  const sortedBlocks = modifiedBlocks
    .filter(b => b.isModified || b.isDeleted)
    .sort((a, b) => b.position.end - a.position.end);
  
  for (const block of sortedBlocks) {
    if (block.isDeleted) {
      // Remove the text (including the newline after)
      const endPos = block.position.end + cache.formattingStyle.lineEnding.length;
      result = result.slice(0, block.position.start) + 
               result.slice(endPos);
    } else if (block.isModified) {
      // Replace with new serialized text (preserving formatting style)
      const newText = await serializeBlockToTurtle(block, block.formattingStyle || cache.formattingStyle);
      const endPos = block.position.end + cache.formattingStyle.lineEnding.length;
      result = result.slice(0, block.position.start) + 
               newText + 
               result.slice(endPos);
    }
  }
  
  // Insert new blocks in appropriate sections
  const newBlocks = modifiedBlocks.filter(b => b.isNew);
  for (const block of newBlocks) {
    const section = findSectionForBlock(block, cache.sections);
    if (section && section.hasStructure) {
      // Insert alphabetically in section
      const insertPos = findAlphabeticalInsertPosition(section, block, cache);
      const newText = await serializeBlockToTurtle(block, cache.formattingStyle);
      result = insertAtPosition(result, insertPos, newText, cache.formattingStyle);
    } else {
      // Append at end (preserving trailing newline if needed)
      const newText = cache.formattingStyle.lineEnding + 
                     await serializeBlockToTurtle(block, cache.formattingStyle);
      if (cache.formattingStyle.trailingNewline) {
        result = result.trimEnd() + newText + cache.formattingStyle.lineEnding;
      } else {
        result = result.trimEnd() + newText;
      }
    }
  }
  
  return result;
}

/**
 * Find section for a block
 */
function findSectionForBlock(block: StatementBlock, sections: Section[]): Section | null {
  for (const section of sections) {
    if (section.type === block.type) {
      return section;
    }
  }
  return null;
}

/**
 * Find alphabetical insertion position in section
 */
function findAlphabeticalInsertPosition(
  section: Section,
  newBlock: StatementBlock,
  cache: OriginalFileCache
): number {
  // Find position to insert alphabetically
  const newSubject = newBlock.subject || '';
  
  for (const block of section.blocks) {
    if (block.isDeleted || block.isNew) continue;
    const blockSubject = block.subject || '';
    if (newSubject.localeCompare(blockSubject) < 0) {
      // Insert before this block
      return block.position.start;
    }
  }
  
  // Insert at end of section
  return section.endPosition.start;
}

/**
 * Insert text at position with proper spacing
 */
function insertAtPosition(
  content: string,
  position: number,
  newText: string,
  formatting: FormattingStyle
): string {
  // Ensure proper spacing
  const before = content.slice(0, position);
  const after = content.slice(position);
  
  // Add blank line before if needed
  const needsBlankLineBefore = !before.endsWith('\n\n') && !before.endsWith('\r\n\r\n');
  const blankLine = needsBlankLineBefore ? formatting.lineEnding : '';
  
  return before + blankLine + newText + formatting.lineEnding + after;
}

// ============================================================================
// Phase 7: Formatting-Preserving Serialization
// ============================================================================

/**
 * Serialize a block to Turtle with formatting preservation
 */
async function serializeBlockToTurtle(
  block: StatementBlock,
  formatting: FormattingStyle
): Promise<string> {
  if (block.quads.length === 0) {
    // Header block or block without quads - return original text
    return block.originalText || '';
  }
  
  // Try to preserve original text if block wasn't modified
  if (block.originalText && !block.isModified) {
    return block.originalText;
  }
  
  // Serialize quads using N3 Writer
  return new Promise((resolve, reject) => {
    const writer = new Writer({
      format: 'text/turtle',
      prefixes: {}, // Prefixes handled at file level
    });
    
    // Group quads by subject for proper serialization
    const quadsBySubject = new Map<string, N3Quad[]>();
    for (const quad of block.quads) {
      if (quad.subject.termType === 'NamedNode') {
        const subjectUri = (quad.subject as { value: string }).value;
        const list = quadsBySubject.get(subjectUri) || [];
        list.push(quad);
        quadsBySubject.set(subjectUri, list);
      } else if (quad.subject.termType === 'BlankNode') {
        // For blank nodes, serialize them inline
        const blankId = (quad.subject as { id: string }).id;
        const list = quadsBySubject.get(`_:${blankId}`) || [];
        list.push(quad);
        quadsBySubject.set(`_:${blankId}`, list);
      }
    }
    
    // Serialize all quads
    for (const quads of quadsBySubject.values()) {
      for (const quad of quads) {
        writer.addQuad(quad);
      }
    }
    
    writer.end((error, result) => {
      if (error) {
        reject(error);
        return;
      }
      
      if (!result) {
        resolve(block.originalText || '');
        return;
      }
      
      // Apply formatting style
      const formatted = applyFormattingStyle(result, formatting, block.originalText);
      resolve(formatted);
    });
  });
}

/**
 * Format a term for Turtle output (simplified)
 */
function formatTerm(term: N3Quad['object'] | string): string {
  if (typeof term === 'string') {
    // Assume it's a URI
    if (term.startsWith('http://') || term.startsWith('https://')) {
      return `<${term}>`;
    }
    return term;
  }
  
  if (term.termType === 'NamedNode') {
    const uri = (term as { value: string }).value;
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return `<${uri}>`;
    }
    return uri;
  }
  
  if (term.termType === 'Literal') {
    const lit = term as { value: string; datatype?: { value: string }; language?: string };
    let result = `"${lit.value.replace(/"/g, '\\"')}"`;
    if (lit.language) {
      result += `@${lit.language}`;
    } else if (lit.datatype) {
      const dt = lit.datatype.value;
      if (dt === 'http://www.w3.org/2001/XMLSchema#boolean') {
        result = `"${lit.value}"^^xsd:boolean`;
      } else {
        result += `^^${formatTerm(dt)}`;
      }
    }
    return result;
  }
  
  if (term.termType === 'BlankNode') {
    // For blank nodes, we should inline them
    // This is simplified - full implementation will handle inline forms
    return '[]'; // Placeholder
  }
  
  return '';
}

/**
 * Apply formatting style to serialized text
 */
function applyFormattingStyle(
  serialized: string,
  formatting: FormattingStyle,
  originalText?: string
): string {
  // Parse serialized and reformat with detected style
  const lines = serialized.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return serialized;
  
  const formattedLines: string[] = [];
  
  // First line (subject) - no indent
  formattedLines.push(lines[0]);
  
  // Continuation lines - indent
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      formattedLines.push(' '.repeat(formatting.indentSize) + line);
    }
  }
  
  return formattedLines.join(formatting.lineEnding);
}

// ============================================================================
// Phase 10: Stubs for Other Formats
// ============================================================================

/**
 * Parse RDF/XML with position tracking
 * TODO: Implement RDF/XML position tracking
 * This will require parsing RDF/XML and tracking element positions
 */
export function parseRdfXmlWithPositions(content: string): {
  quads: N3Quad[];
  cache: OriginalFileCache;
} {
  // TODO: Implement RDF/XML position tracking
  // This format requires XML parsing with position tracking
  // Return structure compatible with Turtle version
  console.warn('[sourcePreservation] RDF/XML position tracking not yet implemented');
  
  const parser = new Parser({ format: 'application/rdf+xml' });
  let quads: N3Quad[];
  try {
    quads = [...parser.parse(content)];
  } catch (e) {
    quads = [];
  }
  
  const emptyCache: OriginalFileCache = {
    content,
    format: 'rdfxml',
    formattingStyle: {
      indentSize: 2,
      lineEnding: '\n',
      blankLinesBetweenStatements: 1,
      blankLinesBetweenSections: 2,
      trailingNewline: true
    },
    headerSection: null,
    sections: [],
    statementBlocks: [],
    quadToBlockMap: new Map()
  };
  
  return { quads, cache: emptyCache };
}

/**
 * Parse JSON-LD with position tracking
 * TODO: Implement JSON-LD position tracking
 * This will require parsing JSON and tracking property positions
 */
export function parseJsonLdWithPositions(content: string): {
  quads: N3Quad[];
  cache: OriginalFileCache;
} {
  // TODO: Implement JSON-LD position tracking
  // This format requires JSON parsing with position tracking
  // Return structure compatible with Turtle version
  console.warn('[sourcePreservation] JSON-LD position tracking not yet implemented');
  
  const parser = new Parser({ format: 'application/ld+json' });
  let quads: N3Quad[];
  try {
    quads = [...parser.parse(content)];
  } catch (e) {
    quads = [];
  }
  
  const emptyCache: OriginalFileCache = {
    content,
    format: 'jsonld',
    formattingStyle: {
      indentSize: 2,
      lineEnding: '\n',
      blankLinesBetweenStatements: 1,
      blankLinesBetweenSections: 2,
      trailingNewline: true
    },
    headerSection: null,
    sections: [],
    statementBlocks: [],
    quadToBlockMap: new Map()
  };
  
  return { quads, cache: emptyCache };
}

/**
 * Parse N-Triples with position tracking
 * TODO: Implement N-Triples position tracking
 * This format is line-based, so position tracking should be straightforward
 */
export function parseNTriplesWithPositions(content: string): {
  quads: N3Quad[];
  cache: OriginalFileCache;
} {
  // TODO: Implement N-Triples position tracking
  // This format is line-based (one statement per line)
  // Return structure compatible with Turtle version
  console.warn('[sourcePreservation] N-Triples position tracking not yet implemented');
  
  const parser = new Parser({ format: 'application/n-triples' });
  let quads: N3Quad[];
  try {
    quads = [...parser.parse(content)];
  } catch (e) {
    quads = [];
  }
  
  const emptyCache: OriginalFileCache = {
    content,
    format: 'ntriples',
    formattingStyle: {
      indentSize: 0,
      lineEnding: '\n',
      blankLinesBetweenStatements: 0,
      blankLinesBetweenSections: 1,
      trailingNewline: true
    },
    headerSection: null,
    sections: [],
    statementBlocks: [],
    quadToBlockMap: new Map()
  };
  
  return { quads, cache: emptyCache };
}

/**
 * Reconstruct from original RDF/XML
 * TODO: Implement RDF/XML reconstruction
 */
export function reconstructFromOriginalRdfXml(
  cache: OriginalFileCache,
  modifiedBlocks: StatementBlock[]
): string {
  // TODO: Implement RDF/XML reconstruction
  console.warn('[sourcePreservation] RDF/XML reconstruction not yet implemented');
  return cache.content;
}

/**
 * Reconstruct from original JSON-LD
 * TODO: Implement JSON-LD reconstruction
 */
export function reconstructFromOriginalJsonLd(
  cache: OriginalFileCache,
  modifiedBlocks: StatementBlock[]
): string {
  // TODO: Implement JSON-LD reconstruction
  console.warn('[sourcePreservation] JSON-LD reconstruction not yet implemented');
  return cache.content;
}

/**
 * Reconstruct from original N-Triples
 * TODO: Implement N-Triples reconstruction
 */
export function reconstructFromOriginalNTriples(
  cache: OriginalFileCache,
  modifiedBlocks: StatementBlock[]
): string {
  // TODO: Implement N-Triples reconstruction
  console.warn('[sourcePreservation] N-Triples reconstruction not yet implemented');
  return cache.content;
}
