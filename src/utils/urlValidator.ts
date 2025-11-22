/**
 * URL validation and security utilities
 */

import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

// Security: Block private/internal network ranges and metadata endpoints
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS metadata endpoint
  'metadata.google.internal', // GCP metadata endpoint
  '100.100.100.200', // Azure metadata endpoint
];

const BLOCKED_IP_RANGES = [
  /^10\./,          // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./,    // 192.168.0.0/16
  /^169\.254\./,    // 169.254.0.0/16 (link-local)
  /^127\./,         // 127.0.0.0/8 (loopback)
  /^::1$/,          // IPv6 loopback
  /^fe80:/,         // IPv6 link-local
  /^fc00:/,         // IPv6 unique local
];

const ALLOWED_PROTOCOLS = ['https:', 'http:'];

const MAX_URL_LENGTH = 2048;

/**
 * Check if a hostname is an IPv4-mapped IPv6 address (::ffff:x.x.x.x)
 * and extract the IPv4 portion if present
 *
 * Note: The URL class normalizes ::ffff:127.0.0.1 to [::ffff:7f00:1]
 * where the IPv4 address is converted to hex. We need to handle both formats.
 */
function extractIPv4FromMappedIPv6(hostname: string): string | null {
  // Remove brackets if present (URL.hostname includes them for IPv6)
  const addr = hostname.replace(/^\[|\]$/g, '');

  // Match ::ffff:XXXX:XXXX pattern (hex format after URL normalization)
  // Example: ::ffff:7f00:1 (127.0.0.1) or ::ffff:a9fe:a9fe (169.254.169.254)
  const hexMatch = addr.match(/^::ffff:([0-9a-f]+):([0-9a-f]+)$/i);
  if (hexMatch) {
    // Convert hex to IPv4
    // First group is first two octets, second group is last two octets
    const firstPart = parseInt(hexMatch[1], 16);
    const secondPart = parseInt(hexMatch[2], 16);

    // Split into 4 octets
    const octet1 = (firstPart >> 8) & 0xff;
    const octet2 = firstPart & 0xff;
    const octet3 = (secondPart >> 8) & 0xff;
    const octet4 = secondPart & 0xff;

    return `${octet1}.${octet2}.${octet3}.${octet4}`;
  }

  // Also check for dotted decimal format (not normalized by URL class)
  // This handles cases where the input bypassed normalization
  const dottedMatch = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (dottedMatch) {
    return dottedMatch[1];
  }

  return null;
}

/**
 * Validates that a URL is safe to fetch (prevents SSRF attacks)
 */
export function validateIconUrl(url: string): UrlValidationResult {
  // Check URL length
  if (url.length > MAX_URL_LENGTH) {
    return { valid: false, error: 'URL too long' };
  }

  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return {
      valid: false,
      error: `Protocol ${parsed.protocol} not allowed. Only HTTP and HTTPS are supported.`
    };
  }

  // Check for blocked hostnames
  const hostname = parsed.hostname.toLowerCase();
  for (const blocked of BLOCKED_HOSTS) {
    if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
      return {
        valid: false,
        error: 'Access to internal/private hosts is not allowed'
      };
    }
  }

  // Additional checks for suspicious patterns
  if (hostname === '') {
    return { valid: false, error: 'Invalid hostname' };
  }

  // Check for blocked IP ranges (IPv4)
  for (const pattern of BLOCKED_IP_RANGES) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: 'Access to private IP ranges is not allowed'
      };
    }
  }

  // Check for blocked IPv6 addresses (URL.hostname includes brackets for IPv6)
  // IPv6 loopback: ::1
  if (hostname === '[::1]') {
    return {
      valid: false,
      error: 'Access to internal/private hosts is not allowed'
    };
  }

  // IPv6 link-local addresses: fe80::/10
  if (hostname.startsWith('[fe80:')) {
    return {
      valid: false,
      error: 'Access to private IP ranges is not allowed'
    };
  }

  // IPv6 unique local addresses: fc00::/7 (fc00:: and fd00::)
  if (hostname.startsWith('[fc00:') || hostname.startsWith('[fd00:')) {
    return {
      valid: false,
      error: 'Access to private IP ranges is not allowed'
    };
  }

  // Check for IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  // These can bypass the IPv4 blocklist if not normalized
  const ipv4FromMapped = extractIPv4FromMappedIPv6(hostname);
  if (ipv4FromMapped) {
    // Check if the embedded IPv4 is blocked
    if (isBlockedIP(ipv4FromMapped)) {
      return {
        valid: false,
        error: 'Access to private IP ranges is not allowed'
      };
    }
  }

  // Check for @ in username:password patterns (though URL class should normalize this)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Invalid hostname' };
  }

  return { valid: true };
}

