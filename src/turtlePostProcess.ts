/**
 * Turtle post-processing: style fixes, @base, section dividers, and blank node inlining.
 * All Turtle output formatting is centralized here.
 */

import { Parser } from 'n3';
import type { Quad, Term, BlankNode, NamedNode, Literal } from 'n3';
import { getAppVersion } from './utils/version';
import { debugError } from './utils/debug';

// --- Constants (aligned with parser.ts) ---

const BASE_IRI = 'http://example.org/aec-drawing-ontology#';

const TURTLE_PREFIXES: Record<string, string> = {
  '': 'http://example.org/aec-drawing-ontology#',
  owl: 'http://www.w3.org/2002/07/owl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  xml: 'http://www.w3.org/XML/1998/namespace',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

const SECTION_DIVIDER = '#################################################################';
const SECTION_ORDER = [
  { type: 'Ontology', label: 'Ontology' },
  { type: 'AnnotationProperty', label: 'Annotation properties' },
  { type: 'ObjectProperty', label: 'Object Properties' },
  { type: 'DatatypeProperty', label: 'Data Properties' },
  { type: 'Class', label: 'Classes' },
];

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL_NS = 'http://www.w3.org/2002/07/owl#';
const OWL_ON_PROPERTY = OWL_NS + 'onProperty';
const OWL_ON_CLASS = OWL_NS + 'onClass';
const OWL_SOME_VALUES_FROM = OWL_NS + 'someValuesFrom';

// --- Style fixes (explicit rdf:type, boolean literals) ---

function applyStyleFixes(raw: string): string {
  let output = raw;
  output = output.replace(/ a (owl|rdf|rdfs|xsd|xml):/g, ' rdf:type $1:');
  output = output.replace(/ a :/g, ' rdf:type :');
  output = output.replace(/ a </g, ' rdf:type <');
  output = output.replace(/ false(?=[.;\s\n]|$)/g, ' "false"^^xsd:boolean');
  output = output.replace(/ true(?=[.;\s\n]|$)/g, ' "true"^^xsd:boolean');
  
  return output;
}

// --- @base handling ---

function ensureBase(raw: string, useColonNotation: boolean = true): string {
  // If using colon notation, don't add @base
  if (useColonNotation) return raw;
  
  // Only add @base if we're using <# notation and it's not already there
  if (!raw.includes('<#') || raw.includes('@base')) return raw;
  const lastPrefixMatch = raw.match(/@prefix[^\n]+\n?/g);
  const insertAt = lastPrefixMatch
    ? raw.indexOf(lastPrefixMatch[lastPrefixMatch.length - 1]) +
      lastPrefixMatch[lastPrefixMatch.length - 1].length
    : 0;
  return (
    raw.slice(0, insertAt) +
    `@base <${BASE_IRI}> .\n` +
    raw.slice(insertAt)
  );
}

// --- Blank node inlining (Option A) ---

function blankNodeId(b: BlankNode): string {
  return (b as { id?: string }).id ?? (b as { value?: string }).value ?? '';
}

function getBlankRef(blank: BlankNode): string {
  const id = blankNodeId(blank);
  return id.startsWith('_:') ? id : `_:${id}`;
}

function shortenIri(
  iri: string, 
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>,
  useColonNotation: boolean = true
): string {
  if (iri === BASE_IRI) {
    return useColonNotation ? ':' : '<#';
  }
  for (const [prefix, ns] of Object.entries(TURTLE_PREFIXES)) {
    if (iri.startsWith(ns)) {
      const local = iri.slice(ns.length);
      if (prefix === '') {
        return useColonNotation ? `:${local}` : `<#${local}>`;
      }
      return `${prefix}:${local}`;
    }
  }
  
  // Check external ontologies
  if (externalRefs) {
    for (const ref of externalRefs) {
      if (iri.startsWith(ref.url)) {
        if (ref.usePrefix && ref.prefix !== undefined) {
          const local = iri.slice(ref.url.length);
          // Empty prefix means use ':' notation for default namespace
          if (ref.prefix === '') {
            return useColonNotation ? `:${local}` : `<#${local}>`;
          }
          return `${ref.prefix}:${local}`;
        }
        // If not using prefix, return full IRI
        return `<${iri}>`;
      }
    }
  }
  
  if (iri.startsWith(BASE_IRI)) {
    return useColonNotation ? `:${iri.slice(BASE_IRI.length)}` : `<#${iri.slice(BASE_IRI.length)}>`;
  }
  return `<${iri}>`;
}

function serializeTerm(
  term: Term,
  inlineBlanks: Map<string, string>,
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>,
  useColonNotation: boolean = true
): string {
  switch (term.termType) {
    case 'NamedNode':
      return shortenIri(term.value, externalRefs, useColonNotation);
    case 'Literal': {
      const lit = term as Literal;
      let value = lit.value;
      value = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
      if (lit.language) return `"${value}"@${lit.language}`;
      const dt = lit.datatype?.value;
      if (dt === 'http://www.w3.org/2001/XMLSchema#boolean') return `"${value}"^^xsd:boolean`;
      if (dt === 'http://www.w3.org/2001/XMLSchema#string') return `"${value}"`;
      if (dt) return `"${value}"^^${shortenIri(dt, externalRefs, useColonNotation)}`;
      return `"${value}"`;
    }
    case 'BlankNode': {
      const ref = getBlankRef(term as BlankNode);
      const id = ref.startsWith('_:') ? ref.slice(2) : ref;
      const inline = inlineBlanks.get(id);
      if (inline) return inline;
      return ref;
    }
    default:
      return '';
  }
}

/**
 * Deduplicate quads for an owl:Restriction blank. An OWL restriction must have exactly one
 * owl:onProperty and exactly one target (owl:onClass or owl:someValuesFrom). If merged/corrupt
 * data has duplicates, keep only the first of each to prevent invalid Turtle output.
 */
function deduplicateRestrictionQuads(quads: Quad[]): Quad[] {
  const isRestriction = quads.some(
    (q) => (q.predicate as NamedNode).value === RDF_TYPE && (q.object as NamedNode).value === OWL_NS + 'Restriction'
  );
  if (!isRestriction) return quads;

  let seenOnProperty = false;
  let seenTarget = false;
  const result: Quad[] = [];
  for (const q of quads) {
    const p = (q.predicate as NamedNode).value;
    if (p === OWL_ON_PROPERTY) {
      if (seenOnProperty) continue;
      seenOnProperty = true;
    } else if (p === OWL_ON_CLASS || p === OWL_SOME_VALUES_FROM) {
      if (seenTarget) continue;
      seenTarget = true;
    }
    result.push(q);
  }
  return result;
}

export function buildInlineForms(
  quads: Quad[], 
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>,
  useColonNotation: boolean = true
): Map<string, string> {
  const blankAsObject = new Set<string>();
  const quadsBySubject = new Map<string, Quad[]>();
  const allBlankNodeIds = new Set<string>();

  for (const q of quads) {
    const subjId = q.subject.termType === 'BlankNode' ? blankNodeId(q.subject as BlankNode) : null;
    const objId = q.object.termType === 'BlankNode' ? blankNodeId(q.object as BlankNode) : null;
    if (subjId) {
      allBlankNodeIds.add(subjId);
      const list = quadsBySubject.get(subjId) ?? [];
      list.push(q);
      quadsBySubject.set(subjId, list);
    }
    if (objId) {
      allBlankNodeIds.add(objId);
      blankAsObject.add(objId);
    }
  }

  // CRITICAL: Include ALL blank nodes that are used as objects OR nested within other blank nodes
  // This ensures nested blank nodes are also inlined
  const inlinedIds = new Set(blankAsObject);
  const result = new Map<string, string>();

  function buildFor(id: string): string {
    const cached = result.get(id);
    if (cached) return cached;

    let list = quadsBySubject.get(id) ?? [];
    list = deduplicateRestrictionQuads(list);
    const parts: string[] = [];
    for (const q of list) {
      const pred = q.predicate as NamedNode;
      const predStr = pred.value === RDF_TYPE ? 'rdf:type' : shortenIri(pred.value, externalRefs, useColonNotation);
      // CRITICAL: For nested blank nodes, we need to recursively build their inline forms
      // If the object is a blank node, build its inline form first
      let objStr: string;
      if (q.object.termType === 'BlankNode') {
        const objId = blankNodeId(q.object as BlankNode);
        // Mark nested blank node as needing inlining
        inlinedIds.add(objId);
        // Recursively build the nested blank node's inline form
        objStr = buildFor(objId);
      } else {
        objStr = serializeTerm(q.object, result, externalRefs, useColonNotation);
      }
      parts.push(`${predStr} ${objStr}`);
    }
    const inline = `[ ${parts.join(' ; ')} ]`;
    result.set(id, inline);
    return inline;
  }

  // Build inline forms for all blank nodes that are used as objects
  // This will recursively build nested blank nodes as well
  const sorted = topologicalSortBlanks(quadsBySubject, inlinedIds);
  for (const id of sorted) {
    buildFor(id);
  }
  
  // Also build any remaining blank nodes that might be nested but not in the sorted list
  for (const id of allBlankNodeIds) {
    if (!result.has(id) && inlinedIds.has(id)) {
      buildFor(id);
    }
  }
  
  return result;
}

function topologicalSortBlanks(
  quadsBySubject: Map<string, Quad[]>,
  inlinedIds: Set<string>
): string[] {
  const deps = new Map<string, Set<string>>();
  for (const id of inlinedIds) {
    deps.set(id, new Set());
    const quads = quadsBySubject.get(id) ?? [];
    for (const q of quads) {
      if (q.object.termType === 'BlankNode') {
        const objId = blankNodeId(q.object as BlankNode);
        if (inlinedIds.has(objId) && objId !== id) {
          deps.get(id)!.add(objId);
        }
      }
    }
  }
  const order: string[] = [];
  const visited = new Set<string>();
  function visit(n: string) {
    if (visited.has(n)) return;
    visited.add(n);
    for (const d of deps.get(n) ?? []) visit(d);
    order.push(n);
  }
  for (const id of inlinedIds) visit(id);
  return order;
}

function removeBlankBlocks(raw: string, blankIds: Set<string>): string {
  if (blankIds.size === 0) return raw;
  
  let output = raw;
  let lastOutput = '';
  let iterations = 0;
  
  // Remove blank node blocks iteratively until no more are found
  while (output !== lastOutput && iterations < 10) {
    lastOutput = output;
    
    // Find all blank node blocks - match any format: _:df_0_0, _:n3-0, etc.
    const matches: Array<{ start: number; end: number; blankNodeId: string }> = [];
    let match;
    const pattern = /(^|\n)(\s*)_:(df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+)\s+/gm;
    
    while ((match = pattern.exec(output)) !== null) {
      const start = match.index;
      const blankNodeIdInString = match[3]; // e.g., "df_0_0" or "n3-0"
      const fullRef = `_:${blankNodeIdInString}`;
      
      // Check if this blank node is in our set to remove
      let shouldRemove = false;
      for (const id of blankIds) {
        const normalizedId = id.replace(/^_:/, '');
        if (blankNodeIdInString === normalizedId || 
            blankNodeIdInString.includes(normalizedId) || 
            normalizedId.includes(blankNodeIdInString) ||
            id === fullRef || id.includes(blankNodeIdInString) || fullRef.includes(id.replace(/^_:/, ''))) {
          shouldRemove = true;
          break;
        }
      }
      
      if (!shouldRemove) continue;
      
      const blankNodeRef = match[0]; // e.g., "\n    _:df_0_0 "
      
      // Find where this blank node block ends (period at end of line)
      let end = start + blankNodeRef.length;
      let foundPeriod = false;
      let inString = false;
      let stringChar = '';
      
      while (end < output.length) {
        const char = output[end];
        const prevChar = end > 0 ? output[end - 1] : '';
        
        // Track string literals
        if ((char === '"' || char === "'") && prevChar !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
            stringChar = '';
          }
        }
        
        if (!inString && char === '.' && /\.\s*(\n|$)/.test(output.substring(end))) {
          // Found period at end of statement
          const newlineIndex = output.indexOf('\n', end);
          end = newlineIndex === -1 ? output.length : newlineIndex + 1; // Include the newline
          foundPeriod = true;
          break;
        }
        
        end++;
        if (end - start > 2000) break; // Safety limit
      }
      
      if (foundPeriod || end > start + blankNodeRef.length) {
        matches.push({
          start,
          end: foundPeriod ? end : start + blankNodeRef.length,
          blankNodeId: blankNodeIdInString
        });
      }
    }
    
    // Remove matches in reverse order to preserve indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      // Preserve the newline before the block if it exists
      const before = output.substring(0, m.start);
      const after = output.substring(m.end);
      const replacement = m.start > 0 && output[m.start] === '\n' ? '\n' : '';
      output = before + replacement + after;
    }
    
    iterations++;
  }
  
  return output;
}

