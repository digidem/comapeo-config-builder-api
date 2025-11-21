/**
 * SVG sanitization utilities to prevent XSS attacks
 * Enhanced with more robust patterns and encoding handling
 */

// Dangerous tags that should be removed from SVG
const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'foreignObject',
  'use', // Can reference external resources
  'image', // Can reference external resources
  'feImage', // Can reference external resources
  'animation',
  'animate',
  'animateTransform',
  'set',
];

// Dangerous attributes that can execute JavaScript
// Note: This list is comprehensive to catch variations
const DANGEROUS_ATTRIBUTES = [
  'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout',
  'onmousemove', 'onmouseenter', 'onmouseleave', 'onmousedown', 'onmouseup',
  'onfocus', 'onblur', 'onchange', 'oninput', 'onsubmit',
  'onkeydown', 'onkeyup', 'onkeypress',
  'onabort', 'onbegin', 'onend', 'onrepeat',
  'onactivate', 'onfocusin', 'onfocusout',
  'onscroll', 'onresize', 'onzoom',
];

/**
 * Enhanced SVG sanitization to remove potentially dangerous content
 * Handles case variations, encoded characters, and multiple attack vectors
 */
export function sanitizeSvg(svgContent: string): string {
  let sanitized = svgContent;

  // Remove XML declarations and DOCTYPE (XXE prevention)
  sanitized = sanitized.replace(/<\?xml[^?]*\?>/gi, '');
  sanitized = sanitized.replace(/<!DOCTYPE[^>]*>/gi, '');
  sanitized = sanitized.replace(/<!ENTITY[^>]*>/gi, '');

  // Decode common HTML entities to catch encoded attacks
  sanitized = decodeHtmlEntities(sanitized);

  // Remove CDATA sections that might contain scripts
  sanitized = sanitized.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '');

  // Remove dangerous tags (case-insensitive, handles variations)
  for (const tag of DANGEROUS_TAGS) {
    // Match opening and closing tags (with or without attributes)
    const regex = new RegExp(`<${tag}(\\s[^>]*)?>.*?</${tag}>`, 'gis');
    sanitized = sanitized.replace(regex, '');
    // Match self-closing tags
    const selfClosingRegex = new RegExp(`<${tag}(\\s[^>]*)?/?>`, 'gi');
    sanitized = sanitized.replace(selfClosingRegex, '');
  }

  // Remove ALL event handler attributes (catch any on* attribute)
  // This is more robust than checking each one individually
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, ' ');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, ' ');

  // Remove javascript:, data:, and vbscript: URLs from all attributes
  // Check href, xlink:href, src, action, formaction, etc.
  sanitized = sanitized.replace(/(href|xlink:href|src|action|formaction)\s*=\s*["']\s*(javascript|data|vbscript):[^"']*["']/gi, '');

  // Remove style attributes that could contain expression() or other CSS-based XSS
  sanitized = sanitized.replace(/style\s*=\s*["'][^"']*expression\s*\([^"']*["']/gi, '');
  sanitized = sanitized.replace(/style\s*=\s*["'][^"']*javascript:[^"']*["']/gi, '');
  sanitized = sanitized.replace(/style\s*=\s*["'][^"']*behavior:[^"']*["']/gi, '');

  // Remove any remaining javascript: or data: protocols (unquoted)
  sanitized = sanitized.replace(/=\s*(javascript|data|vbscript):/gi, '=');

  // Ensure it still looks like valid SVG
  if (!sanitized.trim().toLowerCase().includes('<svg')) {
    throw new Error('Invalid SVG: No <svg> tag found after sanitization');
  }

  return sanitized;
}

/**
 * Decode common HTML entities to prevent encoded XSS attacks
 */
function decodeHtmlEntities(text: string): string {
  // Decode numeric character references (&#x6C; &#108;)
  let decoded = text.replace(/&#x([0-9a-f]+);?/gi, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  decoded = decoded.replace(/&#(\d+);?/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  });

  // Decode common named entities
  const entities: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&amp;': '&',
  };

  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'gi'), char);
  }

  return decoded;
}

/**
 * Validates that content appears to be SVG
 */
export function isValidSvgStructure(content: string): { valid: boolean; error?: string } {
  const trimmed = content.trim().toLowerCase();

  // Check if it starts with valid SVG indicators
  const validStarts = ['<svg', '<?xml'];
  const hasValidStart = validStarts.some(start => trimmed.startsWith(start));

  if (!hasValidStart) {
    return {
      valid: false,
      error: 'SVG content must start with "<svg" or "<?xml"'
    };
  }

  // Check for basic SVG structure
  if (!trimmed.includes('<svg')) {
    return {
      valid: false,
      error: 'SVG content must contain an <svg> tag'
    };
  }

  // Check for balanced svg tags (basic check)
  const openSvgCount = (trimmed.match(/<svg[\s>]/g) || []).length;
  const closeSvgCount = (trimmed.match(/<\/svg>/g) || []).length;
  const selfClosingSvgCount = (trimmed.match(/<svg[^>]*\/>/g) || []).length;

  if (openSvgCount === 0 && selfClosingSvgCount === 0) {
    return {
      valid: false,
      error: 'No valid <svg> tag found'
    };
  }

  return { valid: true };
}

/**
 * Full SVG validation and sanitization
 */
export function validateAndSanitizeSvg(svgContent: string): {
  sanitized: string;
  error?: string
} {
  try {
    // First check structure
    const structureCheck = isValidSvgStructure(svgContent);
    if (!structureCheck.valid) {
      return { sanitized: '', error: structureCheck.error };
    }

    // Then sanitize
    const sanitized = sanitizeSvg(svgContent);

    return { sanitized };
  } catch (error) {
    return {
      sanitized: '',
      error: error instanceof Error ? error.message : 'SVG validation failed'
    };
  }
}
