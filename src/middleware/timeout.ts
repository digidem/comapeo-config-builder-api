/**
 * Request timeout middleware
 * Prevents requests from running indefinitely and consuming resources
 * Uses AbortController to actually cancel in-flight operations
 */

import { logger } from '../utils/logger';

interface TimeoutConfig {
  timeoutMs: number;  // Timeout in milliseconds
  message?: string;   // Custom timeout message
}

export interface RequestContext {
  signal: AbortSignal;
  startTime: number;
  timeoutMs: number;
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
 * Uses AbortController to cancel in-flight operations when timeout occurs
 */
export function withTimeout(
  handler: (request: Request, context: RequestContext) => Promise<Response>,
  config: TimeoutConfig
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startTime = Date.now();
    const controller = new AbortController();
    let timeoutId: Timer | null = null;
    let timedOut = false;

    // Create context with abort signal for handler
    const context: RequestContext = {
      signal: controller.signal,
      startTime,
      timeoutMs: config.timeoutMs
    };

    // Start the handler immediately and store the promise
    const handlerPromise = handler(request, context);

    // Create timeout promise that also aborts the controller
    const timeoutPromise = new Promise<Response>((resolve) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        const elapsed = Date.now() - startTime;
        logger.warn('Request timeout', {
          path: new URL(request.url).pathname,
          method: request.method,
          timeoutMs: config.timeoutMs,
          elapsedMs: elapsed
        });
        // Abort all operations using this signal
        controller.abort();
        resolve(createTimeoutResponse(config, elapsed));
      }, config.timeoutMs);
    });

    // Race the handler against the timeout
    try {
      const response = await Promise.race([
        handlerPromise,
        timeoutPromise
      ]);

      // Clear timeout if request completed before timeout
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      // If timeout won, swallow any subsequent rejection from the handler
      // to prevent unhandled promise rejection crashes
      if (timedOut) {
        handlerPromise.catch(() => {
          // Intentionally swallowed - handler was aborted due to timeout
        });
      }

      return response;
    } catch (error) {
      // Clear timeout on error
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }

      // Don't log abort errors as handler errors
      if (error instanceof Error && error.message === 'Command aborted') {
        return createTimeoutResponse(config, Date.now() - startTime);
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
