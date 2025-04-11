import { describe, it, expect, beforeAll, afterAll, mock, spyOn } from 'bun:test';
import { createApp } from '../../config/app';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { cleanup } from '../utils/testHelpers';
import { getErrorMessage } from '../../utils/errorHelpers';
import * as shellModule from '../../utils/shell';

describe('GitHub ZIP Examine Response Test', () => {
  const app = createApp();
  let tmpDir: string;
  let zipFilePath: string;
  let outputFilePath: string;

  // Mock the runShellCommand function to simulate successful execution
  beforeAll(async () => {
    // Mock the runShellCommand function
    spyOn(shellModule, 'runShellCommand').mockImplementation(async (command) => {
      console.log(`Mocked shell command: ${command}`);
      return 'Mocked command output';
    });

    // Download the GitHub ZIP file
    // Create a temporary directory
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-zip-examine-test-'));
    zipFilePath = path.join(tmpDir, 'mapeo-default-config.zip');
    outputFilePath = path.join(tmpDir, 'output.txt');

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

  it('should examine the API response in detail', async () => {
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

    // Check the response status
    expect(response.status).toBe(200);

    // Get the response as an array buffer
    const responseBuffer = await response.arrayBuffer();
    expect(responseBuffer).toBeDefined();
    expect(responseBuffer.byteLength).toBeGreaterThan(0);

    // Save the response to a file
    await fs.writeFile(outputFilePath, new Uint8Array(responseBuffer));
    console.log(`Saved response to ${outputFilePath}`);

    // Try to read the response as text
    try {
      const responseText = new TextDecoder().decode(responseBuffer);
      console.log('Response as text:');
      console.log(responseText);

      // Check if the response is JSON
      try {
        const responseJson = JSON.parse(responseText);
        console.log('Response is valid JSON:');
        console.log(JSON.stringify(responseJson, null, 2));
      } catch (error) {
        console.log('Response is not valid JSON');
      }
    } catch (error) {
      console.log(`Error decoding response as text: ${getErrorMessage(error)}`);
    }

    // Examine the response headers
    console.log('Response headers:');
    response.headers.forEach((value, key) => {
      console.log(`${key}: ${value}`);
    });

    // Examine the first few bytes of the response
    const bytes = new Uint8Array(responseBuffer);
    console.log('First 20 bytes of the response:');
    console.log(Array.from(bytes.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));

    console.log(`Received response with size: ${responseBuffer.byteLength} bytes`);
  }, 30000); // Increase timeout to 30 seconds for this test
});
