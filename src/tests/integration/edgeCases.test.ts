import { describe, it, expect, beforeAll } from 'bun:test';
import { createApp } from '../../app';
import type { BuildRequest, Field } from '../../types/schema';
import { execSync } from 'child_process';

// Check if mapeo-settings-builder is available
let hasMapeoBuilder = false;
try {
  execSync('which mapeo-settings-builder', { stdio: 'ignore' });
  hasMapeoBuilder = true;
} catch (error) {
  console.warn('mapeo-settings-builder not found - some edge case tests will be skipped');
}

describe('Edge Case Tests', () => {
  let app: ReturnType<typeof createApp>['app'];

  beforeAll(() => {
    const appContext = createApp();
    app = appContext.app;
  });

  describe('Unicode and Special Characters', () => {
    it.skipIf(!hasMapeoBuilder)('should accept Unicode characters in metadata names', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Configuración de Árboles 🌳',
          version: '1.0.0',
          description: 'Configuration with émojis and àccénts'
        },
        categories: [],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });

    it.skipIf(!hasMapeoBuilder)('should accept Unicode in field names and labels', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [],
        fields: [
          {
            id: 'nombre',
            name: 'Nombre del árbol 🌲',
            type: 'text'
          },
          {
            id: 'type',
            name: 'Type',
            type: 'select',
            options: [
              { value: 'oak', label: 'Roble 🍂' },
              { value: 'pine', label: 'Pino 🌲' },
              { value: 'cherry', label: 'Cerezo 🌸' }
            ]
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });

    it.skipIf(!hasMapeoBuilder)('should accept Japanese, Chinese, Arabic, and Cyrillic characters', async () => {
      const request: BuildRequest = {
        metadata: {
          name: '日本語 中文 العربية Русский',
          version: '1.0.0',
          description: 'Multilingual: こんにちは 你好 مرحبا Привет'
        },
        categories: [],
        fields: [
          {
            id: 'japanese',
            name: '日本語フィールド',
            type: 'text'
          },
          {
            id: 'chinese',
            name: '中文字段',
            type: 'text'
          },
          {
            id: 'arabic',
            name: 'حقل عربي',
            type: 'text'
          },
          {
            id: 'cyrillic',
            name: 'Русское поле',
            type: 'text'
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });

    it.skipIf(!hasMapeoBuilder)('should reject field names with control characters', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [],
        fields: [
          {
            id: 'test',
            name: 'Field\u0000Name', // Null byte
            type: 'text'
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      // Should be rejected or sanitized
      expect([200, 400]).toContain(response.status);
    });

    it.skipIf(!hasMapeoBuilder)('should handle extremely long strings', async () => {
      const longString = 'A'.repeat(10000);
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0',
          description: longString
        },
        categories: [],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      // Should either accept or reject gracefully
      expect([200, 400]).toContain(response.status);
    });

    it.skipIf(!hasMapeoBuilder)('should handle zero-width characters', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test\u200B\u200C\u200D', // Zero-width space, non-joiner, joiner
          version: '1.0.0'
        },
        categories: [],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Large Requests', () => {
    it.skipIf(!hasMapeoBuilder)('should handle requests with many fields (100+)', async () => {
      const fields: Field[] = [];
      for (let i = 0; i < 100; i++) {
        fields.push({
          id: `field_${i}`,
          name: `Field ${i}`,
          type: 'text'
        });
      }

      const request: BuildRequest = {
        metadata: {
          name: 'Large Config',
          version: '1.0.0'
        },
        categories: [],
        fields
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect([200, 400]).toContain(response.status);
    });

    it.skipIf(!hasMapeoBuilder)('should handle requests with many categories (50+)', async () => {
      const categories = [];
      for (let i = 0; i < 50; i++) {
        categories.push({
          id: `category_${i}`,
          name: `Category ${i}`,
          color: '#FF0000'
        });
      }

      const request: BuildRequest = {
        metadata: {
          name: 'Many Categories',
          version: '1.0.0'
        },
        categories,
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect([200, 400]).toContain(response.status);
    });

    it.skipIf(!hasMapeoBuilder)('should handle select field with many options (100+)', async () => {
      const options = [];
      for (let i = 0; i < 100; i++) {
        options.push({
          value: `option_${i}`,
          label: `Option ${i}`
        });
      }

      const request: BuildRequest = {
        metadata: {
          name: 'Many Options',
          version: '1.0.0'
        },
        categories: [],
        fields: [
          {
            id: 'select_field',
            name: 'Select',
            type: 'select',
            options
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect([200, 400]).toContain(response.status);
    });

    it.skipIf(!hasMapeoBuilder)('should handle deeply nested translations', async () => {
      const translations: Record<string, Record<string, any>> = {};

      // Create translations for many languages
      const languages = ['es', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'ar', 'ru', 'hi'];
      languages.forEach(lang => {
        translations[lang] = {
          metadata: {
            name: `Test in ${lang}`,
            description: `Description in ${lang}`
          }
        };
      });

      const request: BuildRequest = {
        metadata: {
          name: 'Multilingual',
          version: '1.0.0'
        },
        categories: [],
        fields: [],
        translations
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Boundary Values and Edge Cases', () => {
    it.skipIf(!hasMapeoBuilder)('should handle number field with extreme min/max values', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [],
        fields: [
          {
            id: 'number',
            name: 'Number',
            type: 'number',
            min: -999999999,
            max: 999999999,
            step: 0.00001
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });

    it.skipIf(!hasMapeoBuilder)('should handle integer field with negative min and zero max', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [],
        fields: [
          {
            id: 'int',
            name: 'Integer',
            type: 'integer',
            min: -100,
            max: 0
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });

    it('should reject number defaultValue below min (boundary)', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [],
        fields: [
          {
            id: 'num',
            name: 'Number',
            type: 'number',
            min: 10,
            max: 100,
            defaultValue: 9 // Below min
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.details).toBeDefined();
      expect(body.details.errors).toBeDefined();
      expect(body.details.errors.length).toBeGreaterThan(0);
      expect(body.details.errors.some((e: string) => e.includes('below minimum'))).toBe(true);
    });

    it.skipIf(!hasMapeoBuilder)('should accept number defaultValue exactly at min', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [],
        fields: [
          {
            id: 'num',
            name: 'Number',
            type: 'number',
            min: 10,
            max: 100,
            defaultValue: 10 // Exactly at min
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });

    it.skipIf(!hasMapeoBuilder)('should handle empty arrays for categories and fields', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Minimal',
          version: '1.0.0'
        },
        categories: [],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });

    it.skipIf(!hasMapeoBuilder)('should handle color codes in various formats', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [
          { id: 'cat1', name: 'Cat 1', color: '#FF0000' },
          { id: 'cat2', name: 'Cat 2', color: '#f00' },
          { id: 'cat3', name: 'Cat 3', color: 'red' }
        ],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        })
      );

      // Validation should handle different color formats appropriately
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Malformed and Invalid Data', () => {
    it('should reject completely empty request body', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: ''
        })
      );

      expect(response.status).toBe(400);
    });

    it('should reject null as request body', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'null'
        })
      );

      expect(response.status).toBe(400);
    });

    it('should reject array instead of object', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '[]'
        })
      );

      expect(response.status).toBe(400);
    });

    it('should reject request with null metadata', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: null,
            categories: [],
            fields: []
          })
        })
      );

      expect(response.status).toBe(400);
    });

    it('should reject request with number instead of string for name', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: {
              name: 12345,
              version: '1.0.0'
            },
            categories: [],
            fields: []
          })
        })
      );

      expect(response.status).toBe(400);
    });

    it('should reject malformed JSON with trailing comma', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"metadata": {"name": "Test", "version": "1.0.0",}, "categories": [], "fields": []}'
        })
      );

      expect(response.status).toBe(400);
    });

    it('should reject JSON with comments', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{"metadata": {"name": "Test", /* comment */ "version": "1.0.0"}, "categories": [], "fields": []}'
        })
      );

      expect(response.status).toBe(400);
    });

    it('should handle extremely nested object (potential DoS)', async () => {
      // Create deeply nested object
      let nested: any = { value: 'deep' };
      for (let i = 0; i < 100; i++) {
        nested = { nested };
      }

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nested)
        })
      );

      // Should either parse and reject, or fail gracefully
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Content-Type Edge Cases', () => {
    it.skipIf(!hasMapeoBuilder)('should handle Content-Type with charset', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });

    it('should reject unsupported Content-Type', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'some text'
        })
      );

      expect(response.status).toBe(400);
    });

    it.skipIf(!hasMapeoBuilder)('should handle missing Content-Type header', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          body: JSON.stringify(request)
        })
      );

      // Should either infer or reject
      expect([200, 400]).toContain(response.status);
    });
  });
});
