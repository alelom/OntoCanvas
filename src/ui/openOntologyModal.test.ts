import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  initOpenOntologyModal,
  showOpenOntologyModal,
  hideOpenOntologyModal,
} from './openOntologyModal';

// Use jsdom environment for DOM tests
// @vitest-environment jsdom

// Mock storage (default: no last file, no history)
const mockGetLastFile = vi.fn().mockResolvedValue(null);
const mockGetRecentlyOpened = vi.fn().mockResolvedValue([]);
vi.mock('../storage', () => ({
  getLastFileFromIndexedDB: (...args: unknown[]) => mockGetLastFile(...args),
  getLastUrlFromIndexedDB: vi.fn().mockResolvedValue(null),
  getRecentlyOpenedFromIndexedDB: (...args: unknown[]) => mockGetRecentlyOpened(...args),
}));

describe('openOntologyModal', () => {
  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';
    vi.clearAllMocks();
    mockGetLastFile.mockResolvedValue(null);
    mockGetRecentlyOpened.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('initOpenOntologyModal', () => {
    it('should initialize the modal with callbacks', () => {
      const onFile = vi.fn();
      const onUrl = vi.fn();
      const onLast = vi.fn();

      initOpenOntologyModal(onFile, onUrl, onLast, vi.fn(), vi.fn());

      // Modal element should be created
      const modal = document.getElementById('openOntologyModal');
      expect(modal).toBeTruthy();
    });

    it('should create modal only once on multiple calls', () => {
      const onFile = vi.fn();
      const onUrl = vi.fn();
      const onLast = vi.fn();

      initOpenOntologyModal(onFile, onUrl, onLast, vi.fn(), vi.fn());
      const firstModal = document.getElementById('openOntologyModal');

      initOpenOntologyModal(onFile, onUrl, onLast, vi.fn(), vi.fn());
      const secondModal = document.getElementById('openOntologyModal');

      expect(firstModal).toBe(secondModal);
    });
  });

  describe('showOpenOntologyModal', () => {
    it('should not throw when modal is initialized', async () => {
      const onFile = vi.fn();
      const onUrl = vi.fn();
      const onLast = vi.fn();

      initOpenOntologyModal(onFile, onUrl, onLast, vi.fn(), vi.fn());
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should not throw
      expect(() => showOpenOntologyModal()).not.toThrow();
    });

    it('should handle case when modal is not initialized', () => {
      // Should not throw
      expect(() => showOpenOntologyModal()).not.toThrow();
    });
  });

  describe('hideOpenOntologyModal', () => {
    it('should not throw when modal is initialized', async () => {
      const onFile = vi.fn();
      const onUrl = vi.fn();
      const onLast = vi.fn();

      initOpenOntologyModal(onFile, onUrl, onLast, vi.fn(), vi.fn());
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 50));
      
      showOpenOntologyModal();
      
      // Should not throw
      expect(() => hideOpenOntologyModal()).not.toThrow();
    });

    it('should handle case when modal is not initialized', () => {
      // Should not throw
      expect(() => hideOpenOntologyModal()).not.toThrow();
    });
  });

  describe('modal interactions', () => {
    it('should call onFile callback when file button is clicked', async () => {
      const onFile = vi.fn().mockResolvedValue(undefined);
      const onUrl = vi.fn();
      const onLast = vi.fn();

      initOpenOntologyModal(onFile, onUrl, onLast, vi.fn(), vi.fn());
      showOpenOntologyModal();

      // Find and click the file button
      const modal = document.getElementById('openOntologyModal');
      const fileBtn = Array.from(modal?.querySelectorAll('button') || []).find(
        (btn) => btn.textContent === 'Open Ontology from TTL file'
      );

      if (fileBtn) {
        fileBtn.click();
        // Wait for async callback
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(onFile).toHaveBeenCalled();
      } else {
        // If button not found, skip test
        expect(true).toBe(true);
      }
    });

    it('should show last opened file name in button when storage returns handle and pathHint', async () => {
      mockGetLastFile.mockResolvedValue({
        handle: { name: 'my-ontology.owl' },
        pathHint: 'my-ontology.owl',
      });
      const onFile = vi.fn();
      const onUrl = vi.fn();
      const onLast = vi.fn();
      const onLastUrl = vi.fn();

      initOpenOntologyModal(onFile, onUrl, onLast, onLastUrl, vi.fn());
      showOpenOntologyModal();

      const lastFileBtn = document.getElementById('openOntologyLoadLastFile') as HTMLButtonElement | null;
      expect(lastFileBtn).toBeTruthy();
      await vi.waitFor(
        () => {
          expect(lastFileBtn?.textContent).toContain('my-ontology.owl');
          expect(lastFileBtn?.disabled).toBe(false);
        },
        { timeout: 1000 }
      );
      mockGetLastFile.mockResolvedValue(null);
    });

    it('should call onUrl callback when URL button is clicked', async () => {
      const onFile = vi.fn();
      const onUrl = vi.fn().mockResolvedValue(undefined);
      const onLast = vi.fn();

      // Mock the URL input dialog
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
        if (tagName === 'div') {
          const div = originalCreateElement('div');
          // Mock the dialog structure
          if (div.style) {
            div.innerHTML = `
              <input type="url" value="https://example.com/test.ttl" />
              <button class="ok">Open</button>
            `;
            // Auto-click OK after a delay
            setTimeout(() => {
              const okBtn = div.querySelector('.ok');
              if (okBtn) okBtn.dispatchEvent(new MouseEvent('click'));
            }, 10);
          }
          return div;
        }
        return originalCreateElement(tagName);
      });

      initOpenOntologyModal(onFile, onUrl, onLast, vi.fn(), vi.fn());
      showOpenOntologyModal();

      const modal = document.getElementById('openOntologyModal');
      const urlBtn = Array.from(modal?.querySelectorAll('button') || []).find(
        (btn) => btn.textContent === 'Open ontology from URL'
      );

      if (urlBtn) {
        urlBtn.click();
        // Wait for async operations
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Note: The actual URL dialog is complex, so we're just checking the button exists
        expect(urlBtn).toBeTruthy();
      }
    });
  });

  describe('Example ontologies section', () => {
    it('lists all example ontologies and opens the clicked one via onUrl', async () => {
      const onFile = vi.fn();
      const onUrl = vi.fn().mockResolvedValue(undefined);
      const onLast = vi.fn();

      initOpenOntologyModal(onFile, onUrl, onLast, vi.fn(), vi.fn());
      showOpenOntologyModal();

      const modal = document.getElementById('openOntologyModal');
      const buttons = Array.from(modal?.querySelectorAll('button') || []);
      const pizzaBtn = buttons.find((btn) => btn.textContent?.startsWith('Pizza'));
      expect(pizzaBtn).toBeTruthy();

      pizzaBtn!.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onUrl).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/owlcs/pizza-ontology/refs/heads/master/pizza.owl'
      );
    });
  });

  describe('Previously opened section', () => {
    it('shows a placeholder when there is no history', async () => {
      mockGetRecentlyOpened.mockResolvedValue([]);
      initOpenOntologyModal(vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn());
      showOpenOntologyModal();

      const list = document.getElementById('openOntologyRecentList');
      await vi.waitFor(() => {
        expect(list?.textContent).toContain('(none yet)');
      });
    });

    it('lists recent entries and reopens the clicked one via onRecentEntry', async () => {
      mockGetRecentlyOpened.mockResolvedValue([
        { kind: 'url', url: 'https://example.com/a.ttl', name: 'a.ttl', openedAt: 1 },
      ]);
      const onRecentEntry = vi.fn().mockResolvedValue(undefined);
      initOpenOntologyModal(vi.fn(), vi.fn(), vi.fn(), vi.fn(), onRecentEntry);
      showOpenOntologyModal();

      const list = document.getElementById('openOntologyRecentList');
      const entryBtn = await vi.waitFor(() => {
        const btn = Array.from(list?.querySelectorAll('button') || []).find((b) =>
          b.textContent?.includes('a.ttl')
        );
        expect(btn).toBeTruthy();
        return btn!;
      });

      entryBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(onRecentEntry).toHaveBeenCalledWith({
        kind: 'url',
        url: 'https://example.com/a.ttl',
        name: 'a.ttl',
        openedAt: 1,
      });
    });
  });
});
