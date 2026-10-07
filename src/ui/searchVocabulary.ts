/**
 * The names the search bar knows each term by (#81): relationships, classes and data properties, with
 * their prefixed name (`foaf:member`), label and full IRI. Feeds both the suggestions
 * (lib/searchSuggestions.ts) and the highlighting (lib/searchHighlight.ts SearchExtras), so what the
 * dropdown offers is exactly what search then finds. Kept out of main.ts.
 */
import type { DataPropertyInfo, GraphNode, ObjectPropertyInfo } from '../types';
import type { ExternalOntologyReference } from '../storage';
import type { SearchExtras, SearchableDataProperty } from '../lib/searchHighlight';
import { prefixedName, type SuggestionSource } from '../lib/searchSuggestions';
import { appliesToClass } from '../lib/dataPropertyDisplay';
import { getNodePrefix, getPrefixForUri } from './externalRefs';
import { getRelationshipLabel } from './relationshipUtils';

export interface SearchVocabularyInput {
  nodes: GraphNode[];
  edgeTypes: string[];
  objectProperties: ObjectPropertyInfo[];
  dataProperties: DataPropertyInfo[];
  externalOntologyReferences: ExternalOntologyReference[];
  mainOntologyBase: string | null;
}

export interface SearchVocabulary {
  sources: SuggestionSource[];
  extras: Required<Pick<SearchExtras, 'nodeNames' | 'edgeNames'>>;
  /** Searchable data properties, with the classes (among `nodes`) their boxes hang on. */
  dataProperties: SearchableDataProperty[];
}

const isIri = (s: string) => /^https?:\/\//.test(s);

export function buildSearchVocabulary(input: SearchVocabularyInput): SearchVocabulary {
  const { nodes, edgeTypes, objectProperties, dataProperties, externalOntologyReferences: refs, mainOntologyBase } = input;
  const prefixOf = (iri: string, isDefinedBy?: string | null) => getPrefixForUri(iri, isDefinedBy ?? null, refs, mainOntologyBase);

  // Relationships: the type is a local name, or a full IRI for properties outside the main namespace.
  const edgeNameMap = new Map<string, string[]>();
  const relationshipSources: SuggestionSource[] = edgeTypes.map((type) => {
    const op = objectProperties.find((p) => p.uri === type || p.name === type);
    const iri = isIri(type) ? type : op?.uri ?? type;
    const display = isIri(type) ? prefixedName(type, prefixOf(type, op?.isDefinedBy)) : type;
    const names = [display, type, iri, getRelationshipLabel(type, objectProperties, refs)];
    edgeNameMap.set(type, names);
    return { kind: 'relationship', display, title: iri, names };
  });

  // Classes: matched by label/id already, and also by the prefixed name the canvas shows — for a class
  // defined elsewhere, whether its id is a full IRI (skos:Concept) or a local name (FOAF's Agent).
  const nodeNameMap = new Map<string, string[]>();
  const classSources: SuggestionSource[] = nodes.map((n) => {
    const prefix = getNodePrefix(n, refs) ?? (isIri(n.id) ? prefixOf(n.id) : null);
    const display = prefix ? prefixedName(n.id, prefix) : isIri(n.id) ? prefixedName(n.id, null) : n.label || n.id;
    const names = [display, n.label || '', n.id];
    nodeNameMap.set(n.id, names);
    return { kind: 'class', display, title: n.id, names };
  });

  // Data properties: by identifier, label, IRI and prefixed name; boxes on the classes they apply to
  // (domains / owl:Thing), plus any class holding a data-property restriction on it.
  const searchableDataProperties: SearchableDataProperty[] = [];
  const dataPropertySources: SuggestionSource[] = dataProperties.map((dp) => {
    const prefix = dp.uri ? prefixOf(dp.uri, dp.isDefinedBy) : null;
    const display = prefix && dp.uri ? prefixedName(dp.uri, prefix) : dp.name;
    const names = [display, dp.name, dp.label, dp.uri ?? ''];
    const classIds = nodes
      .filter((n) => appliesToClass(dp, n.id) || (n.dataPropertyRestrictions ?? []).some((r) => r.propertyName === dp.name))
      .map((n) => n.id);
    searchableDataProperties.push({ name: dp.name, names, classIds });
    return { kind: 'data property', display, title: dp.uri ?? dp.name, names };
  });

  return {
    sources: [...relationshipSources, ...classSources, ...dataPropertySources],
    extras: {
      nodeNames: (id) => nodeNameMap.get(id) ?? [],
      edgeNames: (type) => edgeNameMap.get(type) ?? [],
    },
    dataProperties: searchableDataProperties,
  };
}
