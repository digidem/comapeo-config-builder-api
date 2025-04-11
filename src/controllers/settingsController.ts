import { Elysia, t } from 'elysia';
import { ValidationError } from '../types/errors';
import { SettingsBuilderService } from '../services/settingsBuilder';

/**
 * Settings controller for handling settings file uploads and building
 */
export const settingsController = (app: Elysia) => {
  const settingsService = new SettingsBuilderService();
  
  return app.post('/', {
    body: t.Object({
      file: t.File({
        type: ['application/zip', 'application/x-zip-compressed']
      })
    }),
    error({ error }: { error: Error }) {
      if (error.message.includes('file')) {
        throw new ValidationError('Invalid or missing ZIP file in the request');
      }
      throw error;
    }
  }, async ({ body, set, logResponse, requestId }: { 
    body: { file: File }, 
    set: { headers: Record<string, string> },
    logResponse: (status: number) => void,
    requestId: string 
  }) => {
    let tmpDir = '';
    
    try {
      // Validate the file
      if (!body.file) {
        throw new ValidationError('No file provided in the request body');
      }
      
      // Process the file
      const result = await settingsService.buildSettings(body.file, requestId);
      tmpDir = result.tmpDir;
      
      // Set appropriate headers for file download
      set.headers['Content-Disposition'] = `attachment; filename="${result.fileName}"`;
      set.headers['Content-Type'] = 'application/octet-stream';
      
      // Return the built settings file
      const file = Bun.file(result.filePath);
      logResponse(200);
      return file;
    } catch (error) {
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
