/**
 * The other versions of the open ontology, and whether a newer one than the loaded version exists (#132).
 *
 * OntoCanvas has no server, so it can only use what a browser may read. The sources, each optional:
 *  - owl:priorVersion in the file itself: older releases, with no network;
 *  - the ontology IRI, which names the latest release: reading it tells whether a newer one exists, and its own
 *    owl:priorVersion names the releases in between;
 *  - GitHub tags, when the file is served from raw.githubusercontent.com: the file at each tag where it exists;
 *  - the versions already seen in this tab, so that an older version, which cannot name the ones released after
 *    it, still offers them after switching to it.
 * The network is only used for an ontology opened by URL: a file opened from disk (often a working copy) is
 * never looked up. A source that fails (offline, CORS, rate limit) is skipped. Network access is passed in,
 * so this stays pure.
 */
import type { Store } from 'n3';
import { bareIri, compareVersions, readOntologyVersion, versionInIri, versionLabel } from './ontologyVersion';

const OWL_PRIOR_VERSION = 'http://www.w3.org/2002/07/owl#priorVersion';
/** At most this many tags are checked for the file, newest first: one request each. */
const MAX_TAGS = 20;
/** The most parts a branch name is read with (`feat/new-thing` has two). */
const MAX_REF_PARTS = 3;

export interface VersionEntry {
  version: string;
  /** Where to open it; null for the loaded version when it was not opened from an address. */
  url: string | null;
  /** Where it was found; `seen`: opened, or listed, earlier in this tab. */
  source: 'loaded' | 'latest' | 'github' | 'prior' | 'seen';
}

export interface AvailableVersions {
  /** The loaded version, or null when the ontology declares none. */
  loaded: string | null;
  /** Newest first; version numbers that cannot be compared come last. */
  entries: VersionEntry[];
  /** The newest version above the loaded one, when one is known. */
  newer: VersionEntry | null;
  /**
   * Whether the loaded version is the latest: "certain" when it was opened from the ontology IRI, or the ontology
   * IRI names it; "known" when other versions are known and none is newer; null otherwise.
   */
  latest: 'certain' | 'known' | null;
}

export interface VersionSources {
  /** The text at an address, or null when it cannot be read. */
  fetchText(url: string): Promise<string | null>;
  /** JSON from an address, or null. */
  fetchJson(url: string): Promise<unknown>;
  /** Whether a file exists at an address. */
  exists(url: string): Promise<boolean>;
  /** An ontology text read into a store, with relative IRIs resolved against `url`; null when it is not RDF. */
  parse(text: string, url: string): Promise<Store | null>;
}

export interface GithubRawLocation {
  owner: string;
  repo: string;
  ref: string;
  path: string;
}

/**
 * Owner, repository, ref (branch or tag) and path of a raw.githubusercontent.com address; none for any other.
 * A branch name can hold slashes, and the address does not say where it ends (`…/feat/x/onto.ttl`), so each
 * reading is given, the shortest ref first, up to three parts.
 */
