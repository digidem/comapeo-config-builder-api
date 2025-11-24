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
  return Bun.file(builtSettingsPath);
}

/**
 * Handle v2 request using comapeocat Writer
 */
export async function handleBuildSettingsV2(payload: BuildRequestV2) {
  if (!payload) {
    throw new ValidationError('Request body is required');
  }

  const result = await buildComapeoCatV2(payload);
  return Bun.file(result.outputPath);
}
