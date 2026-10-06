import { describe, it, expect } from 'vitest';
import { EXAMPLE_ONTOLOGIES } from './exampleOntologies';

describe('example ontologies', () => {
  it('FOAF is the current spec (as WebVOWL shows it), not a reduced copy (#78)', () => {
    const foaf = EXAMPLE_ONTOLOGIES.find((o) => o.label === 'FOAF');
    // The 2014-01-14 spec from the LOV archive (xmlns.com itself sends no CORS header). The earlier
    // SPAROntologies copy lacked e.g. foaf:account; the foaf/foaf GitHub copy is an older version.
    expect(foaf?.url).toBe('https://lov.linkeddata.es/dataset/vocabs/foaf/versions/2014-01-14.n3');
  });

  it('every example is fetched over https', () => {
    for (const o of EXAMPLE_ONTOLOGIES) expect(o.url.startsWith('https://')).toBe(true);
  });
});
