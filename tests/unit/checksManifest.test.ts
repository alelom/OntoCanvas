/**
 * The files of a library of checks (#230, #231): what a file is by its name, a manifest, the title of a query, and a manifest's
 * paths resolved against its address or its place in a picked folder.
 */
import { describe, it, expect } from 'vitest';
import { checkFileKind, fileName, parseManifest, queryTitle, resolvePath } from '../../src/checks/manifest';

describe('checkFileKind', () => {
  it('knows a query, shapes and a manifest by their extension', () => {
    expect(checkFileKind('queries/cq-2-4.rq')).toBe('query');
    expect(checkFileKind('a.sparql')).toBe('query');
    expect(checkFileKind('shapes/readings.shacl.ttl')).toBe('shapes');
    expect(checkFileKind('https://example.org/checks/manifest.json?v=1')).toBe('manifest');
    expect(checkFileKind('notes.md')).toBeNull();
  });
});

describe('fileName', () => {
  it('is the last part of a path or an address', () => {
    expect(fileName('https://example.org/q/cq-1.rq?x=1')).toBe('cq-1.rq');
    expect(fileName('cq-1.rq')).toBe('cq-1.rq');
  });
});

describe('parseManifest', () => {
  it("reads ADIRO's manifest: paths only, its title from the artefact's name", () => {
    const manifest = parseManifest(JSON.stringify({ artefact: 'ADIRO checks', shapes: ['shapes/a.shacl.ttl'], queries: ['queries/uc01/cq-2-4.rq'] }));

    expect(manifest).toEqual({ title: 'ADIRO checks', queries: [{ path: 'queries/uc01/cq-2-4.rq' }], shapes: [{ path: 'shapes/a.shacl.ttl' }] });
  });

  it('reads an entry with a title and a description', () => {
    const manifest = parseManifest(JSON.stringify({ queries: [{ path: 'q.rq', title: 'Rooms', description: 'Every room' }] }));

    expect(manifest.queries).toEqual([{ path: 'q.rq', title: 'Rooms', description: 'Every room' }]);
    expect(manifest.shapes).toEqual([]);
  });

  it('says why a file is not a manifest', () => {
    expect(() => parseManifest('{ not json')).toThrow('not valid JSON');
    expect(() => parseManifest('[]')).toThrow('not a JSON object');
    expect(() => parseManifest('{"title":"x"}')).toThrow('no "queries" and no "shapes"');
    expect(() => parseManifest('{"queries":"q.rq"}')).toThrow('"queries" is not a list');
    expect(() => parseManifest('{"queries":[3]}')).toThrow('Item 1 of the manifest\'s "queries"');
  });
});

describe('queryTitle', () => {
  it('is the first comment after the PREFIX lines', () => {
    const text = 'PREFIX m: <https://example.org/m#>\n\n# CQ 2.4: the drawings filed under another project\nSELECT * WHERE { ?s ?p ?o }';

    expect(queryTitle(text, 'cq-2-4.rq')).toBe('CQ 2.4: the drawings filed under another project');
  });

  it("is the file's name without its extension when the query has no comment before it starts", () => {
    expect(queryTitle('SELECT * WHERE { ?s ?p ?o } # late', 'queries/cq-1.rq')).toBe('cq-1');
  });
});

describe('resolvePath', () => {
  it("resolves against the manifest's address", () => {
    expect(resolvePath('queries/uc01/cq-2-4.rq', 'https://example.org/checks/1.0.0/manifest.json')).toBe('https://example.org/checks/1.0.0/queries/uc01/cq-2-4.rq');
  });

  it('resolves against its path in a picked folder, ../ included', () => {
    expect(resolvePath('queries/cq-1.rq', 'checks/manifest.json')).toBe('checks/queries/cq-1.rq');
    expect(resolvePath('../shared/s.ttl', 'checks/sub/manifest.json')).toBe('checks/shared/s.ttl');
    expect(resolvePath('./q.rq', 'manifest.json')).toBe('q.rq');
  });

  it('keeps an absolute address', () => {
    expect(resolvePath('https://other.org/s.ttl', 'checks/manifest.json')).toBe('https://other.org/s.ttl');
  });
});
