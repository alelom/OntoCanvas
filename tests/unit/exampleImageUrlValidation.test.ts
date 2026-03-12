import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveImageUrl, validateExampleImageUrl, hasValidImageExtension } from '../../src/lib/exampleImageUrlValidation';

// Mock fetch for reachability tests
global.fetch = vi.fn();

describe('exampleImageUrlValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasValidImageExtension', () => {
    it('should return true for valid image extensions', () => {
      expect(hasValidImageExtension('image.png')).toBe(true);
      expect(hasValidImageExtension('image.jpg')).toBe(true);
      expect(hasValidImageExtension('image.jpeg')).toBe(true);
      expect(hasValidImageExtension('image.gif')).toBe(true);
      expect(hasValidImageExtension('image.webp')).toBe(true);
      expect(hasValidImageExtension('image.bmp')).toBe(true);
      expect(hasValidImageExtension('image.svg')).toBe(true);
    });

    it('should return false for invalid extensions', () => {
      expect(hasValidImageExtension('image.txt')).toBe(false);
      expect(hasValidImageExtension('image.pdf')).toBe(false);
      expect(hasValidImageExtension('image')).toBe(false);
    });

    it('should ignore query parameters and fragments', () => {
      expect(hasValidImageExtension('image.png?v=1')).toBe(true);
      expect(hasValidImageExtension('image.png#section')).toBe(true);
      expect(hasValidImageExtension('image.png?v=1#section')).toBe(true);
    });
  });

  describe('resolveImageUrl - GitHub blob URL conversion', () => {
    it('should convert GitHub blob URLs to raw URLs', () => {
      const blobUrl = 'https://github.com/BuroHappoldMachineLearning/ADIRO/blob/main/src/img/DGU_1.png';
      const expected = 'https://raw.githubusercontent.com/BuroHappoldMachineLearning/ADIRO/refs/heads/main/src/img/DGU_1.png';
      
      const result = resolveImageUrl(blobUrl, null);
      expect(result).toBe(expected);
    });

    it('should convert GitHub blob URLs with different branches', () => {
      const blobUrl = 'https://github.com/owner/repo/blob/develop/path/to/image.jpg';
      const expected = 'https://raw.githubusercontent.com/owner/repo/refs/heads/develop/path/to/image.jpg';
      
      const result = resolveImageUrl(blobUrl, null);
      expect(result).toBe(expected);
    });

    it('should convert GitHub blob URLs with nested paths', () => {
      const blobUrl = 'https://github.com/user/project/blob/master/docs/images/logo.png';
      const expected = 'https://raw.githubusercontent.com/user/project/refs/heads/master/docs/images/logo.png';
      
      const result = resolveImageUrl(blobUrl, null);
      expect(result).toBe(expected);
    });

    it('should not convert non-GitHub URLs', () => {
      const url = 'https://example.com/image.png';
      const result = resolveImageUrl(url, null);
      expect(result).toBe(url);
    });

    it('should not convert GitHub URLs that are not blob URLs', () => {
      const url = 'https://github.com/owner/repo';
      const result = resolveImageUrl(url, null);
      expect(result).toBe(url);
    });
  });

  describe('resolveImageUrl - relative URL resolution', () => {
    it('should resolve relative URLs against ontology location', () => {
      const relativeUrl = 'img/photo.png';
      const ontologyLocation = 'https://example.com/ontology.ttl';
      const expected = 'https://example.com/img/photo.png';
      
      const result = resolveImageUrl(relativeUrl, ontologyLocation);
      expect(result).toBe(expected);
    });

    it('should resolve relative URLs when ontology location is a directory', () => {
      const relativeUrl = 'img/photo.png';
      const ontologyLocation = 'https://example.com/ADIRO';
      const expected = 'https://example.com/ADIRO/img/photo.png';
      
      const result = resolveImageUrl(relativeUrl, ontologyLocation);
      expect(result).toBe(expected);
    });

    it('should resolve relative URLs when ontology location ends with slash', () => {
      const relativeUrl = 'img/photo.png';
      const ontologyLocation = 'https://example.com/ADIRO/';
      const expected = 'https://example.com/ADIRO/img/photo.png';
      
      const result = resolveImageUrl(relativeUrl, ontologyLocation);
      expect(result).toBe(expected);
    });

    it('should use directory part when ontology location has file extension', () => {
      const relativeUrl = 'img/photo.png';
      const ontologyLocation = 'https://example.com/ADIRO/ontology.ttl';
      const expected = 'https://example.com/ADIRO/img/photo.png';
      
      const result = resolveImageUrl(relativeUrl, ontologyLocation);
      expect(result).toBe(expected);
    });

    it('should return null when ontology location is null', () => {
      const relativeUrl = 'img/photo.png';
      const result = resolveImageUrl(relativeUrl, null);
      expect(result).toBeNull();
    });

    it('should return null when ontology location is not a valid URL', () => {
      const relativeUrl = 'img/photo.png';
      const ontologyLocation = '/path/to/file.ttl';
      const result = resolveImageUrl(relativeUrl, ontologyLocation);
      expect(result).toBeNull();
    });
  });

  describe('validateExampleImageUrl', () => {
    it('should return error for empty URL', async () => {
      const result = await validateExampleImageUrl('', null);
      expect(result).toBe('URL cannot be empty');
    });

    it('should return error for URL without image extension', async () => {
      const result = await validateExampleImageUrl('https://example.com/file.txt', null);
      expect(result).toContain('URL must point to an image file');
    });

    it('should convert GitHub blob URL and validate it', async () => {
      const blobUrl = 'https://github.com/BuroHappoldMachineLearning/ADIRO/blob/main/src/img/DGU_1.png';
      
      // Mock fetch to return successful response with image content-type
      (global.fetch as any).mockResolvedValueOnce({
        headers: {
          get: (name: string) => name === 'content-type' ? 'image/png' : null,
        },
        ok: true,
      });

      const result = await validateExampleImageUrl(blobUrl, null);
      
      // Should have converted the URL
      expect(global.fetch).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/BuroHappoldMachineLearning/ADIRO/refs/heads/main/src/img/DGU_1.png',
        expect.objectContaining({ method: 'HEAD' })
      );
      
      // Should be valid (no error)
      expect(result).toBeNull();
    });

    it('should show conversion message when GitHub blob URL is unreachable', async () => {
      const blobUrl = 'https://github.com/owner/repo/blob/main/image.png';
      
      // Mock fetch to fail
      (global.fetch as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      
      // Mock Image element to fail
      const mockImage = {
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        src: '',
        addEventListener: vi.fn(),
      };
      global.Image = vi.fn(() => mockImage as any) as any;
      
      // Simulate image load failure
      setTimeout(() => {
        if (mockImage.onerror) mockImage.onerror();
      }, 10);

      const result = await validateExampleImageUrl(blobUrl, null);
      
      expect(result).toContain('The GitHub blob URL was converted to:');
      expect(result).toContain('raw.githubusercontent.com');
      expect(result).toContain('not reachable');
    });

    it('should resolve relative URL and show resolved URL in error message', async () => {
      const relativeUrl = 'img/photo.png';
      const ontologyLocation = 'https://example.com/ADIRO';
      
      // Mock fetch to fail
      (global.fetch as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      
      // Mock Image element to fail
      const mockImage = {
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        src: '',
        addEventListener: vi.fn(),
      };
      global.Image = vi.fn(() => mockImage as any) as any;
      
      setTimeout(() => {
        if (mockImage.onerror) mockImage.onerror();
      }, 10);

      const result = await validateExampleImageUrl(relativeUrl, ontologyLocation);
      
      expect(result).toContain('The input image relative URL resolves to a full URL:');
      expect(result).toContain('https://example.com/ADIRO/img/photo.png');
      expect(result).toContain('not reachable');
    });

    it('should return null for valid reachable image URL', async () => {
      const url = 'https://example.com/image.png';
      
      // Mock fetch to return successful response
      (global.fetch as any).mockResolvedValueOnce({
        headers: {
          get: (name: string) => name === 'content-type' ? 'image/png' : null,
        },
        ok: true,
      });

      const result = await validateExampleImageUrl(url, null);
      expect(result).toBeNull();
    });

    it('should handle CORS errors and fall back to Image element test', async () => {
      const url = 'https://example.com/image.png';
      
      // Mock fetch to fail with CORS error
      (global.fetch as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
      
      // Mock Image element to succeed
      const mockImage = {
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        src: '',
        addEventListener: vi.fn(),
      };
      global.Image = vi.fn(() => mockImage as any) as any;
      
      // Simulate successful image load
      setTimeout(() => {
        if (mockImage.onload) mockImage.onload();
      }, 10);

      const result = await validateExampleImageUrl(url, null);
      expect(result).toBeNull(); // Should be valid
    });
  });
});
