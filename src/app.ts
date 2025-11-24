import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { handleBuildSettingsV1, handleBuildSettingsV2 } from './controllers/settingsController';
import { logger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';

/**
 * Create and configure the Elysia application
 * @returns The configured Elysia application
 */
export function createApp() {
  const app = new Elysia()
    .use(cors())
    .use(logger)
    .onError(({ error }) => errorHandler(error));

  // Health check endpoint
  app.get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  app.onAfterHandle(({ response, logResponse }) => {
    if (logResponse && response instanceof Response) {
      logResponse(response.status);
    }
  });

  const v1Route = async ({ body }: { body: { file: File } }) => {
    return handleBuildSettingsV1(body.file);
  };

  // Legacy root -> v1
  app.post('/', v1Route, {
    body: t.Object({ file: t.File() })
  });

  // Explicit v1 route
  app.post('/v1', v1Route, {
    body: t.Object({ file: t.File() })
  });

  // v2 route (JSON body)
  app.post('/v2', async ({ body }) => {
    return handleBuildSettingsV2(body as any);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
