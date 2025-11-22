/**
 * Metrics middleware for automatic request tracking
 */

import { Elysia } from 'elysia';
import { metrics } from '../controllers/metricsController';

/**
 * Metrics tracking middleware plugin
 * Automatically records HTTP request metrics
 *
 * Usage: app.use(metricsMiddleware())
 */
export function metricsMiddleware() {
  return new Elysia({ name: 'metrics' })
    // Track request start time and increment active requests
    .onBeforeHandle(({ request, store }: any) => {
      store.requestStartTime = Date.now();
      metrics.incrementActiveRequests();
    })
    // Record metrics after request completes
    .onAfterHandle(({ request, response, set, store }: any) => {
      const duration = Date.now() - (store.requestStartTime || Date.now());
      const url = new URL(request.url);
      const endpoint = url.pathname;
      // Check response.status first, then set.status from context, then default to 200
      const status = response?.status || set?.status || 200;

      metrics.recordRequest(endpoint, status, duration);
      metrics.decrementActiveRequests();
    })
    // Handle errors (also decrement active requests)
    .onError(({ request, error, store }: any) => {
      const duration = Date.now() - (store.requestStartTime || Date.now());
      const url = new URL(request.url);
      const endpoint = url.pathname;
      const status = 500; // Default to 500 for errors

      metrics.recordRequest(endpoint, status, duration);
      metrics.decrementActiveRequests();

      // Return the error to be handled by error handler
      return error;
    });
}
