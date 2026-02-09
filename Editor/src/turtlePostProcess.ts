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
  { type: 'Class', label: 'Classes' },
];

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

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

function shortenIri(iri: string): string {
  if (iri === BASE_IRI) return '<#';
  for (const [prefix, ns] of Object.entries(TURTLE_PREFIXES)) {
    if (iri.startsWith(ns)) {
      const local = iri.slice(ns.length);
      if (prefix === '') return `:${local}`;
      return `${prefix}:${local}`;
    }
  }
  if (iri.startsWith(BASE_IRI)) return `<#${iri.slice(BASE_IRI.length)}>`;
  return `<${iri}>`;
}

function serializeTerm(
  term: Term,
  inlineBlanks: Map<string, string>
): string {
  switch (term.termType) {
    case 'NamedNode':
      return shortenIri(term.value);
    case 'Literal': {
      const lit = term as Literal;
      let value = lit.value;
      value = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
      if (lit.language) return `"${value}"@${lit.language}`;
      const dt = lit.datatype?.value;
      if (dt === 'http://www.w3.org/2001/XMLSchema#boolean') return `"${value}"^^xsd:boolean`;
      if (dt === 'http://www.w3.org/2001/XMLSchema#string') return `"${value}"`;
      if (dt) return `"${value}"^^${shortenIri(dt)}`;
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

function buildInlineForms(quads: Quad[]): Map<string, string> {
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

    const list = quadsBySubject.get(id) ?? [];
    const parts: string[] = [];
    for (const q of list) {
      const pred = q.predicate as NamedNode;
      const predStr = pred.value === RDF_TYPE ? 'rdf:type' : shortenIri(pred.value);
      const objStr = serializeTerm(q.object, result);
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

function convertBlanksToInline(raw: string): string {
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

  const inlineBlanks = buildInlineForms(quads);
  let output = removeBlankBlocks(raw, blankAsObject);
  output = replaceBlankRefs(output, inlineBlanks);
  return output;
}

// --- Section dividers ---

function addSectionDividers(raw: string): string {
  const lines = raw.split('\n');
  const result: string[] = [];
  const seenSections = new Set<string>();
  const sectionPatterns = [
    { type: 'Ontology', re: /(owl:Ontology|owl#Ontology|Ontology>)/ },
    { type: 'AnnotationProperty', re: /(owl:AnnotationProperty|owl#AnnotationProperty|AnnotationProperty>)/ },
    { type: 'ObjectProperty', re: /(owl:ObjectProperty|owl#ObjectProperty|ObjectProperty>)/ },
    { type: 'Class', re: /(owl:Class|owl#Class|owl\/Class|Class>)/ },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const isNewBlock = trimmed.length > 0 && !line.startsWith(' ') && !line.startsWith('\t');

    if (isNewBlock) {
      let addedSectionDivider = false;
      for (const { type, re } of sectionPatterns) {
        if (re.test(line)) {
          if (!seenSections.has(type)) {
            seenSections.add(type);
            const config = SECTION_ORDER.find((s) => s.type === type);
            if (config) {
              if (result.length > 0) result.push('');
              result.push(SECTION_DIVIDER);
              result.push(`#    ${config.label}`);
              result.push(SECTION_DIVIDER);
              result.push('');
              addedSectionDivider = true;
            }
          }
          break;
        }
      }
      if (!addedSectionDivider && result.length > 0 && result[result.length - 1].trim() !== '') {
        result.push('');
      }
    }
    result.push(line);
  }
  return result.join('\n').replace(/\n{3,}/g, '\n\n');
}

// --- Main export ---

/**
 * Post-process raw Turtle output: style fixes, @base, blank node inlining, section dividers.
 */
export function postProcessTurtle(raw: string): string {
  let output = raw;
  output = applyStyleFixes(output);
  output = ensureBase(output);
  output = convertBlanksToInline(output);
  output = addSectionDividers(output);
  return output;
}
