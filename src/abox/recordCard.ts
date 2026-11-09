/**
 * The record card of an individual (#229): what it says, grouped by property, the named graphs that says it in, and the way back
 * and forward between the cards visited. Pure: links in, groups out; the history keeps IRIs only.
 */
import type { DescribedLink } from './individualIndex';

export interface PropertyGroup {
  predicate: string;
  links: DescribedLink[];
}

/** The links of each property together, in the order the links come (the index sorts them by property). */
export function groupByPredicate(links: DescribedLink[]): PropertyGroup[] {
  const groups = new Map<string, DescribedLink[]>();
  for (const link of links) {
    const group = groups.get(link.predicate);
    if (group) group.push(link);
    else groups.set(link.predicate, [link]);
  }
  return [...groups].map(([predicate, grouped]) => ({ predicate, links: grouped }));
}

/** The graphs the links come from, once each, in the order met; the default graph is ''. */
export function graphsOf(links: DescribedLink[]): string[] {
  return [...new Set(links.map((link) => link.graph))];
}

export interface CardHistory {
  /** Shows a card: the cards ahead of the one shown are dropped, as a browser does. */
  visit(iri: string): void;
  /** The card before, or the one shown when there is none. */
  back(): string | null;
  forward(): string | null;
  canBack(): boolean;
  canForward(): boolean;
  current(): string | null;
  /** Keeps the cards of the individuals `known` says are still there (the data changed). */
  keep(known: (iri: string) => boolean): void;
  clear(): void;
}

export function createCardHistory(): CardHistory {
  let cards: string[] = [];
  let at = -1;
  const current = (): string | null => cards[at] ?? null;
  return {
    visit(iri) {
      if (current() === iri) return;
      cards = [...cards.slice(0, at + 1), iri];
      at = cards.length - 1;
    },
    back() {
      if (at > 0) at--;
      return current();
    },
    forward() {
      if (at < cards.length - 1) at++;
      return current();
    },
    canBack: () => at > 0,
    canForward: () => at < cards.length - 1,
    current,
    keep(known) {
      const shown = current();
      const kept: string[] = [];
      let place = -1;
      cards.forEach((iri, i) => {
        if (!known(iri)) return;
        // Two cards that come together once the ones between are gone are one.
        if (kept[kept.length - 1] !== iri) kept.push(iri);
        if (i <= at) place = kept.length - 1;
      });
      cards = kept;
      at = place >= 0 ? place : kept.length ? 0 : -1;
      // The card shown stays shown while it is there.
      if (shown !== null && known(shown)) at = kept.lastIndexOf(shown, Math.max(place, 0));
    },
    clear() {
      cards = [];
      at = -1;
    },
  };
}
