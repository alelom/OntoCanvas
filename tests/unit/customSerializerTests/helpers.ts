/**
 * Test helper functions for custom serializer tests.
 * These functions allow tests to call serializer functions directly without DOM/GUI dependencies.
 */

import { Store, DataFactory } from 'n3';
import { parseRdfToGraph } from '../../../src/parser';
import { parseTurtleWithPositions, extractPropertyLines, type OriginalFileCache, type StatementBlock, type PropertyLine, type TextPosition } from '../../../src/rdf/sourcePreservation';
import type { Quad as N3Quad } from 'n3';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

/**
 * Parse TTL content and return both store and cache.
 */
export async function parseTtlWithCache(
  content: string,
  path?: string
): Promise<{ store: Store; cache: OriginalFileCache }> {
  const parseResult = await parseRdfToGraph(content, { path: path || 'test.ttl' });
  const { store, originalFileCache } = parseResult;
  
  if (!originalFileCache) {
    // If cache not available from parseRdfToGraph, create it manually
    const { cache } = await parseTurtleWithPositions(content);
    return { store, cache };
  }
  
  return { store, cache: originalFileCache };
}

/**
 * Modify a class label in the store.
 */
export function modifyLabel(store: Store, classUri: string, newLabel: string): boolean {
  const classNode = DataFactory.namedNode(classUri);
  const labelPredicate = DataFactory.namedNode(RDFS + 'label');
  
  // Remove existing label quads
  const existingLabels = store.getQuads(classNode, labelPredicate, null, null);
  for (const quad of existingLabels) {
    store.removeQuad(quad);
  }
  
  // Add new label
  const newLabelQuad = DataFactory.quad(
    classNode,
    labelPredicate,
    DataFactory.literal(newLabel)
  );
  store.addQuad(newLabelQuad);
  
  return true;
}

/**
 * Modify a class comment in the store.
 */
export function modifyComment(store: Store, classUri: string, newComment: string): boolean {
  const classNode = DataFactory.namedNode(classUri);
  const commentPredicate = DataFactory.namedNode(RDFS + 'comment');
  
  // Remove existing comment quads
  const existingComments = store.getQuads(classNode, commentPredicate, null, null);
  for (const quad of existingComments) {
    store.removeQuad(quad);
  }
  
  // Add new comment
  const newCommentQuad = DataFactory.quad(
    classNode,
    commentPredicate,
    DataFactory.literal(newComment)
  );
  store.addQuad(newCommentQuad);
  
  return true;
}

/**
 * Modify labellableRoot annotation property in the store.
 */
export function modifyLabellableRoot(store: Store, classUri: string, value: boolean): boolean {
  const classNode = DataFactory.namedNode(classUri);
  // Assume base IRI for labellableRoot - adjust if needed
  const baseIri = classUri.split('#')[0] || 'http://example.org/test#';
  const labellableRootPredicate = DataFactory.namedNode(baseIri + 'labellableRoot');
  
  // Remove existing labellableRoot quads
  const existing = store.getQuads(classNode, labellableRootPredicate, null, null);
  for (const quad of existing) {
    store.removeQuad(quad);
  }
  
  // Add new labellableRoot
  const newQuad = DataFactory.quad(
    classNode,
    labellableRootPredicate,
    DataFactory.literal(String(value), DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))
  );
  store.addQuad(newQuad);
  
  return true;
}

/**
 * Get property lines from a block.
 */
export function getPropertyLines(
  block: StatementBlock,
  cache: OriginalFileCache
): PropertyLine[] {
  return extractPropertyLines(block, cache);
}

/**
 * Verify that only specific lines changed between original and modified content.
 */
export function verifyOnlyLinesChanged(
  original: string,
  modified: string,
  expectedChangedLines: number[]
): boolean {
  const originalLines = original.split(/\r?\n/);
  const modifiedLines = modified.split(/\r?\n/);
  
  if (originalLines.length !== modifiedLines.length) {
    return false;
  }
  
  for (let i = 0; i < originalLines.length; i++) {
    const lineNum = i + 1;
    const isExpectedChange = expectedChangedLines.includes(lineNum);
    const linesMatch = originalLines[i] === modifiedLines[i];
    
    if (isExpectedChange && linesMatch) {
      return false; // Expected change but line didn't change
    }
    if (!isExpectedChange && !linesMatch) {
      return false; // Unexpected change
    }
  }
  
  return true;
}

/**
 * Verify property order in serialized output.
 */
