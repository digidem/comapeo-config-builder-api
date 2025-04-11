import { Elysia } from 'elysia';

// Create a simple server that just logs the request
const app = new Elysia()
  .onRequest(({ request }) => {
    console.log('Request received:');
    console.log(`Method: ${request.method}`);
    console.log(`URL: ${request.url}`);
    console.log('Headers:');
    for (const [key, value] of request.headers.entries()) {
      console.log(`  ${key}: ${value}`);
    }
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
        if (value instanceof File) {
          console.log(`  ${key}: File {name: ${value.name}, type: ${value.type}, size: ${value.size} bytes}`);
        } else {
          console.log(`  ${key}: ${value}`);
        }
      }
      
      // Get the file from the FormData
      const file = formData.get('file');
      if (file instanceof File) {
        console.log('File found in FormData');
        console.log(`File name: ${file.name}`);
        console.log(`File type: ${file.type}`);
        console.log(`File size: ${file.size} bytes`);
        
        // Return a success response
        return {
          success: true,
          file: {
            name: file.name,
            type: file.type,
            size: file.size
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
        error: `Error parsing FormData: ${error.message}`
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