export function replaceBlankRefs(raw: string, inlineBlanks: Map<string, string>): string {
  let output = raw;
  
  // If map is empty, return early
  if (inlineBlanks.size === 0) return output;
  
  // Process in reverse dependency order so nested blanks get replaced first
  const sorted = [...inlineBlanks.entries()].reverse();
  
  // Also try all possible ID formats for each inline form
  for (const [id, inline] of sorted) {
    // Try the ID as-is
    const ref = id.startsWith('_:') ? id : `_:${id}`;
    const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Include comma in lookahead for comma-separated object lists (e.g. rdfs:subClassOf _:n3-0, _:n3-1)
    let re = new RegExp(`(?<![\\w:-])${escapedRef}(?=[.,;\\s\\]\\n]|$)`, 'g');
    output = output.replace(re, inline);
    
    // Also try without _: prefix
    const idWithoutPrefix2 = id.replace(/^_:/, '');
    const escapedIdWithoutPrefix2 = idWithoutPrefix2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`(?<![\\w:-])_:${escapedIdWithoutPrefix2}(?=[.,;\\s\\]\\n]|$)`, 'g');
    output = output.replace(re, inline);
  }
  
  // CRITICAL: Replace blank node references in object position contexts (regardless of ID matching)
  // This is needed because N3 Writer generates different IDs than what we parse.
  // Since we've already removed blank node blocks, any remaining blank node reference in object
  // position should be replaced with an inline form. We replace them in order.
  const inlineForms = Array.from(inlineBlanks.values());
  if (inlineForms.length > 0) {
    let formIndex = 0;
    
    // Replace ALL blank node references that appear in object position, in order
    // Match blank nodes after predicates (rdfs:subClassOf, owl:onClass, etc.) or after commas
    // Use a single pattern that matches both cases
    const blankNodeRefPattern = /(_:(df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+))(?=[.,;\s]|$)/g;
    
    // First, find all blank node references in object position contexts
    const matches: Array<{ index: number; match: string; isAfterPredicate: boolean; isAfterComma: boolean }> = [];
    let match;
    
    // Check for blank nodes after predicates
    const predicatePattern = /(rdfs:subClassOf|owl:someValuesFrom|owl:allValuesFrom|owl:onClass|owl:onProperty)\s+(_:(df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+))(?=[.,;\s]|$)/g;
    while ((match = predicatePattern.exec(output)) !== null) {
      if (!match[0].includes('[') && !match[0].includes(']')) {
        matches.push({ index: match.index + match[1].length + 1, match: match[2], isAfterPredicate: true, isAfterComma: false });
      }
    }
    
    // Check for blank nodes after commas
    const commaPattern = /,\s*(_:(df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+))(?=[.,;\s]|$)/g;
    while ((match = commaPattern.exec(output)) !== null) {
      if (!match[0].includes('[') && !match[0].includes(']')) {
        matches.push({ index: match.index + 1, match: match[1], isAfterPredicate: false, isAfterComma: true });
      }
    }
    
    // Sort matches by index (order they appear in the string)
    matches.sort((a, b) => a.index - b.index);
    
    // Replace matches in reverse order to preserve indices
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      if (formIndex < inlineForms.length) {
        const inline = inlineForms[formIndex];
        formIndex++;
        const before = output.substring(0, m.index);
        const after = output.substring(m.index + m.match.length);
        if (m.isAfterComma) {
          output = before + ', ' + inline + after;
        } else {
          // Find the predicate before this blank node
          const predicateMatch = output.substring(0, m.index).match(/(rdfs:subClassOf|owl:someValuesFrom|owl:allValuesFrom|owl:onClass|owl:onProperty)\s+$/);
          if (predicateMatch) {
            output = before + inline + after;
          } else {
            output = before + inline + after;
          }
        }
      }
    }
  }
  
  return output;
}

