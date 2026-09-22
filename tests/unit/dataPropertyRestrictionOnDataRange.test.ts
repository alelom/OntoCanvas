/**
 * A restriction's asserted owl:onDataRange must survive a cardinality edit.
 *
 * Editing a restriction's cardinality is implemented as remove-then-re-add. The re-add used to
 * synthesise owl:onDataRange from the *property's* rdfs:range (falling back to rdfs:Literal), which
 * silently replaced a datatype the document really asserted with a fabricated one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseRdfToGraph,
  addDataPropertyRestrictionToClass,
  removeDataPropertyRestrictionFromClass,
  getDataPropertyRestrictionsForClass,
} from '../../src/parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../fixtures/restriction-on-data-range.ttl');

const XSD_DATE_TIME = 'http://www.w3.org/2001/XMLSchema#dateTime';
const RDFS_LITERAL = 'http://www.w3.org/2000/01/rdf-schema#Literal';

async function load() {
  const content = readFileSync(FIXTURE, 'utf-8');
  const { store } = await parseRdfToGraph(content, { path: FIXTURE });
  return store!;
}

const restrictionFor = (store: import('n3').Store, prop: string) =>
  getDataPropertyRestrictionsForClass(store, 'Entity').find((r) => r.propertyName === prop);

describe('owl:onDataRange on a data-property restriction', () => {
  it('is parsed from the document even when the property declares no rdfs:range', async () => {
    const store = await load();
    expect(restrictionFor(store, 'createdDate')?.onDataRange).toBe(XSD_DATE_TIME);
  });

  it('survives a cardinality edit (remove + re-add) instead of degrading to rdfs:Literal', async () => {
    const store = await load();
    const before = restrictionFor(store, 'createdDate')!;
    expect(before.onDataRange).toBe(XSD_DATE_TIME);

    // What the edit-edge modal does when the user changes the cardinality.
    expect(removeDataPropertyRestrictionFromClass(store, 'Entity', 'createdDate')).toBe(true);
    expect(
      addDataPropertyRestrictionToClass(
        store,
        'Entity',
        'createdDate',
        { minCardinality: 2, maxCardinality: undefined },
        before.onDataRange
      )
    ).toBe(true);

    const after = restrictionFor(store, 'createdDate');
    expect(after?.onDataRange).toBe(XSD_DATE_TIME);
    expect(after?.minCardinality).toBe(2);
  });

  it('falls back to rdfs:Literal when nothing asserts a data range', async () => {
    const store = await load();
    expect(
      addDataPropertyRestrictionToClass(store, 'Entity', 'untypedProp', { minCardinality: 1 })
    ).toBe(true);
    expect(restrictionFor(store, 'untypedProp')?.onDataRange).toBe(RDFS_LITERAL);
  });
});
