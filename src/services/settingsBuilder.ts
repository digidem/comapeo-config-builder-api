import AdmZip from 'adm-zip';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runShellCommand } from '../utils/shell';
import { config } from '../config/app';

/**
 * Process a ZIP file containing Mapeo configuration and build a .comapeocat file
 * @param fileBuffer The ZIP file buffer
 * @returns The path to the built .comapeocat file
 */
export async function buildSettings(fileBuffer: ArrayBuffer): Promise<string> {
  // Create a temporary directory
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), config.tempDirPrefix));
  console.log('Temporary directory created:', tmpDir);

  // Extract the ZIP file
  const zip = new AdmZip(Buffer.from(fileBuffer));
  zip.extractAllTo(tmpDir, true);

  const fullConfigPath = tmpDir;
  const buildDir = path.join(fullConfigPath, 'build');
  const metadata = JSON.parse(await fs.readFile(path.join(fullConfigPath, 'metadata.json'), 'utf-8'));
  const buildFileName = `${metadata.name}-${metadata.version}.comapeocat`;
  const buildPath = path.join(buildDir, buildFileName);

  console.log('Building settings in:', buildPath);
  await fs.mkdir(buildDir, { recursive: true });

  // Start the shell command in the background
  runShellCommand(`mapeo-settings-builder build ${fullConfigPath} -o ${buildPath}`);

  console.log('Waiting for .comapeocat file...');
  let builtSettingsPath = '';
  const { maxAttempts, delayBetweenAttempts } = config;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
