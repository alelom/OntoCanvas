/**
 * How the browser reads the sources of an ontology's versions (#132): with a timeout, in the background,
 * and with GitHub's answers kept for an hour, since GitHub allows 60 unauthenticated requests an hour.
 */
import { fetchExternalOntologyTtl } from '../externalOntologySearch';
import { loadOntologyFromContent } from './loadOntology';
import { sniffContentType } from './importedDeclarations';
import type { VersionSources } from './ontologyVersions';

const TIMEOUT_MS = 5000;
const MAX_BYTES = 5_000_000;
const JSON_CACHE_MS = 60 * 60 * 1000;
const JSON_CACHE_PREFIX = 'ontocanvas:versions:';

/** `fetch` that gives up after the timeout. */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function cached(url: string): unknown {
  try {
    const entry = JSON.parse(sessionStorage.getItem(JSON_CACHE_PREFIX + url) ?? 'null') as { at: number; value: unknown } | null;
    return entry && Date.now() - entry.at < JSON_CACHE_MS ? entry.value : undefined;
  } catch {
    return undefined;
  }
}

function cache(url: string, value: unknown): void {
  try {
    sessionStorage.setItem(JSON_CACHE_PREFIX + url, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Storage full or blocked: read it again next time.
  }
}

/** JSON from `url`, kept for an hour in this tab; null when it cannot be read. */
export async function fetchJsonCached(url: string): Promise<unknown> {
  const hit = cached(url);
  if (hit !== undefined) return hit;
  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    cache(url, value);
    return value;
  } catch {
    return null; // offline, CORS, timed out, not JSON
  }
}

export const browserVersionSources: VersionSources = {
  fetchText: (url) => fetchExternalOntologyTtl(url, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES }),
  fetchJson: fetchJsonCached,
  exists: async (url) => {
    try {
      return (await fetchWithTimeout(url, { method: 'HEAD' })).ok;
    } catch {
      return false; // offline, CORS, timed out: counts as not there
    }
  },
  parse: async (text, url) => {
    try {
      return (await loadOntologyFromContent(text, url, { contentType: sniffContentType(text) })).parseResult.store;
    } catch {
      return null;
    }
  },
};
