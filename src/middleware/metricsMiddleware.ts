/**
 * Metrics middleware for automatic request tracking
 */

import { metrics } from '../controllers/metricsController';
import type { Elysia } from 'elysia';

/**
 * Metrics tracking middleware
 * Automatically records HTTP request metrics
 */
export function metricsMiddleware(app: Elysia): Elysia {
  // Track request start time and increment active requests
  app.onBeforeHandle(({ request, store }: any) => {
    store.requestStartTime = Date.now();
    metrics.incrementActiveRequests();
  });

  // Record metrics after request completes
  app.onAfterHandle(({ request, response, store }: any) => {
    const duration = Date.now() - (store.requestStartTime || Date.now());
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const status = response.status || 200;

    metrics.recordRequest(endpoint, status, duration);
    metrics.decrementActiveRequests();
  });

  // Handle errors (also decrement active requests)
  app.onError(({ request, error, store }: any) => {
    const duration = Date.now() - (store.requestStartTime || Date.now());
    const url = new URL(request.url);
    const endpoint = url.pathname;
    const status = 500; // Default to 500 for errors

    metrics.recordRequest(endpoint, status, duration);
    metrics.decrementActiveRequests();

    // Return the error to be handled by error handler
    return error;
  });

  return app;
}
