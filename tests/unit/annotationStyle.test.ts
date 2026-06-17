import { describe, it, expect } from 'vitest';
import {
  resolveNodeAnnotationStyle,
  applyAnnotationPropertyOrder,
  reorderAnnotationProperty,
  defaultAnnotationFill,
  DEFAULT_NODE_STYLE,
} from '../../src/lib/annotationStyle';
import { ANNOTATION_FILL_PALETTE } from '../../src/ui/constants';
import type { AnnotationStyleConfig, BorderLineType } from '../../src/ui/constants';

// --- helpers ---------------------------------------------------------------

function boolState(
  fill: string,
  opts: { border?: string; lineType?: BorderLineType; show?: boolean; active?: boolean } = {}
) {
  return {
    fillColor: fill,
    borderColor: opts.border ?? '#000000',
    borderLineType: opts.lineType ?? ('solid' as BorderLineType),
    show: opts.show ?? true,
    active: opts.active,
  };
}

/**
 * A boolean prop with distinct, recognisable colours per state. By default whenFalse/whenUndefined
 * are INACTIVE (the production default) so the property only claims its true nodes; pass
 * activeFalse/activeUndef to opt those states in.
 */
function boolProp(name: string, opts: { activeFalse?: boolean; activeUndef?: boolean } = {}) {
  return {
    [name]: {
      whenTrue: boolState(`#${name}-true`, { active: true }),
      whenFalse: boolState(`#${name}-false`, { active: opts.activeFalse ?? false }),
      whenUndefined: boolState(`#${name}-undef`, { active: opts.activeUndef ?? false }),
    },
  };
}

function cfg(parts: Partial<AnnotationStyleConfig>): AnnotationStyleConfig {
  return { booleanProps: {}, textProps: {}, ...parts };
}

// --- single boolean property -----------------------------------------------

describe('resolveNodeAnnotationStyle - single boolean property', () => {
  it('uses whenTrue for a true value', () => {
    expect(resolveNodeAnnotationStyle({ A: true }, cfg({ booleanProps: boolProp('A') }), ['A']).background).toBe('#A-true');
  });

  it('falls through to default for a false value when whenFalse is inactive (default)', () => {
    expect(resolveNodeAnnotationStyle({ A: false }, cfg({ booleanProps: boolProp('A') }), ['A'])).toEqual(DEFAULT_NODE_STYLE);
  });

  it('uses whenFalse for a false value when whenFalse is active', () => {
    const config = cfg({ booleanProps: boolProp('A', { activeFalse: true }) });
    expect(resolveNodeAnnotationStyle({ A: false }, config, ['A']).background).toBe('#A-false');
  });

  it('falls through to default for an absent value when whenUndefined is inactive (default)', () => {
    expect(resolveNodeAnnotationStyle({}, cfg({ booleanProps: boolProp('A') }), ['A'])).toEqual(DEFAULT_NODE_STYLE);
  });

  it('uses whenUndefined for an absent/null value when whenUndefined is active', () => {
    const config = cfg({ booleanProps: boolProp('A', { activeUndef: true }) });
    expect(resolveNodeAnnotationStyle({}, config, ['A']).background).toBe('#A-undef');
    expect(resolveNodeAnnotationStyle({ A: null }, config, ['A']).background).toBe('#A-undef');
  });
});

// --- multiple boolean properties (priority + fall-through) ------------------

describe('resolveNodeAnnotationStyle - multiple boolean properties', () => {
  const config = cfg({ booleanProps: { ...boolProp('A'), ...boolProp('B') } });
  const order = ['A', 'B'];

  it('a node that only carries B=true gets B.whenTrue (A does not claim it)', () => {
    expect(resolveNodeAnnotationStyle({ B: true }, config, order).background).toBe('#B-true');
  });

  it('by default a non-true higher-priority property lets a lower-priority whenTrue apply', () => {
    // A is false (inactive) -> falls through to B=true.
    expect(resolveNodeAnnotationStyle({ A: false, B: true }, config, order).background).toBe('#B-true');
  });

  it('gives the higher-priority property precedence when both are true', () => {
    expect(resolveNodeAnnotationStyle({ A: true, B: true }, config, order).background).toBe('#A-true');
  });

  it('falls through to the default style when no property governs', () => {
    expect(resolveNodeAnnotationStyle({}, config, order)).toEqual(DEFAULT_NODE_STYLE);
    expect(resolveNodeAnnotationStyle({ A: false, B: false }, config, order)).toEqual(DEFAULT_NODE_STYLE);
  });

  it('lets an active whenUndefined on the higher-priority property claim non-A nodes (opt-in)', () => {
    const cfgActive = cfg({ booleanProps: { ...boolProp('A', { activeUndef: true }), ...boolProp('B') } });
    // A.whenUndefined active -> A claims the absent-A node before B is considered.
    expect(resolveNodeAnnotationStyle({ B: true }, cfgActive, order).background).toBe('#A-undef');
  });
});

// --- ordering / priority changes -------------------------------------------

