import { Elysia } from 'elysia';
import { ValidationError } from '../types/errors';
import { SettingsBuilderService } from '../services/settingsBuilder';
import fs from 'fs/promises';
import { getErrorMessage } from '../utils/errorHelpers';

/**
 * Settings controller for handling settings file uploads and building
 */
export const settingsController = (app: Elysia) => {
  const settingsService = new SettingsBuilderService();

  return app.post('/', async ({ request, set }) => {
    // Generate a request ID
    const requestId = Math.random().toString(36).substring(2, 15);
    console.log(`[${requestId}] Received request`);

    let tmpDir = '';

    try {
      // Parse the request as FormData
      const formData = await request.formData();
      console.log(`[${requestId}] FormData parsed successfully`);

      // Get the file from the FormData
      const file = formData.get('file');
      if (!(file instanceof File)) {
        console.error(`[${requestId}] No file found in FormData`);
        throw new ValidationError('No file provided in the request body');
      }

      console.log(`[${requestId}] File:`, {
        name: file.name,
        type: file.type,
        size: file.size
      });

      // Process the file
      const result = await settingsService.buildSettings(file, requestId);
      tmpDir = result.tmpDir;

      // Set appropriate headers for file download
      set.headers['Content-Disposition'] = `attachment; filename="${result.fileName}"`;
      set.headers['Content-Type'] = 'application/octet-stream';

      // Return the built settings file
      console.log(`[${requestId}] Returning file: ${result.filePath}`);

      // Verify the file exists
      try {
        await fs.access(result.filePath);
        console.log(`[${requestId}] File exists, creating Bun.file object`);

        const responseFile = Bun.file(result.filePath);
        console.log(`[${requestId}] Bun.file object created: size=${responseFile.size} bytes`);

        // Read the file into memory to ensure it's not deleted before it's sent
        const fileBuffer = await responseFile.arrayBuffer();
        console.log(`[${requestId}] File read into memory: ${fileBuffer.byteLength} bytes`);

        // Return the file buffer directly
        return new Response(fileBuffer, {
          headers: {
            'Content-Disposition': `attachment; filename="${result.fileName}"`,
            'Content-Type': 'application/octet-stream'
          }
        });
      } catch (error) {
        console.error(`[${requestId}] Error accessing file:`, error);
        throw new Error(`Failed to access file: ${getErrorMessage(error)}`);
      }
    } catch (error) {
      // Log the error
      console.error(`[${requestId}] Error:`, error);

      // Let the global error handler handle this
      throw error;
    } finally {
      // Always clean up temporary files
      if (tmpDir) {
        await settingsService.cleanup(tmpDir, requestId);
      }
    }
  });
};
