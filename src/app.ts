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
 */
export function createApp(): AppContext {
  const app = new Elysia().use(cors());
  let rateLimiter: RateLimiter | null = null;

  // Add metrics tracking middleware (before rate limiting)
  const metricsEnabled = process.env.METRICS_ENABLED !== 'false';
  if (metricsEnabled) {
    metricsMiddleware(app);
  }

  // Add rate limiting if enabled (default: enabled in production)
  const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED !== 'false';
  if (rateLimitEnabled) {
    const { plugin, limiter } = rateLimitPlugin(defaultRateLimitConfig);
    app.use(plugin);
    rateLimiter = limiter;
  }

  // Health check endpoints (no timeout or rate limiting needed)
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
  app.post('/build', async ({ request }: { request: Request }) => {
    return handleBuildWithTimeout(request);
  });

  // Legacy endpoint (kept for backward compatibility)
  // Also wrapped with timeout protection
  app.post('/', async ({ body }: any) => {
    return withTimeout(
      async () => handleBuildSettings(body.file),
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