describe('resolveNodeAnnotationStyle - priority follows order', () => {
  const config = cfg({ booleanProps: { ...boolProp('A'), ...boolProp('B') } });

  it('B wins over A when B is first in order', () => {
    const style = resolveNodeAnnotationStyle({ A: true, B: true }, config, ['B', 'A']);
    expect(style.background).toBe('#B-true');
  });
});

// --- configurable default style --------------------------------------------

describe('resolveNodeAnnotationStyle - configurable default style', () => {
  it('returns config.defaultStyle when no property governs', () => {
    const config = cfg({
      booleanProps: boolProp('A'),
      defaultStyle: { fillColor: '#default', borderColor: '#dborder', borderLineType: 'dotted' },
    });
    const style = resolveNodeAnnotationStyle({ A: false }, config, ['A']);
    expect(style.background).toBe('#default');
    expect(style.border).toBe('#dborder');
    expect(style.borderLineType).toBe('dotted');
    expect(style.show).toBe(true);
  });

  it('a governing property still wins over the default style', () => {
    const config = cfg({
      booleanProps: boolProp('A'),
      defaultStyle: { fillColor: '#default', borderColor: '#dborder', borderLineType: 'solid' },
    });
    expect(resolveNodeAnnotationStyle({ A: true }, config, ['A']).background).toBe('#A-true');
  });
});

// --- text (regex) properties ------------------------------------------------

describe('resolveNodeAnnotationStyle - text/regex properties', () => {
  const config = cfg({
    textProps: {
      status: {
        rules: [
          { regex: '^draft', fillColor: '#draft', borderColor: '#0', borderLineType: 'solid' },
          { regex: 'final', fillColor: '#final', borderColor: '#0', borderLineType: 'dashed' },
        ],
      },
    },
  });
  const order = ['status'];

  it('applies the first matching regex rule', () => {
    expect(resolveNodeAnnotationStyle({ status: 'draft v1' }, config, order).background).toBe('#draft');
    expect(resolveNodeAnnotationStyle({ status: 'the final' }, config, order).background).toBe('#final');
  });

  it('falls through to default when no rule matches', () => {
    expect(resolveNodeAnnotationStyle({ status: 'other' }, config, order)).toEqual(DEFAULT_NODE_STYLE);
  });

  it('ignores invalid regex and continues', () => {
    const bad = cfg({
      textProps: { s: { rules: [
        { regex: '[invalid(', fillColor: '#x', borderColor: '#0', borderLineType: 'solid' },
        { regex: 'ok', fillColor: '#good', borderColor: '#0', borderLineType: 'solid' },
      ] } },
    });
    expect(resolveNodeAnnotationStyle({ s: 'ok' }, bad, ['s']).background).toBe('#good');
  });
});

// --- mixed boolean + text, interleaved priority ----------------------------

describe('resolveNodeAnnotationStyle - mixed boolean and text by order', () => {
  const config = cfg({
    booleanProps: { ...boolProp('flag') },
    textProps: { tag: { rules: [{ regex: 'hot', fillColor: '#hot', borderColor: '#0', borderLineType: 'solid' }] } },
  });

  it('text property applies even when a boolean property exists but is not carried (regression for bug #5)', () => {
    // Node has no boolean value but matches the text rule -> must NOT be swallowed by flag.whenUndefined.
    const style = resolveNodeAnnotationStyle({ tag: 'hot' }, config, ['flag', 'tag']);
    expect(style.background).toBe('#hot');
  });

  it('higher-priority text beats lower-priority boolean', () => {
    const style = resolveNodeAnnotationStyle({ flag: true, tag: 'hot' }, config, ['tag', 'flag']);
    expect(style.background).toBe('#hot');
  });

  it('higher-priority boolean beats lower-priority text', () => {
    const style = resolveNodeAnnotationStyle({ flag: true, tag: 'hot' }, config, ['flag', 'tag']);
    expect(style.background).toBe('#flag-true');
  });
});

// --- visibility -------------------------------------------------------------

describe('resolveNodeAnnotationStyle - visibility (show)', () => {
  it('reports show:false from the governing boolean state', () => {
    const config = cfg({ booleanProps: { A: {
      whenTrue: boolState('#t', { show: false }),
      whenFalse: boolState('#f'),
      whenUndefined: boolState('#u'),
    } } });
    expect(resolveNodeAnnotationStyle({ A: true }, config, ['A']).show).toBe(false);
    expect(resolveNodeAnnotationStyle({ A: false }, config, ['A']).show).toBe(true);
  });

  it('a hidden whenUndefined on a higher-priority prop does not hide a node governed by another prop', () => {
    const config = cfg({ booleanProps: {
      A: { whenTrue: boolState('#at'), whenFalse: boolState('#af'), whenUndefined: boolState('#au', { show: false }) },
      ...boolProp('B'),
    } });
    // Node carries only B=true; A.whenUndefined.show=false must NOT hide it.
    expect(resolveNodeAnnotationStyle({ B: true }, config, ['A', 'B']).show).toBe(true);
  });

  it('text-governed nodes are always shown', () => {
    const config = cfg({ textProps: { s: { rules: [{ regex: 'x', fillColor: '#x', borderColor: '#0', borderLineType: 'solid' }] } } });
    expect(resolveNodeAnnotationStyle({ s: 'x' }, config, ['s']).show).toBe(true);
  });
});

