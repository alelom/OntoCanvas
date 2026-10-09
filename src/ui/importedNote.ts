/**
 * The small line above the label of a class or relationship defined in another ontology (#111):
 * "(defined by: <prefix>)" when the defining ontology has a prefix, "(imported)" otherwise. It is drawn with
 * vis-network's HTML multi-font (`<i>` text takes the `ital` font), so the label's own text is escaped.
 */

import type { GraphNode, ObjectPropertyInfo } from '../types';
import type { ExternalOntologyReference } from '../storage';
import { getNodePrefix, getPrefixForUri } from './externalRefs';
import { isDefinedElsewhere } from '../graph/definedElsewhere';
import { OWL_THING_URI } from '../graph/thingNode';

const NOTE_FONT_RATIO = 0.55;
const MIN_NOTE_FONT_SIZE = 7;

/** The note: names the defining ontology's prefix when it has one. */
export function importedNoteText(prefix: string | null | undefined): string {
  return prefix ? `(defined by: ${prefix})` : '(imported)';
}

/** The note's font size for a label drawn at `labelFontSize`: smaller, but still readable. */
export function importedNoteFontSize(labelFontSize: number): number {
  return Math.max(MIN_NOTE_FONT_SIZE, Math.round(labelFontSize * NOTE_FONT_RATIO));
}

/** Escape what the HTML multi-font would read as markup. */
export function escapeLabelMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** `label` (already wrapped) with the note on its own line above it. */
export function labelWithImportedNote(label: string, note: string): string {
  return `<i>${escapeLabelMarkup(note)}</i>\n${escapeLabelMarkup(label)}`;
}

/** The font options that make vis-network draw the note: HTML multi-font, with a smaller upright font for it. */
export function importedNoteFont(labelFontSize: number, color: string): {
  multi: 'html';
  ital: { size: number; color: string; mod: string };
} {
  return { multi: 'html', ital: { size: importedNoteFontSize(labelFontSize), color, mod: '' } };
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
  return importedNoteText(getNodePrefix(node, externalOntologyReferences));
}

/** The note for a relationship type, or null when it is local (or subClassOf). */
export function importedNoteForRelationship(
  type: string,
  objectProperties: ObjectPropertyInfo[],
  externalOntologyReferences: ExternalOntologyReference[],
  mainBase: string | null
): string | null {
  if (!isImportedRelationshipType(type)) return null;
  const op = objectProperties.find((p) => p.name === type || p.uri === type);
  return importedNoteText(getPrefixForUri(op?.uri ?? type, op?.isDefinedBy, externalOntologyReferences, mainBase));
}