export function verifyPropertyOrder(
  serialized: string,
  classUri: string,
  expectedOrder: string[]
): boolean {
  // Extract the class block from serialized content
  const classLocalName = classUri.includes('#') ? classUri.split('#')[1] : classUri.split('/').pop() || '';
  const classPattern = new RegExp(`:${classLocalName}[\\s\\S]*?\\.`, 'm');
  const match = serialized.match(classPattern);
  
  if (!match) {
    return false;
  }
  
  const classBlock = match[0];
  
  // Check that properties appear in expected order
  let lastIndex = -1;
  for (const prop of expectedOrder) {
    const propPattern = new RegExp(prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const index = classBlock.search(propPattern);
    if (index === -1) {
      return false; // Property not found
    }
    if (index < lastIndex) {
      return false; // Property out of order
    }
    lastIndex = index;
  }
  
  return true;
}

/**
 * Verify formatting is preserved in a specific block range.
 */
export function verifyFormattingPreserved(
  original: string,
  modified: string,
  blockStart: number,
  blockEnd: number
): boolean {
  const originalBlock = original.slice(blockStart, blockEnd);
  const modifiedBlock = modified.slice(blockStart, blockEnd);
  
  // Extract formatting characteristics (indentation, line breaks, spacing)
  const originalIndent = originalBlock.match(/^(\s+)/m)?.[1] || '';
  const modifiedIndent = modifiedBlock.match(/^(\s+)/m)?.[1] || '';
  
  const originalLineBreaks = (originalBlock.match(/\r?\n/g) || []).length;
  const modifiedLineBreaks = (modifiedBlock.match(/\r?\n/g) || []).length;
  
  // Basic checks - more sophisticated checks can be added
  return originalIndent === modifiedIndent && originalLineBreaks === modifiedLineBreaks;
}

/**
 * Extract property lines and validate structure.
 */
export function extractAndValidatePropertyLines(
  block: StatementBlock,
  cache: OriginalFileCache
): { propertyLines: PropertyLine[]; overlaps: Array<{ p1: PropertyLine; p2: PropertyLine }>; errors: string[] } {
  const propertyLines = extractPropertyLines(block, cache);
  const overlaps: Array<{ p1: PropertyLine; p2: PropertyLine }> = [];
  const errors: string[] = [];
  
  // Check for overlaps
  for (let i = 0; i < propertyLines.length; i++) {
    for (let j = i + 1; j < propertyLines.length; j++) {
      const p1 = propertyLines[i];
      const p2 = propertyLines[j];
      const overlapsPos = !(p1.position.end <= p2.position.start || p2.position.end <= p1.position.start);
      if (overlapsPos) {
        overlaps.push({ p1, p2 });
        errors.push(`Property line overlap: ${p1.predicate} (${p1.position.start}-${p1.position.end}) overlaps with ${p2.predicate} (${p2.position.start}-${p2.position.end})`);
      }
    }
  }
  
  // Check for validation errors in property lines
  for (const propLine of propertyLines) {
    if (propLine.validationErrors.length > 0) {
      errors.push(...propLine.validationErrors.map(e => `${propLine.predicate}: ${e}`));
    }
  }
  
  return { propertyLines, overlaps, errors };
}

/**
 * Check for overlapping property lines.
 */
export function checkForOverlaps(propertyLines: PropertyLine[]): Array<{ p1: PropertyLine; p2: PropertyLine }> {
  const overlaps: Array<{ p1: PropertyLine; p2: PropertyLine }> = [];
  
  for (let i = 0; i < propertyLines.length; i++) {
    for (let j = i + 1; j < propertyLines.length; j++) {
      const p1 = propertyLines[i];
      const p2 = propertyLines[j];
      const overlapsPos = !(p1.position.end <= p2.position.start || p2.position.end <= p1.position.start);
      if (overlapsPos) {
        overlaps.push({ p1, p2 });
      }
    }
  }
  
  return overlaps;
}

/**
 * Verify quad positions are within property line positions.
 */
export function verifyQuadPositions(propertyLine: PropertyLine): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check that each quad has a position
  for (const quad of propertyLine.quads) {
    if (!propertyLine.quadPositions.has(quad)) {
      errors.push(`Quad missing position: ${(quad.predicate as { value: string }).value}`);
    }
  }
  
  // Check that quad positions are within property position
  for (const [quad, quadPos] of propertyLine.quadPositions.entries()) {
    if (quadPos.start < propertyLine.position.start) {
      errors.push(`Quad position starts before property: ${(quad.predicate as { value: string }).value} starts at ${quadPos.start}, property starts at ${propertyLine.position.start}`);
    }
    if (quadPos.end > propertyLine.position.end) {
      errors.push(`Quad position ends after property: ${(quad.predicate as { value: string }).value} ends at ${quadPos.end}, property ends at ${propertyLine.position.end}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Calculate proximity score between property position and expected quad position.
 * Lower score = closer match.
 */
export function calculateProximityScore(
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
  
  // Relative position within block (normalized 0-1)
  // This is a simplified calculation - actual implementation would be more sophisticated
  
  // Combine metrics (weighted)
  const score = charDistance * 0.5 + lineDistance * 100 + Math.abs(propertyPosition.start - expectedQuadPosition) * 0.1;
  
  return score;
}
