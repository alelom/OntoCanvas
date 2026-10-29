/**
 * The identifier line of an edit dialog (#146): the real IRI of a term that exists, and a name made up from the label only
 * for what a dialog is about to create or rename. A label edit never changes the IRI of a class, and changes the IRI of a
 * property only when it gives it a different name (see the confirm of the property dialogs).
 */
import type { Store } from 'n3';
import { resolveClassUri } from '../ontology/editClasses';
import { BASE_IRI } from '../ontology/vocab';
import { extractLocalName } from '../utils/localName';
import { labelToCamelCaseIdentifier } from './identifierFromLabel';

export interface IdentifierLine {
  caption: string;
  text: string;
}

export const IDENTIFIER_CAPTION = 'Identifier:';
export const IDENTIFIER_WILL_BECOME_CAPTION = 'Identifier (will become):';
export const IDENTIFIER_DERIVED_CAPTION = 'Identifier (derived from label):';

/** The identifier of an existing class: its IRI, read from the store. */
export function classIdentifierLine(store: Store | null | undefined, nodeId: string): IdentifierLine {
  return { caption: IDENTIFIER_CAPTION, text: store ? resolveClassUri(store, nodeId) : BASE_IRI + nodeId };
}

/**
 * The identifier of an existing property: its IRI, until the label is changed to one that gives it another name; then the
 * IRI it will have, in its own namespace. `iri` is the property's IRI as it is now.
 */
export function propertyIdentifierLine({ iri, originalLabel, newLabel }: { iri: string; originalLabel: string | undefined; newLabel: string }): IdentifierLine {
  const label = newLabel.trim();
  const current = extractLocalName(iri);
  const derived = label && label !== (originalLabel ?? '') ? labelToCamelCaseIdentifier(label) : '';
  if (derived && derived !== current) {
    return { caption: IDENTIFIER_WILL_BECOME_CAPTION, text: iri.slice(0, iri.length - current.length) + derived };
  }
  return { caption: IDENTIFIER_CAPTION, text: iri };
}
