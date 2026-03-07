/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  isDomainClassNode,
  getAttachedDataPropertyNodeIds,
} from '../../src/graph/dataPropertyDragCoupling';

describe('isDomainClassNode', () => {
  it('returns true for domain class node IDs', () => {
    expect(isDomainClassNode('MyClass')).toBe(true);
    expect(isDomainClassNode('Foo')).toBe(true);
    expect(isDomainClassNode('A')).toBe(true);
    expect(isDomainClassNode('TestClass')).toBe(true);
  });

  it('returns false for data property node IDs', () => {
    expect(isDomainClassNode('__dataprop__A__p')).toBe(false);
    expect(isDomainClassNode('__dataprop__TestClass__testProperty')).toBe(false);
  });

  it('returns false for data property restriction node IDs', () => {
    expect(isDomainClassNode('__dataproprestrict__A__p')).toBe(false);
    expect(isDomainClassNode('__dataproprestrict__MyClass__myProp')).toBe(false);
  });
});

describe('getAttachedDataPropertyNodeIds', () => {
  it('returns attached __dataprop__ and __dataproprestrict__ nodes for the class', () => {
    const allNodeIds = [
      'A',
      '__dataprop__A__p1',
      '__dataproprestrict__A__p2',
      '__dataprop__B__p3',
    ];
    const result = getAttachedDataPropertyNodeIds('A', allNodeIds);
    expect(result).toContain('__dataprop__A__p1');
    expect(result).toContain('__dataproprestrict__A__p2');
    expect(result).not.toContain('__dataprop__B__p3');
    expect(result).toHaveLength(2);
  });

  it('returns empty array when class has no attached nodes', () => {
    const allNodeIds = ['A', '__dataprop__B__p1'];
    const result = getAttachedDataPropertyNodeIds('A', allNodeIds);
    expect(result).toEqual([]);
  });

  it('returns only nodes for the given class', () => {
    const allNodeIds = [
      '__dataprop__X__a',
      '__dataprop__X__b',
      '__dataproprestrict__X__c',
      '__dataprop__Y__a',
    ];
    const result = getAttachedDataPropertyNodeIds('X', allNodeIds);
    expect(result.sort()).toEqual(
      ['__dataprop__X__a', '__dataprop__X__b', '__dataproprestrict__X__c'].sort()
    );
  });
});
