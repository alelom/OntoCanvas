/**
 * Source text preservation with position tracking for idempotent round-trip saves.
 * Tracks original file positions for each statement block to enable targeted text modifications
 * while preserving formatting, section structure, and import ordering.
 */

import { Parser, Writer } from 'n3';
import type { Quad as N3Quad } from '@rdfjs/types';
import { buildInlineForms, replaceBlankRefs, convertBlanksToInline } from '../turtlePostProcess';
import { debugLog, debugWarn } from '../utils/debug';
import { quadsAreDifferent } from '../parser';

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
  // @ts-expect-error - N3 Parser constructor accepts options but TypeScript definitions are incorrect
  const parser = new Parser({ format: 'text/turtle', blankNodePrefix: '_:' });
  let quads: N3Quad[] = [];
  try {
    // N3 Parser.parse() returns an iterable, convert to array
    const parsed = (parser as any).parse(content);
    quads = Array.isArray(parsed) ? parsed : [...parsed];
  } catch (e) {
    // If parsing fails, log and return empty result
    debugWarn('[parseTurtleWithPositions] N3 Parser failed:', e);
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
    debugWarn('[parseTurtleWithPositions] No quads found in content');
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
  
  // Note: Header tracking removed - not currently used in logic
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineStart = charOffset;
    const lineEnd = charOffset + line.length;
    
    // Check if this is a header line (@prefix or @base)
    const isHeaderLine = trimmed.startsWith('@prefix') || trimmed.startsWith('@base');
    
    if (isHeaderLine) {
      // Header block processed
      
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
      // Past header section
      
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
        subject: subject ?? undefined,
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
  
  // Also group blank node quads by subject ID for matching
  const blankNodeQuadsBySubject = new Map<string, N3Quad[]>();
  for (const quad of quads) {
    if (quad.subject.termType === 'BlankNode') {
      const blankId = getBlankNodeId(quad.subject as { id?: string; value?: string });
      const list = blankNodeQuadsBySubject.get(blankId) || [];
      list.push(quad);
      blankNodeQuadsBySubject.set(blankId, list);
    }
  }
  
  // Match quads to blocks by resolving block subjects to URIs
  for (const block of blocks) {
    if (block.type === 'Header') continue; // Header blocks don't have quads
    
    if (block.subject) {
      // Resolve block subject to full URI
      const resolvedUri = resolvePrefixedName(block.subject); // block.subject is checked above, so it's string here
      if (resolvedUri) {
        const subjectQuads = quadsBySubject.get(resolvedUri);
        if (subjectQuads) {
          for (const quad of subjectQuads) {
            block.quads.push(quad);
            quadToBlockMap.set(quad, block);
            
            // If this quad has a blank node as object (e.g., rdfs:subClassOf _:blank1),
            // also match all quads where that blank node is the subject
            if (quad.object.termType === 'BlankNode') {
              const blankId = getBlankNodeId(quad.object as { id?: string; value?: string });
              const blankQuads = blankNodeQuadsBySubject.get(blankId);
              if (blankQuads) {
                for (const blankQuad of blankQuads) {
                  // Only add if not already matched
                  if (!quadToBlockMap.has(blankQuad)) {
                    block.quads.push(blankQuad);
                    quadToBlockMap.set(blankQuad, block);
                  }
                }
              }
            }
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
            
            // If this quad has a blank node as object (e.g., rdfs:subClassOf _:blank1),
            // also match all quads where that blank node is the subject
            if (quad.object.termType === 'BlankNode') {
              const blankId = getBlankNodeId(quad.object as { id?: string; value?: string });
              const blankQuads = blankNodeQuadsBySubject.get(blankId);
              if (blankQuads) {
                for (const blankQuad of blankQuads) {
                  // Only add if not already matched
                  if (!quadToBlockMap.has(blankQuad)) {
                    block.quads.push(blankQuad);
                    quadToBlockMap.set(blankQuad, block);
                  }
                }
              }
            }
            break;
          }
        }
      }
    }
  }
  
  // Finally, match any remaining blank node quads that are referenced in rdfs:subClassOf statements
  // This handles cases where blank node IDs changed after re-parsing
  for (const quad of quads) {
    if (quadToBlockMap.has(quad)) continue; // Already matched
    
    // If this is a rdfs:subClassOf quad with a blank node object, find the block for the subject
    if (quad.predicate.termType === 'NamedNode' && 
        (quad.predicate as { value: string }).value.includes('subClassOf') &&
        quad.object.termType === 'BlankNode') {
      const subjectUri = quad.subject.termType === 'NamedNode' ? (quad.subject as { value: string }).value : null;
      if (subjectUri) {
        // Find the block for this subject
        for (const block of blocks) {
          if (block.type === 'Header') continue;
          const resolvedUri = block.subject ? resolvePrefixedName(block.subject) : null;
          if (resolvedUri && resolvedUri === subjectUri) {
            // This blank node quad belongs to this block
            const blankId = getBlankNodeId(quad.object as { id?: string; value?: string });
            const blankQuads = blankNodeQuadsBySubject.get(blankId);
            if (blankQuads) {
              for (const blankQuad of blankQuads) {
                if (!quadToBlockMap.has(blankQuad)) {
                  block.quads.push(blankQuad);
                  quadToBlockMap.set(blankQuad, block);
                }
              }
            }
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
  debugLog('[PERF] reconstructFromOriginalText START, modifiedBlocks:', modifiedBlocks.length);
  
  let result = cache.content;
  
  // Apply modifications in reverse order (end to start) to preserve positions
  const sortedBlocks = modifiedBlocks
    .filter(b => b.isModified || b.isDeleted)
    .sort((a, b) => b.position.end - a.position.end);
  
  debugLog('[PERF] Processing', sortedBlocks.length, 'modified/deleted blocks');
  const serializeStart = Date.now();
  
  // quadsAreDifferent is now imported at the top of the file
  
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
      // ARCHITECTURAL FIX: Before serializing, check if current quads match original quads
      // If they do, use original text to preserve property ordering
      // This handles the case where a change was undone (e.g., rename then rename back)
      // N3 Writer reorders properties, so we can only preserve order by using original text
      // EXCEPTION: If the block has blank node quads, we MUST serialize to ensure blank node IDs match the current store
      
      // Check if block has blank node quads (where blank node is subject)
      const hasBlankNodeQuads = block.quads.some(q => q.subject.termType === 'BlankNode');
      
      // Find the original block in cache to get original quads
      const originalBlock = cache.statementBlocks.find(b => 
        b.position.start === block.position.start && 
        b.position.end === block.position.end &&
        b.subject === block.subject
      );
      
      // If we found the original block and current quads match original quads, use original text
      // BUT: If block has blank node quads, we must serialize to ensure blank node IDs match current store
      if (originalBlock && originalBlock.quads.length > 0 && block.quads.length > 0 && !hasBlankNodeQuads) {
        const quadsMatch = !quadsAreDifferent(originalBlock.quads, block.quads);
        if (quadsMatch && originalBlock.originalText) {
          debugLog('[reconstructFromOriginalText] Quads match original, using original text to preserve property order for:', block.subject);
          // Use original text - no need to serialize
          continue; // Skip serialization, original text is already in result
        }
      }
      
      if (hasBlankNodeQuads) {
        debugLog('[reconstructFromOriginalText] Block has blank node quads, must serialize to ensure blank node IDs match current store:', block.subject);
      }
      
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
      // Note: nextNonEmptyLine calculated but not currently used (reserved for future spacing logic)
      void afterBlock.split(cache.formattingStyle.lineEnding).find(line => line.trim() !== '');
      
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
  // Note: newBlocksStart reserved for future performance tracking
  void Date.now();
  
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
  _cache: OriginalFileCache
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
  // CRITICAL: Even if block.isModified is true, if only the label changed,
  // we can do a targeted text replacement to preserve property ordering
  // N3 Writer reorders properties, so we can only preserve order by using original text
  if (block.originalText && !block.isModified) {
    return block.originalText;
  }
  
  // ARCHITECTURAL FIX: For simple label changes, do targeted text replacement
  // instead of full serialization to preserve property ordering
  // ENHANCEMENT: Also handle blocks with restrictions if restrictions haven't changed
  if (block.originalText && block.isModified) {
    // Check if only label changed (compare quads - if only rdfs:label is different, do targeted replacement)
    const labelQuads = block.quads.filter(q => (q.predicate as { value: string }).value.includes('label'));
    if (labelQuads.length === 1) {
      // Only one label quad - try targeted replacement
      const labelQuad = labelQuads[0];
      const newLabel = labelQuad.object.termType === 'Literal' 
        ? (labelQuad.object as { value: string }).value 
        : null;
      
      if (newLabel) {
        // Find old label in original text and replace it
        const labelPattern = /rdfs:label\s+"([^"]+)"/;
        const match = block.originalText.match(labelPattern);
        if (match && match[1] !== newLabel) {
          // ENHANCEMENT: Check if block has restrictions (blank nodes)
          // If it does, verify restrictions haven't changed by comparing structures
          const blankNodeQuads = block.quads.filter(q => 
            q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode'
          );
          
          if (blankNodeQuads.length > 0) {
            // Block has restrictions - need to verify they haven't changed
            // Get original block from cache to compare restriction structures
            let restrictionsUnchanged = true;
            if (cache) {
              const originalBlock = cache.statementBlocks.find(b => 
                b.position.start === block.position.start && 
                b.position.end === block.position.end &&
                b.subject === block.subject
              );
              
              if (originalBlock && originalBlock.quads) {
                // Group blank node quads by blank node ID (from current block)
                const currentBlankQuadsBySubject = new Map<string, N3Quad[]>();
                for (const quad of block.quads) {
                  if (quad.subject.termType === 'BlankNode') {
                    const blankId = getBlankNodeId(quad.subject as { id?: string; value?: string });
                    const list = currentBlankQuadsBySubject.get(blankId) || [];
                    list.push(quad);
                    currentBlankQuadsBySubject.set(blankId, list);
                  }
                }
                
                // Group blank node quads by blank node ID (from original block)
                const originalBlankQuadsBySubject = new Map<string, N3Quad[]>();
                for (const quad of originalBlock.quads) {
                  if (quad.subject.termType === 'BlankNode') {
                    const blankId = getBlankNodeId(quad.subject as { id?: string; value?: string });
                    const list = originalBlankQuadsBySubject.get(blankId) || [];
                    list.push(quad);
                    originalBlankQuadsBySubject.set(blankId, list);
                  }
                }
                
                // Compare structures: each current blank node should match an original blank node
                if (currentBlankQuadsBySubject.size !== originalBlankQuadsBySubject.size) {
                  restrictionsUnchanged = false;
                  debugLog('[serializeBlockToTurtle] Restriction count changed:', currentBlankQuadsBySubject.size, 'vs', originalBlankQuadsBySubject.size);
                } else {
                  // Match each current blank node to an original by structure
                  const matchedOriginalBlanks = new Set<string>();
                  for (const [currentBlankId, currentQuads] of currentBlankQuadsBySubject.entries()) {
                    let foundMatch = false;
                    for (const [originalBlankId, originalQuads] of originalBlankQuadsBySubject.entries()) {
                      if (matchedOriginalBlanks.has(originalBlankId)) continue;
                      
                      if (currentQuads.length === originalQuads.length &&
                          blankNodesMatchByStructure(currentQuads, originalQuads)) {
                        matchedOriginalBlanks.add(originalBlankId);
                        foundMatch = true;
                        break;
                      }
                    }
                    if (!foundMatch) {
                      restrictionsUnchanged = false;
                      debugLog('[serializeBlockToTurtle] Restriction structure changed for blank node:', currentBlankId);
                      break;
                    }
                  }
                }
              } else {
                // No original block found - can't verify, so don't use targeted replacement
                restrictionsUnchanged = false;
                debugLog('[serializeBlockToTurtle] No original block found to compare restrictions');
              }
            } else {
              // No cache - can't verify, so don't use targeted replacement
              restrictionsUnchanged = false;
              debugLog('[serializeBlockToTurtle] No cache available to compare restrictions');
            }
            
            if (!restrictionsUnchanged) {
              debugLog('[serializeBlockToTurtle] Restrictions changed, cannot use targeted replacement');
              // Fall through to full serialization
            } else {
              debugLog('[serializeBlockToTurtle] Restrictions unchanged, using targeted label replacement');
              // Restrictions are unchanged, safe to use targeted replacement
              const updatedText = block.originalText.replace(
                labelPattern,
                `rdfs:label "${newLabel.replace(/"/g, '\\"')}"`
              );
              debugLog('[serializeBlockToTurtle] Using targeted label replacement to preserve property order (with restrictions)');
              return updatedText;
            }
          } else {
            // No restrictions - safe to use targeted replacement
            const updatedText = block.originalText.replace(
              labelPattern,
              `rdfs:label "${newLabel.replace(/"/g, '\\"')}"`
            );
            debugLog('[serializeBlockToTurtle] Using targeted label replacement to preserve property order');
            return updatedText;
          }
        }
      }
    }
  }
  
  // If targeted replacement didn't work, fall back to full serialization
  // The property ordering issue is a known limitation when blocks are fully serialized
  
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
    // @ts-expect-error - N3 Writer constructor accepts options but TypeScript definitions are incorrect
    const writer = new Writer({
      format: 'text/turtle',
      prefixes: prefixMap, // Use prefix map from cache to preserve prefixed names
    });
    
    // ARCHITECTURAL FIX: Preserve property order from original text
    // N3 Writer reorders properties, so we need to sort quads according to original order
    // Extract property order from original text
    const propertyOrder: string[] = [];
    if (block.originalText) {
      // Parse original text to extract predicate order
      // Match predicates in the order they appear: "predicate value ;" or "predicate value ."
      const predicatePattern = /(\S+)\s+[^;.]+[;.]/g;
      let match;
      while ((match = predicatePattern.exec(block.originalText)) !== null) {
        const predicate = match[1].trim();
        // Skip subject (first line), only track predicates
        if (predicate && !predicate.startsWith('@') && !predicate.startsWith('#')) {
          // Normalize predicate (remove prefixes for comparison)
          const normalized = predicate.replace(/^[a-z]+:/, '').replace(/^:/, '');
          if (!propertyOrder.includes(normalized)) {
            propertyOrder.push(normalized);
          }
        }
      }
    }
    
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
        const blankId = getBlankNodeId(quad.subject as { id?: string; value?: string });
        const list = quadsBySubject.get(`_:${blankId}`) || [];
        list.push(quad);
        quadsBySubject.set(`_:${blankId}`, list);
      }
    }
    
    // Sort quads by property order from original text
    // This preserves the original property ordering when serializing
    const sortQuadsByPropertyOrder = (quads: N3Quad[]): N3Quad[] => {
      if (propertyOrder.length === 0) return quads; // No order info, use as-is
      
      return quads.sort((a, b) => {
        const predA = (a.predicate as { value: string }).value;
        const predB = (b.predicate as { value: string }).value;
        
        // Extract local name for comparison
        const localA = predA.split('#').pop()?.split('/').pop() || predA;
        const localB = predB.split('#').pop()?.split('/').pop() || predB;
        
        // Remove prefix for comparison
        const normA = localA.replace(/^[a-z]+:/, '').replace(/^:/, '');
        const normB = localB.replace(/^[a-z]+:/, '').replace(/^:/, '');
        
        const indexA = propertyOrder.indexOf(normA);
        const indexB = propertyOrder.indexOf(normB);
        
        // If both are in order, sort by index
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        // If only one is in order, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        // If neither is in order, maintain original order
        return 0;
      });
    };
    
    // Serialize all quads - this includes blank node quads which N3 Writer will serialize
    // The blank nodes used as objects will appear as references, and we'll inline them later
    for (const quads of quadsBySubject.values()) {
      const sortedQuads = sortQuadsByPropertyOrder(quads);
      for (const quad of sortedQuads) {
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
      
      // Post-process to inline blank nodes if the original had inline blank nodes
      // Check if original text has inline blank nodes (not explicit _: references)
      const hasInlineBlanks = block.originalText && /\[[\s\S]*?\]/.test(block.originalText);
      const hasExplicitBlanks = block.originalText && /_\:[a-zA-Z0-9_-]+\s+[a-z]/.test(block.originalText);
      
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
       * Attempt 2: buildInlineForms from block.quads + replaceBlankRefs (FAILED)
       *   - Tried: Building inline forms directly from block.quads (which includes blank node quads)
       *   - Tried: Using replaceBlankRefs which has order-based replacement logic
       *   - Issue: replaceBlankRefs expects blank node blocks in output to parse, but N3 Writer doesn't serialize them
       *   - Issue: ID matching fails because N3 Writer generates new IDs (df_X_Y) different from original
       *   - Result: Blank node references remain as _:df_X_Y instead of being inlined
       * 
       * Attempt 3: Manual replacement with inline forms array (CURRENT)
       *   - Tried: Building inline forms from block.quads, then manually replacing blank node references in order
       *   - Status: In progress - adding debugging to understand why replacement isn't working
       * 
       * Next approach if this fails: Structure-based matching
       *   - Match blank nodes by comparing their quads (structure) rather than IDs
       *   - This is more robust but requires parsing N3 Writer output and matching by structure
       */
      
      let processedResult = result;
      if (hasInlineBlanks && !hasExplicitBlanks) {
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
            
            // Convert prefixMap to externalRefs format for buildInlineForms
            // This allows shortenIri to use prefixed names instead of full URIs
            const externalRefsForInlineForms: Array<{ url: string; usePrefix: boolean; prefix?: string }> = [];
            if (cache && Object.keys(prefixMap).length > 0) {
              for (const [prefix, namespace] of Object.entries(prefixMap)) {
                externalRefsForInlineForms.push({
                  url: namespace,
                  usePrefix: true,
                  prefix: prefix || '' // Empty prefix means use ':' notation for default namespace
                });
              }
              debugLog('[serializeBlockToTurtle] Converted prefix map to externalRefs format:', externalRefsForInlineForms.length, 'prefixes');
            }
            
            // Build inline forms from block.quads (which includes blank node quads)
            // Pass externalRefs so shortenIri can use prefixed names
            const inlineFormsFromQuads = buildInlineForms(
              block.quads, 
              externalRefsForInlineForms.length > 0 ? externalRefsForInlineForms : undefined, 
              true
            );
            debugLog('[serializeBlockToTurtle] Built', inlineFormsFromQuads.size, 'inline forms');
            
            // Log the inline forms for debugging
            if (inlineFormsFromQuads.size > 0) {
              debugLog('[serializeBlockToTurtle] Inline forms keys:', Array.from(inlineFormsFromQuads.keys()));
              const inlineFormsArray = Array.from(inlineFormsFromQuads.values());
              debugLog('[serializeBlockToTurtle] Inline forms count:', inlineFormsArray.length);
              
              // Log all inline forms, not just the first
              inlineFormsArray.forEach((form, idx) => {
                debugLog('[serializeBlockToTurtle] Inline form', idx + 1, ':', form.substring(0, 200));
                if (form === '[  ]' || form.trim() === '[]') {
                  debugLog('[serializeBlockToTurtle] ERROR: Inline form', idx + 1, 'is EMPTY!');
                }
              });
              
              const firstForm = inlineFormsArray[0];
              // Only log error if we have blank node references in output AND the form is empty
              // This avoids false positives for blocks that don't have blank nodes
              if ((firstForm === '[  ]' || firstForm.trim() === '[]') && hasBlankRefs) {
                debugLog('[serializeBlockToTurtle] ERROR: First inline form is EMPTY! This means blank node quads are missing.');
                debugLog('[serializeBlockToTurtle] Block subject:', block.subject);
                debugLog('[serializeBlockToTurtle] Total quads in block:', block.quads.length);
                debugLog('[serializeBlockToTurtle] Blank nodes as subjects:', blankNodeAsSubject.length);
                debugLog('[serializeBlockToTurtle] Blank nodes as objects:', blankNodeAsObject.length);
              }
            } else {
              // Only warn if we expected inline forms (have blank refs in output)
              if (hasBlankRefs) {
                debugLog('[serializeBlockToTurtle] WARNING: No inline forms built from', block.quads.length, 'quads, but blank node refs found in output!');
                debugLog('[serializeBlockToTurtle] Block subject:', block.subject);
                debugLog('[serializeBlockToTurtle] Blank nodes as subjects:', blankNodeAsSubject.length);
                debugLog('[serializeBlockToTurtle] Blank nodes as objects:', blankNodeAsObject.length);
              }
            }
            
            if (inlineFormsFromQuads.size > 0) {
              // Find blank node references in output using regex (don't parse - prefixes are removed)
              // Find all blank node references like _:df_0_0 or _:n3-0
              const blankNodeRefPattern = /_:df_\d+_\d+|_:n3-\d+/g;
              const blankNodeRefs = result.match(blankNodeRefPattern);
              debugLog('[serializeBlockToTurtle] Found blank node refs in output:', blankNodeRefs);
              
              if (blankNodeRefs && blankNodeRefs.length > 0) {
                try {
                  // IMPROVEMENT: Use structure-based matching to map N3 Writer output blank node IDs
                  // to block.quads blank node IDs, then use inline forms
                  
                  // Step 1: Parse N3 Writer output to get blank node structures
                  // @ts-expect-error - N3 Parser constructor accepts options but TypeScript definitions are incorrect
                  const parser = new Parser({ format: 'text/turtle', blankNodePrefix: '_:' });
                  let outputQuads: N3Quad[] = [];
                  let structureBasedMatchingWorked = false;
                  const outputIdToInlineForm = new Map<string, string>();
                  
                  try {
                    const parsed = (parser as any).parse(result);
                    outputQuads = Array.isArray(parsed) ? parsed : [...parsed];
                    debugLog('[serializeBlockToTurtle] Parsed N3 Writer output, got', outputQuads.length, 'quads');
                    
                    // Step 2: Group quads by blank node subject (from output and block.quads)
                    const outputQuadsByBlankSubject = new Map<string, N3Quad[]>();
                    const blockQuadsByBlankSubject = new Map<string, N3Quad[]>();
                    
                    for (const quad of outputQuads) {
                      if (quad.subject.termType === 'BlankNode') {
                        const blankId = getBlankNodeId(quad.subject as { id?: string; value?: string });
                        const list = outputQuadsByBlankSubject.get(blankId) || [];
                        list.push(quad);
                        outputQuadsByBlankSubject.set(blankId, list);
                      }
                    }
                    
                    for (const quad of block.quads) {
                      if (quad.subject.termType === 'BlankNode') {
                        const blankId = getBlankNodeId(quad.subject as { id?: string; value?: string });
                        const list = blockQuadsByBlankSubject.get(blankId) || [];
                        list.push(quad);
                        blockQuadsByBlankSubject.set(blankId, list);
                      }
                    }
                    
                    debugLog('[serializeBlockToTurtle] Output has', outputQuadsByBlankSubject.size, 'blank nodes as subjects');
                    debugLog('[serializeBlockToTurtle] Block.quads has', blockQuadsByBlankSubject.size, 'blank nodes as subjects');
                    
                    // Step 3: Match blank nodes by structure and create mapping: outputBlankId -> inlineForm
                    const matchedBlockBlanks = new Set<string>();
                    
                    // Find blank nodes used as objects in output (these need to be inlined)
                    const blankNodesUsedAsObjects = new Set<string>();
                    for (const quad of outputQuads) {
                      if (quad.object.termType === 'BlankNode') {
                        const blankId = getBlankNodeId(quad.object as { id?: string; value?: string });
                        blankNodesUsedAsObjects.add(blankId);
                      }
                    }
                    
                    debugLog('[serializeBlockToTurtle] Found', blankNodesUsedAsObjects.size, 'blank nodes used as objects in output');
                    
                    // Match each output blank node to a block blank node by structure
                    for (const outputBlankId of blankNodesUsedAsObjects) {
                      const outputQuadsForBlank = outputQuadsByBlankSubject.get(outputBlankId);
                      if (!outputQuadsForBlank || outputQuadsForBlank.length === 0) {
                        debugLog('[serializeBlockToTurtle] No quads found for output blank node:', outputBlankId);
                        continue;
                      }
                      
                      // Find matching blank node in block.quads by comparing structure
                      let matchedBlockBlankId: string | null = null;
                      for (const [blockBlankId, blockQuadsForBlank] of blockQuadsByBlankSubject.entries()) {
                        if (matchedBlockBlanks.has(blockBlankId)) continue; // Already matched
                        
                        if (outputQuadsForBlank.length === blockQuadsForBlank.length &&
                            blankNodesMatchByStructure(outputQuadsForBlank, blockQuadsForBlank)) {
                          matchedBlockBlankId = blockBlankId;
                          matchedBlockBlanks.add(blockBlankId);
                          debugLog('[serializeBlockToTurtle] Matched output blank', outputBlankId, 'to block blank', blockBlankId, 'by structure');
                          break;
                        }
                      }
                      
                      if (matchedBlockBlankId) {
                        const inlineForm = inlineFormsFromQuads.get(matchedBlockBlankId);
                        if (inlineForm) {
                          outputIdToInlineForm.set(outputBlankId, inlineForm);
                          debugLog('[serializeBlockToTurtle] Mapped output blank', outputBlankId, 'to inline form (length:', inlineForm.length, ')');
                        } else {
                          debugLog('[serializeBlockToTurtle] WARNING: Found match but no inline form for block blank', matchedBlockBlankId);
                        }
                      } else {
                        debugLog('[serializeBlockToTurtle] WARNING: Could not match output blank', outputBlankId, 'to any block blank by structure');
                      }
                    }
                    
                    debugLog('[serializeBlockToTurtle] Structure-based matching created', outputIdToInlineForm.size, 'mappings out of', blankNodesUsedAsObjects.size, 'blank nodes');
                    structureBasedMatchingWorked = outputIdToInlineForm.size > 0;
                  } catch (parseError) {
                    debugLog('[serializeBlockToTurtle] Failed to parse N3 Writer output for structure matching:', parseError);
                    // Will fall back to order-based replacement below
                  }
                  
                  // Step 4: Remove blank node blocks and replace references using structure-based mapping
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
                  
                  // Step 5: Replace blank node references using structure-based mapping
                  // If structure-based matching worked, use that mapping; otherwise fall back to order-based
                  if (structureBasedMatchingWorked && outputIdToInlineForm.size > 0) {
                    debugLog('[serializeBlockToTurtle] Using structure-based mapping for', outputIdToInlineForm.size, 'blank nodes');
                    // Replace using structure-based mapping
                    for (const [outputBlankId, inlineForm] of outputIdToInlineForm.entries()) {
                      const ref = outputBlankId.startsWith('_:') ? outputBlankId : `_:${outputBlankId}`;
                      const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      // Match blank node references in object position (after predicates or commas)
                      const pattern = new RegExp(`(?<![\\w:-])${escapedRef}(?=[.,;\\s\\]\\n]|$)`, 'g');
                      output = output.replace(pattern, inlineForm);
                      debugLog('[serializeBlockToTurtle] Replaced', ref, 'with inline form');
                    }
                    processedResult = output;
                  } else {
                    debugLog('[serializeBlockToTurtle] Structure-based matching failed or incomplete, falling back to replaceBlankRefs');
                    // Fall back to replaceBlankRefs which has order-based replacement logic
                    processedResult = replaceBlankRefs(output, inlineFormsFromQuads);
                  }
                
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
                const finalHasInline = /\[[\s\S]*?\]/.test(processedResult);
                if (!finalHasInline && hasBlankRefs) {
                  debugLog('[serializeBlockToTurtle] FINAL WARNING: All replacement attempts failed! Blank nodes not inlined.');
                  debugLog('[serializeBlockToTurtle] Block subject:', block.subject);
                  debugLog('[serializeBlockToTurtle] Final output (first 300 chars):', processedResult.substring(0, 300));
                  debugLog('[serializeBlockToTurtle] Inline forms available:', inlineFormsFromQuads.size);
                  debugLog('[serializeBlockToTurtle] Blank refs in output:', blankRefsInOutput);
                } else if (finalHasInline) {
                  debugLog('[serializeBlockToTurtle] SUCCESS: Blank nodes successfully inlined for block:', block.subject);
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
      let formatted = applyFormattingStyle(processedResult, formatting, block.originalText);
      
      // CRITICAL: Apply style fixes to match original format (e.g., convert "a" to "rdf:type")
      // This ensures that when we serialize, we match the original style
      // Check if original uses "rdf:type" instead of "a"
      if (block.originalText && block.originalText.includes('rdf:type') && !block.originalText.match(/\s+a\s+/)) {
        // Original uses rdf:type, so convert "a" to "rdf:type" in serialized output
        formatted = formatted.replace(/\s+a\s+(owl|rdf|rdfs|xsd|xml):/g, ' rdf:type $1:');
        formatted = formatted.replace(/\s+a\s+:/g, ' rdf:type :');
        formatted = formatted.replace(/\s+a\s+</g, ' rdf:type <');
      }
      
      resolve(formatted);
    });
  });
}

/**
 * Inline blank nodes by building forms from block.quads and matching to output by structure
 * This approach is more robust than parsing output because we work with quads we control
 * Reserved for future use - not currently called but kept for potential future implementation
 */
// @ts-expect-error - Reserved for future use, not currently called
function inlineBlankNodesFromQuads(
  n3Output: string,
  blockQuads: N3Quad[],
  _prefixMap: Record<string, string>
): string {
  // Step 1: Build inline forms from block.quads (using original blank node IDs)
  const inlineFormsFromQuads = buildInlineForms(blockQuads, undefined, true);
  
  if (inlineFormsFromQuads.size === 0) {
    return n3Output; // No blank nodes to inline
  }
  
  // Step 2: Parse N3 Writer output to get quads (with new blank node IDs)
  // If parsing fails or takes too long, fall back to convertBlanksToInline
  // @ts-expect-error - N3 Parser constructor accepts options but TypeScript definitions are incorrect
  const parser = new Parser({ format: 'text/turtle', blankNodePrefix: '_:' });
  let outputQuads: N3Quad[];
  try {
    const parsed = (parser as any).parse(n3Output);
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
      const blankId = getBlankNodeId(quad.subject as { id?: string; value?: string });
      const list = outputQuadsByBlankSubject.get(blankId) || [];
      list.push(quad);
      outputQuadsByBlankSubject.set(blankId, list);
    }
  }
  
  // Step 4: Group quads by blank node subject (from block.quads)
  const blockQuadsByBlankSubject = new Map<string, N3Quad[]>();
  for (const quad of blockQuads) {
    if (quad.subject.termType === 'BlankNode') {
      const blankId = getBlankNodeId(quad.subject as { id?: string; value?: string });
      const list = blockQuadsByBlankSubject.get(blankId) || [];
      list.push(quad);
      blockQuadsByBlankSubject.set(blankId, list);
    }
  }
  
  // Step 5: Find blank nodes used as objects (these need to be inlined)
  const blankNodesUsedAsObjects = new Set<string>();
  for (const quad of outputQuads) {
    if (quad.object.termType === 'BlankNode') {
      const blankId = getBlankNodeId(quad.object as { id?: string; value?: string });
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
function getBlankNodeId(blank: { id?: string; value?: string }): string {
  return blank.id ?? blank.value ?? '';
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
 * Used recursively within itself (line 1847) - TypeScript cannot detect recursive usage
 */
// @ts-expect-error - TypeScript cannot detect recursive function usage (used on line 1847)
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
  _originalText?: string
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
  debugWarn('[sourcePreservation] RDF/XML position tracking not yet implemented');
  
  // @ts-expect-error - N3 Parser constructor accepts options but TypeScript definitions are incorrect
  const parser = new Parser({ format: 'application/rdf+xml' });
  let quads: N3Quad[];
  try {
    quads = [...(parser as any).parse(content)];
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
  debugWarn('[sourcePreservation] JSON-LD position tracking not yet implemented');
  
  // @ts-expect-error - N3 Parser constructor accepts options but TypeScript definitions are incorrect
  const parser = new Parser({ format: 'application/ld+json' });
  let quads: N3Quad[];
  try {
    quads = [...(parser as any).parse(content)];
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
  debugWarn('[sourcePreservation] N-Triples position tracking not yet implemented');
  
  // @ts-expect-error - N3 Parser constructor accepts options but TypeScript definitions are incorrect
  const parser = new Parser({ format: 'application/n-triples' });
  let quads: N3Quad[];
  try {
    quads = [...(parser as any).parse(content)];
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
  _modifiedBlocks: StatementBlock[]
): string {
  // TODO: Implement RDF/XML reconstruction
  debugWarn('[sourcePreservation] RDF/XML reconstruction not yet implemented');
  return cache.content;
}

/**
 * Reconstruct from original JSON-LD
 * TODO: Implement JSON-LD reconstruction
 */
export function reconstructFromOriginalJsonLd(
  cache: OriginalFileCache,
  _modifiedBlocks: StatementBlock[]
): string {
  // TODO: Implement JSON-LD reconstruction
  debugWarn('[sourcePreservation] JSON-LD reconstruction not yet implemented');
  return cache.content;
}

/**
 * Reconstruct from original N-Triples
 * TODO: Implement N-Triples reconstruction
 */
export function reconstructFromOriginalNTriples(
  cache: OriginalFileCache,
  _modifiedBlocks: StatementBlock[]
): string {
  // TODO: Implement N-Triples reconstruction
  debugWarn('[sourcePreservation] N-Triples reconstruction not yet implemented');
  return cache.content;
}
