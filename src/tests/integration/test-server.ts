import { createApp } from '../../app';

// Create the app
const appContext = createApp();

// Start the server
const server = appContext.app.listen(3001);

console.log('Test server started on http://localhost:3001');
console.log('Press Ctrl+C to stop the server');

// Handle SIGINT (Ctrl+C) to gracefully shut down the server
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.stop();
  process.exit(0);
});
