/**
 * Source text preservation with position tracking for idempotent round-trip saves.
 * Tracks original file positions for each statement block to enable targeted text modifications
 * while preserving formatting, section structure, and import ordering.
 */

import { Parser, Writer, Store, DataFactory } from 'n3';
import type { Quad as N3Quad } from '@rdfjs/types';
import { buildInlineForms, replaceBlankRefs, convertBlanksToInline } from '../turtlePostProcess';
import { debugLog, debugWarn, debugError } from '../utils/debug';
import { quadsAreDifferent } from '../parser';
import { parsePropertyLinesWithStateMachine, type PropertyLineMatch } from './propertyLineParser';

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
  _cachedPropertyLines?: PropertyLine[];  // Lazy cache for property lines
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

/**
 * Property line within a statement block.
 * Represents a single property (predicate) and its value(s) in the original text.
 */
export interface PropertyLine {
  predicate: string;              // e.g., "rdfs:label", ":labellableRoot"
  predicateUri: string;           // Full URI for matching
  position: TextPosition;         // Character positions for this property line (property-level)
  originalLineText: string;       // Exact text of line(s) (may span multiple lines)
  quads: N3Quad[];                // Quads that correspond to this property
  quadPositions: Map<N3Quad, TextPosition>;  // Individual quad positions within property
  isMultiLine: boolean;           // Property spans multiple lines (e.g., restrictions)
  lineNumbers: number[];          // Line numbers this property occupies
  confidence: number;             // Match confidence score (0-1, 1 = perfect match)
  validationErrors: string[];     // Any validation issues found
  subProperties?: PropertyLine[]; // For multi-line properties (restrictions), nested properties
}

// ============================================================================
// Phase 2: Position-Aware Parsing (Turtle)
// ============================================================================

/**
 * Parse Turtle with position tracking
 * Returns quads, blocks, and sections with full position information
 * 
 * @param content The Turtle content to parse
 * @param quads Optional pre-parsed quads (if not provided, will parse using parseRdfToQuads)
 */
