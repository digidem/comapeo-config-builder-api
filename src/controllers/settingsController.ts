import fs from 'fs/promises';
import path from 'path';
import { Reader } from 'comapeocat'; // Added Reader import
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

  // Determine temp directory to clean up
  // builtSettingsPath is: /tmp/comapeo-settings-XXX/.../build/file.comapeocat
  // We want to remove: /tmp/comapeo-settings-XXX
  const pathParts = builtSettingsPath.split(path.sep);
  const tempDirIndex = pathParts.findIndex(part => part.startsWith('comapeo-settings-'));
  const tmpDir = tempDirIndex > 0 ? pathParts.slice(0, tempDirIndex + 1).join(path.sep) : null;

  // Create a streaming response that cleans up after the file is sent
  const bunFile = Bun.file(builtSettingsPath);
  const originalStream = bunFile.stream();

  // Wrap the stream to ensure cleanup happens after streaming completes
  const reader = originalStream.getReader();
  const cleanupStream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        // Clean up temp directory after streaming is complete
        if (tmpDir) {
          fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
        }
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      // Clean up if the stream is cancelled/aborted
      if (tmpDir) {
        fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
      }
    }
  });

  return new Response(cleanupStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(builtSettingsPath)}"`,
      'Content-Length': bunFile.size.toString(),
    },
  });
}

/**
 * Handle v2 request using comapeocat Writer
 */
export async function handleBuildSettingsV2(payload: BuildRequestV2) {
  if (!payload) {
    throw new ValidationError('Request body is required');
  }

  console.log('[COMAPEO-API] Received request for /v2 build.');

  const result = await buildComapeoCatV2(payload);
  const tmpDir = path.dirname(result.outputPath);

  console.log(`[COMAPEO-API] Generated .comapeocat file: ${result.outputPath}. Starting validation.`);

  try {
    const reader = new Reader(result.outputPath);
    const validationResult = await reader.validate();
    if (Array.isArray(validationResult) && validationResult.length > 0) {
      // Validation failed
      const errors = validationResult.map(e => `${e.message} at ${e.filePath || 'unknown file'}`).join('\n');
      console.error(`[COMAPEO-API] .comapeocat validation failed for ${result.outputPath}:\n${errors}`);
      // Clean up temp directory before throwing error
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
      throw new ValidationError(`Generated .comapeocat file is invalid:\n${errors}`);
    }
    console.log(`[COMAPEO-API] .comapeocat validation successful for ${result.outputPath}.`);
  } catch (validationError: any) { // Explicitly type validationError as 'any' for broader compatibility
    // Handle errors during validation itself (e.g., file not found, reader issues)
    console.error(`[COMAPEO-API] Error during .comapeocat validation for ${result.outputPath}:`, validationError);
    // Clean up temp directory before re-throwing error
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
    throw new ProcessingError(`Failed to validate generated .comapeocat file: ${validationError.message}`);
  }

  // Create a streaming response that cleans up after the file is sent
  const bunFile = Bun.file(result.outputPath);
  const originalStream = bunFile.stream();

  console.log(`[COMAPEO-API] Sending .comapeocat file: ${result.fileName}`);

  // Wrap the stream to ensure cleanup happens after streaming completes
  const reader = originalStream.getReader();
  const cleanupStream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        // Clean up temp directory after streaming is complete
        fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
      } else {
        controller.enqueue(value);
      }
    },
    cancel() {
      // Clean up if the stream is cancelled/aborted
      fs.rm(tmpDir, { recursive: true, force: true }).catch(console.error);
    }
  });

  return new Response(cleanupStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${path.basename(result.outputPath)}"`,
      'Content-Length': bunFile.size.toString(),
    },
  });
}
