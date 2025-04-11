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
        const zipBuffer = await file.arrayBuffer();
        const zip = new AdmZip(Buffer.from(zipBuffer));
        zip.extractAllTo(tmpDir, true);
      } catch (error) {
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
        
        if (!metadata.name || !metadata.version) {
          throw new ValidationError('Invalid metadata.json: missing name or version');
        }
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError(`Failed to parse metadata.json: ${(error as Error).message}`);
      }
      
      const buildFileName = `${metadata.name}-${metadata.version}.comapeocat`;
      const buildPath = path.join(buildDir, buildFileName);

      console.log(`[${requestId}] Building settings in: ${buildPath}`);
      await fs.mkdir(buildDir, { recursive: true });

      // Start the shell command with proper error handling
      try {
        // Execute the command and wait for it to complete
        await runShellCommand(`mapeo-settings-builder build ${fullConfigPath} -o ${buildPath}`, 120000);
      } catch (error) {
        throw new ProcessingError(`Failed to build settings: ${(error as Error).message}`);
      }

      // Verify the file exists
      try {
        const fileStats = await fs.stat(buildPath);
        if (!fileStats.isFile() || fileStats.size === 0) {
          throw new ProcessingError('Build completed but produced an empty or invalid file');
        }
      } catch (error) {
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
