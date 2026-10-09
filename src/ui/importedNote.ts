/**
 * The small line above the label of a term defined in another ontology (#111): "(defined by: <prefix>)",
 * or, when that ontology has no prefix, "(defined by: <its name>)" from its IRI. It covers every kind of
 * externally defined term drawn on the canvas: imported classes, classes declared locally but defined
 * elsewhere (rdfs:isDefinedBy), relationships (object properties) and data properties of another ontology.
 *
 * Terms of the OWL 2 reserved vocabulary (owl, rdf, rdfs, xsd; see rdf/reservedVocabulary.ts) are drawn dimmed
 * like other external terms, but with no note: the languages define them, so there is no ontology to name.
 *
 * It is drawn with vis-network's HTML multi-font, in a small monospace face so it reads as a note rather than
 * as part of the name: "(defined by: " and ")" take the `mono` font (`<code>`), and the prefix or name the
 * `ital` font (`<i>`), so that part stands out in italics. The label's own text is escaped.
 */
import type { DataPropertyInfo, GraphNode, ObjectPropertyInfo } from '../types';
import type { ExternalOntologyReference } from '../storage';
import { getNodeOntologyUrl, getNodePrefix, getPrefixForUri, isUriFromExternalOntology } from './externalRefs';
import { isDefinedElsewhere } from '../graph/definedElsewhere';
import { isReservedNamespace, isReservedVocabularyUri } from '../rdf/reservedVocabulary';

const NOTE_FONT_RATIO = 0.5;
const MIN_NOTE_FONT_SIZE = 7;
const NOTE_FONT_FACE = 'Consolas, "Courier New", monospace';

/** The namespace of a term IRI: up to its `#`, else up to its last `/`, without the trailing separator. */
export function namespaceOf(uri: string): string {
  const hash = uri.indexOf('#');
  if (hash >= 0) return uri.slice(0, hash);
  return uri.slice(0, uri.lastIndexOf('/'));
}

