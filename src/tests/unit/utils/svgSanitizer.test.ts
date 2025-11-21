import { describe, it, expect } from 'bun:test';
import { sanitizeSvg, isValidSvgStructure, validateAndSanitizeSvg } from '../../../utils/svgSanitizer';

describe('SVG Sanitizer', () => {
  describe('isValidSvgStructure', () => {
    it('should accept valid SVG starting with <svg', () => {
      const result = isValidSvgStructure('<svg><circle cx="10" cy="10" r="5"/></svg>');
      expect(result.valid).toBe(true);
    });

    it('should accept valid SVG starting with <?xml', () => {
      const result = isValidSvgStructure('<?xml version="1.0"?><svg><circle cx="10" cy="10" r="5"/></svg>');
      expect(result.valid).toBe(true);
    });

    it('should accept SVG with case variations', () => {
      const result = isValidSvgStructure('<SVG><circle cx="10" cy="10" r="5"/></SVG>');
      expect(result.valid).toBe(true);
    });

    it('should reject content without <svg tag', () => {
      const result = isValidSvgStructure('<div>Not an SVG</div>');
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject content starting with invalid tags', () => {
      const result = isValidSvgStructure('<html><svg></svg></html>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must start with');
    });
  });

  describe('sanitizeSvg', () => {
    it('should remove script tags', () => {
      const malicious = '<svg><script>alert("XSS")</script><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
      expect(sanitized).toContain('<svg>');
      expect(sanitized).toContain('<circle');
    });

    it('should remove iframe tags', () => {
      const malicious = '<svg><iframe src="evil.com"></iframe></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<iframe');
      expect(sanitized).toContain('<svg>');
    });

    it('should remove object tags', () => {
      const malicious = '<svg><object data="evil.com"></object></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<object');
    });

    it('should remove embed tags', () => {
      const malicious = '<svg><embed src="evil.com"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<embed');
    });

    it('should remove foreignObject tags', () => {
      const malicious = '<svg><foreignObject><div>evil</div></foreignObject></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<foreignObject');
    });

    it('should remove onload event handlers', () => {
      const malicious = '<svg onload="alert(\'XSS\')"><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('onload');
      expect(sanitized).toContain('<svg');
      expect(sanitized).toContain('<circle');
    });

    it('should remove onclick event handlers', () => {
      const malicious = '<svg><circle onclick="alert(\'XSS\')" cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('onclick');
    });

    it('should remove onmouseover event handlers', () => {
      const malicious = '<svg><rect onmouseover="alert(\'XSS\')" x="0" y="0"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('onmouseover');
    });

    it('should remove javascript: URLs in href', () => {
      const malicious = '<svg><a href="javascript:alert(\'XSS\')"><text>click</text></a></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove javascript: URLs in xlink:href', () => {
      const malicious = '<svg><use xlink:href="javascript:alert(\'XSS\')"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove data: URLs in href', () => {
      const malicious = '<svg><a href="data:text/html,<script>alert(\'XSS\')</script>"><text>click</text></a></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('data:');
    });

    it('should remove XML declarations', () => {
      const withXml = '<?xml version="1.0" encoding="UTF-8"?><svg><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(withXml);
      expect(sanitized).not.toContain('<?xml');
      expect(sanitized).toContain('<svg>');
    });

    it('should remove DOCTYPE declarations', () => {
      const withDoctype = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg></svg>';
      const sanitized = sanitizeSvg(withDoctype);
      expect(sanitized).not.toContain('<!DOCTYPE');
    });

    it('should preserve valid SVG elements', () => {
      const valid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/><rect x="10" y="10" width="30" height="30" fill="blue"/></svg>';
      const sanitized = sanitizeSvg(valid);
      expect(sanitized).toContain('<circle');
      expect(sanitized).toContain('<rect');
      expect(sanitized).toContain('viewBox');
      expect(sanitized).toContain('xmlns');
    });

    it('should throw error if no SVG tag remains after sanitization', () => {
      const noSvg = '<script>alert("XSS")</script>';
      expect(() => sanitizeSvg(noSvg)).toThrow('Invalid SVG');
    });
  });

  describe('validateAndSanitizeSvg', () => {
    it('should validate and sanitize valid SVG', () => {
      const valid = '<svg><circle cx="10" cy="10" r="5"/></svg>';
      const result = validateAndSanitizeSvg(valid);
      expect(result.error).toBeUndefined();
      expect(result.sanitized).toContain('<svg>');
    });

    it('should return error for invalid SVG structure', () => {
      const invalid = '<div>Not SVG</div>';
      const result = validateAndSanitizeSvg(invalid);
      expect(result.error).toBeDefined();
      expect(result.sanitized).toBe('');
    });

    it('should sanitize and return clean SVG', () => {
      const malicious = '<svg onload="alert(\'XSS\')"><script>evil()</script><circle cx="10" cy="10" r="5"/></svg>';
      const result = validateAndSanitizeSvg(malicious);
      expect(result.error).toBeUndefined();
      expect(result.sanitized).not.toContain('onload');
      expect(result.sanitized).not.toContain('<script>');
      expect(result.sanitized).toContain('<circle');
    });

    it('should handle XML declarations gracefully', () => {
      const withXml = '<?xml version="1.0"?><svg><circle cx="10" cy="10" r="5"/></svg>';
      const result = validateAndSanitizeSvg(withXml);
      expect(result.error).toBeUndefined();
      expect(result.sanitized).toContain('<svg>');
    });
  });

  describe('Enhanced Security - Encoded Attacks', () => {
    it('should remove encoded event handlers (hex encoding)', () => {
      // &#x6F;nload = onload
      const malicious = '<svg &#x6F;nload="alert(\'XSS\')"><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('alert');
      expect(sanitized).not.toContain('onload');
    });

    it('should remove encoded event handlers (decimal encoding)', () => {
      // &#111;nload = onload
      const malicious = '<svg &#111;nload="alert(\'XSS\')"><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('alert');
      expect(sanitized).not.toContain('onload');
    });

    it('should handle case variations in event handlers', () => {
      const malicious = '<svg OnLoAd="alert(\'XSS\')"><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized.toLowerCase()).not.toContain('onload');
    });

    it('should remove entity-encoded attributes', () => {
      const malicious = '<svg &lt;script&gt;alert("XSS")&lt;/script&gt;><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('script');
    });
  });

  describe('Enhanced Security - Additional Attack Vectors', () => {
    it('should remove CDATA sections', () => {
      const malicious = '<svg><![CDATA[<script>alert("XSS")</script>]]><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('CDATA');
      expect(sanitized).not.toContain('<script>');
    });

    it('should remove ENTITY declarations', () => {
      const malicious = '<!ENTITY xxe SYSTEM "file:///etc/passwd"><svg><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('ENTITY');
      expect(sanitized).not.toContain('xxe');
    });

    it('should remove vbscript: URLs', () => {
      const malicious = '<svg><a href="vbscript:msgbox(\'XSS\')"><text>click</text></a></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('vbscript:');
    });

    it('should remove style with expression()', () => {
      const malicious = '<svg><rect style="width:expression(alert(\'XSS\'))" x="0" y="0"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('expression(');
    });

    it('should remove style with javascript:', () => {
      const malicious = '<svg><rect style="background:url(javascript:alert(\'XSS\'))" x="0" y="0"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('javascript:');
    });

    it('should remove style with behavior:', () => {
      const malicious = '<svg><rect style="behavior:url(evil.htc)" x="0" y="0"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('behavior:');
    });
  });

  describe('Enhanced Security - Additional Dangerous Tags', () => {
    it('should remove animate tags', () => {
      const malicious = '<svg><animate onbegin="alert(\'XSS\')"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<animate');
    });

    it('should remove animateTransform tags', () => {
      const malicious = '<svg><animateTransform onbegin="alert(\'XSS\')"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<animateTransform');
    });

    it('should remove image tags with external references', () => {
      const malicious = '<svg><image href="http://evil.com/xss.svg"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<image');
    });

    it('should remove feImage tags with external references', () => {
      const malicious = '<svg><filter><feImage href="http://evil.com/xss.svg"/></filter></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<feImage');
    });

    it('should remove set tags', () => {
      const malicious = '<svg><set attributeName="onload" to="alert(\'XSS\')"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('<set');
    });
  });

  describe('Enhanced Security - Comprehensive Event Handler Removal', () => {
    it('should remove any on* attribute regardless of specific name', () => {
      const malicious = '<svg onunknownevent="alert(\'XSS\')"><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('onunknownevent');
      expect(sanitized).not.toContain('alert');
    });

    it('should remove multiple event handlers', () => {
      const malicious = '<svg onload="a()" onerror="b()" onclick="c()"><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('onload');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('onclick');
    });

    it('should remove event handlers without quotes', () => {
      const malicious = '<svg onload=alert(1)><circle cx="10" cy="10" r="5"/></svg>';
      const sanitized = sanitizeSvg(malicious);
      expect(sanitized).not.toContain('onload');
    });
  });
});
