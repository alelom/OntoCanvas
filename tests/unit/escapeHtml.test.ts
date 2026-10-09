import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../../src/utils/escapeHtml';

describe('escapeHtml', () => {
  it('escapes what could start markup, in text and in quoted attributes', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escapeHtml("it's & that")).toBe('it&#39;s &amp; that');
  });
  it('leaves plain text alone', () => {
    expect(escapeHtml('has property (xsd:string)')).toBe('has property (xsd:string)');
  });
  it('escapes & first, so an entity in the input is shown as written', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});
