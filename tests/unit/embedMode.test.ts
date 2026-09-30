import { describe, it, expect } from 'vitest';
import { shouldShowTopMenuInEmbedMode, isEmbeddedMode } from '../../src/utils/embedMode';

describe('embedMode', () => {
  describe('shouldShowTopMenuInEmbedMode', () => {
    it('returns true when not embedded (empty search)', () => {
      expect(shouldShowTopMenuInEmbedMode(false, '')).toBe(true);
    });

    it('returns true when not embedded (with params)', () => {
      expect(shouldShowTopMenuInEmbedMode(false, '?showMenuInEmbedded=1')).toBe(true);
    });

    it('returns false when embedded and no param', () => {
      expect(shouldShowTopMenuInEmbedMode(true, '')).toBe(false);
    });

    it('returns false when embedded and other params only', () => {
      expect(shouldShowTopMenuInEmbedMode(true, '?foo=bar')).toBe(false);
    });

    it('returns true when embedded and showMenuInEmbedded=1', () => {
      expect(shouldShowTopMenuInEmbedMode(true, '?showMenuInEmbedded=1')).toBe(true);
    });

    it('returns true when embedded and showMenuInEmbedded=true', () => {
      expect(shouldShowTopMenuInEmbedMode(true, '?showMenuInEmbedded=true')).toBe(true);
    });

    it('returns true when embedded and showMenuInEmbedded=1 with other params', () => {
      expect(shouldShowTopMenuInEmbedMode(true, '?a=1&showMenuInEmbedded=1')).toBe(true);
    });

    it('returns false when embedded and showMenuInEmbedded=0', () => {
      expect(shouldShowTopMenuInEmbedMode(true, '?showMenuInEmbedded=0')).toBe(false);
    });

    it('returns false when embedded and showMenuInEmbedded empty', () => {
      expect(shouldShowTopMenuInEmbedMode(true, '?showMenuInEmbedded=')).toBe(false);
    });

    it('returns true when embedded and showMenuInEmbedded=yes', () => {
      expect(shouldShowTopMenuInEmbedMode(true, '?showMenuInEmbedded=yes')).toBe(true);
    });
  });

  describe('isEmbeddedMode', () => {
    it('is true whenever actually framed, regardless of params', () => {
      expect(isEmbeddedMode(true, '')).toBe(true);
      expect(isEmbeddedMode(true, '?foo=bar')).toBe(true);
    });

    it('is false when not framed and no embed flag', () => {
      expect(isEmbeddedMode(false, '')).toBe(false);
      expect(isEmbeddedMode(false, '?onto=x')).toBe(false);
    });

    it('is true when not framed but ?embed flag is set (bare or truthy)', () => {
      expect(isEmbeddedMode(false, '?embed')).toBe(true);
      expect(isEmbeddedMode(false, '?embed=1')).toBe(true);
      expect(isEmbeddedMode(false, '?embed=true')).toBe(true);
      expect(isEmbeddedMode(false, '?onto=x&embed=yes')).toBe(true);
    });

    it('is false when ?embed is an explicit falsey value', () => {
      expect(isEmbeddedMode(false, '?embed=0')).toBe(false);
      expect(isEmbeddedMode(false, '?embed=false')).toBe(false);
    });
  });
});
