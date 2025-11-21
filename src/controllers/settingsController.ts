import { buildSettings } from '../services/settingsBuilder';

export interface BuildSettingsOptions {
  signal?: AbortSignal;
}

/**
 * Handle the request to build settings from a ZIP file
 * @param file The uploaded ZIP file
 * @param options Optional settings including abort signal
 * @returns The built .comapeocat file or an error response
 */
export async function handleBuildSettings(file: File, options?: BuildSettingsOptions) {
  try {
    if (!file) {
      throw new Error('No file provided in the request body');
    }

    // Process the file and build the settings
    const zipBuffer = await file.arrayBuffer();
    const builtSettingsPath = await buildSettings(zipBuffer, { signal: options?.signal });

    // Return the built settings file
    return Bun.file(builtSettingsPath);
  } catch (error) {
    console.error('Error processing the data:', error);
    return new Response(JSON.stringify({
      status: 500,
      message: 'Error processing the data: ' + (error as Error).message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}
