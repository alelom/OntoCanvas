/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { getLegendTypesFromDisplayedEdges } from '../../src/ui/edgeStyleUtils';
import type { ObjectPropertyInfo } from '../../src/types';

describe('getLegendTypesFromDisplayedEdges', () => {
  it('includes canonical op.name when displayedEdges use full URI type', () => {
    const displayedTypeSet = new Set([
      'http://example.org/task-assignment#assignedTo',
      'http://example.org/task-assignment#forProject',
    ]);
    const objectProperties: ObjectPropertyInfo[] = [
      { name: 'assignedTo', label: 'assigned to', hasCardinality: true, uri: 'http://example.org/task-assignment#assignedTo' },
      { name: 'forProject', label: 'for project', hasCardinality: true, uri: 'http://example.org/task-assignment#forProject' },
    ];
    const config: Record<string, { show: boolean }> = {
      subClassOf: { show: true },
      assignedTo: { show: true },
      forProject: { show: true },
    };

    const types = getLegendTypesFromDisplayedEdges(displayedTypeSet, objectProperties, config);

    expect(types).toContain('assignedTo');
    expect(types).toContain('forProject');
    expect(types).toContain('subClassOf');
    expect(types.length).toBe(3);
  });

  it('includes type as-is when not in objectProperties', () => {
    const displayedTypeSet = new Set(['subClassOf', 'customType']);
    const objectProperties: ObjectPropertyInfo[] = [];
    const config: Record<string, { show: boolean }> = {
      subClassOf: { show: true },
      customType: { show: true },
    };

    const types = getLegendTypesFromDisplayedEdges(displayedTypeSet, objectProperties, config);

    expect(types).toContain('subClassOf');
    expect(types).toContain('customType');
    expect(types.length).toBe(2);
  });

  it('omits types with show: false', () => {
    const displayedTypeSet = new Set(['assignedTo']);
    const objectProperties: ObjectPropertyInfo[] = [
      { name: 'assignedTo', label: 'assigned to', hasCardinality: true, uri: 'http://example.org#assignedTo' },
    ];
    const config: Record<string, { show: boolean }> = {
      assignedTo: { show: false },
    };

    const types = getLegendTypesFromDisplayedEdges(displayedTypeSet, objectProperties, config);

    expect(types).not.toContain('assignedTo');
    expect(types.length).toBe(0);
  });
});
