// @vitest-environment jsdom
/**
 * The open ontology's version in the bottom bar (#130): "Ontology: <name> v2.1.0 (prefix: x)", with the
 * owl:versionIRI in the version's tooltip.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { updateOntologyInfoDisplay, updateOntologyVersionDisplay } from '../../src/ui/statusBar';

const ONTO = 'http://example.org/onto';
const part = () => document.getElementById('ontologyInfoDisplay')!;
const versionEl = () => document.getElementById('ontologyVersion');

describe('bottom bar: ontology version (#130)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="info"><span id="ontologyInfoDisplay"></span></div>';
    updateOntologyVersionDisplay(null);
    updateOntologyInfoDisplay({ iri: ONTO, name: 'Onto', prefix: 'ex' });
  });

  it('shows the version after the name, before the prefix', () => {
    updateOntologyVersionDisplay({ ontologyIri: ONTO, versionIri: `${ONTO}/2.1.0`, versionInfo: '2.1.0' });
    expect(part().textContent).toBe('Ontology: Onto v2.1.0 (prefix: ex)');
    expect(versionEl()!.title).toContain(`${ONTO}/2.1.0`);
  });

  it('takes the version from owl:versionIRI when there is no owl:versionInfo', () => {
    updateOntologyVersionDisplay({ ontologyIri: ONTO, versionIri: `${ONTO}/1.4.0`, versionInfo: null });
    expect(versionEl()!.textContent).toBe('v1.4.0');
  });

  it('does not add a "v" to a version that is not a number', () => {
    updateOntologyVersionDisplay({ ontologyIri: ONTO, versionIri: null, versionInfo: 'Release of March 2020' });
    expect(versionEl()!.textContent).toBe('Release of March 2020');
  });

  it('shows no version when none is declared', () => {
    updateOntologyVersionDisplay({ ontologyIri: ONTO, versionIri: null, versionInfo: null });
    expect(versionEl()).toBeNull();
    expect(part().textContent).toBe('Ontology: Onto (prefix: ex)');
  });
});
