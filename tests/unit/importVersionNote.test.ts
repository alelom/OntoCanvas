// @vitest-environment jsdom
/**
 * The imports dialog shows each imported ontology's version, and whether the owl:imports IRI is pinned to it
 * or follows the latest release (#131).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { describeImportVersion } from '../../src/ui/importVersionNote';
import { renderExternalRefsList, setImportVersionLookup } from '../../src/ui/externalRefs';

const ONTO = 'http://example.org/base';
const read = (versionIri: string | null, versionInfo: string | null = null) =>
  ({ state: 'read' as const, version: { ontologyIri: ONTO, versionIri, versionInfo } });

describe('describeImportVersion (#131)', () => {
  it('names the version and says the import follows the latest release when it imports the ontology IRI', () => {
    expect(describeImportVersion(ONTO, read(`${ONTO}/1.2.0`, '1.2.0')).text).toBe('Version 1.2.0 · follows the latest release');
  });

  it('says the import is pinned when it imports the version IRI', () => {
    const note = describeImportVersion(`${ONTO}/1.2.0`, read(`${ONTO}/1.2.0`, '1.2.0'));
    expect(note.text).toBe('Version 1.2.0 · pinned to this release');
    expect(note.title).toContain(`${ONTO}/1.2.0`);
  });

  it('says when a newer release than the imported one exists (#132)', () => {
    const note = describeImportVersion(`${ONTO}/1.2.0`, { ...read(`${ONTO}/1.2.0`, '1.2.0'), newer: '2.0.0' });
    expect(note.text).toBe('Version 1.2.0 · pinned to this release · 2.0.0 available');
  });

  it('names only the version when the import is neither, e.g. a file address', () => {
    expect(describeImportVersion('https://cdn.example.org/base.ttl', read(null, '1.2.0')).text).toBe('Version 1.2.0');
  });

  it('says when the imported ontology declares no version', () => {
    expect(describeImportVersion(ONTO, read(null)).text).toBe('No version declared · follows the latest release');
  });

  it('says when the import is still being read, or could not be read', () => {
    expect(describeImportVersion(ONTO, { state: 'reading' }).text).toBe('Version: reading…');
    expect(describeImportVersion(ONTO, { state: 'unread' }).text).toBe('Version unknown: the import could not be read');
  });
});

describe('imports dialog: version line (#131)', () => {
  const callbacks = { onUpdate: () => {}, onSave: () => {} };
  const versionLines = () => [...document.querySelectorAll('.external-ref-version')].map((el) => el.textContent);

  beforeEach(() => {
    document.body.innerHTML = '<div id="externalRefsList"></div>';
  });

  it('shows the version under each import, and nothing for a reference that is not an import', () => {
    setImportVersionLookup((url) => (url === ONTO ? read(`${ONTO}/1.2.0`, '1.2.0') : null));
    renderExternalRefsList([{ url: ONTO, usePrefix: false }, { url: 'http://example.org/other', usePrefix: false }], callbacks, null, null);
    expect(versionLines()).toEqual(['Version 1.2.0 · follows the latest release']);
  });
});
