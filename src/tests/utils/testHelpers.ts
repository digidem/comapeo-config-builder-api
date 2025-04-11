import { Elysia } from 'elysia';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';

/**
 * Create a temporary test file
 * @param content File content
 * @param extension File extension
 * @returns Path to the created file
 */
export async function createTempFile(content: string, extension = '.txt'): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
  const filePath = path.join(tmpDir, `test-file${extension}`);
  await fs.writeFile(filePath, content);
  return filePath;
}

/**
 * Create a test ZIP file with metadata
 * @param metadata Metadata object to include in the ZIP
 * @returns Path to the created ZIP file
 */
export async function createTestZip(metadata: any = { name: 'test', version: '1.0.0' }): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-zip-'));
  const metadataPath = path.join(tmpDir, 'metadata.json');

  // Write metadata file
  await fs.writeFile(metadataPath, String(JSON.stringify(metadata)));

  // Create a simple ZIP file using AdmZip
  const zip = new AdmZip();
  zip.addLocalFile(metadataPath);

  const zipPath = path.join(tmpDir, 'test.zip');
  zip.writeZip(zipPath);

  return zipPath;
}

/**
 * Clean up temporary files and directories
 * @param paths Paths to clean up
 */
export async function cleanup(...paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      // Check if path exists
      try {
        await fs.access(p);
      } catch {
        // Path doesn't exist, nothing to clean up
        continue;
      }

      // Try to remove the path
      try {
        await fs.rm(p, { recursive: true, force: true });
      } catch {
        // If rm fails, try unlink for files
        await fs.unlink(p);
      }
    } catch (error) {
      console.error(`Failed to clean up ${p}:`, error);
    }
  }
}

/**
 * Mock the Bun.file function for testing
 * @param filePath Path to the file
 * @returns Mocked File object
 */
export function mockBunFile(filePath: string): File {
  return new File(['test content'], path.basename(filePath));
}

/**
 * Create a test app instance
 * @param app Elysia app to test
 * @returns Test app instance
 */
export function createTestApp(app: Elysia) {
  return app;
}
