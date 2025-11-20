import { Elysia, t } from 'elysia';
import { cors } from "@elysiajs/cors";
import { handleBuildSettings } from './controllers/settingsController';

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

  // Main build endpoint
  app.post('/', async ({ body }: { body: { file: File } }) => {
    body: t.Object({
      file: t.File()
    });

    return handleBuildSettings(body.file);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
