import { Elysia, t } from 'elysia';
import { cors } from "@elysiajs/cors";
import { handleBuildSettings } from './controllers/settingsController';
import { handleBuild } from './controllers/buildController';

/**
 * Create and configure the Elysia application
 * @returns The configured Elysia application
 */
export function createApp() {
  const app = new Elysia().use(cors());

  // Health check endpoint
  app.get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  // v2.0.0 Build endpoint - supports both JSON and ZIP modes
  app.post('/build', async ({ request }: { request: Request }) => {
    return handleBuild(request);
  });

  // Legacy endpoint (kept for backward compatibility)
  app.post('/', async ({ body }: { body: { file: File } }) => {
    body: t.Object({
      file: t.File()
    });

    return handleBuildSettings(body.file);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