// --- empty / default --------------------------------------------------------

describe('resolveNodeAnnotationStyle - defaults', () => {
  it('returns the default style when there are no properties', () => {
    expect(resolveNodeAnnotationStyle({ anything: true }, cfg({}), [])).toEqual(DEFAULT_NODE_STYLE);
  });

  it('handles undefined annotations', () => {
    expect(resolveNodeAnnotationStyle(undefined, cfg({}), [])).toEqual(DEFAULT_NODE_STYLE);
  });
});

// --- applyAnnotationPropertyOrder ------------------------------------------

describe('applyAnnotationPropertyOrder', () => {
  const props = [{ name: 'alpha' }, { name: 'beta' }, { name: 'gamma' }];

  it('returns a copy unchanged when there is no saved order', () => {
    expect(applyAnnotationPropertyOrder(props, undefined)).toEqual(props);
    expect(applyAnnotationPropertyOrder(props, [])).toEqual(props);
  });

  it('reorders by saved order', () => {
    expect(applyAnnotationPropertyOrder(props, ['gamma', 'alpha', 'beta']).map((p) => p.name)).toEqual([
      'gamma', 'alpha', 'beta',
    ]);
  });

  it('appends properties not in the saved order, after the known ones', () => {
    expect(applyAnnotationPropertyOrder(props, ['gamma']).map((p) => p.name)).toEqual([
      'gamma', 'alpha', 'beta',
    ]);
  });

  it('ignores names in the saved order that are not present', () => {
    expect(applyAnnotationPropertyOrder(props, ['missing', 'beta']).map((p) => p.name)).toEqual([
      'beta', 'alpha', 'gamma',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [{ name: 'a' }, { name: 'b' }];
    applyAnnotationPropertyOrder(input, ['b', 'a']);
    expect(input.map((p) => p.name)).toEqual(['a', 'b']);
  });
});

describe('reorderAnnotationProperty', () => {
  const bools = [
    { name: 'a', isBoolean: true },
    { name: 'b', isBoolean: true },
    { name: 'c', isBoolean: true },
  ];

  it('moves a property up (-1) among same-kind neighbours', () => {
    expect(reorderAnnotationProperty(bools, 'b', -1).map((p) => p.name)).toEqual(['b', 'a', 'c']);
  });

  it('moves a property down (+1) among same-kind neighbours', () => {
    expect(reorderAnnotationProperty(bools, 'b', 1).map((p) => p.name)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op at the top boundary', () => {
    expect(reorderAnnotationProperty(bools, 'a', -1).map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op at the bottom boundary', () => {
    expect(reorderAnnotationProperty(bools, 'c', 1).map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });

  it('skips over the other kind, swapping only with the nearest same-kind neighbour', () => {
    const mixed = [
      { name: 'boolA', isBoolean: true },
      { name: 'textX', isBoolean: false },
      { name: 'boolB', isBoolean: true },
    ];
    // Moving boolB up should jump past textX and swap with boolA.
    expect(reorderAnnotationProperty(mixed, 'boolB', -1).map((p) => p.name)).toEqual([
      'boolB', 'textX', 'boolA',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [{ name: 'a', isBoolean: true }, { name: 'b', isBoolean: true }];
    reorderAnnotationProperty(input, 'a', 1);
    expect(input.map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('returns a copy when the name is not found', () => {
    expect(reorderAnnotationProperty(bools, 'missing', 1).map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('defaultAnnotationFill', () => {
  it('keeps the first property green (historic default)', () => {
    expect(defaultAnnotationFill(0)).toBe('#2ecc71');
  });

  it('gives the second property a different colour than the first', () => {
    expect(defaultAnnotationFill(1)).not.toBe(defaultAnnotationFill(0));
  });

  it('assigns distinct colours across the whole palette', () => {
    const colours = ANNOTATION_FILL_PALETTE.map((_, i) => defaultAnnotationFill(i));
    expect(new Set(colours).size).toBe(ANNOTATION_FILL_PALETTE.length);
  });

  it('wraps around after the palette is exhausted', () => {
    expect(defaultAnnotationFill(ANNOTATION_FILL_PALETTE.length)).toBe(defaultAnnotationFill(0));
    expect(defaultAnnotationFill(ANNOTATION_FILL_PALETTE.length + 1)).toBe(defaultAnnotationFill(1));
  });

  it('handles negative and non-integer indices without throwing', () => {
    expect(typeof defaultAnnotationFill(-1)).toBe('string');
    expect(defaultAnnotationFill(2.7)).toBe(defaultAnnotationFill(2));
  });
});
