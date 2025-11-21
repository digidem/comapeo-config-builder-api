import { createApp } from './app';
import { config } from './config/app';
import { setupShutdownHandlers, gracefulShutdown } from './utils/gracefulShutdown';
import { logger } from './utils/logger';

// Create and start the application
const { app, rateLimiter } = createApp();

// Register cleanup handlers for graceful shutdown
if (rateLimiter) {
  gracefulShutdown.registerHandler(async () => {
    logger.info('Stopping rate limiter cleanup interval');
    rateLimiter.stop();
  });
}

// Start the server
const server = app.listen(config.port);

logger.info('Server started', {
  hostname: server.server?.hostname,
  port: server.server?.port,
  url: `http://${server.server?.hostname}:${server.server?.port}`
});

// Setup graceful shutdown handlers for SIGTERM/SIGINT
setupShutdownHandlers(server);

export { server as app };
export type { App } from './app';
