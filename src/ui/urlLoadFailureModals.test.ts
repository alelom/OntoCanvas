/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { showCorsFailureModal, showGenericUrlLoadFailureModal } from './urlLoadFailureModals';

describe('urlLoadFailureModals', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  describe('showCorsFailureModal', () => {
    it('appends a modal to body with title and CORS message', () => {
      const onOpenFile = () => {};
      showCorsFailureModal('https://example.com/ontology.ttl', onOpenFile);
      const overlay = document.body.querySelector('div');
      expect(overlay).toBeTruthy();
      expect(overlay!.textContent).toContain('Could not load ontology from URL');
      expect(overlay!.textContent).toContain('CORS');
    });

    it('includes Download TTL link with derived filename', () => {
      showCorsFailureModal('https://pi.pauwel.be/voc/buildingelement/ontology.ttl', () => {});
      expect(document.body.textContent).toMatch(/Download TTL.*ontology\.ttl/);
    });

    it('includes Open file and Close buttons', () => {
      showCorsFailureModal('https://example.com/foo', () => {});
      expect(document.body.textContent).toContain('Open file…');
      expect(document.body.textContent).toContain('Close');
    });
  });

  describe('showGenericUrlLoadFailureModal', () => {
    it('appends a modal with title and error message', () => {
      showGenericUrlLoadFailureModal('https://example.com/foo', 'HTTP 404');
      expect(document.body.textContent).toContain('Failed to load ontology from URL');
      expect(document.body.textContent).toContain('HTTP 404');
    });

    it('includes Close button', () => {
      showGenericUrlLoadFailureModal('https://example.com/foo', 'Error');
      expect(document.body.textContent).toContain('Close');
    });
  });
});
