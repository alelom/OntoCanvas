/**
 * The ontology's property lists as the menus and modals use them, and small lookups on them.
 * Moved out of main.ts (#175).
 */
import { stylingOrder } from '../lib/annotationStyle';
import { getAnnotationValuesForClass } from '../lib/annotationValues';
import { mergeImportedDeclarations } from '../lib/importedDeclarations';
import { findVersions } from '../lib/ontologyVersions';
import { browserVersionSources } from '../lib/versionSources';
import { getObjectProperties, getDataProperties, BASE_IRI, getMainOntologyBase } from '../parser';
import { session } from '../state/appState';
import type { ExternalOntologyReference } from '../storage';
import type { ObjectPropertyInfo, DataPropertyInfo } from '../types';
import { refreshExternalRefsList } from '../ui/externalRefs';
import * as nodeModalFormUi from '../ui/nodeModalFormUi';
import { propertySource, annotationUsedAnywhere, annotationDisplayName } from '../ui/propertyMenuFacts';

/**
 * Build the dependency bundle the annotation-properties list needs to render textual properties
 * as multi-value editors. `nodeId` is the class being edited (null for a new node, so initial
 * values are empty). `valuesMap` is seeded with each property's current values and updated on edit.
 */
export function buildAnnotationPropsDeps(
  nodeId: string | null,
  valuesMap: Record<string, string[]>
): nodeModalFormUi.AnnotationPropsListDeps {
  return {
    getInitialValues: (ap) => {
      if (!session.ttlStore || !nodeId) {
        valuesMap[ap.name] = [];
        return [];
      }
      const propUri = ap.uri ?? BASE_IRI.replace(/#?$/, '#') + ap.name;
      const values = getAnnotationValuesForClass(session.ttlStore, nodeId, propUri);
      valuesMap[ap.name] = [...values];
      return values;
    },
    onTextualValuesChange: (name, values) => {
      valuesMap[name] = values;
    },
    onOpenLink: (value) => {
      window.open(value, '_blank', 'noopener,noreferrer');
    },
    // Grouped as in the Annotation Properties menu (#141).
    groupFacts: (ap) => ({
      source: propertySource(ap, session.externalOntologyReferences, session.ttlStore ? getMainOntologyBase(session.ttlStore) : null),
      unused: !!session.ttlStore && !!ap.uri && !annotationUsedAnywhere(session.ttlStore, ap.uri),
      deprecated: !!ap.deprecated,
    }),
    displayName: (ap) => annotationDisplayName(ap, session.externalOntologyReferences, session.ttlStore ? getMainOntologyBase(session.ttlStore) : null),
  };
}

// Helper to get defining ontology from URI
export function getDefiningOntologyFromUri(uri: string | null | undefined, externalOntologyReferences: ExternalOntologyReference[]): string {
  if (!uri) return 'an external ontology';
  for (const ref of externalOntologyReferences) {
    const refUrl = ref.url.endsWith('#') ? ref.url.slice(0, -1) : ref.url;
    if (uri.startsWith(refUrl) || uri.startsWith(refUrl + '#')) {
      return ref.url;
    }
  }
  return 'an external ontology';
}

/** Property local names in priority order (highest first) for annotation styling. */
/** The annotation properties that style classes, in priority order: deprecated ones never do. */
export function annotationPriorityOrder(): string[] {
  return stylingOrder(session.annotationProperties);
}

/** The object properties of `store`, with what the imports declare merged in. */
export function currentObjectProperties(store: NonNullable<typeof session.ttlStore>): ObjectPropertyInfo[] {
  const own = getObjectProperties(store);
  return session.importedDeclarations
    ? mergeImportedDeclarations({ objectProperties: own, dataProperties: [], annotationProperties: [] }, session.importedDeclarations).objectProperties
    : own;
}

/** The data properties of `store`, with what the imports declare merged in. */
export function currentDataProperties(store: NonNullable<typeof session.ttlStore>): DataPropertyInfo[] {
  const own = getDataProperties(store);
  return session.importedDeclarations
    ? mergeImportedDeclarations({ objectProperties: [], dataProperties: own, annotationProperties: [] }, session.importedDeclarations).dataProperties
    : own;
}

/** Look, in the background, for a newer release of each import that was read (#132); the imports dialog names it. */
export async function findImportsNewerVersions(store: NonNullable<typeof session.ttlStore>): Promise<void> {
  const found = await Promise.all(session.importedOntologies.map(async (o) => [o.url, (await findVersions(o.store, o.url, browserVersionSources)).newer?.version ?? null] as const));
  if (store !== session.ttlStore) return;
  session.importNewerVersions = new Map(found);
  refreshExternalRefsList();
}
