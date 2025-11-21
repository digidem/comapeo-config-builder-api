/**
 * Request timeout middleware
 * Prevents requests from running indefinitely and consuming resources
 */

import { logger } from '../utils/logger';

interface TimeoutConfig {
  timeoutMs: number;  // Timeout in milliseconds
  message?: string;   // Custom timeout message
}

/**
 * Create a timeout error response
 */
function createTimeoutResponse(config: TimeoutConfig, elapsed: number): Response {
  return new Response(
    JSON.stringify({
      error: 'RequestTimeout',
      message: config.message || 'Request timeout - processing took too long',
      timeoutMs: config.timeoutMs,
      elapsedMs: elapsed
    }),
    {
      status: 408,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

/**
 * Wrap a request handler with timeout protection
 * Uses Promise.race() to enforce timeout
 */
export function withTimeout(
  handler: (request: Request) => Promise<Response>,
  config: TimeoutConfig
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startTime = Date.now();
    let timeoutId: Timer | null = null;

    // Create timeout promise
    const timeoutPromise = new Promise<Response>((resolve) => {
      timeoutId = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        logger.warn('Request timeout', {
          path: new URL(request.url).pathname,
          method: request.method,
          timeoutMs: config.timeoutMs,
          elapsedMs: elapsed
        });
        resolve(createTimeoutResponse(config, elapsed));
      }, config.timeoutMs);
    });

    // Race the handler against the timeout
    try {
      const response = await Promise.race([
        handler(request),
        timeoutPromise
      ]);

      // Clear timeout if request completed before timeout
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      return response;
    } catch (error) {
      // Clear timeout on error
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      logger.error('Request handler error', {
        path: new URL(request.url).pathname,
        method: request.method,
        error: error instanceof Error ? error.message : 'Unknown error',
        elapsedMs: Date.now() - startTime
      });
      throw error;
    }
  };
}

/**
 * Helper to check if enough time remains for an operation
 * Can be called from handlers to check timeout status
 */
export function checkTimeout(request: Request, startTime: number, timeoutMs: number): {
  timedOut: boolean;
  elapsed: number;
  remaining: number;
} {
  const elapsed = Date.now() - startTime;
  const remaining = Math.max(0, timeoutMs - elapsed);
  const timedOut = elapsed >= timeoutMs;

  return { timedOut, elapsed, remaining };
}

// Default timeout configuration
// 5 minutes (300,000ms) for entire request lifecycle
export const defaultTimeoutConfig: TimeoutConfig = {
  timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '300000', 10),
  message: 'Request timeout - processing took too long'
};
