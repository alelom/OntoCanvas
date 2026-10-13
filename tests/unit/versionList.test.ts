// @vitest-environment jsdom
/**
 * The bottom bar's version button (#132, #133): shown when other versions of the ontology are known, marked
 * when one is newer than the loaded version, and opening a list of them; choosing one opens it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateOntologyInfoDisplay, updateOntologyVersionDisplay, updateAvailableVersions } from '../../src/ui/statusBar';
import type { AvailableVersions } from '../../src/lib/ontologyVersions';

const ONTO = 'http://example.org/onto';
const button = () => document.getElementById('ontologyVersionsBtn');
const list = () => document.getElementById('ontologyVersionsList')!;
const part = () => document.getElementById('ontologyInfoDisplay')!;
const items = () => [...list().querySelectorAll('[data-version]')] as HTMLElement[];

const AVAILABLE: AvailableVersions = {
  loaded: '1.0.0',
  entries: [
    { version: '1.2.0', url: ONTO, source: 'latest' },
    { version: '1.0.0', url: `${ONTO}/1.0.0.ttl`, source: 'loaded' },
    { version: '0.9.0', url: `${ONTO}/0.9.0`, source: 'prior' },
  ],
  newer: { version: '1.2.0', url: ONTO, source: 'latest' },
  latest: null,
};

describe('bottom bar: versions button and list (#132, #133)', () => {
  let chosen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '<div id="info"><span id="ontologyInfoDisplay"></span></div>';
    chosen = vi.fn();
    updateAvailableVersions(null, chosen);
    updateOntologyInfoDisplay({ iri: ONTO, name: 'Onto', prefix: null });
    updateOntologyVersionDisplay({ ontologyIri: ONTO, versionIri: `${ONTO}/1.0.0`, versionInfo: '1.0.0' });
  });

  it('is not shown until other versions are known', () => {
    expect(button()).toBeNull();
    updateAvailableVersions({ loaded: '1.0.0', entries: [AVAILABLE.entries[1]], newer: null }, chosen);
    expect(button()).toBeNull();
  });

  it('says after the version, in warning yellow, when a newer one exists; the button only opens the list', () => {
    updateAvailableVersions(AVAILABLE, chosen);
    const newer = document.getElementById('ontologyNewer')!;
    expect(part().textContent?.startsWith('Ontology: Onto v1.0.0 (1.2.0 available)')).toBe(true);
    expect(newer.textContent).toBe(' (1.2.0 available)');
    expect(newer.style.color).toBe('rgb(243, 156, 18)');
    expect(newer.title).toContain('A newer version, 1.2.0');
    expect(button()!.textContent).toBe('versions ▾');
  });

  it('appends "(latest)" to the version when the open one is the latest', () => {
    updateAvailableVersions({ ...AVAILABLE, entries: AVAILABLE.entries.slice(1), newer: null, latest: 'known' }, chosen);
    expect(document.getElementById('ontologyVersion')!.textContent).toBe('v1.0.0');
    expect(document.getElementById('ontologyLatest')!.textContent).toBe(' (latest)');
    expect(document.getElementById('ontologyLatest')!.title).toContain('No newer version is known');
    updateAvailableVersions(AVAILABLE, chosen);
    expect(document.getElementById('ontologyLatest')).toBeNull();
  });

  it('only offers the list when no version is newer', () => {
    updateAvailableVersions({ ...AVAILABLE, entries: AVAILABLE.entries.slice(1), newer: null }, chosen);
    expect(button()!.textContent).toBe('versions ▾');
  });

  it('lists the versions, newest first, with the loaded one marked and where each was found', () => {
    updateAvailableVersions(AVAILABLE, chosen);
    button()!.click();
    expect(list().style.display).toBe('block');
    expect(items().map((i) => i.textContent)).toEqual(['1.2.0 · latest release', '✓ 1.0.0 · open now', '0.9.0 · earlier version (owl:priorVersion)']);
    expect(items()[0].title).toBe(ONTO);
  });

  it('opens the version that is chosen, but not the one already open', () => {
    updateAvailableVersions(AVAILABLE, chosen);
    button()!.click();
    items()[1].click();
    expect(chosen).not.toHaveBeenCalled();
    items()[0].click();
    expect(chosen).toHaveBeenCalledWith(AVAILABLE.entries[0]);
    expect(list().style.display).toBe('none');
  });
});
