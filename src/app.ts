import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { handleBuildSettingsV1, handleBuildSettingsV2 } from './controllers/settingsController';
import { logger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { ValidationError } from './types/errors';

/**
 * Create and configure the Elysia application
 * @returns The configured Elysia application
 */
const MAX_BODY_SIZE = 1_000_000; // 1MB limit for v2 JSON payloads

export function createApp() {
  const app = new Elysia()
    .use(cors())
    .use(logger)
    .onError(({ error }) => errorHandler(error))
    // Early validation hook to check Content-Length before body parsing
    .onRequest(({ request }) => {
      // Only enforce for JSON POST requests to /v2 endpoint to prevent DoS
      const url = new URL(request.url);
      const contentType = request.headers.get('content-type') || '';

      if (request.method === 'POST' && url.pathname === '/v2' && contentType.includes('application/json')) {
        const contentLength = request.headers.get('content-length');

        // If Content-Length is present, validate it BEFORE Elysia parses body
        // This prevents memory exhaustion from huge payloads
        if (contentLength) {
          const size = parseInt(contentLength, 10);
          if (isNaN(size)) {
            throw new ValidationError('Invalid Content-Length header');
          }
          if (size > MAX_BODY_SIZE) {
            throw new ValidationError(`Request body too large (max ${MAX_BODY_SIZE} bytes)`);
          }
        }
      }
    });

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

  // v2 route (JSON body with validation)
  // Note: Body size is enforced in onParse hook before parsing to prevent DoS
  app.post('/v2', async ({ body, headers }) => {
    const contentType = headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      throw new ValidationError('Content-Type must be application/json');
    }
    return handleBuildSettingsV2(body as any);
  }, {
    body: t.Any()
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
