/**
 * The individuals of the open ontology and of the data added to it (#208), over several stores at once: counted per class,
 * listed a page at a time, described. Pure and read-only: stores in, plain objects out. An individual is what the bottom-bar
 * notice calls one (`individualsOf`); one typed in two stores is one individual.
 *
 * Built when the tab opens and again when the data changes: it reads the stores once for the individuals and their classes,
 * and looks up labels and links only for what is asked.
 */
import type { Store } from 'n3';
import { individualsOf, isClassOfIndividuals } from '../lib/instanceData';
import { extractLocalName } from '../utils/localName';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

/** The pseudo class of the individuals that have none (typed only as owl:NamedIndividual). */
export const NO_CLASS = 'urn:ontocanvas:no-class';

export interface ClassCount {
  classIri: string;
  count: number;
}

export interface IndividualItem {
  iri: string;
  /** The label shown for it, or null when it has none (the name stands for it). */
  label: string | null;
}

export interface ListOptions {
  /** A class IRI, NO_CLASS, or none for every individual. */
  classIri?: string | null;
  /** Matched against the label and the IRI, ignoring case. */
  search?: string;
  offset: number;
  limit: number;
}

export interface DescribedTerm {
  termType: 'NamedNode' | 'BlankNode' | 'Literal';
  value: string;
  datatype?: string;
  language?: string;
}

export interface DescribedLink {
  subject: string;
  predicate: string;
  object: DescribedTerm;
  /** The object is an individual, so it can be followed. */
  objectIsIndividual: boolean;
}

export interface IndividualDetail {
  iri: string;
  labels: string[];
  types: string[];
  outgoing: DescribedLink[];
  outgoingTotal: number;
  incoming: DescribedLink[];
  incomingTotal: number;
}

export interface IndividualIndex {
  classCounts(): { total: number; classes: ClassCount[]; withoutClass: number };
  list(options: ListOptions): { items: IndividualItem[]; total: number };
  describe(iri: string, options?: { maxRows?: number }): IndividualDetail;
}

const DEFAULT_MAX_ROWS = 100;

// One collator: `localeCompare` with options builds one per call, which took seconds to sort 100k individuals.
const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const byText = (a: string, b: string): number => collator.compare(a, b);

export function createIndividualIndex(stores: Store[]): IndividualIndex {
  const individuals = new Set<string>();
  for (const store of stores) for (const iri of individualsOf(store)) individuals.add(iri);

  // The classes of each individual, whichever store types it.
  const members = new Map<string, Set<string>>();
  const typed = new Set<string>();
  for (const store of stores) {
    for (const quad of store.getQuads(null, RDF_TYPE, null, null)) {
      if (!individuals.has(quad.subject.value) || quad.object.termType !== 'NamedNode' || !isClassOfIndividuals(quad.object.value)) continue;
      typed.add(quad.subject.value);
      let set = members.get(quad.object.value);
      if (!set) members.set(quad.object.value, (set = new Set()));
      set.add(quad.subject.value);
    }
  }

  interface Label {
    text: string;
    language: string;
  }
  const labelCache = new Map<string, Label[]>();
  const labelsOf = (iri: string): Label[] => {
    let labels = labelCache.get(iri);
    if (!labels) {
      labels = [];
      for (const store of stores) {
        for (const quad of store.getQuads(iri, RDFS_LABEL, null, null)) {
          if (quad.object.termType === 'Literal') labels.push({ text: quad.object.value, language: quad.object.language });
        }
      }
      labelCache.set(iri, labels);
    }
    return labels;
  };
  /** The label shown: one with no language or in English before one in another language; null when there is none. */
  const labelOf = (iri: string): string | null => {
    const labels = labelsOf(iri);
    const preferred = labels.find((l) => !l.language) ?? labels.find((l) => /^en(-|$)/i.test(l.language)) ?? labels[0];
    return preferred ? preferred.text : null;
  };

  /** The individuals of a class (or of none, or all), sorted by what is shown for them; kept, since the stores do not change under an index. */
  interface SortedItem extends IndividualItem {
    sortKey: string;
    haystack: string;
  }
  const sortedCache = new Map<string | null, SortedItem[]>();
  const sortedFor = (classIri: string | null): SortedItem[] => {
    let sorted = sortedCache.get(classIri);
    if (!sorted) {
      const pool = classIri === NO_CLASS ? [...individuals].filter((iri) => !typed.has(iri)) : classIri ? [...(members.get(classIri) ?? [])] : [...individuals];
      sorted = pool
        .map((iri) => {
          const label = labelOf(iri);
          return { iri, label, sortKey: label ?? extractLocalName(iri), haystack: `${label ?? ''}\n${iri}`.toLowerCase() };
        })
        .sort((a, b) => byText(a.sortKey, b.sortKey) || (a.iri < b.iri ? -1 : a.iri > b.iri ? 1 : 0));
      sortedCache.set(classIri, sorted);
    }
    return sorted;
  };

  return {
    classCounts() {
      const classes = [...members].map(([classIri, set]) => ({ classIri, count: set.size })).sort((a, b) => b.count - a.count || byText(a.classIri, b.classIri));
      return { total: individuals.size, classes, withoutClass: individuals.size - typed.size };
    },

    list({ classIri, search, offset, limit }) {
      const sorted = sortedFor(classIri ?? null);
      const needle = search?.trim().toLowerCase();
      // Filtering keeps the order, so a search does not sort again.
      const matching = needle ? sorted.filter((item) => item.haystack.includes(needle)) : sorted;
      return { items: matching.slice(offset, offset + limit).map(({ iri, label }) => ({ iri, label })), total: matching.length };
    },

    describe(iri, { maxRows = DEFAULT_MAX_ROWS } = {}) {
      const describedTerm = (term: { termType: string; value: string; datatype?: { value: string }; language?: string }): DescribedTerm => ({
        termType: term.termType === 'Literal' ? 'Literal' : term.termType === 'BlankNode' ? 'BlankNode' : 'NamedNode',
        value: term.value,
        ...(term.termType === 'Literal' && term.datatype ? { datatype: term.datatype.value } : {}),
        ...(term.termType === 'Literal' && term.language ? { language: term.language } : {}),
      });
      const link = (subject: string, predicate: string, object: Parameters<typeof describedTerm>[0]): DescribedLink => ({
        subject,
        predicate,
        object: describedTerm(object),
        objectIsIndividual: object.termType === 'NamedNode' && individuals.has(object.value),
      });
      const order = (a: DescribedLink, b: DescribedLink) => byText(a.predicate, b.predicate) || byText(a.subject, b.subject) || byText(a.object.value, b.object.value);
      const outgoing: DescribedLink[] = [];
      const incoming: DescribedLink[] = [];
      const types = new Set<string>();
      for (const store of stores) {
        for (const quad of store.getQuads(iri, null, null, null)) {
          if (quad.predicate.value === RDF_TYPE) {
            if (quad.object.termType === 'NamedNode') types.add(quad.object.value);
          } else if (quad.predicate.value !== RDFS_LABEL) {
            outgoing.push(link(iri, quad.predicate.value, quad.object));
          }
        }
        for (const quad of store.getQuads(null, null, iri, null)) incoming.push(link(quad.subject.value, quad.predicate.value, quad.object));
      }
      outgoing.sort(order);
      incoming.sort(order);
      return {
        iri,
        labels: labelsOf(iri).map((l) => l.text),
        types: [...types],
        outgoing: outgoing.slice(0, maxRows),
        outgoingTotal: outgoing.length,
        incoming: incoming.slice(0, maxRows),
        incomingTotal: incoming.length,
      };
    },
  };
}
