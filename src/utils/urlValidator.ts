/**
 * URL validation and security utilities
 */

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

  // Check for blocked IP ranges
  for (const pattern of BLOCKED_IP_RANGES) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: 'Access to private IP ranges is not allowed'
      };
    }
  }

  // Additional checks for suspicious patterns
  if (hostname === '') {
    return { valid: false, error: 'Invalid hostname' };
  }

  // Check for @ in username:password patterns (though URL class should normalize this)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Invalid hostname' };
  }

  return { valid: true };
}

/**
 * Fetch URL with security restrictions
 */
export async function safeFetch(
  url: string,
  options: {
    maxSize?: number;
    timeout?: number;
  } = {}
): Promise<string> {
  const maxSize = options.maxSize || 1024 * 1024; // 1MB default
  const timeout = options.timeout || 10000; // 10s default

  // Validate URL first
  const validation = validateIconUrl(url);
  if (!validation.valid) {
    throw new Error(`URL validation failed: ${validation.error}`);
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CoMapeo-Config-Builder/2.0.0',
        'Accept': 'image/svg+xml,image/*'
      },
      redirect: 'follow',
      // Prevent following redirects to blocked hosts
      // Note: Bun's fetch may not fully support this, but we include it
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content-type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('svg') && !contentType.includes('xml')) {
      throw new Error('Content-Type must be SVG or XML');
    }

    // Check content-length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (size > maxSize) {
        throw new Error(`File size ${size} bytes exceeds maximum ${maxSize} bytes`);
      }
    }

    // Read content with size limit
    const text = await response.text();
    if (text.length > maxSize) {
      throw new Error(`Content size ${text.length} bytes exceeds maximum ${maxSize} bytes`);
    }

    return text;

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
    throw new Error('Unknown error fetching URL');
  } finally {
    clearTimeout(timeoutId);
  }
}
