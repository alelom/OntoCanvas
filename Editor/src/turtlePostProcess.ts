/**
 * Turtle post-processing: style fixes, @base, section dividers, and blank node inlining.
 * All Turtle output formatting is centralized here.
 */

import { Parser } from 'n3';
import type { Quad, Term, BlankNode, NamedNode, Literal } from 'n3';

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

function ensureBase(raw: string): string {
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

function shortenIri(iri: string, externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>): string {
  if (iri === BASE_IRI) return '<#';
  for (const [prefix, ns] of Object.entries(TURTLE_PREFIXES)) {
    if (iri.startsWith(ns)) {
      const local = iri.slice(ns.length);
      if (prefix === '') return `:${local}`;
      return `${prefix}:${local}`;
    }
  }
  
  // Check external ontologies
  if (externalRefs) {
    for (const ref of externalRefs) {
      if (iri.startsWith(ref.url)) {
        if (ref.usePrefix && ref.prefix) {
          const local = iri.slice(ref.url.length);
          return `${ref.prefix}:${local}`;
        }
        // If not using prefix, return full IRI
        return `<${iri}>`;
      }
    }
  }
  
  if (iri.startsWith(BASE_IRI)) return `<#${iri.slice(BASE_IRI.length)}>`;
  return `<${iri}>`;
}

function serializeTerm(
  term: Term,
  inlineBlanks: Map<string, string>,
  externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>
): string {
  switch (term.termType) {
    case 'NamedNode':
      return shortenIri(term.value, externalRefs);
    case 'Literal': {
      const lit = term as Literal;
      let value = lit.value;
      value = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
      if (lit.language) return `"${value}"@${lit.language}`;
      const dt = lit.datatype?.value;
      if (dt === 'http://www.w3.org/2001/XMLSchema#boolean') return `"${value}"^^xsd:boolean`;
      if (dt === 'http://www.w3.org/2001/XMLSchema#string') return `"${value}"`;
      if (dt) return `"${value}"^^${shortenIri(dt, externalRefs)}`;
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

function buildInlineForms(quads: Quad[], externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>): Map<string, string> {
  const blankAsObject = new Set<string>();
  const quadsBySubject = new Map<string, Quad[]>();

  for (const q of quads) {
    const subjId = q.subject.termType === 'BlankNode' ? blankNodeId(q.subject as BlankNode) : null;
    const objId = q.object.termType === 'BlankNode' ? blankNodeId(q.object as BlankNode) : null;
    if (subjId) {
      const list = quadsBySubject.get(subjId) ?? [];
      list.push(q);
      quadsBySubject.set(subjId, list);
    }
    if (objId) blankAsObject.add(objId);
  }

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
      const predStr = pred.value === RDF_TYPE ? 'rdf:type' : shortenIri(pred.value, externalRefs);
      const objStr = serializeTerm(q.object, result, externalRefs);
      parts.push(`${predStr} ${objStr}`);
    }
    const inline = `[ ${parts.join(' ; ')} ]`;
    result.set(id, inline);
    return inline;
  }

  const sorted = topologicalSortBlanks(quadsBySubject, inlinedIds);
  for (const id of sorted) {
    buildFor(id);
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
  const escaped = [...blankIds].map((id) => {
    const ref = id.startsWith('_:') ? id : `_:${id}`;
    return ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('|');
  // Match blank node block: _:n3-X ... until period at end of triple (allow optional space before .)
  const re = new RegExp(`(^|\\n)\\s*(${escaped})\\s+[\\s\\S]*?\\s*\\.\\s*(\\n|$)`, 'gm');
  return raw.replace(re, (m) => (m.startsWith('\n') ? '\n' : ''));
}

function replaceBlankRefs(raw: string, inlineBlanks: Map<string, string>): string {
  let output = raw;
  // Process in reverse dependency order so nested blanks get replaced first
  const sorted = [...inlineBlanks.entries()].reverse();
  for (const [id, inline] of sorted) {
    const ref = id.startsWith('_:') ? id : `_:${id}`;
    const escapedRef = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Include comma in lookahead for comma-separated object lists (e.g. rdfs:subClassOf _:n3-0, _:n3-1)
    const re = new RegExp(`(?<![\\w:-])${escapedRef}(?=[.,;\\s\\]\\n]|$)`, 'g');
    output = output.replace(re, inline);
  }
  return output;
}

function convertBlanksToInline(raw: string, externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>): string {
  const parser = new Parser({ format: 'text/turtle', blankNodePrefix: '_:' });
  let quads: Quad[];
  try {
    quads = [...parser.parse(raw)];
  } catch (e) {
    return raw;
  }

  const blankAsObject = new Set<string>();
  for (const q of quads) {
    if (q.object.termType === 'BlankNode') {
      const id = blankNodeId(q.object as BlankNode);
      blankAsObject.add(id);
    }
  }
  if (blankAsObject.size === 0) return raw;

  const inlineBlanks = buildInlineForms(quads, externalRefs);
  let output = removeBlankBlocks(raw, blankAsObject);
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

// --- Main export ---

/**
 * Post-process raw Turtle output: style fixes, @base, blank node inlining, section dividers, owl:imports.
 */
export function postProcessTurtle(raw: string, externalRefs?: Array<{ url: string; usePrefix: boolean; prefix?: string }>): string {
  let output = raw;
  output = applyStyleFixes(output);
  output = ensureBase(output);
  output = convertBlanksToInline(output, externalRefs);
  
  // Add owl:imports to ontology declaration
  if (externalRefs && externalRefs.length > 0) {
    output = addOwlImports(output, externalRefs);
  }
  
  output = addSectionDividers(output);
  return output;
}

function addOwlImports(raw: string, externalRefs: Array<{ url: string; usePrefix: boolean; prefix?: string }>): string {
  let output = raw;
  
  // First, add @prefix declarations for external ontologies that use prefixes
  const prefixesToAdd: Array<{ prefix: string; url: string }> = [];
  for (const ref of externalRefs) {
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
      const newRefs = externalRefs.filter((ref) => !existingImports.has(ref.url));
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
  
  // Extract existing owl:imports from the ontology block
  const existingImports = new Set<string>();
  const importPattern = /owl:imports\s+<([^>]+)>/g;
  let importMatch;
  while ((importMatch = importPattern.exec(ontologyBlock)) !== null) {
    existingImports.add(importMatch[1]);
  }
  
  // Filter out external refs that already have imports
  const newRefs = externalRefs.filter((ref) => !existingImports.has(ref.url));
  
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
