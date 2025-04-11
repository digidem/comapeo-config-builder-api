import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createApp } from '../../config/app';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { cleanup } from '../utils/testHelpers';
import { getErrorMessage } from '../../utils/errorHelpers';

describe('Debug Request Test', () => {
  let tmpDir: string;
  let zipFilePath: string;

  // Download the GitHub ZIP file before running tests
  beforeAll(async () => {
    // Create a temporary directory
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'debug-request-test-'));
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

  it('should debug the request and response', async () => {
    // Create an app instance
    const app = createApp();

    // Read the ZIP file
    const zipFile = await fs.readFile(zipFilePath);
    console.log(`ZIP file size: ${zipFile.length} bytes`);

    // Create a File object from the ZIP file
    const file = new File([zipFile], 'mapeo-default-config.zip', {
      type: 'application/zip'
    });

    // Log the file details
    console.log(`File name: ${file.name}`);
    console.log(`File type: ${file.type}`);
    console.log(`File size: ${file.size} bytes`);

    // Create a FormData object with the file
    const formData = new FormData();
    formData.append('file', file);

    // Log the FormData details
    console.log('FormData created with file');

    // Create a Request object
    const request = new Request('http://localhost/', {
      method: 'POST',
      body: formData
    });

    // Log the request details
    console.log(`Request method: ${request.method}`);
    console.log(`Request URL: ${request.url}`);
    console.log('Request headers:');
    // Iterate through headers
    request.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });

    // Send the request to the API
    console.log('Sending request to API...');
    const response = await app.handle(request);

    // Log the response details
    console.log(`Response status: ${response.status}`);
    console.log(`Response status text: ${response.statusText}`);
    console.log('Response headers:');
    // Iterate through headers
    response.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });

    // Get the response as an array buffer
    const responseBuffer = await response.arrayBuffer();
    console.log(`Response size: ${responseBuffer.byteLength} bytes`);

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

    // Save the response to a file
    const outputFilePath = path.join(tmpDir, 'output.txt');
    await fs.writeFile(outputFilePath, new Uint8Array(responseBuffer));
    console.log(`Saved response to ${outputFilePath}`);

    // For this test, we just want to see the debug output
    expect(true).toBe(true);
  }, 30000); // Increase timeout to 30 seconds for this test
});
