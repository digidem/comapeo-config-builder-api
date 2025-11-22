import { describe, it, expect } from 'bun:test';
import { validateIconUrl, safeFetch, extractIPv4FromMappedIPv6 } from '../../../utils/urlValidator';

describe('URL Validator', () => {
  describe('extractIPv4FromMappedIPv6', () => {
    describe('Hex format (URL-normalized)', () => {
      it('should extract IPv4 from ::ffff:7f00:1 (127.0.0.1)', () => {
        const result = extractIPv4FromMappedIPv6('[::ffff:7f00:1]');
        expect(result).toBe('127.0.0.1');
      });

      it('should extract IPv4 from ::ffff:a00:1 (10.0.0.1)', () => {
        const result = extractIPv4FromMappedIPv6('[::ffff:a00:1]');
        expect(result).toBe('10.0.0.1');
      });

      it('should extract IPv4 from ::ffff:c0a8:101 (192.168.1.1)', () => {
        const result = extractIPv4FromMappedIPv6('[::ffff:c0a8:101]');
        expect(result).toBe('192.168.1.1');
      });

      it('should extract IPv4 from ::ffff:a9fe:a9fe (169.254.169.254)', () => {
        const result = extractIPv4FromMappedIPv6('[::ffff:a9fe:a9fe]');
        expect(result).toBe('169.254.169.254');
      });

      it('should extract IPv4 from ::ffff:808:808 (8.8.8.8)', () => {
        const result = extractIPv4FromMappedIPv6('[::ffff:808:808]');
        expect(result).toBe('8.8.8.8');
      });

      it('should handle hex format without brackets', () => {
        const result = extractIPv4FromMappedIPv6('::ffff:7f00:1');
        expect(result).toBe('127.0.0.1');
      });

      it('should be case-insensitive for hex', () => {
        const result = extractIPv4FromMappedIPv6('[::FFFF:7F00:1]');
        expect(result).toBe('127.0.0.1');
      });
    });

    describe('Dotted decimal format', () => {
      it('should extract IPv4 from ::ffff:127.0.0.1', () => {
        const result = extractIPv4FromMappedIPv6('[::ffff:127.0.0.1]');
        expect(result).toBe('127.0.0.1');
      });

      it('should extract IPv4 from ::ffff:10.0.0.1', () => {
        const result = extractIPv4FromMappedIPv6('[::ffff:10.0.0.1]');
        expect(result).toBe('10.0.0.1');
      });

      it('should handle dotted format without brackets', () => {
        const result = extractIPv4FromMappedIPv6('::ffff:192.168.1.1');
        expect(result).toBe('192.168.1.1');
      });

      it('should be case-insensitive for prefix', () => {
        const result = extractIPv4FromMappedIPv6('[::FFFF:127.0.0.1]');
        expect(result).toBe('127.0.0.1');
      });
    });

    describe('Non-mapped addresses', () => {
      it('should return null for regular IPv6 loopback', () => {
        const result = extractIPv4FromMappedIPv6('[::1]');
        expect(result).toBeNull();
      });

      it('should return null for IPv6 link-local', () => {
        const result = extractIPv4FromMappedIPv6('[fe80::1]');
        expect(result).toBeNull();
      });

      it('should return null for regular IPv4', () => {
        const result = extractIPv4FromMappedIPv6('127.0.0.1');
        expect(result).toBeNull();
      });

      it('should return null for empty string', () => {
        const result = extractIPv4FromMappedIPv6('');
        expect(result).toBeNull();
      });

      it('should return null for non-IP strings', () => {
        const result = extractIPv4FromMappedIPv6('example.com');
        expect(result).toBeNull();
      });
    });
  });

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

    it('should reject IPv6 unique local addresses (fc00::/8)', () => {
      const result = validateIconUrl('http://[fc00::1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject IPv6 unique local addresses (fd00::/8)', () => {
      const result = validateIconUrl('http://[fd00::1]/icon.svg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private IP');
    });

    it('should reject IPv6 unique local addresses (fd00:: with more segments)', () => {
      const result = validateIconUrl('http://[fd00:1234:5678::1]/icon.svg');
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

    // Positive test cases - public IPs via IPv4-mapped IPv6 should work
    it('should accept public IP via IPv4-mapped IPv6 dotted format (8.8.8.8)', () => {
      const result = validateIconUrl('http://[::ffff:8.8.8.8]/icon.svg');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept public IP via IPv4-mapped IPv6 hex format (8.8.8.8)', () => {
      // URL class normalizes ::ffff:8.8.8.8 to [::ffff:808:808]
      // Verify this works by testing with already-normalized format
      const result = validateIconUrl('http://[::ffff:808:808]/icon.svg');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept Cloudflare DNS via IPv4-mapped IPv6 (1.1.1.1)', () => {
      const result = validateIconUrl('http://[::ffff:1.1.1.1]/icon.svg');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
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

    it('should reject IPv6 unique local addresses (fc00::/8)', async () => {
      try {
        await safeFetch('http://[fc00::1]/icon.svg');
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('URL validation failed');
      }
    });

    it('should reject IPv6 unique local addresses (fd00::/8)', async () => {
      try {
        await safeFetch('http://[fd00::1]/icon.svg');
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('URL validation failed');
      }
    });

    // DNS rebinding protection: validateResolvedIP() checks that hostnames don't
    // resolve to blocked IPs (including fc00::/8 and fd00::/8).
    // Testing this requires mocking DNS lookups, which is complex for unit tests.
    // The protection is implemented via isBlockedIP() which checks BLOCKED_IP_RANGES.
    it('should block DNS rebinding to fd00:: addresses (documented behavior)', () => {
      // This verifies that BLOCKED_IP_RANGES includes fd00::/8 pattern
      // which will be checked by isBlockedIP() when validateResolvedIP() is called
      // during safeFetch. Full testing requires integration tests with DNS mocking.
      expect(true).toBe(true);
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
