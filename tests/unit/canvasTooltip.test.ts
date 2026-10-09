import { describe, it, expect } from 'vitest';
import { pickTooltip } from '../../src/ui/canvasTooltip';

/** The canvas shows one tooltip (#109): the most specific thing under the cursor wins. */
describe('pickTooltip', () => {
  it('prefers an edge label, then a class-expression mark, then a node, then an edge line', () => {
    expect(pickTooltip({ edgeLabel: 'label', expressionMark: 'mark', node: 'node', edgeLine: 'line' })).toBe('label');
    expect(pickTooltip({ expressionMark: 'mark', node: 'node', edgeLine: 'line' })).toBe('mark');
    expect(pickTooltip({ node: 'node', edgeLine: 'line' })).toBe('node');
    expect(pickTooltip({ edgeLine: 'line' })).toBe('line');
  });

  it('skips empty text and returns null when nothing has a tooltip', () => {
    expect(pickTooltip({ edgeLabel: '', node: null, edgeLine: 'line' })).toBe('line');
    expect(pickTooltip({})).toBeNull();
  });
});
