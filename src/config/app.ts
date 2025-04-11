import { Elysia } from 'elysia';
import { cors } from "@elysiajs/cors";
import { logger } from '../middleware/logger';
import { errorHandler } from '../middleware/errorHandler';
import { healthController } from '../controllers/healthController';
import { settingsController } from '../controllers/settingsController';

/**
 * Configure and create the Elysia app with all middleware and controllers
 */
export function createApp() {
  const app = new Elysia()
    .use(cors())
    .use(logger)
    .onError(({ error }) => errorHandler(error as Error))
    .use(healthController)
    .use(settingsController);
    
  return app;
}
