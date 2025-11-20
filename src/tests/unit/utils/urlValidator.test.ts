import { describe, it, expect } from 'bun:test';
import { validateIconUrl, safeFetch } from '../../../utils/urlValidator';

describe('URL Validator', () => {
  describe('validateIconUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      const result = validateIconUrl('https://example.com/icon.svg');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid HTTP URLs', () => {
      const result = validateIconUrl('http://example.com/icon.svg');
      expect(result.valid).toBe(true);
    });

    it('should reject URLs that are too long', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(3000);
      const result = validateIconUrl(longUrl);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should reject invalid URL format', () => {
      const result = validateIconUrl('not a url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should reject FTP protocol', () => {
      const result = validateIconUrl('ftp://example.com/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Protocol');
    });

    it('should reject file:// protocol', () => {
      const result = validateIconUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Protocol');
    });

    // SSRF Prevention Tests
    it('should reject localhost URLs', () => {
      const result = validateIconUrl('http://localhost/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject 127.0.0.1', () => {
      const result = validateIconUrl('http://127.0.0.1/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject 0.0.0.0', () => {
      const result = validateIconUrl('http://0.0.0.0/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject AWS metadata endpoint', () => {
      const result = validateIconUrl('http://169.254.169.254/latest/meta-data/');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject GCP metadata endpoint', () => {
      const result = validateIconUrl('http://metadata.google.internal/computeMetadata/v1/');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject private IP range 10.x.x.x', () => {
      const result = validateIconUrl('http://10.0.0.1/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject private IP range 192.168.x.x', () => {
      const result = validateIconUrl('http://192.168.1.1/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject private IP range 172.16-31.x.x', () => {
      const result = validateIconUrl('http://172.16.0.1/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject link-local IP 169.254.x.x', () => {
      const result = validateIconUrl('http://169.254.1.1/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject URLs with username:password', () => {
      const result = validateIconUrl('http://user:pass@example.com/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid hostname');
    });
  });

  describe('safeFetch', () => {
    it('should reject URLs that fail validation', async () => {
      try {
        await safeFetch('http://localhost/icon.svg');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('URL validation failed');
      }
    });

    it('should reject private IP addresses', async () => {
      try {
        await safeFetch('http://10.0.0.1/icon.svg');
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('URL validation failed');
      }
    });

    // Note: Testing actual network requests would require mocking or a test server
    // These tests verify the validation layer works correctly
  });
});
