import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createApp } from '../../config/app';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { cleanup } from '../utils/testHelpers';
import AdmZip from 'adm-zip';
import { getErrorMessage } from '../../utils/errorHelpers';

describe('GitHub ZIP Fix Test', () => {
  let tmpDir: string;
  let zipFilePath: string;
  let fixedZipPath: string;

  // Download and fix the GitHub ZIP file before running tests
  beforeAll(async () => {
    // Create a temporary directory
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'github-zip-fix-test-'));
    zipFilePath = path.join(tmpDir, 'mapeo-default-config.zip');
    fixedZipPath = path.join(tmpDir, 'fixed-config.zip');

    // Download the ZIP file from GitHub
    console.log('Downloading ZIP file from GitHub...');
    const response = await fetch('https://github.com/digidem/mapeo-default-config/archive/refs/heads/main.zip');

    if (!response.ok) {
      throw new Error(`Failed to download ZIP file: ${response.status} ${response.statusText}`);
    }

    const zipBuffer = await response.arrayBuffer();
    await fs.writeFile(zipFilePath, new Uint8Array(zipBuffer));
    console.log(`ZIP file downloaded to ${zipFilePath}`);

    // Extract the ZIP file to a temporary directory
    const extractDir = path.join(tmpDir, 'extract');
    await fs.mkdir(extractDir, { recursive: true });

    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(extractDir, true);

    // Find the root directory in the extracted files
    const files = await fs.readdir(extractDir);
    const rootDir = path.join(extractDir, files[0]);

    // Create a new ZIP file with the contents of the root directory
    const fixedZip = new AdmZip();

    // Add all files from the root directory to the new ZIP
    const rootFiles = await fs.readdir(rootDir);
    for (const file of rootFiles) {
      const filePath = path.join(rootDir, file);
      const stats = await fs.stat(filePath);

      if (stats.isDirectory()) {
        // Add directory recursively
        const addDirectoryRecursive = async (dirPath: string, zipPath: string) => {
          const dirFiles = await fs.readdir(dirPath);

          for (const dirFile of dirFiles) {
            const fullPath = path.join(dirPath, dirFile);
            const relativePath = path.join(zipPath, dirFile);
            const fileStats = await fs.stat(fullPath);

            if (fileStats.isDirectory()) {
              await addDirectoryRecursive(fullPath, relativePath);
            } else {
              const content = await fs.readFile(fullPath);
              fixedZip.addFile(relativePath, content);
            }
          }
        };

        await addDirectoryRecursive(filePath, file);
      } else {
        // Add file directly
        const content = await fs.readFile(filePath);
        fixedZip.addFile(file, content);
      }
    }

    // Write the fixed ZIP file
    fixedZip.writeZip(fixedZipPath);
    console.log(`Fixed ZIP file created at ${fixedZipPath}`);
  });

  // Clean up temporary files after tests
  afterAll(async () => {
    await cleanup(tmpDir);
  });

  it('should process the fixed GitHub ZIP file and return a comapeocat file', async () => {
    // Create an app instance
    const app = createApp();

    // Read the fixed ZIP file
    const zipFile = await fs.readFile(fixedZipPath);

    // Create a File object from the ZIP file
    const file = new File([zipFile], 'fixed-config.zip', {
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
    const outputFilePath = path.join(tmpDir, 'output.comapeocat');
    await fs.writeFile(outputFilePath, new Uint8Array(responseBuffer));
    console.log(`Saved response to ${outputFilePath}`);

    // Try to read the response as text
    try {
      const responseText = new TextDecoder().decode(responseBuffer);

      // Check if the response is JSON (which would indicate an error)
      try {
        const responseJson = JSON.parse(responseText);
        console.log('Response is JSON, which indicates an error:');
        console.log(JSON.stringify(responseJson, null, 2));
        // This is not what we want - we want a binary file
        expect(false).toBe(true); // Force test to fail
      } catch (error) {
        // Not JSON, which is good - it should be a binary file
        console.log('Response is not JSON, which is good');
      }
    } catch (error) {
      console.log(`Error decoding response as text: ${getErrorMessage(error)}`);
    }

    // Try to open the file as a ZIP (comapeocat files are ZIP files)
    try {
      const zip = new AdmZip(outputFilePath);
      const entries = zip.getEntries();

      // Log the entries in the ZIP file
      console.log(`Comapeocat file contains ${entries.length} entries:`);
      for (const entry of entries.slice(0, 10)) { // Show only first 10 entries to avoid too much output
        console.log(`- ${entry.entryName} (${entry.header.size} bytes)`);
      }

      if (entries.length > 10) {
        console.log(`... and ${entries.length - 10} more entries`);
      }

      // Check if the ZIP file has entries
      expect(entries.length).toBeGreaterThan(0);
    } catch (error) {
      console.log(`Error opening comapeocat file: ${getErrorMessage(error)}`);
      // This is not what we want - we want a valid ZIP file
      expect(false).toBe(true); // Force test to fail
    }

    console.log(`Received response with size: ${responseBuffer.byteLength} bytes`);
  }, 30000); // Increase timeout to 30 seconds for this test
});
