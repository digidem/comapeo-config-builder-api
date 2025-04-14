import { describe, it, expect, beforeAll, afterAll, mock, spyOn } from 'bun:test';
import { createApp } from '../../config/app';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { cleanup } from '../utils/testHelpers';
import * as shellModule from '../../utils/shell';

describe('GitHub URL Integration Test', () => {
  const app = createApp();
  let tmpDir: string;
  let zipFilePath: string;

  // Mock the runShellCommand function to simulate successful execution
  beforeAll(async () => {
    // Mock the runShellCommand function
    spyOn(shellModule, 'runShellCommand').mockImplementation(async (command) => {
      console.log(`Mocked shell command: ${command}`);
      return 'Mocked command output';
    });

    // Download the GitHub ZIP file
    // Create a temporary directory
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-url-test-'));
    zipFilePath = path.join(tmpDir, 'mapeo-default-config.zip');

    // Download the ZIP file from GitHub
    console.log('Downloading ZIP file from GitHub...');
    const response = await fetch('https://github.com/digidem/mapeo-default-config/archive/refs/heads/main.zip');

    if (!response.ok) {
      throw new Error(`Failed to download ZIP file: ${response.status} ${response.statusText}`);
    }

    const zipBuffer = await response.arrayBuffer();
    await fs.writeFile(zipFilePath, new Uint8Array(zipBuffer));
    console.log(`ZIP file downloaded to ${zipFilePath}`);
  });

  // Clean up temporary files after tests
  afterAll(async () => {
    await cleanup(tmpDir);
  });

  it('should process a GitHub ZIP file and return a response', async () => {
    // Read the ZIP file
    const zipFile = await fs.readFile(zipFilePath);

    // Create a File object from the ZIP file
    const file = new File([zipFile], 'mapeo-default-config.zip', {
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

    // The API is handling the request
    expect(response.status).toBe(200);

    // Check that we got a response
    const responseBuffer = await response.arrayBuffer();
    expect(responseBuffer).toBeDefined();

    console.log(`Received response with size: ${responseBuffer.byteLength} bytes`);
  }, 30000); // Increase timeout to 30 seconds for this test
});
