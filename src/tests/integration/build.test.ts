import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createApp } from '../../app';
import type { BuildRequest } from '../../types/schema';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import { execSync } from 'child_process';

// Check if mapeo-settings-builder is available
let hasMapeoBuilder = false;
try {
  execSync('which mapeo-settings-builder', { stdio: 'ignore' });
  hasMapeoBuilder = true;
} catch (error) {
  console.warn('mapeo-settings-builder not found - skipping integration tests that require it');
}

describe('POST /build Integration Tests', () => {
  let app: ReturnType<typeof createApp>['app'];

  beforeAll(() => {
    const appContext = createApp();
    app = appContext.app;
  });

  describe('JSON Mode', () => {
    it.skipIf(!hasMapeoBuilder)('should accept valid JSON mode request with inline SVG data', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test Config',
          version: '1.0.0',
          description: 'A test configuration'
        },
        icons: [
          {
            id: 'tree_icon',
            svgData: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'
          }
        ],
        categories: [
          {
            id: 'trees',
            name: 'Trees',
            iconId: 'tree_icon',
            color: '#4CAF50'
          }
        ],
        fields: [
          {
            id: 'species',
            name: 'Species',
            type: 'select',
            options: [
              { value: 'oak', label: 'Oak' },
              { value: 'pine', label: 'Pine' }
            ]
          },
          {
            id: 'dbh',
            name: 'Diameter',
            type: 'number',
            min: 0,
            max: 500,
            step: 0.1
          }
        ]
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      expect(response.headers.get('Content-Disposition')).toContain('.comapeocat');

      // Verify it's binary data
      const blob = await response.blob();
      expect(blob.size).toBeGreaterThan(0);
    });

    it.skipIf(!hasMapeoBuilder)('should accept valid JSON mode request with SVG URLs', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'URL Test',
          version: '1.0.0'
        },
        icons: [
          {
            id: 'tree_icon',
            svgUrl: 'https://raw.githubusercontent.com/digidem/comapeo-config-builder-api/main/test/fixtures/tree.svg'
          }
        ],
        categories: [
          {
            id: 'trees',
            name: 'Trees',
            iconId: 'tree_icon'
          }
        ],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request)
        })
      );

      // Note: This test may fail if the URL is not accessible
      // In a real scenario, we might want to mock the fetch
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('should reject invalid JSON mode request with validation errors', async () => {
      const invalidRequest = {
        metadata: {
          name: '', // Empty name - invalid
          version: '1.0' // Invalid version format
        },
        categories: [],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(invalidRequest)
        })
      );

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const errorBody = await response.json();
      expect(errorBody).toHaveProperty('error');
      expect(errorBody).toHaveProperty('message');
      expect(errorBody.error).toBe('ValidationError');
    });

    it('should reject request with duplicate IDs', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [
          { id: 'cat1', name: 'Category 1' },
          { id: 'cat1', name: 'Category 2' } // Duplicate ID
        ],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(400);
      const errorBody = await response.json();
      expect(errorBody.error).toBe('ValidationError');
      expect(errorBody.message).toContain('duplicate');
    });

    it('should reject request with non-existent references', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Test',
          version: '1.0.0'
        },
        categories: [
          {
            id: 'cat1',
            name: 'Category 1',
            iconId: 'nonexistent' // Non-existent icon
          }
        ],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(400);
      const errorBody = await response.json();
      expect(errorBody.error).toBe('ValidationError');
    });

    it.skipIf(!hasMapeoBuilder)('should handle requests with translations', async () => {
      const request: BuildRequest = {
        metadata: {
          name: 'Multilingual Config',
          version: '1.0.0'
        },
        categories: [
          { id: 'trees', name: 'Trees' }
        ],
        fields: [
          { id: 'name', name: 'Name', type: 'text' }
        ],
        translations: {
          'pt-BR': {
            metadata: {
              name: 'Configuração Multilíngue'
            },
            categories: {
              'trees': { name: 'Árvores' }
            },
            fields: {
              'name': { name: 'Nome' }
            }
          }
        }
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request)
        })
      );

      expect(response.status).toBe(200);
    });
  });

  describe('Legacy ZIP Mode', () => {
    it.skipIf(!hasMapeoBuilder)('should accept valid ZIP file with deprecation warning', async () => {
      // Create a test ZIP file with valid structure
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-zip-'));

      // Create metadata.json
      const metadata = {
        name: 'Test Config',
        version: '1.0.0'
      };
      await fs.writeFile(
        path.join(tmpDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      // Create a simple category
      const categoryDir = path.join(tmpDir, 'categories');
      await fs.mkdir(categoryDir, { recursive: true });
      await fs.writeFile(
        path.join(categoryDir, 'trees.json'),
        JSON.stringify({ name: 'Trees' }, null, 2)
      );

      // Create ZIP
      const zip = new AdmZip();
      zip.addLocalFolder(tmpDir);
      const zipBuffer = zip.toBuffer();

      // Create FormData with the ZIP file
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' });
      formData.append('file', blob, 'config.zip');

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          body: formData
        })
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Deprecation-Warning')).toBeTruthy();
      expect(response.headers.get('X-Deprecation-Warning')).toContain('ZIP mode is deprecated');
      expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(response.headers.get('Content-Disposition')).toContain('.comapeocat');

      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it.skipIf(!hasMapeoBuilder)('should reject invalid ZIP structure', async () => {
      // Create a ZIP without metadata.json
      const zip = new AdmZip();
      zip.addFile('random.txt', Buffer.from('not a valid config', 'utf-8'));
      const zipBuffer = zip.toBuffer();

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(zipBuffer)], { type: 'application/zip' });
      formData.append('file', blob, 'config.zip');

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          body: formData
        })
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.get('X-Deprecation-Warning')).toBeTruthy();
    });
  });

  describe('Mode Detection', () => {
    it.skipIf(!hasMapeoBuilder)('should detect JSON mode from Content-Type header', async () => {
      const request: BuildRequest = {
        metadata: { name: 'Test', version: '1.0.0' },
        categories: [],
        fields: []
      };

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request)
        })
      );

      // Should not have deprecation warning (JSON mode)
      expect(response.headers.get('X-Deprecation-Warning')).toBeNull();
    });

    it.skipIf(!hasMapeoBuilder)('should detect ZIP mode from multipart/form-data', async () => {
      const formData = new FormData();
      const zip = new AdmZip();
      zip.addFile('metadata.json', Buffer.from('{"name":"Test","version":"1.0.0"}', 'utf-8'));
      // Convert Buffer to Uint8Array for proper BlobPart type compatibility
      const blob = new Blob([new Uint8Array(zip.toBuffer())], { type: 'application/zip' });
      formData.append('file', blob, 'config.zip');

      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          body: formData
        })
      );

      // Should have deprecation warning (ZIP mode)
      expect(response.headers.get('X-Deprecation-Warning')).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for malformed JSON', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: 'not valid json{'
        })
      );

      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');

      const errorBody = await response.json();
      expect(errorBody).toHaveProperty('error');
      expect(errorBody).toHaveProperty('message');
    });

    it('should return 400 for missing request body', async () => {
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

      expect(response.status).toBe(400);
    });

    it('should reject JSON body with Content-Length exceeding size limit', async () => {
      // Test Content-Length header enforcement
      const response = await app.handle(
        new Request('http://localhost/build', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '20000000' // 20MB - exceeds 10MB limit
          },
          body: JSON.stringify({ metadata: { name: 'Test', version: '1.0.0' }, categories: [], fields: [] })
        })
      );

      expect(response.status).toBe(413);
      const errorBody = await response.json();
      expect(errorBody.error).toBe('PayloadTooLarge');
    });
  });
});
