/**
 * State machine parser for extracting property lines from Turtle block text.
 * Handles quoted strings, brackets, URIs, language tags, datatypes with minimal regex.
 */

import type { TextPosition } from './sourcePreservation';
import { debugLog } from '../utils/debug';

/**
 * Parser states for the state machine.
 */
enum ParserState {
  START = 'START',
  PREDICATE = 'PREDICATE',
  VALUE_START = 'VALUE_START',
  VALUE_READING = 'VALUE_READING', // Reading a prefixed name or literal value (may include commas)
  STRING = 'STRING',
  LANGUAGE_TAG = 'LANGUAGE_TAG',
  DATATYPE = 'DATATYPE',
  BRACKET = 'BRACKET',
  URI = 'URI',
  SEPARATOR = 'SEPARATOR',
  END = 'END'
}

/**
 * Property line match from parsing.
 */
export interface PropertyLineMatch {
  predicate: string;
  predicateStart: number;
  predicateEnd: number;
  valueStart: number;
  valueEnd: number;
  fullStart: number;  // Start of entire property (including whitespace)
  fullEnd: number;    // End of entire property (including separator)
  lineNumbers: number[];
  isMultiLine: boolean;
  rawText: string;
}

/**
 * Parse property lines from block text using a state machine.
 * 
 * @param blockText The text content of the block
 * @param blockStartPosition Character position where block starts in full content
 * @param blockStartLine Line number where block starts
 * @returns Array of property line matches with positions
 */
