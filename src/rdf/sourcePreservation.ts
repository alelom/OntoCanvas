/**
 * Source text preservation with position tracking for idempotent round-trip saves.
 * Tracks original file positions for each statement block to enable targeted text modifications
 * while preserving formatting, section structure, and import ordering.
 */

import { Parser, Writer, DataFactory } from 'n3';
import type { Quad as N3Quad, Store, BlankNode } from 'n3';
import { buildInlineForms, replaceBlankRefs, convertBlanksToInline } from '../turtlePostProcess';
import { debugLog } from '../utils/debug';

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
  const startTime = Date.now();
  debugLog('[PERF] reconstructFromOriginalText START, modifiedBlocks:', modifiedBlocks.length);
  
  let result = cache.content;
  
  // Apply modifications in reverse order (end to start) to preserve positions
  const sortedBlocks = modifiedBlocks
    .filter(b => b.isModified || b.isDeleted)
    .sort((a, b) => b.position.end - a.position.end);
  
  debugLog('[PERF] Processing', sortedBlocks.length, 'modified/deleted blocks');
  const serializeStart = Date.now();
  
  for (let i = 0; i < sortedBlocks.length; i++) {
    const block = sortedBlocks[i];
    if (i % 5 === 0) {
      debugLog('[PERF] Serializing block', i, 'of', sortedBlocks.length, 'elapsed:', Date.now() - serializeStart, 'ms');
    }
    if (block.isDeleted) {
      // Remove the text (including the newline after)
      const endPos = block.position.end + cache.formattingStyle.lineEnding.length;
      result = result.slice(0, block.position.start) + 
               result.slice(endPos);
    } else if (block.isModified) {
      // Replace with new serialized text (preserving formatting style)
      const blockSerializeStart = Date.now();
      const newText = await serializeBlockToTurtle(block, block.formattingStyle || cache.formattingStyle, cache);
      const blockSerializeEnd = Date.now();
      if (blockSerializeEnd - blockSerializeStart > 100) {
        debugLog('[PERF] serializeBlockToTurtle took', blockSerializeEnd - blockSerializeStart, 'ms for block:', block.subject);
      }
      
      // CRITICAL: block.position.end includes the period, and the original text includes the newline after
      // We need to replace from block.position.start to block.position.end (inclusive of period)
      // Then add the newText (which should end with period + newline)
      // Then skip the newline that was after the original block
      const endPos = block.position.end + cache.formattingStyle.lineEnding.length;
      
      // Check what comes after the block to preserve spacing
      const afterBlock = result.slice(endPos);
      const nextNonEmptyLine = afterBlock.split(cache.formattingStyle.lineEnding).find(line => line.trim() !== '');
      
      // Ensure newText ends properly (should already from applyFormattingStyle, but double-check)
      let finalNewText = newText.trimEnd();
      if (!finalNewText.endsWith('.')) {
        finalNewText += '.';
      }
      finalNewText += cache.formattingStyle.lineEnding;
      
      // If there's content after (next block), ensure proper spacing
      // The original had a newline after the block, and newText already ends with newline
      // So we should be good, but let's verify the slice doesn't include an extra newline
      result = result.slice(0, block.position.start) + 
               finalNewText + 
               result.slice(endPos);
    }
  }
  
  debugLog('[PERF] Modified blocks serialized in', Date.now() - serializeStart, 'ms');
  
  // Insert new blocks in appropriate sections
  const newBlocks = modifiedBlocks.filter(b => b.isNew);
  debugLog('[PERF] Processing', newBlocks.length, 'new blocks');
  const newBlocksStart = Date.now();
  
  for (const block of newBlocks) {
    const section = findSectionForBlock(block, cache.sections);
    if (section && section.hasStructure) {
      // Insert alphabetically in section
      const insertPos = findAlphabeticalInsertPosition(section, block, cache);
      const newText = await serializeBlockToTurtle(block, cache.formattingStyle, cache);
      result = insertAtPosition(result, insertPos, newText, cache.formattingStyle);
    } else {
      // Append at end (preserving trailing newline if needed)
      const newText = cache.formattingStyle.lineEnding + 
                     await serializeBlockToTurtle(block, cache.formattingStyle, cache);
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
  formatting: FormattingStyle,
  cache?: OriginalFileCache
): Promise<string> {
  if (block.quads.length === 0) {
    // Header block or block without quads - return original text
    return block.originalText || '';
  }
  
  // Try to preserve original text if block wasn't modified
  if (block.originalText && !block.isModified) {
    return block.originalText;
  }
  
  // Extract prefix map from cache headerSection to preserve prefixed names
  const prefixMap: Record<string, string> = {};
  if (cache?.headerSection) {
    for (const headerBlock of cache.headerSection.blocks) {
      if (headerBlock.originalText) {
        // Parse @prefix declarations
        const prefixMatch = headerBlock.originalText.match(/@prefix\s+(\w+):\s*<([^>]+)>/);
        if (prefixMatch) {
          prefixMap[prefixMatch[1]] = prefixMatch[2];
        }
        // Also handle empty prefix (default namespace)
        const emptyPrefixMatch = headerBlock.originalText.match(/@prefix\s+:\s*<([^>]+)>/);
        if (emptyPrefixMatch) {
          prefixMap[''] = emptyPrefixMatch[1];
        }
      }
    }
  }
  
  // Serialize quads using N3 Writer with prefix map to preserve prefixed names
  return new Promise((resolve, reject) => {
    const writer = new Writer({
      format: 'text/turtle',
      prefixes: prefixMap, // Use prefix map from cache to preserve prefixed names
    });
    
    // Group quads by subject for proper serialization
    // IMPORTANT: We need to add ALL quads, including blank node quads, so N3 Writer can serialize them
    // N3 Writer will automatically serialize blank nodes that are used as objects inline if possible
    // But we need to ensure all blank node quads are added so they can be found and inlined
    const quadsBySubject = new Map<string, N3Quad[]>();
    for (const quad of block.quads) {
      if (quad.subject.termType === 'NamedNode') {
        const subjectUri = (quad.subject as { value: string }).value;
        const list = quadsBySubject.get(subjectUri) || [];
        list.push(quad);
        quadsBySubject.set(subjectUri, list);
      } else if (quad.subject.termType === 'BlankNode') {
        // For blank nodes, group them by ID so all their quads are serialized together
        const blankId = (quad.subject as { id: string }).id;
        const list = quadsBySubject.get(`_:${blankId}`) || [];
        list.push(quad);
        quadsBySubject.set(`_:${blankId}`, list);
      }
    }
    
    // Serialize all quads - this includes blank node quads which N3 Writer will serialize
    // The blank nodes used as objects will appear as references, and we'll inline them later
    for (const quads of quadsBySubject.values()) {
      for (const quad of quads) {
        writer.addQuad(quad);
      }
    }
    
    debugLog('[serializeBlockToTurtle] Serializing', block.quads.length, 'quads, grouped into', quadsBySubject.size, 'subjects');
    
    writer.end((error, result) => {
      if (error) {
        reject(error);
        return;
      }
      
      if (!result) {
        resolve(block.originalText || '');
        return;
      }
      
      // CRITICAL: N3 Writer outputs @prefix declarations at the start of the result
      // We need to remove them because prefixes come from the header section, not individual blocks
      // Remove all @prefix and @base lines from the beginning (but preserve empty lines that separate prefixes from content)
      let cleanedResult = result;
      const lines = cleanedResult.split(/\r?\n/);
      let startIdx = 0;
      // Remove prefix/base lines, but stop at the first non-empty, non-prefix line
      while (startIdx < lines.length) {
        const trimmed = lines[startIdx].trim();
        if (trimmed.startsWith('@prefix') || trimmed.startsWith('@base')) {
          startIdx++;
        } else if (trimmed === '' && startIdx < lines.length - 1) {
          // Empty line - check if next line is also prefix/base or empty
          // If next line is content, keep this empty line as separator
          let nextNonEmptyIdx = startIdx + 1;
          while (nextNonEmptyIdx < lines.length && lines[nextNonEmptyIdx].trim() === '') {
            nextNonEmptyIdx++;
          }
          if (nextNonEmptyIdx < lines.length) {
            const nextNonEmpty = lines[nextNonEmptyIdx].trim();
            if (nextNonEmpty.startsWith('@prefix') || nextNonEmpty.startsWith('@base')) {
              // Next non-empty is still a prefix, remove this empty line too
              startIdx++;
            } else {
              // Next non-empty is content, keep this empty line
              break;
            }
          } else {
            // All remaining lines are empty, remove them
            startIdx = lines.length;
            break;
          }
        } else {
          // Non-empty, non-prefix line - this is the start of actual content
          break;
        }
      }
      if (startIdx > 0) {
        cleanedResult = lines.slice(startIdx).join('\n');
        debugLog('[serializeBlockToTurtle] Removed', startIdx, 'prefix/base declarations from N3 Writer output');
      }
      
      // Use cleaned result for further processing (trim to remove leading/trailing whitespace)
      result = cleanedResult.trim();
      
      // Ensure result is not empty (shouldn't happen, but safety check)
      if (!result) {
        debugLog('[serializeBlockToTurtle] WARNING: Result is empty after removing prefixes, using original text');
        result = block.originalText || '';
      }
      
      // Post-process to inline blank nodes
      // CRITICAL: Always inline blank nodes used as objects, regardless of original format
      // User requirement: "I DONT WANT TO SEE NODES REPRESENTED LIKE _:df_0_6"
      // Check if N3 Writer output has blank node references that need inlining
      const hasBlankRefsInOutput = /_:df_\d+_\d+/.test(result) || /_:n3-\d+/.test(result);
      
      /**
       * BLANK NODE INLINING ATTEMPTS - DOCUMENTED FOR FUTURE REFERENCE
       * 
       * Problem: N3 Writer serializes blank nodes as explicit references (e.g., _:df_0_0) instead of inline forms ([ ... ])
       * when they're used as objects. We need to inline them to match the original file format.
       * 
       * Attempt 1: convertBlanksToInline (FAILED)
       *   - Tried: Using convertBlanksToInline which parses output and builds inline forms
       *   - Issue: N3 Writer doesn't serialize blank node blocks when they're only used as objects
       *   - Result: convertBlanksToInline can't find blank node definitions to build inline forms from
       * 
       * Attempt 2: buildInlineForms from block.quads + replaceBlankRefs (CURRENT - WORKING)
       *   - Tried: Building inline forms directly from block.quads (which includes blank node quads)
       *   - Tried: Using replaceBlankRefs which has order-based replacement logic
       *   - Status: Working - we build inline forms from block.quads and replace references in N3 Writer output
       *   - Key fix: Collect blank node quads where blank is SUBJECT in reconstructFromCache
       *   - Key fix: Strip _: prefix from blank node IDs when creating DataFactory.blankNode
       * 
       * Approach: Build inline forms from block.quads (using original blank node IDs) and manually replace references
       *   - Build inline forms directly from block.quads (which includes blank node quads)
       *   - Parse N3 Writer output to find blank node references
       *   - Remove blank node blocks from output
       *   - Replace blank node references with inline forms using replaceBlankRefs
       */
      
      let processedResult = result;
      if (hasBlankRefsInOutput) {
        // Approach 1: Build inline forms directly from block.quads (using original blank node IDs)
        // This is more robust because N3 Writer might not serialize blank node quads as separate blocks
        // when they're only used as objects
        try {
          const hasBlankRefs = /_:df_\d+_\d+/.test(result) || /_:n3-\d+/.test(result);
          if (hasBlankRefs) {
            debugLog('[serializeBlockToTurtle] Building inline forms from block.quads (', block.quads.length, 'quads)');
            
            // Count blank node quads in block.quads
            const blankNodeQuadsInBlock = block.quads.filter(q => 
              q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode'
            );
            const blankNodeAsSubject = block.quads.filter(q => q.subject.termType === 'BlankNode');
            const blankNodeAsObject = block.quads.filter(q => q.object.termType === 'BlankNode');
            debugLog('[serializeBlockToTurtle] Block has', blankNodeQuadsInBlock.length, 'quads involving blank nodes');
            debugLog('[serializeBlockToTurtle] Blank nodes as SUBJECT:', blankNodeAsSubject.length, 'quads');
            debugLog('[serializeBlockToTurtle] Blank nodes as OBJECT:', blankNodeAsObject.length, 'quads');
            
            // CRITICAL: buildInlineForms needs quads where blank nodes are SUBJECTS to build inline forms
            // If we only have quads where blank nodes are objects, we can't build inline forms
            // We need to check if we have the right quads
            if (blankNodeAsSubject.length === 0 && blankNodeAsObject.length > 0) {
              debugLog('[serializeBlockToTurtle] WARNING: Have blank nodes as objects but NONE as subjects!');
              debugLog('[serializeBlockToTurtle] This means buildInlineForms will create empty forms [ ]');
              debugLog('[serializeBlockToTurtle] Blank node object quads:', blankNodeAsObject.map(q => ({
                subj: q.subject.termType === 'NamedNode' ? (q.subject as { value: string }).value : 'blank',
                pred: (q.predicate as { value: string }).value,
                obj: 'blank'
              })));
            }
            
            // Build inline forms from block.quads (which includes blank node quads)
            const inlineFormsFromQuads = buildInlineForms(block.quads, undefined, true);
            debugLog('[serializeBlockToTurtle] Built', inlineFormsFromQuads.size, 'inline forms');
            
            // Log the inline forms for debugging
            if (inlineFormsFromQuads.size > 0) {
              debugLog('[serializeBlockToTurtle] Inline forms keys:', Array.from(inlineFormsFromQuads.keys()));
              const firstForm = Array.from(inlineFormsFromQuads.values())[0];
              debugLog('[serializeBlockToTurtle] First inline form:', firstForm);
              if (firstForm === '[  ]' || firstForm.trim() === '[]') {
                debugLog('[serializeBlockToTurtle] ERROR: First inline form is EMPTY! This means blank node quads are missing.');
              }
            } else {
              debugLog('[serializeBlockToTurtle] WARNING: No inline forms built from', block.quads.length, 'quads!');
            }
            
            if (inlineFormsFromQuads.size > 0) {
              // Find blank node references in output using regex (don't parse - prefixes are removed)
              // Find all blank node references like _:df_0_0 or _:n3-0
              const blankNodeRefPattern = /_:df_\d+_\d+|_:n3-\d+/g;
              const blankNodeRefs = result.match(blankNodeRefPattern);
              debugLog('[serializeBlockToTurtle] Found blank node refs in output:', blankNodeRefs);
              
              if (blankNodeRefs && blankNodeRefs.length > 0) {
                try {
                  // Remove blank node blocks and replace references
                  // replaceBlankRefs has logic to replace blank node references in object position
                  // in order, regardless of ID matching, so we can just pass the inline forms map
                  
                  // First, try using replaceBlankRefs with the inline forms we built
                  // But we need to remove blank node blocks first
                  let output = result;
                  const lines = output.split(/\r?\n/);
                  const filteredLines: string[] = [];
                  let i = 0;
                  while (i < lines.length) {
                    const line = lines[i];
                    const trimmed = line.trim();
                    if (trimmed.match(/^_:(df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+)\s+/)) {
                      // Skip blank node block
                      while (i < lines.length) {
                        if (/\.\s*$/.test(lines[i].trim())) {
                          i++;
                          break;
                        }
                        i++;
                      }
                      continue;
                    }
                    filteredLines.push(line);
                    i++;
                  }
                  output = filteredLines.join('\n');
                  
                  // Log what we're trying to replace
                  const blankRefsInOutput = output.match(/_:df_\d+_\d+|_:n3-\d+/g);
                  debugLog('[serializeBlockToTurtle] Found blank node refs in output:', blankRefsInOutput);
                  debugLog('[serializeBlockToTurtle] Output before replacement (first 200 chars):', output.substring(0, 200));
                  
                  // replaceBlankRefs will replace blank node references in object position in order
                  // It has fallback logic that doesn't require ID matching
                  processedResult = replaceBlankRefs(output, inlineFormsFromQuads);
                  
                  // Check if replacement worked
                  const hasInlineAfterReplace = /\[[\s\S]*?\]/.test(processedResult);
                  debugLog('[serializeBlockToTurtle] After replaceBlankRefs - has inline blanks:', hasInlineAfterReplace);
                  debugLog('[serializeBlockToTurtle] Output after replaceBlankRefs (first 200 chars):', processedResult.substring(0, 200));
                  
                  // If that didn't work, try manual replacement
                  if (!hasInlineAfterReplace && hasBlankRefs && inlineFormsFromQuads.size > 0) {
                    debugLog('[serializeBlockToTurtle] replaceBlankRefs did not inline, trying manual replacement');
                    
                    // Get inline forms in order
                    const inlineFormsArray = Array.from(inlineFormsFromQuads.values());
                    debugLog('[serializeBlockToTurtle] Manual replacement: have', inlineFormsArray.length, 'inline forms');
                    
                    // Find all blank node references after rdfs:subClassOf
                    const subClassOfMatch = output.match(/rdfs:subClassOf\s+(_:(?:df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+)(?:\s*,\s*_:(?:df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+))*)/);
                    if (subClassOfMatch) {
                      debugLog('[serializeBlockToTurtle] Found subClassOf with blank refs:', subClassOfMatch[1]);
                      const blankRefs = subClassOfMatch[1].split(',').map((r: string) => r.trim());
                      debugLog('[serializeBlockToTurtle] Split into', blankRefs.length, 'refs:', blankRefs);
                      
                      if (blankRefs.length <= inlineFormsArray.length) {
                        const replacedRefs = blankRefs.map((ref: string, idx: number) => {
                          if (idx < inlineFormsArray.length) {
                            return inlineFormsArray[idx];
                          }
                          return ref;
                        });
                        const replacement = 'rdfs:subClassOf ' + replacedRefs.join(', ');
                        debugLog('[serializeBlockToTurtle] Replacement (first 200 chars):', replacement.substring(0, 200));
                        processedResult = output.replace(/rdfs:subClassOf\s+_:(?:df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+(?:\s*,\s*_:(?:df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+))*)/, replacement);
                        const hasInlineAfterManual = /\[[\s\S]*?\]/.test(processedResult);
                        debugLog('[serializeBlockToTurtle] After manual replacement - has inline blanks:', hasInlineAfterManual);
                        debugLog('[serializeBlockToTurtle] Output after manual (first 200 chars):', processedResult.substring(0, 200));
                      } else {
                        debugLog('[serializeBlockToTurtle] WARNING: More blank refs than inline forms!', blankRefs.length, 'vs', inlineFormsArray.length);
                      }
                    } else {
                      debugLog('[serializeBlockToTurtle] WARNING: Could not find rdfs:subClassOf pattern in output');
                    }
                  }
                  
                  // Final check
                  if (!/\[[\s\S]*?\]/.test(processedResult) && hasBlankRefs) {
                    debugLog('[serializeBlockToTurtle] FINAL WARNING: All replacement attempts failed! Blank nodes not inlined.');
                    debugLog('[serializeBlockToTurtle] Final output (first 300 chars):', processedResult.substring(0, 300));
                  }
                } catch (e) {
                  debugLog('[serializeBlockToTurtle] Error inlining blank nodes, falling back to convertBlanksToInline:', e);
                  processedResult = convertBlanksToInline(result, undefined, true);
                }
              } else {
                debugLog('[serializeBlockToTurtle] No blank node refs found in output after removing prefixes');
              }
            } else {
              debugLog('[serializeBlockToTurtle] No inline forms built, using original result');
              processedResult = result;
            }
          } else {
            processedResult = result;
          }
        } catch (e) {
          debugLog('[serializeBlockToTurtle] Error inlining blank nodes, using original result:', e);
          processedResult = result;
        }
      }
      
      // Apply formatting style
      const formatted = applyFormattingStyle(processedResult, formatting, block.originalText);
      resolve(formatted);
    });
  });
}

/**
 * Inline blank nodes by building forms from block.quads and matching to output by structure
 * This approach is more robust than parsing output because we work with quads we control
 */
function inlineBlankNodesFromQuads(
  n3Output: string,
  blockQuads: N3Quad[],
  prefixMap: Record<string, string>
): string {
  // Step 1: Build inline forms from block.quads (using original blank node IDs)
  const inlineFormsFromQuads = buildInlineForms(blockQuads, undefined, true);
  
  if (inlineFormsFromQuads.size === 0) {
    return n3Output; // No blank nodes to inline
  }
  
  // Step 2: Parse N3 Writer output to get quads (with new blank node IDs)
  // If parsing fails or takes too long, fall back to convertBlanksToInline
  const parser = new Parser({ format: 'text/turtle', blankNodePrefix: '_:' });
  let outputQuads: N3Quad[];
  try {
    const parsed = parser.parse(n3Output);
    outputQuads = Array.isArray(parsed) ? parsed : [...parsed];
    
  } catch (e) {
    // If parsing fails, return original output
    debugLog('[inlineBlankNodesFromQuads] Parsing failed:', e);
    return n3Output;
  }
  
  // Step 3: Group quads by blank node subject (from output)
  const outputQuadsByBlankSubject = new Map<string, N3Quad[]>();
  for (const quad of outputQuads) {
    if (quad.subject.termType === 'BlankNode') {
      const blankId = getBlankNodeId(quad.subject as BlankNode);
      const list = outputQuadsByBlankSubject.get(blankId) || [];
      list.push(quad);
      outputQuadsByBlankSubject.set(blankId, list);
    }
  }
  
  // Step 4: Group quads by blank node subject (from block.quads)
  const blockQuadsByBlankSubject = new Map<string, N3Quad[]>();
  for (const quad of blockQuads) {
    if (quad.subject.termType === 'BlankNode') {
      const blankId = getBlankNodeId(quad.subject as BlankNode);
      const list = blockQuadsByBlankSubject.get(blankId) || [];
      list.push(quad);
      blockQuadsByBlankSubject.set(blankId, list);
    }
  }
  
  // Step 5: Find blank nodes used as objects (these need to be inlined)
  const blankNodesUsedAsObjects = new Set<string>();
  for (const quad of outputQuads) {
    if (quad.object.termType === 'BlankNode') {
      const blankId = getBlankNodeId(quad.object as BlankNode);
      blankNodesUsedAsObjects.add(blankId);
    }
  }
  
  // Step 6: Match blank nodes by structure (compare quads, not IDs)
  // Create mapping: outputBlankNodeId -> inlineForm
  // Only match blank nodes that are used as objects (these need to be inlined)
  const outputIdToInlineForm = new Map<string, string>();
  const matchedBlockBlanks = new Set<string>(); // Track which block blanks we've matched
  
  for (const outputBlankId of blankNodesUsedAsObjects) {
    const outputQuadsForBlank = outputQuadsByBlankSubject.get(outputBlankId);
    if (!outputQuadsForBlank) continue; // No quads for this blank node
    
    // Find matching blank node in block.quads by comparing quads
    for (const [blockBlankId, blockQuadsForBlank] of blockQuadsByBlankSubject.entries()) {
      // Skip if already matched
      if (matchedBlockBlanks.has(blockBlankId)) continue;
      
      // Simplified matching: just compare quad counts and basic structure
      // Full recursive matching can be slow and cause timeouts
      if (outputQuadsForBlank.length === blockQuadsForBlank.length && 
          blankNodesMatchByStructure(outputQuadsForBlank, blockQuadsForBlank)) {
        // Found a match! Use the inline form we built for this blank node
        const inlineForm = inlineFormsFromQuads.get(blockBlankId);
        if (inlineForm) {
          outputIdToInlineForm.set(outputBlankId, inlineForm);
          matchedBlockBlanks.add(blockBlankId);
          break; // Found match, move to next output blank node
        }
      }
    }
  }
  
  if (outputIdToInlineForm.size === 0) {
    // No matches found - this means blank nodes couldn't be matched
    // Fall back to original output (blank nodes will remain as explicit references)
    debugLog('[inlineBlankNodesFromQuads] No blank node matches found, returning original output');
    return n3Output;
  }
  
  debugLog('[inlineBlankNodesFromQuads] Matched', outputIdToInlineForm.size, 'blank nodes out of', outputQuadsByBlankSubject.size, 'output blanks and', blockQuadsByBlankSubject.size, 'block blanks');
  
  // Step 7: Remove blank node blocks from output
  let output = n3Output;
  const lines = output.split(/\r?\n/);
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this line starts a blank node block
    if (trimmed.match(/^_:(df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+)\s+/)) {
      // Skip this blank node block until we find the period
      while (i < lines.length) {
        const currentLine = lines[i];
        if (/\.\s*$/.test(currentLine.trim())) {
          i++; // Skip the line with period
          break;
        }
        i++;
      }
      continue; // Don't add this block
    }
    
    // Not a blank node block, keep it
    result.push(line);
    i++;
  }
  
  output = result.join('\n');
  
  // Step 8: Replace blank node references with inline forms
  // Process in reverse order to preserve indices
  const sortedEntries = [...outputIdToInlineForm.entries()].reverse();
  
  for (const [outputBlankId, inlineForm] of sortedEntries) {
    // Replace all occurrences of this blank node reference
    const ref = outputBlankId.startsWith('_:') ? outputBlankId : `_:${outputBlankId}`;
    const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match blank node references in object position (after predicates or commas)
    const pattern = new RegExp(`(?<![\\w:-])${escapedRef}(?=[.,;\\s\\]\\n]|$)`, 'g');
    output = output.replace(pattern, inlineForm);
  }
  
  return output;
}

