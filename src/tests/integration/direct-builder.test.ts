import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { cleanup } from '../utils/testHelpers';
import { runShellCommand } from '../../utils/shell';
import AdmZip from 'adm-zip';

describe('Direct Builder Test', () => {
  let tmpDir: string;
  let extractDir: string;
  let buildDir: string;
  let zipFilePath: string;
  let outputFilePath: string;

  // Download and extract the GitHub ZIP file before running tests
  beforeAll(async () => {
    // Create a temporary directory
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'direct-builder-test-'));
    extractDir = path.join(tmpDir, 'extract');
    buildDir = path.join(tmpDir, 'build');
    zipFilePath = path.join(tmpDir, 'mapeo-default-config.zip');
    outputFilePath = path.join(buildDir, 'output.comapeocat');

    // Create the extract and build directories
    await fs.mkdir(extractDir, { recursive: true });
    await fs.mkdir(buildDir, { recursive: true });

    // Download the ZIP file from GitHub
    console.log('Downloading ZIP file from GitHub...');
    const response = await fetch('https://github.com/digidem/mapeo-default-config/archive/refs/heads/main.zip');
    
    if (!response.ok) {
      throw new Error(`Failed to download ZIP file: ${response.status} ${response.statusText}`);
    }
    
    const zipBuffer = await response.arrayBuffer();
    await fs.writeFile(zipFilePath, new Uint8Array(zipBuffer));
    console.log(`ZIP file downloaded to ${zipFilePath}`);

    // Extract the ZIP file
    console.log('Extracting ZIP file...');
    const zip = new AdmZip(zipFilePath);
    zip.extractAllTo(extractDir, true);
    console.log(`ZIP file extracted to ${extractDir}`);

    // List the contents of the extract directory
    const files = await fs.readdir(extractDir);
    console.log(`Extract directory contains: ${files.join(', ')}`);

    // The ZIP file from GitHub contains a single directory with the repository name and branch
    // We need to find that directory and use it as the source directory
    const sourceDir = path.join(extractDir, files[0]);
    console.log(`Source directory: ${sourceDir}`);

    // Check if the source directory contains a metadata.json file
    try {
      const metadataPath = path.join(sourceDir, 'metadata.json');
      await fs.access(metadataPath);
      console.log('Found metadata.json file');
    } catch (error) {
      console.log('metadata.json file not found');
    }

    // List the contents of the source directory
    const sourceFiles = await fs.readdir(sourceDir);
    console.log(`Source directory contains: ${sourceFiles.join(', ')}`);
  });

  // Clean up temporary files after tests
  afterAll(async () => {
    await cleanup(tmpDir);
  });

  it('should build a comapeocat file directly using mapeo-settings-builder', async () => {
    // Find the source directory
    const extractFiles = await fs.readdir(extractDir);
    const sourceDir = path.join(extractDir, extractFiles[0]);

    // Run the mapeo-settings-builder command directly
    try {
      console.log(`Running mapeo-settings-builder build ${sourceDir} -o ${outputFilePath}`);
      const result = await runShellCommand(`mapeo-settings-builder build ${sourceDir} -o ${outputFilePath}`, 30000);
      console.log('Command output:');
      console.log(result);

      // Check if the output file exists
      const fileStats = await fs.stat(outputFilePath);
      expect(fileStats.isFile()).toBe(true);
      expect(fileStats.size).toBeGreaterThan(0);
      console.log(`Output file size: ${fileStats.size} bytes`);

      // Try to open the file as a ZIP (comapeocat files are ZIP files)
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
      console.error(`Error running mapeo-settings-builder: ${error.message}`);
      throw error;
    }
  }, 30000); // Increase timeout to 30 seconds for this test
});