export function parsePropertyLinesWithStateMachine(
  blockText: string,
  blockStartPosition: number,
  blockStartLine: number
): PropertyLineMatch[] {
  const matches: PropertyLineMatch[] = [];
  const lines = blockText.split(/\r?\n/);
  
  let state: ParserState = ParserState.START;
  let currentMatch: Partial<PropertyLineMatch> | null = null;
  let bracketDepth = 0;
  let inString = false;
  let stringEscape = false;
  let inUri = false;
  
  let charIndex = 0;
  let lineIndex = 0;
  let lineStartChar = 0;
  let predicateStart = -1;
  let predicateEnd = -1;
  let valueStart = -1;
  let valueEnd = -1;
  let fullStart = -1;
  let currentLineNumbers: number[] = [];
  let isFirstContentLine = true; // Track if we're on the first line with content (subject line)
  let subjectSkipped = false; // Track if we've skipped the subject
  
  const resetMatch = () => {
    currentMatch = null;
    state = ParserState.START;
    bracketDepth = 0;
    inString = false;
    stringEscape = false;
    inUri = false;
    predicateStart = -1;
    predicateEnd = -1;
    valueStart = -1;
    valueEnd = -1;
    fullStart = -1;
    currentLineNumbers = [];
  };
  
  const finalizeMatch = () => {
    if (currentMatch && predicateStart >= 0 && valueStart >= 0 && valueEnd >= 0) {
      const predicate = blockText.slice(predicateStart, predicateEnd).trim();
      const rawText = blockText.slice(fullStart >= 0 ? fullStart : predicateStart, valueEnd);
      
      matches.push({
        predicate,
        predicateStart: blockStartPosition + predicateStart,
        predicateEnd: blockStartPosition + predicateEnd,
        valueStart: blockStartPosition + valueStart,
        valueEnd: blockStartPosition + valueEnd,
        fullStart: blockStartPosition + (fullStart >= 0 ? fullStart : predicateStart),
        fullEnd: blockStartPosition + valueEnd,
        lineNumbers: [...currentLineNumbers],
        isMultiLine: currentLineNumbers.length > 1,
        rawText
      });
    }
    resetMatch();
  };
  
  // Process character by character
  for (let i = 0; i < blockText.length; i++) {
    const char = blockText[i];
    const prevChar = i > 0 ? blockText[i - 1] : '';
    const nextChar = i < blockText.length - 1 ? blockText[i + 1] : '';
    
    // Track line numbers
    if (char === '\n') {
      lineIndex++;
      lineStartChar = i + 1;
      // Only set isFirstContentLine to false if we've already skipped the subject
      // Otherwise, keep it true so we can skip the subject on the next non-empty line
      if (subjectSkipped) {
        isFirstContentLine = false;
      }
      // Track line numbers for current match (if we're in the middle of parsing a property)
      // After incrementing lineIndex, we're now on the new line, so use blockStartLine + lineIndex
      if (state !== ParserState.START && state !== ParserState.END) {
        const newLine = blockStartLine + lineIndex;
        if (currentLineNumbers.length === 0) {
          // Add the previous line (before newline) and the new line
          currentLineNumbers.push(blockStartLine + lineIndex - 1);
          currentLineNumbers.push(newLine);
        } else if (!currentLineNumbers.includes(newLine)) {
          currentLineNumbers.push(newLine);
        }
      }
    }
    
    // Handle string escape sequences
    if (stringEscape) {
      stringEscape = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      stringEscape = true;
      continue;
    }
    
    switch (state) {
      case ParserState.START:
        // Skip whitespace and comments
        if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
          continue;
        }
        if (char === '#') {
          // Skip to end of line
          while (i < blockText.length && blockText[i] !== '\n') {
            i++;
          }
          continue;
        }
        
        // On first content line, skip subject (everything up to first predicate)
        // Subject can be on any line, but we only skip it once
        if (!subjectSkipped) {
          // Skip subject - subject is typically at the start of the line, followed by whitespace and then a predicate
          // Pattern: :SubjectName whitespace predicate
          // Subject must start with : or < (not just any alphanumeric - that would match predicates too)
          // But only if we're at the start of a line (after whitespace/newline) or at the very beginning
          const isAtLineStart = i === 0 || (i > 0 && (blockText[i - 1] === '\n' || blockText[i - 1] === '\r'));
          if (isAtLineStart && (char === ':' || char === '<')) {
            let j = i;
            // Read the subject (prefixed name or URI)
            // For URIs, read until closing >
            if (char === '<') {
              j++;
              while (j < blockText.length && blockText[j] !== '>') {
                j++;
              }
              if (j < blockText.length) {
                j++; // Include the closing >
              }
            } else {
              // Prefixed name - read until whitespace or special character
              while (j < blockText.length && blockText[j] !== ' ' && blockText[j] !== '\t' && blockText[j] !== '\n' && blockText[j] !== ';') {
                j++;
              }
            }
            // Skip whitespace (including newlines)
            while (j < blockText.length && (blockText[j] === ' ' || blockText[j] === '\t' || blockText[j] === '\n' || blockText[j] === '\r')) {
              j++;
            }
            // If there's content after whitespace (including on the next line), the previous token was likely a subject
            // Skip to the first non-whitespace character after the subject
            if (j < blockText.length) {
              // Found content after subject (could be on same line or next line) - skip to it
              i = j - 1; // -1 because loop will increment
              subjectSkipped = true;
              isFirstContentLine = false; // We've processed the first content line
              continue;
            }
          }
        }
        
        // Start of predicate
        if (char.match(/[:\w<]/)) {
          state = ParserState.PREDICATE;
          predicateStart = i;
          fullStart = i;
          currentMatch = {};
          currentLineNumbers = [blockStartLine + lineIndex];
          i--; // Re-process this character in PREDICATE state
        }
        break;
        
      case ParserState.PREDICATE:
        // If predicate starts with <, it's a URI - read until >
        if (char === '<' && predicateStart === i) {
          // Start of URI predicate - read until closing >
          let j = i + 1;
          while (j < blockText.length && blockText[j] !== '>') {
            j++;
          }
          if (j < blockText.length) {
            // Found closing >
            predicateEnd = j + 1;
            i = j; // Will be incremented by loop
            state = ParserState.VALUE_START;
          } else {
            // Malformed URI, but continue
            predicateEnd = i + 1;
            state = ParserState.VALUE_START;
          }
        } else if (char === ' ' || char === '\t' || char === '\n') {
          predicateEnd = i;
          state = ParserState.VALUE_START;
        } else if (char === ';' || char === '.') {
          // Predicate with no value (shouldn't happen in valid Turtle, but handle gracefully)
          predicateEnd = i;
          valueStart = i;
          valueEnd = i;
          finalizeMatch();
        }
        break;
        
      case ParserState.VALUE_START:
        // Skip whitespace
        if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
          continue;
        }
        
        // If valueStart is already set (we're continuing after a comma), don't reset it
        // This is important for comma-separated values like :DrawingType, [ ... ], [ ... ]
        if (valueStart === -1) {
          valueStart = i;
        }
        
        // Determine value type
        if (char === '"') {
          state = ParserState.STRING;
          inString = true;
          // Don't reset valueStart if already set
        } else if (char === '<') {
          state = ParserState.URI;
          inUri = true;
          // Don't reset valueStart if already set
        } else if (char === '[') {
          state = ParserState.BRACKET;
          bracketDepth = 1;
          // Don't reset valueStart if already set - we're continuing the same value
        } else if (char.match(/[:\w]/)) {
          // Prefixed name or literal - start reading value
          valueStart = i;
          state = ParserState.VALUE_READING;
          // Don't use a while loop here - let the state machine handle transitions naturally
          // The VALUE_READING state will handle semicolons, periods, commas, and brackets
        } else if (char === ';' || char === ',' || char === '.') {
          // Empty value (shouldn't happen, but handle)
          valueStart = i;
          valueEnd = i;
          state = ParserState.SEPARATOR;
        }
        break;
        
      case ParserState.STRING:
        if (char === '"' && !stringEscape) {
          // String ended, check for language tag or datatype
          valueEnd = i + 1;
          inString = false;
          
          // Check next non-whitespace character
          let j = i + 1;
          while (j < blockText.length && (blockText[j] === ' ' || blockText[j] === '\t')) {
            j++;
          }
          
          if (j < blockText.length) {
            if (blockText[j] === '@') {
              state = ParserState.LANGUAGE_TAG;
            } else if (j + 1 < blockText.length && blockText[j] === '^' && blockText[j + 1] === '^') {
              state = ParserState.DATATYPE;
              i = j + 1; // Skip ^^
            } else if (blockText[j] === ',') {
              // Comma continues the value (comma-separated list)
              state = ParserState.VALUE_READING;
              i = j; // Continue from comma
            } else {
              // Value complete
              state = ParserState.SEPARATOR;
            }
          } else {
            state = ParserState.END;
          }
        }
        break;
        
      case ParserState.VALUE_READING:
        // Reading a prefixed name or literal value
        // Continue until we hit a semicolon, period, or newline (not comma - comma continues the value)
        if (char === ';' || char === '.' || char === '\n') {
          valueEnd = i;
          if (char === ';' || char === '.') {
            state = ParserState.SEPARATOR;
          } else {
            state = ParserState.END;
          }
        } else if (char === ',') {
          // Comma continues the value (comma-separated list), keep reading
          // Don't update valueEnd, continue reading
          // Check if next non-whitespace character is a bracket
          let j = i + 1;
          while (j < blockText.length && (blockText[j] === ' ' || blockText[j] === '\t' || blockText[j] === '\r' || blockText[j] === '\n')) {
            j++;
          }
          if (j < blockText.length && blockText[j] === '[') {
            // Bracket follows - transition to BRACKET state
            state = ParserState.BRACKET;
            bracketDepth = 1;
            // Don't reset valueStart - we're continuing the same value
            i = j; // Skip to bracket (will be incremented by loop)
          }
          // Otherwise, continue in VALUE_READING to read next prefixed name/literal
        } else if (char === '[') {
          // Bracket encountered - transition to BRACKET state
          state = ParserState.BRACKET;
          bracketDepth = 1;
          // Don't reset valueStart - we're continuing the same value
        } else if (char === ' ' || char === '\t') {
          // Whitespace might be followed by comma or another value, keep reading
          // Check next character
          let j = i + 1;
          while (j < blockText.length && (blockText[j] === ' ' || blockText[j] === '\t')) {
            j++;
          }
          if (j < blockText.length) {
            const nextChar = blockText[j];
            if (nextChar === ',' || nextChar.match(/[:\w<]/)) {
              // Comma or another value follows, continue reading
              // Don't update valueEnd
            } else if (nextChar === ';' || nextChar === '.' || nextChar === '\n') {
              // Property ends here
              valueEnd = i;
              if (nextChar === ';' || nextChar === '.') {
                state = ParserState.SEPARATOR;
              } else {
                state = ParserState.END;
              }
              i = j - 1; // -1 because loop will increment
            }
          }
        }
        // Otherwise continue reading (part of the value)
        break;
        
      case ParserState.LANGUAGE_TAG:
        // Read until whitespace or separator (comma continues, semicolon/period ends)
        if (char === ' ' || char === '\t' || char === ';' || char === '.' || char === '\n') {
          valueEnd = i;
          if (char === ';' || char === '.') {
            state = ParserState.SEPARATOR;
          } else {
            state = ParserState.END;
          }
        } else if (char === ',') {
          // Comma continues the value, switch back to VALUE_READING
          state = ParserState.VALUE_READING;
        }
        break;
        
      case ParserState.DATATYPE:
        // Read until whitespace or separator (comma continues, semicolon/period ends)
        if (char === ' ' || char === '\t' || char === ';' || char === '.' || char === '\n') {
          valueEnd = i;
          if (char === ';' || char === '.') {
            state = ParserState.SEPARATOR;
          } else {
            state = ParserState.END;
          }
        } else if (char === ',') {
          // Comma continues the value, switch back to VALUE_READING
          state = ParserState.VALUE_READING;
        }
        break;
        
      case ParserState.BRACKET:
        // Inside brackets, ignore semicolons and other separators - they're part of the blank node structure
        if (char === '[' && !inString && !inUri) {
          bracketDepth++;
        } else if (char === ']' && !inString && !inUri) {
          bracketDepth--;
          if (bracketDepth === 0) {
            // Bracket closed - check if comma follows (comma-separated values)
            // Skip whitespace after the bracket
            let j = i + 1;
            while (j < blockText.length && (blockText[j] === ' ' || blockText[j] === '\t' || blockText[j] === '\r' || blockText[j] === '\n')) {
              j++;
            }
            if (j < blockText.length && blockText[j] === ',') {
              // Comma follows - more values coming, continue reading
              // DON'T set valueEnd yet - we need to continue reading the next bracket
              // Transition to VALUE_START to continue reading the next bracket
              state = ParserState.VALUE_START;
              // Skip the comma by setting i to j (will be incremented by loop)
              i = j;
              // Continue reading - don't break, let the loop continue
            } else {
              // No comma - property value ends here
              valueEnd = i + 1;
              state = ParserState.SEPARATOR;
            }
          }
        } else if (char === '"' && !inString) {
          inString = true;
        } else if (char === '"' && inString && !stringEscape) {
          inString = false;
        } else if (char === '<' && !inString && !inUri) {
          inUri = true;
        } else if (char === '>' && inUri) {
          inUri = false;
        }
        // All other characters (including semicolons, colons, etc.) are just consumed as part of the bracket content
        break;
        
      case ParserState.URI:
        if (char === '>') {
          valueEnd = i + 1;
          inUri = false;
          state = ParserState.SEPARATOR;
        }
        break;
        
      case ParserState.SEPARATOR:
        // Skip whitespace after separator
        if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
          continue;
        }
        
        // Finalize current match
        finalizeMatch();
        
        // Check if there's another property
        if (char === ';' || char === ',') {
          // Another property on same line
          state = ParserState.START;
        } else if (char === '.') {
          // End of block
          state = ParserState.END;
        } else if (char.match(/[:\w<]/)) {
          // Next property starts
          state = ParserState.PREDICATE;
          predicateStart = i;
          fullStart = i;
          currentMatch = {};
          currentLineNumbers = [blockStartLine + lineIndex];
          i--; // Re-process
        }
        break;
        
      case ParserState.END:
        // Block ended, finalize any pending match
        if (currentMatch) {
          finalizeMatch();
        }
        break;
    }
  }
  
  // Finalize any pending match at end
  if (currentMatch && state !== ParserState.END) {
    if (valueEnd < 0) {
      valueEnd = blockText.length;
    }
    finalizeMatch();
  }
  
  debugLog('[parsePropertyLinesWithStateMachine] Extracted', matches.length, 'property matches');
  
  return matches;
}
