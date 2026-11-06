/**
 * The classes the loaded imports declare (#235). An ontology's imports are read as read-only context (#104), and they declare
 * the classes of most of a dataset's individuals when the ontology opened is one module of several. Their labels name those
 * classes in the Individuals tab, and a drawn individual joins a labelled class node, "defined by" its ontology, instead of a
 * bare stub (#216). Pure.
 */
import type { ImportedOntology } from '../lib/importedDeclarations';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const CLASS_TYPES = ['http://www.w3.org/2002/07/owl#Class', 'http://www.w3.org/2000/01/rdf-schema#Class'];
const LABELS = ['http://www.w3.org/2000/01/rdf-schema#label', 'http://www.w3.org/2004/02/skos/core#prefLabel'];

export interface ImportedClass {
  label: string | null;
  /** The IRI of the ontology that declares it (or the address it was read from, when it names none). */
  definedBy: string;
}

function labelOf(store: ImportedOntology['store'], iri: string): string | null {
  for (const predicate of LABELS) {
    const labels = store.getObjects(iri, predicate, null).filter((o) => o.termType === 'Literal') as Array<{ value: string; language: string }>;
    const preferred = labels.find((l) => l.language === 'en' || l.language === '') ?? labels[0];
    if (preferred) return preferred.value;
  }
  return null;
}

/** The classes declared in the imports, each once: the first (nearest) import that declares it wins. */
export function importedClasses(imported: Pick<ImportedOntology, 'url' | 'iri' | 'store'>[]): Map<string, ImportedClass> {
  const classes = new Map<string, ImportedClass>();
  for (const { url, iri, store } of imported) {
    for (const type of CLASS_TYPES) {
      for (const subject of store.getSubjects(RDF_TYPE, type, null)) {
        if (subject.termType !== 'NamedNode' || classes.has(subject.value)) continue;
        classes.set(subject.value, { label: labelOf(store, subject.value), definedBy: iri ?? url });
      }
    }
  }
  return classes;
}

/** A short name for an ontology: the last part of its IRI, with the part before it when that last part is a version. */
export function definedByName(iri: string): string {
  const parts = iri.replace(/[#/]+$/, '').split(/[/#]/).filter(Boolean);
  const last = parts[parts.length - 1] ?? iri;
  return /^v?\d+(\.\d+)*$/.test(last) && parts.length > 1 ? `${parts[parts.length - 2]}/${last}` : last;
}

/** Looks a class up in the imports `getImported` gives now, reading their classes again only when the list changes. */
export function importedClassLookup(getImported: () => Pick<ImportedOntology, 'url' | 'iri' | 'store'>[]): (classIri: string) => ImportedClass | null {
  let readFrom: unknown = null;
  let classes = new Map<string, ImportedClass>();
  return (classIri) => {
    const imported = getImported();
    if (imported !== readFrom) {
      readFrom = imported;
      classes = importedClasses(imported);
    }
    return classes.get(classIri) ?? null;
  };
}
