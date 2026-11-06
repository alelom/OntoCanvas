/**
 * The addresses added data may make the page request (#239 review): never one on this machine or a private network, whether
 * the data names it or it is guessed from a namespace. The private addresses here are made up; this file is left out of the
 * public-repo hygiene scan by name (scripts/ci/internal-names.config.json), as internalNameScan.test.ts is, because its test
 * data is exactly what that scan looks for.
 */
import { describe, it, expect } from 'vitest';
import { Parser, Store } from 'n3';
import { findDataOntologies, isPrivateAddress, publicAddressesOnly } from '../../src/abox/dataOntologies';

const nq = (text: string) => new Store(new Parser({ format: 'N-Quads' }).parse(text));
const PROV_USED = 'http://www.w3.org/ns/prov#used';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const PRIVATE = [
  'http://localhost:8080/o',
  'http://127.0.0.1/o',
  'http://[::1]/o',
  'http://10.1.2.3/o',
  'http://172.16.0.9/o',
  'http://172.31.255.1/o',
  'http://192.168.1.2/o',
  'http://169.254.1.1/o',
  'http://0.0.0.0/o',
  'http://printer.local/o',
  'http://app.localhost/o',
  'http://[fd00::1]/o',
  'http://[fe80::1]/o',
  // Second review: an IPv4 address inside IPv6, a trailing dot, and the shared and special ranges.
  'http://[::ffff:127.0.0.1]/o',
  'http://[::ffff:10.0.0.1]/o',
  'http://[::ffff:7f00:1]/o',
  'http://localhost./o',
  'http://printer.local./o',
  'http://100.64.0.1/o',
  'http://100.127.255.1/o',
  'http://192.0.0.8/o',
  'http://198.18.0.1/o',
  'http://198.19.255.1/o',
];

describe('isPrivateAddress', () => {
  it('is true for loopback, link-local, private IPv4 and IPv6 ranges, and .local or .localhost names, whatever the port', () => {
    for (const iri of PRIVATE) expect(isPrivateAddress(iri), iri).toBe(true);
  });

  it('is false for the public web, the edges of the private ranges included', () => {
    for (const iri of ['https://example.org/o', 'https://w3id.org/adiro/adiro_provenance/2.2.0', 'http://172.32.0.1/o', 'http://172.15.0.1/o', 'http://11.0.0.1/o', 'http://[2001:db8::1]/o', 'http://100.63.0.1/o', 'http://100.128.0.1/o', 'http://198.20.0.1/o', 'http://[::ffff:8.8.8.8]/o', 'https://example.org./o']) {
      expect(isPrivateAddress(iri), iri).toBe(false);
    }
  });
});

describe('findDataOntologies and private addresses', () => {
  it('never gives one the data names', () => {
    const named = nq([...PRIVATE, 'https://example.org/ok', 'http://172.32.0.1/public'].map((h) => `<urn:d> <${PROV_USED}> <${h}> .`).join('\n') + '\n');

    expect(findDataOntologies([named], []).map((o) => o.iri)).toEqual(['https://example.org/ok', 'http://172.32.0.1/public']);
  });

  it('never guesses one from a namespace', () => {
    const guessed = nq(`<urn:x> <${TYPE}> <http://192.168.1.2/vocab#Room> .\n<urn:x> <http://localhost/vocab#p> "v" .\n`);

    expect(findDataOntologies([guessed], [])).toEqual([]);
  });
});

describe('publicAddressesOnly (#239 second review)', () => {
  it("fetches a public address, and never a private one: the imports of the data's ontologies are read through it, at every level", async () => {
    const asked: string[] = [];
    const fetchTtl = publicAddressesOnly(async (url) => {
      asked.push(url);
      return 'text';
    });

    expect(await fetchTtl('https://example.org/onto')).toBe('text');
    expect(await fetchTtl('http://localhost:8080/onto')).toBeNull();
    expect(await fetchTtl('http://[::ffff:10.0.0.1]/onto')).toBeNull();
    expect(asked).toEqual(['https://example.org/onto']);
  });
});
