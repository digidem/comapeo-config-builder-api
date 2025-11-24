import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runShellCommand } from '../utils/shell';
import { config } from '../config/app';

/**
 * Sanitize a string for use in filenames
 * Prevents path traversal attacks by stripping directory components and dangerous characters
 */
function sanitizeFilenameComponent(input: string): string {
  // Use path.basename to strip any directory components (handles ../, /, etc.)
  let sanitized = path.basename(input);

  // Remove any remaining potentially dangerous characters
  // Allow alphanumeric, hyphens, underscores, dots (but not leading dots)
  sanitized = sanitized.replace(/[^a-zA-Z0-9\-_\.]/g, '_');

  // Remove leading dots to prevent hidden files
  sanitized = sanitized.replace(/^\.+/, '');

  // Ensure non-empty
  if (!sanitized) {
    sanitized = 'unnamed';
  }

  return sanitized;
}

export interface BuildSettingsOptions {
  signal?: AbortSignal;
}

/**
 * Process a ZIP file containing Mapeo configuration and build a .comapeocat file
 * @param fileBuffer The ZIP file buffer
 * @param options Optional settings including abort signal
 * @returns The path to the built .comapeocat file
 */
export async function buildSettings(fileBuffer: ArrayBuffer, options?: BuildSettingsOptions): Promise<string> {
  // Create a temporary directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), config.tempDirPrefix));
  console.log('Temporary directory created:', tmpDir);

  // Extract the ZIP file
  const zip = new AdmZip(Buffer.from(fileBuffer));
  zip.extractAllTo(tmpDir, true);

  const fullConfigPath = tmpDir;
  const buildDir = path.join(fullConfigPath, 'build');
  const metadata = JSON.parse(await fs.readFile(path.join(fullConfigPath, 'metadata.json'), 'utf-8'));
  // Sanitize name and version to prevent path traversal attacks
  const safeName = sanitizeFilenameComponent(metadata.name || 'unnamed');
  const safeVersion = sanitizeFilenameComponent(metadata.version || '0.0.0');
  const buildFileName = `${safeName}-${safeVersion}.comapeocat`;
  const buildPath = path.join(buildDir, buildFileName);

  console.log('Building settings in:', buildPath);
  await fs.mkdir(buildDir, { recursive: true });

  // Run the shell command with abort signal support
  try {
    await runShellCommand(`mapeo-settings-builder build ${fullConfigPath} -o ${buildPath}`, { signal: options?.signal });
  } catch (error) {
    // Re-throw abort errors
    if (error instanceof Error && error.message === 'Command aborted') {
      throw error;
    }
    console.error('mapeo-settings-builder failed:', error);
    throw new Error(`Build CLI failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log('Waiting for .comapeocat file...');
  let builtSettingsPath = '';
  const { maxAttempts, delayBetweenAttempts } = config;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check for abort during polling
    if (options?.signal?.aborted) {
      throw new Error('Command aborted');
    }

    try {
      const fileStats = await fs.stat(buildPath);
      if (fileStats.isFile() && fileStats.size > 0) {
        builtSettingsPath = buildPath;
        break;
      }
    } catch (error) {
      // File doesn't exist yet, continue waiting
    }
    await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
  }

  if (!builtSettingsPath) {
    throw new Error('No .comapeocat file found in the build directory after waiting');
  }

  console.log('.comapeocat file found:', builtSettingsPath);

  // Clean up the temporary directory (uncomment when ready)
  // await fs.rm(tmpDir, { recursive: true, force: true });

  return builtSettingsPath;
}