/** A short name for an ontology from its IRI: its last path segment without a file extension, or its host. */
export function ontologyDisplayName(ontologyUrl: string): string {
  const trimmed = ontologyUrl.replace(/[#/]+$/, '');
  try {
    const url = new URL(trimmed);
    const segment = url.pathname.split('/').filter(Boolean).pop()?.replace(/\.(ttl|turtle|owl|rdf|rdfxml|jsonld|n3|html?)$/i, '');
    return segment || url.hostname;
  } catch {
    return trimmed.split(/[#/]/).filter(Boolean).pop() ?? trimmed;
  }
}

/** The note: names the prefix of the defining ontology, else its name; "(imported)" only when nothing is known. */
export function importedNoteText(prefix: string | null | undefined, ontologyUrl?: string | null): string {
  if (prefix) return `(defined by: ${prefix})`;
  const name = ontologyUrl ? ontologyDisplayName(ontologyUrl) : '';
  return name ? `(defined by: ${name})` : '(imported)';
}

/** The note's font size for a label drawn at `labelFontSize`: smaller, but still readable. */
export function importedNoteFontSize(labelFontSize: number): number {
  return Math.max(MIN_NOTE_FONT_SIZE, Math.round(labelFontSize * NOTE_FONT_RATIO));
}

/** Escape what the HTML multi-font would read as markup. */
export function escapeLabelMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface StyledChar {
  char: string;
  italic: boolean;
}

/** The note's characters, with the prefix or name in italics and the rest plain. */
function styledNote(note: string): StyledChar[] {
  const named = /^\(defined by: (.*)\)$/.exec(note);
  const parts = named
    ? [
        { text: '(defined by: ', italic: false },
        { text: named[1], italic: true },
        { text: ')', italic: false },
      ]
    : [{ text: note, italic: false }];
  return parts.flatMap(({ text, italic }) => [...text].map((char) => ({ char, italic })));
}

/** The note's lines, broken at spaces to at most `maxChars` characters as wrapText breaks a label (a word longer
 * than that stays whole). No `maxChars` keeps it on one line. A space is italic only between italic characters. */
function wrapStyledNote(chars: StyledChar[], maxChars?: number): StyledChar[][] {
  const words: StyledChar[][] = [];
  let word: StyledChar[] = [];
  for (const c of chars) {
    if (c.char === ' ') {
      if (word.length) words.push(word);
      word = [];
    } else {
      word.push(c);
    }
  }
  if (word.length) words.push(word);

  const lines: StyledChar[][] = [];
  let line: StyledChar[] = [];
  for (const w of words) {
    if (line.length === 0) {
      line = [...w];
    } else if (!maxChars || maxChars <= 0 || line.length + 1 + w.length <= maxChars) {
      line = [...line, { char: ' ', italic: line[line.length - 1].italic && w[0].italic }, ...w];
    } else {
      lines.push(line);
      line = [...w];
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

/** One line of the note as multi-font markup: italic runs in `<i>`, the rest in the plain note font. */
function noteLineMarkup(line: StyledChar[]): string {
  const runs: { text: string; italic: boolean }[] = [];
  for (const { char, italic } of line) {
    const last = runs[runs.length - 1];
    if (last && last.italic === italic) last.text += char;
    else runs.push({ text: char, italic });
  }
  return runs.map((r) => (r.italic ? `<i>${escapeLabelMarkup(r.text)}</i>` : `<code>${escapeLabelMarkup(r.text)}</code>`)).join('');
}

/** How many characters of the note fit in the width `wrapChars` characters of the label take: the note's font is
 * smaller, so more fit. 0 (no wrapping) when the label isn't wrapped. */
export function importedNoteWrapChars(wrapChars: number, labelFontSize: number): number {
  if (wrapChars <= 0) return 0;
  return Math.max(1, Math.round((wrapChars * labelFontSize) / importedNoteFontSize(labelFontSize)));
}

/** `label` (already wrapped) with the note above it, wrapped to `noteMaxChars` when given so that it never
 * makes the node wider than its label does. */
export function labelWithImportedNote(label: string, note: string, noteMaxChars?: number): string {
  const lines = wrapStyledNote(styledNote(note), noteMaxChars).map(noteLineMarkup);
  return `${lines.join('\n')}\n${escapeLabelMarkup(label)}`;
}

/** The font options that make vis-network draw the note: HTML multi-font, with a smaller monospace font for
 * the note (`mono`, upright) and for the prefix or name in it (`ital`, italic). */
export function importedNoteFont(labelFontSize: number, color: string): {
  multi: 'html';
  ital: { size: number; color: string; face: string; mod: string; vadjust: number };
  mono: { size: number; color: string; face: string; mod: string; vadjust: number };
} {
  const size = importedNoteFontSize(labelFontSize);
  return {
    multi: 'html',
    // vadjust 0 for both: vis-network lowers its mono font by 2px by default, which would leave the italic name
    // looking raised on a small line.
    ital: { size, color, face: NOTE_FONT_FACE, mod: 'italic', vadjust: 0 },
    mono: { size, color, face: NOTE_FONT_FACE, mod: '', vadjust: 0 },
  };
}

/** Whether an edge type is an object property of another ontology: those are named by their full IRI, local
 * ones by their local name (see getObjectProperties). */
export function isImportedRelationshipType(type: string): boolean {
  return /^https?:\/\//i.test(type);
}

const stripSeparators = (iri: string) => iri.replace(/[#/]+$/, '');

/** Whether a term IRI is in the ontology's own namespace; `mainBase` as getMainOntologyBase returns it. */
function inMainNamespace(uri: string, mainBase: string | null): boolean {
  return !!mainBase && stripSeparators(namespaceOf(uri)) === stripSeparators(mainBase);
}

/** The note for a class node, or null when it is local. owl:Thing, added for display, is not an import. */
export function importedNoteForNode(
  node: GraphNode,
  externalOntologyReferences: ExternalOntologyReference[],
  mainBase: string | null
): string | null {
  // owl:Thing, which is added for display, and the other built-in terms.
  if (isReservedVocabularyUri(node.id) || (node.uri && isReservedVocabularyUri(node.uri))) return null;
  if (node.externalOntologyUrl && isReservedNamespace(node.externalOntologyUrl)) return null;
  if (!node.isExternal && !isDefinedElsewhere(node, mainBase)) return null;
  return importedNoteText(getNodePrefix(node, externalOntologyReferences), getNodeOntologyUrl(node));
}

/** The note for a relationship type, or null when it is local (or subClassOf). A relationship is another
 * ontology's when it is named by a full IRI, or its property says rdfs:isDefinedBy elsewhere. */
export function importedNoteForRelationship(
  type: string,
  objectProperties: ObjectPropertyInfo[],
  externalOntologyReferences: ExternalOntologyReference[],
  mainBase: string | null
): string | null {
  const op = objectProperties.find((p) => p.name === type || p.uri === type);
  const uri = op?.uri ?? type;
  if (isReservedVocabularyUri(uri)) return null;
  // A full-IRI type isn't enough: properties of a slash ontology such as FOAF are typed by full IRI on purpose
  // (#87), so the namespace is compared with the ontology's own (#114).
  const imported = op?.isDefinedBy
    ? isUriFromExternalOntology(uri, op.isDefinedBy, externalOntologyReferences, mainBase)
    : isImportedRelationshipType(uri) && !inMainNamespace(uri, mainBase);
  if (!imported) return null;
  const ontologyUrl = op?.isDefinedBy ?? (isImportedRelationshipType(uri) ? namespaceOf(uri) : null);
  return importedNoteText(getPrefixForUri(uri, op?.isDefinedBy, externalOntologyReferences, mainBase), ontologyUrl);
}

/** The note for a data property box, or null when the property is the loaded ontology's own. */
export function importedNoteForDataProperty(
  dp: Pick<DataPropertyInfo, 'uri' | 'isDefinedBy'> | undefined,
  externalOntologyReferences: ExternalOntologyReference[],
  mainBase: string | null
): string | null {
  if (!dp || (dp.uri && isReservedVocabularyUri(dp.uri))) return null;
  if (!isUriFromExternalOntology(dp.uri, dp.isDefinedBy, externalOntologyReferences, mainBase)) return null;
  const ontologyUrl = dp.isDefinedBy ?? (dp.uri ? namespaceOf(dp.uri) : null);
  return importedNoteText(getPrefixForUri(dp.uri, dp.isDefinedBy, externalOntologyReferences, mainBase), ontologyUrl);
}
