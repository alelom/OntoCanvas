import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CorsOrNetworkError } from '../externalOntologySearch';
import { isLikelyCorsError, handleUrlLoadFailure } from './urlLoadFailureHandler';

vi.mock('../ui/urlLoadFailureModals', () => ({
  showCorsFailureModal: vi.fn(),
  showGenericUrlLoadFailureModal: vi.fn(),
}));

describe('urlLoadFailureHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isLikelyCorsError', () => {
    it('returns true for CorsOrNetworkError instance', () => {
      expect(isLikelyCorsError(new CorsOrNetworkError())).toBe(true);
    });

    it('returns false for generic Error', () => {
      expect(isLikelyCorsError(new Error('Failed to fetch ontology'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isLikelyCorsError('string')).toBe(false);
      expect(isLikelyCorsError(null)).toBe(false);
    });
  });

  describe('handleUrlLoadFailure', () => {
    it('shows CORS modal when error is CorsOrNetworkError', async () => {
      const { showCorsFailureModal, showGenericUrlLoadFailureModal } = await import(
        '../ui/urlLoadFailureModals'
      );
      const onOpenFile = vi.fn();
      handleUrlLoadFailure('https://example.com/ontology.ttl', new CorsOrNetworkError(), {
        onOpenFile,
      });
      expect(showCorsFailureModal).toHaveBeenCalledWith('https://example.com/ontology.ttl', onOpenFile);
      expect(showGenericUrlLoadFailureModal).not.toHaveBeenCalled();
    });

    it('shows generic modal when error is not CORS', async () => {
      const { showCorsFailureModal, showGenericUrlLoadFailureModal } = await import(
        '../ui/urlLoadFailureModals'
      );
      handleUrlLoadFailure('https://example.com/ontology.ttl', new Error('HTTP 404'), {
        onOpenFile: vi.fn(),
      });
      expect(showGenericUrlLoadFailureModal).toHaveBeenCalledWith(
        'https://example.com/ontology.ttl',
        'HTTP 404'
      );
      expect(showCorsFailureModal).not.toHaveBeenCalled();
    });

    it('converts non-Error to string for generic modal', async () => {
      const { showGenericUrlLoadFailureModal } = await import('../ui/urlLoadFailureModals');
      handleUrlLoadFailure('https://example.com/foo', 'unknown error', { onOpenFile: vi.fn() });
      expect(showGenericUrlLoadFailureModal).toHaveBeenCalledWith(
        'https://example.com/foo',
        'unknown error'
      );
    });
  });
});
