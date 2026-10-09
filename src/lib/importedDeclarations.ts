/**
 * Declarations in imported ontologies (#104). An ontology that says `owl:imports <X>` and uses terms
 * declared in X says little about them itself: a property used but never declared locally has no label,
 * kind or range. When X can be fetched in the browser, what it declares is read as read-only context and
 * merged into the property lists, shown with the import's prefix. Where it can't be fetched (CORS,
 * offline), nothing changes.
 *
 * The imported ontologies are read into stores of their own and never touch the loaded one, so saving
 * writes exactly what it wrote before. Pure apart from the fetch and parse calls (the fetch is injected).
 */
import type { Store } from 'n3';
import { getAnnotationProperties, getDataProperties, getMainOntologyBase, getObjectProperties } from '../parser';
import { loadOntologyFromContent } from './loadOntology';
import { getOntologyInfo } from '../ui/ontologyInfo';
import { extractLocalName } from '../utils/localName';
import type { AnnotationPropertyInfo, DataPropertyInfo, ObjectPropertyInfo } from '../types';

const OWL_IMPORTS = 'http://www.w3.org/2002/07/owl#imports';

export interface ImportedOntology {
  /** The import's IRI, as written in owl:imports (without a trailing #): the address it is fetched from. */
  url: string;
  /** The ontology's own IRI (its owl:Ontology subject), when it declares one: what its terms are "defined by".
   * It is often not the address it was fetched from. */
  iri: string | null;
  /** Its declarations, in a store of their own. */
  store: Store;
}

export interface PropertyLists {
  objectProperties: ObjectPropertyInfo[];
  dataProperties: DataPropertyInfo[];
  annotationProperties: AnnotationPropertyInfo[];
}

export interface LoadImportsOptions {
  /** How many levels of imports of imports to follow (the imports of the loaded file are level 1). */
  maxDepth?: number;
  /** The most ontologies to read in all. */
  maxOntologies?: number;
  /** How many to fetch and parse at the same time (default 4). */
  concurrency?: number;
  /** The most characters of ontology text to take in, over the whole traversal (default 20 million): each
   * import may be large, and an ontology can name many. */
  maxTotalCharacters?: number;
}

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_MAX_ONTOLOGIES = 20;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_MAX_TOTAL_CHARACTERS = 20_000_000;

/** What the traversal has taken in so far, and may take in all. */
interface SizeBudget {
  used: number;
  max: number;
}

/** `fn` over `items`, at most `limit` at a time; results in order. */
async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

const bareIri = (iri: string) => iri.replace(/#$/, '');

/** The IRIs this store's ontology imports (owl:imports), without a trailing #. */
export function getImportUrls(store: Store): string[] {
  const urls = new Set<string>();
  for (const q of store.getQuads(null, OWL_IMPORTS, null, null)) {
    if (q.object.termType === 'NamedNode') urls.add(bareIri(q.object.value));
  }
  return [...urls];
}

/**
 * Read the imports of `store`, and the imports of those, level by level, each ontology once and never the
 * loaded one again. An import that can't be fetched or parsed is skipped, and so are its own imports.
 *
 * @param fetchTtl - Returns an ontology's text, or null when it can't be had (it may also throw)
 */
export async function loadImportedOntologies(
  store: Store,
  fetchTtl: (url: string) => Promise<string | null>,
  options: LoadImportsOptions = {}
): Promise<ImportedOntology[]> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxOntologies = options.maxOntologies ?? DEFAULT_MAX_ONTOLOGIES;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const budget: SizeBudget = { used: 0, max: options.maxTotalCharacters ?? DEFAULT_MAX_TOTAL_CHARACTERS };
  const mainBase = getMainOntologyBase(store);
  const seen = new Set<string>(mainBase ? [bareIri(mainBase)] : []);
  const result: ImportedOntology[] = [];

  let level = getImportUrls(store);
  for (let depth = 1; depth <= maxDepth && level.length > 0; depth++) {
    // Chosen one by one, so that an ontology listed twice takes one slot, not two.
    const toRead: string[] = [];
    for (const url of level) {
      if (result.length + toRead.length >= maxOntologies) break;
      if (seen.has(url)) continue;
      seen.add(url);
      toRead.push(url);
    }
    const read = await mapWithLimit(toRead, concurrency, (url) => readImport(url, fetchTtl, budget));
    level = [];
    for (const imported of read) {
      if (!imported) continue;
      result.push(imported);
      level.push(...getImportUrls(imported.store));
    }
  }
  return result;
}

