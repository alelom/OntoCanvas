import { describe, it, expect } from 'vitest';
import { latestDisplayConfigSource } from './displayConfigFallback';

const ONTO = 'https://w3id.org/adiro/aec_drawing_metadata';
const v = (versionIri: string | null) => ({ ontologyIri: ONTO, versionIri, versionInfo: null });

describe('latestDisplayConfigSource (#136)', () => {
  it('is the ontology IRI when a version was opened by another address: the latest version\'s config is there', () => {
    expect(latestDisplayConfigSource(`${ONTO}/4.0.0`, v(`${ONTO}/4.0.0`))).toBe(ONTO);
    expect(latestDisplayConfigSource('https://files.example.org/onto-4.0.0.ttl', v(`${ONTO}/4.0.0`))).toBe(ONTO);
  });

  it('is null when the ontology IRI itself was opened, or the ontology declares no version', () => {
    expect(latestDisplayConfigSource(ONTO, v(`${ONTO}/4.0.0`))).toBeNull();
    expect(latestDisplayConfigSource(`${ONTO}#`, v(`${ONTO}/4.0.0`))).toBeNull();
    expect(latestDisplayConfigSource(`${ONTO}/4.0.0`, v(null))).toBeNull();
    expect(latestDisplayConfigSource(`${ONTO}/4.0.0`, null)).toBeNull();
  });

  it('is null when the ontology IRI cannot be fetched (not http)', () => {
    expect(latestDisplayConfigSource('https://files.example.org/onto.ttl', { ontologyIri: 'urn:x:onto', versionIri: 'urn:x:onto:1', versionInfo: null })).toBeNull();
  });
});
