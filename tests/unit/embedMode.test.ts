import { describe, it, expect } from 'vitest';
import { shouldShowTopMenuInEmbedMode } from '../../src/utils/embedMode';

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
});
