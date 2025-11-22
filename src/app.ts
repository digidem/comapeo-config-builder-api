import { Elysia, t } from 'elysia';
import { cors } from "@elysiajs/cors";
import { handleBuildSettings } from './controllers/settingsController';
import { handleBuild } from './controllers/buildController';
import { handleHealthCheck, handleDetailedHealthCheck } from './controllers/healthController';
import { handleMetrics } from './controllers/metricsController';
import { rateLimitPlugin, defaultRateLimitConfig, type RateLimiter } from './middleware/rateLimit';
import { withTimeout, defaultTimeoutConfig } from './middleware/timeout';
import { metricsMiddleware } from './middleware/metricsMiddleware';

export interface AppContext {
  app: Elysia;
  rateLimiter: RateLimiter | null;
}

/**
 * Create and configure the Elysia application
 * @returns The configured Elysia application and rate limiter instance
 *
 * Body size protection:
 * - Content-Length header checked in buildController (rejects >10MB for JSON, >50MB for ZIP)
 * - Bun runtime enforces default maximum request size (prevents unlimited chunked uploads)
 * - ZIP mode uses streaming reader with chunk-by-chunk size enforcement
 * - JSON mode relies on Bun's parsing limits + Content-Length check
 *
 * Note: Chunked JSON uploads without Content-Length rely on Bun's internal limits.
 * This is acceptable as Bun has reasonable defaults and large JSON configs are uncommon.
 */
export function createApp(): AppContext {
  const app = new Elysia()
    .use(cors())
    .onError(({ code, error, set }) => {
      // Handle JSON parse errors from Elysia
      if (code === 'PARSE') {
        set.status = 400;
        return {
          error: 'InvalidJSON',
          message: 'Invalid JSON in request body'
        };
      }
      // Let other errors propagate
      throw error;
    });
  let rateLimiter: RateLimiter | null = null;

  // Add metrics tracking middleware (before rate limiting)
  const metricsEnabled = process.env.METRICS_ENABLED !== 'false';
  if (metricsEnabled) {
    metricsMiddleware(app);
  }

  // Add rate limiting if enabled (default: enabled in production)
  // Exclude health and metrics endpoints from rate limiting
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';
  if (rateLimitEnabled) {
    const { plugin, limiter } = rateLimitPlugin(defaultRateLimitConfig, {
      excludePaths: ['/health', '/health/detailed', '/metrics']
    });
    app.use(plugin);
    rateLimiter = limiter;
  }

  // Health check endpoints (no timeout or rate limiting)
  app.get('/health', async () => {
    return handleHealthCheck();
  });

  app.get('/health/detailed', async () => {
    return handleDetailedHealthCheck();
  });

  // Metrics endpoint (Prometheus format)
  app.get('/metrics', () => {
    return handleMetrics();
  });

  // v2.0.0 Build endpoint - supports both JSON and ZIP modes
  // Wrapped with timeout protection (5 minutes default)
  const handleBuildWithTimeout = withTimeout(handleBuild, defaultTimeoutConfig);
  app.post('/build', async (context) => {
    // For JSON requests, Elysia auto-parses the body, so we pass it along
    // For multipart (ZIP), we pass the raw request
    const contentType = context.request.headers.get('Content-Type') || '';
    const isJSONMode = contentType.toLowerCase().startsWith('application/json');

    // Pass the parsed body if available (JSON mode) via context
    // IMPORTANT: Don't set signal here - withTimeout will provide the AbortController signal
    const requestContext = isJSONMode && context.body ?
      { parsedBody: context.body } :
      undefined;

    return handleBuildWithTimeout(context.request, requestContext);
  });

  // Legacy endpoint (kept for backward compatibility)
  // Also wrapped with timeout protection
  app.post('/', async ({ body }: any) => {
    return withTimeout(
      async (_request, context) => handleBuildSettings(body.file, { signal: context.signal }),
      defaultTimeoutConfig
    )(new Request('http://localhost/'));
  }, {
    body: t.Object({
      file: t.File()
    })
  });

  return { app, rateLimiter };
}

export type App = ReturnType<typeof createApp>['app'];
