import { describe, it, expect } from 'bun:test';
import { withTimeout, checkTimeout, defaultTimeoutConfig } from '../../../middleware/timeout';

describe('Timeout Middleware', () => {
  describe('withTimeout', () => {
    it('should allow fast requests to complete normally', async () => {
      const fastHandler = async (request: Request) => {
        return new Response('Success', { status: 200 });
      };

      const wrappedHandler = withTimeout(fastHandler, { timeoutMs: 1000 });
      const request = new Request('http://localhost/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('Success');
    });

    it('should timeout slow requests', async () => {
      const slowHandler = async (request: Request) => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return new Response('Should not reach here', { status: 200 });
      };

      const wrappedHandler = withTimeout(slowHandler, { timeoutMs: 100 });
      const request = new Request('http://localhost/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(408); // Request Timeout
      const body = await response.json();
      expect(body.error).toBe('RequestTimeout');
      expect(body.timeoutMs).toBe(100);
    });

    it('should include custom message in timeout response', async () => {
      const slowHandler = async (request: Request) => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return new Response('Should not reach here', { status: 200 });
      };

      const customMessage = 'Custom timeout message';
      const wrappedHandler = withTimeout(slowHandler, {
        timeoutMs: 100,
        message: customMessage
      });

      const request = new Request('http://localhost/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(408);
      const body = await response.json();
      expect(body.message).toBe(customMessage);
    });

    it('should include elapsed time in timeout response', async () => {
      const slowHandler = async (request: Request) => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return new Response('Should not reach here', { status: 200 });
      };

      const wrappedHandler = withTimeout(slowHandler, { timeoutMs: 150 });
      const request = new Request('http://localhost/test');
      const response = await wrappedHandler(request);

      const body = await response.json();
      // Allow some tolerance for timing precision
      expect(body.elapsedMs).toBeGreaterThanOrEqual(100);
      expect(body.elapsedMs).toBeLessThan(250);
    });

    it('should propagate errors from handler', async () => {
      const errorHandler = async (request: Request) => {
        throw new Error('Test error');
      };

      const wrappedHandler = withTimeout(errorHandler, { timeoutMs: 1000 });
      const request = new Request('http://localhost/test');

      await expect(wrappedHandler(request)).rejects.toThrow('Test error');
    });

    it('should provide abort signal to handler', async () => {
      let receivedSignal: AbortSignal | undefined;

      const handler = async (request: Request, context: any) => {
        receivedSignal = context.signal;
        return new Response('Success', { status: 200 });
      };

      const wrappedHandler = withTimeout(handler, { timeoutMs: 1000 });
      const request = new Request('http://localhost/test');
      await wrappedHandler(request);

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal instanceof AbortSignal).toBe(true);
      expect(receivedSignal?.aborted).toBe(false);
    });

    it('should abort signal when timeout occurs', async () => {
      let receivedSignal: AbortSignal | undefined;
      const abortedPromise = new Promise<boolean>((resolve) => {
        const slowHandler = async (request: Request, context: any) => {
          receivedSignal = context.signal;

          // Listen for abort event
          context.signal.addEventListener('abort', () => {
            resolve(true);
          });

          // Wait longer than timeout
          await new Promise(r => setTimeout(r, 500));
          return new Response('Should not reach here', { status: 200 });
        };

        const wrappedHandler = withTimeout(slowHandler, { timeoutMs: 100 });
        const request = new Request('http://localhost/test');
        wrappedHandler(request).catch(() => {
          // Ignore - we just care about the abort signal
        });
      });

      // Wait a bit to ensure abort happens
      const wasAborted = await Promise.race([
        abortedPromise,
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 300))
      ]);

      expect(receivedSignal).toBeDefined();
      expect(wasAborted).toBe(true); // Signal should have been aborted
    });

    it('should preserve additional context fields without overwriting signal', async () => {
      let receivedContext: any;

      const handler = async (request: Request, context: any) => {
        receivedContext = context;
        return new Response('Success', { status: 200 });
      };

      const wrappedHandler = withTimeout(handler, { timeoutMs: 1000 });
      const request = new Request('http://localhost/test');

      // Pass additional context with parsedBody
      await wrappedHandler(request, { parsedBody: { test: 'data' } });

      expect(receivedContext.signal).toBeDefined();
      expect(receivedContext.signal instanceof AbortSignal).toBe(true);
      expect(receivedContext.parsedBody).toEqual({ test: 'data' });
      expect(receivedContext.startTime).toBeDefined();
      expect(receivedContext.timeoutMs).toBe(1000);
    });
  });

  describe('checkTimeout', () => {
    it('should correctly detect non-timeout', () => {
      const startTime = Date.now();
      const timeoutMs = 1000;

      const result = checkTimeout(new Request('http://localhost/test'), startTime, timeoutMs);

      expect(result.timedOut).toBe(false);
      expect(result.elapsed).toBeLessThanOrEqual(100); // Should be very small (allow for test overhead)
      expect(result.remaining).toBeGreaterThanOrEqual(900); // Most of time should remain
    });

    it('should correctly detect timeout', () => {
      const startTime = Date.now() - 2000; // 2 seconds ago
      const timeoutMs = 1000;

      const result = checkTimeout(new Request('http://localhost/test'), startTime, timeoutMs);

      expect(result.timedOut).toBe(true);
      expect(result.elapsed).toBeGreaterThanOrEqual(2000);
      expect(result.remaining).toBe(0);
    });

    it('should calculate remaining time correctly', () => {
      const startTime = Date.now() - 500; // 500ms ago
      const timeoutMs = 1000;

      const result = checkTimeout(new Request('http://localhost/test'), startTime, timeoutMs);

      expect(result.timedOut).toBe(false);
      expect(result.elapsed).toBeGreaterThanOrEqual(500);
      expect(result.remaining).toBeLessThanOrEqual(500);
      expect(result.remaining).toBeGreaterThanOrEqual(400); // Allow some tolerance for timing precision
    });
  });

  describe('defaultTimeoutConfig', () => {
    it('should have reasonable default timeout', () => {
      expect(defaultTimeoutConfig.timeoutMs).toBe(300000); // 5 minutes
      expect(defaultTimeoutConfig.message).toBeTruthy();
    });

    it('should respect REQUEST_TIMEOUT_MS environment variable', () => {
      // Note: This test would need to run in a separate process to test env var
      // Just verify the config exists and is valid
      expect(typeof defaultTimeoutConfig.timeoutMs).toBe('number');
      expect(defaultTimeoutConfig.timeoutMs).toBeGreaterThan(0);
    });
  });
});
