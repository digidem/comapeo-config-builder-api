import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createApp } from '../../config/app';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { cleanup } from '../utils/testHelpers';
import AdmZip from 'adm-zip';

describe('GitHub ZIP Simple Integration Test', () => {
  const app = createApp();
  let tmpDir: string;
  let zipFilePath: string;

  // Create a test ZIP file before running tests
  beforeAll(async () => {
    // Create a temporary directory
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-zip-simple-test-'));
    zipFilePath = path.join(tmpDir, 'test-config.zip');

    // Create a simple ZIP file with metadata.json
    const zip = new AdmZip();

    // Add metadata.json
    const metadata = {
      name: 'test-config',
      version: '1.0.0',
      description: 'Test configuration for Comapeo'
    };

    zip.addFile('metadata.json', Buffer.from(JSON.stringify(metadata, null, 2)));

    // Add some additional files to make it look like a real config
    zip.addFile('presets/default.json', Buffer.from(JSON.stringify({
      name: 'Default Preset',
      tags: ['default', 'test']
    }, null, 2)));

    zip.addFile('icons/default.svg', Buffer.from('<svg width="24" height="24"></svg>'));

    // Write the ZIP file
    zip.writeZip(zipFilePath);

    console.log(`Created test ZIP file at ${zipFilePath}`);
  });

  // Clean up temporary files after tests
  afterAll(async () => {
    await cleanup(tmpDir);
  });

  it('should accept a ZIP file and return a response', async () => {
    // Read the ZIP file
    const zipFile = await fs.readFile(zipFilePath);

    // Create a File object from the ZIP file
    const file = new File([zipFile], 'test-config.zip', {
      type: 'application/zip'
    });

    // Create a FormData object with the file
    const formData = new FormData();
    formData.append('file', file);

    // Send the request to the API
    const response = await app.handle(
      new Request('http://localhost/', {
        method: 'POST',
        body: formData
      })
    );

    // For our simple test ZIP, we expect a 500 error because it's not a valid Mapeo config
    expect(response.status).toBe(500);

    // Check that we got a response
    const responseBuffer = await response.arrayBuffer();
    expect(responseBuffer).toBeDefined();
  });

  it('should return 400 for invalid ZIP file', async () => {
    // Create an invalid ZIP file
    const invalidFile = new File(['not a zip file'], 'invalid.zip', {
      type: 'application/zip'
    });

    // Create a FormData object with the invalid file
    const formData = new FormData();
    formData.append('file', invalidFile);

    // Send the request to the API
    const response = await app.handle(
      new Request('http://localhost/', {
        method: 'POST',
        body: formData
      })
    );

    // For an invalid ZIP, we expect a 400 error
    expect(response.status).toBe(400);

    // Check that we got a response
    const responseBuffer = await response.arrayBuffer();
    expect(responseBuffer).toBeDefined();
  });
});
