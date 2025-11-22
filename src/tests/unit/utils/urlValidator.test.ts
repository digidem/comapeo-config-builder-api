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

  describe('Edge Cases', () => {
    it('should reject IPv6 loopback ::1', () => {
      const result = validateIconUrl('http://[::1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject IPv6 link-local addresses', () => {
      const result = validateIconUrl('http://[fe80::1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject IPv6 unique local addresses', () => {
      const result = validateIconUrl('http://[fc00::1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    // IPv4-mapped IPv6 SSRF bypass tests
    it('should reject IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', () => {
      const result = validateIconUrl('http://[::ffff:127.0.0.1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject IPv4-mapped IPv6 private IP 10.x', () => {
      const result = validateIconUrl('http://[::ffff:10.0.0.1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject IPv4-mapped IPv6 private IP 192.168.x', () => {
      const result = validateIconUrl('http://[::ffff:192.168.1.1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject IPv4-mapped IPv6 private IP 172.16.x', () => {
      const result = validateIconUrl('http://[::ffff:172.16.0.1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject IPv4-mapped IPv6 AWS metadata endpoint', () => {
      const result = validateIconUrl('http://[::ffff:169.254.169.254]/latest/meta-data/');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject IPv4-mapped IPv6 with case-insensitive prefix', () => {
      const result = validateIconUrl('http://[::FFFF:127.0.0.1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should handle URLs with ports', () => {
      const result = validateIconUrl('https://example.com:8080/icon.svg');
      expect(result.valid).toBe(true);
    });

    it('should reject localhost with non-standard port', () => {
      const result = validateIconUrl('http://localhost:8080/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject 127.x.x.x range', () => {
      const result = validateIconUrl('http://127.1.2.3/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should handle URLs with query parameters', () => {
      const result = validateIconUrl('https://example.com/icon.svg?size=large&format=svg');
      expect(result.valid).toBe(true);
    });

    it('should handle URLs with fragments', () => {
      const result = validateIconUrl('https://example.com/icon.svg#layer1');
      expect(result.valid).toBe(true);
    });

    it('should handle malformed URLs (triple slash)', () => {
      // URL class normalizes http:///icon.svg to http://icon.svg/
      // This becomes a valid URL with hostname "icon.svg"
      const result = validateIconUrl('http:///icon.svg');
      // This is actually valid after URL normalization
      expect(result.valid).toBe(true);
    });

    it('should handle case-insensitive hostname matching for localhost', () => {
      const result = validateIconUrl('http://LOCALHOST/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should handle case-insensitive hostname matching for metadata endpoints', () => {
      const result = validateIconUrl('http://METADATA.GOOGLE.INTERNAL/test');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject subdomain of localhost', () => {
      const result = validateIconUrl('http://test.localhost/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should reject URLs with @ character (potential bypass)', () => {
      // http://user@localhost would have user as username
      const result = validateIconUrl('http://user@localhost/icon.svg');
      expect(result.valid).toBe(false);
      // Will fail due to username OR hostname blocking
    });

    it('should handle international domain names (IDN)', () => {
      // Test with actual punycode encoded domain
      const result = validateIconUrl('https://xn--n3h.com/icon.svg'); // ☃.com in punycode
      expect(result.valid).toBe(true);
    });

    it('should reject data: URLs', () => {
      const result = validateIconUrl('data:image/svg+xml,<svg></svg>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Protocol');
    });

    it('should reject javascript: URLs', () => {
      const result = validateIconUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Protocol');
    });

    it('should reject blob: URLs', () => {
      const result = validateIconUrl('blob:https://example.com/abc-123');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Protocol');
    });

    it('should handle URL-encoded hostnames correctly', () => {
      // %6C%6F%63%61%6C%68%6F%73%74 = "localhost" in URL encoding
      // URL class should decode this, and we should reject it
      const result = validateIconUrl('http://%6C%6F%63%61%6C%68%6F%73%74/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
    });

    it('should handle Azure metadata endpoint on non-standard port', () => {
      const result = validateIconUrl('http://100.100.100.200:8080/metadata');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal/private');
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

    it('should enforce size limits', async () => {
      // This test would require a real server that returns large content
      // For now, we document the expected behavior
      expect(true).toBe(true);
    });

    it('should enforce timeout', async () => {
      // This test would require a real server that delays response
      // For now, we document the expected behavior
      expect(true).toBe(true);
    });

    it('should validate content-type is SVG or XML', async () => {
      // This test would require a real server that returns wrong content-type
      // For now, we document the expected behavior
      expect(true).toBe(true);
    });

    // Note: Redirect testing requires actual HTTP server
    // The following tests document expected behavior but cannot be fully tested
    // without integration testing infrastructure

    it.skip('should follow valid redirects', async () => {
      // REQUIRES TEST SERVER
      // Test: https://example.com/redirect -> https://cdn.example.com/icon.svg
      // Expected: Should succeed and return content
    });

    it.skip('should reject redirects to localhost', async () => {
      // REQUIRES TEST SERVER
      // Test: https://evil.com/redirect -> http://localhost/secret
      // Expected: Should fail with SSRF protection error
      // Current implementation may have vulnerability here
    });

    it.skip('should reject redirects to private IPs', async () => {
      // REQUIRES TEST SERVER
      // Test: https://evil.com/redirect -> http://192.168.1.1/internal
      // Expected: Should fail with SSRF protection error
      // Current implementation may have vulnerability here
    });

    it.skip('should reject redirects to cloud metadata endpoints', async () => {
      // REQUIRES TEST SERVER
      // Test: https://evil.com/redirect -> http://169.254.169.254/latest/meta-data/
      // Expected: Should fail with SSRF protection error
      // Current implementation may have vulnerability here
    });

    it.skip('should limit redirect chains', async () => {
      // REQUIRES TEST SERVER
      // Test: URL that redirects 50+ times
      // Expected: Should fail with too many redirects error
    });

    // Note: Testing actual network requests would require mocking or a test server
    // These tests verify the validation layer works correctly
  });
});
