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
    // Enforce body size limit DURING parsing to prevent DoS attacks
    // This hook runs before body parsing and returns a custom parser that
    // validates size during streaming, protecting against both Content-Length
    // and chunked encoding attacks
    .onParse(async ({ request }) => {
      const url = new URL(request.url);
      const contentType = request.headers.get('content-type');

      // Only enforce for JSON POST requests to /v2 endpoint
      // Use startsWith to handle content-type with parameters (e.g., "application/json; charset=utf-8")
      if (request.method === 'POST' && url.pathname === '/v2' && contentType?.startsWith('application/json')) {
        const contentLength = request.headers.get('content-length');

        // If Content-Length header is present, validate before parsing
        if (contentLength) {
          const size = Number.parseInt(contentLength, 10);
          if (size > MAX_BODY_SIZE) {
            throw new ValidationError(`Request body too large (max ${MAX_BODY_SIZE} bytes)`);
          }
        }

        // For all requests (including chunked without Content-Length),
        // read body with size enforcement during streaming
        if (!request.body) {
          return; // No body to parse
        }

        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalSize = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            totalSize += value.length;

            // Enforce size limit during streaming - prevents memory exhaustion
            if (totalSize > MAX_BODY_SIZE) {
              reader.cancel(); // Stop reading immediately
              throw new ValidationError(`Request body too large (max ${MAX_BODY_SIZE} bytes)`);
            }

            chunks.push(value);
          }

          // Combine chunks and parse JSON
          const bodyText = Buffer.concat(chunks).toString('utf-8');
          return JSON.parse(bodyText);
        } catch (error) {
          // Re-throw ValidationError as-is
          if (error instanceof ValidationError) {
            throw error;
          }
          // Wrap JSON parse errors
          throw new ValidationError(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });

  // Health check endpoint
  app.get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString()
  }));

  // onAfterHandle hook for future use
  // app.onAfterHandle(({ response }) => {
  //   // Response logging handled by logger middleware
  // });

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
  // Note: Body size is enforced in onParse hook to prevent DoS attacks
  // from both Content-Length and chunked encoding attacks
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