export async function parseTurtleWithPositions(
  content: string,
  quads?: N3Quad[]
): Promise<{
  quads: N3Quad[];
  cache: OriginalFileCache;
}> {
  // If quads not provided, parse using parseRdfToQuads (async)
  let parsedQuads: N3Quad[] = quads || [];
  if (!quads) {
    try {
      const { parseRdfToQuads } = await import('./parseRdfToQuads');
      const rdfQuads = await parseRdfToQuads(content, { contentType: 'text/turtle' });
      parsedQuads = rdfQuads as N3Quad[];
    } catch (e) {
      // If parsing fails, log and return empty result
      debugWarn('[parseTurtleWithPositions] parseRdfToQuads failed:', e);
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
  }
  
  // If no quads found, still create cache for position tracking
  if (parsedQuads.length === 0) {
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
      
      // Finalize previous block if exists (do not overwrite if already ended at a period, e.g. with blank lines after)
      if (currentBlock && !currentBlock.originalText) {
        // Block ends at the end of previous line (before this new statement)
        currentBlock.position.end = lineStart - formattingStyle.lineEnding.length;
        currentBlock.position.endLine = lineNumber - 1;
        currentBlock.originalText = content.slice(
          currentBlock.position.start,
          currentBlock.position.end + formattingStyle.lineEnding.length
        );
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
      
    } else if (currentBlock && trimmed !== '') {
      // Continuation of current block (indented line or property continuation); do not extend over blank lines
      currentBlock.position.end = lineEnd;
      currentBlock.position.endLine = lineNumber;
    }
    
    // Check if this line ends the block (ends with period, and next non-empty line is statement start or EOF)
    // Allow blank lines between blocks: block ends at period if next content (after any blank lines) is a statement
    const endsWithPeriod = trimmed.endsWith('.');
    const nextLineIsStatement = i + 1 < lines.length &&
      lines[i + 1].trim() !== '' &&
      !lines[i + 1].trim().startsWith(' ') &&
      !lines[i + 1].trim().startsWith('\t') &&
      !lines[i + 1].trim().startsWith('#');
    let nextContentIndex = i + 1;
    while (nextContentIndex < lines.length && lines[nextContentIndex].trim() === '') {
      nextContentIndex++;
    }
    const nextContentIsStatement = nextContentIndex < lines.length &&
      !lines[nextContentIndex].trim().startsWith(' ') &&
      !lines[nextContentIndex].trim().startsWith('\t') &&
      !lines[nextContentIndex].trim().startsWith('#');
    const isLastLine = i === lines.length - 1;

    if (endsWithPeriod && (nextLineIsStatement || nextContentIsStatement || isLastLine) && currentBlock) {
      // Block ends here (at the period; blank lines after this are not part of the block)
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
  matchQuadsToBlocks(parsedQuads, blocks, quadToBlockMap);
  
  const cache: OriginalFileCache = {
    content,
    format: 'turtle',
    formattingStyle,
    headerSection,
    sections,
    statementBlocks: blocks,
    quadToBlockMap
  };
  
  return { quads: parsedQuads, cache };
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
  // (fallback when parser base IRI differs from file @prefix, so resolved subject != quad subject)
  const getLocalName = (uri: string): string => uri.split('#').pop() || uri.split('/').pop() || '';
  for (const quad of quads) {
    if (quadToBlockMap.has(quad)) continue; // Already matched
    
    if (quad.subject.termType === 'NamedNode') {
      const subjectUri = (quad.subject as { value: string }).value;
      const localName = getLocalName(subjectUri);
      // 1) Prefer block whose resolved subject equals quad subject
      // 2) Else prefer block whose resolved subject has same local name (parser base may differ)
      // 3) Else first block whose text contains the URI or local name
      let matchedBlock: StatementBlock | null = null;
      let fallbackBlock: StatementBlock | null = null;
      for (const block of blocks) {
        if (block.type === 'Header') continue;
        const resolved = block.subject ? resolvePrefixedName(block.subject) : null;
        if (resolved === subjectUri) {
          matchedBlock = block;
          break;
        }
        if (resolved && getLocalName(resolved) === localName) {
          matchedBlock = matchedBlock || block;
        }
        if (!fallbackBlock && block.originalText && (
          block.originalText.includes(subjectUri) ||
          block.originalText.includes(localName)
        )) {
          fallbackBlock = block;
        }
      }
      const target = matchedBlock || fallbackBlock;
      if (target) {
        target.quads.push(quad);
        quadToBlockMap.set(quad, target);
        if (quad.object.termType === 'BlankNode') {
          const blankId = getBlankNodeId(quad.object as { id?: string; value?: string });
          const blankQuads = blankNodeQuadsBySubject.get(blankId);
          if (blankQuads) {
            for (const blankQuad of blankQuads) {
              if (!quadToBlockMap.has(blankQuad)) {
                target.quads.push(blankQuad);
                quadToBlockMap.set(blankQuad, target);
              }
            }
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
  // Detect line ending - count CRLF vs LF to determine the most common style
  // This is more accurate than just checking if CRLF exists
  let crlfCount = 0;
  let lfCount = 0;
  for (let i = 0; i < content.length - 1; i++) {
    if (content[i] === '\r' && content[i + 1] === '\n') {
      crlfCount++;
      i++; // Skip the \n
    } else if (content[i] === '\n' && (i === 0 || content[i - 1] !== '\r')) {
      lfCount++;
    }
  }
  // Also check standalone \n at the end
  if (content.length > 0 && content[content.length - 1] === '\n' && 
      (content.length === 1 || content[content.length - 2] !== '\r')) {
    lfCount++;
  }
  // Use the most common line ending style
  const lineEnding = crlfCount > lfCount ? '\r\n' : '\n';
  
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
  
  // Track cumulative length changes for blocks processed so far (in reverse order)
  // Key: original block position.end (unique identifier)
  // Value: length change (newLength - originalLength)
  const lengthChanges = new Map<number, number>();
  
  // quadsAreDifferent is now imported at the top of the file
  
  for (let i = 0; i < sortedBlocks.length; i++) {
    const block = sortedBlocks[i];
    if (i % 5 === 0) {
      debugLog('[PERF] Serializing block', i, 'of', sortedBlocks.length, 'elapsed:', Date.now() - serializeStart, 'ms');
    }
    if (block.isDeleted) {
      // Remove the text (including the newline after)
      const originalLength = block.position.end - block.position.start + cache.formattingStyle.lineEnding.length;
      const newLength = 0;
      const lengthChange = newLength - originalLength;
      lengthChanges.set(block.position.end, lengthChange);
      
      const endPos = block.position.end + cache.formattingStyle.lineEnding.length;
      result = result.slice(0, block.position.start) + 
               result.slice(endPos);
    } else if (block.isModified) {
      // ARCHITECTURAL FIX: Before serializing, check if current quads match original quads
      // If they do, use original text to preserve property ordering
      // This handles the case where a change was undone (e.g., rename then rename back)
      // N3 Writer reorders properties, so we can only preserve order by using original text
      // EXCEPTION: If the block has blank node quads, we MUST serialize to ensure blank node IDs match the current store
      
      // Check if block has blank node quads (where blank node is subject OR object)
      // If blank nodes are objects (like in rdfs:subClassOf [ ... ]), we must serialize to ensure they're included
      const hasBlankNodeQuads = block.quads.some(q => 
        q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode'
      );
      
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
      
      // SAFETY CHECK: Verify serialized block doesn't have syntax errors
      if (block.subject && block.subject.includes('DrawingSheet')) {
        // Check for missing predicates (e.g., "owl:Class;" without "a" or "rdf:type")
        if (newText.match(/^\s*owl:Class\s*[;.]/m) && !newText.match(/\s+(a|rdf:type)\s+owl:Class/)) {
          debugError('[reconstructFromOriginalText] WARNING: Serialized block for DrawingSheet has "owl:Class" without predicate!');
          debugError('[reconstructFromOriginalText] Serialized text:', newText.substring(0, 500));
        }
      }
      
      // CRITICAL: block.position.end includes the period, and the original text includes the newline after
      // We need to replace from block.position.start to block.position.end (inclusive of period)
      // Then add the newText (which should end with period + newline)
      // Then skip the newline that was after the original block
      const endPos = block.position.end + cache.formattingStyle.lineEnding.length;
      
      // Check what comes after the block to preserve spacing (blank lines)
      // Use the ORIGINAL cache.content to count blank lines, not the modified result
      // This ensures we get the correct count even when processing blocks in reverse order
      const originalEndPos = block.position.end + cache.formattingStyle.lineEnding.length;
      const originalAfterBlock = cache.content.slice(originalEndPos);
      
      // Count blank lines after this block in the ORIGINAL content
      // Split by the detected line ending style
      const lineEndingRegex = cache.formattingStyle.lineEnding === '\r\n' ? /\r\n/g : /\n/g;
      const linesAfter = originalAfterBlock.split(lineEndingRegex);
      
      let blankLinesCount = 0;
      for (const line of linesAfter) {
        if (line.trim() === '') {
          blankLinesCount++;
        } else {
          break; // Stop at first non-empty line
        }
      }
      
      // Find where the next non-empty content starts in the ORIGINAL (after blank lines)
      let originalNextContentStart = originalEndPos;
      for (let i = 0; i < blankLinesCount; i++) {
        originalNextContentStart += cache.formattingStyle.lineEnding.length;
      }
      
      // In the current result, find the equivalent position
      // Since we're processing in reverse order, we need to account for changes made to later blocks
      // For now, use the same calculation on the current result
      const currentAfterBlock = result.slice(endPos);
      const currentLinesAfter = currentAfterBlock.split(lineEndingRegex);
      let currentBlankLinesCount = 0;
      for (const line of currentLinesAfter) {
        if (line.trim() === '') {
          currentBlankLinesCount++;
        } else {
          break;
        }
      }
      
      // Ensure newText ends properly (should already from applyFormattingStyle, but double-check)
      let finalNewText = newText.trimEnd();
      if (!finalNewText.endsWith('.')) {
        finalNewText += '.';
      }
      finalNewText += cache.formattingStyle.lineEnding;
      
      // Preserve blank lines after the block (from original)
      for (let i = 0; i < blankLinesCount; i++) {
        finalNewText += cache.formattingStyle.lineEnding;
      }
      
      // DEBUG: Log position calculations for DrawingSheet block
      if (block.subject && block.subject.includes('DrawingSheet')) {
        debugLog('[reconstructFromOriginalText] DrawingSheet block position calculation:');
        debugLog('  block.position.start:', block.position.start);
        debugLog('  block.position.end:', block.position.end);
        debugLog('  originalEndPos:', originalEndPos);
        debugLog('  blankLinesCount:', blankLinesCount);
        debugLog('  originalNextContentStart:', originalNextContentStart);
        debugLog('  finalNewText length:', finalNewText.length);
        debugLog('  finalNewText (first 200 chars):', finalNewText.substring(0, 200));
        debugLog('  finalNewText (last 100 chars):', finalNewText.substring(Math.max(0, finalNewText.length - 100)));
      }
      
      // CRITICAL: We need to find where the next content starts in the CURRENT result
      // Since we're processing in reverse order, later blocks may have already been replaced
      // So we can't use originalNextContentStart directly - we need to find the equivalent position
      // in the current result by looking for the next block's start position
      
      // Calculate original block length
      const originalLength = block.position.end - block.position.start + cache.formattingStyle.lineEnding.length;
      
      // Find the next block after this one in the cache
      const nextBlock = cache.statementBlocks
        .filter(b => b.position.start > block.position.end)
        .sort((a, b) => a.position.start - b.position.start)[0];
      
      if (nextBlock) {
        // We're processing blocks in reverse order (by position.end), so when we replace this block,
        // blocks after it have already been replaced. The next block's start in the current result
        // is still nextBlock.position.start (replacing a block only shifts content after that block).
        // So we slice from nextBlock.position.start to get the next block and everything after it.
        let nextContentStart: number;
        if (blankLinesCount === 0) {
          nextContentStart = endPos;
        } else {
          // Has blank lines: skip this block's newline and blank lines by starting at the next block
          nextContentStart = nextBlock.position.start;
        }
        
        // DEBUG: Log nextContentStart calculation for DrawingSheet block
        if (block.subject && block.subject.includes('DrawingSheet')) {
          debugLog('[reconstructFromOriginalText] DrawingSheet nextContentStart calculation:');
          debugLog('  block.position.start:', block.position.start);
          debugLog('  block.position.end:', block.position.end);
          debugLog('  endPos:', endPos);
          debugLog('  finalNewText.length:', finalNewText.length);
          debugLog('  calculated nextContentStart:', nextContentStart);
          debugLog('  result.length:', result.length);
          debugLog('  result.slice(nextContentStart) (first 100 chars):', result.slice(nextContentStart).substring(0, 100));
        }
        
        // SAFETY CHECK: Verify nextContentStart is within bounds
        if (nextContentStart < block.position.start || nextContentStart > result.length) {
          debugError('[reconstructFromOriginalText] Invalid nextContentStart:', nextContentStart, 'for block:', block.subject, 'result length:', result.length);
          // Use fallback: original end + blank lines
          const fallbackNextContentStart = endPos + (blankLinesCount * cache.formattingStyle.lineEnding.length);
          result = result.slice(0, block.position.start) + 
                   finalNewText + 
                   result.slice(fallbackNextContentStart);
        } else {
          // Replace the block: everything before + new text + everything after
          result = result.slice(0, block.position.start) + 
                   finalNewText + 
                   result.slice(nextContentStart);
        }
      } else {
        // No next block - this is the last block, preserve everything after
        // Use the original calculation
        const nextContentStart = endPos + (blankLinesCount * cache.formattingStyle.lineEnding.length);
        result = result.slice(0, block.position.start) + 
                 finalNewText + 
                 result.slice(nextContentStart);
      }
      
      // Track length change for this block
      const newLength = finalNewText.length;
      const lengthChange = newLength - originalLength;
      lengthChanges.set(block.position.end, lengthChange);
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
  if (block.subject === ':TestClass' || block.subject?.includes('TestClass')) {
    debugLog('[serializeBlockToTurtle] TestClass - ENTERED function');
    debugLog('[serializeBlockToTurtle] TestClass - block.quads.length:', block.quads.length);
    debugLog('[serializeBlockToTurtle] TestClass - block.isModified:', block.isModified);
    debugLog('[serializeBlockToTurtle] TestClass - block.originalText exists:', !!block.originalText);
  }
  
  if (block.subject && (block.subject.includes('DrawingSheet') || block.subject === ':TestClass')) {
    const blankAsSubject = block.quads.filter(q => q.subject.termType === 'BlankNode').length;
    const blankAsObject = block.quads.filter(q => q.object.termType === 'BlankNode').length;
    debugLog('[serializeBlockToTurtle]', block.subject, '- block.quads.length:', block.quads.length);
    debugLog('[serializeBlockToTurtle]', block.subject, '- blank nodes as subjects:', blankAsSubject);
    debugLog('[serializeBlockToTurtle]', block.subject, '- blank nodes as objects:', blankAsObject);
    block.quads.forEach((q, i) => {
      const pred = (q.predicate as { value: string }).value;
      const obj = q.object.termType === 'Literal' 
        ? `"${(q.object as { value: string }).value}"` 
        : (q.object as { value: string }).value;
      debugLog(`[serializeBlockToTurtle] ${block.subject} - quad[${i}]: ${pred} -> ${obj}`);
    });
  }
  
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
  // instead of full serialization to preserve property ordering.
  // ENHANCEMENT: Also handle blocks with restrictions if restrictions haven't changed.
  // IMPORTANT: This branch must not depend on isDebugMode() or process.env.DEBUG;
  // only logging may be gated by debug. Serialization output must be identical regardless.
  if (block.originalText && block.isModified) {
    // Check if only label changed (compare quads - if only rdfs:label is different, do targeted replacement)
    // Match rdfs:label only (full URI ends with #label or /label), not e.g. :labellableRoot
    const labelQuads = block.quads.filter(q => {
      const pred = (q.predicate as { value: string }).value;
      return pred.endsWith('#label') || pred.endsWith('/label');
    });
    if (labelQuads.length === 1) {
      // Only one label quad - try targeted replacement
      const labelQuad = labelQuads[0];
      const newLabel = labelQuad.object.termType === 'Literal' 
        ? (labelQuad.object as { value: string }).value 
        : null;
      
      if (newLabel) {
        // Find old label in original text and replace it
        // Prefer strict pattern; fallback to permissive (allows escaped quotes, multiline)
        const labelPattern = /rdfs:label\s+"([^"]+)"/;
        const labelPatternPermissive = /rdfs:label\s+"((?:[^"\\]|\\.)*)"/;
        const match = block.originalText.match(labelPattern) || block.originalText.match(labelPatternPermissive);
        const oldLabel = match ? match[1] : null;
        if (oldLabel !== null && oldLabel !== newLabel) {
          // ENHANCEMENT: Check if block has restrictions (blank nodes)
          // If it does, verify restrictions haven't changed by comparing structures
          const blankNodeQuads = block.quads.filter(q => 
            q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode'
          );
          
          if (blankNodeQuads.length > 0) {
            // Block has restrictions - need to verify they haven't changed
            // Get original block from cache to compare restriction structures
            let restrictionsUnchanged = true;
            let originalBlock: StatementBlock | undefined;
            if (cache) {
              originalBlock = findOriginalBlockForTargetedReplacement(cache, block);
              debugLog('[serializeBlockToTurtle] Targeted replacement: originalBlock found=', !!originalBlock, 'quads=', originalBlock?.quads?.length);
              if (block.subject?.includes('DrawingSheet')) {
                debugLog('[serializeBlockToTurtle] DrawingSheet: originalBlock=', !!originalBlock, 'quadsLen=', originalBlock?.quads?.length, 'block.pos=', block.position?.start, block.position?.end);
              }

              if (!originalBlock) {
                restrictionsUnchanged = false;
                debugLog('[serializeBlockToTurtle] No original block found to compare restrictions');
              }
              let originalQuadsForCompare = originalBlock?.quads?.length ? originalBlock.quads : undefined;
              if (originalBlock && !originalQuadsForCompare?.length && cache.quadToBlockMap) {
                const fromMap: N3Quad[] = [];
                for (const [quad, b] of cache.quadToBlockMap) {
                  if (b === originalBlock) fromMap.push(quad);
                }
                if (fromMap.length > 0) originalQuadsForCompare = fromMap;
              }
              if (!originalBlock || !originalQuadsForCompare?.length) {
                restrictionsUnchanged = false;
                if (originalBlock && !originalQuadsForCompare?.length) {
                  debugLog('[serializeBlockToTurtle] Original block has no quads (and none in quadToBlockMap)');
                }
              }
              if (originalBlock && originalQuadsForCompare && originalQuadsForCompare.length > 0) {
                // Group blank node quads by normalized ID (so df_0_1 and _:df_0_1 are the same)
                const currentBlankQuadsBySubject = new Map<string, N3Quad[]>();
                for (const quad of block.quads) {
                  if (quad.subject.termType === 'BlankNode') {
                    const rawId = getBlankNodeId(quad.subject as { id?: string; value?: string });
                    const key = normalizeBlankNodeIdForGrouping(rawId);
                    const list = currentBlankQuadsBySubject.get(key) || [];
                    if (!list.includes(quad)) list.push(quad);
                    currentBlankQuadsBySubject.set(key, list);
                  }
                }
                
                const originalBlankQuadsBySubject = new Map<string, N3Quad[]>();
                for (const quad of originalQuadsForCompare) {
                  if (quad.subject.termType === 'BlankNode') {
                    const rawId = getBlankNodeId(quad.subject as { id?: string; value?: string });
                    const key = normalizeBlankNodeIdForGrouping(rawId);
                    const list = originalBlankQuadsBySubject.get(key) || [];
                    if (!list.includes(quad)) list.push(quad);
                    originalBlankQuadsBySubject.set(key, list);
                  }
                }
                
                // Compare structures: each current blank node should match an original blank node
                debugLog('[serializeBlockToTurtle] Blank node counts: current=', currentBlankQuadsBySubject.size, 'original=', originalBlankQuadsBySubject.size);
                if (block.subject?.includes('DrawingSheet')) {
                  debugLog('[serializeBlockToTurtle] DrawingSheet targeted path: currentBlanks=', currentBlankQuadsBySubject.size, 'originalBlanks=', originalBlankQuadsBySubject.size);
                }
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
              // Use original block text when available so we have exact formatting; otherwise block.originalText
              const baseText = (originalBlock?.originalText && originalBlock.originalText.length > 0)
                ? originalBlock.originalText
                : block.originalText;
              const updatedText = baseText.replace(
                labelPatternPermissive,
                `rdfs:label "${newLabel.replace(/"/g, '\\"')}"`
              );
              debugLog('[serializeBlockToTurtle] Using targeted label replacement to preserve property order (with restrictions)');
              return updatedText;
            }
          } else {
            // No restrictions - safe to use targeted replacement
            const updatedText = block.originalText.replace(
              labelPatternPermissive,
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
      // For multi-line properties, we need to handle brackets, commas, and newlines
      // Use a more robust pattern that handles multi-line values
      // Pattern: predicate followed by whitespace, then value (can span multiple lines), then ; or .
      const lines = block.originalText.split('\n');
      let inMultiLineValue = false;
      let currentPredicate: string | null = null;
      let isFirstLine = true;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('@') || line.startsWith('#')) continue;
        
        // Skip subject line (first non-empty line)
        if (isFirstLine) {
          isFirstLine = false;
          // Check if this line has a predicate on the same line (not just subject)
          // Pattern: subject (can be prefixed like :Class1 or full URI) followed by predicate
          // Examples: ":Class1 rdf:type owl:Class ;" or "<uri> rdf:type owl:Class ;"
          const subjectWithPredicateMatch = line.match(/^[^:<>]*[:<>][^:<>]*\s+([a-zA-Z0-9_:-]+)\s+/);
          if (subjectWithPredicateMatch) {
            // This line has both subject and predicate - extract the predicate
            const predicate = subjectWithPredicateMatch[1].trim();
            if (predicate && !predicate.startsWith('@') && !predicate.startsWith('#')) {
              const normalized = predicate.replace(/^[a-z]+:/, '').replace(/^:/, '');
              // Special case: handle rdf:type - normalize to 'type'
              if (predicate === 'rdf:type' || predicate === 'a' || normalized === 'type') {
                if (!propertyOrder.includes('type')) {
                  propertyOrder.push('type');
                }
              } else if (!propertyOrder.includes(normalized)) {
                propertyOrder.push(normalized);
              }
            }
            // Check if the line ends with ; or . (property is complete)
            if (line.endsWith(';') || line.endsWith('.')) {
              // Property is complete on this line
              continue; // Move to next line
            } else {
              // Property continues on next line
              inMultiLineValue = true;
              currentPredicate = subjectWithPredicateMatch[1];
            }
          } else {
            // This is just the subject, skip it
            continue;
          }
        }
        
        // Check if this line starts a new property (has a predicate followed by a value)
        // Pattern 1: predicate whitespace value (value on same line)
        // Pattern 2: predicate alone (value on next line)
        const predicateWithValueMatch = line.match(/^([a-zA-Z0-9_:-]+)\s+(.+)$/);
        const predicateAloneMatch = line.match(/^([a-zA-Z0-9_:-]+)\s*$/);
        
        if (predicateWithValueMatch) {
          const predicate = predicateWithValueMatch[1].trim();
          const value = predicateWithValueMatch[2].trim();
          
          // Check if value ends with ; or . (property is complete on this line)
          if (value.endsWith(';') || value.endsWith('.')) {
            // Property is complete
            if (predicate && !predicate.startsWith('@') && !predicate.startsWith('#')) {
              const normalized = predicate.replace(/^[a-z]+:/, '').replace(/^:/, '');
              if (!propertyOrder.includes(normalized)) {
                propertyOrder.push(normalized);
              }
            }
            inMultiLineValue = false;
            currentPredicate = null;
          } else {
            // Property continues on next line
            if (predicate && !predicate.startsWith('@') && !predicate.startsWith('#')) {
              const normalized = predicate.replace(/^[a-z]+:/, '').replace(/^:/, '');
              if (!propertyOrder.includes(normalized)) {
                propertyOrder.push(normalized);
              }
            }
            inMultiLineValue = true;
            currentPredicate = predicate;
          }
        } else if (predicateAloneMatch) {
          // Predicate on its own line, value starts on next line
          const predicate = predicateAloneMatch[1].trim();
          if (predicate && !predicate.startsWith('@') && !predicate.startsWith('#')) {
            const normalized = predicate.replace(/^[a-z]+:/, '').replace(/^:/, '');
            if (!propertyOrder.includes(normalized)) {
              propertyOrder.push(normalized);
            }
          }
          inMultiLineValue = true;
          currentPredicate = predicate;
        } else if (inMultiLineValue && currentPredicate) {
          // Continuation of multi-line property
          // Check if this line ends the property
          if (line.endsWith(';') || line.endsWith('.')) {
            inMultiLineValue = false;
            currentPredicate = null;
          }
        }
      }
      
      if (block.subject && (block.subject.includes('DrawingSheet') || block.subject === ':Class1' || block.subject?.includes('Class1'))) {
        debugLog('[serializeBlockToTurtle]', block.subject, '- propertyOrder extracted:', propertyOrder);
        debugLog('[serializeBlockToTurtle]', block.subject, '- originalText length:', block.originalText.length);
        debugLog('[serializeBlockToTurtle]', block.subject, '- originalText (first 300 chars):', block.originalText.substring(0, 300));
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
      if (propertyOrder.length === 0) {
        if (block.subject && block.subject.includes('DrawingSheet')) {
          debugLog('[serializeBlockToTurtle] DrawingSheet - WARNING: propertyOrder is empty, quads will not be sorted');
        }
        return quads; // No order info, use as-is
      }
      
      if (block.subject && block.subject.includes('DrawingSheet')) {
        debugLog('[serializeBlockToTurtle] DrawingSheet - Sorting', quads.length, 'quads by propertyOrder');
      }
      
      return quads.sort((a, b) => {
        const predA = (a.predicate as { value: string }).value;
        const predB = (b.predicate as { value: string }).value;
        
        // Extract local name for comparison
        const localA = predA.split('#').pop()?.split('/').pop() || predA;
        const localB = predB.split('#').pop()?.split('/').pop() || predB;
        
        // Remove prefix for comparison
        let normA = localA.replace(/^[a-z]+:/, '').replace(/^:/, '');
        let normB = localB.replace(/^[a-z]+:/, '').replace(/^:/, '');
        
        // Special case: 'a' in property order should match rdf:type
        // Also handle 'type' as an alias
        if (normA === 'type' && propertyOrder.includes('a')) {
          normA = 'a';
        }
        if (normB === 'type' && propertyOrder.includes('a')) {
          normB = 'a';
        }
        
        const indexA = propertyOrder.indexOf(normA);
        const indexB = propertyOrder.indexOf(normB);
        
        if (block.subject && block.subject.includes('DrawingSheet')) {
          if (indexA === -1 || indexB === -1) {
            debugLog('[serializeBlockToTurtle] DrawingSheet - Property not in order - normA:', normA, 'indexA:', indexA, 'normB:', normB, 'indexB:', indexB);
          }
        }
        
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
    let totalQuadsAdded = 0;
    const predicatesAdded = new Set<string>();
    for (const quads of quadsBySubject.values()) {
      const sortedQuads = sortQuadsByPropertyOrder(quads);
      for (const quad of sortedQuads) {
        writer.addQuad(quad);
        totalQuadsAdded++;
        const predUri = (quad.predicate as { value: string }).value;
        predicatesAdded.add(predUri);
      }
    }
    
    debugLog('[serializeBlockToTurtle] Serializing', block.quads.length, 'quads, grouped into', quadsBySubject.size, 'subjects, added', totalQuadsAdded, 'quads to writer');
    debugLog('[serializeBlockToTurtle] Predicates in quads:', Array.from(predicatesAdded));
    if (block.subject && (block.subject.includes('DrawingSheet') || block.subject === ':TestClass')) {
      debugLog('[serializeBlockToTurtle]', block.subject, '- quadsBySubject.size:', quadsBySubject.size);
      debugLog('[serializeBlockToTurtle]', block.subject, '- totalQuadsAdded:', totalQuadsAdded);
      debugLog('[serializeBlockToTurtle]', block.subject, '- predicatesAdded:', Array.from(predicatesAdded));
      for (const [subject, quads] of quadsBySubject.entries()) {
        debugLog(`[serializeBlockToTurtle] ${block.subject} - subject "${subject}" has ${quads.length} quads`);
      }
      const subClassOfQuads = block.quads.filter(q => (q.predicate as { value: string }).value.includes('subClassOf'));
      debugLog('[serializeBlockToTurtle] DrawingSheet block - rdfs:subClassOf quads:', subClassOfQuads.length);
      const typeQuads = block.quads.filter(q => (q.predicate as { value: string }).value.includes('type') && (q.object as { value?: string }).value?.includes('Class'));
      debugLog('[serializeBlockToTurtle] DrawingSheet block - rdf:type owl:Class quads:', typeQuads.length);
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
      
      // Debug: Log what N3 Writer produced
      if (block.subject && block.subject.includes('DrawingSheet')) {
        debugLog('[serializeBlockToTurtle] N3 Writer RAW result for DrawingSheet (full):');
        debugLog(JSON.stringify(result));
        debugLog('[serializeBlockToTurtle] N3 Writer result contains rdfs:subClassOf:', result.includes('rdfs:subClassOf') || result.includes('subClassOf'));
        debugLog('[serializeBlockToTurtle] N3 Writer result for DrawingSheet (first 500 chars):', result.substring(0, 500));
        debugLog('[serializeBlockToTurtle] N3 Writer result contains rdfs:subClassOf:', result.includes('rdfs:subClassOf') || result.includes('subClassOf'));
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
      
      if (block.subject && block.subject.includes('DrawingSheet')) {
        debugLog('[serializeBlockToTurtle] result after prefix removal (JSON):');
        debugLog(JSON.stringify(result));
        debugLog('[serializeBlockToTurtle] result length:', result.length);
        debugLog('[serializeBlockToTurtle] result contains rdfs:subClassOf:', result.includes('rdfs:subClassOf'));
        // Also check if rdfs:subClassOf appears in the string
        const subClassOfIndex = result.indexOf('rdfs:subClassOf');
        debugLog('[serializeBlockToTurtle] rdfs:subClassOf index:', subClassOfIndex);
        if (subClassOfIndex >= 0) {
          debugLog('[serializeBlockToTurtle] rdfs:subClassOf context:', result.substring(Math.max(0, subClassOfIndex - 50), Math.min(result.length, subClassOfIndex + 200)));
        }
      }
      
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
              
              if (block.subject && block.subject.includes('DrawingSheet')) {
                debugLog('[serializeBlockToTurtle] Inline forms for DrawingSheet:');
                inlineFormsArray.forEach((form, idx) => {
                  debugLog(`[serializeBlockToTurtle] Inline form ${idx + 1}:`, form);
                  if (form === '[  ]' || form.trim() === '[]') {
                    debugLog(`[serializeBlockToTurtle] ERROR: Inline form ${idx + 1} is EMPTY!`);
                  }
                });
              }
              
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
            
            // CRITICAL: Only proceed with blank node inlining if we have valid (non-empty) inline forms
            // If all inline forms are empty, skip inlining and keep the original blank node references
            const hasValidInlineForms = inlineFormsFromQuads.size > 0 && 
              Array.from(inlineFormsFromQuads.values()).some(form => form.trim() !== '[]' && form.trim() !== '[  ]');
            
            if (hasValidInlineForms) {
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
                  // CRITICAL: Only remove lines that are standalone blank node blocks (e.g., _:df_0_0 a owl:Restriction; ...)
                  // Do NOT remove lines that contain blank node references as objects (e.g., rdfs:subClassOf _:df_0_0, ...)
                  let output = result;
                  const lines = output.split(/\r?\n/);
                  const filteredLines: string[] = [];
                  let i = 0;
                  while (i < lines.length) {
                    const line = lines[i];
                    const trimmed = line.trim();
                    // Only remove lines that START with a blank node reference followed by whitespace and a predicate
                    // This matches standalone blank node blocks like "_:df_0_0 a owl:Restriction;"
                    // But NOT lines like "rdfs:subClassOf _:df_0_0, ..." which have a predicate before the blank node
                    if (trimmed.match(/^_:(df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+)\s+[a-z]/)) {
                      // Skip blank node block - read until we find the period that ends the block
                      if (block.subject && block.subject.includes('DrawingSheet')) {
                        debugLog('[serializeBlockToTurtle] Removing blank node block line:', line);
                      }
                      while (i < lines.length) {
                        const currentLine = lines[i];
                        if (/\.\s*$/.test(currentLine.trim())) {
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
                  if (block.subject && block.subject.includes('DrawingSheet')) {
                    debugLog('[serializeBlockToTurtle] Output after removing blank node blocks (FULL):');
                    debugLog(output);
                    debugLog('[serializeBlockToTurtle] Output length:', output.length);
                    debugLog('[serializeBlockToTurtle] Output contains rdfs:subClassOf:', output.includes('rdfs:subClassOf'));
                    debugLog('[serializeBlockToTurtle] filteredLines count:', filteredLines.length);
                    debugLog('[serializeBlockToTurtle] filteredLines:', filteredLines);
                  }
                  
                  // Log what we're trying to replace
                  const blankRefsInOutput = output.match(/_:df_\d+_\d+|_:n3-\d+/g);
                  debugLog('[serializeBlockToTurtle] Found blank node refs in output:', blankRefsInOutput);
                  debugLog('[serializeBlockToTurtle] Output before replacement (first 200 chars):', output.substring(0, 200));
                  
                  if (block.subject && block.subject.includes('DrawingSheet')) {
                    debugLog('[serializeBlockToTurtle] Output before replacement (FULL):');
                    debugLog(output);
                    debugLog('[serializeBlockToTurtle] structureBasedMatchingWorked:', structureBasedMatchingWorked);
                    debugLog('[serializeBlockToTurtle] outputIdToInlineForm.size:', outputIdToInlineForm.size);
                  }
                  
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
                      const beforeReplace = output;
                      output = output.replace(pattern, inlineForm);
                      if (block.subject && block.subject.includes('DrawingSheet')) {
                        debugLog('[serializeBlockToTurtle] Replacing', ref, 'with inline form');
                        debugLog('[serializeBlockToTurtle] Before:', beforeReplace.substring(0, 300));
                        debugLog('[serializeBlockToTurtle] After:', output.substring(0, 300));
                      }
                      debugLog('[serializeBlockToTurtle] Replaced', ref, 'with inline form');
                    }
                    processedResult = output;
                    if (block.subject && block.subject.includes('DrawingSheet')) {
                      debugLog('[serializeBlockToTurtle] Final processedResult after structure-based replacement:');
                      debugLog(processedResult);
                    }
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
              if (inlineFormsFromQuads.size > 0) {
                debugLog('[serializeBlockToTurtle] WARNING: All inline forms are empty, skipping blank node inlining to preserve rdfs:subClassOf line');
                if (block.subject && block.subject.includes('DrawingSheet')) {
                  debugLog('[serializeBlockToTurtle] Skipping blank node inlining - all inline forms are empty');
                  debugLog('[serializeBlockToTurtle] This means buildInlineForms failed to build inline forms from block.quads');
                  debugLog('[serializeBlockToTurtle] Keeping original blank node references in output');
                }
              } else {
                debugLog('[serializeBlockToTurtle] No inline forms built, using original result');
              }
              // Skip blank node inlining - keep the original blank node references
              // This preserves the rdfs:subClassOf line even if inline forms are empty
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
      
      // Post-process to preserve spacing around semicolons and periods
      // If original text has spaces before semicolons/periods, preserve them
      if (block.originalText) {
        // Check if original has spaces before semicolons (not inside strings or URIs)
        // Look for pattern: closing quote or non-whitespace, then space, then semicolon
        const hasSpaceBeforeSemicolon = block.originalText.match(/["\w]\s+;/);
        if (hasSpaceBeforeSemicolon) {
          // Add spaces before semicolons in formatted output
          // CRITICAL: Only replace semicolons that are at the end of property values
          // Pattern: closing quote or word char, then semicolon (with no space between), then optional whitespace and newline
          // This matches: "value"; or value; but not inside strings
          formatted = formatted.replace(/(["\w])(;\s*)/g, (match, before, after) => {
            // Only add space if there isn't already one
            if (!before.endsWith(' ')) {
              return before + ' ' + after;
            }
            return match;
          });
        }
        // Check if original has spaces before periods (at end of block)
        const hasSpaceBeforePeriod = block.originalText.match(/\s+\.\s*$/);
        if (hasSpaceBeforePeriod) {
          // Add space before period at end (if not already present)
          formatted = formatted.replace(/([^\s])(\.\s*)$/, '$1 .');
        }
      }
      
      // SAFETY CHECK: Verify formatted doesn't contain corrupted "wl:" prefix
      if (formatted.includes('wl:') && !formatted.match(/@prefix\s+wl:/)) {
        debugWarn('[serializeBlockToTurtle] Detected "wl:" corruption in formatted output, attempting to fix');
        formatted = formatted.replace(/\bwl:/g, 'owl:');
      }
      
      if (block.subject && block.subject.includes('DrawingSheet')) {
        debugLog('[serializeBlockToTurtle] processedResult before formatting (FULL):');
        debugLog(processedResult);
        debugLog('[serializeBlockToTurtle] processedResult contains rdfs:subClassOf:', processedResult.includes('rdfs:subClassOf'));
        debugLog('[serializeBlockToTurtle] formatted after formatting (FULL):');
        debugLog(formatted);
        debugLog('[serializeBlockToTurtle] formatted contains rdfs:subClassOf:', formatted.includes('rdfs:subClassOf'));
      }
      
      // CRITICAL: Apply style fixes to match original format (e.g., convert "a" to "rdf:type")
      // This ensures that when we serialize, we match the original style
      // Check if original uses "rdf:type" instead of "a"
      if (block.originalText && block.originalText.includes('rdf:type') && !block.originalText.match(/\s+a\s+/)) {
        // Original uses rdf:type, so convert "a" to "rdf:type" in serialized output
        formatted = formatted.replace(/\s+a\s+(owl|rdf|rdfs|xsd|xml):/g, ' rdf:type $1:');
        formatted = formatted.replace(/\s+a\s+:/g, ' rdf:type :');
        formatted = formatted.replace(/\s+a\s+</g, ' rdf:type <');
      }
      
      if (block.subject && block.subject.includes('DrawingSheet')) {
        debugLog('[serializeBlockToTurtle] Final formatted result:', formatted);
        debugLog('[serializeBlockToTurtle] Final formatted contains rdfs:subClassOf:', formatted.includes('rdfs:subClassOf'));
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
 * Normalize blank node ID for grouping (strip _: prefix so df_0_1 and _:df_0_1 are the same).
 */
function normalizeBlankNodeIdForGrouping(blankId: string): string {
  return blankId.startsWith('_:') ? blankId.slice(2) : blankId;
}

/**
 * Find the cache block that corresponds to the given (possibly modified) block.
 * Used for targeted label replacement: we need the original block to compare restriction structure.
 * Tries exact position+subject match first, then fallback by subject so we still find the block
 * if positions drifted (e.g. due to string normalization or different parse path).
 */
function findOriginalBlockForTargetedReplacement(
  cache: OriginalFileCache,
  block: StatementBlock
): StatementBlock | undefined {
  const exact = cache.statementBlocks.find(
    b =>
      b.position.start === block.position.start &&
      b.position.end === block.position.end &&
      b.subject === block.subject
  );
  if (exact) return exact;

  if (!block.subject) return undefined;

  const bySubject = cache.statementBlocks.filter(b => b.subject === block.subject);
  if (bySubject.length === 1) return bySubject[0];
  if (bySubject.length > 1) {
    // Prefer the block with most quads (main class/entity block) and with originalText
    const withText = bySubject.filter(b => b.originalText && b.originalText.length > 0);
    if (withText.length > 0) {
      return withText.reduce((best, b) => (b.quads.length > (best?.quads?.length ?? 0) ? b : best), withText[0]);
    }
    return bySubject[0];
  }

  const subjectNorm = block.subject.replace(/^:*/, '').replace(/^.*#/, '').replace(/^.*\//, '');
  const byLocalName = cache.statementBlocks.filter(b => {
    if (!b.subject) return false;
    const bNorm = b.subject.replace(/^:*/, '').replace(/^.*#/, '').replace(/^.*\//, '');
    return bNorm === subjectNorm;
  });
  if (byLocalName.length === 1) return byLocalName[0];
  if (byLocalName.length > 1) {
    const withText = byLocalName.filter(b => b.originalText && b.originalText.length > 0);
    if (withText.length > 0) {
      return withText.reduce((best, b) => (b.quads.length > (best?.quads?.length ?? 0) ? b : best), withText[0]);
    }
    return byLocalName[0];
  }
  return undefined;
}

/**
 * Canonical signature for an object term when comparing blank node structure.
 * Uses literal value only (not datatype) so that "0" and "0"^^xsd:nonNegativeInteger
 * match - required for reliable targeted replacement when store/cache quads differ only by literal representation.
 */
function objectSignatureForStructureMatch(obj: N3Quad['object']): string {
  if (obj.termType === 'NamedNode') {
    return (obj as { value: string }).value;
  }
  if (obj.termType === 'Literal') {
    const lit = obj as { value: string; datatype?: { value: string }; language?: string };
    return `"${lit.value}"${lit.language ? `@${lit.language}` : ''}`;
  }
  if (obj.termType === 'BlankNode') {
    return '_:BLANK_PLACEHOLDER';
  }
  return '';
}

/**
 * Compare two blank nodes by structure (compare their quads, not IDs)
 * Returns true if the blank nodes have the same quads (same predicates and objects)
 * For nested blank nodes, we compare by structure recursively (with cycle detection)
 * Literals are compared by value only (datatype ignored) so store vs cache representation differences don't block targeted replacement.
 */
function blankNodesMatchByStructure(
  quads1: N3Quad[],
  quads2: N3Quad[]
): boolean {
  if (quads1.length !== quads2.length) {
    return false;
  }
  
  const signatures1 = new Set(
    quads1.map(q => {
      const pred = (q.predicate as { value: string }).value;
      const obj = objectSignatureForStructureMatch(q.object);
      return `${pred}|${obj}`;
    })
  );
  
  const signatures2 = new Set(
    quads2.map(q => {
      const pred = (q.predicate as { value: string }).value;
      const obj = objectSignatureForStructureMatch(q.object);
      return `${pred}|${obj}`;
    })
  );
  
  if (signatures1.size !== signatures2.size) {
    return false;
  }
  
  for (const sig of signatures1) {
    if (!signatures2.has(sig)) {
      return false;
    }
  }
  
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

// ============================================================================
// Phase 7: Property Line Extraction (for line-level targeted replacement)
// ============================================================================

/**
 * Extract property lines from a statement block.
 * Parses the block's original text to identify individual property lines,
 * matching them to quads in the block.
 * 
 * @param block The statement block to extract property lines from
 * @param cache The original file cache (for resolving prefixed names and accessing content)
 * @returns Array of PropertyLine objects, one for each property in the block
 */
/**
 * Extract sub-properties for multi-line properties (e.g., restrictions in rdfs:subClassOf).
 * For rdfs:subClassOf [ ... ], [ ... ], extracts each [ ... ] as a sub-property.
 */
function extractSubProperties(
  propertyMatch: PropertyLineMatch,
  blockQuads: N3Quad[],
  prefixMap: Map<string, string>,
  blockStartLine: number
): PropertyLine[] | undefined {
  // Extract the value text (everything after predicate)
  const valueText = propertyMatch.rawText.slice(
    propertyMatch.valueStart - propertyMatch.fullStart,
    propertyMatch.valueEnd - propertyMatch.fullStart
  );
  
  // Check if this contains multiple bracket structures (comma-separated restrictions)
  const bracketMatches = Array.from(valueText.matchAll(/\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]/g));
  const bracketStructures: Array<{ text: string; start: number; end: number }> = [];
  
  for (const match of bracketMatches) {
    const bracketStart = propertyMatch.valueStart + match.index!;
    const bracketEnd = bracketStart + match[0].length;
    bracketStructures.push({
      text: match[0],
      start: bracketStart,
      end: bracketEnd
    });
  }
  
  // If we found multiple bracket structures, create sub-properties
  if (bracketStructures.length > 1) {
    const subProperties: PropertyLine[] = [];
    
    for (const bracketStruct of bracketStructures) {
      // Find quads that belong to this restriction (blank node quads)
      // This is simplified - actual implementation would need to match blank nodes more precisely
      const restrictionQuads = blockQuads.filter(q => {
        // Check if quad's object is a blank node that might be in this bracket
        if (q.object.termType === 'BlankNode') {
          // Simplified matching - in real implementation, would parse bracket content
          return true; // Placeholder
        }
        return false;
      });
      
      // Create sub-property line
      const subProperty: PropertyLine = {
        predicate: '[restriction]', // Placeholder
        predicateUri: '', // Will be set based on quads
        position: {
          start: bracketStruct.start,
          end: bracketStruct.end,
          startLine: propertyMatch.lineNumbers[0],
          endLine: propertyMatch.lineNumbers[propertyMatch.lineNumbers.length - 1]
        },
        originalLineText: bracketStruct.text,
        quads: restrictionQuads,
        quadPositions: new Map(),
        isMultiLine: false,
        lineNumbers: propertyMatch.lineNumbers,
        confidence: 0.8, // Lower confidence for sub-properties
        validationErrors: []
      };
      
      subProperties.push(subProperty);
    }
    
    return subProperties.length > 0 ? subProperties : undefined;
  }
  
  return undefined;
}

/**
 * Match quads to a property line by predicate, object value, and proximity.
 */
/**
 * Extract and unescape the string value from a Turtle string literal.
 * Handles escaped quotes, backslashes, and other escape sequences.
 * Returns the unescaped string value, or null if not a string literal.
 */
function extractStringValueFromTurtleLiteral(literalText: string): string | null {
  let text = literalText.trim();
  
  // Check if it's a string literal (starts and ends with quotes)
  let quoteChar: string | null = null;
  if (text.startsWith('"') && text.endsWith('"')) {
    quoteChar = '"';
  } else if (text.startsWith("'") && text.endsWith("'")) {
    quoteChar = "'";
  } else {
    // Not a string literal, might be a URI or prefixed name
    return null;
  }
  
  // Find the closing quote (accounting for escaped quotes)
  let closingQuoteIndex = -1;
  let i = 1; // Start after opening quote
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      // Skip escaped character
      i += 2;
    } else if (text[i] === quoteChar) {
      // Found closing quote
      closingQuoteIndex = i;
      break;
    } else {
      i++;
    }
  }
  
  if (closingQuoteIndex === -1) {
    // Malformed string literal
    return null;
  }
  
  // Extract the string content (between quotes)
  text = text.slice(1, closingQuoteIndex);
  
  // Unescape the string
  // Handle common escape sequences: \" \' \\ \n \r \t
  let result = '';
  i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      switch (next) {
        case '"':
          result += '"';
          i += 2;
          break;
        case "'":
          result += "'";
          i += 2;
          break;
        case '\\':
          result += '\\';
          i += 2;
          break;
        case 'n':
          result += '\n';
          i += 2;
          break;
        case 'r':
          result += '\r';
          i += 2;
          break;
        case 't':
          result += '\t';
          i += 2;
          break;
        default:
          // Unknown escape sequence, keep as is
          result += text[i];
          i++;
          break;
      }
    } else {
      result += text[i];
      i++;
    }
  }
  
  return result;
}

function matchQuadsToProperty(
  propertyMatch: PropertyLineMatch,
  blockQuads: N3Quad[],
  blockSubject: string,
  prefixMap: Map<string, string>,
  blockStartLine: number
): {
  matchedQuads: N3Quad[];
  quadPositions: Map<N3Quad, TextPosition>;
  confidence: number;
  errors: string[];
} {
  const matchedQuads: N3Quad[] = [];
  const quadPositions = new Map<N3Quad, TextPosition>();
  const errors: string[] = [];
  
  // Helper to resolve prefixed name to full URI
  const resolvePrefixedName = (prefixedName: string): string | null => {
    // Special case: 'a' is shorthand for rdf:type
    if (prefixedName === 'a' || prefixedName.trim() === 'a') {
      return 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    }
    if (prefixedName.startsWith('<') && prefixedName.endsWith('>')) {
      return prefixedName.slice(1, -1);
    }
    if (prefixedName.startsWith(':')) {
      const baseUri = prefixMap.get('');
      if (baseUri) {
        return baseUri + prefixedName.slice(1);
      }
    } else if (prefixedName.includes(':')) {
      const [prefix, local] = prefixedName.split(':', 2);
      const baseUri = prefixMap.get(prefix);
      if (baseUri) {
        return baseUri + local;
      }
    }
    return null;
  };
  
  // Resolve predicate URI
  const predicateUri = resolvePrefixedName(propertyMatch.predicate);
  if (!predicateUri) {
    errors.push(`Cannot resolve predicate URI: ${propertyMatch.predicate}`);
    return { matchedQuads, quadPositions, confidence: 0, errors };
  }
  
  // Find quads with matching predicate
  const candidateQuads = blockQuads.filter(q => {
    const qPredUri = (q.predicate as { value: string }).value;
    return qPredUri === predicateUri;
  });
  
  if (candidateQuads.length === 0) {
    errors.push(`No quads found for predicate: ${propertyMatch.predicate} (${predicateUri})`);
    return { matchedQuads, quadPositions, confidence: 0, errors };
  }
  
  // Extract value from property text to match against quad objects
  // The value text includes everything from valueStart to valueEnd, which may include comma-separated values
  const valueText = propertyMatch.rawText.slice(
    propertyMatch.valueStart - propertyMatch.fullStart,
    propertyMatch.valueEnd - propertyMatch.fullStart
  ).trim();
  
  // For comma-separated values, we need to match any of the values
  // Split by comma to get individual values
  const individualValues = valueText.split(',').map(v => v.trim()).filter(v => v.length > 0);
  
  // Match quads by object value and proximity
  const matches: Array<{ quad: N3Quad; score: number; position: TextPosition }> = [];
  
  for (const quad of candidateQuads) {
    // Extract object value from quad
    let objectValue: string | null = null;
    let objectValueSimple: string | null = null; // Just the value part for matching
    if (quad.object.termType === 'Literal') {
      const lit = quad.object as { value: string; language?: string; datatype?: { value: string } };
      objectValueSimple = lit.value; // Just the value for matching
      objectValue = lit.value;
      if (lit.language) {
        objectValue = `"${objectValue}"@${lit.language}`;
      } else if (lit.datatype) {
        // Try to find prefixed form for datatype
        const datatypeUri = lit.datatype.value;
        let datatypePrefixed = datatypeUri;
        for (const [prefix, namespace] of prefixMap.entries()) {
          if (datatypeUri.startsWith(namespace)) {
            const local = datatypeUri.slice(namespace.length);
            datatypePrefixed = prefix ? `${prefix}:${local}` : `:${local}`;
            break;
          }
        }
        objectValue = `"${objectValue}"^^${datatypePrefixed}`;
      } else {
        objectValue = `"${objectValue}"`;
      }
    } else if (quad.object.termType === 'NamedNode') {
      const uri = (quad.object as { value: string }).value;
      // Try to find prefixed form
      let prefixed = uri;
      for (const [prefix, namespace] of prefixMap.entries()) {
        if (uri.startsWith(namespace)) {
          const local = uri.slice(namespace.length);
          prefixed = prefix ? `${prefix}:${local}` : `:${local}`;
          break;
        }
      }
      objectValue = prefixed;
      objectValueSimple = prefixed;
    } else if (quad.object.termType === 'BlankNode') {
      // For blank nodes, we match by structure (presence in brackets)
      // Check if value text contains bracket structures [ ... ]
      // Blank nodes are always represented as [ ... ] in Turtle, so if the value text has brackets,
      // we can match by position/proximity
      const hasBrackets = /\[[\s\S]*?\]/.test(valueText);
      if (hasBrackets) {
        // Value text contains brackets, so this quad likely matches this property line
        // We'll use proximity-based matching (all blank node quads for this predicate will match)
        objectValue = '[blank]'; // Placeholder for matching
        objectValueSimple = '[blank]';
      } else {
        // No brackets in value text, can't match
        objectValue = null;
        objectValueSimple = null;
      }
    }
    
    // Check if object value appears in property text
    // For comma-separated values, check against each individual value
    let valueMatches = false;
    if (objectValue) {
      if (quad.object.termType === 'BlankNode') {
        // For blank nodes, if value text has brackets, it's a match (we already checked above)
        valueMatches = /\[[\s\S]*?\]/.test(valueText);
      } else {
        // For literals, try to extract the unescaped string value from the value text
        if (quad.object.termType === 'Literal' && objectValueSimple) {
          // Try to extract string value from value text
          const extractedValue = extractStringValueFromTurtleLiteral(valueText);
          if (extractedValue === objectValueSimple) {
            valueMatches = true;
          } else {
            // Fallback: check if the unescaped value appears anywhere in the value text
            // This handles cases where the value text might have additional formatting
            const normalizedValueText = extractStringValueFromTurtleLiteral(valueText) || valueText;
            valueMatches = normalizedValueText === objectValueSimple ||
                          normalizedValueText.includes(objectValueSimple);
          }
        }
        
        // Also check against full formatted value (with quotes, datatypes, etc.)
        if (!valueMatches) {
          valueMatches = valueText.includes(objectValue) || 
                         (objectValueSimple && valueText.includes(`"${objectValueSimple}"`)) ||
                         (objectValueSimple && valueText.includes(objectValueSimple));
        }
        
        // Also check against individual comma-separated values
        if (!valueMatches && individualValues.length > 0) {
          for (const individualValue of individualValues) {
            // Try extracting unescaped value from individual value
            const extractedIndividual = extractStringValueFromTurtleLiteral(individualValue);
            if (extractedIndividual === objectValueSimple || 
                individualValue === objectValue || 
                individualValue === objectValueSimple ||
                (objectValueSimple && individualValue.includes(objectValueSimple)) ||
                (objectValueSimple && individualValue === `"${objectValueSimple}"`)) {
              valueMatches = true;
              break;
            }
          }
        }
      }
    }
    
    // Only add to matches if value matches (for blank nodes, this means value text has brackets)
    if (valueMatches) {
      // Calculate proximity score
      const expectedPosition = propertyMatch.valueStart;
      const proximityScore = calculateProximity(
        {
          start: propertyMatch.fullStart,
          end: propertyMatch.fullEnd,
          startLine: propertyMatch.lineNumbers[0],
          endLine: propertyMatch.lineNumbers[propertyMatch.lineNumbers.length - 1]
        },
        expectedPosition,
        quad,
        blockStartLine
      );
      
      // Estimate quad position within property (simplified - actual would parse value text)
      const quadPosition: TextPosition = {
        start: propertyMatch.valueStart,
        end: propertyMatch.valueEnd,
        startLine: propertyMatch.lineNumbers[0],
        endLine: propertyMatch.lineNumbers[propertyMatch.lineNumbers.length - 1]
      };
      
      matches.push({ quad, score: proximityScore, position: quadPosition });
    }
  }
  
  // Sort by score (lower = better/closer)
  matches.sort((a, b) => a.score - b.score);
  
  // Take best matches (within same block, all are valid)
  for (const match of matches) {
    matchedQuads.push(match.quad);
    quadPositions.set(match.quad, match.position);
  }
  
  // Calculate confidence (1.0 if exact match, lower if approximate)
  let confidence = 1.0;
  if (matches.length > 1) {
    // Multiple matches - lower confidence
    confidence = 0.8;
  }
  if (matches.length === 0) {
    confidence = 0.0;
  }
  
  return { matchedQuads, quadPositions, confidence, errors };
}

/**
 * Calculate proximity score between property position and expected quad position.
 * Lower score = closer match.
 */
function calculateProximity(
  propertyPosition: TextPosition,
  expectedQuadPosition: number,
  quad: N3Quad,
  blockStartLine: number
): number {
  // Character distance
  const charDistance = Math.abs(propertyPosition.start - expectedQuadPosition);
  
  // Line distance (approximate)
  const propertyLine = propertyPosition.startLine;
  const expectedLine = blockStartLine + Math.floor(expectedQuadPosition / 80); // Approximate 80 chars per line
  const lineDistance = Math.abs(propertyLine - expectedLine);
  
  // Combine metrics (weighted)
  const score = charDistance * 0.5 + lineDistance * 100;
  
  return score;
}

/**
 * Validate property lines for overlaps and other issues.
 */
function validatePropertyLines(
  propertyLines: PropertyLine[],
  blockQuads: N3Quad[]
): string[] {
  const errors: string[] = [];
  
  // Check for overlaps
  for (let i = 0; i < propertyLines.length; i++) {
    for (let j = i + 1; j < propertyLines.length; j++) {
      const p1 = propertyLines[i];
      const p2 = propertyLines[j];
      const overlaps = !(p1.position.end <= p2.position.start || p2.position.end <= p1.position.start);
      if (overlaps) {
        errors.push(
          `Property line overlap: ${p1.predicate} (${p1.position.start}-${p1.position.end}) overlaps with ${p2.predicate} (${p2.position.start}-${p2.position.end})`
        );
      }
    }
  }
  
  // Check for properties with no matching quads
  for (const propLine of propertyLines) {
    if (propLine.quads.length === 0) {
      errors.push(`Property line has no matching quads: ${propLine.predicate} at line ${propLine.position.startLine}`);
    }
  }
  
  // Check for unmatched quads
  const matchedQuads = new Set<N3Quad>();
  for (const propLine of propertyLines) {
    for (const quad of propLine.quads) {
      matchedQuads.add(quad);
    }
  }
  
  for (const quad of blockQuads) {
    if (!matchedQuads.has(quad)) {
      const predUri = (quad.predicate as { value: string }).value;
      const objValue = quad.object.termType === 'Literal' 
        ? (quad.object as { value: string }).value 
        : quad.object.termType === 'NamedNode'
        ? (quad.object as { value: string }).value
        : 'blank';
      errors.push(
        `Quad cannot be matched to any property line: predicate=${predUri}, object=${objValue}`
      );
    }
  }
  
  // Check for duplicate matches (multiple quads match same property)
  for (const propLine of propertyLines) {
    if (propLine.quads.length > 1) {
      // Check if all quads have same predicate and object (duplicates)
      const firstQuad = propLine.quads[0];
      const allSame = propLine.quads.every(q => {
        const predMatch = (q.predicate as { value: string }).value === (firstQuad.predicate as { value: string }).value;
        const objMatch = q.object.value === firstQuad.object.value;
        return predMatch && objMatch;
      });
      
      if (allSame) {
        errors.push(`Multiple identical quads match same property line: ${propLine.predicate}`);
      }
    }
  }
  
  // Check for quads matching multiple properties
  const quadToProperties = new Map<N3Quad, PropertyLine[]>();
  for (const propLine of propertyLines) {
    for (const quad of propLine.quads) {
      if (!quadToProperties.has(quad)) {
        quadToProperties.set(quad, []);
      }
      quadToProperties.get(quad)!.push(propLine);
    }
  }
  
  for (const [quad, props] of quadToProperties.entries()) {
    if (props.length > 1) {
      const predUri = (quad.predicate as { value: string }).value;
      errors.push(
        `Quad matches multiple property lines: predicate=${predUri}, matches=${props.map(p => p.predicate).join(', ')}`
      );
    }
  }
  
  return errors;
}

export function extractPropertyLines(
  block: StatementBlock,
  cache: OriginalFileCache
): PropertyLine[] {
  // Check cache first (lazy evaluation)
  if (block._cachedPropertyLines) {
    return block._cachedPropertyLines;
  }
  
  if (!block.originalText) {
    return [];
  }

  const blockText = block.originalText;
  const blockQuads = block.quads;

  // Extract prefix map for resolving prefixed names
  const prefixMap = new Map<string, string>();
  if (cache.headerSection) {
    for (const headerBlock of cache.headerSection.blocks) {
      if (headerBlock.originalText) {
        const prefixMatch = headerBlock.originalText.match(/@prefix\s+(\w+):\s*<([^>]+)>/);
        if (prefixMatch) {
          prefixMap.set(prefixMatch[1], prefixMatch[2]);
        }
        const emptyPrefixMatch = headerBlock.originalText.match(/@prefix\s+:\s*<([^>]+)>/);
        if (emptyPrefixMatch) {
          prefixMap.set('', emptyPrefixMatch[1]);
        }
      }
    }
  }

  // Step 1: Parse block text using state machine
  const propertyMatches = parsePropertyLinesWithStateMachine(
    blockText,
    block.position.start,
    block.position.startLine
  );
  
  debugLog(`[extractPropertyLines] Parsed ${propertyMatches.length} property matches from text`);

  // Step 2: Match quads to properties (parallel processing)
  const propertyLines: PropertyLine[] = [];
  const allValidationErrors: string[] = [];
  
  for (const propMatch of propertyMatches) {
    // Match quads to this property
    const matchResult = matchQuadsToProperty(
      propMatch,
      blockQuads,
      block.subject || '',
      prefixMap,
      block.position.startLine
    );
    
    // For properties with blank node objects (like rdfs:subClassOf [ ... ]), 
    // also include the quads where those blank nodes are subjects
    const allMatchedQuads = [...matchResult.matchedQuads];
    const allQuadPositions = new Map(matchResult.quadPositions);
    
    // Find blank node IDs from matched quads
    const blankNodeIds = new Set<string>();
    for (const quad of matchResult.matchedQuads) {
      if (quad.object.termType === 'BlankNode') {
        const blankId = (quad.object as { id?: string; value?: string }).id || 
                        (quad.object as { id?: string; value?: string }).value || '';
        if (blankId) {
          blankNodeIds.add(blankId.startsWith('_:') ? blankId.slice(2) : blankId);
        }
      }
    }
    
    // Find all quads where these blank nodes are subjects
    for (const blankId of blankNodeIds) {
      for (const quad of blockQuads) {
        if (quad.subject.termType === 'BlankNode') {
          const subjectBlankId = (quad.subject as { id?: string; value?: string }).id || 
                                 (quad.subject as { id?: string; value?: string }).value || '';
          const cleanSubjectId = subjectBlankId.startsWith('_:') ? subjectBlankId.slice(2) : subjectBlankId;
          if (cleanSubjectId === blankId) {
            // This quad belongs to the blank node structure in this property
            if (!allMatchedQuads.some(q => q.equals(quad))) {
              allMatchedQuads.push(quad);
              // Use the same position as the property line for blank node quads
              allQuadPositions.set(quad, {
                start: propMatch.valueStart,
                end: propMatch.valueEnd,
                startLine: propMatch.lineNumbers[0],
                endLine: propMatch.lineNumbers[propMatch.lineNumbers.length - 1]
              });
            }
          }
        }
      }
    }
    
    // Calculate position relative to full content
    const position: TextPosition = {
      start: propMatch.fullStart,
      end: propMatch.fullEnd,
      startLine: propMatch.lineNumbers[0],
      endLine: propMatch.lineNumbers[propMatch.lineNumbers.length - 1]
    };
    
    // Helper to resolve prefixed name to full URI (local function)
    const resolvePrefixedNameLocal = (prefixedName: string): string => {
      if (prefixedName.startsWith('<') && prefixedName.endsWith('>')) {
        return prefixedName.slice(1, -1);
      }
      if (prefixedName.includes(':')) {
        const [prefix, local] = prefixedName.split(':', 2);
        const namespace = prefixMap.get(prefix);
        if (namespace) {
          return namespace + (namespace.endsWith('#') || namespace.endsWith('/') ? '' : '#') + local;
        }
      }
      // Default namespace (empty prefix)
      const defaultNamespace = prefixMap.get('') || '';
      return defaultNamespace + (defaultNamespace.endsWith('#') || defaultNamespace.endsWith('/') ? '' : '#') + prefixedName;
    };
    
    // Resolve predicate URI
    const predicateUri = matchResult.matchedQuads.length > 0 
      ? (matchResult.matchedQuads[0].predicate as { value: string }).value
      : resolvePrefixedNameLocal(propMatch.predicate);
    
    // Extract sub-properties for multi-line properties (restrictions)
    const subProperties = propMatch.isMultiLine 
      ? extractSubProperties(propMatch, blockQuads, prefixMap, block.position.startLine)
      : undefined;
    
    // Create PropertyLine
    const propertyLine: PropertyLine = {
      predicate: propMatch.predicate,
      predicateUri,
      position,
      originalLineText: propMatch.rawText,
      quads: allMatchedQuads, // Include blank node quads
      quadPositions: allQuadPositions, // Include blank node quad positions
      isMultiLine: propMatch.isMultiLine,
      lineNumbers: propMatch.lineNumbers,
      confidence: matchResult.confidence,
      validationErrors: matchResult.errors,
      subProperties
    };
    
    propertyLines.push(propertyLine);
    allValidationErrors.push(...matchResult.errors);
  }
  
  // Step 3: Cross-validate
  const validationErrors = validatePropertyLines(propertyLines, blockQuads);
  allValidationErrors.push(...validationErrors);
  
  // Add validation errors to property lines
  for (const propLine of propertyLines) {
    const relevantErrors = validationErrors.filter(e => 
      e.includes(propLine.predicate) || e.includes('overlap')
    );
    propLine.validationErrors.push(...relevantErrors);
  }
  
  // Step 4: If there are critical errors, throw PropertyLineExtractionError
  const criticalErrors = allValidationErrors.filter(e => 
    e.includes('overlap') || 
    e.includes('cannot be matched') || 
    e.includes('no matching quads')
  );
  
  if (criticalErrors.length > 0) {
    throw new PropertyLineExtractionError(
      `Property line extraction failed: ${criticalErrors.join('; ')}`,
      block,
      propertyLines,
      blockQuads,
      allValidationErrors
    );
  }
  
  // Cache result
  block._cachedPropertyLines = propertyLines;
  
  debugLog(`[extractPropertyLines] Extracted ${propertyLines.length} property lines with ${allValidationErrors.length} validation warnings`);
  
  return propertyLines;
}

/**
 * Change set for a property line.
 */
export interface PropertyLineChangeSet {
  propertyLine: PropertyLine;
  newQuads: N3Quad[];
  removedQuads: N3Quad[];
}

/**
 * Error class for property line extraction issues.
 */
export class PropertyLineExtractionError extends Error {
  constructor(
    message: string,
    public block: StatementBlock,
    public propertyLines?: PropertyLine[],
    public quads?: N3Quad[],
    public validationErrors?: string[]
  ) {
    super(message);
    this.name = 'PropertyLineExtractionError';
  }
}

/**
 * Detect property-level changes by comparing current store with cache.
 * Returns a map of changed property lines with their change sets.
 * 
 * @param store The current store with modifications
 * @param cache The original file cache
 * @returns Map of PropertyLine to PropertyLineChangeSet
 */
export function detectPropertyLevelChanges(
  store: Store,
  cache: OriginalFileCache
): Map<PropertyLine, PropertyLineChangeSet> {
  const changes = new Map<PropertyLine, PropertyLineChangeSet>();
  
  // Build a map of current quads by subject and predicate
  const currentQuadsBySubjectAndPred = new Map<string, Map<string, N3Quad[]>>();
  for (const quad of store) {
    if (quad.subject.termType === 'NamedNode') {
      const subjectUri = (quad.subject as { value: string }).value;
      const predUri = (quad.predicate as { value: string }).value;
      
      if (!currentQuadsBySubjectAndPred.has(subjectUri)) {
        currentQuadsBySubjectAndPred.set(subjectUri, new Map());
      }
      const predMap = currentQuadsBySubjectAndPred.get(subjectUri)!;
      
      if (!predMap.has(predUri)) {
        predMap.set(predUri, []);
      }
      predMap.get(predUri)!.push(quad);
    }
  }

  // Extract prefix map for resolving prefixed names
  const prefixMap = new Map<string, string>();
  if (cache.headerSection) {
    for (const block of cache.headerSection.blocks) {
      if (block.originalText) {
        const prefixMatch = block.originalText.match(/@prefix\s+(\w+):\s*<([^>]+)>/);
        if (prefixMatch) {
          prefixMap.set(prefixMatch[1], prefixMatch[2]);
        }
        const emptyPrefixMatch = block.originalText.match(/@prefix\s+:\s*<([^>]+)>/);
        if (emptyPrefixMatch) {
          prefixMap.set('', emptyPrefixMatch[1]);
        }
      }
    }
  }

  // Helper to resolve prefixed name to full URI
  const resolvePrefixedName = (prefixedName: string): string => {
    if (prefixedName.startsWith('<') && prefixedName.endsWith('>')) {
      return prefixedName.slice(1, -1);
    }
    if (prefixedName.includes(':')) {
      const [prefix, local] = prefixedName.split(':', 2);
      const namespace = prefixMap.get(prefix);
      if (namespace) {
        return namespace + (namespace.endsWith('#') || namespace.endsWith('/') ? '' : '#') + local;
      }
    }
    const defaultNamespace = prefixMap.get('') || '';
    return defaultNamespace + (defaultNamespace.endsWith('#') || defaultNamespace.endsWith('/') ? '' : '#') + prefixedName;
  };

  // For each block in cache, extract property lines and compare with current store
  for (const block of cache.statementBlocks) {
    if (block.type !== 'Class' && block.type !== 'ObjectProperty' && block.type !== 'DatatypeProperty' && block.type !== 'AnnotationProperty') {
      continue; // Only process class and property blocks
    }

    const subjectPrefixedName = block.subject;
    if (!subjectPrefixedName) {
      continue;
    }

    // Resolve prefixed name to full URI
    const subjectUri = resolvePrefixedName(subjectPrefixedName);
    if (!subjectUri) {
      debugWarn('[detectPropertyLevelChanges] Failed to resolve subject:', subjectPrefixedName);
      continue;
    }

    // Extract property lines from this block
    const propertyLines = extractPropertyLines(block, cache);
    
    // Get current quads for this subject (using full URI)
    const currentPredMap = currentQuadsBySubjectAndPred.get(subjectUri);
    
    // For each property line, check if it has changed
    for (const propLine of propertyLines) {
      const currentQuads = currentPredMap?.get(propLine.predicateUri) || [];
      const originalQuads = propLine.quads;
      
      // Compare quads to see if changed
      // For blank nodes, we need to compare by structure, not by ID (IDs change after re-parsing)
      // Build maps of blank node quads for structure comparison
      const getBlankNodeQuads = (blankId: string, quads: N3Quad[]): N3Quad[] => {
        // Find all quads where this blank node is the subject
        return quads.filter(q => {
          if (q.subject.termType !== 'BlankNode') return false;
          const qBlankId = (q.subject as { id?: string; value?: string }).id || (q.subject as { id?: string; value?: string }).value || '';
          const cleanBlankId = blankId.startsWith('_:') ? blankId.slice(2) : blankId;
          const cleanQBlankId = qBlankId.startsWith('_:') ? qBlankId.slice(2) : qBlankId;
          return cleanBlankId === cleanQBlankId;
        });
      };
      
      // Helper to create a signature for a quad that handles blank nodes by structure
      const createQuadSignature = (q: N3Quad, allQuads: N3Quad[]): string => {
        const subj = q.subject.termType === 'NamedNode' ? (q.subject as { value: string }).value : 
                     q.subject.termType === 'BlankNode' ? `[BLANK_STRUCT]` : '';
        const pred = (q.predicate as { value: string }).value;
        let obj: string;
        if (q.object.termType === 'NamedNode') {
          obj = (q.object as { value: string }).value;
        } else if (q.object.termType === 'BlankNode') {
          // For blank nodes, create a structure signature from all quads
          const blankId = (q.object as { id?: string; value?: string }).id || (q.object as { id?: string; value?: string }).value || '';
          const blankQuads = getBlankNodeQuads(blankId, allQuads);
          // Create a signature based on the blank node's properties (sorted for consistency)
          const blankProps = blankQuads.map(bq => {
            const bp = (bq.predicate as { value: string }).value;
            let bo: string;
            if (bq.object.termType === 'NamedNode') {
              bo = (bq.object as { value: string }).value;
            } else if (bq.object.termType === 'Literal') {
              const lit = bq.object as { value: string; datatype?: { value: string }; language?: string };
              bo = `"${lit.value}"${lit.language ? `@${lit.language}` : lit.datatype ? `^^${lit.datatype.value}` : ''}`;
            } else {
              bo = '[BLANK]';
            }
            return `${bp}|${bo}`;
          }).sort().join(';');
          obj = `[BLANK_STRUCT:${blankProps}]`;
        } else {
          const lit = q.object as { value: string; datatype?: { value: string }; language?: string };
          obj = `"${lit.value}"${lit.language ? `@${lit.language}` : lit.datatype ? `^^${lit.datatype.value}` : ''}`;
        }
        return `${subj}|${pred}|${obj}`;
      };
      
      // For original quads, use block.quads to get blank node structure
      // For current quads, we need to get blank node quads from the store
      // But we can't easily get all blank node quads from store for a specific blank node
      // So we'll use a simpler approach: compare by matching blank nodes structurally
      
      // If either set has blank nodes, use structural comparison
      const originalHasBlanks = originalQuads.some(q => q.object.termType === 'BlankNode');
      const currentHasBlanks = currentQuads.some(q => q.object.termType === 'BlankNode');
      
      let hasChanges: boolean;
      if (originalHasBlanks || currentHasBlanks) {
        // For blank nodes, we need to match structures, not IDs
        // Group quads by blank node structure
        const originalBlanks = new Map<string, N3Quad[]>();
        const currentBlanks = new Map<string, N3Quad[]>();
        
        // Extract blank node quads from block.quads for original
        for (const q of originalQuads) {
          if (q.object.termType === 'BlankNode') {
            const blankId = (q.object as { id?: string; value?: string }).id || (q.object as { id?: string; value?: string }).value || '';
            const blankQuads = getBlankNodeQuads(blankId, block.quads);
            const structSig = createQuadSignature(q, block.quads);
            if (!originalBlanks.has(structSig)) {
              originalBlanks.set(structSig, []);
            }
            originalBlanks.get(structSig)!.push(q);
          }
        }
        
        // For current quads, get blank node quads from store
        for (const q of currentQuads) {
          if (q.object.termType === 'BlankNode') {
            const blankId = (q.object as { id?: string; value?: string }).id || (q.object as { id?: string; value?: string }).value || '';
            const cleanBlankId = blankId.startsWith('_:') ? blankId.slice(2) : blankId;
            const blankNode = DataFactory.blankNode(cleanBlankId);
            const blankQuads = store.getQuads(blankNode, null, null, null);
            // Create a combined array of all quads for signature generation
            const allQuadsForSig = [...currentQuads, ...blankQuads];
            const structSig = createQuadSignature(q, allQuadsForSig);
            if (!currentBlanks.has(structSig)) {
              currentBlanks.set(structSig, []);
            }
            currentBlanks.get(structSig)!.push(q);
          }
        }
        
        // Compare non-blank quads
        const originalNonBlanks = originalQuads.filter(q => q.object.termType !== 'BlankNode');
        const currentNonBlanks = currentQuads.filter(q => q.object.termType !== 'BlankNode');
        const nonBlankChanged = originalNonBlanks.length !== currentNonBlanks.length ||
          originalNonBlanks.some(oq => !currentNonBlanks.some(cq => 
            oq.subject.termType === cq.subject.termType &&
            (oq.subject as { value: string }).value === (cq.subject as { value: string }).value &&
            (oq.predicate as { value: string }).value === (cq.predicate as { value: string }).value &&
            oq.object.termType === cq.object.termType &&
            (oq.object.termType === 'NamedNode' ? (oq.object as { value: string }).value === (cq.object as { value: string }).value :
             oq.object.termType === 'Literal' ? (oq.object as { value: string }).value === (cq.object as { value: string }).value : false)
          ));
        
        // Compare blank node structures
        const blankChanged = originalBlanks.size !== currentBlanks.size ||
          [...originalBlanks.keys()].some(sig => !currentBlanks.has(sig));
        
        hasChanges = nonBlankChanged || blankChanged;
      } else {
        // No blank nodes - simple comparison
        const originalQuadSet = new Set(originalQuads.map(q => {
          const subj = q.subject.termType === 'NamedNode' ? (q.subject as { value: string }).value : '';
          const pred = (q.predicate as { value: string }).value;
          const obj = q.object.termType === 'NamedNode' ? (q.object as { value: string }).value :
                     q.object.termType === 'Literal' ? `"${(q.object as { value: string }).value}"` : '';
          return `${subj}|${pred}|${obj}`;
        }));
        const currentQuadSet = new Set(currentQuads.map(q => {
          const subj = q.subject.termType === 'NamedNode' ? (q.subject as { value: string }).value : '';
          const pred = (q.predicate as { value: string }).value;
          const obj = q.object.termType === 'NamedNode' ? (q.object as { value: string }).value :
                     q.object.termType === 'Literal' ? `"${(q.object as { value: string }).value}"` : '';
          return `${subj}|${pred}|${obj}`;
        }));
        hasChanges = originalQuadSet.size !== currentQuadSet.size ||
          [...originalQuadSet].some(sig => !currentQuadSet.has(sig)) ||
          [...currentQuadSet].some(sig => !originalQuadSet.has(sig));
      }
      
      if (hasChanges) {
        // Find removed quads (in original but not in current)
        // For blank nodes, we can't easily determine removed quads, so we'll use a simpler approach
        const removedQuads: N3Quad[] = [];
        if (!originalHasBlanks && !currentHasBlanks) {
          // No blank nodes - can use simple signature matching
          const currentQuadSet = new Set(currentQuads.map(q => {
            const subj = q.subject.termType === 'NamedNode' ? (q.subject as { value: string }).value : '';
            const pred = (q.predicate as { value: string }).value;
            const obj = q.object.termType === 'NamedNode' ? (q.object as { value: string }).value :
                       q.object.termType === 'Literal' ? `"${(q.object as { value: string }).value}"` : '';
            return `${subj}|${pred}|${obj}`;
          }));
          for (const q of originalQuads) {
            const sig = `${q.subject.termType === 'NamedNode' ? (q.subject as { value: string }).value : ''}|${(q.predicate as { value: string }).value}|${q.object.termType === 'NamedNode' ? (q.object as { value: string }).value : q.object.termType === 'Literal' ? `"${(q.object as { value: string }).value}"` : ''}`;
            if (!currentQuadSet.has(sig)) {
              removedQuads.push(q);
            }
          }
        }
        // For blank nodes, we don't track removed quads individually (too complex)
        
        changes.set(propLine, {
          propertyLine: propLine,
          newQuads: currentQuads,
          removedQuads
        });
      }
    }
  }
  
  return changes;
}

/**
 * Check if a property change is simple (can use targeted line replacement).
 * Simple changes are:
 * - Only one property affected
 * - No blank nodes (or blank nodes unchanged)
 * - Property is single-line (not multi-line restrictions)
 * - Can be safely replaced without affecting other lines
 */
export function isSimplePropertyChange(
  propertyLine: PropertyLine,
  changeSet: PropertyLineChangeSet
): boolean {
  // Multi-line properties are complex (e.g., restrictions)
  if (propertyLine.isMultiLine) {
    return false;
  }
  
  // If blank nodes are involved in the NEW quads, it's complex
  // But if blank nodes are only in the ORIGINAL quads and unchanged, we can still use targeted replacement
  const newQuadsHaveBlankNodes = changeSet.newQuads.some(q => 
    q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode'
  );
  const originalQuadsHaveBlankNodes = changeSet.propertyLine.quads.some(q =>
    q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode'
  );
  
  // If new quads have blank nodes, it's complex
  if (newQuadsHaveBlankNodes) {
    return false;
  }
  
  // If original had blank nodes but new doesn't, that's a removal - complex
  if (originalQuadsHaveBlankNodes && !newQuadsHaveBlankNodes) {
    return false;
  }
  
  // Single property, single-line, no blank nodes = simple
  return true;
}

/**
 * Perform targeted line replacement for simple property changes.
 * Only replaces the affected property lines, preserving all other lines exactly.
 * 
 * @param cache The original file cache
 * @param changedPropertyLines Map of PropertyLine to PropertyLineChangeSet
 * @returns Modified file content with only affected lines changed
 */
export function performTargetedLineReplacement(
  cache: OriginalFileCache,
  changedPropertyLines: Map<PropertyLine, PropertyLineChangeSet>
): string {
  let result = cache.content;
  
  debugLog('[performTargetedLineReplacement] Starting with', changedPropertyLines.size, 'property changes');
  try {
    for (const [propLine, changeSet] of changedPropertyLines.entries()) {
      debugLog('[performTargetedLineReplacement] Change:', propLine.predicate, 'newQuads:', changeSet?.newQuads?.length ?? 0, 'oldQuads:', changeSet?.oldQuads?.length ?? 0);
    }
  } catch (error) {
    console.error('[performTargetedLineReplacement] Error in initial loop:', error);
  }
  
  // Sort changes by position (end to start) to preserve positions during replacement
  let sortedChanges: Array<[PropertyLine, PropertyLineChangeSet]>;
  try {
    sortedChanges = Array.from(changedPropertyLines.entries())
      .sort((a, b) => b[0].position.end - a[0].position.end);
    debugLog('[performTargetedLineReplacement] Sorted changes count:', sortedChanges.length);
  } catch (error) {
    console.error('[performTargetedLineReplacement] Error sorting changes:', error);
    return cache.content;
  }
  if (sortedChanges.length === 0) {
    debugLog('[performTargetedLineReplacement] WARNING: sortedChanges is empty, returning unchanged content');
    return cache.content;
  }
  
  for (const [propertyLine, changeSet] of sortedChanges) {
    debugLog('[performTargetedLineReplacement] Processing change for:', propertyLine.predicate);
    debugLog('[performTargetedLineReplacement] Position:', propertyLine.position.start, '-', propertyLine.position.end);
    debugLog('[performTargetedLineReplacement] Line numbers:', propertyLine.lineNumbers);
    // Debug: Check what text is at this position
    const textAtPosition = cache.content.substring(propertyLine.position.start, Math.min(propertyLine.position.start + 100, cache.content.length));
    debugLog('[performTargetedLineReplacement] Text at position:', JSON.stringify(textAtPosition.substring(0, 80)));
    debugLog('[performTargetedLineReplacement] originalLineText:', JSON.stringify(propertyLine.originalLineText.substring(0, 80)));
    // Serialize the new property value
    // For simple changes, we can serialize just the property line
    const newQuads = changeSet.newQuads;
    
    if (newQuads.length === 0) {
      // Property was removed - remove the line
      const lineStart = propertyLine.position.start;
      const lineEnd = propertyLine.position.end;
      
      // Find the end of the line (including trailing comma/semicolon and whitespace)
      let actualEnd = lineEnd;
      const afterLine = result.slice(lineEnd);
      const lineEndMatch = afterLine.match(/^([,;]?\s*)/);
      if (lineEndMatch) {
        actualEnd = lineEnd + lineEndMatch[0].length;
      }
      
      // Remove the line
      result = result.slice(0, lineStart) + result.slice(actualEnd);
      continue;
    }
    
    // Serialize the new property value
    // Use a simple serialization approach for single property
    const firstQuad = newQuads[0];
    const predicate = propertyLine.predicate;
    const object = firstQuad.object;
    
    let newValue = '';
    if (object.termType === 'Literal') {
      const lit = object as { value: string; datatype?: { value: string }; language?: string };
      const value = lit.value;
      // CRITICAL: For simple property changes, preserve the original format
      // If the original had no datatype, don't add one
      // Check the original property line to see if it had a datatype
      const originalValue = propertyLine.originalLineText;
      const hasDatatypeInOriginal = originalValue.includes('^^');
      const hasLanguageInOriginal = originalValue.includes('@') && !originalValue.includes('^^');
      
      if (lit.language) {
        newValue = `"${value}"@${lit.language}`;
      } else if (lit.datatype && hasDatatypeInOriginal) {
        // Only include datatype if original had one
        const datatype = lit.datatype.value;
        // Try to find prefixed form
        let datatypePrefixed = datatype;
        // Check if we can use a prefix
        if (cache.headerSection) {
          for (const block of cache.headerSection.blocks) {
            if (block.originalText) {
              const xsdMatch = block.originalText.match(/@prefix\s+xsd:\s*<([^>]+)>/);
              if (xsdMatch && datatype.startsWith(xsdMatch[1])) {
                datatypePrefixed = `xsd:${datatype.slice(xsdMatch[1].length)}`;
                break;
              }
            }
          }
        }
        newValue = `"${value}"^^${datatypePrefixed}`;
      } else {
        // No datatype - simple string literal
        newValue = `"${value}"`;
      }
    } else if (object.termType === 'NamedNode') {
      const uri = (object as { value: string }).value;
      // Try to find prefixed form
      let prefixed = uri;
      if (cache.headerSection) {
        for (const block of cache.headerSection.blocks) {
          if (block.originalText) {
            // Check all prefixes
            const prefixMatches = block.originalText.matchAll(/@prefix\s+(\w+):\s*<([^>]+)>/g);
            for (const match of prefixMatches) {
              const prefix = match[1];
              const namespace = match[2];
              if (uri.startsWith(namespace)) {
                const local = uri.slice(namespace.length);
                prefixed = `${prefix}:${local}`;
                break;
              }
            }
            // Check empty prefix
            const emptyPrefixMatch = block.originalText.match(/@prefix\s+:\s*<([^>]+)>/);
            if (emptyPrefixMatch && uri.startsWith(emptyPrefixMatch[1])) {
              const local = uri.slice(emptyPrefixMatch[1].length);
              prefixed = `:${local}`;
              break;
            }
          }
        }
      }
      newValue = prefixed;
    } else if (object.termType === 'BlankNode') {
      // Blank nodes in simple changes should be rare, but handle them
      newValue = '['; // Start of inline blank node - would need full serialization
      // For now, fall back to block-level replacement for blank nodes
      return cache.content; // Indicate that targeted replacement can't handle this
    }
    
    // Build the new line text
    // CRITICAL: We need to find the actual line boundaries in the original content
    // to preserve indentation, line endings, and not affect other lines
    
    // Find the line start (beginning of the line containing this property)
    let lineStart = propertyLine.position.start;
    while (lineStart > 0 && result[lineStart - 1] !== '\n' && result[lineStart - 1] !== '\r') {
      lineStart--;
    }
    
    // Find the line end (end of the line including newline)
    // Start from propertyLine.position.end and scan forward to find the actual line end
    let lineEnd = propertyLine.position.end;
    
    // Skip whitespace after the property value
    while (lineEnd < result.length && (result[lineEnd] === ' ' || result[lineEnd] === '\t')) {
      lineEnd++;
    }
    
    // Include separator if present (; or . or ,)
    if (lineEnd < result.length && (result[lineEnd] === ';' || result[lineEnd] === '.' || result[lineEnd] === ',')) {
      lineEnd++;
    }
    
    // Skip whitespace after separator
    while (lineEnd < result.length && (result[lineEnd] === ' ' || result[lineEnd] === '\t')) {
      lineEnd++;
    }
    
    // Detect and preserve the actual line ending (CRLF, LF, or CR)
    let lineEnding = '';
    if (lineEnd < result.length && result[lineEnd] === '\r' && lineEnd + 1 < result.length && result[lineEnd + 1] === '\n') {
      lineEnding = '\r\n';
      lineEnd += 2;
    } else if (lineEnd < result.length && result[lineEnd] === '\n') {
      lineEnding = '\n';
      lineEnd += 1;
    } else if (lineEnd < result.length && result[lineEnd] === '\r') {
      lineEnding = '\r';
      lineEnd += 1;
    } else {
      // No newline found at this position - this shouldn't happen for valid Turtle
      // But if it does, use the cache's detected line ending style
      // CRITICAL: The cache's line ending should be correct for the entire file
      lineEnding = cache.formattingStyle.lineEnding;
      debugLog('[performTargetedLineReplacement] No newline found at position, using cache lineEnding:', JSON.stringify(lineEnding));
    }
    
    // Extract the original line to get indentation and trailing separator
    const originalLine = result.slice(lineStart, lineEnd);
    debugLog('[performTargetedLineReplacement] originalLine extracted:', JSON.stringify(originalLine));
    const indentMatch = originalLine.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    debugLog('[performTargetedLineReplacement] Extracted indent:', JSON.stringify(indent), 'length:', indent.length);
    
    // Find trailing separator and whitespace from original line (before newline)
    // Match: optional whitespace before separator, separator (; or . or ,), optional whitespace after
    // We want to preserve the exact spacing around the separator
    // Remove the newline from originalLine first, then match
    const originalLineWithoutNewline = originalLine.replace(/\r\n|\r|\n$/, '');
    // Match whitespace before separator, separator, and whitespace after
    const trailingMatch = originalLineWithoutNewline.match(/(\s*[,;.]?\s*)$/);
    const trailing = trailingMatch ? trailingMatch[1] : ''; // This preserves spacing before and after separator, no newline
    debugLog('[performTargetedLineReplacement] Extracted trailing (no newline):', JSON.stringify(trailing));
    
    // CRITICAL: Verify we're only replacing the property line, not the subject line
    // The line should contain the predicate, not the subject
    if (!originalLine.includes(predicate) && !originalLine.trim().startsWith(':')) {
      // This line doesn't contain our predicate - might be subject line or wrong line
      // Check if predicate appears on this line
      const lineContainsPredicate = originalLine.includes(predicate.split(':').pop() || predicate);
      if (!lineContainsPredicate) {
        debugWarn('[performTargetedLineReplacement] WARNING: Line does not contain predicate', predicate, 'originalLine:', originalLine.substring(0, 100));
        // Try to find the correct line by searching for the predicate
        const lines = result.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(predicate)) {
            // Found the line - recalculate lineStart and lineEnd
            let newLineStart = 0;
            for (let j = 0; j < i; j++) {
              newLineStart += lines[j].length + (result.includes('\r\n') ? 2 : 1);
            }
            lineStart = newLineStart;
            lineEnd = newLineStart + lines[i].length + (result.includes('\r\n') ? 2 : 1);
            // Re-extract original line
            const correctedLine = result.slice(lineStart, lineEnd);
            const correctedIndentMatch = correctedLine.match(/^(\s*)/);
            const correctedIndent = correctedIndentMatch ? correctedIndentMatch[1] : '';
            const correctedTrailingMatch = correctedLine.match(/(\s*[,;.]?\s*)(?:\r\n|\r|\n|$)/);
            const correctedTrailing = correctedTrailingMatch ? correctedTrailingMatch[1] : '';
            // Use corrected values
            const newLineText = `${correctedIndent}${predicate} ${newValue}${correctedTrailing}${lineEnding}`;
            result = result.slice(0, lineStart) + newLineText + result.slice(lineEnd);
            debugLog('[performTargetedLineReplacement] Corrected line replacement for', predicate);
            continue;
          }
        }
      }
    }
    
    // Build new line with preserved indentation, trailing separator, and line ending
    const newLineText = `${indent}${predicate} ${newValue}${trailing}${lineEnding}`;
    debugLog('[performTargetedLineReplacement] newLineText:', JSON.stringify(newLineText));
    
    // Replace the entire line (from line start to line end including newline)
    const beforeReplace = result.substring(0, Math.min(lineStart + 50, result.length));
    const afterReplace = result.substring(Math.min(lineStart, result.length), Math.min(lineStart + 100, result.length));
    debugLog('[performTargetedLineReplacement] Before replace (50 chars before lineStart):', JSON.stringify(beforeReplace.substring(Math.max(0, beforeReplace.length - 50))));
    debugLog('[performTargetedLineReplacement] After replace (100 chars from lineStart):', JSON.stringify(afterReplace));
    
    result = result.slice(0, lineStart) + 
             newLineText + 
             result.slice(lineEnd);
    
    const afterResult = result.substring(Math.min(lineStart, result.length), Math.min(lineStart + 100, result.length));
    debugLog('[performTargetedLineReplacement] After result (100 chars from lineStart):', JSON.stringify(afterResult));
  }
  
  debugLog('[performTargetedLineReplacement] Completed, result length:', result.length, 'original length:', cache.content.length);
  if (result === cache.content) {
    debugWarn('[performTargetedLineReplacement] WARNING: Result is unchanged from cache.content - this will cause fallback to block-level');
  }
  
  return result;
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
