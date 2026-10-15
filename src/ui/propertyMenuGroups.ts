/**
 * How the property menus (Object, Data, Annotation) and the class dialogs group their entries (#137): the open
 * ontology's own properties first; those defined elsewhere (imports, standard vocabularies) below, by where they are
 * defined; then the deprecated ones (owl:deprecated), whatever their source or use; and, for annotations, those
 * used nowhere ("Not used"). Pure: the menus give each entry's facts, this decides the layout.
 */

export interface MenuEntry<T> {
  item: T;
  /** Where the property is defined when it is not the open ontology (a prefix or ontology name); null when it is. */
  source: string | null;
  /** Declared owl:deprecated: listed under "Deprecated", whatever its source or use. */
  deprecated: boolean;
  /** Annotation menus: used nowhere in the ontology ("Not used"). */
  unused?: boolean;
}

export interface MenuGroups<T> {
  own: MenuEntry<T>[];
  /** By source, alphabetically. */
  external: { source: string; entries: MenuEntry<T>[] }[];
  deprecated: MenuEntry<T>[];
  unused: MenuEntry<T>[];
}

/** The group an entry is shown in: a property is only moved (up/down in priority) within it. */
export function menuGroupKey(entry: MenuEntry<unknown>): string {
  if (entry.deprecated) return 'deprecated';
  if (entry.unused) return 'unused';
  return entry.source === null ? 'own' : `external:${entry.source}`;
}

export function groupMenuEntries<T>(entries: readonly MenuEntry<T>[]): MenuGroups<T> {
  const sorted = sortByMenuGroup(entries);
  const inGroup = (key: string) => sorted.filter((x) => menuGroupKey(x) === key);
  const sources = [...new Set(sorted.filter((x) => menuGroupKey(x).startsWith('external:')).map((x) => x.source!))];
  return {
    own: inGroup('own'),
    external: sources.map((source) => ({ source, entries: inGroup(`external:${source}`) })),
    deprecated: inGroup('deprecated'),
    unused: inGroup('unused'),
  };
}

/** The items in the order shown: own, each source, deprecated, then the unused. For annotations, the priority order. */
export function menuOrder<T>(groups: MenuGroups<T>): T[] {
  return [...groups.own, ...groups.external.flatMap((g) => g.entries), ...groups.deprecated, ...groups.unused].map((x) => x.item);
}

/**
 * A mixed list (Boolean and Text annotations, which share one priority order) sorted as the groups show it: own,
 * then each source alphabetically, then deprecated, then the unused (own before others); otherwise the order is
 * kept, so properties of different kinds keep their relative priority.
 */
export function sortByMenuGroup<T>(entries: readonly MenuEntry<T>[]): MenuEntry<T>[] {
  const sources = [...new Set(entries.filter((x) => menuGroupKey(x).startsWith('external:')).map((x) => x.source!))].sort((a, b) => a.localeCompare(b));
  const rank = (x: MenuEntry<T>): number[] => {
    const key = menuGroupKey(x);
    if (key === 'deprecated') return [sources.length + 1, 0];
    if (key === 'unused') return [sources.length + 2, x.source === null ? 0 : 1];
    return [x.source === null ? 0 : 1 + sources.indexOf(x.source), 0];
  };
  return entries
    .map((x, i) => ({ x, i, r: rank(x) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
    .map(({ x }) => x);
}
