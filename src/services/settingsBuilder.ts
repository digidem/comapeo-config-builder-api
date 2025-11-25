import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runShellCommand } from '../utils/shell';
import { config } from '../config/app';
import { ValidationError, ProcessingError } from '../types/errors';

/**
 * Process a ZIP file containing Mapeo configuration and build a .comapeocat file
 * (Legacy v1 path using mapeo-settings-builder CLI)
 * @param fileBuffer The ZIP file buffer
 * @returns The path to the built .comapeocat file
 */
export async function buildSettingsV1(fileBuffer: ArrayBuffer): Promise<string> {
  // Create a temporary directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), config.tempDirPrefix));
  console.log('Temporary directory created:', tmpDir);

  // Extract the ZIP file
  const zip = new AdmZip(Buffer.from(fileBuffer));
  zip.extractAllTo(tmpDir, true);

  const metadataPath = await findFile(tmpDir, 'metadata.json');
  if (!metadataPath) {
    throw new ValidationError('metadata.json not found in uploaded ZIP');
  }

  const fullConfigPath = path.dirname(metadataPath);
  const buildDir = path.join(fullConfigPath, 'build');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
  const metaName = metadata.name || 'config';
  const metaVersion = metadata.version || 'v1';
  const buildFileName = `${metaName}-${metaVersion}.comapeocat`;
  const buildPath = path.join(buildDir, buildFileName);

  console.log('Building settings in:', buildPath);
  await fs.mkdir(buildDir, { recursive: true });

  // Execute the shell command and wait for completion
  try {
    await runShellCommand(`mapeo-settings-builder build ${fullConfigPath} -o ${buildPath}`);
  } catch (error) {
    console.error('mapeo-settings-builder command failed:', error);
    throw new ProcessingError(`Failed to build settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Verify the output file exists
  try {
    const fileStats = await fs.stat(buildPath);
    if (!fileStats.isFile() || fileStats.size === 0) {
      throw new ProcessingError('Built .comapeocat file is empty or invalid');
    }
  } catch (error) {
    if (error instanceof ProcessingError) throw error;
    throw new ProcessingError('No .comapeocat file found after build completed');
  }

  const builtSettingsPath = buildPath;

  console.log('.comapeocat file found:', builtSettingsPath);

  // Note: Cleanup is handled in the controller after response is sent
  return builtSettingsPath;
}

async function findFile(root: string, filename: string): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === filename) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = await findFile(fullPath, filename);
      if (found) return found;
    }
  }
  return null;
}

// Backwards compatibility for older imports/tests
export { buildSettingsV1 as buildSettings };
