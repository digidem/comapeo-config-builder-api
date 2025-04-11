import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ValidationError, ProcessingError } from '../types/errors';
import { runShellCommand } from '../utils/shell';

export interface SettingsMetadata {
  name: string;
  version: string;
  [key: string]: any;
}

export class SettingsBuilderService {
  /**
   * Process a ZIP file and build Comapeo settings
   * @param file The uploaded ZIP file
   * @param requestId Request ID for logging
   * @returns Path to the built settings file
   */
  async buildSettings(file: File, requestId: string): Promise<{ filePath: string; fileName: string; tmpDir: string }> {
    let tmpDir = '';

    try {
      // Create a temporary directory
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `comapeo-settings-${requestId}-`));
      console.log(`[${requestId}] Temporary directory created: ${tmpDir}`);

      // Extract the ZIP file
      try {
        console.log(`[${requestId}] Extracting ZIP file...`);
        const zipBuffer = await file.arrayBuffer();
        console.log(`[${requestId}] ZIP file size: ${zipBuffer.byteLength} bytes`);
        const zip = new AdmZip(Buffer.from(zipBuffer));

        // List the entries in the ZIP file
        const entries = zip.getEntries();
        console.log(`[${requestId}] ZIP file contains ${entries.length} entries:`);
        for (const entry of entries.slice(0, 10)) { // Show only first 10 entries to avoid too much output
          console.log(`[${requestId}] - ${entry.entryName} (${entry.header.size} bytes)`);
        }

        if (entries.length > 10) {
          console.log(`[${requestId}] ... and ${entries.length - 10} more entries`);
        }

        zip.extractAllTo(tmpDir, true);
        console.log(`[${requestId}] ZIP file extracted to ${tmpDir}`);

        // List the contents of the temporary directory
        const files = await fs.readdir(tmpDir);
        console.log(`[${requestId}] Temporary directory contains: ${files.join(', ')}`);

        // Check if we have a root directory with the repository name
        if (files.length === 1 && (await fs.stat(path.join(tmpDir, files[0]))).isDirectory()) {
          const rootDir = path.join(tmpDir, files[0]);
          console.log(`[${requestId}] Found root directory: ${rootDir}`);

          // List the contents of the root directory
          const rootFiles = await fs.readdir(rootDir);
          console.log(`[${requestId}] Root directory contains: ${rootFiles.join(', ')}`);

          // Check if the root directory contains a metadata.json file
          if (rootFiles.includes('metadata.json')) {
            console.log(`[${requestId}] Found metadata.json in root directory, moving files up...`);

            // Move all files from the root directory to the temporary directory
            for (const file of rootFiles) {
              const sourcePath = path.join(rootDir, file);
              const destPath = path.join(tmpDir, file);

              // Skip if the file already exists in the temporary directory
              try {
                await fs.access(destPath);
                console.log(`[${requestId}] File ${file} already exists in temporary directory, skipping...`);
                continue;
              } catch (error) {
                // File doesn't exist, we can move it
              }

              // Move the file
              await fs.rename(sourcePath, destPath);
            }

            // Remove the now-empty root directory
            await fs.rmdir(rootDir);

            // List the contents of the temporary directory again
            const newFiles = await fs.readdir(tmpDir);
            console.log(`[${requestId}] Temporary directory now contains: ${newFiles.join(', ')}`);
          }
        }
      } catch (error) {
        console.error(`[${requestId}] Error extracting ZIP file:`, error);
        throw new ValidationError(`Failed to extract ZIP file: ${(error as Error).message}`);
      }

      // Validate the extracted content
      try {
        const metadataPath = path.join(tmpDir, 'metadata.json');
        await fs.access(metadataPath);
      } catch (error) {
        throw new ValidationError('Invalid ZIP file: metadata.json not found');
      }

      const fullConfigPath = tmpDir;
      const buildDir = path.join(fullConfigPath, 'build');

      // Read and validate metadata
      let metadata: SettingsMetadata;
      try {
        const metadataContent = await fs.readFile(path.join(fullConfigPath, 'metadata.json'), 'utf-8');
        metadata = JSON.parse(metadataContent);

        // If name or version is missing, use default values
        if (!metadata.name) {
          console.log(`[${requestId}] metadata.json missing name, using default value`);
          metadata.name = 'mapeo-config';
        }

        if (!metadata.version) {
          console.log(`[${requestId}] metadata.json missing version, using default value`);
          metadata.version = '1.0.0';
        }

        // Write the updated metadata back to the file
        await fs.writeFile(
          path.join(fullConfigPath, 'metadata.json'),
          JSON.stringify(metadata, null, 2)
        );
        console.log(`[${requestId}] Updated metadata.json with name: ${metadata.name}, version: ${metadata.version}`);
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError(`Failed to parse metadata.json: ${(error as Error).message}`);
      }

      const buildFileName = `${metadata.name}-${metadata.version}.comapeocat`;
      const buildPath = path.join(buildDir, buildFileName);

      console.log(`[${requestId}] Building settings in: ${buildPath}`);
      await fs.mkdir(buildDir, { recursive: true });
      console.log(`[${requestId}] Created build directory: ${buildDir}`);

      // Start the shell command with proper error handling
      try {
        // Execute the command and wait for it to complete
        await runShellCommand(`mapeo-settings-builder build ${fullConfigPath} -o ${buildPath}`, 120000);
      } catch (error) {
        throw new ProcessingError(`Failed to build settings: ${(error as Error).message}`);
      }

      // Verify the file exists
      try {
        console.log(`[${requestId}] Verifying file exists: ${buildPath}`);

        // List the contents of the build directory
        const buildFiles = await fs.readdir(buildDir);
        console.log(`[${requestId}] Build directory contains: ${buildFiles.join(', ')}`);

        // Check if the file exists
        await fs.access(buildPath);

        // Get the file stats
        const fileStats = await fs.stat(buildPath);
        console.log(`[${requestId}] File stats: size=${fileStats.size} bytes, isFile=${fileStats.isFile()}`);

        if (!fileStats.isFile() || fileStats.size === 0) {
          throw new ProcessingError('Build completed but produced an empty or invalid file');
        }
      } catch (error) {
        console.error(`[${requestId}] Error verifying file:`, error);
        if (error instanceof ProcessingError) throw error;
        throw new ProcessingError(`Build file not found: ${(error as Error).message}`);
      }

      console.log(`[${requestId}] .comapeocat file created: ${buildPath}`);

      return {
        filePath: buildPath,
        fileName: buildFileName,
        tmpDir
      };
    } catch (error) {
      // Clean up temporary directory in case of error
      if (tmpDir) {
        try {
          await fs.rm(tmpDir, { recursive: true, force: true });
          console.log(`[${requestId}] Cleaned up temporary directory after error: ${tmpDir}`);
        } catch (cleanupError) {
          console.error(`[${requestId}] Failed to clean up temporary directory: ${cleanupError}`);
        }
      }
      throw error;
    }
  }

  /**
   * Clean up temporary directory
   * @param tmpDir Directory to clean up
   * @param requestId Request ID for logging
   */
  async cleanup(tmpDir: string, requestId: string): Promise<void> {
    if (tmpDir) {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
        console.log(`[${requestId}] Cleaned up temporary directory: ${tmpDir}`);
      } catch (cleanupError) {
        console.error(`[${requestId}] Failed to clean up temporary directory: ${cleanupError}`);
      }
    }
  }
}