export function githubRawLocations(url: string | null): GithubRawLocation[] {
  const match = url?.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(?:refs\/(?:heads|tags)\/)?([^?#]+)/);
  if (!match) return [];
  const parts = match[3].split('/');
  return parts.slice(0, Math.min(MAX_REF_PARTS, parts.length - 1)).map((_, i) => ({
    owner: match[1],
    repo: match[2],
    ref: parts.slice(0, i + 1).join('/'),
    path: parts.slice(i + 1).join('/'),
  }));
}

const rawUrl = (loc: GithubRawLocation, ref: string): string => `https://raw.githubusercontent.com/${loc.owner}/${loc.repo}/${ref}/${loc.path}`;

/** Whether two version labels name the same version (`v1.0.0` and `1.0.0` do). */
function sameVersion(a: string, b: string): boolean {
  return compareVersions(a, b) === 0 || a === b;
}

/** A source's entries, or none when it fails: every source is optional. */
async function optional(read: () => Promise<VersionEntry[]>): Promise<VersionEntry[]> {
  try {
    return await read();
  } catch {
    return [];
  }
}

function priorVersions(store: Store, ontologyIri: string): VersionEntry[] {
  return store.getObjects(ontologyIri, OWL_PRIOR_VERSION, null)
    .filter((o) => o.termType === 'NamedNode')
    .map((o) => ({ version: versionInIri(o.value) ?? o.value, url: o.value, source: 'prior' as const }));
}

/** The latest release, read from the ontology IRI, and the earlier releases it names. */
async function latestVersions(ontologyIri: string, loadedUrl: string | null, sources: VersionSources): Promise<VersionEntry[]> {
  // A file opened from disk is not looked up on the network. Opened from the ontology IRI, what is loaded is the latest.
  if (!loadedUrl || !/^https?:\/\//.test(ontologyIri) || bareIri(loadedUrl) === bareIri(ontologyIri)) return [];
  const text = await sources.fetchText(ontologyIri);
  const latest = text ? await sources.parse(text, ontologyIri) : null;
  const read = latest ? readOntologyVersion(latest) : null;
  const version = versionLabel(read);
  if (!latest || !read || !version) return [];
  return [{ version, url: ontologyIri, source: 'latest' }, ...priorVersions(latest, read.ontologyIri)];
}

async function githubTags(loadedUrl: string | null, sources: VersionSources): Promise<VersionEntry[]> {
  const readings = githubRawLocations(loadedUrl);
  if (readings.length === 0) return [];
  const { owner, repo } = readings[0];
  const tags = await sources.fetchJson(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`);
  if (!Array.isArray(tags)) return [];
  const names = tags.map((t) => (t as { name?: unknown }).name).filter((n): n is string => typeof n === 'string').slice(0, MAX_TAGS);
  // The first reading of the address under which the file exists at some tag is the right one.
  for (const loc of readings) {
    // A check that fails counts as "not there", without losing the others.
    const found = await Promise.all(names.map(async (name) => ((await sources.exists(rawUrl(loc, name)).catch(() => false)) ? name : null)));
    const entries = found.filter((n): n is string => n !== null).map((name) => ({ version: name, url: rawUrl(loc, name), source: 'github' as const }));
    if (entries.length > 0) return entries;
  }
  return [];
}

/** Newest first; labels that are not version numbers keep their order, after the others. */
function byVersionDescending(a: VersionEntry, b: VersionEntry): number {
  const order = compareVersions(b.version, a.version);
  if (order !== null) return order;
  return (compareVersions(a.version, '0') === null ? 1 : 0) - (compareVersions(b.version, '0') === null ? 1 : 0);
}

/**
 * The versions of the ontology in `store`, loaded from `loadedUrl` (null for a file from disk). `seen` are the
 * versions of the same ontology already seen in this tab.
 */
export async function findVersions(store: Store, loadedUrl: string | null, sources: VersionSources, seen: readonly VersionEntry[] = []): Promise<AvailableVersions> {
  const ontology = readOntologyVersion(store);
  if (!ontology) return { loaded: null, entries: [], newer: null, latest: null };
  const loaded = versionLabel(ontology);
  const [latest, github] = await Promise.all([
    optional(() => latestVersions(ontology.ontologyIri, loadedUrl, sources)),
    optional(() => githubTags(loadedUrl, sources)),
  ]);

  // In order of preference when two sources name the same version.
  const candidates: VersionEntry[] = [
    ...(loaded ? [{ version: loaded, url: loadedUrl, source: 'loaded' as const }] : []),
    ...latest.filter((e) => e.source === 'latest'),
    ...github,
    ...priorVersions(store, ontology.ontologyIri),
    ...latest.filter((e) => e.source !== 'latest'),
    ...seen.filter((e) => e.url).map((e) => ({ ...e, source: 'seen' as const })),
  ];
  const entries = candidates
    .filter((e, i) => candidates.findIndex((o) => sameVersion(o.version, e.version)) === i)
    .sort(byVersionDescending);

  const above = loaded ? entries.filter((e) => (compareVersions(e.version, loaded) ?? 0) > 0) : [];
  const latestEntry = entries.find((e) => e.source === 'latest');
  const newer = above[0] ?? (loaded && latestEntry && compareVersions(latestEntry.version, loaded) === null ? latestEntry : null);
  const readLatest = latest.find((e) => e.source === 'latest');
  const certain = !!loaded && ((!!loadedUrl && bareIri(loadedUrl) === bareIri(ontology.ontologyIri)) || (!!readLatest && sameVersion(readLatest.version, loaded)));
  const isLatest = certain ? 'certain' : loaded && !newer && entries.length > 1 && entries[0].source === 'loaded' ? 'known' : null;
  return { loaded, entries, newer, latest: isLatest };
}
