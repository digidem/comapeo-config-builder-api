import { Elysia } from 'elysia';
import { getErrorMessage } from '../../utils/errorHelpers';

// Create a simple server that just logs the request
const app = new Elysia()
  .onRequest(({ request }) => {
    console.log('Request received:');
    console.log(`Method: ${request.method}`);
    console.log(`URL: ${request.url}`);
    console.log('Headers:');
    // Iterate through headers
    request.headers.forEach((value, key) => {
      console.log(`  ${key}: ${value}`);
    });
  })
  .post('/', async ({ request, set }) => {
    console.log('POST request received');

    try {
      // Try to parse the request as FormData
      const formData = await request.formData();
      console.log('FormData parsed successfully');

      // Log the FormData entries
      console.log('FormData entries:');
      for (const [key, value] of formData.entries()) {
        // Check if it's a File-like object
        if (typeof value === 'object' && value !== null && 'size' in value) {
          const fileObj = value as { name?: string; type?: string; size: number };
          console.log(`  ${key}: File {name: ${fileObj.name || 'unknown'}, type: ${fileObj.type || 'unknown'}, size: ${fileObj.size} bytes}`);
        } else {
          console.log(`  ${key}: ${String(value)}`);
        }
      }

      // Get the file from the FormData
      const file = formData.get('file');
      if (file && typeof file === 'object' && 'name' in file && 'type' in file && 'size' in file) {
        const fileObj = file as { name: string; type: string; size: number };
        console.log('File found in FormData');
        console.log(`File name: ${fileObj.name}`);
        console.log(`File type: ${fileObj.type}`);
        console.log(`File size: ${fileObj.size} bytes`);

        // Return a success response
        return {
          success: true,
          file: {
            name: fileObj.name,
            type: fileObj.type,
            size: fileObj.size
          }
        };
      } else {
        console.log('No file found in FormData');
        set.status = 400;
        return {
          success: false,
          error: 'No file found in FormData'
        };
      }
    } catch (error) {
      console.error('Error parsing FormData:', error);
      set.status = 400;
      return {
        success: false,
        error: `Error parsing FormData: ${getErrorMessage(error)}`
      };
    }
  })
  .listen(3002);

console.log('Simple server started on http://localhost:3002');
console.log('Press Ctrl+C to stop the server');

// Handle SIGINT (Ctrl+C) to gracefully shut down the server
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  app.stop();
  process.exit(0);
});