export function convertBlanksToInline(
  raw: string, 
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>,
  useColonNotation: boolean = true,
  storeQuads?: Quad[]
): string {
  let quads: Quad[];
  
  // ARCHITECTURAL FIX: If store quads are provided, use them directly
  // This is critical because N3 Writer doesn't serialize blank node blocks
  // when they're only used as objects, so parsing the output fails
  if (storeQuads && storeQuads.length > 0) {
    quads = storeQuads;
  } else {
    // Fallback: try to parse the raw string
    const parser = new Parser({ format: 'text/turtle', blankNodePrefix: '_:' });
    try {
      quads = [...parser.parse(raw)];
    } catch (e) {
      return raw;
    }
  }

  // Find all blank nodes used as objects (these should be inlined)
  const blankAsObject = new Set<string>();
  for (const q of quads) {
    if (q.object.termType === 'BlankNode') {
      const id = blankNodeId(q.object as BlankNode);
      blankAsObject.add(id);
    }
  }
  
  if (blankAsObject.size === 0) return raw;

  // Build inline forms for blank nodes used as objects
  const inlineBlanks = buildInlineForms(quads, externalRefs, useColonNotation);
  
  if (inlineBlanks.size === 0) return raw;
  
  // SIMPLIFIED APPROACH:
  // 1. Remove ALL blank node blocks (they appear as subjects)
  // 2. Replace ALL blank node references with inline forms in order
  
  // Step 1: Remove all blank node blocks
  let output = raw;
  const lines = output.split('\n');
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
  
  // Step 2: Replace blank node references with inline forms
  // Use replaceBlankRefs which handles the replacement more intelligently
  output = replaceBlankRefs(output, inlineBlanks);
  
  return output;
}

// --- Section dividers and reorganization ---

interface Block {
  lines: string[];
  sectionType: string | null;
  subject: string | null; // For sorting within sections
}

