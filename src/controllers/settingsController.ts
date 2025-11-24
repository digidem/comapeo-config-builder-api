import fs from 'fs/promises';
import path from 'path';
import { buildSettingsV1 } from '../services/settingsBuilder';
import { buildComapeoCatV2 } from '../services/comapeocatBuilder';
import { ValidationError, ProcessingError } from '../types/errors';
import type { BuildRequestV2 } from '../types/v2';

/**
 * Handle v1 request to build settings from a ZIP file
 * @param file The uploaded ZIP file
 * @returns The built .comapeocat file or an error response
 */
export async function handleBuildSettingsV1(file: File) {
  if (!file) {
    throw new ValidationError('No file provided in the request body');
  }

  const zipBuffer = await file.arrayBuffer();
  const builtSettingsPath = await buildSettingsV1(zipBuffer);
  const fileResponse = Bun.file(builtSettingsPath);

  // Clean up temp directory after sending response (schedule async cleanup)
  // builtSettingsPath is: /tmp/comapeo-settings-XXX/.../build/file.comapeocat
  // We want to remove: /tmp/comapeo-settings-XXX
  const pathParts = builtSettingsPath.split(path.sep);
  const tempDirIndex = pathParts.findIndex(part => part.startsWith('comapeo-settings-'));
  if (tempDirIndex > 0) {
    const tmpDir = pathParts.slice(0, tempDirIndex + 1).join(path.sep);
    setImmediate(() => {
      fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
    });
  }

  return fileResponse;
}

/**
 * Handle v2 request using comapeocat Writer
 */
export async function handleBuildSettingsV2(payload: BuildRequestV2) {
  if (!payload) {
    throw new ValidationError('Request body is required');
  }

  const result = await buildComapeoCatV2(payload);
  const fileResponse = Bun.file(result.outputPath);

  // Clean up temp directory after sending response (schedule async cleanup)
  const tmpDir = path.dirname(result.outputPath);
  setImmediate(() => {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
  });

  return fileResponse;
}
