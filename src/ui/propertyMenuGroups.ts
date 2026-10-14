/**
 * How the property menus (Object, Data, Annotation) group their entries (#137): the open ontology's own
 * properties first; those defined elsewhere (imports, standard vocabularies) below, by where they are defined;
 * in the annotation menus, those used nowhere last ("Not used"). Within a group, deprecated
 * properties come after the active ones. Pure: the menus give each entry's facts, this decides the layout.
 */

export interface MenuEntry<T> {
  item: T;
  /** Where the property is defined when it is not the open ontology (a prefix or ontology name); null when it is. */
  source: string | null;
  deprecated: boolean;
  /** Annotation menus: used nowhere in the ontology ("Not used"). */
  unused?: boolean;
}

export interface MenuGroups<T> {
  own: MenuEntry<T>[];
  /** By source, alphabetically. */
  external: { source: string; entries: MenuEntry<T>[] }[];
  unused: MenuEntry<T>[];
}

/** Active entries first, deprecated after; otherwise the order given. */
const activeFirst = <T>(entries: MenuEntry<T>[]): MenuEntry<T>[] => [
  ...entries.filter((x) => !x.deprecated),
  ...entries.filter((x) => x.deprecated),
];

export function groupMenuEntries<T>(entries: readonly MenuEntry<T>[]): MenuGroups<T> {
  const unused = entries.filter((x) => x.unused);
  const used = entries.filter((x) => !x.unused);
  const sources = [...new Set(used.map((x) => x.source).filter((s): s is string => s !== null))].sort((a, b) => a.localeCompare(b));
  const external = sources.map((source) => ({ source, entries: activeFirst(used.filter((x) => x.source === source)) }));
  return {
    own: activeFirst(used.filter((x) => x.source === null)),
    external,
    unused: activeFirst([...unused.filter((x) => x.source === null), ...unused.filter((x) => x.source !== null)]),
  };
}

/** The items in the order shown: own, then each source, then the unused. For annotations, the priority order. */
export function menuOrder<T>(groups: MenuGroups<T>): T[] {
  return [...groups.own, ...groups.external.flatMap((g) => g.entries), ...groups.unused].map((x) => x.item);
}

/**
 * A mixed list (Boolean and Text annotations, which share one priority order) sorted as the menu groups show it:
 * own, then each source alphabetically, then the unused, active before deprecated in each; otherwise the order
 * is kept, so properties of different kinds keep their relative priority.
 */
export function sortByMenuGroup<T>(entries: readonly MenuEntry<T>[]): MenuEntry<T>[] {
  const sources = [...new Set(entries.filter((x) => !x.unused && x.source !== null).map((x) => x.source!))].sort((a, b) => a.localeCompare(b));
  const rank = (x: MenuEntry<T>): number[] => {
    if (x.unused) return [sources.length + 1, x.deprecated ? 1 : 0, x.source === null ? 0 : 1];
    return [x.source === null ? 0 : 1 + sources.indexOf(x.source), 0, x.deprecated ? 1 : 0];
  };
  return entries
    .map((x, i) => ({ x, i, r: rank(x) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.r[2] - b.r[2] || a.i - b.i)
    .map(({ x }) => x);
}

/** The group an entry is shown in: a property is only moved (up/down in priority) within it. */
export function menuGroupKey(entry: MenuEntry<unknown>): string {
  if (entry.unused) return 'unused';
  return entry.source === null ? 'own' : `external:${entry.source}`;
}