const MAX_REDIRECTS = 5;

/**
 * Check if an IP address is in a blocked range
 */
function isBlockedIP(ip: string): boolean {
  // Check exact matches
  if (BLOCKED_HOSTS.includes(ip)) {
    return true;
  }

  // Check for IPv4-mapped IPv6 and extract IPv4 portion
  const ipv4FromMapped = extractIPv4FromMappedIPv6(ip);
  if (ipv4FromMapped) {
    // Recursively check the extracted IPv4
    return isBlockedIP(ipv4FromMapped);
  }

  // Check IP ranges
  for (const pattern of BLOCKED_IP_RANGES) {
    if (pattern.test(ip)) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve hostname and verify the resolved IP is not blocked
 * Prevents DNS rebinding attacks where hostnames resolve to internal IPs
 */
async function validateResolvedIP(hostname: string): Promise<void> {
  try {
    const result = await dnsLookup(hostname, { all: true });
    const addresses = Array.isArray(result) ? result : [result];

    for (const addr of addresses) {
      const ip = typeof addr === 'string' ? addr : addr.address;
      if (isBlockedIP(ip)) {
        throw new Error(`Hostname ${hostname} resolves to blocked IP ${ip}`);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('resolves to blocked IP')) {
      throw error;
    }
    // DNS lookup failures are acceptable - fetch will fail anyway
  }
}

/**
 * Fetch URL with security restrictions
 * Uses manual redirect handling to validate each hop against SSRF blocklist
 */
export async function safeFetch(
  url: string,
  options: {
    maxSize?: number;
    timeout?: number;
    signal?: AbortSignal;
  } = {}
): Promise<string> {
  const maxSize = options.maxSize || 1024 * 1024; // 1MB default
  const timeout = options.timeout || 10000; // 10s default

  // Check if already aborted
  if (options.signal?.aborted) {
    throw new Error('Request aborted');
  }

  // Validate initial URL
  const validation = validateIconUrl(url);
  if (!validation.valid) {
    throw new Error(`URL validation failed: ${validation.error}`);
  }

  // Create abort controller for timeout, also link to external signal
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // Link external signal to our controller
  const externalAbortHandler = () => controller.abort();
  if (options.signal) {
    options.signal.addEventListener('abort', externalAbortHandler, { once: true });
  }

  try {
    let currentUrl = url;
    let redirectCount = 0;

    while (true) {
      // Check for abort at start of each iteration
      if (options.signal?.aborted || controller.signal.aborted) {
        throw new Error('Request aborted');
      }

      // Validate resolved IP before fetching (prevents DNS rebinding)
      const parsedUrl = new URL(currentUrl);
      await validateResolvedIP(parsedUrl.hostname);

      const response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'CoMapeo-Config-Builder/2.0.0',
          'Accept': 'image/svg+xml,image/*'
        },
        redirect: 'manual', // Handle redirects manually to validate each hop
      });

      // Handle redirects manually
      if (response.status >= 300 && response.status < 400) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
        }

        const location = response.headers.get('location');
        if (!location) {
          throw new Error('Redirect response missing Location header');
        }

        // Resolve relative URLs against current URL
        const redirectUrl = new URL(location, currentUrl).href;

        // Validate redirect target against SSRF blocklist
        const redirectValidation = validateIconUrl(redirectUrl);
        if (!redirectValidation.valid) {
          throw new Error(`Redirect blocked: ${redirectValidation.error}`);
        }

        currentUrl = redirectUrl;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content-type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('svg') && !contentType.includes('xml')) {
        throw new Error('Content-Type must be SVG or XML');
      }

      // Check content-length if available (early rejection)
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (size > maxSize) {
          throw new Error(`File size ${size} bytes exceeds maximum ${maxSize} bytes`);
        }
      }

      // Stream response body with size limit enforcement
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const chunks: Uint8Array[] = [];
      let totalSize = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalSize += value.length;
          if (totalSize > maxSize) {
            reader.cancel();
            throw new Error(`Content size exceeds maximum ${maxSize} bytes`);
          }

          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Combine chunks and decode as text
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      return new TextDecoder().decode(combined);
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError' || error.message === 'Request aborted') {
        // Check if it was external abort vs timeout
        if (options.signal?.aborted) {
          throw new Error('Request aborted');
        }
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
    throw new Error('Unknown error fetching URL');
  } finally {
    clearTimeout(timeoutId);
    // Clean up external signal listener
    if (options.signal) {
      options.signal.removeEventListener('abort', externalAbortHandler);
    }
  }
}
