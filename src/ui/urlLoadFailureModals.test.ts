/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { showCorsFailureModal, showGenericUrlLoadFailureModal, showTimeoutFailureModal } from './urlLoadFailureModals';

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

  describe('showTimeoutFailureModal', () => {
    const buttons = () => Array.from(document.body.querySelectorAll('button'));
    const button = (text: string) => buttons().find((b) => b.textContent?.startsWith(text));

    it('says the server was too slow, for how long it waited, and that refreshing often helps', () => {
      showTimeoutFailureModal('https://example.com/slow.n3', 15, () => {});
      const text = document.body.textContent ?? '';
      expect(text).toContain('took too long');
      expect(text).toContain('15 seconds');
      expect(text).toMatch(/slow|busy/);
      expect(text).toMatch(/refresh|reload/i);
      expect(text).not.toContain('Failed to fetch ontology');
    });

    it('offers Reload, Open file and Close', () => {
      showTimeoutFailureModal('https://example.com/slow.n3', 15, () => {});
      expect(button('Reload')).toBeTruthy();
      expect(button('Open file')).toBeTruthy();
      expect(button('Close')).toBeTruthy();
    });

    it('reloads the page, opens the file picker, or closes, as chosen', () => {
      const onOpenFile = vi.fn();
      const reload = vi.fn();
      showTimeoutFailureModal('https://example.com/slow.n3', 15, onOpenFile, reload);
      button('Reload')!.click();
      expect(reload).toHaveBeenCalledTimes(1);

      showTimeoutFailureModal('https://example.com/slow.n3', 15, onOpenFile, reload);
      button('Open file')!.click();
      expect(onOpenFile).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).not.toContain('took too long'); // the dialog closes

      document.body.innerHTML = '';
      showTimeoutFailureModal('https://example.com/slow.n3', 15, onOpenFile, reload);
      button('Close')!.click();
      expect(document.body.textContent).not.toContain('took too long');
    });

    it('says one second, not "1 seconds"', () => {
      showTimeoutFailureModal('https://example.com/slow.n3', 1, () => {});
      expect(document.body.textContent).toContain('1 second');
      expect(document.body.textContent).not.toContain('1 seconds');
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
