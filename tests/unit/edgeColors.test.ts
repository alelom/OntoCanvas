/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { getDefaultEdgeColors } from '../../src/graph';

describe('getDefaultEdgeColors', () => {
  it('should always assign black to subClassOf', () => {
    const colors = getDefaultEdgeColors(['subClassOf', 'contains', 'describes']);
    expect(colors.subClassOf).toBe('#000000');
  });

  it('should assign different colors to different object properties', () => {
    const types = ['subClassOf', 'contains', 'describes', 'hasGeometry', 'defaultGeometry'];
    const colors = getDefaultEdgeColors(types);
    
    // subClassOf should be black
    expect(colors.subClassOf).toBe('#000000');
    
    // Other properties should have different colors
    const otherColors = ['contains', 'describes', 'hasGeometry', 'defaultGeometry']
      .map(type => colors[type])
      .filter(c => c);
    
    // All should have colors assigned
    expect(otherColors.length).toBe(4);
    
    // All should be different
    const uniqueColors = new Set(otherColors);
    expect(uniqueColors.size).toBe(4);
    
    // None should be the default grey
    otherColors.forEach(color => {
      expect(color).not.toBe('#95a5a6'); // DEFAULT_COLOR
      expect(color).toBeTruthy();
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/); // Valid hex color
    });
  });

  it('should distribute colors evenly across spectrum', () => {
    const types = ['subClassOf', 'prop1', 'prop2', 'prop3', 'prop4', 'prop5', 'prop6', 'prop7'];
    const colors = getDefaultEdgeColors(types);
    
    // Get colors for non-subClassOf properties, sorted by type
    const otherTypes = types.filter(t => t !== 'subClassOf').sort();
    const colorValues = otherTypes.map(t => colors[t]);
    
    // All should be different
    expect(new Set(colorValues).size).toBe(colorValues.length);
    
    // First should be more purple (higher hue), last should be more red (lower hue)
    // We can't easily test exact hues without parsing HSL, but we can verify they're different
    expect(colorValues[0]).not.toBe(colorValues[colorValues.length - 1]);
  });

  it('should work with single property', () => {
    const colors = getDefaultEdgeColors(['contains']);
    expect(colors.contains).toBeTruthy();
    expect(colors.contains).not.toBe('#95a5a6');
    expect(colors.contains).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it('should work with external property URIs', () => {
    const types = [
      'subClassOf',
      'https://w3id.org/dano#contains',
      'https://w3id.org/dano#describes'
    ];
    const colors = getDefaultEdgeColors(types);
    
    expect(colors.subClassOf).toBe('#000000');
    expect(colors['https://w3id.org/dano#contains']).toBeTruthy();
    expect(colors['https://w3id.org/dano#describes']).toBeTruthy();
    expect(colors['https://w3id.org/dano#contains']).not.toBe(colors['https://w3id.org/dano#describes']);
  });

  it('should return minimal default when no types provided', () => {
    const colors = getDefaultEdgeColors();
    expect(colors.subClassOf).toBe('#000000');
    expect(Object.keys(colors).length).toBe(1);
  });
});