/**
 * Get blank node ID from a BlankNode term
 */
function getBlankNodeId(blank: BlankNode): string {
  return (blank as { id?: string }).id ?? (blank as { value?: string }).value ?? '';
}

/**
 * Compare two blank nodes by structure (compare their quads, not IDs)
 * Returns true if the blank nodes have the same quads (same predicates and objects)
 * For nested blank nodes, we compare by structure recursively (with cycle detection)
 */
function blankNodesMatchByStructure(
  quads1: N3Quad[],
  quads2: N3Quad[]
): boolean {
  if (quads1.length !== quads2.length) {
    return false;
  }
  
  // Simple comparison: create signatures for each quad (predicate + object)
  // For nested blank nodes, we'll match them separately if needed
  const signatures1 = new Set(
    quads1.map(q => {
      const pred = (q.predicate as { value: string }).value;
      let obj: string;
      
      if (q.object.termType === 'NamedNode') {
        obj = (q.object as { value: string }).value;
      } else if (q.object.termType === 'Literal') {
        const lit = q.object as { value: string; datatype?: { value: string }; language?: string };
        obj = `"${lit.value}"${lit.language ? `@${lit.language}` : lit.datatype ? `^^${lit.datatype.value}` : ''}`;
      } else if (q.object.termType === 'BlankNode') {
        // For nested blank nodes, use placeholder - we'll handle them separately
        obj = `_:BLANK_PLACEHOLDER`;
      } else {
        obj = '';
      }
      
      return `${pred}|${obj}`;
    })
  );
  
  const signatures2 = new Set(
    quads2.map(q => {
      const pred = (q.predicate as { value: string }).value;
      let obj: string;
      
      if (q.object.termType === 'NamedNode') {
        obj = (q.object as { value: string }).value;
      } else if (q.object.termType === 'Literal') {
        const lit = q.object as { value: string; datatype?: { value: string }; language?: string };
        obj = `"${lit.value}"${lit.language ? `@${lit.language}` : lit.datatype ? `^^${lit.datatype.value}` : ''}`;
      } else if (q.object.termType === 'BlankNode') {
        obj = `_:BLANK_PLACEHOLDER`;
      } else {
        obj = '';
      }
      
      return `${pred}|${obj}`;
    })
  );
  
  // Check if all signatures match
  // For nested blank nodes, we use placeholders, so they'll match if the structure is the same
  if (signatures1.size !== signatures2.size) {
    return false;
  }
  
  // Check if all signatures from quads1 exist in quads2
  for (const sig of signatures1) {
    if (!signatures2.has(sig)) {
      return false;
    }
  }
  
  // All signatures match - the blank nodes have the same structure
  return true;
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
  
  let result = formattedLines.join(formatting.lineEnding);
  
  // CRITICAL: Ensure the result ends with a period and newline
  // N3 Writer should output this, but we need to be sure for proper block replacement
  result = result.trimEnd();
  if (!result.endsWith('.')) {
    // If it doesn't end with period, add it (shouldn't happen, but safety check)
    result += '.';
  }
  result += formatting.lineEnding;
  
  return result;
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
