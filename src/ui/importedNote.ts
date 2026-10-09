/**
 * The small line above the label of a term defined in another ontology (#111): "(defined by: <prefix>)",
 * or, when that ontology has no prefix, "(defined by: <its name>)" from its IRI. It covers every kind of
 * externally defined term drawn on the canvas: imported classes, classes declared locally but defined
 * elsewhere (rdfs:isDefinedBy), relationships (object properties) and data properties of another ontology.
 *
 * It is drawn with vis-network's HTML multi-font, in a small monospace face so it reads as a note rather than
 * as part of the name: "(defined by: " and ")" take the `mono` font (`<code>`), and the prefix or name the
 * `ital` font (`<i>`), so that part stands out in italics. The label's own text is escaped.
 */
import type { DataPropertyInfo, GraphNode, ObjectPropertyInfo } from '../types';
import type { ExternalOntologyReference } from '../storage';
import { getNodeOntologyUrl, getNodePrefix, getPrefixForUri, isUriFromExternalOntology } from './externalRefs';
import { isDefinedElsewhere } from '../graph/definedElsewhere';
import { OWL_THING_URI } from '../graph/thingNode';

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

/** The note as multi-font markup: the prefix or name in italics, the rest in the plain note font. */
function noteMarkup(note: string): string {
  const named = /^\(defined by: (.*)\)$/.exec(note);
  if (!named) return `<code>${escapeLabelMarkup(note)}</code>`;
  return `<code>(defined by: </code><i>${escapeLabelMarkup(named[1])}</i><code>)</code>`;
}

/** `label` (already wrapped) with the note on its own line above it. */
export function labelWithImportedNote(label: string, note: string): string {
  return `${noteMarkup(note)}\n${escapeLabelMarkup(label)}`;
}

/** The font options that make vis-network draw the note: HTML multi-font, with a smaller monospace font for
 * the note (`mono`, upright) and for the prefix or name in it (`ital`, italic). */
export function importedNoteFont(labelFontSize: number, color: string): {
  multi: 'html';
  ital: { size: number; color: string; face: string; mod: string };
  mono: { size: number; color: string; face: string; mod: string };
} {
  const size = importedNoteFontSize(labelFontSize);
  return {
    multi: 'html',
    ital: { size, color, face: NOTE_FONT_FACE, mod: 'italic' },
    mono: { size, color, face: NOTE_FONT_FACE, mod: '' },
  };
}

/** Whether an edge type is an object property of another ontology: those are named by their full IRI, local
 * ones by their local name (see getObjectProperties). */
export function isImportedRelationshipType(type: string): boolean {
  return /^https?:\/\//i.test(type);
}

/** The note for a class node, or null when it is local. owl:Thing, added for display, is not an import. */
export function importedNoteForNode(
  node: GraphNode,
  externalOntologyReferences: ExternalOntologyReference[],
  mainBase: string | null
): string | null {
  if (node.id === OWL_THING_URI) return null;
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
  const imported =
    isImportedRelationshipType(type) ||
    (!!op?.isDefinedBy && isUriFromExternalOntology(uri, op.isDefinedBy, externalOntologyReferences, mainBase));
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
  if (!dp || !isUriFromExternalOntology(dp.uri, dp.isDefinedBy, externalOntologyReferences, mainBase)) return null;
  const ontologyUrl = dp.isDefinedBy ?? (dp.uri ? namespaceOf(dp.uri) : null);
  return importedNoteText(getPrefixForUri(dp.uri, dp.isDefinedBy, externalOntologyReferences, mainBase), ontologyUrl);
}
