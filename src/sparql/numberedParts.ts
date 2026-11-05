/**
 * Datasets split into numbered parts (#225): `part-0001.nq.gz`, `data-0002-of-0005.ttl`, `run.part03.trig`. One part alone is an
 * incomplete picture, and a browser cannot see the files next to one the user picked, so the app cannot fetch the others; it
 * can tell the user which numbers seem to be missing. Pure: names in, groups and a notice out.
 */

export interface PartGroup {
  /** The name of the parts with the number as N, without .gz: `part-N.nq`. */
  name: string;
  numbers: number[];
  /** The number of parts, when the names say it (`-of-NNNN`). */
  total: number | null;
  /** The numbers below the highest (or up to the total) that were not added. */
  missing: number[];
  /** Whether parts after the highest may exist: always, unless the names say the total. */
  moreMayExist: boolean;
}

const OF_TOTAL = /^(.*?)(\d+)-of-(\d+)(\..*)?$/i;
const PART = /^(.*?part)([-_.]?)(\d+)(\..*)?$/i;

/** Above this a number is not a part number but a date or an id (`export-part-20240115`), and the gaps below it would be millions. */
const MAX_PART_NUMBER = 100_000;
/** Up to this many missing parts are listed by number; more are counted. */
const MAX_LISTED = 20;

const withoutGz = (name: string): string => name.replace(/\.gz$/i, '');

function parse(fileName: string): { name: string; number: number; total: number | null } | null {
  const name = withoutGz(fileName);
  const of = OF_TOTAL.exec(name);
  if (of) {
    const [number, total] = [Number(of[2]), Number(of[3])];
    if (total > MAX_PART_NUMBER || number > total) return null;
    return { name: `${of[1]}N-of-${total}${of[4] ?? ''}`, number, total };
  }
  const part = PART.exec(name);
  if (part && Number(part[3]) <= MAX_PART_NUMBER) return { name: `${part[1]}${part[2]}N${part[4] ?? ''}`, number: Number(part[3]), total: null };
  return null;
}

/** The numbered-part groups among the names, in order of first appearance. */
export function findPartGroups(fileNames: string[]): PartGroup[] {
  const groups = new Map<string, { numbers: Set<number>; total: number | null }>();
  for (const fileName of fileNames) {
    const part = parse(fileName);
    if (!part) continue;
    const group = groups.get(part.name) ?? { numbers: new Set<number>(), total: part.total };
    group.numbers.add(part.number);
    groups.set(part.name, group);
  }
  return [...groups].map(([name, { numbers: set, total }]) => {
    const numbers = [...set].sort((a, b) => a - b);
    const first = numbers[0] === 0 ? 0 : 1;
    const last = total ?? numbers[numbers.length - 1];
    const missing: number[] = [];
    for (let n = first; n <= last; n++) if (!set.has(n)) missing.push(n);
    return { name, numbers, total, missing, moreMayExist: total === null };
  });
}

/** "3", "2 and 4", "2, 3 and 4". */
const inWords = (numbers: number[]): string =>
  numbers.length === 1 ? String(numbers[0]) : `${numbers.slice(0, -1).join(', ')} and ${numbers[numbers.length - 1]}`;

function sentence(group: PartGroup): { strong: boolean; text: string } | null {
  const { name, numbers, total, missing } = group;
  const last = numbers[numbers.length - 1];
  const which =
    missing.length > MAX_LISTED
      ? `${missing.length} parts${total === null ? ` between ${missing[0] === 0 ? 0 : 1} and ${last}` : ''}`
      : `${missing.length === 1 ? 'part' : 'parts'} ${inWords(missing)}`;
  if (total !== null) {
    if (!missing.length) return null;
    return { strong: true, text: `This looks like part of a dataset split into numbered parts (${name}): ${which} of ${total} ${missing.length === 1 ? 'is' : 'are'} missing. Add them.` };
  }
  if (missing.length) {
    return { strong: true, text: `This looks like part of a dataset split into numbered parts (${name}): ${which}, and any after ${last}, may be missing. Add them, if they exist.` };
  }
  return { strong: false, text: `Parts ${numbers[0]} to ${last} of a dataset split into numbered parts (${name}) are added. There may be more: add them, if they exist.` };
}

/** What to tell the user about the groups, or null when nothing seems to be missing. Strong when a part is known to be missing. */
export function partsNotice(groups: PartGroup[]): { strong: boolean; text: string } | null {
  const sentences = groups.map(sentence).filter((s): s is { strong: boolean; text: string } => s !== null);
  if (!sentences.length) return null;
  return { strong: sentences.some((s) => s.strong), text: sentences.map((s) => s.text).join(' ') };
}