function detectSectionType(line: string): string | null {
  const sectionPatterns = [
    { type: 'Ontology', re: /(owl:Ontology|owl#Ontology|Ontology>)/ },
    { type: 'AnnotationProperty', re: /(owl:AnnotationProperty|owl#AnnotationProperty|AnnotationProperty>)/ },
    { type: 'ObjectProperty', re: /(owl:ObjectProperty|owl#ObjectProperty|ObjectProperty>)/ },
    { type: 'DatatypeProperty', re: /(owl:DatatypeProperty|owl#DatatypeProperty|DatatypeProperty>)/ },
    { type: 'Class', re: /(owl:Class|owl#Class|owl\/Class|Class>)/ },
  ];

  for (const { type, re } of sectionPatterns) {
    if (re.test(line)) {
      return type;
    }
  }
  return null;
}

function extractSubject(line: string): string | null {
  // Extract the subject (first token) from a Turtle statement
  // Handles :subject, <uri>, or prefix:localName
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@')) {
    return null;
  }
  
  // Match subject patterns: :name, <uri>, prefix:name, or blank node _:b1
  const subjectMatch = trimmed.match(/^([:<_][^\s;.,]+|[\w-]+:[^\s;.,]+)/);
  if (subjectMatch) {
    return subjectMatch[1];
  }
  return null;
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let currentBlock: Block | null = null;
  let headerBlock: Block | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const isNewBlock = trimmed.length > 0 && !line.startsWith(' ') && !line.startsWith('\t');
    
    // Handle header lines (prefixes, @base, comments)
    // Skip section dividers (they'll be re-added in correct places)
    const isSectionDivider = trimmed === SECTION_DIVIDER || (trimmed.startsWith('#') && trimmed.length > 50 && trimmed.match(/^#+$/));
    if (trimmed.startsWith('@') || (trimmed.startsWith('#') && !isSectionDivider) || trimmed === '') {
      if (currentBlock) {
        // End current block before header content
        // Finalize section type detection for the block
        if (!currentBlock.sectionType) {
          for (const blockLine of currentBlock.lines) {
            const sectionType = detectSectionType(blockLine);
            if (sectionType) {
              currentBlock.sectionType = sectionType;
              break;
            }
          }
        }
        blocks.push(currentBlock);
        currentBlock = null;
      }
      // Skip section dividers - they'll be re-added in correct places
      if (isSectionDivider) {
        continue;
      }
      if (!headerBlock) {
        headerBlock = {
          lines: [],
          sectionType: null,
          subject: null,
        };
      }
      headerBlock.lines.push(line);
      continue;
    }
    
    // Start a new content block
    if (isNewBlock) {
      // Save previous block if exists
      if (currentBlock && currentBlock.lines.length > 0) {
        // Finalize section type detection for the previous block
        if (!currentBlock.sectionType) {
          for (const blockLine of currentBlock.lines) {
            const sectionType = detectSectionType(blockLine);
            if (sectionType) {
              currentBlock.sectionType = sectionType;
              break;
            }
          }
        }
        blocks.push(currentBlock);
      }
      
      // Detect section type from this line
      const sectionType = detectSectionType(line);
      const subject = extractSubject(line);
      
      currentBlock = {
        lines: [line],
        sectionType,
        subject,
      };
    } else if (currentBlock) {
      // Continue current block (indented line or continuation)
      currentBlock.lines.push(line);
      
      // Check if this continuation line has section type info we missed
      if (!currentBlock.sectionType) {
        const sectionType = detectSectionType(line);
        if (sectionType) {
          currentBlock.sectionType = sectionType;
        }
      }
    }
  }
  
  // Finalize last block
  if (currentBlock && currentBlock.lines.length > 0) {
    // Finalize section type detection
    if (!currentBlock.sectionType) {
      for (const blockLine of currentBlock.lines) {
        const sectionType = detectSectionType(blockLine);
        if (sectionType) {
          currentBlock.sectionType = sectionType;
          break;
        }
      }
    }
    blocks.push(currentBlock);
  }
  
  // Save header block if exists (at the beginning)
  if (headerBlock && headerBlock.lines.length > 0) {
    // Insert header at the beginning
    blocks.unshift(headerBlock);
  }
  
  return blocks;
}

function addSectionDividers(raw: string): string {
  const lines = raw.split('\n');
  const blocks = parseBlocks(lines);
  
  // Separate header (prefixes, comments) from content blocks
  const headerBlocks: Block[] = [];
  const contentBlocks: Block[] = [];
  
  for (const block of blocks) {
    if (block.sectionType === null) {
      headerBlocks.push(block);
    } else {
      contentBlocks.push(block);
    }
  }
  
  // Group content blocks by section type
  const blocksBySection = new Map<string, Block[]>();
  for (const block of contentBlocks) {
    const sectionType = block.sectionType || 'Other';
    const list = blocksBySection.get(sectionType) || [];
    list.push(block);
    blocksBySection.set(sectionType, list);
  }
  
  // Sort blocks within each section by subject (alphabetically)
  for (const [sectionType, sectionBlocks] of blocksBySection.entries()) {
    sectionBlocks.sort((a, b) => {
      const aSubj = a.subject || '';
      const bSubj = b.subject || '';
      return aSubj.localeCompare(bSubj);
    });
  }
  
  // Build output in SECTION_ORDER
  const result: string[] = [];
  
  // First, output header blocks (prefixes, @base, etc.)
  for (const block of headerBlocks) {
    result.push(...block.lines);
  }
  
  // Then output sections in order
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
        // Add blank line after each block for readability
        if (result[result.length - 1].trim() !== '') {
          result.push('');
        }
      }
    }
  }
  
  // Handle any blocks that don't match known section types
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

// --- Attribution ---

/**
 * Add attribution comment line at the top of the file (after prefixes).
 * Replaces any existing attribution comment with the current version.
 * Also removes any attribution from rdfs:comment.
 */
function addAttribution(raw: string): string {
  try {
    const version = getAppVersion();
    const attributionText = `Created/edited with https://alelom.github.io/OntoCanvas/ version ${version}`;
    
    // First, remove attribution from rdfs:comment (if any)
    let output = removeAttributionFromRdfsComment(raw);
    
    // Then add/replace comment line after prefixes but before content
    output = addAttributionCommentLine(output, attributionText);
    
    return output;
  } catch (err) {
    debugError('[addAttribution] Error:', err);
    // If attribution fails, return the original string to avoid breaking the save
    return raw;
  }
}

/**
 * Remove attribution strings from rdfs:comment in the ontology declaration.
 */
function removeAttributionFromRdfsComment(raw: string): string {
  try {
    let output = raw;
    
    // Remove ALL attribution strings from quoted strings (rdfs:comment)
    // Match the quoted attribution string itself
    const exactPattern = /"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/g;
    output = output.replace(exactPattern, '');
    
    // Also match more flexible variations
    const flexiblePattern = /"[^"]*Created[^"]*\/edited[^"]*with[^"]*https[^"]*:\/\/alelom[^"]*\.github[^"]*\.io[^"]*\/OntoCanvas[^"]*\/[^"]*version[^"]*"/gi;
    let previousOutput = '';
    let iterations = 0;
    while (output !== previousOutput && iterations < 10) {
      previousOutput = output;
      output = output.replace(flexiblePattern, '');
      iterations++;
    }
    
    // Catch-all for any variation with key identifiers
    const catchAll = /"[^"]*alelom[^"]*\.github[^"]*\.io[^"]*\/OntoCanvas[^"]*version[^"]*"/gi;
    previousOutput = '';
    iterations = 0;
    while (output !== previousOutput && iterations < 10) {
      previousOutput = output;
      output = output.replace(catchAll, '');
      iterations++;
    }
    
    // Clean up commas and formatting issues
    output = output.replace(/,\s*,+/g, ','); // Multiple commas -> single comma
    output = output.replace(/,\s*;/g, ';'); // Comma before semicolon -> semicolon
    output = output.replace(/;\s*,+/g, ';'); // Semicolon before comma -> semicolon
    output = output.replace(/rdfs:comment\s*,+/g, 'rdfs:comment '); // rdfs:comment followed by comma
    output = output.replace(/\s*,\s*\./g, ' .'); // Comma before period -> period
    
    return output;
  } catch (err) {
    debugError('[removeAttributionFromRdfsComment] Error:', err);
    // If removal fails, return the original string to avoid breaking the save
    return raw;
  }
}

/**
 * Add attribution comment line after prefixes but before content.
 * Replaces any existing attribution comment (any version) with the current one.
 */
function addAttributionCommentLine(raw: string, attributionText: string): string {
  const commentLine = `# ${attributionText}`;
  
  // First, remove ALL existing attribution comments (any version)
  // Match: # Created/edited with https://alelom.github.io/OntoCanvas/ version X.X.X
  const attributionCommentPattern = /#\s*Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^\n]+\n?/g;
  let output = raw.replace(attributionCommentPattern, '');
  
  // Also match more flexible variations
  const flexiblePattern = /#\s*[^\n]*Created[^\n]*\/edited[^\n]*with[^\n]*https[^\n]*:\/\/alelom[^\n]*\.github[^\n]*\.io[^\n]*\/OntoCanvas[^\n]*\/[^\n]*version[^\n]*\n?/gi;
  let previousOutput = '';
  let iterations = 0;
  while (output !== previousOutput && iterations < 10) {
    previousOutput = output;
    output = output.replace(flexiblePattern, '');
    iterations++;
  }
  
  // Find where prefixes end (last @prefix or @base)
  const prefixMatches = output.match(/@prefix[^\n]+\n?/g);
  const baseMatch = output.match(/@base[^\n]+\n?/);
  
  let insertPos = 0;
  if (prefixMatches && prefixMatches.length > 0) {
    const lastPrefix = prefixMatches[prefixMatches.length - 1];
    insertPos = output.indexOf(lastPrefix) + lastPrefix.length;
  } else if (baseMatch) {
    insertPos = output.indexOf(baseMatch[0]) + baseMatch[0].length;
  }
  
  // Check if current comment already exists (after removal of old ones)
  if (output.includes(commentLine)) {
    return output;
  }
  
  // Insert comment after prefixes/base, before content
  const before = output.slice(0, insertPos);
  const after = output.slice(insertPos);
  
  // If there's already content after prefixes, add newline before comment
  const needsNewline = before.trim().length > 0 && !before.endsWith('\n');
  const newline = needsNewline ? '\n' : '';
  
  return `${before}${newline}${commentLine}\n${after}`;
}

/**
 * Add rdfs:comment to ontology declaration.
 */
function addAttributionRdfsComment(raw: string, attributionText: string): string {
  // First, remove ALL existing attribution comments from the entire output
  // This prevents duplicates regardless of where they appear
  let output = raw;
  
  // Remove ALL attribution strings - use simple, direct pattern matching
  // Match the quoted attribution string itself (the pattern will match anywhere)
  const exactPattern = /"Created\/edited with https:\/\/alelom\.github\.io\/OntoCanvas\/ version [^"]+"/g;
  output = output.replace(exactPattern, '');
  
  // Also match more flexible variations
  const flexiblePattern = /"[^"]*Created[^"]*\/edited[^"]*with[^"]*https[^"]*:\/\/alelom[^"]*\.github[^"]*\.io[^"]*\/OntoCanvas[^"]*\/[^"]*version[^"]*"/gi;
  output = output.replace(flexiblePattern, '');
  
  // Catch-all for any variation with key identifiers
  const catchAll = /"[^"]*alelom[^"]*\.github[^"]*\.io[^"]*\/OntoCanvas[^"]*version[^"]*"/gi;
  let previousOutput = '';
  let iterations = 0;
  while (output !== previousOutput && iterations < 10) {
    previousOutput = output;
    output = output.replace(catchAll, '');
    iterations++;
  }
  
  // Clean up commas and formatting issues
  output = output.replace(/,\s*,+/g, ','); // Multiple commas -> single comma
  output = output.replace(/,\s*;/g, ';'); // Comma before semicolon -> semicolon
  output = output.replace(/;\s*,+/g, ';'); // Semicolon before comma -> semicolon
  output = output.replace(/rdfs:comment\s*,+/g, 'rdfs:comment '); // rdfs:comment followed by comma
  output = output.replace(/\s*,\s*\./g, ' .'); // Comma before period -> period
  
  // Now check if current attribution already exists
  if (output.includes(`"${attributionText}"`)) {
    return output; // Already has current attribution
  }
  
  // Find the ontology declaration - match just the start: :Ontology rdf:type owl:Ontology
  // Match with semicolon or period (or nothing if it's the start of a statement)
  const ontologyPattern = /(:\w+|<[^>]+>)\s+rdf:type\s+owl:Ontology\s*[;.]?/;
  const match = output.match(ontologyPattern);
  
  if (!match) {
    // No ontology declaration found, skip adding rdfs:comment
    return output;
  }
  
  // Found ontology declaration, extract the ontology block
  const ontologyStart = match.index!;
  const afterStart = output.slice(ontologyStart);
  
  // Find the final period that closes the ontology statement
  let inString = false;
  let stringChar = '';
  let ontologyEnd = ontologyStart;
  let foundFinalPeriod = false;
  
  const candidatePeriods: Array<{ pos: number; afterText: string }> = [];
  
  for (let i = 0; i < afterStart.length; i++) {
    const char = afterStart[i];
    const prevChar = i > 0 ? afterStart[i - 1] : '';
    
    // Track string literals
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    
    // Skip everything inside strings
    if (inString) continue;
    
    // When we find a period, check what comes after it
    if (char === '.') {
      const afterPeriod = afterStart.slice(i + 1);
      const trimmedAfter = afterPeriod.trim();
      
      // Check if this period is followed by newline and then a section divider or new statement
      if (/^\s*[\n\r]/.test(afterPeriod)) {
        const afterNewline = trimmedAfter;
        if (afterNewline.startsWith('#################################################################') ||
            afterNewline.startsWith('#') ||
            /^[:\<@]/.test(afterNewline)) {
          candidatePeriods.push({ pos: i, afterText: afterNewline });
        }
      }
    }
  }
  
  // The first candidate period that's followed by a section divider is likely the end of ontology declaration
  for (const candidate of candidatePeriods) {
    if (candidate.afterText.startsWith('#################################################################')) {
      ontologyEnd = ontologyStart + candidate.pos + 1;
      foundFinalPeriod = true;
      break;
    }
  }
  
  // If we didn't find one with a section divider, use the first candidate
  if (!foundFinalPeriod && candidatePeriods.length > 0) {
    ontologyEnd = ontologyStart + candidatePeriods[0].pos + 1;
    foundFinalPeriod = true;
  }
  
  if (!foundFinalPeriod) {
    // Fallback: look for first period after match that's on its own line
    const fallbackMatch = afterStart.match(/\.\s*[\n\r]\s*(#|$|[\n\r])/);
    if (fallbackMatch && fallbackMatch.index != null) {
      ontologyEnd = ontologyStart + fallbackMatch.index + 1;
      foundFinalPeriod = true;
    } else {
      // Last resort: assume ontology declaration ends within first 500 chars
      ontologyEnd = ontologyStart + Math.min(500, afterStart.length);
    }
  }
  
  // Re-extract ontology block from cleaned output
  const cleanedOntologyStart = output.indexOf(match[0]);
  const cleanedAfterStart = output.slice(cleanedOntologyStart);
  
  // Find the end of the ontology block in the cleaned output
  let cleanedOntologyEnd = cleanedOntologyStart;
  let foundEnd = false;
  const cleanedCandidatePeriods: Array<{ pos: number; afterText: string }> = [];
  
  let inString2 = false;
  let stringChar2 = '';
  for (let i = 0; i < cleanedAfterStart.length; i++) {
    const char = cleanedAfterStart[i];
    const prevChar = i > 0 ? cleanedAfterStart[i - 1] : '';
    
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString2) {
        inString2 = true;
        stringChar2 = char;
      } else if (char === stringChar2) {
        inString2 = false;
        stringChar2 = '';
      }
      continue;
    }
    if (inString2) continue;
    
    if (char === '.') {
      const afterPeriod = cleanedAfterStart.slice(i + 1);
      const trimmedAfter = afterPeriod.trim();
      if (/^\s*[\n\r]/.test(afterPeriod)) {
        const afterNewline = trimmedAfter;
        if (afterNewline.startsWith('#################################################################') ||
            afterNewline.startsWith('#') ||
            /^[:\<@]/.test(afterNewline)) {
          cleanedCandidatePeriods.push({ pos: i, afterText: afterNewline });
        }
      }
    }
  }
  
  for (const candidate of cleanedCandidatePeriods) {
    if (candidate.afterText.startsWith('#################################################################')) {
      cleanedOntologyEnd = cleanedOntologyStart + candidate.pos + 1;
      foundEnd = true;
      break;
    }
  }
  
  if (!foundEnd && cleanedCandidatePeriods.length > 0) {
    cleanedOntologyEnd = cleanedOntologyStart + cleanedCandidatePeriods[0].pos + 1;
    foundEnd = true;
  }
  
  if (!foundEnd) {
    const fallbackMatch = cleanedAfterStart.match(/\.\s*[\n\r]\s*(#|$|[\n\r])/);
    if (fallbackMatch && fallbackMatch.index != null) {
      cleanedOntologyEnd = cleanedOntologyStart + fallbackMatch.index + 1;
    } else {
      cleanedOntologyEnd = cleanedOntologyStart + Math.min(500, cleanedAfterStart.length);
    }
  }
  
  const ontologyBlock = output.slice(cleanedOntologyStart, cleanedOntologyEnd);
  const before = output.slice(0, cleanedOntologyStart);
  const after = output.slice(cleanedOntologyEnd);
  
  // Check if it already has properties (contains semicolon)
  const hasSemicolon = ontologyBlock.includes(';');
  const rdfsComment = `    rdfs:comment "${attributionText}"`;
  
  if (hasSemicolon) {
    // Add rdfs:comment before the final period
    const blockWithoutPeriod = ontologyBlock.replace(/\s*\.\s*$/, '');
    return `${before}${blockWithoutPeriod} ;\n${rdfsComment} .\n${after}`;
  } else {
    // Replace period with semicolon and add rdfs:comment
    const blockWithoutPeriod = ontologyBlock.replace(/\s*\.\s*$/, '');
    return `${before}${blockWithoutPeriod} ;\n${rdfsComment} .\n${after}`;
  }
}

// --- Main export ---

/**
 * Detect if the original TTL file uses colon notation (:Class) or base notation (<#Class>).
 * Returns true if colon notation is used, false if base notation is used.
 */
function detectColonNotation(originalTtl: string | undefined): boolean {
  if (!originalTtl) return true; // Default to colon notation
  
  // Check if original uses @base
  const hasBase = originalTtl.includes('@base');
  
  // Check if original uses <# notation
  const hasBaseNotation = /<#[^>]+>/.test(originalTtl);
  
  // Check if original uses : notation (empty prefix)
  const hasColonPrefix = /@prefix\s+:\s*</.test(originalTtl);
  const hasColonUsage = /:\w+/.test(originalTtl);
  
  // If it has @base or <# notation, it's using base notation
  if (hasBase || hasBaseNotation) return false;
  
  // If it has colon prefix and colon usage, it's using colon notation
  if (hasColonPrefix && hasColonUsage) return true;
  
  // Default to colon notation
  return true;
}

/**
 * Convert full URIs back to colon notation if the original used colon notation.
 * This handles cases where the N3 Writer outputs full URIs instead of :Class notation.
 */
function convertFullUrisToColonNotation(
  raw: string,
  mainOntologyBase: string | null,
  useColonNotation: boolean
): string {
  if (!useColonNotation || !mainOntologyBase) return raw;
  
  let output = raw;
  // Extract base IRI (remove trailing # or /)
  const baseIri = mainOntologyBase.endsWith('#') 
    ? mainOntologyBase.slice(0, -1) 
    : mainOntologyBase.replace(/\/$/, '');
  
  // Pattern to match full URIs like <http://example.org/test#ClassName>
  // Convert to :ClassName if it matches the main ontology base
  const fullUriPattern = new RegExp(`<${baseIri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[#>]([^>]+)>`, 'g');
  output = output.replace(fullUriPattern, (match, localName) => {
    // Only convert if it's not already in colon notation and matches our base
    return `:${localName}`;
  });
  
  // Also handle cases where the URI might have a trailing # or /
  const fullUriPattern2 = new RegExp(`<${baseIri.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:#|/)([^>]+)>`, 'g');
  output = output.replace(fullUriPattern2, (match, localName) => {
    return `:${localName}`;
  });
  
  return output;
}

/**
 * Post-process raw Turtle output: style fixes, @base, blank node inlining, section dividers, owl:imports, attribution.
 * @param originalTtlString Optional original TTL string to detect and preserve format preference (colon vs base notation)
 */
export function postProcessTurtle(
  raw: string, 
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>,
  originalTtlString?: string,
  store?: import('n3').Store
): string {
  let output = raw;
  output = applyStyleFixes(output);
  
  // Detect format preference from original file
  const useColonNotation = detectColonNotation(originalTtlString);
  
  // Extract main ontology base from original file or from output
  let mainOntologyBase: string | null = null;
  if (originalTtlString) {
    // Try to extract from @prefix : <...> or @base <...>
    const prefixMatch = originalTtlString.match(/@prefix\s+:\s*<([^>]+)>/);
    const baseMatch = originalTtlString.match(/@base\s+<([^>]+)>/);
    if (prefixMatch) {
      mainOntologyBase = prefixMatch[1];
    } else if (baseMatch) {
      mainOntologyBase = baseMatch[1];
    }
  }
  
  // If we couldn't get it from original, try to extract from output
  if (!mainOntologyBase) {
    const outputPrefixMatch = output.match(/@prefix\s+:\s*<([^>]+)>/);
    const outputBaseMatch = output.match(/@base\s+<([^>]+)>/);
    if (outputPrefixMatch) {
      mainOntologyBase = outputPrefixMatch[1];
    } else if (outputBaseMatch) {
      mainOntologyBase = outputBaseMatch[1];
    } else {
      // Fallback to default BASE_IRI
      mainOntologyBase = BASE_IRI;
    }
  }
  
  // Convert format based on preference
  if (useColonNotation) {
    // Convert full URIs and <# notation to colon notation
    output = convertFullUrisToColonNotation(output, mainOntologyBase, useColonNotation);
    // Also convert <#Class> to :Class if present (from wrong base)
    if (mainOntologyBase) {
      const baseHashPattern = /<#([^>]+)>/g;
      output = output.replace(baseHashPattern, (match, localName, offset) => {
        // Check if this is in a prefix/base declaration - if so, don't convert
        const beforeMatch = output.substring(0, offset);
        const lines = beforeMatch.split('\n');
        const lastLine = lines[lines.length - 1] || '';
        const isInDeclaration = /@(prefix|base)\s+[^@]*$/.test(lastLine);
        if (isInDeclaration) return match;
        return `:${localName}`;
      });
    }
  } else {
    // For base notation, convert :Class to <#Class> (but not in prefix declarations or standard prefixes)
    // Match :ClassName where ClassName starts with uppercase (class names) or lowercase (properties)
    // Don't match standard prefixes like rdf:, owl:, rdfs:, xsd:, xml:
    const standardPrefixPattern = /(rdf|owl|rdfs|xsd|xml):/;
    const colonPattern = /:([A-Za-z][a-zA-Z0-9_]*)/g;
    output = output.replace(colonPattern, (match, localName, offset) => {
      // Check if this is in a prefix declaration
      const beforeMatch = output.substring(0, offset);
      const lines = beforeMatch.split('\n');
      const lastLine = lines[lines.length - 1] || '';
      const isInPrefix = /@prefix\s+:\s*</.test(lastLine) || /@prefix\s+\w+:\s*</.test(lastLine);
      if (isInPrefix) return match;
      
      // Check if the part before : is a standard prefix (rdf:, owl:, etc.)
      const contextBefore = lastLine.substring(Math.max(0, lastLine.length - 10)) + match;
      if (standardPrefixPattern.test(contextBefore)) {
        return match; // Don't convert standard prefixes
      }
      
      return `<#${localName}>`;
    });
  }
  
  // Only add @base if not using colon notation
  output = ensureBase(output, useColonNotation, mainOntologyBase);
  
  // Use colon notation in blank node inlining if that was the original format
  // CRITICAL: This must remove ALL blank node blocks that appear as subjects
  // before section dividers are added
  // ARCHITECTURAL FIX: Pass store quads for blank node inlining
  // N3 Writer doesn't serialize blank node blocks when they're only used as objects,
  // so we need the original quads to build inline forms
  const storeQuads = store ? [...store] : undefined;
  output = convertBlanksToInline(output, externalRefs, useColonNotation, storeQuads);
  
  // Final safety check: Remove ANY remaining blank node blocks
  // Use line-by-line approach to be absolutely sure we catch them
  const outputLines = output.split('\n');
  const cleanedOutputLines: string[] = [];
  let lineIdx = 0;
  
  while (lineIdx < outputLines.length) {
    const currentLine = outputLines[lineIdx];
    const trimmed = currentLine.trim();
    
    // Check if this line starts a blank node block
    if (trimmed.match(/^_:(df_\d+_\d+|n3-\d+|[a-zA-Z0-9_-]+)\s+/)) {
      // Skip this blank node block until we find the period
      while (lineIdx < outputLines.length) {
        const checkLine = outputLines[lineIdx];
        if (/\.\s*$/.test(checkLine.trim())) {
          lineIdx++; // Skip the period line
          break;
        }
        lineIdx++;
      }
      continue; // Don't add this block
    }
    
    // Not a blank node block, keep it
    cleanedOutputLines.push(currentLine);
    lineIdx++;
  }
  
  output = cleanedOutputLines.join('\n');
  
  // Add owl:imports to ontology declaration
  if (externalRefs && externalRefs.length > 0) {
    output = addOwlImports(output, externalRefs);
  }
  
  output = addSectionDividers(output);
  
  // Add attribution comment and rdfs:comment
  output = addAttribution(output);
  
  // Final pass: ensure spacing before punctuation (but not inside URIs or strings)
  // Process line by line to avoid issues with multi-line strings/URIs
  const lines = output.split('\n');
  const fixedLines = lines.map(line => {
    // Skip lines that are prefixes, base, or comments
    if (line.trim().startsWith('@') || line.trim().startsWith('#')) return line;
    
    // Add space before ; or . if missing and not inside <...> or "..."
    let fixed = line;
    let inUri = false;
    let inString = false;
    let stringChar = '';
    let result = '';
    
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      const prevChar = i > 0 ? fixed[i - 1] : '';
      const nextChar = i < fixed.length - 1 ? fixed[i + 1] : '';
      
      // Track URIs and strings
      if (char === '<' && !inString && prevChar !== '\\') inUri = true;
      if (char === '>' && !inString && prevChar !== '\\') inUri = false;
      if ((char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = '';
        }
      }
      
      // Add space before ; or . if needed (but not if already has space or is inside URI/string)
      if (!inUri && !inString && (char === ';' || char === '.') && 
          prevChar !== ' ' && prevChar !== '\t' && prevChar !== '') {
        result += ' ' + char;
      } else {
        result += char;
      }
    }
    
    return result;
  });
  output = fixedLines.join('\n');
  
  return output;
}

// Standard RDF/OWL namespaces that should not be imported (they're built-in)
const STANDARD_NAMESPACES = new Set([
  'http://www.w3.org/2002/07/owl',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns',
  'http://www.w3.org/2000/01/rdf-schema',
  'http://www.w3.org/2001/XMLSchema',
  'http://www.w3.org/XML/1998/namespace',
]);

function addOwlImports(raw: string, externalRefs: Array<{ url: string; usePrefix: boolean; prefix?: string }>): string {
  // Normalize external ref URLs for comparison (remove trailing # or /)
  const normalizeUrl = (url: string): string => {
    return url.replace(/[#\/]$/, '');
  };
  let output = raw;
  
  // Filter out standard RDF/OWL namespaces - they shouldn't be imported
  const filteredRefs = externalRefs.filter((ref) => {
    const normalized = ref.url.replace(/[#\/]$/, '');
    return !STANDARD_NAMESPACES.has(normalized);
  });
  
  if (filteredRefs.length === 0) {
    return output; // No refs to add after filtering
  }
  
  // First, add @prefix declarations for external ontologies that use prefixes
  const prefixesToAdd: Array<{ prefix: string; url: string }> = [];
  for (const ref of filteredRefs) {
    if (ref.usePrefix && ref.prefix) {
      // Check if prefix already exists
      const prefixPattern = new RegExp(`@prefix\\s+${ref.prefix}\\s*:`);
      if (!prefixPattern.test(output)) {
        prefixesToAdd.push({ prefix: ref.prefix, url: ref.url });
      }
    }
  }
  
  if (prefixesToAdd.length > 0) {
    // Find the last @prefix declaration
    const prefixMatches = output.match(/@prefix[^\n]+\n?/g);
    if (prefixMatches && prefixMatches.length > 0) {
      const lastPrefix = prefixMatches[prefixMatches.length - 1];
      const insertPos = output.indexOf(lastPrefix) + lastPrefix.length;
      const prefixDecls = prefixesToAdd.map((p) => `@prefix ${p.prefix}: <${p.url}> .\n`).join('');
      output = output.slice(0, insertPos) + prefixDecls + output.slice(insertPos);
    } else {
      // No prefixes found, add at the beginning
      const prefixDecls = prefixesToAdd.map((p) => `@prefix ${p.prefix}: <${p.url}> .\n`).join('');
      output = prefixDecls + output;
    }
  }
  
  // Find the ontology declaration - match just the start: :Ontology rdf:type owl:Ontology
  const ontologyPattern = /(:\w+|<[^>]+>)\s+rdf:type\s+owl:Ontology\s*[;]/;
  const match = output.match(ontologyPattern);
  
  if (!match) {
    // If no ontology declaration found, try to find where to insert it
    // Look for first @prefix or first triple
    const firstPrefixMatch = output.match(/@prefix/);
    const firstTripleMatch = output.match(/^[^@#\s]/m);
    
    if (firstPrefixMatch || firstTripleMatch) {
      // Insert ontology declaration after prefixes
      const insertPos = firstPrefixMatch ? output.lastIndexOf('@prefix') : (firstTripleMatch?.index ?? 0);
      // Find the end of the last prefix declaration
      const afterPrefixes = output.slice(insertPos);
      const prefixEndMatch = afterPrefixes.match(/@prefix[^\n]+\n/);
      const actualInsertPos = prefixEndMatch ? insertPos + prefixEndMatch[0].length : insertPos;
      const before = output.slice(0, actualInsertPos);
      const after = output.slice(actualInsertPos);
      // Check for existing imports in the entire output (in case ontology declaration exists elsewhere)
      const existingImports = new Set<string>();
      const importPattern = /owl:imports\s+<([^>]+)>/g;
      let importMatch;
      while ((importMatch = importPattern.exec(output)) !== null) {
        existingImports.add(importMatch[1]);
      }
      // Filter out external refs that already have imports
      const newRefs = filteredRefs.filter((ref) => {
        const refUrl = ref.url;
        const refNormalized = normalizeUrl(refUrl);
        return !existingImports.has(refUrl) && !existingImports.has(refNormalized);
      });
      if (newRefs.length === 0) {
        return output;
      }
      const imports = newRefs.map((ref) => `    owl:imports <${ref.url}>`).join(' ;\n');
      const ontologyDecl = `${before}:Ontology rdf:type owl:Ontology ;\n${imports} .\n\n${after}`;
      return ontologyDecl;
    }
    return output;
  }
  
  // Found ontology declaration, add imports to it
  // Find where the ontology declaration actually ends (the final period that closes the statement)
  // We need to find the period that's not inside a string literal and is on the same statement level
  const ontologyStart = match.index!;
  const afterStart = output.slice(ontologyStart);
  
  // Find the final period that closes the ontology statement
  // Strategy: Look for periods that are:
  // 1. Not inside string literals
  // 2. On a line by themselves or followed by newline
  // 3. Followed by a comment section divider (####) or new top-level statement
  let inString = false;
  let stringChar = '';
  let ontologyEnd = ontologyStart;
  let foundFinalPeriod = false;
  
  // Collect all periods that are not in strings
  const candidatePeriods: Array<{ pos: number; afterText: string }> = [];
  
  for (let i = 0; i < afterStart.length; i++) {
    const char = afterStart[i];
    const prevChar = i > 0 ? afterStart[i - 1] : '';
    
    // Track string literals
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    
    // Skip everything inside strings
    if (inString) continue;
    
    // When we find a period, check what comes after it
    if (char === '.') {
      const afterPeriod = afterStart.slice(i + 1);
      const trimmedAfter = afterPeriod.trim();
      
      // Check if this period is followed by newline and then a section divider or new statement
      if (/^\s*[\n\r]/.test(afterPeriod)) {
        const afterNewline = trimmedAfter;
        if (afterNewline.startsWith('#################################################################') ||
            afterNewline.startsWith('#') ||
            /^[:\<@]/.test(afterNewline)) {
          candidatePeriods.push({ pos: i, afterText: afterNewline });
        }
      }
    }
  }
  
  // The first candidate period that's followed by a section divider is likely the end of ontology declaration
  // If no section divider, use the first one followed by a new statement
  for (const candidate of candidatePeriods) {
    if (candidate.afterText.startsWith('#################################################################')) {
      ontologyEnd = ontologyStart + candidate.pos + 1;
      foundFinalPeriod = true;
      break;
    }
  }
  
  // If we didn't find one with a section divider, use the first candidate
  if (!foundFinalPeriod && candidatePeriods.length > 0) {
    ontologyEnd = ontologyStart + candidatePeriods[0].pos + 1;
    foundFinalPeriod = true;
  }
  
  if (!foundFinalPeriod) {
    // Fallback: look for first period after match that's on its own line
    const fallbackMatch = afterStart.match(/\.\s*[\n\r]\s*(#|$|[\n\r])/);
    if (fallbackMatch && fallbackMatch.index != null) {
      ontologyEnd = ontologyStart + fallbackMatch.index + 1;
      foundFinalPeriod = true;
    } else {
      // Last resort: assume ontology declaration ends within first 500 chars
      ontologyEnd = ontologyStart + Math.min(500, afterStart.length);
    }
  }
  
  const ontologyBlock = output.slice(ontologyStart, ontologyEnd);
  const before = output.slice(0, ontologyStart);
  const after = output.slice(ontologyEnd);
  
  // Extract existing owl:imports from the ENTIRE output (not just ontology block)
  // This prevents duplicates when the file is saved multiple times
  const existingImports = new Set<string>();
  const importPattern = /owl:imports\s+<([^>]+)>/g;
  let importMatch;
  // Check entire output for existing imports
  while ((importMatch = importPattern.exec(output)) !== null) {
    const url = importMatch[1];
    // Normalize URL (remove trailing # or / for comparison)
    const normalized = url.replace(/[#\/]$/, '');
    existingImports.add(url); // Keep original for exact match
    existingImports.add(normalized); // Also add normalized version
  }
  
  // Filter out external refs that already have imports (check both exact and normalized)
  const newRefs = filteredRefs.filter((ref) => {
    const refUrl = ref.url;
    const refNormalized = normalizeUrl(refUrl);
    return !existingImports.has(refUrl) && !existingImports.has(refNormalized);
  });
  
  // If all imports already exist, return unchanged
  if (newRefs.length === 0) {
    return output;
  }
  
  // Check if it already has properties (contains semicolon)
  const hasSemicolon = ontologyBlock.includes(';');
  const imports = newRefs.map((ref) => `    owl:imports <${ref.url}>`).join(' ;\n');
  
  if (hasSemicolon) {
    // Add imports before the final period
    const blockWithoutPeriod = ontologyBlock.replace(/\s*\.\s*$/, '');
    return `${before}${blockWithoutPeriod} ;\n${imports} .\n${after}`;
  } else {
    // Replace period with semicolon and add imports
    const blockWithoutPeriod = ontologyBlock.replace(/\s*\.\s*$/, '');
    return `${before}${blockWithoutPeriod} ;\n${imports} .\n${after}`;
  }
}