/** The RDF format of a document, from its content. Turtle also reads N-Triples. */
function sniffContentType(content: string): string {
  const head = content.trimStart().slice(0, 200);
  if (/^<\?xml|^<(?:rdf:)?RDF[\s>]/i.test(head)) return 'application/rdf+xml';
  if (/^[{[]/.test(head)) return 'application/ld+json';
  return 'text/turtle';
}

async function readImport(
  url: string,
  fetchTtl: (url: string) => Promise<string | null>,
  budget: SizeBudget
): Promise<ImportedOntology | null> {
  try {
    // Nothing more is even asked for once the budget is spent.
    if (budget.used >= budget.max) return null;
    const content = await fetchTtl(url);
    if (!content || !content.trim()) return null;
    if (budget.used + content.length > budget.max) {
      budget.used = budget.max; // spent: the others are not even asked for
      return null;
    }
    budget.used += content.length;
    // The format is read from the content, not the URL: a server may answer an "Accept: text/turtle" request for
    // vocab.owl with Turtle, or one for a bare IRI with RDF/XML.
    const { parseResult } = await loadOntologyFromContent(content, url, { contentType: sniffContentType(content) });
    return { url, iri: getOntologyInfo(parseResult.store, {})?.iri ?? null, store: parseResult.store };
  } catch {
    return null; // CORS, offline, not RDF: the import stays unread
  }
}

/** The properties declared in the imported ontologies, each defined by the import it came from. A property
 * declared in several is listed once (the first, nearest import wins). */
export function readImportedDeclarations(imported: ImportedOntology[]): PropertyLists {
  const objectProperties: ObjectPropertyInfo[] = [];
  const dataProperties: DataPropertyInfo[] = [];
  const annotationProperties: AnnotationPropertyInfo[] = [];
  const seen = new Set<string>();
  const firstTime = (uri: string | undefined, kind: string) => {
    const key = `${kind} ${uri ?? ''}`;
    if (!uri || seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  for (const { url, iri, store } of imported) {
    // Defined by the ontology's IRI: that is what a prefix declared for its namespace is matched on, and the
    // address it was fetched from (a CDN, a versioned file, a redirect) usually is not it.
    const definedBy = iri ?? url;
    for (const p of getObjectProperties(store)) {
      // Named by full IRI, as the object properties of other ontologies are everywhere else.
      if (firstTime(p.uri, 'object')) objectProperties.push({ ...p, name: p.uri!, isDefinedBy: p.isDefinedBy ?? definedBy });
    }
    for (const p of getDataProperties(store)) {
      if (firstTime(p.uri, 'data')) dataProperties.push({ ...p, isDefinedBy: p.isDefinedBy ?? definedBy });
    }
    for (const p of getAnnotationProperties(store)) {
      if (firstTime(p.uri, 'annotation')) annotationProperties.push({ ...p, isDefinedBy: p.isDefinedBy ?? definedBy });
    }
  }
  return { objectProperties, dataProperties, annotationProperties };
}

/** Whether `merged` differs from `before` in anything the canvas draws: the properties the file itself lists
 * (their labels are on edges, their ranges on boxes). Properties added only as context are never drawn, so
 * merging them needs no redraw. */
export function mergeChangesWhatIsDrawn(before: PropertyLists, merged: PropertyLists): boolean {
  const drawn = (lists: PropertyLists) =>
    JSON.stringify([lists.objectProperties.filter((p) => !p.contextOnly), lists.dataProperties.filter((p) => !p.contextOnly)]);
  return drawn(before) !== drawn(merged);
}

/** A label that is only the property's name says nothing; the import's label is better. */
const isPlaceholderLabel = (label: string, name: string) => label === name || label === extractLocalName(name);

/**
 * `local` with what the imports declare merged in; neither argument is changed.
 * - A property declared in an import and not in the loaded file is added, as context only. The object and
 *   data property lists come back sorted by name.
 * - A property the file already lists (typically a stub made from its usage) is filled in with what is
 *   missing (label, comment, range, domain, defining ontology); what the file says always wins.
 * - A local property that merely shares a name with a different imported one is left alone.
 * - An annotation property guessed from usage that an import declares a data or object property is dropped.
 *   Annotation properties declared in imports but not used are not added: they would only add noise.
 */
export function mergeImportedDeclarations(local: PropertyLists, imported: PropertyLists): PropertyLists {
  const objectProperties = local.objectProperties.map((p) => ({ ...p }));
  for (const imp of imported.objectProperties) {
    const existing = objectProperties.find((p) => (p.uri ?? p.name) === (imp.uri ?? imp.name) || p.name === imp.name);
    if (!existing) {
      objectProperties.push({ ...imp, contextOnly: true });
      continue;
    }
    if (isPlaceholderLabel(existing.label, existing.name)) existing.label = imp.label;
    existing.uri ??= imp.uri;
    existing.isDefinedBy ??= imp.isDefinedBy;
    existing.comment ??= imp.comment;
    existing.domain ??= imp.domain;
    existing.range ??= imp.range;
    existing.hasGlobalDomain ||= imp.hasGlobalDomain;
    existing.hasGlobalRange ||= imp.hasGlobalRange;
    existing.subPropertyOf ??= imp.subPropertyOf;
  }

  const dataProperties = local.dataProperties.map((p) => ({ ...p }));
  for (const imp of imported.dataProperties) {
    // A property is identified by its IRI. Data properties are addressed by local name throughout the app, so
    // when that name is taken by a different property (the file's own, or another import's) the imported one is
    // listed under its full IRI, as object properties are; both stay.
    const sameIri = imp.uri ? dataProperties.find((p) => p.uri === imp.uri) : undefined;
    const sameName = dataProperties.find((p) => p.name === imp.name);
    let target = sameIri;
    if (!target) {
      if (!sameName) {
        dataProperties.push({ ...imp, contextOnly: true });
        continue;
      }
      if (!sameName.uri || !imp.uri) target = sameName; // a stub made from usage: fill it in
      else {
        dataProperties.push({ ...imp, name: imp.uri, contextOnly: true });
        continue;
      }
    }
    if (isPlaceholderLabel(target.label, target.name)) target.label = imp.label;
    target.uri ??= imp.uri;
    target.isDefinedBy ??= imp.isDefinedBy;
    target.comment ??= imp.comment;
    if (target.range == null) {
      target.range = imp.range;
      if (imp.rangeExpression) target.rangeExpression = imp.rangeExpression;
    }
    if (target.domains.length === 0 && !target.hasGlobalDomain) {
      target.domains = [...imp.domains];
      target.hasGlobalDomain = imp.hasGlobalDomain;
    }
  }

  const declaredElsewhere = new Set([...imported.dataProperties, ...imported.objectProperties].map((p) => p.uri));
  const importedAnnotations = new Map(imported.annotationProperties.map((p) => [p.uri, p]));
  const annotationProperties = local.annotationProperties
    .filter((p) => !(p.uri && declaredElsewhere.has(p.uri)))
    .map((p) => {
      const imp = importedAnnotations.get(p.uri);
      if (!imp) return { ...p };
      return {
        ...p,
        range: p.range ?? imp.range,
        isBoolean: p.isBoolean || imp.isBoolean,
        comment: p.comment ?? imp.comment,
        isDefinedBy: p.isDefinedBy ?? imp.isDefinedBy,
      };
    });

  // The lists are kept sorted by name, as everywhere else.
  const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name);
  return { objectProperties: objectProperties.sort(byName), dataProperties: dataProperties.sort(byName), annotationProperties };
}
