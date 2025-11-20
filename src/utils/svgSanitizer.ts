/**
 * SVG sanitization utilities to prevent XSS attacks
 */

// Dangerous tags that should be removed from SVG
const DANGEROUS_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'foreignObject',
  'use', // Can reference external resources
];

// Dangerous attributes that can execute JavaScript
const DANGEROUS_ATTRIBUTES = [
  'onload',
  'onerror',
  'onclick',
  'onmouseover',
  'onmouseout',
  'onmousemove',
  'onmouseenter',
  'onmouseleave',
  'onfocus',
  'onblur',
  'onchange',
  'oninput',
  'onsubmit',
  'onkeydown',
  'onkeyup',
  'onkeypress',
];

/**
 * Basic SVG sanitization to remove potentially dangerous content
 * This is a simple implementation - for production, consider using a library like DOMPurify
 */
export function sanitizeSvg(svgContent: string): string {
  let sanitized = svgContent;

  // Remove XML declarations and DOCTYPE
  sanitized = sanitized.replace(/<\?xml[^?]*\?>/gi, '');
  sanitized = sanitized.replace(/<!DOCTYPE[^>]*>/gi, '');

  // Remove dangerous tags
  for (const tag of DANGEROUS_TAGS) {
    const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gis');
    sanitized = sanitized.replace(regex, '');
    // Also remove self-closing tags
    const selfClosingRegex = new RegExp(`<${tag}[^>]*/?>`, 'gi');
    sanitized = sanitized.replace(selfClosingRegex, '');
  }

  // Remove dangerous attributes (event handlers)
  for (const attr of DANGEROUS_ATTRIBUTES) {
    // Match attribute with optional leading whitespace
    const regex = new RegExp(`\\s*${attr}\\s*=\\s*["'][^"']*["']`, 'gi');
    sanitized = sanitized.replace(regex, ' ');
  }

  // Remove javascript: and data: URLs in href and xlink:href
  sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '');
  sanitized = sanitized.replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, '');
  sanitized = sanitized.replace(/href\s*=\s*["']data:[^"']*["']/gi, '');
  sanitized = sanitized.replace(/xlink:href\s*=\s*["']data:[^"']*["']/gi, '');

  // Ensure it still looks like valid SVG
  if (!sanitized.trim().toLowerCase().includes('<svg')) {
    throw new Error('Invalid SVG: No <svg> tag found after sanitization');
  }

  return sanitized;
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
